import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chaptersOf, questionImageUrl, type PyqSet } from './lib/edunitiPyqs'
import {
  MARKING, MINUTES_PER_QUESTION, SECTION_LABEL, analysisCsv, analyze, clearActive, durationFor, formatDuration, formatMinSec,
  isAnswered, loadActive, loadHistory, newAttempt, paletteStatus, questionOf, questionPool, sanitizeNumeric,
  saveActive, saveToHistory, statusCounts, timeLeftSec,
  type Analysis, type Attempt, type Outcome, type PaletteStatus,
} from './lib/pyqTest'

// Mock tests for the Eduniti Top PYQs page: setup, the exam-style test screen,
// and the analysis shown after submitting. The setup is on Wynko's dark palette;
// the test and analysis use a light exam-hall look. Outcomes always carry an icon
// and a word, never color alone.

const INK_DIM = '#9C968C'
const SURFACE = '#161618'
const LINE = '#26262A'

type View =
  | { kind: 'setup' }
  | { kind: 'instructions'; attempt: Attempt }
  | { kind: 'running'; attempt: Attempt }
  | { kind: 'analysis'; attempt: Attempt }

export function MockTestPanel({ set, candidateName }: { set: PyqSet; candidateName?: string | null }) {
  const candidate = candidateName?.trim() || 'Student'
  const [view, setView] = useState<View>({ kind: 'setup' })
  const [history, setHistory] = useState<Attempt[]>(() => loadHistory(set.id))
  const [active, setActive] = useState<Attempt | null>(() => {
    const a = loadActive()
    return a && a.setId === set.id && a.submittedAt === null ? a : null
  })

  const finish = useCallback((a: Attempt, endedBy: 'submit' | 'timeout') => {
    const now = Date.now()
    const submittedAt = endedBy === 'timeout' ? Math.min(now, a.startedAt + a.durationSec * 1000) : now
    const done: Attempt = { ...a, submittedAt, endedBy }
    setHistory(saveToHistory(done))
    clearActive()
    setActive(null)
    setView({ kind: 'analysis', attempt: done })
  }, [])

  if (view.kind === 'instructions') {
    return <TestInstructions set={set} attempt={view.attempt} candidateName={candidate}
      onCancel={() => setView({ kind: 'setup' })}
      onBegin={() => {
        // The clock starts when the student presses begin, not when the page was built.
        const started = { ...view.attempt, startedAt: Date.now() }
        saveActive(started); setActive(started)
        setView({ kind: 'running', attempt: started })
      }} />
  }
  if (view.kind === 'running') {
    return <TestRunner set={set} initial={view.attempt} candidateName={candidate} onFinish={finish} />
  }
  if (view.kind === 'analysis') {
    return <TestAnalysis set={set} attempt={view.attempt} onClose={() => setView({ kind: 'setup' })} />
  }

  return (
    <TestSetup set={set} history={history} active={active}
      onStart={a => setView({ kind: 'instructions', attempt: a })}
      onResume={() => {
        if (!active) return
        if (timeLeftSec(active, Date.now()) === 0) finish(active, 'timeout')
        else setView({ kind: 'running', attempt: active })
      }}
      onDiscard={() => { clearActive(); setActive(null) }}
      onView={a => setView({ kind: 'analysis', attempt: a })} />
  )
}

/* ------------------------------------------------------------------ setup */

