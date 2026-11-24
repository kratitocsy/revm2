/* ============================================================
   pyqImportPdf.ts

   Browser side of importing an Eduniti challenge PDF: reads the text
   positions with pdf.js, asks pyqImportCore for the plan, renders the
   question pages and cuts every question out as a picture. Everything
   happens on the student's device; nothing is uploaded.
   ============================================================ */

import { applyKeyStyle, keyStyle, planImport, readKeyAnswer, type ImportPlan, type PageText, type Rect, type Strip } from './pyqImportCore'

export interface ImportedQuestion {
  n: number
  chapter: string
  kind: 'mcq' | 'num'
  /** Option number for 'mcq', the value for 'num'. NaN when the key has no entry. */
  answer: number
  /** The key alone couldn't tell an option number from a numerical answer. */
  unsure: boolean
  removed: boolean
  note?: string
  image: Blob
}

export interface ImportResult {
  questions: ImportedQuestion[]
  solutionUrl: string | null
  warnings: string[]
  pageCount: number
  /** True when the PDF had an answer key the importer could read. */
  hasKey: boolean
}

export type Progress = (stage: 'reading' | 'cutting' | 'saving', done: number, total: number) => void

const SCALE = 2
const INK = 180 // darker than this counts as print; the light watermark stays out

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  return pdfjs
}

export async function readPages(doc: any, onProgress?: Progress): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const ann = await page.getAnnotations().catch(() => [])
    pages.push({
      w: vp.width, h: vp.height,
      links: ann.filter((a: any) => typeof a.url === 'string').map((a: any) => a.url),
      items: tc.items.filter((it: any) => typeof it.str === 'string').map((it: any) => {
        const h = it.height || Math.hypot(it.transform[2], it.transform[3])
        return { s: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h, w: it.width, h }
      }),
    })
    onProgress?.('reading', i, doc.numPages)
  }
  return pages
}

export async function importEdunitiPdf(data: ArrayBuffer, onProgress?: Progress): Promise<ImportResult> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  try {
    const pages = await readPages(doc, onProgress)
    const plan = planImport(pages)
    const pictures = await cutQuestions(doc, pages, plan, onProgress)
    return assemble(plan, pictures, doc.numPages)
  } finally {
    void doc.destroy()
  }
}

/* ---------- cutting ---------- */

type Piece = HTMLCanvasElement

