/* ============================================================
   pyqTest.ts

   Mock-test logic for the Eduniti Top PYQs page: building a test from a
   PyqSet, tracking an attempt (answers, review marks, time per question),
   NTA-style marking and the numbers behind the analysis screens.
   Pure logic and localStorage helpers, no React.

   Marking follows JEE Main: +4 for a correct answer, -1 for a wrong one,
   0 when left unanswered. Change MARKING if a set needs another scheme.
   ============================================================ */

import { parseNumeric, type PyqKind, type PyqQuestion, type PyqSet } from './edunitiPyqs'

export const MARKING = { correct: 4, wrong: -1 } as const
/** JEE Main gives 180 minutes for 75 questions: 2.4 minutes each. */
export const MINUTES_PER_QUESTION = 2.4
export const COUNT_CHOICES = [10, 25, 50, 75] as const

export const SECTION_LABEL: Record<PyqKind, string> = { mcq: 'Physics Single Correct', num: 'Physics Numerical' }

export interface QState {
  response: string
  marked: boolean
  visited: boolean
  timeSec: number
}

export interface Attempt {
  id: string
  setId: string
  /** Question numbers in test order: single-correct first, then numerical. */
  qNums: number[]
  state: Record<number, QState>
  startedAt: number
  durationSec: number
  submittedAt: number | null
  endedBy: 'submit' | 'timeout' | null
}

/* ---------- building a test ---------- */

/** Small seeded generator so a test can be rebuilt from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface TestConfig {
  /** Chapters to draw from; empty means every chapter. */
  chapters: string[]
  count: number
  seed: number
}

export function questionPool(set: PyqSet, chapters: string[]): PyqQuestion[] {
  return chapters.length === 0 ? set.questions.slice() : set.questions.filter(q => chapters.includes(q.chapter))
}

export function durationFor(count: number): number {
  return Math.max(5, Math.round(count * MINUTES_PER_QUESTION)) * 60
}

export function buildTest(set: PyqSet, cfg: TestConfig): number[] {
  const rand = mulberry32(cfg.seed)
  const picked = shuffled(questionPool(set, cfg.chapters), rand).slice(0, Math.max(0, cfg.count))
  return [...picked.filter(q => q.kind === 'mcq'), ...picked.filter(q => q.kind === 'num')].map(q => q.n)
}

export function newAttempt(set: PyqSet, cfg: TestConfig, now: number): Attempt {
  const qNums = buildTest(set, cfg)
  const state: Record<number, QState> = {}
  for (const n of qNums) state[n] = { response: '', marked: false, visited: false, timeSec: 0 }
  return {
    id: `${set.id}-${now}`, setId: set.id, qNums, state,
    startedAt: now, durationSec: durationFor(qNums.length), submittedAt: null, endedBy: null,
  }
}

export function timeLeftSec(a: Attempt, now: number): number {
  return Math.max(0, a.durationSec - Math.floor((now - a.startedAt) / 1000))
}

/* ---------- answering ---------- */

/** Keeps only what a numerical answer can contain, while typing. */
export function sanitizeNumeric(input: string): string {
  return input.replace(/[^0-9.-]/g, '').slice(0, 12)
}

export function isAnswered(q: PyqQuestion, response: string): boolean {
  return q.kind === 'mcq' ? /^[1-4]$/.test(response) : parseNumeric(response) !== null
}

export type PaletteStatus = 'notVisited' | 'notAnswered' | 'answered' | 'marked' | 'answeredMarked'

export function paletteStatus(q: PyqQuestion, s: QState): PaletteStatus {
  if (!s.visited) return 'notVisited'
  const answered = isAnswered(q, s.response)
  if (s.marked) return answered ? 'answeredMarked' : 'marked'
  return answered ? 'answered' : 'notAnswered'
}

export function statusCounts(set: PyqSet, a: Attempt): Record<PaletteStatus, number> {
  const out: Record<PaletteStatus, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 }
  for (const n of a.qNums) out[paletteStatus(questionOf(set, n), a.state[n])]++
  return out
}