function TestSetup({ set, history, active, onStart, onResume, onDiscard, onView }: {
  set: PyqSet
  history: Attempt[]
  active: Attempt | null
  onStart: (a: Attempt) => void
  onResume: () => void
  onDiscard: () => void
  onView: (a: Attempt) => void
}) {
  const chapters = useMemo(() => chaptersOf(set), [set])
  const [picked, setPicked] = useState<string[]>([])
  const [custom, setCustom] = useState(false)
  const allCount = set.questions.length
  const pool = questionPool(set, picked).length
  const effective = pool

  function toggle(c: string) { setPicked(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c])) }

  return (
    <div className="mt-4">
      {active && (
        <div className="rounded-2xl border p-4 mb-4" style={{ background: 'rgba(255,138,61,0.08)', borderColor: 'rgba(255,138,61,0.4)' }}>
          <div className="text-sm font-bold text-white">You have a test in progress</div>
          <div className="text-xs mt-1" style={{ color: INK_DIM }}>
            {active.qNums.length} questions, {formatDuration(timeLeftSec(active, Date.now()))} left on the clock. The clock keeps running while you are away.
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={onResume} className="px-4 py-2 rounded-xl text-sm font-bold text-wk-black-950" style={{ background: '#FF8A3D' }}>Resume test</button>
            <button onClick={() => { if (window.confirm('Discard this test? Your answers will be lost.')) onDiscard() }}
              className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: '#3A3A3A', color: INK_DIM }}>Discard</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ background: 'linear-gradient(135deg, #1D1A16 0%, #161618 60%)', borderColor: 'rgba(255,138,61,0.35)' }}>
        <div className="p-5 sm:p-6">
          <div className="text-[11px] font-mono tracking-widest" style={{ color: '#FFA94D' }}>FULL MOCK TEST</div>
          <div className="text-xl sm:text-2xl font-black text-white mt-1">{allCount} questions, one paper</div>
          <p className="text-sm mt-1" style={{ color: INK_DIM }}>
            Every question of {set.title} in one timed paper, single-correct first and then numerical, in the exam screen you know.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              [String(effective), 'Questions'],
              [`${Math.round(durationFor(effective) / 60)} min`, 'Time'],
              [String(effective * MARKING.correct), 'Total marks'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}` }}>
                <div className="text-lg sm:text-xl font-black text-white">{v}</div>
                <div className="text-[11px]" style={{ color: INK_DIM }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs" style={{ color: INK_DIM }}>
            +{MARKING.correct} for a right answer, {MARKING.wrong} for a wrong one, 0 if you skip.
            {picked.length > 0 && <> Only {picked.length} chapter{picked.length === 1 ? '' : 's'} selected.</>}
          </div>
          <button disabled={pool === 0}
            onClick={() => onStart(newAttempt(set, { chapters: picked, count: pool, seed: Math.floor(Math.random() * 2 ** 31) }, Date.now()))}
            className="mt-5 w-full sm:w-auto sm:px-10 py-3 rounded-xl text-sm font-bold text-wk-black-950 disabled:opacity-40" style={{ background: '#FF8A3D' }}>
            Start full mock
          </button>
        </div>
        <div style={{ borderTop: `1px solid ${LINE}` }}>
          <button onClick={() => setCustom(o => !o)} aria-expanded={custom} className="w-full flex items-center gap-2 px-5 sm:px-6 py-3 text-xs font-semibold text-left" style={{ color: INK_DIM }}>
            <span>Only some chapters?</span><span className="ml-auto">{custom ? 'Hide' : 'Choose chapters'}</span>
          </button>
          {custom && (
            <div className="px-5 sm:px-6 pb-4">
              <div className="flex flex-wrap gap-2">
                {chapters.map(c => {
                  const on = picked.includes(c)
                  return (
                    <button key={c} onClick={() => toggle(c)} aria-pressed={on}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                      style={{ background: on ? 'rgba(255,138,61,0.15)' : 'transparent', borderColor: on ? '#FF8A3D' : '#3A3A3A', color: on ? '#FFA94D' : INK_DIM }}>
                      {c}
                    </button>
                  )
                })}
              </div>
              {picked.length > 0 && <button onClick={() => setPicked([])} className="mt-2 text-xs underline" style={{ color: INK_DIM }}>Back to the full paper</button>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[11px] font-mono tracking-widest" style={{ color: INK_DIM }}>PAST TESTS</div>
        {history.length === 0 && <div className="text-sm mt-2" style={{ color: INK_DIM }}>No tests yet. Your results will show up here.</div>}
        <div className="mt-2 space-y-2">
          {history.map(a => {
            const r = analyze(set, a)
            return (
              <button key={a.id} onClick={() => onView(a)} className="w-full text-left rounded-xl border p-3 flex items-center gap-3 hover:border-[#55524D]"
                style={{ background: SURFACE, borderColor: LINE }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{r.overall.score}<span style={{ color: INK_DIM }}> / {r.overall.max}</span></div>
                  <div className="text-xs truncate" style={{ color: INK_DIM }}>
                    {new Date(a.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {r.overall.count} questions · {r.overall.accuracy === null ? 'no answers' : `${r.overall.accuracy}% accuracy`}
                  </div>
                </div>
                <span className="text-xs font-semibold" style={{ color: '#FFA94D' }}>View analysis</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------- light exam-style screens */
// The test and its analysis use a light, exam-hall look (white paper, blue actions,
// status shapes) so the screen feels like the real computer-based test.

const L = {
  paper: '#FFFFFF', panel: '#EAF4FB', line: '#D5DDE5', ink: '#1F2933', dim: '#5F6B7A',
  bar: '#2B2E3B', yellow: '#F6C945', blue: '#1F6FD1', blueDark: '#1859A8',
  green: '#1A7F37', red: '#D12B2B', grey: '#6B7280', violet: '#6F4FC4', orange: '#E8892B',
  sec1: '#2B6CD4', sec2: '#C2410C', // categorical slots, validated on light
}
const L_OUTCOME: Record<Outcome, { label: string; icon: string; color: string }> = {
  correct: { label: 'Correct', icon: '✓', color: L.green },
  wrong: { label: 'Wrong', icon: '✕', color: L.red },
  unattempted: { label: 'Not attempted', icon: '–', color: L.grey },
}
const L_SECTION = { mcq: L.sec1, num: L.sec2 } as const

function PaletteShape({ status, label, size = 30, current = false }: { status: PaletteStatus; label: string | number; size?: number; current?: boolean }) {
  const base: React.CSSProperties = { width: size, height: size, fontSize: size * 0.42 }
  let style: React.CSSProperties
  switch (status) {
    case 'notVisited':
      style = { background: '#fff', border: '1px solid #9AA5B1', color: L.ink, borderRadius: 4 }; break
    case 'notAnswered':
      style = { background: L.red, color: '#fff', clipPath: 'polygon(0 0,100% 0,100% 72%,50% 100%,0 72%)' }; break
    case 'answered':
      style = { background: L.green, color: '#fff', clipPath: 'polygon(50% 0,100% 28%,100% 100%,0 100%,0 28%)' }; break
    default:
      style = { background: L.violet, color: '#fff', borderRadius: '50%' }
  }
  if (current) style = { ...style, background: L.orange, color: '#fff', border: 'none' }
  return (
    <span className="inline-flex items-center justify-center font-bold flex-shrink-0 relative" style={{ ...base, ...style }}>
      {label}
      {status === 'answeredMarked' && !current && <span className="absolute -right-0.5 -bottom-0.5 rounded-full" style={{ width: size * 0.34, height: size * 0.34, background: L.green, border: '2px solid #fff' }} />}
    </span>
  )
}

const LEGEND: { status: PaletteStatus; text: string }[] = [
  { status: 'notVisited', text: 'You have not visited the question yet.' },
  { status: 'notAnswered', text: 'You have not answered the question.' },
  { status: 'answered', text: 'You have answered the question.' },
  { status: 'marked', text: 'You have NOT answered the question, but have marked the question for review.' },
  { status: 'answeredMarked', text: 'The question(s) "Answered and Marked for Review" will be considered for evaluation.' },
]

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden" style={{ background: L.paper, color: L.ink }}>{children}</div>
}

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? 'S').toUpperCase()
  return <span className="inline-flex items-center justify-center rounded-md font-bold flex-shrink-0" style={{ width: size, height: size, background: '#C9D6E2', color: '#3C4B5C', fontSize: size * 0.45 }}>{initial}</span>
}

function BlueButton({ children, onClick, disabled, outline }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; outline?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-5 py-2.5 rounded text-sm font-semibold disabled:opacity-40"
      style={outline ? { background: '#fff', border: `1px solid ${L.blue}`, color: L.blue } : { background: L.blue, color: '#fff', border: `1px solid ${L.blue}` }}>
      {children}
    </button>
  )
}

function InstructionsBody({ attempt, kinds }: { attempt: Attempt; kinds: Set<string> }) {
  return (
    <div className="text-sm leading-relaxed space-y-3" style={{ color: L.ink }}>
      <h2 className="text-base font-bold text-center">INSTRUCTIONS TO CANDIDATES</h2>
      <div className="font-bold">General Instructions:</div>
      <ol className="list-decimal pl-5 space-y-2">
        <li>The total duration of this test is <b>{Math.round(attempt.durationSec / 60)} minutes</b> for <b>{attempt.qNums.length} questions</b> ({MINUTES_PER_QUESTION} minutes a question, as in JEE Main). The clock keeps running if you close the page, and you can resume from the same screen.</li>
        <li>The countdown timer at the top of the screen shows the time left. When it reaches zero the test ends and is submitted by itself.</li>
        <li>The question palette at the right of the screen shows the status of each question using one of these symbols:</li>
      </ol>
      <div className="space-y-2 pl-5">
        {LEGEND.map(l => (
          <div key={l.status} className="flex items-center gap-3"><PaletteShape status={l.status} label="" size={28} /> <span>{l.text}</span></div>
        ))}
      </div>
      <div className="font-bold pt-1">Navigating to a question:</div>
      <ol start={4} className="list-decimal pl-5 space-y-2">
        <li>Click a question number in the palette to go straight to it. This does not save the answer of the question you are leaving.</li>
        <li><b>Save &amp; Next</b> saves your answer and moves to the next question. <b>Mark for Review &amp; Next</b> saves it, flags the question to revisit, and moves on. Your answer is also kept the moment you select or type it.</li>
        <li>Press <b>Submit</b> when you are done. You will see a summary first, then your analysis.</li>
      </ol>
      <div className="font-bold pt-1">Answering a question:</div>
      <ol start={7} className="list-decimal pl-5 space-y-2">
        <li><b>Marking:</b> +{MARKING.correct} for a correct answer, {MARKING.wrong.toFixed(1)} for a wrong answer, 0 for a question you leave unanswered.</li>
        {kinds.has('mcq') && <li><b>{SECTION_LABEL.mcq}:</b> each question has 4 options and exactly one is correct. Click an option to select it. Use <b>Clear Response</b> to remove it.</li>}
        {kinds.has('num') && <li><b>{SECTION_LABEL.num}:</b> type the answer as a number in the box shown below the question.</li>}
      </ol>
    </div>
  )
}

function TestInstructions({ set, attempt, candidateName, onBegin, onCancel }: { set: PyqSet; attempt: Attempt; candidateName: string; onBegin: () => void; onCancel: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const kinds = new Set(attempt.qNums.map(n => questionOf(set, n).kind))
  return (
    <Overlay>
      <div className="px-5 py-2.5 text-sm font-semibold" style={{ background: '#CFE6F7', borderBottom: `1px solid ${L.line}` }}>Instructions</div>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 overflow-y-auto px-5 py-5"><InstructionsBody attempt={attempt} kinds={kinds} /></div>
        <aside className="md:w-56 flex-shrink-0 flex md:flex-col items-center gap-3 px-5 py-3 md:py-6" style={{ background: L.panel, borderLeft: `1px solid ${L.line}` }}>
          <Avatar name={candidateName} size={72} />
          <div className="text-sm font-semibold text-center">{candidateName}</div>
        </aside>
      </div>
      <div className="px-5 py-3 space-y-3" style={{ background: '#F5F8FB', borderTop: `1px solid ${L.line}` }}>
        <div className="text-xs font-semibold" style={{ color: L.red }}>All the questions will appear in English language.</div>
        <label className="flex items-start gap-3 text-xs cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4" style={{ accentColor: L.blue }} />
          <span><b>Declaration:</b> I, {candidateName}, have read and understood all the instructions. I will attempt this test on my own, without notes or help.</span>
        </label>
        <div className="flex gap-3 justify-center">
          <BlueButton outline onClick={onCancel}>Back</BlueButton>
          <BlueButton disabled={!agreed} onClick={onBegin}>I am ready to begin</BlueButton>
        </div>
      </div>
    </Overlay>
  )
}

/* ----------------------------------------------------------------- runner */

function TestRunner({ set, initial, candidateName, onFinish }: { set: PyqSet; initial: Attempt; candidateName: string; onFinish: (a: Attempt, endedBy: 'submit' | 'timeout') => void }) {
  const [attempt, setAttempt] = useState<Attempt>(initial)
  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [modal, setModal] = useState<null | 'instructions' | 'paper'>(null)
  const lastTick = useRef(Date.now())
  const idxRef = useRef(0)
  const doneRef = useRef(false)
  const optionsRef = useRef<HTMLDivElement>(null)
  idxRef.current = idx

  const n = attempt.qNums[idx]
  const q = questionOf(set, n)
  const state = attempt.state[n]
  const left = timeLeftSec(attempt, now)

  const patch = useCallback((qn: number, fn: (s: Attempt['state'][number]) => Attempt['state'][number]) => {
    setAttempt(prev => ({ ...prev, state: { ...prev.state, [qn]: fn(prev.state[qn]) } }))
  }, [])

  // Visiting a question marks it visited.
  useEffect(() => { patch(n, s => (s.visited ? s : { ...s, visited: true })) }, [n, patch])

  // One-second clock: counts down from wall-clock time and adds the time spent to the open question.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now()
      const delta = Math.floor((t - lastTick.current) / 1000)
      setNow(t)
      if (delta >= 1) {
        lastTick.current += delta * 1000
        const qn = attempt.qNums[idxRef.current]
        patch(qn, s => ({ ...s, timeSec: s.timeSec + delta }))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [attempt.qNums, patch])

  useEffect(() => { saveActive(attempt) }, [attempt])

  const submit = useCallback((by: 'submit' | 'timeout') => {
    if (doneRef.current) return
    doneRef.current = true
    onFinish(attempt, by)
  }, [attempt, onFinish])

  useEffect(() => { if (left === 0) submit('timeout') }, [left, submit])

  const go = (i: number) => { setIdx(Math.max(0, Math.min(attempt.qNums.length - 1, i))); setPaletteOpen(false) }
  const setResponse = (r: string) => patch(n, s => ({ ...s, response: r }))
  const saveNext = (mark: boolean) => { patch(n, s => ({ ...s, marked: mark })); go(idx + 1) }

  const sectionKinds = (['mcq', 'num'] as const).filter(k => attempt.qNums.some(x => questionOf(set, x).kind === k))
  const counts = statusCounts(set, attempt)
  const urgent = left <= 300
  const kinds = new Set(attempt.qNums.map(x => questionOf(set, x).kind))

  const palette = (
    <div className="flex flex-col h-full" style={{ background: L.panel }}>
      <div className="flex items-center gap-3 p-3">
        <Avatar name={candidateName} size={48} />
        <div className="text-sm font-semibold min-w-0 truncate">{candidateName}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3 text-[11px]">
        {([['answered', 'Answered'], ['notAnswered', 'Not Answered'], ['notVisited', 'Not Visited'], ['marked', 'Marked for Review'], ['answeredMarked', 'Answered & Marked for Review']] as [PaletteStatus, string][]).map(([s, t]) => (
          <div key={s} className="flex items-center gap-2"><PaletteShape status={s} label={counts[s]} size={26} /> <span className="leading-tight">{t}</span></div>
        ))}
      </div>
      <div className="px-3 py-1.5 text-xs font-bold text-white" style={{ background: L.blue }}>{SECTION_LABEL[q.kind]}</div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold mb-2">Choose a Question</div>
        <div className="grid grid-cols-5 gap-2">
          {attempt.qNums.map((qn, i) => {
            const qq = questionOf(set, qn)
            if (qq.kind !== q.kind) return null
            return (
              <button key={qn} onClick={() => go(i)} aria-label={`Question ${i + 1}`} aria-current={i === idx} className="justify-self-center">
                <PaletteShape status={paletteStatus(qq, attempt.state[qn])} label={i + 1} current={i === idx} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="p-3" style={{ borderTop: `1px solid ${L.line}` }}>
        <button onClick={() => setConfirming(true)} className="w-full py-2.5 rounded text-sm font-semibold text-white" style={{ background: L.blue }}>Submit</button>
      </div>
    </div>
  )

  return (
    <Overlay>
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: L.bar }}>
        <div className="font-bold text-sm truncate" style={{ color: L.yellow }}><span className="hidden sm:inline">EDUNITI PYQ </span>MOCK TEST</div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setModal('instructions')} className="px-3 py-1 rounded text-xs font-semibold text-white" style={{ background: '#4A4F63' }}>Instructions</button>
          <button onClick={() => setModal('paper')} className="px-3 py-1 rounded text-xs font-semibold text-white" style={{ background: '#4A4F63' }}>Question Paper</button>
          <button className="md:hidden px-3 py-1 rounded text-xs font-semibold text-white" style={{ background: L.blue }} onClick={() => setPaletteOpen(o => !o)}>Palette</button>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-1.5 text-xs flex-wrap" style={{ background: '#F5F8FB', borderBottom: `1px solid ${L.line}` }}>
        <span className="px-3 py-0.5 rounded-full font-semibold truncate max-w-[55%]" style={{ background: '#D9ECFA', color: L.blueDark }}>{set.title}</span>
        <span className="ml-auto whitespace-nowrap" style={{ color: L.dim }}>
          Qs. Time: {state.timeSec}s &nbsp;|&nbsp; <b aria-live="off" style={{ color: urgent ? L.red : L.ink }}>Time Left: {formatMinSec(left)}</b>
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          {sectionKinds.length > 1 && (
            <div className="flex gap-1 px-4 pt-2 overflow-x-auto" role="tablist">
              {sectionKinds.map(k => {
                const first = attempt.qNums.findIndex(x => questionOf(set, x).kind === k)
                const on = q.kind === k
                return (
                  <button key={k} role="tab" aria-selected={on} onClick={() => go(first)}
                    className="px-4 py-1.5 rounded-t text-xs font-semibold whitespace-nowrap"
                    style={{ background: on ? L.blue : '#E6EDF3', color: on ? '#fff' : L.ink }}>
                    {SECTION_LABEL[k]}
                  </button>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 flex items-center gap-4 text-xs flex-wrap" style={{ borderBottom: `1px solid ${L.line}`, borderTop: sectionKinds.length > 1 ? `2px solid ${L.blue}` : undefined }}>
            <span><b>Question Type:</b> {q.kind === 'mcq' ? 'Single Correct' : 'Numerical'}</span>
            <span className="ml-auto" style={{ color: L.dim }}>Marks for correct answer: <b style={{ color: L.green }}>{MARKING.correct}</b> | Negative Marks: <b style={{ color: L.red }}>{MARKING.wrong.toFixed(1)}</b></span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="rounded border px-3 py-2 text-xs mb-4" style={{ borderColor: L.line, background: '#FAFBFC', color: L.dim }}>
                {q.kind === 'mcq'
                  ? 'This section has single-correct questions. Each question has four options and exactly one is correct.'
                  : 'In this section the answer is a numerical value. Type your answer in the box below the question.'}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-sm font-bold">Question No. {idx + 1}</div>
                <button onClick={() => optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })} aria-label="Jump to the answer options"
                  className="w-6 h-6 rounded flex items-center justify-center text-xs text-white" style={{ background: L.blue }}>↓</button>
              </div>
              <div className="rounded border overflow-hidden bg-white" style={{ borderColor: L.line }}>
                <img key={n} src={questionImageUrl(set, n)} alt={`Question ${idx + 1}`} className="w-full h-auto block" />
              </div>
              <div className="mt-4" ref={optionsRef}>
                {q.kind === 'mcq' ? (
                  <div className="space-y-2" role="radiogroup" aria-label="Options">
                    {['1', '2', '3', '4'].map(o => {
                      const on = state.response === o
                      return (
                        <button key={o} role="radio" aria-checked={on} onClick={() => setResponse(o)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded border text-left text-sm"
                          style={{ background: on ? '#E8F1FC' : '#fff', borderColor: on ? L.blue : L.line }}>
                          <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center" style={{ borderColor: on ? L.blue : '#8A96A3' }}>
                            {on && <span className="w-2 h-2 rounded-full" style={{ background: L.blue }} />}
                          </span>
                          Option ({o})
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs" style={{ color: L.dim }} htmlFor="pyq-num">Type your answer as a number</label>
                    <input id="pyq-num" value={state.response} onChange={e => setResponse(sanitizeNumeric(e.target.value))} inputMode="decimal" autoComplete="off"
                      className="mt-1 w-full max-w-xs px-3 py-2.5 rounded text-base bg-white outline-none border focus:border-[#1F6FD1]"
                      style={{ borderColor: '#9AA5B1', color: L.ink }} />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 py-2.5 flex-wrap" style={{ background: '#F5F8FB', borderTop: `1px solid ${L.line}` }}>
            <button onClick={() => saveNext(true)} className="px-3 sm:px-4 py-2 rounded text-xs sm:text-sm border font-semibold bg-white" style={{ borderColor: '#9AA5B1' }}>Mark for Review &amp; Next</button>
            <button onClick={() => setResponse('')} className="px-3 sm:px-4 py-2 rounded text-xs sm:text-sm border font-semibold bg-white" style={{ borderColor: '#9AA5B1' }}>Clear Response</button>
            <button onClick={() => saveNext(false)} className="ml-auto px-5 sm:px-6 py-2 rounded text-sm font-semibold text-white" style={{ background: L.blue }}>Save &amp; Next</button>
          </div>
        </div>
        <aside className="hidden md:flex w-72 flex-shrink-0 flex-col" style={{ borderLeft: `1px solid ${L.line}` }}>{palette}</aside>
      </div>

      {paletteOpen && (
        <div className="md:hidden absolute inset-0 top-[44px] z-10 flex justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setPaletteOpen(false)}>
          <div className="w-72 max-w-[88%] h-full" onClick={e => e.stopPropagation()}>{palette}</div>
        </div>
      )}

      {modal && (
        <div className="absolute inset-0 z-20 flex flex-col" style={{ background: L.paper }} role="dialog" aria-label={modal === 'instructions' ? 'Instructions' : 'Question paper'}>
          <div className="flex items-center px-5 py-2.5 text-sm font-semibold" style={{ background: '#CFE6F7', borderBottom: `1px solid ${L.line}` }}>
            {modal === 'instructions' ? 'Instructions' : 'Question Paper'}
            <button onClick={() => setModal(null)} className="ml-auto px-3 py-1 rounded text-xs font-semibold text-white" style={{ background: L.blue }}>Back to test</button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {modal === 'instructions' ? <InstructionsBody attempt={attempt} kinds={kinds} /> : (
              <div className="max-w-3xl mx-auto space-y-5">
                {attempt.qNums.map((qn, i) => (
                  <div key={qn}>
                    <div className="text-xs font-bold mb-1">Question No. {i + 1}</div>
                    <div className="rounded border overflow-hidden bg-white" style={{ borderColor: L.line }}>
                      <img src={questionImageUrl(set, qn)} alt={`Question ${i + 1}`} loading="lazy" className="w-full h-auto block" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {confirming && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="w-full max-w-sm rounded-lg border p-5 bg-white" style={{ borderColor: L.line }} role="dialog" aria-label="Submit test">
            <div className="text-base font-bold">Submit your test?</div>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Answered" value={counts.answered + counts.answeredMarked} />
              <Row label="Not answered" value={counts.notAnswered + counts.marked + counts.notVisited} />
              <Row label="Marked for review" value={counts.marked + counts.answeredMarked} />
              <Row label="Time left" value={formatMinSec(left)} />
            </div>
            <p className="text-xs mt-3" style={{ color: L.dim }}>You cannot change anything after you submit.</p>
            <div className="flex gap-3 mt-4">
              <div className="flex-1"><button onClick={() => setConfirming(false)} className="w-full py-2.5 rounded text-sm border font-semibold" style={{ borderColor: L.blue, color: L.blue }}>Keep going</button></div>
              <div className="flex-1"><button onClick={() => submit('submit')} className="w-full py-2.5 rounded text-sm font-semibold text-white" style={{ background: L.blue }}>Submit</button></div>
            </div>
          </div>
        </div>
      )}
    </Overlay>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between"><span style={{ color: L.dim }}>{label}</span><span className="font-bold">{value}</span></div>
}

/* --------------------------------------------------------------- analysis */

type Tab = 'overview' | 'performance' | 'time' | 'attempt' | 'questions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance Analysis' },
  { id: 'time', label: 'Time Analysis' },
  { id: 'attempt', label: 'Attempt Analysis' },
  { id: 'questions', label: 'Qs by Qs Analysis' },
]

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TestAnalysis({ set, attempt, onClose }: { set: PyqSet; attempt: Attempt; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const r = useMemo(() => analyze(set, attempt), [set, attempt])
  return (
    <Overlay>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap" style={{ background: L.bar }}>
        <button onClick={onClose} className="text-xs font-semibold text-white px-2 py-1 rounded" style={{ background: '#4A4F63' }}>← Back</button>
        <div className="font-bold text-sm" style={{ color: L.yellow }}>Test Analysis</div>
        <div className="text-xs text-white/70 truncate hidden sm:block">{set.title}</div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => download('test-analysis.csv', analysisCsv(r))} className="px-3 py-1.5 rounded text-xs font-semibold border border-white/60 text-white">Download Analysis</button>
          {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: L.blue }}>View Solution →</a>}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <nav className="md:w-52 flex-shrink-0 flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto" style={{ background: '#F5F8FB', borderRight: `1px solid ${L.line}` }} role="tablist" aria-label="Analysis sections">
          <div className="hidden md:block text-[11px] font-semibold px-2 pb-2" style={{ color: L.dim }}>Personal</div>
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded text-sm font-semibold text-left whitespace-nowrap flex-shrink-0"
              style={{ background: tab === t.id ? '#D9ECFA' : 'transparent', color: tab === t.id ? L.blueDark : L.ink }}>
              {t.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto p-4 md:p-6" style={{ background: '#FAFBFC' }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-xs mb-3" style={{ color: L.dim }}>
              {new Date(attempt.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {attempt.endedBy === 'timeout' && ' · time ran out'} · {r.overall.count} questions
            </div>
            {tab === 'overview' && <Overview r={r} />}
            {tab === 'performance' && <Performance r={r} />}
            {tab === 'time' && <TimeTab r={r} />}
            {tab === 'attempt' && <AttemptTab r={r} />}
            {tab === 'questions' && <QuestionsTab set={set} r={r} />}
          </div>
        </main>
      </div>
    </Overlay>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 sm:p-5" style={{ background: '#fff', borderColor: L.line, color: L.ink, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
      {title && <div className="text-sm font-bold mb-3">{title}</div>}
      {children}
    </div>
  )
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-3.5 relative overflow-hidden" style={{ background: '#fff', borderColor: L.line, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent ?? L.blue }} />
      <div className="text-xs font-medium" style={{ color: L.dim }}>{label}</div>
      <div className="text-2xl font-black mt-1" style={{ color: L.ink }}>{value}{sub && <span className="text-xs font-semibold" style={{ color: L.dim }}> {sub}</span>}</div>
    </div>
  )
}

/** Accuracy as a ring; the number is always printed in the middle. */
function Ring({ pct, label }: { pct: number | null; label: string }) {
  const r = 44, c = 2 * Math.PI * r, v = pct ?? 0
  return (
    <div className="relative w-28 h-28 flex-shrink-0" role="img" aria-label={`${label}: ${pct === null ? 'n/a' : pct + '%'}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E6EDF3" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={L.green} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-black">{pct === null ? 'n/a' : `${pct}%`}</div>
        <div className="text-[10px]" style={{ color: L.dim }}>{label}</div>
      </div>
    </div>
  )
}

