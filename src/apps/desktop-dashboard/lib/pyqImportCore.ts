/* ============================================================
   pyqImportCore.ts

   Turns the text layout of an Eduniti challenge PDF into an import plan:
   where every question sits on the page (so it can be cut out as a
   picture), its chapter, the answer key, and the notes printed with it.
   Pure geometry and text, no pdf.js or canvas: pyqImportPdf.ts feeds it
   the text positions and does the rendering and cutting.

   What it expects of a PDF (true of Eduniti's challenge papers):
   - questions are numbered "1.", "2.", ... beside the question, in one or
     two columns, in reading order (left column, then right column, within
     each band between chapter headings);
   - a question may run on from the bottom of one column to the top of the
     next column or page;
   - an "ANSWER KEY" page lists "number answer" pairs.
   Anything else should come out with warnings rather than wrong data.
   ============================================================ */

export interface TItem {
  s: string
  /** Left edge, in PDF points from the left of the page. */
  x: number
  /** Top edge, in PDF points from the top of the page. */
  y: number
  w: number
  h: number
}

export interface PageText {
  w: number
  h: number
  items: TItem[]
  links: string[]
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface Strip extends Rect {
  page: number
  /** 0 = left column, 1 = right column, -1 = the page is one column. x0/x1 are first guesses; the renderer moves the column edge to the blank gutter. */
  col: number
  /** A run-on piece above a column's first number: dropped if it turns out blank. */
  continuation: boolean
}

export interface PlannedQuestion {
  n: number
  chapter: string
  strips: Strip[]
}

export interface ImportPlan {
  questions: PlannedQuestion[]
  /** Raw answer-key entries by question number, e.g. "4", "-245", "c". */
  key: Record<number, string>
  corrections: Record<number, string>
  removed: number[]
  solutionUrl: string | null
  /** Per page: boxes to paint white before cutting (the printed question numbers). */
  whiteouts: Record<number, Rect[]>
  /** Pages that hold questions, 0-based. */
  questionPages: number[]
  /** Per question page: rough x where the right column starts, or null for one column. */
  splits: Record<number, number | null>
  warnings: string[]
}

const LABEL = /^(?:Q\.?\s*)?(\d{1,3})[.)]$/i
const MONTH_MARK = /^(JAN|JANUARY|FEB|FEBRUARY|APR|APRIL|SEPT?|SEPTEMBER|SHIFT\s*\d?|MORNING|EVENING|PYQ)$/i

export function labelNumber(s: string): number | null {
  const m = LABEL.exec(s.trim())
  return m ? Number(m[1]) : null
}

function pageText(p: PageText): string {
  return lines(p.items).join('\n')
}

export type PageKind = 'question' | 'key' | 'blankKey' | 'index' | 'other'

export function classifyPage(p: PageText): PageKind {
  const t = pageText(p)
  const labels = p.items.filter(i => labelNumber(i.s) !== null).length
  if ((/\bindex\b/i.test(t) && /page\s*no/i.test(t)) || /\bs\.\s*no\b/i.test(t)) return 'index'
  if (/fill\s+your\s+answers?/i.test(t) && !/answer\s*key/i.test(t)) return 'blankKey'
  if (/answer\s*key/i.test(t)) return 'key'
  if (labels > 25) return 'blankKey'
  return labels > 0 ? 'question' : 'other'
}

/* ---------- answer key ---------- */

