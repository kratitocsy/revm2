import { useState } from 'react'
import { fmtClock } from './wynkyChatFlow'
import { buildTimeline, mins, slotsByDay, type Day, type RowKind, type TimelineSettings } from './scheduleTimeline'

/* Day-wise timetable for Wynky's chat: a week overview, then a full timeline
   for the selected day (wake, each subject with start/end/length, breaks,
   lunch, dinner, busy time, sleep). Display only. */

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

const ROW_STYLE: Record<RowKind, string> = {
  study: 'text-wk-ink-100 font-semibold',
  break: 'text-wk-ink-400 text-[11px]',
  meal: 'text-wk-orange-300 bg-wk-orange-500/10 font-medium',
  busy: 'text-wk-ink-400 bg-white/[0.03]',
  free: 'text-wk-ink-500 text-[11px]',
  wake: 'text-wk-ink-500 italic',
  sleep: 'text-wk-ink-500 italic',
}

const clock = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440
  return fmtClock(`${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`)
}
const dur = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60
  if (!h) return `${r} min`
  return r ? `${h} hr ${r} min` : `${h} hr`
}

export default function ScheduleTables({ days, settings }: { days: Day[]; settings?: TimelineSettings }) {
  const byKey = slotsByDay(days, settings?.active_days)
  const hasB = [...byKey.keys()].some((k) => k >= 7)
  const [week, setWeek] = useState<0 | 7>(0)
  const [picked, setPicked] = useState<number | null>(null)

  const order = MON_FIRST.map((k) => k + (hasB ? week : 0))
  const firstDay = order.find((k) => byKey.get(k)?.length) ?? order[0]
  const sel = picked !== null && order.includes(picked) ? picked : firstDay
  const selSlots = byKey.get(sel) ?? []
  const timeline = selSlots.length ? buildTimeline(selSlots, settings ?? {}) : []
  const sum = (kinds: RowKind[]) =>
    timeline.filter((r) => kinds.includes(r.kind)).reduce((n, r) => n + r.end - r.start, 0)

  if (![...byKey.values()].some((s) => s.length)) return null

  return (
    <div className="grid gap-2 mt-2 whitespace-normal">
      {hasB && (
        <div className="flex gap-1.5">
          {([[0, 'Week A'], [7, 'Week B']] as const).map(([w, label]) => (
            <button key={w} type="button" onClick={() => setWeek(w)}
              className={`rounded-lg border px-3 py-1 text-[12px] ${week === w
                ? 'bg-wk-orange-500 border-wk-orange-500 text-wk-black-950'
                : 'border-wk-black-600 text-wk-ink-400 hover:text-wk-ink-100'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-wk-black-600 overflow-x-auto">
        <table className="w-full text-[12px] border-collapse whitespace-nowrap text-wk-ink-200">
          <thead>
            <tr className="text-[10px] font-mono tracking-[0.08em] text-wk-ink-500 text-left">
              <th className="font-normal px-3 py-2">DAY</th>
              <th className="font-normal px-3 py-2">SUBJECTS</th>
              <th className="font-normal px-3 py-2">STUDY</th>
            </tr>
          </thead>
          <tbody>
            {order.map((k) => {
              const slots = byKey.get(k) ?? []
              const total = slots.reduce((n, s) => n + mins(s.end_time) - mins(s.start_time), 0)
              const pick = () => { if (slots.length) setPicked(k) }
              return (
                <tr key={k}
                  className={`border-t border-wk-black-600 ${slots.length ? 'cursor-pointer' : 'text-wk-ink-500'} ${k === sel ? 'bg-wk-orange-500/10' : ''}`}
                  onClick={pick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }}
                  tabIndex={slots.length ? 0 : undefined}
                  role={slots.length ? 'button' : undefined}
                  aria-pressed={slots.length ? k === sel : undefined}>
                  <td className="px-3 py-1.5 font-medium">{NAMES[k % 7]}</td>
                  <td className="px-3 py-1.5">{slots.length ? [...new Set(slots.map((s) => s.subject))].join(', ') : 'Day off'}</td>
                  <td className="px-3 py-1.5">{slots.length ? dur(total) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {timeline.length > 0 && (
        <div className="rounded-xl border border-wk-black-600 overflow-hidden">
          <div className="flex justify-between gap-2 px-3 py-2 bg-wk-black-700 text-[12px]">
            <span className="font-semibold text-wk-ink-100">{NAMES[sel % 7]}</span>
            <span className="text-wk-orange-300">
              {dur(sum(['study']))} study · {dur(sum(['break', 'meal']))} breaks &amp; meals
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse whitespace-nowrap text-wk-ink-200">
              <thead>
                <tr className="text-[10px] font-mono tracking-[0.08em] text-wk-ink-500 text-left">
                  <th className="font-normal px-3 py-1.5">TIME</th>
                  <th className="font-normal px-3 py-1.5">ACTIVITY</th>
                  <th className="font-normal px-3 py-1.5">DURATION</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((r, i) => {
                  const point = r.end <= r.start // wake / sleep
                  return (
                    <tr key={i} className={`border-t border-wk-black-600 ${ROW_STYLE[r.kind]}`}>
                      <td className="px-3 py-1.5">{point ? clock(r.start) : `${clock(r.start)} – ${clock(r.end)}`}</td>
                      <td className="px-3 py-1.5">{r.label}</td>
                      <td className="px-3 py-1.5">{point ? '–' : dur(r.end - r.start)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
