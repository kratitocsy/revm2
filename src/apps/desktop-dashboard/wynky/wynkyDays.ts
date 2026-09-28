/* Day types for Wynky plans: the same plan every day, weekdays vs weekend
   (school, coaching or work only on weekdays), or different subjects on
   different days. Each day type becomes its own Focus Lock schedule, so
   schedule-tick only runs it on its own days. Pure functions, no I/O. */

export type DayStructure = 'same' | 'weekend' | 'split'

export interface DayGroup {
  /** 0=Sun..6=Sat, sorted Monday first. */
  days: number[]
  subjects: string[]
  /** Busy windows that apply on these days ("HH:MM-HH:MM"). */
  busy: string[]
  /** "Every day", "Mon–Fri", "Sat, Sun", "Mon Wed Fri". */
  label: string
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS = [1, 2, 3, 4, 5]
export const WEEKEND = [6, 0]
/** Monday first, the way students read a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const PLAN_NAME = 'Wynky Plan'

export const DAY_STRUCTURE_OPTIONS: { id: DayStructure; label: string }[] = [
  { id: 'same', label: 'Same every day' },
  { id: 'weekend', label: 'Weekdays vs weekend' },
  { id: 'split', label: 'Different subjects on different days' },
]

/** Days no day type covers (rest days on a split plan). */
export const restDays = (groups: DayGroup[]) => WEEK_ORDER.filter(d => !groups.some(g => g.days.includes(d)))

export const isDayStructure = (v: unknown): v is DayStructure => v === 'same' || v === 'weekend' || v === 'split'
const isWeekend = (d: number) => d === 0 || d === 6
const weekSort = (days: number[]) => [...new Set(days)].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))

export function daysLabel(days: number[]): string {
  const s = weekSort(days)
  if (s.length === 7) return 'Every day'
  if (s.length === 5 && WEEKDAYS.every(d => s.includes(d))) return 'Mon–Fri'
  if (s.length === 2 && WEEKEND.every(d => s.includes(d))) return 'Sat, Sun'
  return s.map(d => DAY_SHORT[d]).join(' ')
}

/** The schedule name for one day type. A single day type keeps the plain
 *  name so older plans are replaced in place. */
export function planNameFor(group: DayGroup, groupCount: number): string {
  return groupCount <= 1 ? PLAN_NAME : `${PLAN_NAME} · ${daysLabel(group.days)}`
}

/** Any schedule Wynky saved, under any day-type name. */
export const isWynkyPlanName = (name: string) => name === PLAN_NAME || name.startsWith(`${PLAN_NAME} · `)

/** "1,3,5" ↔ [1,3,5], for learning a subject's days as one value. */
export const daysValue = (days: number[]) => weekSort(days).join(',')
export function parseDaysValue(value: string | null | undefined): number[] | null {
  if (!value) return null
  const days = value.split(',').map(v => Number(v.trim()))
  if (!days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return null
  return weekSort(days)
}

/** How many subjects a day gets when they are split across the week. */
export const subjectsPerDay = (n: number) => (n <= 2 ? 1 : n <= 5 ? 2 : 3)

/**
 * Gives every subject its days. Subjects the student already placed keep
 * theirs; the rest are spread over the least-loaded days, spaced apart
 * (Physics Mon/Wed/Fri rather than Mon/Tue/Wed). Days nobody has yet go to
 * a subject Wynky placed; a day the student left empty for every subject
 * they placed themselves stays a rest day.
 */
export function fillSubjectDays(subjects: string[], given: Record<string, number[]>): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  const load = new Map<number, number>(ALL_DAYS.map(d => [d, 0]))
  for (const s of subjects) {
    const days = weekSort((given[s] || []).filter(d => d >= 0 && d <= 6))
    if (!days.length) continue
    out[s] = days
    for (const d of days) load.set(d, load.get(d)! + 1)
  }
  const open = subjects.filter(s => !out[s])
  if (open.length) {
    const perDay = subjectsPerDay(subjects.length)
    // One subject a day rounds down: the empty-day pass below tops it up
    // without giving any day two subjects.
    const target = Math.max(1, (perDay === 1 ? Math.floor : Math.round)((7 * perDay) / subjects.length))
    // Round-robin one day at a time so each open subject gets a fair pick.
    const picked: Record<string, number[]> = Object.fromEntries(open.map(s => [s, []]))
    for (let round = 0; round < target; round++) {
      for (const s of open) {
        const mine = picked[s]
        const gap = (d: number) => (mine.length ? Math.min(...mine.map(m => Math.min(Math.abs(m - d), 7 - Math.abs(m - d)))) : 7)
        const best = WEEK_ORDER.filter(d => !mine.includes(d))
          .sort((a, b) => load.get(a)! - load.get(b)! || gap(b) - gap(a) || WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))[0]
        if (best == null) continue
        mine.push(best)
        load.set(best, load.get(best)! + 1)
      }
    }
    for (const s of open) out[s] = weekSort(picked[s])
  }
  // No empty study days: give each one the Wynky-placed subject with the
  // fewest days. Never add a day to a subject the student placed.
  for (const d of WEEK_ORDER) {
    if (load.get(d)! > 0 || !open.length) continue
    const s = [...open].sort((a, b) => out[a].length - out[b].length)[0]
    out[s] = weekSort([...out[s], d])
    load.set(d, 1)
  }
  return out
}

/**
 * Splits the week into day types. Days that share the same subjects and
 * the same busy times become one group. Only a 'weekend' plan (the
 * student said weekends differ) frees Saturday and Sunday of school,
 * coaching or work times.
 */
export function dayGroups(args: {
  structure: DayStructure
  subjects: string[]
  busy: string[]
  subjectDays: Record<string, number[]>
}): DayGroup[] {
  const { structure, subjects, busy } = args
  if (structure === 'same' || !subjects.length) return [{ days: weekSort(ALL_DAYS), subjects, busy, label: daysLabel(ALL_DAYS) }]
  const busyOn = (d: number) => (structure === 'weekend' && isWeekend(d) ? [] : busy)
  const subjectsOn = (d: number, filled: Record<string, number[]> | null) =>
    filled ? subjects.filter(s => filled[s]?.includes(d)) : subjects
  const filled = structure === 'split' ? fillSubjectDays(subjects, args.subjectDays) : null
  const byKey = new Map<string, { days: number[]; subjects: string[]; busy: string[] }>()
  for (const d of WEEK_ORDER) {
    const subs = subjectsOn(d, filled)
    if (!subs.length) continue // a rest day: no schedule runs
    const b = busyOn(d)
    // Without busy times weekends plan exactly like weekdays, so they merge.
    const key = `${subs.join('\u0000')}|${b.join(',')}`
    const g = byKey.get(key)
    if (g) g.days.push(d)
    else byKey.set(key, { days: [d], subjects: subs, busy: b })
  }
  return [...byKey.values()].map(g => ({ ...g, days: weekSort(g.days), label: daysLabel(g.days) }))
}