const ANSWER_TOKEN = String.raw`(-?\d+(?:\.\d+)?|[a-dA-D]|\([a-dA-D1-4]\))`
const PAIR = new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*[.)]?\s+${ANSWER_TOKEN}(?=\s|$)`, 'g')

/** Groups items into text lines (same baseline), each sorted left to right. */
export function lines(items: TItem[]): string[] {
  const sorted = items.filter(i => i.s.trim() !== '').slice().sort((a, b) => (a.y + a.h) - (b.y + b.h) || a.x - b.x)
  const out: TItem[][] = []
  for (const it of sorted) {
    const base = it.y + it.h
    const row = out.find(r => Math.abs((r[0].y + r[0].h) - base) < 3)
    if (row) row.push(it); else out.push([it])
  }
  // Pieces that touch (a minus sign and its number, say) join without a space.
  return out.map(r => r.sort((a, b) => a.x - b.x).reduce((acc, it, i, arr) => {
    const t = it.s.trim()
    if (i === 0) return t
    const prev = arr[i - 1]
    const gap = it.x - (prev.x + prev.w)
    return gap < 1.5 && prev.s.trim() !== '' ? acc + t : `${acc} ${t}`
  }, ''))
}

export function parseKeyLines(textLines: string[]): Record<number, string> {
  const key: Record<number, string> = {}
  for (const line of textLines) {
    PAIR.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PAIR.exec(line))) {
      const n = Number(m[1])
      if (!(n in key)) key[n] = m[2]
      PAIR.lastIndex = m.index + m[0].length
    }
  }
  return key
}

/**
 * Key cells that carry a sentence instead of a bare answer, read from the page's
 * text in drawing order (a wrapped cell stays in one piece there, even when the
 * table's columns interleave on screen):
 *   "20. Dropped (Correct Answer is 32)"          -> 32
 *   "31 2 (NTA assumed friction on the 2m path)"  -> 2
 *   "198. NTA gave 5 (It should be 15)"           -> 15
 * Anything it cannot read with confidence is left out, so the student sets it.
 */
const NUM = String.raw`-?\d+(?:\.\d+)?`
const SENTENCE_KEY = new RegExp(
  String.raw`(?:^|\s)(\d{1,3})\.?\s+(?:` +
  String.raw`Dropped\s*\(\s*Correct\s*Answer\s*is\s*(${NUM})\s*\)` +
  String.raw`|NTA\s*gave\s*${NUM}\s*\(\s*It\s*should\s*be\s*(${NUM})\s*\)` +
  String.raw`|${NUM}\s*\(\s*Exact\s*answer\s*should\s*be\s*(${NUM})\s*\)` +
  String.raw`|(${NUM})\s*\(\s*NTA\s*assumed[^)]*\)` +
  String.raw`)`, 'gi')

export function parseSentenceKey(text: string): Record<number, string> {
  const out: Record<number, string> = {}
  SENTENCE_KEY.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SENTENCE_KEY.exec(text))) {
    const a = m[2] ?? m[3] ?? m[4] ?? m[5]
    if (a !== undefined && !(Number(m[1]) in out)) out[Number(m[1])] = a
  }
  return out
}

/** "Q26 : NTA gave 245 as answer but it should be -245" -> {26: "-245"} */
export function parseCorrections(text: string): Record<number, string> {
  const out: Record<number, string> = {}
  const re = /Q\s*(\d{1,3})\s*[:.-][^*]*?should\s+be\s+(-?\s?\d+(?:\.\d+)?|\(?[a-dA-D1-4]\)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out[Number(m[1])] = m[2].replace(/[()\s]/g, '')
  return out
}

/** "List of questions based on removed topics ... 67, 70, 77 & 189" -> [67, 70, 77, 189] */
export function parseRemoved(text: string): number[] {
  const m = /removed\s+topics?[\s\S]{0,160}?(?<!\d)((?:\d{1,3}\s*(?:,|&|and)\s*)+\d{1,3})(?!\d)/i.exec(text)
  if (!m) return []
  return [...new Set(m[1].split(/\s*(?:,|&|and)\s*/i).map(Number).filter(n => n > 0))].sort((a, b) => a - b)
}

/* ---------- kind of question from its key entry ---------- */

export interface KeyAnswer {
  kind: 'mcq' | 'num'
  answer: number
  /** True when the key alone can't tell: a whole number from 1 to 4 could be an option or a numerical answer. */
  unsure: boolean
}

export function readKeyAnswer(raw: string | undefined): KeyAnswer | null {
  if (raw === undefined) return null
  const t = raw.trim().replace(/^\((.*)\)$/, '$1')
  if (/^[a-dA-D]$/.test(t)) return { kind: 'mcq', answer: t.toLowerCase().charCodeAt(0) - 96, unsure: false }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const v = Number(t)
  if (Number.isInteger(v) && v >= 1 && v <= 4) return { kind: 'mcq', answer: v, unsure: true }
  return { kind: 'num', answer: v, unsure: false }
}

/* ---------- layout ---------- */

function isLetters(s: string): boolean { return /[A-Za-z]/.test(s) }

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s,(&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bU&d\b/, 'U&D')
    .replace(/\b(Ktg|Shm|Com|Mec|Emi|Em|Ac|Dc)\b/g, w => w.toUpperCase())
}

interface PageLayout {
  index: number
  bodyTop: number
  bodyBottom: number
  headings: TItem[]
  obstacles: TItem[]
  labels: { n: number; item: TItem }[]
  split: number | null // x where the right column starts, null for one column
}

function chromeSignatures(pages: PageText[], qPages: number[]): Set<string> {
  const counts = new Map<string, number>()
  for (const pi of qPages) {
    const seen = new Set<string>()
    for (const it of pages[pi].items) {
      if (labelNumber(it.s) !== null || it.s.trim() === '') continue
      const sig = sigOf(it)
      if (!seen.has(sig)) { seen.add(sig); counts.set(sig, (counts.get(sig) ?? 0) + 1) }
    }
  }
  const need = Math.max(2, Math.ceil(qPages.length * 0.4))
  return new Set([...counts.entries()].filter(([, c]) => c >= need).map(([s]) => s))
}

function sigOf(it: TItem): string {
  return `${it.s.trim().replace(/\d+/g, '#').toLowerCase()}@${Math.round(it.y / 6)}`
}

function layoutPage(p: PageText, index: number, chrome: Set<string>, docSplit: number | null): PageLayout {
  const labels: { n: number; item: TItem }[] = []
  const headings: TItem[] = []
  const obstacles: TItem[] = []
  let topChromeBottom = 0
  const rest: TItem[] = []
  for (const it of p.items) {
    if (it.s.trim() === '') continue
    const n = labelNumber(it.s)
    if (n !== null) { labels.push({ n, item: it }); continue }
    const isPageNumber = /^\d+$/.test(it.s.trim()) && (it.y < p.h * 0.08 || it.y > p.h * 0.92)
    if (chrome.has(sigOf(it)) || isPageNumber) {
      if (it.y < p.h * 0.15) topChromeBottom = Math.max(topChromeBottom, it.y + it.h)
      else obstacles.push(it)
      continue
    }
    rest.push(it)
  }
  // A page full of ordinary text has its questions as real text: only headings can bound them then.
  const textHeavy = rest.filter(i => /[a-z]/.test(i.s)).length > 40
  for (const it of rest) {
    const s = it.s.trim()
    const upper = s === s.toUpperCase() && isLetters(s)
    if (upper && s.replace(/[^A-Z]/g, '').length >= 3 && !MONTH_MARK.test(s) && !/^(solution|q\s*ans|ans)\b/i.test(s)) headings.push(it)
    else if (!textHeavy || MONTH_MARK.test(s)) obstacles.push(it)
  }
  const bodyTop = topChromeBottom > 0 ? topChromeBottom + 10 : p.h * 0.03
  const right = labels.filter(l => l.item.x > p.w * 0.4).map(l => l.item.x)
  // Eduniti papers keep one layout throughout: a page whose right column only
  // carries run-on text still has two columns.
  const split = right.length > 0 ? Math.min(...right) - 6 : docSplit
  return { index, bodyTop, bodyBottom: p.h - 4, headings: mergeHeadings(headings), obstacles, labels, split }
}

function mergeHeadings(hs: TItem[]): TItem[] {
  const sorted = hs.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  const out: TItem[] = []
  for (const h of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.y - h.y) < 4 && h.x - (last.x + last.w) < 30) {
      const x0 = Math.min(last.x, h.x), x1 = Math.max(last.x + last.w, h.x + h.w)
      out[out.length - 1] = { s: `${last.s} ${h.s}`, x: x0, y: Math.min(last.y, h.y), w: x1 - x0, h: Math.max(last.h, h.h) }
    } else out.push(h)
  }
  return out
}

function colOf(L: PageLayout, x: number): number {
  return L.split !== null && x >= L.split - 1 ? 1 : 0
}

function colRange(L: PageLayout, p: PageText, col: number): [number, number] {
  if (L.split === null) return [2, p.w - 2]
  return col === 0 ? [2, L.split - 2] : [L.split, p.w - 2]
}

/** How far above its "Solution Link" text the QR code reaches, in PDF points. */
const QR_HEIGHT = 50

export function planImport(pages: PageText[]): ImportPlan {
  const warnings: string[] = []
  const kinds = pages.map(classifyPage)
  const qPages = kinds.map((k, i) => (k === 'question' ? i : -1)).filter(i => i >= 0)
  const chrome = chromeSignatures(pages, qPages)

  // Answer key: every page that says "answer key" and reads as pairs.
  const key: Record<number, string> = {}
  kinds.forEach((k, i) => {
    if (k !== 'key') return
    const pairs = parseKeyLines(lines(pages[i].items))
    if (Object.keys(pairs).length < 5) return
    for (const [n, a] of Object.entries(pairs)) if (!(Number(n) in key)) key[Number(n)] = a
    // Sentences in a cell win over the bare number the line parser may have caught first.
    const streamText = pages[i].items.map(it => it.s).join(' ').replace(/\s+/g, ' ')
    for (const [n, a] of Object.entries(parseSentenceKey(streamText))) key[Number(n)] = a
  })
  const allText = pages.map(pageText).join('\n')
  const corrections = parseCorrections(allText)
  const solutionUrl = [...pages.flatMap(p => p.links), ...(allText.match(/https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\/\S+/g) ?? [])]
    .find(u => /youtu\.?be/i.test(u)) ?? null

  const rightXs = qPages.flatMap(pi => pages[pi].items.filter(i => labelNumber(i.s) !== null && i.x > pages[pi].w * 0.4).map(i => i.x)).sort((a, b) => a - b)
  const docSplit = rightXs.length > 0 ? rightXs[Math.floor(rightXs.length / 2)] - 6 : null
  const layouts = qPages.map(pi => layoutPage(pages[pi], pi, chrome, docSplit))

  // The numbers themselves give the reading order: keep the run 1, 2, 3, ...
  // (allowing a small gap where a number didn't come through), page by page.
  const accepted = new Map<string, { n: number; page: number; item: TItem }>()
  const acceptedOn = new Map<number, { n: number; page: number; item: TItem }[]>()
  let expect = 1
  for (const L of layouts) {
    const ls = L.labels.slice().sort((a, b) => a.n - b.n || a.item.y - b.item.y)
    for (const l of ls) {
      if (l.n === expect || (l.n > expect && l.n <= expect + 3 && expect > 1)) {
        if (l.n !== expect) warnings.push(l.n - expect > 1 ? `Questions ${expect}-${l.n - 1} were not found in the PDF.` : `Question ${expect} was not found in the PDF.`)
        const a = { n: l.n, page: L.index, item: l.item }
        accepted.set(`${L.index}:${l.n}`, a)
        if (!acceptedOn.has(L.index)) acceptedOn.set(L.index, [])
        acceptedOn.get(L.index)!.push(a)
        expect = l.n + 1
      }
    }
  }
  const found = expect - 1
  const keyCount = Object.keys(key).length
  if (found === 0) warnings.push('No numbered questions found.')
  if (keyCount === 0) warnings.push('No answer key found.')
  else if (found > 0 && keyCount !== found) warnings.push(`The answer key has ${keyCount} entries but ${found} questions were found.`)
  const removed = parseRemoved(allText).filter(n => n <= Math.max(found, keyCount))

  // Chapters: a heading starts at the first question below it.
  const chapterStarts: { n: number; name: string }[] = []
  for (const L of layouts) {
    const mine = acceptedOn.get(L.index) ?? []
    const p = pages[L.index]
    for (const h of L.headings) {
      const cols = L.split === null ? [0] : [0, 1].filter(c => { const [a, b] = colRange(L, p, c); return h.x < b && h.x + h.w > a })
      const below = mine.filter(a => a.item.y > h.y && cols.includes(colOf(L, a.item.x))).map(a => a.n)
      if (below.length > 0) chapterStarts.push({ n: Math.min(...below), name: titleCase(h.s.trim()) })
    }
  }
  chapterStarts.sort((a, b) => a.n - b.n)
  const chapterOf = (n: number) => {
    let name = 'General'
    for (const c of chapterStarts) if (c.n <= n) name = c.name
    return name
  }

  // Cut each column into pieces at numbers, headings and markers. A piece that
  // starts at a number belongs to it; any other piece runs on from the question
  // before the next number below it (or the page's last question).
  const byN = new Map<number, PlannedQuestion>()
  const whiteouts: Record<number, Rect[]> = {}
  const splits: Record<number, number | null> = {}
  const get = (n: number) => {
    let q = byN.get(n)
    if (!q) { q = { n, chapter: chapterOf(n), strips: [] }; byN.set(n, q) }
    return q
  }
  for (const L of layouts) {
    const p = pages[L.index]
    splits[L.index] = L.split
    const mine = acceptedOn.get(L.index) ?? []
    whiteouts[L.index] = [
      ...mine.map(a => ({ x0: a.item.x - 1, y0: a.item.y - 1, x1: a.item.x + a.item.w + 1, y1: a.item.y + a.item.h + 1 })),
      ...L.obstacles.filter(o => MONTH_MARK.test(o.s.trim())).map(o => ({ x0: o.x - 12, y0: o.y - 7, x1: o.x + o.w + 12, y1: o.y + o.h + 7 })),
    ]
    const pageMax = mine.length > 0 ? Math.max(...mine.map(a => a.n)) : null
    const cols = L.split === null ? [0] : [0, 1]
    for (const col of cols) {
      const [cx0, cx1] = colRange(L, p, col)
      const colLabels = mine.filter(a => colOf(L, a.item.x) === col).sort((a, b) => a.item.y - b.item.y)
      // A "Solution Link - CLICK" line at the foot of the page has a QR code drawn
      // above it, which is not text. Nothing below that point belongs to a question.
      const link = L.obstacles.find(o => /^(solution|click)/i.test(o.s.trim()) && o.y > p.h * 0.8 && o.x < cx1 && o.x + o.w > cx0)
      const colBottom = link ? Math.min(L.bodyBottom, link.y - QR_HEIGHT) : L.bodyBottom
      const cuts = [...L.headings, ...L.obstacles]
        .filter(o => o.x < cx1 && o.x + o.w > cx0 && o.y + o.h > L.bodyTop && o.y < colBottom)
        .map(o => ({ top: o.y - 2, bottom: o.y + o.h + 2 }))
      type Ev = { y: number; kind: 'label'; n: number } | { y: number; kind: 'cut'; bottom: number }
      const events: Ev[] = [
        ...colLabels.map(a => ({ y: a.item.y - 6, kind: 'label' as const, n: a.n })),
        ...cuts.map(c => ({ y: c.top, kind: 'cut' as const, bottom: c.bottom })),
      ].sort((a, b) => a.y - b.y)
      let y = L.bodyTop
      let owner: number | null = null // question the current piece belongs to; null = run-on piece
      const close = (end: number) => {
        if (end - y < 6) return
        let n = owner
        let continuation = false
        if (n === null) {
          const below = colLabels.find(a => a.item.y - 6 >= end - 1)
          n = below ? below.n - 1 : pageMax
          continuation = true
          if (n === null || n < 1 || end - y < 14) return
        }
        get(n).strips.push({ page: L.index, col: L.split === null ? -1 : col, x0: cx0, y0: y, x1: cx1, y1: end, continuation })
      }
      for (const e of events) {
        if (e.y < y - 1 && e.kind === 'cut') { y = Math.max(y, e.bottom); continue }
        close(Math.max(y, e.y))
        if (e.kind === 'label') { y = Math.max(y, e.y); owner = e.n }
        else { y = Math.max(y, e.bottom); owner = null }
      }
      close(colBottom)
    }
  }
  for (let n = 1; n <= found; n++) get(n)

  return {
    questions: [...byN.values()].sort((a, b) => a.n - b.n),
    key, corrections, removed, solutionUrl, whiteouts,
    questionPages: qPages, splits, warnings,
  }
}