/** Correct / wrong / not attempted as one bar with 2px gaps, each part named and counted below it. */
function OutcomeBar({ correct, wrong, unattempted }: { correct: number; wrong: number; unattempted: number }) {
  const total = correct + wrong + unattempted
  const parts: { o: Outcome; n: number }[] = [{ o: 'correct', n: correct }, { o: 'wrong', n: wrong }, { o: 'unattempted', n: unattempted }]
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={`${correct} correct, ${wrong} wrong, ${unattempted} not attempted`}>
        {parts.filter(p => p.n > 0).map(p => (
          <div key={p.o} title={`${L_OUTCOME[p.o].label}: ${p.n}`} style={{ width: `${(p.n / Math.max(1, total)) * 100}%`, background: L_OUTCOME[p.o].color }} />
        ))}
      </div>
      <div className="flex gap-4 mt-2 text-xs flex-wrap">
        {parts.map(p => <span key={p.o}><span style={{ color: L_OUTCOME[p.o].color }}>{L_OUTCOME[p.o].icon}</span> {L_OUTCOME[p.o].label} <b>{p.n}</b></span>)}
      </div>
    </div>
  )
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#E6EDF3' }} title={label}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

type Col = { name: string; t: Analysis['overall']; color?: string }

function columnsOf(r: Analysis): Col[] {
  return [{ name: 'Overall', t: r.overall }, ...r.bySection.map(s => ({ name: s.label, t: s.tally, color: L_SECTION[s.kind] as string }))]
}

