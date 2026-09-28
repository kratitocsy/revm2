import { describe, expect, it } from 'vitest'
import { restDays, dayGroups, daysLabel, fillSubjectDays, isWynkyPlanName, parseDaysValue, daysValue, planNameFor } from './wynkyDays'

const subjects = ['Physics', 'Chemistry', 'Maths']

describe('daysLabel', () => {
  it('names common day sets', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(daysLabel([5, 4, 3, 2, 1])).toBe('Mon–Fri')
    expect(daysLabel([0, 6])).toBe('Sat, Sun')
    expect(daysLabel([5, 1, 3])).toBe('Mon Wed Fri')
    expect(daysLabel([0, 1])).toBe('Mon Sun')
  })
})

describe('fillSubjectDays', () => {
  it('spreads open subjects evenly and leaves no empty day', () => {
    const out = fillSubjectDays(subjects, {})
    const perDay = [0, 1, 2, 3, 4, 5, 6].map(d => subjects.filter(s => out[s].includes(d)).length)
    expect(Math.min(...perDay)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...perDay) - Math.min(...perDay)).toBeLessThanOrEqual(1)
    for (const s of subjects) expect(out[s].length).toBeGreaterThanOrEqual(2)
  })

  it('alternates two subjects instead of repeating both daily', () => {
    const out = fillSubjectDays(['Physics', 'Maths'], {})
    for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(Number(out.Physics.includes(d)) + Number(out.Maths.includes(d))).toBe(1)
  })

  it('keeps what the student chose and fills around it', () => {
    const out = fillSubjectDays(subjects, { Physics: [1, 3, 5] })
    expect(out.Physics).toEqual([1, 3, 5])
    for (const d of [0, 2, 4, 6]) expect(subjects.some(s => out[s].includes(d))).toBe(true)
  })

  it('spaces a subject out across the week', () => {
    const out = fillSubjectDays(['A', 'B', 'C', 'D', 'E', 'F', 'G'], {})
    for (const days of Object.values(out)) {
      expect(days.length).toBe(3)
      // Never three days in a row.
      expect(days.some((d, i) => i >= 2 && days[i - 1] === d - 1 && days[i - 2] === d - 2)).toBe(false)
    }
  })

  it('gives an empty day to a subject Wynky placed, never one the student placed', () => {
    const out = fillSubjectDays(['Physics', 'Maths', 'Chemistry'], { Physics: [1, 2], Maths: [3] })
    expect(out.Physics).toEqual([1, 2])
    expect(out.Maths).toEqual([3])
    for (const d of [4, 5, 6, 0]) expect(out.Chemistry.includes(d)).toBe(true)
  })

  it('keeps a day the student left empty as a rest day', () => {
    const out = fillSubjectDays(['Physics', 'Maths'], { Physics: [1, 3, 5], Maths: [2, 4, 6] })
    expect([...out.Physics, ...out.Maths]).not.toContain(0)
    const g = dayGroups({ structure: 'split', subjects: ['Physics', 'Maths'], busy: [], subjectDays: { Physics: [1, 3, 5], Maths: [2, 4, 6] } })
    expect(restDays(g)).toEqual([0])
  })
})

describe('dayGroups', () => {
  it('is one group for the same plan every day', () => {
    const g = dayGroups({ structure: 'same', subjects, busy: ['16:00-19:00'], subjectDays: {} })
    expect(g).toHaveLength(1)
    expect(g[0].days).toHaveLength(7)
    expect(g[0].busy).toEqual(['16:00-19:00'])
  })

  it('frees weekends from busy times on a weekdays-vs-weekend plan', () => {
    const g = dayGroups({ structure: 'weekend', subjects, busy: ['09:00-16:00'], subjectDays: {} })
    expect(g.map(x => x.label)).toEqual(['Mon–Fri', 'Sat, Sun'])
    expect(g[1].busy).toEqual([])
    expect(g[0].subjects).toEqual(subjects)
  })

  it('merges weekends back in when there are no busy times', () => {
    expect(dayGroups({ structure: 'weekend', subjects, busy: [], subjectDays: {} })).toHaveLength(1)
  })

  it('groups days that share subjects on a split plan', () => {
    const g = dayGroups({
      structure: 'split', subjects: ['Physics', 'Maths'], busy: [],
      subjectDays: { Physics: [1, 3, 5], Maths: [2, 4, 6, 0] },
    })
    expect(g.map(x => [x.label, x.subjects.join('+')])).toEqual([['Mon Wed Fri', 'Physics'], ['Tue Thu Sat Sun', 'Maths']])
    const all = g.flatMap(x => x.days).sort()
    expect(all).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('never has a day in two groups', () => {
    const g = dayGroups({ structure: 'split', subjects: ['A', 'B', 'C', 'D'], busy: ['16:00-19:00'], subjectDays: {} })
    const all = g.flatMap(x => x.days)
    expect(new Set(all).size).toBe(7)
    expect(all).toHaveLength(7)
    // Only a weekdays-vs-weekend plan frees the weekend.
    for (const x of g) expect(x.busy).toEqual(['16:00-19:00'])
  })
})

describe('names and values', () => {
  it('keeps the plain name for one day type', () => {
    const [one] = dayGroups({ structure: 'same', subjects, busy: [], subjectDays: {} })
    expect(planNameFor(one, 1)).toBe('Wynky Plan')
    expect(planNameFor({ ...one, days: [1, 3, 5] }, 2)).toBe('Wynky Plan · Mon Wed Fri')
    expect(isWynkyPlanName('Wynky Plan · Sat, Sun')).toBe(true)
    expect(isWynkyPlanName('Wynky Plans')).toBe(false)
  })

  it('round-trips subject days', () => {
    expect(parseDaysValue(daysValue([5, 1, 3]))).toEqual([1, 3, 5])
    expect(parseDaysValue('1,9')).toBeNull()
    expect(parseDaysValue('')).toBeNull()
  })
})