export function questionOf(set: PyqSet, n: number): PyqQuestion {
  const q = set.questions.find(x => x.n === n)
  if (!q) throw new Error(`Question ${n} is not in set ${set.id}`)
  return q
}

/* ---------- marking and analysis ---------- */

export type Outcome = 'correct' | 'wrong' | 'unattempted'

export function outcomeOf(q: PyqQuestion, response: string): Outcome {
  if (!isAnswered(q, response)) return 'unattempted'
  return checkValue(q, response) ? 'correct' : 'wrong'
}

function checkValue(q: PyqQuestion, response: string): boolean {
  if (q.kind === 'mcq') return Number(response) === q.answer
  const v = parseNumeric(response)
  return v !== null && Math.abs(v - q.answer) < 1e-9
}

export function marksFor(outcome: Outcome): number {
  return outcome === 'correct' ? MARKING.correct : outcome === 'wrong' ? MARKING.wrong : 0
}

export interface QuestionRow {
  n: number
  index: number
  kind: PyqKind
  chapter: string
  response: string
  outcome: Outcome
  marks: number
  timeSec: number
  marked: boolean
  visited: boolean
  answer: number
}

export interface Tally {
  count: number
  correct: number
  wrong: number
  unattempted: number
  /** Questions never opened (a subset of unattempted). */
  notVisited: number
  score: number
  max: number
  timeSec: number
  /** Share of attempted questions answered correctly, or null when none were attempted. */
  accuracy: number | null
}

function emptyTally(): Tally {
  return { count: 0, correct: 0, wrong: 0, unattempted: 0, notVisited: 0, score: 0, max: 0, timeSec: 0, accuracy: null }
}

function addRow(t: Tally, r: QuestionRow) {
  t.count++
  t[r.outcome]++
  if (!r.visited) t.notVisited++
  t.score += r.marks
  t.max += MARKING.correct
  t.timeSec += r.timeSec
}

function finish(t: Tally): Tally {
  const attempted = t.correct + t.wrong
  t.accuracy = attempted === 0 ? null : Math.round((t.correct / attempted) * 1000) / 10
  return t
}

export interface Analysis {
  rows: QuestionRow[]
  overall: Tally
  /** Marks gained from correct answers and marks lost to wrong ones (a positive number). */
  positive: number
  lost: number
  /** Wall-clock time from start to finish. */
  takenSec: number
  bySection: { kind: PyqKind; label: string; tally: Tally }[]
  byChapter: { chapter: string; tally: Tally }[]
  /** Average seconds on the questions answered right / wrong / left. */
  avgSec: { correct: number | null; wrong: number | null; unattempted: number | null }
}

export function analyze(set: PyqSet, a: Attempt): Analysis {
  const rows: QuestionRow[] = a.qNums.map((n, index) => {
    const q = questionOf(set, n)
    const s = a.state[n]
    const outcome = outcomeOf(q, s.response)
    return {
      n, index, kind: q.kind, chapter: q.chapter, response: s.response, outcome,
      marks: marksFor(outcome), timeSec: s.timeSec, marked: s.marked, visited: s.visited, answer: q.answer,
    }
  })
  const overall = emptyTally()
  const sections = new Map<PyqKind, Tally>()
  const chapters = new Map<string, Tally>()
  for (const r of rows) {
    addRow(overall, r)
    if (!sections.has(r.kind)) sections.set(r.kind, emptyTally())
    addRow(sections.get(r.kind)!, r)
    if (!chapters.has(r.chapter)) chapters.set(r.chapter, emptyTally())
    addRow(chapters.get(r.chapter)!, r)
  }
  const avg = (o: Outcome) => {
    const xs = rows.filter(r => r.outcome === o)
    return xs.length === 0 ? null : Math.round(xs.reduce((s, r) => s + r.timeSec, 0) / xs.length)
  }
  const end = a.submittedAt ?? a.startedAt
  return {
    rows,
    overall: finish(overall),
    positive: overall.correct * MARKING.correct,
    lost: overall.wrong * -MARKING.wrong,
    takenSec: Math.max(0, Math.round((end - a.startedAt) / 1000)),
    bySection: (['mcq', 'num'] as PyqKind[]).filter(k => sections.has(k)).map(k => ({ kind: k, label: SECTION_LABEL[k], tally: finish(sections.get(k)!) })),
    byChapter: [...chapters.entries()].map(([chapter, tally]) => ({ chapter, tally: finish(tally) })),
    avgSec: { correct: avg('correct'), wrong: avg('wrong'), unattempted: avg('unattempted') },
  }
}