function Overview({ r }: { r: Analysis }) {
  const o = r.overall
  const attempted = o.correct + o.wrong
  const weak = [...r.byChapter].filter(c => c.tally.wrong > 0).sort((x, y) => (x.tally.score - y.tally.score)).slice(0, 4)
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs font-medium" style={{ color: L.dim }}>Your score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl sm:text-6xl font-black" style={{ color: o.score < 0 ? L.red : L.blueDark }}>{o.score}</span>
              <span className="text-xl font-semibold" style={{ color: L.dim }}>/ {o.max}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: L.dim }}>{o.count} questions · +{MARKING.correct} right, {MARKING.wrong} wrong</div>
          </div>
          <Ring pct={o.accuracy} label="accuracy" />
        </div>
        <div className="mt-5"><OutcomeBar correct={o.correct} wrong={o.wrong} unattempted={o.unattempted} /></div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile label="Attempted" value={String(attempted)} sub={`of ${o.count}`} accent={L.blue} />
        <Tile label="Correct" value={String(o.correct)} sub={attempted ? `${o.correct}/${attempted} attempted` : undefined} accent={L.green} />
        <Tile label="Wrong" value={String(o.wrong)} sub={`−${r.lost} marks`} accent={L.red} />
        <Tile label="Positive score" value={String(r.positive)} sub={`of ${o.max}`} accent={L.green} />
        <Tile label="Time taken" value={formatDuration(r.takenSec)} accent={L.orange} />
        <Tile label="Avg per question" value={o.count ? `${Math.round(o.timeSec / Math.max(1, o.count))}s` : 'n/a'} accent={L.orange} />
      </div>
      {r.bySection.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {r.bySection.map(sec => (
            <Card key={sec.kind} title={sec.label}>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{sec.tally.score}</span><span className="text-sm" style={{ color: L.dim }}>/ {sec.tally.max}</span>
                <span className="ml-auto text-xs" style={{ color: L.dim }}>{sec.tally.accuracy === null ? 'no answers' : `${sec.tally.accuracy}% accuracy`}</span>
              </div>
              <div className="mt-3"><OutcomeBar correct={sec.tally.correct} wrong={sec.tally.wrong} unattempted={sec.tally.unattempted} /></div>
            </Card>
          ))}
        </div>
      )}
      {weak.length > 0 && (
        <Card title="Lost the most marks in">
          <div className="flex flex-wrap gap-2">
            {weak.map(c => <span key={c.chapter} className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: L.line, background: '#F5F8FB' }}><span style={{ color: L.red }}>✕ {c.tally.wrong}</span> {c.chapter}</span>)}
          </div>
        </Card>
      )}
    </div>
  )
}

