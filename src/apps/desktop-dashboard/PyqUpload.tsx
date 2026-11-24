import { useEffect, useMemo, useRef, useState } from 'react'
import { importEdunitiPdf, type ImportResult } from './lib/pyqImportPdf'
import { parseKeyLines, readKeyAnswer } from './lib/pyqImportCore'
import { aiClassify } from './lib/pyqAiCheck'
import { UPLOADED_PREFIX, saveSet, titleFromFileName, type StoredSet } from './lib/pyqStore'

// "Upload Eduniti PDF": reads the PDF on this device, cuts out the questions,
// asks Gemini about the ones the answer key can't settle, then lets the
// student check everything before saving the set.


type Kind = 'mcq' | 'num'
type Row = ImportResult['questions'][number] & { ai?: Kind; url: string }

type Stage =
  | { kind: 'pick' }
  | { kind: 'working'; label: string; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'error'; message: string }

const BTN = 'px-4 py-2 rounded-xl text-sm font-bold'

export function PyqUpload({ onSaved, onCancel }: { onSaved: (s: StoredSet) => void; onCancel: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [fileName, setFileName] = useState('')
  const [title, setTitle] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [aiNote, setAiNote] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => { for (const r of rows) URL.revokeObjectURL(r.url) }, [rows])

  async function handle(file: File) {
    setFileName(file.name)
    setTitle(titleFromFileName(file.name))
    setStage({ kind: 'working', label: 'Opening the PDF', done: 0, total: 1 })
    try {
      const res = await importEdunitiPdf(await file.arrayBuffer(), (s, done, total) =>
        setStage({ kind: 'working', label: s === 'reading' ? 'Reading pages' : 'Cutting out questions', done, total }))
      if (res.questions.length === 0) {
        setStage({ kind: 'error', message: 'No numbered questions were found in this PDF. Is it an Eduniti challenge paper?' })
        return
      }
      let next: Row[] = res.questions.map(q => ({ ...q, url: URL.createObjectURL(q.image) }))
      const unsure = next.filter(q => q.unsure && Number.isFinite(q.answer))
      if (unsure.length > 0) {
        setStage({ kind: 'working', label: `Checking ${unsure.length} questions with AI`, done: 0, total: 1 })
        try {
          const ai = await aiClassify(unsure)
          const got = Object.keys(ai).length
          next = next.map(q => (ai[q.n] ? { ...q, kind: ai[q.n], ai: ai[q.n] } : q))
          setAiNote(got > 0 ? `AI sorted ${got} of ${unsure.length} questions the answer key couldn't. Check them below.` : '')
        } catch (e) {
          setAiNote(`AI check unavailable (${(e as Error).message}). Set the ${unsure.length} flagged questions by hand.`)
        }
      }
      setResult(res)
      setRows(next)
      setStage({ kind: 'review' })
    } catch (e) {
      setStage({ kind: 'error', message: `Could not read this PDF: ${(e as Error).message}` })
    }
  }

  function setKind(n: number, kind: Kind) {
    setRows(rs => rs.map(r => (r.n === n ? { ...r, kind, unsure: false } : r)))
  }

  function setAllUnsure(kind: Kind) {
    setRows(rs => rs.map(r => (r.unsure ? { ...r, kind, unsure: false } : r)))
  }

  function applyKey() {
    const parsed = parseKeyLines(keyText.split(/\n|;/))
    setRows(rs => rs.map(r => {
      const read = readKeyAnswer(parsed[r.n])
      return read ? { ...r, kind: read.kind, answer: read.answer, unsure: read.unsure } : r
    }))
  }

  const missing = rows.filter(r => !Number.isFinite(r.answer))
  const flagged = rows.filter(r => r.unsure && Number.isFinite(r.answer))
  const chapters = useMemo(() => new Set(rows.map(r => r.chapter)).size, [rows])

  async function save() {
    if (!result) return
    setSaving(true)
    try {
      const usable = rows.filter(r => Number.isFinite(r.answer))
      const stored: StoredSet = {
        id: `${UPLOADED_PREFIX}${Date.now()}`,
        title: title.trim() || titleFromFileName(fileName),
        fileName,
        createdAt: Date.now(),
        solutionUrl: result.solutionUrl,
        questions: usable.map(r => ({
          n: r.n, chapter: r.chapter, kind: r.kind, answer: r.answer, image: r.image,
          ...(r.removed ? { removed: true } : {}), ...(r.note ? { note: r.note } : {}),
        })),
      }
      await saveSet(stored)
      onSaved(stored)
    } catch (e) {
      setStage({ kind: 'error', message: `Could not save on this device: ${(e as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  const card = 'rounded-2xl border p-4'
  const cardStyle = { background: '#161618', borderColor: '#26262A', color: '#E8E2D6' }

  if (stage.kind === 'pick' || stage.kind === 'error') {
    return (
      <div className={`${card} mt-4`} style={cardStyle}>
        <div className="text-base font-bold text-white">Upload an Eduniti challenge PDF</div>
        <p className="text-xs mt-1 text-wk-ink-400">
          Wynko cuts out every question, reads the answer key and turns it into a practice set and mock tests.
          The PDF is read on this device and stays here; only pictures of a few unclear questions are sent for an AI check.
        </p>
        {stage.kind === 'error' && <div className="mt-3 text-sm text-red-400">{stage.message}</div>}
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = '' }} />
        <div className="flex gap-2 mt-4">
          <button onClick={() => input.current?.click()} className={`${BTN} text-wk-black-950`} style={{ background: '#FF8A3D' }}>Choose PDF</button>
          <button onClick={onCancel} className={`${BTN} border`} style={{ borderColor: '#3A3A3A', color: '#9C968C' }}>Cancel</button>
        </div>
      </div>
    )
  }

  if (stage.kind === 'working') {
    const pct = stage.total ? Math.round((stage.done / stage.total) * 100) : 0
    return (
      <div className={`${card} mt-4`} style={cardStyle} aria-live="polite">
        <div className="text-sm font-bold text-white">{stage.label}…</div>
        <div className="text-xs mt-1 text-wk-ink-400">{fileName}</div>
        <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: '#26262A' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#FF8A3D' }} />
        </div>
      </div>
    )
  }

  const visible = showAll ? rows : flagged
  return (
    <div className="mt-4 space-y-4">
      <div className={card} style={cardStyle}>
        <div className="text-base font-bold text-white">Check the import</div>
        <label className="block mt-3 text-[11px] font-mono tracking-widest text-wk-ink-400" htmlFor="pyq-title">SET NAME</label>
        <input id="pyq-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
          className="mt-1 w-full px-3 py-2 rounded-xl text-sm text-white bg-transparent outline-none border focus:border-wk-orange-300/70" style={{ borderColor: '#3A3A3A' }} />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Chip ok>{rows.length} questions</Chip>
          <Chip ok={result?.hasKey ?? false}>{result?.hasKey ? 'Answer key read' : 'No answer key found'}</Chip>
          <Chip ok>{chapters} chapter{chapters === 1 ? '' : 's'}</Chip>
          <Chip ok={!!result?.solutionUrl}>{result?.solutionUrl ? 'Video solutions linked' : 'No video link'}</Chip>
        </div>
        {aiNote && <p className="mt-3 text-xs text-wk-ink-300">{aiNote}</p>}
        {(result?.warnings.length ?? 0) > 0 && (
          <ul className="mt-3 text-xs text-wk-butter-300 list-disc pl-5 space-y-0.5">{result!.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        )}
      </div>

      {missing.length > 0 && (
        <div className={card} style={cardStyle}>
          <div className="text-sm font-bold text-white">{missing.length} question{missing.length === 1 ? ' has' : 's have'} no answer</div>
          <p className="text-xs mt-1 text-wk-ink-400">Paste the answer key, one per line like "1. 4" or "2. c". Questions left without an answer are not saved.</p>
          <textarea value={keyText} onChange={e => setKeyText(e.target.value)} rows={4}
            className="mt-2 w-full px-3 py-2 rounded-xl text-sm text-white bg-transparent outline-none border font-mono" style={{ borderColor: '#3A3A3A' }} />
          <button onClick={applyKey} className={`${BTN} mt-2 border`} style={{ borderColor: '#3A3A3A', color: '#FFA94D' }}>Apply key</button>
        </div>
      )}

      <div className={card} style={cardStyle}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm font-bold text-white">
            {showAll ? 'All questions' : flagged.length > 0 ? `${flagged.length} question${flagged.length === 1 ? '' : 's'} to check` : 'Nothing left to check'}
          </div>
          <button onClick={() => setShowAll(s => !s)} className="ml-auto text-xs underline text-wk-ink-400">{showAll ? 'Show only ones to check' : 'Show all questions'}</button>
        </div>
        {!showAll && flagged.length > 0 && (
          <>
            <p className="text-xs mt-1 text-wk-ink-400">The key gives a number from 1 to 4 for these. Tell Wynko if that is an option or a numerical answer.</p>
            <div className="flex gap-2 mt-2 flex-wrap items-center">
              <span className="text-xs text-wk-ink-400">If you can tell at a glance:</span>
              <button onClick={() => setAllUnsure('mcq')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: '#3A3A3A', color: '#FFA94D' }}>Set all {flagged.length} as options</button>
              <button onClick={() => setAllUnsure('num')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: '#3A3A3A', color: '#FFA94D' }}>Set all as numerical</button>
            </div>
          </>
        )}
        <div className="mt-3 space-y-3">
          {visible.map(r => (
            <div key={r.n} className="rounded-xl border overflow-hidden" style={{ borderColor: r.unsure ? 'rgba(255,229,154,0.5)' : '#26262A' }}>
              <div className="flex items-center gap-2 px-3 py-2 text-xs flex-wrap">
                <span className="font-mono font-bold text-wk-orange-300">Q{r.n}</span>
                <span className="text-wk-ink-500 truncate">{r.chapter}</span>
                <span className="ml-auto text-wk-ink-300">Answer: <b className="text-white">{Number.isFinite(r.answer) ? (r.kind === 'mcq' ? `(${r.answer})` : r.answer) : 'none'}</b></span>
              </div>
              <div className="bg-white"><img src={r.url} alt={`Question ${r.n}`} loading="lazy" className="w-full h-auto block" /></div>
              <div className="flex gap-2 px-3 py-2 items-center flex-wrap">
                {(['mcq', 'num'] as Kind[]).map(k => (
                  <button key={k} onClick={() => setKind(r.n, k)} aria-pressed={r.kind === k && !r.unsure}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    disabled={k === 'mcq' && Number.isFinite(r.answer) && !(Number.isInteger(r.answer) && r.answer >= 1 && r.answer <= 4)}
                    style={{ background: r.kind === k ? 'rgba(255,138,61,0.15)' : 'transparent', borderColor: r.kind === k ? '#FF8A3D' : '#3A3A3A', color: r.kind === k ? '#FFA94D' : '#9C968C' }}>
                    {k === 'mcq' ? 'Options (1)–(4)' : 'Numerical'}
                  </button>
                ))}
                {r.ai && <span className="text-[11px] text-wk-ink-500">AI says {r.ai === 'mcq' ? 'options' : 'numerical'}</span>}
                {r.unsure && <span className="text-[11px] text-wk-butter-300">needs a check</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => void save()} disabled={saving || rows.length === missing.length}
          className={`${BTN} flex-1 py-3 text-wk-black-950 disabled:opacity-40`} style={{ background: '#FF8A3D' }}>
          {saving ? 'Saving…' : `Save ${rows.length - missing.length} questions`}
        </button>
        <button onClick={onCancel} className={`${BTN} border`} style={{ borderColor: '#3A3A3A', color: '#9C968C' }}>Discard</button>
      </div>
      {flagged.length > 0 && <p className="text-xs text-wk-ink-500">Unchecked questions are saved as {`"options"`}. You can still save now.</p>}
    </div>
  )
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-full border" style={{ borderColor: ok ? 'rgba(74,222,128,0.4)' : 'rgba(255,229,154,0.5)', color: ok ? '#4ADE80' : '#FFE59A' }}>
      {ok ? '✓ ' : '! '}{children}
    </span>
  )
}
