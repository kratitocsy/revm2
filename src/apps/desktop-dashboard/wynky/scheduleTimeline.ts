// A day's full timeline for Wynky's chat: wake, each study session, the
// breaks, lunch and dinner, busy time and sleep, built from the study slots
// the plan has plus what the student told Wynky (wake, sleep, busy, meals).

export type Slot = { start_time: string; end_time: string; subject: string }
export type Day = { day: number | 'all'; slots: Slot[] }
export type TimelineSettings = {
  wake?: string; sleep?: string; busy?: string[]; active_days?: number[]
  lunch?: string; dinner?: string
}
export type RowKind = 'study' | 'break' | 'meal' | 'busy' | 'free' | 'wake' | 'sleep'
export type Row = { kind: RowKind; label: string; start: number; end: number }

// Fallback meal windows, used only when the student hasn't told Wynky their
// lunch / dinner times (settings.lunch / settings.dinner win when present).
const MEALS = [
  { label: 'Lunch', from: 12 * 60, to: 15 * 60, len: 45 },
  { label: 'Dinner', from: 19 * 60, to: 21 * 60 + 30, len: 45 },
]
const BREAK_MAX = 30 // gaps up to this long are "Break", longer ones "Free time"

export const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

/** Labels the free time between two events. */
function fillGap(start: number, end: number, used: Set<string>, getReady: boolean): Row[] {
  const g = end - start
  if (g <= 0) return []
  for (const meal of MEALS) {
    if (used.has(meal.label)) continue
    const overlap = Math.min(end, meal.to) - Math.max(start, meal.from)
    if (overlap < 30) continue
    used.add(meal.label)
    const ms = g <= 90 ? start : Math.max(start, meal.from)
    const me = g <= 90 ? end : Math.min(end, ms + meal.len)
    // What is left before and after the meal is labelled the same way, so a
    // long gap can hold both lunch and dinner.
    return [
      ...fillGap(start, ms, used, getReady),
      { kind: 'meal', label: meal.label, start: ms, end: me },
      ...fillGap(me, end, used, false),
    ]
  }
  if (getReady && g <= 90) return [{ kind: 'break', label: 'Get ready', start, end }]
  const short = g <= BREAK_MAX
  return [{ kind: short ? 'break' : 'free', label: short ? 'Break' : 'Free time', start, end }]
}

export function buildTimeline(slots: Slot[], s: TimelineSettings): Row[] {
  const events: Row[] = slots.map((x) => ({
    kind: 'study', label: x.subject, start: mins(x.start_time), end: mins(x.end_time),
  }))
  for (const r of s.busy ?? []) {
    const [a, b] = r.split('-').map(mins)
    events.push({ kind: 'busy', label: 'Busy', start: a, end: b <= a ? 1440 : b })
  }
  // Meals the student told Wynky are fixed rows; the rest fall back to guesses.
  const used = new Set<string>()
  for (const [label, r] of [['Lunch', s.lunch], ['Dinner', s.dinner]] as const) {
    if (!r) continue
    const [a, b] = r.split('-').map(mins)
    events.push({ kind: 'meal', label, start: a, end: b <= a ? 1440 : b })
    used.add(label)
  }
  events.sort((x, y) => x.start - y.start)

  const wake = s.wake ? mins(s.wake) : null
  let bed = s.sleep ? mins(s.sleep) : null
  if (bed !== null && wake !== null && bed <= wake) bed += 1440 // sleeps past midnight

  const rows: Row[] = []
  let cur = wake ?? events[0]?.start ?? 0
  if (wake !== null) rows.push({ kind: 'wake', label: 'Wake up', start: wake, end: wake })

  let first = true
  for (const e of events) {
    if (e.start > cur) rows.push(...fillGap(cur, e.start, used, first && wake !== null))
    rows.push(e)
    cur = Math.max(cur, e.end)
    first = false
  }
  if (bed !== null) {
    if (bed > cur) rows.push(...fillGap(cur, bed, used, false))
    rows.push({ kind: 'sleep', label: 'Sleep', start: bed, end: bed })
  }
  return rows
}

/** "Every active day" expanded into real days, keyed 0-6 (Sunday first) and
 *  7-13 for Week B of an A/B plan. */
export function slotsByDay(days: Day[], activeDays?: number[]): Map<number, Slot[]> {
  const active = activeDays?.length ? activeDays : [0, 1, 2, 3, 4, 5, 6]
  const byKey = new Map<number, Slot[]>()
  for (const d of days) {
    if (d.day === 'all') active.forEach((k) => byKey.set(k, d.slots))
    else byKey.set(d.day, d.slots)
  }
  return byKey
}
