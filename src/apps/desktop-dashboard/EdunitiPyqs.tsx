import { useEffect, useMemo, useState } from 'react'
import { MockTestPanel } from './PyqTest'
import { PyqUpload } from './PyqUpload'
import { deleteSet, listSets, toPyqSet } from './lib/pyqStore'
import { loadActive } from './lib/pyqTest'
import {
  PYQ_SETS, chaptersOf, checkAnswer, loadProgress, questionImageUrl, saveProgress, summarize,
  type PyqProgress, type PyqQuestion, type PyqSet,
} from './lib/edunitiPyqs'

// The "Eduniti Top PYQs" page body. DesktopDashboard wraps it with the sidebar.
// Questions are pictures cut from Mohit Goenka's (Eduniti) PDFs, used with his
// permission, so the credit and the link to his video solutions stay visible.

type Filter = 'all' | 'todo' | 'wrong'
type Mode = 'practice' | 'mock'
const PAGE_SIZE = 20

type LoadedSet = PyqSet & { release?: () => void }

export function EdunitiPyqsContent({ candidateName }: { candidateName?: string | null } = {}) {
  const [set, setSet] = useState<PyqSet>(PYQ_SETS[0])
  const [uploaded, setUploaded] = useState<LoadedSet[]>([])
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<Mode>(() => { const a = loadActive(); return a && a.setId === PYQ_SETS[0].id && a.submittedAt === null ? 'mock' : 'practice' })
  const allSets: PyqSet[] = [...PYQ_SETS, ...uploaded]

  // Sets the student imported earlier live in this browser. A test left running
  // on one of them opens straight back into it.
  useEffect(() => {
    let alive = true
    const made: LoadedSet[] = []
    void listSets().then(stored => {
      if (!alive) return
      for (const st of stored) made.push(toPyqSet(st))
      setUploaded(made)
      const a = loadActive()
      const target = a && a.submittedAt === null ? made.find(x => x.id === a.setId) : undefined
      if (target) { setSet(target); setMode('mock') }
    })
    return () => { alive = false; for (const m of made) m.release?.() }
  }, [])

  async function removeUploaded(target: LoadedSet) {
    if (!window.confirm(`Delete "${target.title}" from this device? Your answers and test history for it go too.`)) return
    await deleteSet(target.id).catch(() => undefined)
    target.release?.()
    setUploaded(u => u.filter(x => x.id !== target.id))
    setSet(PYQ_SETS[0])
  }
  const [chapter, setChapter] = useState<string>('All')
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [progress, setProgress] = useState<PyqProgress>(() => loadProgress(PYQ_SETS[0].id))

  useEffect(() => { setProgress(loadProgress(set.id)); setChapter('All'); setFilter('all') }, [set.id])
  useEffect(() => { setShown(PAGE_SIZE) }, [chapter, filter, set.id])

  function record(n: number, response: string, correct: boolean) {
    setProgress(prev => {
      const next = { ...prev, [n]: { response, correct } }
      saveProgress(set.id, next)
      return next
    })
  }
  function resetAll() {
    if (!window.confirm('Clear your answers for this set?')) return
    setProgress({})
    saveProgress(set.id, {})
  }

  const chapters = useMemo(() => chaptersOf(set), [set])
  const stats = summarize(set, progress)
  const list = set.questions.filter(x => {
    if (chapter !== 'All' && x.chapter !== chapter) return false
    const p = progress[x.n]
    if (filter === 'todo') return !p
    if (filter === 'wrong') return !!p && !p.correct
    return true
  })
  const pct = stats.total ? Math.round((stats.attempted / stats.total) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="text-[11px] font-mono tracking-[0.3em] text-wk-orange-300 mb-2">ELITE PRACTICE</div>
      <h1 className="text-2xl md:text-3xl font-black text-white">Eduniti Top PYQs</h1>
      <p className="text-sm text-wk-ink-400 mt-1">Hand-picked previous-year questions with answers you can check instantly.</p>

      <div className="flex gap-2 mt-4 flex-wrap">
        {allSets.map(s => (
          <button key={s.id} onClick={() => { setSet(s); setUploading(false) }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border max-w-[260px] truncate"
            style={{ background: s.id === set.id && !uploading ? 'rgba(255,138,61,0.15)' : 'transparent', borderColor: s.id === set.id && !uploading ? '#FF8A3D' : '#3A3A3A', color: s.id === set.id && !uploading ? '#FFA94D' : '#9C968C' }}>
            {s.uploaded ? '📄 ' : ''}{s.title}
          </button>
        ))}
        <button onClick={() => setUploading(true)}
          className="px-3 py-1.5 rounded-full text-xs font-bold border border-dashed"
          style={{ borderColor: uploading ? '#FF8A3D' : '#55524D', color: '#FFA94D' }}>
          + Upload Eduniti PDF
        </button>
      </div>

      {uploading ? (
        <PyqUpload onCancel={() => setUploading(false)}
          onSaved={st => { const loaded = toPyqSet(st); setUploaded(u => [loaded, ...u]); setSet(loaded); setUploading(false); setMode('practice') }} />
      ) : (<>

      <div className="mt-4 rounded-2xl border p-4" style={{ background: '#161618', borderColor: '#26262A' }}>
        <div className="text-base font-bold text-white">{set.title}</div>
        <p className="text-sm text-wk-ink-300 mt-1">{set.subtitle}</p>
        <p className="text-xs text-wk-ink-500 mt-2">
          {set.uploaded ? <>Content by {set.credit}.</> : <>By {set.credit}. Used with his permission.</>}{' '}
          {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer" className="text-wk-orange-300 underline">Watch the video solutions</a>}
          {set.uploaded && <button onClick={() => void removeUploaded(set as LoadedSet)} className="ml-3 underline text-wk-ink-500 hover:text-red-400">Delete this set</button>}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#26262A' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#FF8A3D' }} />
          </div>
          <div className="text-xs font-mono text-wk-ink-300 whitespace-nowrap">{stats.attempted}/{stats.total} tried · {stats.correct} right</div>
        </div>
        {stats.attempted > 0 && (
          <button onClick={resetAll} className="mt-2 text-xs text-wk-ink-500 hover:text-wk-ink-300 underline">Clear my answers</button>
        )}
      </div>

      <div className="mt-4 flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#161618', border: '1px solid #26262A' }} role="tablist" aria-label="Mode">
        {([['practice', 'Practice'], ['mock', 'Mock test']] as [Mode, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: mode === id ? '#26262A' : 'transparent', color: mode === id ? '#FFF7E6' : '#9C968C' }}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'mock' && <MockTestPanel key={set.id} set={set} candidateName={candidateName ?? null} />}
      {mode === 'practice' && (<>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Chapter">
        {['All', ...chapters].map(c => (
          <button key={c} role="tab" aria-selected={chapter === c} onClick={() => setChapter(c)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap flex-shrink-0"
            style={{ background: chapter === c ? 'rgba(255,138,61,0.15)' : 'transparent', borderColor: chapter === c ? '#FF8A3D' : '#3A3A3A', color: chapter === c ? '#FFA94D' : '#9C968C' }}>
            {c}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {([['all', 'All'], ['todo', 'Not tried'], ['wrong', 'Got wrong']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className="px-3 py-1 rounded-lg text-xs font-medium border"
            style={{ background: filter === id ? '#26262A' : 'transparent', borderColor: filter === id ? '#3A3A3A' : 'transparent', color: filter === id ? '#FFF7E6' : '#9C968C' }}>
            {label}
          </button>
        ))}
        <div className="ml-auto text-xs text-wk-ink-500 self-center">{list.length} question{list.length === 1 ? '' : 's'}</div>
      </div>

      <div className="mt-4 space-y-4">
        {list.slice(0, shown).map(x => (
          <QuestionCard key={`${set.id}-${x.n}`} set={set} q={x} saved={progress[x.n]} onRecord={record} />
        ))}
        {list.length === 0 && (
          <div className="text-sm text-wk-ink-400 text-center py-10">
            {filter === 'wrong' ? 'No wrong answers here. Nice.' : filter === 'todo' ? 'You have tried everything in this view.' : 'No questions.'}
          </div>
        )}
        {list.length > shown && (
          <button onClick={() => setShown(s => s + PAGE_SIZE)}
            className="w-full py-3 rounded-xl text-sm font-bold border"
            style={{ borderColor: '#3A3A3A', color: '#FFA94D', background: 'rgba(38,38,42,0.55)' }}>
            Show {Math.min(PAGE_SIZE, list.length - shown)} more
          </button>
        )}
      </div>
      </>)}
      </>)}
      <div className="h-6" />
    </div>
  )
}

function QuestionCard({ set, q, saved, onRecord }: {
  set: PyqSet
  q: PyqQuestion
  saved?: { response: string; correct: boolean }
  onRecord: (n: number, response: string, correct: boolean) => void
}) {
  const [input, setInput] = useState(saved?.response ?? '')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')
  const result = saved ? (saved.correct ? 'correct' : 'wrong') : null

  function submit(response: string) {
    const r = checkAnswer(q, response)
    if (r === 'invalid') { setError(q.kind === 'mcq' ? 'Pick an option.' : 'Type a number.'); return }
    setError('')
    onRecord(q.n, response, r === 'correct')
  }

  const border = result === 'correct' ? 'rgba(74,222,128,0.5)' : result === 'wrong' ? 'rgba(248,113,113,0.5)' : '#26262A'

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: '#161618', borderColor: border }}>
      <div className="flex items-center gap-2 px-4 pt-3 text-xs">
        <span className="font-mono font-bold text-wk-orange-300">Q{q.n}</span>
        <span className="text-wk-ink-500 truncate">{q.chapter}</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={{ background: '#26262A', color: '#CFC8BB' }}>
          {q.kind === 'mcq' ? 'Single correct' : 'Numerical'}
        </span>
      </div>
      {q.removed && (
        <div className="mx-4 mt-2 text-[11px] text-wk-butter-300">JEE Main removed this topic from the syllabus from 2024.</div>
      )}
      {/* White card behind the picture: the cut-outs have dark-on-white text. */}
      <div className="mx-4 mt-3 rounded-xl overflow-hidden bg-white">
        <img src={questionImageUrl(set, q.n)} alt={`Question ${q.n}, ${q.chapter}`} loading="lazy" className="w-full h-auto block" />
      </div>

      <div className="px-4 py-3">
        {q.kind === 'mcq' ? (
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Answer for question ${q.n}`}>
            {['1', '2', '3', '4'].map(o => {
              const chosen = saved?.response === o
              const isAnswer = (result !== null || revealed) && Number(o) === q.answer
              return (
                <button key={o} onClick={() => submit(o)}
                  className="py-2.5 rounded-xl text-sm font-bold border transition-colors"
                  style={{
                    background: isAnswer ? 'rgba(74,222,128,0.15)' : chosen ? 'rgba(248,113,113,0.15)' : 'transparent',
                    borderColor: isAnswer ? 'rgba(74,222,128,0.6)' : chosen ? 'rgba(248,113,113,0.6)' : '#3A3A3A',
                    color: isAnswer ? '#4ADE80' : chosen ? '#F87171' : '#E8E2D6',
                  }}>
                  ({o})
                </button>
              )
            })}
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); submit(input) }}>
            <input value={input} onChange={e => setInput(e.target.value)} inputMode="decimal" placeholder="Your answer"
              aria-label={`Numerical answer for question ${q.n}`}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm text-white bg-transparent outline-none border focus:border-wk-orange-300/70"
              style={{ borderColor: '#3A3A3A' }} />
            <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-bold text-wk-black-950" style={{ background: '#FF8A3D' }}>Check</button>
          </form>
        )}

        <div className="mt-2 min-h-[20px] text-xs" aria-live="polite">
          {error && <span className="text-red-400">{error}</span>}
          {!error && result === 'correct' && <span className="text-green-400 font-semibold">Correct.</span>}
          {!error && result === 'wrong' && (
            <span className="text-red-400 font-semibold">Not quite. {q.kind === 'num' ? 'Try again or show the answer.' : 'Pick again or show the answer.'}</span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <button onClick={() => setRevealed(r => !r)} className="text-wk-ink-400 hover:text-wk-ink-200 underline">
            {revealed ? 'Hide answer' : 'Show answer'}
          </button>
          {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer" className="text-wk-ink-400 hover:text-wk-ink-200 underline">Video solution</a>}
        </div>
        {revealed && (
          <div className="mt-2 text-sm text-wk-ink-100">
            Answer: <span className="font-bold text-wk-orange-300">{q.kind === 'mcq' ? `(${q.answer})` : q.answer}</span>
            {q.note && <div className="text-xs text-wk-ink-400 mt-1">{q.note}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
