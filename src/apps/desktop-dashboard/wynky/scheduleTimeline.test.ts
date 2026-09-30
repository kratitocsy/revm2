import { describe, it, expect } from 'vitest'
import { buildTimeline, slotsByDay, type Slot } from './scheduleTimeline'
import { planTimelineDays, formatRecommendedPlan, formatWeeklyPlan } from './wynkyChatFlow'
import type { GeneratorResult } from '../../_shared/scheduleGenerator'

const slot = (start_time: string, end_time: string, subject: string): Slot => ({ start_time, end_time, subject })
const kinds = (rows: ReturnType<typeof buildTimeline>) => rows.map(r => `${r.kind}:${r.label}`)

describe('buildTimeline', () => {
  it('runs from wake to sleep with study, breaks and the student\'s meals', () => {
    const rows = buildTimeline(
      [slot('09:00', '10:00', 'Physics'), slot('10:10', '11:10', 'Maths'), slot('16:00', '17:00', 'Chemistry')],
      { wake: '07:30', sleep: '22:30', lunch: '13:00-13:45', dinner: '20:00-20:45', busy: ['11:30-12:30'] },
    )
    expect(kinds(rows)).toEqual([
      'wake:Wake up', 'break:Get ready',
      'study:Physics', 'break:Break', 'study:Maths', 'break:Break',
      'busy:Busy', 'break:Break', 'meal:Lunch', 'free:Free time',
      'study:Chemistry', 'free:Free time', 'meal:Dinner', 'free:Free time', 'sleep:Sleep',
    ])
    expect(rows.find(r => r.label === 'Lunch')).toMatchObject({ start: 13 * 60, end: 13 * 60 + 45 })
  })

  it('guesses meal times only when the student gave none, and never twice', () => {
    const rows = buildTimeline([slot('09:00', '10:00', 'Physics')], { wake: '07:00', sleep: '23:00' })
    expect(rows.filter(r => r.kind === 'meal').map(r => r.label)).toEqual(['Lunch', 'Dinner'])
    const told = buildTimeline([slot('09:00', '10:00', 'Physics')], { wake: '07:00', sleep: '23:00', lunch: '14:00-14:30' })
    expect(told.filter(r => r.label === 'Lunch')).toHaveLength(1)
    expect(told.find(r => r.label === 'Lunch')).toMatchObject({ start: 14 * 60, end: 14 * 60 + 30 })
  })

  it('puts sleep after midnight when bedtime is before wake time', () => {
    const rows = buildTimeline([slot('20:00', '22:00', 'Physics')], { wake: '06:00', sleep: '00:30' })
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'sleep', start: 24 * 60 + 30 })
  })

  it('works with no wake or sleep time', () => {
    expect(kinds(buildTimeline([slot('09:00', '10:00', 'Physics')], {}))).toEqual(['study:Physics'])
  })
})

describe('slotsByDay', () => {
  it('expands "all" over the active days and keeps Week B keys', () => {
    const map = slotsByDay([{ day: 'all', slots: [slot('09:00', '10:00', 'Physics')] }], [1, 2])
    expect([...map.keys()]).toEqual([1, 2])
    const ab = slotsByDay([{ day: 1, slots: [] }, { day: 8, slots: [slot('09:00', '10:00', 'Maths')] }])
    expect([...ab.keys()]).toEqual([1, 8])
  })
})

const result = (subject: string): GeneratorResult => ({
  blocks: [
    { kind: 'sleep', startMinutes: 0, endMinutes: 360, startTime: '00:00', endTime: '06:00' },
    { kind: 'study', startMinutes: 540, endMinutes: 600, startTime: '09:00', endTime: '10:00', subjectName: subject },
    { kind: 'break', startMinutes: 600, endMinutes: 610, startTime: '10:00', endTime: '10:10' },
  ],
  requestedMinutes: 60, usableWindowMinutes: 900, scheduledStudyMinutes: 60, placedStudyMinutes: 60, blockLengthMinutes: 60, wasCut: false,
})

describe('planTimelineDays', () => {
  it('gives one "all" entry for a plan that is the same every day, study blocks only', () => {
    expect(planTimelineDays(null, result('Physics'), [0, 1, 2])).toEqual([
      { day: 'all', slots: [{ start_time: '09:00', end_time: '10:00', subject: 'Physics' }] },
    ])
  })

  it('keeps only running days of a week, Week B included', () => {
    const week = { 1: result('Physics'), 2: result('Maths'), 8: result('Chemistry') }
    expect(planTimelineDays(week, null, [1, 3]).map(d => d.day)).toEqual([1, 8])
  })

  it('is empty without a plan', () => {
    expect(planTimelineDays(null, null, [1])).toEqual([])
  })
})

describe('plan text without tables', () => {
  it('keeps the intro and the closing line, drops the timetable lines', () => {
    const r = result('Physics')
    const full = formatRecommendedPlan(r)
    const bare = formatRecommendedPlan(r, [], { tables: false })
    expect(full).toContain('09:00–10:00')
    expect(bare).not.toContain('09:00')
    expect(bare).toBe("Here's your day: 1 hour of study.\n\nTap Confirm to make it live, or tell me what to change.")
    const week = formatWeeklyPlan({ 1: r }, { activeDays: [1], tables: false })
    expect(week).toBe("Here's your week:\n\nTap Confirm to make it live, or tell me what to change.")
  })
})

describe('named blocks', () => {
  it('shows a time the student named instead of Free time', () => {
    const rows = buildTimeline([slot('10:00', '12:00', 'Maths'), slot('17:00', '18:00', 'Physics')],
      { wake: '07:00', sleep: '23:00', named_blocks: [{ range: '13:30-17:00', label: 'Coding session' }] })
    const r = rows.find((x) => x.label === 'Coding session')
    expect(r).toMatchObject({ kind: 'named', start: 13 * 60 + 30, end: 17 * 60 })
    expect(rows.some((x) => x.label === 'Free time' && x.start >= 13 * 60 + 30 && x.end <= 17 * 60)).toBe(false)
  })
})
