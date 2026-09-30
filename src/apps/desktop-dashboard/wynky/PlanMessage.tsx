import { splitPlanText, fmtClock, fmtGap, type PlanRow } from './wynkyChatFlow'

/* A Wynky message with its timetable shown as a table (time, duration,
   activity) instead of plain lines. Display only: the message text stays
   exactly as saved, so older messages in the history get tables too. */

const ROW_STYLE: Record<PlanRow['kind'], string> = {
  study: 'text-wk-ink-100 font-semibold',
  break: 'text-wk-ink-400',
  free: 'text-wk-ink-400',
  sleep: 'text-wk-ink-500',
  busy: 'text-wk-ink-400',
}
const ICON: Record<PlanRow['kind'], string> = { study: '📘', break: '☕', free: '🌿', sleep: '😴', busy: '🏫' }

export default function PlanMessage({ text }: { text: string }) {
  const parts = splitPlanText(text)
  if (!parts.some(p => p.kind === 'table')) return <>{text}</>
  return (
    <div className="space-y-2.5">
      {parts.map((p, i) => p.kind === 'text' ? (
        <div key={i} className="whitespace-pre-wrap">{p.text}</div>
      ) : (
        <div key={i} className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] border-collapse whitespace-nowrap">
            <thead>
              <tr className="text-[10px] font-mono tracking-[0.08em] text-wk-ink-500 text-left">
                <th className="font-normal px-1 pb-1.5">TIME</th>
                <th className="font-normal px-2 pb-1.5">DURATION</th>
                <th className="font-normal px-1 pb-1.5">ACTIVITY</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r, j) => (
                <tr key={j} className={`border-t border-[#26262A] ${ROW_STYLE[r.kind]}`}>
                  <td className="px-1 py-1.5">{fmtClock(r.start)} – {fmtClock(r.end)}</td>
                  <td className="px-2 py-1.5">{r.minutes < 60 ? `${r.minutes} min` : fmtGap(r.minutes).replace(' hours', 'h').replace(' hour', 'h').replace(' min', 'm')}</td>
                  <td className="px-1 py-1.5">{ICON[r.kind]} {r.activity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
