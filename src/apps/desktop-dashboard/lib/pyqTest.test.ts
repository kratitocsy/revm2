import { describe, expect, it } from 'vitest'
import { JEE_MAIN_2023_TOP_200 as set } from './edunitiPyqs'
import {
  MARKING, analyze, buildTest, clearActive, durationFor, formatDuration, isAttempt, loadActive, loadHistory,
  marksFor, mulberry32, newAttempt, outcomeOf, paletteStatus, questionOf, sanitizeNumeric, saveActive,
  saveToHistory, statusCounts, timeLeftSec, HISTORY_LIMIT, type Attempt,
} from './pyqTest'

const fakeStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const cfg = { chapters: [] as string[], count: 25, seed: 7 }

describe('buildTest', () => {
  it('is repeatable for a seed and differs across seeds', () => {
    expect(buildTest(set, cfg)).toEqual(buildTest(set, cfg))
    expect(buildTest(set, cfg)).not.toEqual(buildTest(set, { ...cfg, seed: 8 }))
  })
  it('picks the requested number of distinct questions, single-correct before numerical', () => {
    const t = buildTest(set, cfg)
    expect(t).toHaveLength(25)
    expect(new Set(t).size).toBe(25)
    const kinds = t.map(n => questionOf(set, n).kind)
    const firstNum = kinds.indexOf('num')
    if (firstNum >= 0) expect(kinds.slice(firstNum).every(k => k === 'num')).toBe(true)
  })
  it('draws only from the chosen chapters and never more than they hold', () => {
    const t = buildTest(set, { chapters: ['Capacitors', 'Wave Optics'], count: 75, seed: 1 })
    expect(t).toHaveLength(14) // 6 + 8
    expect(t.every(n => ['Capacitors', 'Wave Optics'].includes(questionOf(set, n).chapter))).toBe(true)
  })
  it('mulberry32 stays in [0,1)', () => {
    const r = mulberry32(42)
    for (let i = 0; i < 1000; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1) }
  })
})

describe('durationFor', () => {
  it('uses 2.4 minutes a question, with a 5 minute floor', () => {
    expect(durationFor(75)).toBe(180 * 60)
    expect(durationFor(25)).toBe(60 * 60)
    expect(durationFor(1)).toBe(5 * 60)
  })
})

describe('answering and marking', () => {
  it('sanitizes numeric typing', () => {
    expect(sanitizeNumeric('12a.5-')).toBe('12.5-')
    expect(sanitizeNumeric('1234567890123456')).toHaveLength(12)
  })
  it('scores +4 / -1 / 0', () => {
    const mcq = questionOf(set, 1) // answer 4
    const num = questionOf(set, 3) // answer 41
    expect(outcomeOf(mcq, '4')).toBe('correct')
    expect(outcomeOf(mcq, '2')).toBe('wrong')
    expect(outcomeOf(mcq, '')).toBe('unattempted')
    expect(outcomeOf(num, '41')).toBe('correct')
    expect(outcomeOf(num, '41.0')).toBe('correct')
    expect(outcomeOf(num, '-')).toBe('unattempted')
    expect(marksFor('correct')).toBe(MARKING.correct)
    expect(marksFor('wrong')).toBe(MARKING.wrong)
    expect(marksFor('unattempted')).toBe(0)
  })
  it('works out palette statuses', () => {
    const q = questionOf(set, 1)
    const s = { response: '', marked: false, visited: false, timeSec: 0 }
    expect(paletteStatus(q, s)).toBe('notVisited')
    expect(paletteStatus(q, { ...s, visited: true })).toBe('notAnswered')
    expect(paletteStatus(q, { ...s, visited: true, response: '3' })).toBe('answered')
    expect(paletteStatus(q, { ...s, visited: true, marked: true })).toBe('marked')
    expect(paletteStatus(q, { ...s, visited: true, marked: true, response: '3' })).toBe('answeredMarked')
  })
})

function sample(): Attempt {
  const a = newAttempt(set, { chapters: ['Units, Dimensions, Errors & Vectors'], count: 8, seed: 3 }, 1_000_000)
  // Q1 mcq(4), Q2 num(4), Q3 num(41), Q4 num(220), Q5 mcq(3), Q6 mcq(1), Q7 mcq(1), Q8 mcq(1)
  const put = (n: number, response: string, timeSec: number, marked = false) => { a.state[n] = { response, marked, visited: true, timeSec } }
  put(1, '4', 60); put(2, '5', 30); put(3, '41', 90, true); put(5, '3', 20); put(6, '2', 45)
  a.state[4].visited = true
  a.submittedAt = a.startedAt + 400_000; a.endedBy = 'submit'
  return a
}