async function cutQuestions(doc: any, pages: PageText[], plan: ImportPlan, onProgress?: Progress): Promise<Map<number, Piece[]>> {
  const byPage = new Map<number, { n: number; strip: Strip }[]>()
  for (const q of plan.questions) for (const strip of q.strips) {
    if (!byPage.has(strip.page)) byPage.set(strip.page, [])
    byPage.get(strip.page)!.push({ n: q.n, strip })
  }
  const pieces = new Map<number, Piece[]>()
  const order = [...byPage.keys()].sort((a, b) => a - b)
  let done = 0
  for (const pi of order) {
    const page = await doc.getPage(pi + 1)
    const vp = page.getViewport({ scale: SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    ctx.fillStyle = '#fff'
    for (const r of plan.whiteouts[pi] ?? []) ctx.fillRect(r.x0 * SCALE, r.y0 * SCALE, (r.x1 - r.x0) * SCALE, (r.y1 - r.y0) * SCALE)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const gutter = findGutter(img, plan.splits[pi] ?? null, pages[pi])
    for (const { n, strip } of byPage.get(pi)!) {
      const x0 = strip.col === 1 ? gutter! : 2
      const x1 = strip.col === 0 ? gutter! : pages[pi].w - 2
      const box = trim(img, { x0: x0 * SCALE, y0: strip.y0 * SCALE, x1: x1 * SCALE, y1: strip.y1 * SCALE })
      if (!box) continue
      // A run-on piece has to hold real print, not a stray rule or box edge.
      if (box.y1 - box.y0 < 10 * SCALE && (strip.continuation || box.x1 - box.x0 < 40 * SCALE)) continue
      const piece = document.createElement('canvas')
      piece.width = box.x1 - box.x0; piece.height = box.y1 - box.y0
      piece.getContext('2d')!.drawImage(canvas, box.x0, box.y0, piece.width, piece.height, 0, 0, piece.width, piece.height)
      if (!pieces.has(n)) pieces.set(n, [])
      pieces.get(n)!.push(piece)
    }
    page.cleanup()
    onProgress?.('cutting', ++done, order.length)
  }
  return pieces
}

function isInk(d: Uint8ClampedArray, i: number): boolean {
  return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < INK
}

/** The blank vertical line between the two columns, near the planned split (in PDF points). */
export function findGutter(img: ImageData, split: number | null, page: PageText): number | null {
  if (split === null) return null
  const from = Math.max(0, Math.round((split - 24) * SCALE)), to = Math.min(img.width - 1, Math.round((split + 16) * SCALE))
  const y0 = Math.round(page.h * 0.06 * SCALE), y1 = Math.round(page.h * 0.94 * SCALE)
  let best = Math.round(split * SCALE), bestInk = Infinity
  for (let x = from; x <= to; x++) {
    let ink = 0
    for (let y = y0; y < y1; y += 2) if (isInk(img.data, (y * img.width + x) * 4)) ink++
    if (ink < bestInk || (ink === bestInk && Math.abs(x - split * SCALE) < Math.abs(best - split * SCALE))) { best = x; bestInk = ink }
  }
  return best / SCALE
}

/** Shrinks a box (in pixels) to the print inside it, dropping a page rule along its top or bottom edge; null when blank. */
export function trim(img: ImageData, r: Rect): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(img.width, Math.ceil(r.x1))
  const y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(img.height, Math.ceil(r.y1))
  if (x1 - x0 < 4 || y1 - y0 < 4) return null
  const rows: { ink: number; l: number; r: number }[] = []
  for (let y = y0; y < y1; y++) {
    let ink = 0, l = -1, rr = -1
    for (let x = x0; x < x1; x++) if (isInk(img.data, (y * img.width + x) * 4)) { ink++; if (l < 0) l = x; rr = x }
    rows.push({ ink: ink >= 2 ? ink : 0, l, r: rr })
  }
  const width = x1 - x0
  const isRule = (i: number) => rows[i].ink > width * 0.6
  let top = rows.findIndex(x => x.ink > 0)
  if (top < 0) return null
  let bottom = rows.length - 1 - [...rows].reverse().findIndex(x => x.ink > 0)
  // A thin rule (a few rows wide) cut off from the rest by a blank gap is page furniture, not the question.
  const peel = (from: number, step: 1 | -1, limit: number) => {
    let i = from, n = 0
    while (i !== limit && isRule(i) && n < 6) { i += step; n++ }
    if (n === 0) return from
    let gap = 0
    while (i !== limit && rows[i].ink === 0) { i += step; gap++ }
    return gap >= 6 && i !== limit ? i : from
  }
  bottom = peel(bottom, -1, top - 1)
  top = peel(top, 1, bottom + 1)
  let left = x1, right = x0
  for (let i = top; i <= bottom; i++) if (rows[i].ink > 0) { left = Math.min(left, rows[i].l); right = Math.max(right, rows[i].r) }
  if (right < left) return null
  const pad = 6
  return { x0: Math.max(x0, left - pad), y0: Math.max(y0, y0 + top - pad), x1: Math.min(x1, right + pad + 1), y1: Math.min(y1, y0 + bottom + pad + 1) }
}

async function stitch(pieces: Piece[]): Promise<Blob> {
  const gap = 12, pad = 8
  const w = Math.max(...pieces.map(p => p.width)) + pad * 2
  const h = pieces.reduce((s, p) => s + p.height, 0) + gap * (pieces.length - 1) + pad * 2
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  let y = pad
  for (const p of pieces) { ctx.drawImage(p, pad, y); y += p.height + gap }
  const webp = await new Promise<Blob | null>(res => c.toBlob(res, 'image/webp', 0.85))
  if (webp && webp.type === 'image/webp') return webp
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not save the picture.'))), 'image/jpeg', 0.9))
}

async function assemble(plan: ImportPlan, pictures: Map<number, Piece[]>, pageCount: number): Promise<ImportResult> {
  const warnings = plan.warnings.slice()
  const questions: ImportedQuestion[] = []
  const missingKey: number[] = []
  const style = keyStyle(plan.key)
  for (const q of plan.questions) {
    const pieces = pictures.get(q.n)
    if (!pieces || pieces.length === 0) { warnings.push(`Question ${q.n} came out blank and was left out.`); continue }
    const corrected = plan.corrections[q.n]
    const read = applyKeyStyle(readKeyAnswer(corrected ?? plan.key[q.n]), style)
    if (!read) missingKey.push(q.n)
    questions.push({
      n: q.n, chapter: q.chapter,
      kind: read?.kind ?? 'mcq', answer: read?.answer ?? NaN, unsure: read ? read.unsure : true,
      removed: plan.removed.includes(q.n),
      note: corrected !== undefined && plan.key[q.n] !== undefined && corrected !== plan.key[q.n]
        ? `The official key says ${plan.key[q.n]}; the PDF notes it should be ${corrected}.` : undefined,
      image: await stitch(pieces),
    })
  }
  if (missingKey.length > 0 && Object.keys(plan.key).length > 0) warnings.push(`No answer in the key for question${missingKey.length > 1 ? 's' : ''} ${missingKey.slice(0, 8).join(', ')}${missingKey.length > 8 ? '…' : ''}.`)
  return { questions, solutionUrl: plan.solutionUrl, warnings, pageCount, hasKey: Object.keys(plan.key).length > 0 }
}