/** "179:35": whole minutes and seconds, the way exam timers show time left. */
export function formatMinSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One row per question, for "Download analysis". */
export function analysisCsv(r: Analysis): string {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const head = ['Q.No', 'Section', 'Chapter', 'Your answer', 'Correct answer', 'Result', 'Marks', 'Time (s)', 'Marked for review']
  const body = r.rows.map(x => [x.index + 1, SECTION_LABEL[x.kind], x.chapter, x.response || '-', x.answer,
    x.outcome === 'unattempted' ? (x.visited ? 'Not answered' : 'Not visited') : x.outcome === 'correct' ? 'Correct' : 'Wrong',
    x.marks, x.timeSec, x.marked ? 'Yes' : 'No'])
  return [head, ...body].map(row => row.map(esc).join(',')).join('\n')
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`
}

/* ---------- storage ---------- */

const ACTIVE_KEY = 'wynko.pyqtest.active'
const historyKey = (setId: string) => `wynko.pyqtest.history.${setId}`
export const HISTORY_LIMIT = 20

type ReadStore = Pick<Storage, 'getItem'>
type WriteStore = Pick<Storage, 'setItem' | 'removeItem'>

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function isAttempt(v: any): v is Attempt {
  if (!v || typeof v !== 'object') return false
  if (typeof v.id !== 'string' || typeof v.setId !== 'string') return false
  if (!Array.isArray(v.qNums) || !v.qNums.every((n: any) => Number.isInteger(n))) return false
  if (typeof v.startedAt !== 'number' || typeof v.durationSec !== 'number') return false
  if (!v.state || typeof v.state !== 'object') return false
  return v.qNums.every((n: number) => {
    const s = v.state[n]
    return s && typeof s.response === 'string' && typeof s.marked === 'boolean' && typeof s.visited === 'boolean' && typeof s.timeSec === 'number'
  })
}

function parseAttempt(raw: string | null): Attempt | null {
  if (!raw) return null
  try { const v = JSON.parse(raw); return isAttempt(v) ? v : null } catch { return null }
}

export function loadActive(storage: ReadStore | null = safeStorage()): Attempt | null {
  try { return parseAttempt(storage?.getItem(ACTIVE_KEY) ?? null) } catch { return null }
}
export function saveActive(a: Attempt, storage: WriteStore | null = safeStorage()): void {
  try { storage?.setItem(ACTIVE_KEY, JSON.stringify(a)) } catch { /* storage blocked or full */ }
}
export function clearActive(storage: WriteStore | null = safeStorage()): void {
  try { storage?.removeItem(ACTIVE_KEY) } catch { /* storage blocked */ }
}

export function loadHistory(setId: string, storage: ReadStore | null = safeStorage()): Attempt[] {
  try {
    const raw = storage?.getItem(historyKey(setId))
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(isAttempt) : []
  } catch { return [] }
}

/** Adds a finished attempt at the front, keeping the newest HISTORY_LIMIT. */
export function saveToHistory(a: Attempt, storage: (ReadStore & WriteStore) | null = safeStorage()): Attempt[] {
  const next = [a, ...loadHistory(a.setId, storage).filter(x => x.id !== a.id)].slice(0, HISTORY_LIMIT)
  try { storage?.setItem(historyKey(a.setId), JSON.stringify(next)) } catch { /* storage blocked or full */ }
  return next
}