describe('analyze', () => {
  const a = sample()
  const r = analyze(set, a)
  it('tallies right, wrong and left questions', () => {
    expect(r.overall.count).toBe(8)
    expect(r.overall.correct).toBe(3) // 1, 3, 5
    expect(r.overall.wrong).toBe(2) // 2, 6
    expect(r.overall.unattempted).toBe(3) // 4, 7, 8
    expect(r.overall.score).toBe(3 * 4 - 2)
    expect(r.overall.max).toBe(32)
    expect(r.positive).toBe(12)
    expect(r.lost).toBe(2)
    expect(r.overall.accuracy).toBe(60)
  })
  it('splits by section and chapter', () => {
    expect(r.bySection.map(s => s.kind)).toEqual(['mcq', 'num'])
    expect(r.bySection.reduce((s, x) => s + x.tally.count, 0)).toBe(8)
    expect(r.byChapter).toHaveLength(1)
    expect(r.byChapter[0].tally.score).toBe(r.overall.score)
  })
  it('measures time', () => {
    expect(r.takenSec).toBe(400)
    expect(r.overall.timeSec).toBe(245)
    expect(r.avgSec.correct).toBe(57) // (60+90+20)/3
    expect(r.avgSec.wrong).toBe(38) // (30+45)/2 = 37.5
  })
  it('has null accuracy when nothing was attempted', () => {
    const blank = newAttempt(set, cfg, 0)
    expect(analyze(set, blank).overall.accuracy).toBeNull()
    expect(analyze(set, blank).avgSec.correct).toBeNull()
  })
  it('counts palette statuses', () => {
    const c = statusCounts(set, a)
    expect(c.answered).toBe(4)
    expect(c.answeredMarked).toBe(1)
    expect(c.notAnswered).toBe(1)
    expect(c.notVisited).toBe(2)
    expect(Object.values(c).reduce((s, x) => s + x, 0)).toBe(8)
  })
})

describe('timer and formatting', () => {
  it('counts down from the start and stops at zero', () => {
    const a = newAttempt(set, cfg, 1000)
    expect(timeLeftSec(a, 1000)).toBe(a.durationSec)
    expect(timeLeftSec(a, 1000 + 61_000)).toBe(a.durationSec - 61)
    expect(timeLeftSec(a, 1000 + 99_999_999)).toBe(0)
  })
  it('formats durations', () => {
    expect(formatDuration(59)).toBe('00:59')
    expect(formatDuration(61)).toBe('01:01')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})

describe('storage', () => {
  it('round-trips the active attempt and clears it', () => {
    const st = fakeStore(); const a = sample()
    saveActive(a, st)
    expect(loadActive(st)).toEqual(a)
    clearActive(st)
    expect(loadActive(st)).toBeNull()
  })
  it('rejects malformed saved data', () => {
    const st = fakeStore()
    st.setItem('wynko.pyqtest.active', '{oops')
    expect(loadActive(st)).toBeNull()
    st.setItem('wynko.pyqtest.active', JSON.stringify({ id: 'x', setId: 'y', qNums: [1], startedAt: 1, durationSec: 1, state: {} }))
    expect(loadActive(st)).toBeNull()
    expect(isAttempt(null)).toBe(false)
  })
  it('keeps the newest attempts first, replaces a repeat save and caps the list', () => {
    const st = fakeStore()
    const base = sample()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) saveToHistory({ ...base, id: `a${i}` }, st)
    const h = loadHistory(set.id, st)
    expect(h).toHaveLength(HISTORY_LIMIT)
    expect(h[0].id).toBe(`a${HISTORY_LIMIT + 4}`)
    saveToHistory({ ...base, id: `a${HISTORY_LIMIT + 4}`, endedBy: 'timeout' }, st)
    const h2 = loadHistory(set.id, st)
    expect(h2).toHaveLength(HISTORY_LIMIT)
    expect(h2[0].endedBy).toBe('timeout')
  })
  it('does not throw without storage', () => {
    expect(loadActive(null)).toBeNull()
    expect(loadHistory('x', null)).toEqual([])
    expect(() => saveActive(sample(), null)).not.toThrow()
  })
})

describe('analysis extras', () => {
  it('counts questions never opened and writes a CSV row per question', async () => {
    const { analysisCsv, formatMinSec } = await import('./pyqTest')
    const a = sample()
    const r = analyze(set, a)
    expect(r.overall.notVisited).toBe(2) // 7 and 8 were never opened
    const csv = analysisCsv(r).split('\n')
    expect(csv).toHaveLength(9)
    expect(csv[0]).toContain('Q.No')
    expect(csv.filter(l => l.includes('Not visited'))).toHaveLength(2)
    expect(formatMinSec(179 * 60 + 35)).toBe('179:35')
    expect(formatMinSec(5)).toBe('0:05')
  })
})