function Performance({ r }: { r: Analysis }) {
  const cols = columnsOf(r)
  const metrics: { label: string; icon?: string; color: string; get: (t: Analysis['overall']) => number; of: (t: Analysis['overall']) => number }[] = [
    { label: 'Total Score', color: L.blue, get: t => t.score, of: t => t.max },
    { label: 'Attempted Correct', icon: '✓', color: L.green, get: t => t.correct, of: t => t.count },
    { label: 'Attempted Wrong', icon: '✕', color: L.red, get: t => t.wrong, of: t => t.count },
    { label: 'Not Attempted', icon: '–', color: L.grey, get: t => t.unattempted, of: t => t.count },
    { label: 'Not Visited', icon: '○', color: L.grey, get: t => t.notVisited, of: t => t.count },
  ]
  return (
    <Card title="Performance Analysis">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[460px]">
          <thead>
            <tr className="text-left text-xs" style={{ color: L.dim }}>
              <th className="py-2 pr-3 font-medium">Metric</th>
              {cols.map(c => <th key={c.name} className="py-2 pr-3 font-medium">{c.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: c.color }} />}{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.label} style={{ borderTop: `1px solid ${L.line}` }}>
                <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{m.icon && <span style={{ color: m.color }}>{m.icon} </span>}{m.label}</td>
                {cols.map(c => {
                  const v = m.get(c.t), of = m.of(c.t)
                  return (
                    <td key={c.name} className="py-2.5 pr-3 min-w-[110px]">
                      <div className="font-bold">{v}<span className="font-normal" style={{ color: L.dim }}> / {of}</span></div>
                      <div className="mt-1"><Bar pct={of ? (Math.max(0, v) / of) * 100 : 0} color={m.color} label={`${m.label}: ${v} of ${of}`} /></div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

type TimeMetric = 'time' | 'attempted' | 'accuracy'

function TimeTab({ r }: { r: Analysis }) {
  const [metric, setMetric] = useState<TimeMetric>('time')
  const cols = columnsOf(r)
  const avg = (v: number | null) => (v === null ? 'n/a' : `${v}s`)
  const slow = r.rows.filter(x => x.timeSec > 0).sort((a, b) => b.timeSec - a.timeSec).slice(0, 5)
  const value = (t: Analysis['overall']) => (metric === 'time' ? t.timeSec : metric === 'attempted' ? t.correct + t.wrong : (t.accuracy ?? 0))
  const label = (t: Analysis['overall']) => (metric === 'time' ? formatDuration(t.timeSec) : metric === 'attempted' ? `${t.correct + t.wrong} / ${t.count}` : t.accuracy === null ? 'n/a' : `${t.accuracy}%`)
  const max = (t: Analysis['overall']) => (metric === 'time' ? 0 : metric === 'attempted' ? t.count : 100)
  const maxTime = Math.max(1, ...r.byChapter.map(c => c.tally.timeSec))
  const pct = (t: Analysis['overall']) => (metric === 'time' ? (value(t) / maxTime) * 100 : max(t) ? (value(t) / max(t)) * 100 : 0)
  return (
    <div className="space-y-4">
      <Card title="Time Analysis">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-left text-xs" style={{ color: L.dim }}>
              <th className="py-2 pr-3 font-medium">Section</th><th className="py-2 pr-3 font-medium">Time Spent</th><th className="py-2 pr-3 font-medium">Questions Attempted</th><th className="py-2 font-medium">Accuracy</th>
            </tr></thead>
            <tbody>
              {cols.map(x => (
                <tr key={x.name} style={{ borderTop: `1px solid ${L.line}` }}>
                  <td className="py-2.5 pr-3 font-semibold">{x.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: x.color }} />}{x.name}</td>
                  <td className="py-2.5 pr-3">{formatDuration(x.t.timeSec)}</td>
                  <td className="py-2.5 pr-3">{x.t.correct + x.t.wrong}<span style={{ color: L.dim }}> / {x.t.count}</span></td>
                  <td className="py-2.5">{x.t.accuracy === null ? 'n/a' : `${x.t.accuracy}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="By chapter">
        <div className="flex gap-1 mb-3" role="tablist">
          {([['time', 'Time Spent'], ['attempted', 'Questions Attempted'], ['accuracy', 'Accuracy']] as [TimeMetric, string][]).map(([id, t]) => (
            <button key={id} role="tab" aria-selected={metric === id} onClick={() => setMetric(id)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ background: metric === id ? L.blue : '#E6EDF3', color: metric === id ? '#fff' : L.ink }}>{t}</button>
          ))}
        </div>
        <div className="space-y-2.5">
          {r.byChapter.map(c => (
            <div key={c.chapter}>
              <div className="flex justify-between text-xs mb-1 gap-3"><span className="truncate">{c.chapter}</span><span className="font-bold flex-shrink-0">{label(c.tally)}</span></div>
              <Bar pct={pct(c.tally)} color={L.sec1} label={`${c.chapter}: ${label(c.tally)}`} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Average time on a question">
        <div className="grid grid-cols-3 gap-3 text-center">
          {(['correct', 'wrong', 'unattempted'] as Outcome[]).map(o => (
            <div key={o}>
              <div className="text-xl font-black">{avg(r.avgSec[o])}</div>
              <div className="text-xs mt-0.5" style={{ color: L_OUTCOME[o].color }}>{L_OUTCOME[o].icon} {L_OUTCOME[o].label}</div>
            </div>
          ))}
        </div>
      </Card>
      {slow.length > 0 && (
        <Card title="Questions that took longest">
          <div className="space-y-2">
            {slow.map(x => (
              <div key={x.n} className="flex items-center gap-3 text-sm">
                <span className="font-mono font-bold" style={{ color: L.blueDark }}>Q{x.index + 1}</span>
                <span className="flex-1 truncate" style={{ color: L.dim }}>{x.chapter}</span>
                <span style={{ color: L_OUTCOME[x.outcome].color }}>{L_OUTCOME[x.outcome].icon} {L_OUTCOME[x.outcome].label}</span>
                <span className="font-bold w-14 text-right">{formatDuration(x.timeSec)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function AttemptTab({ r }: { r: Analysis }) {
  const rows = [...r.byChapter].sort((a, b) => (a.tally.accuracy ?? -1) - (b.tally.accuracy ?? -1))
  const weak = rows.filter(c => c.tally.wrong > 0 || c.tally.unattempted === c.tally.count)
  return (
    <div className="space-y-4">
      {weak.length > 0 && (
        <Card title="Worth revisiting">
          <div className="text-xs mb-2" style={{ color: L.dim }}>Chapters where you lost marks or skipped everything.</div>
          <div className="flex flex-wrap gap-2">
            {weak.map(c => <span key={c.chapter} className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: L.line, background: '#F5F8FB' }}>{c.chapter}</span>)}
          </div>
        </Card>
      )}
      <Card title="Chapter by chapter">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-xs" style={{ color: L.dim }}>
              <th className="py-2 pr-3 font-medium">Chapter</th><th className="py-2 pr-3 font-medium">Score</th><th className="py-2 pr-3 font-medium">✓ Correct</th><th className="py-2 pr-3 font-medium">✕ Wrong</th><th className="py-2 pr-3 font-medium">– Skipped</th><th className="py-2 font-medium">Accuracy</th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.chapter} style={{ borderTop: `1px solid ${L.line}` }}>
                  <td className="py-2.5 pr-3 font-semibold">{c.chapter}</td>
                  <td className="py-2.5 pr-3">{c.tally.score}<span style={{ color: L.dim }}> / {c.tally.max}</span></td>
                  <td className="py-2.5 pr-3">{c.tally.correct}</td><td className="py-2.5 pr-3">{c.tally.wrong}</td><td className="py-2.5 pr-3">{c.tally.unattempted}</td>
                  <td className="py-2.5">{c.tally.accuracy === null ? 'n/a' : `${c.tally.accuracy}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function QuestionsTab({ set, r }: { set: PyqSet; r: Analysis }) {
  const [filter, setFilter] = useState<'all' | Outcome>('all')
  const [open, setOpen] = useState<number | null>(null)
  const list = r.rows.filter(x => filter === 'all' || x.outcome === filter)
  const fmt = (kind: 'mcq' | 'num', v: string | number) => (kind === 'mcq' ? `(${v})` : String(v))
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {(['all', 'correct', 'wrong', 'unattempted'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 rounded text-xs font-semibold"
            style={{ background: filter === f ? L.blue : '#E6EDF3', color: filter === f ? '#fff' : L.ink }}>
            {f === 'all' ? 'All' : L_OUTCOME[f].label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {list.map(x => {
          const isOpen = open === x.n
          return (
            <div key={x.n} className="rounded-lg border bg-white" style={{ borderColor: L.line }}>
              <button onClick={() => setOpen(isOpen ? null : x.n)} aria-expanded={isOpen} className="w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm">
                <span className="font-mono font-bold w-9" style={{ color: L.blueDark }}>Q{x.index + 1}</span>
                <span className="flex-1 min-w-0 truncate text-xs" style={{ color: L.dim }}>{x.chapter}</span>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: L_OUTCOME[x.outcome].color }}>{L_OUTCOME[x.outcome].icon} {L_OUTCOME[x.outcome].label}</span>
                <span className="text-xs font-bold w-8 text-right flex-shrink-0">{x.marks > 0 ? `+${x.marks}` : x.marks}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="text-xs flex gap-4 flex-wrap mb-2">
                    <span>Your answer: <b>{isAnswered(questionOf(set, x.n), x.response) ? fmt(x.kind, x.response) : 'none'}</b></span>
                    <span>Correct: <b style={{ color: L.green }}>{fmt(x.kind, x.answer)}</b></span>
                    <span>Time: <b>{formatDuration(x.timeSec)}</b></span>
                    {x.marked && <span style={{ color: L.violet }}>Marked for review</span>}
                  </div>
                  <div className="rounded border overflow-hidden bg-white" style={{ borderColor: L.line }}><img src={questionImageUrl(set, x.n)} alt={`Question ${x.index + 1}`} loading="lazy" className="w-full h-auto block" /></div>
                  {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs underline" style={{ color: L.blueDark }}>Video solution</a>}
                </div>
              )}
            </div>
          )
        })}
        {list.length === 0 && <div className="text-sm text-center py-8" style={{ color: L.dim }}>Nothing in this view.</div>}
      </div>
    </div>
  )
}
