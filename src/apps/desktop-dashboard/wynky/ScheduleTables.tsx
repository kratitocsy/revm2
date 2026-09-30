import { useState } from "react";

// Day-wise timetable for Wynky's chat: a week overview, then a full timeline
// for the selected day (wake, each subject with start/end/length, breaks,
// lunch, dinner, busy time, sleep).

export type Slot = { start_time: string; end_time: string; subject: string };
export type Day = { day: number | "all"; slots: Slot[] };
export type Settings = {
  wake?: string; sleep?: string; busy?: string[]; active_days?: number[];
  lunch?: string; dinner?: string;
};
type Kind = "study" | "break" | "meal" | "busy" | "free" | "wake" | "sleep";
export type Row = { kind: Kind; label: string; start: number; end: number };

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

// Fallback meal windows, used only when the student hasn't told Wynky their
// lunch / dinner times (settings.lunch / settings.dinner win when present).
const MEALS = [
  { label: "Lunch", from: 12 * 60, to: 15 * 60, len: 45 },
  { label: "Dinner", from: 19 * 60, to: 21 * 60 + 30, len: 45 },
];
const BREAK_MAX = 30; // gaps up to this long are "Break", longer ones "Free time"

const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const clock = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440, h = Math.floor(x / 60);
  return `${h % 12 || 12}:${String(x % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const dur = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} hr ${r} min` : `${h} hr`;
};

/** Labels the free time between two events. */
function fillGap(start: number, end: number, used: Set<string>, getReady: boolean): Row[] {
  const g = end - start;
  if (g <= 0) return [];
  for (const meal of MEALS) {
    if (used.has(meal.label)) continue;
    const overlap = Math.min(end, meal.to) - Math.max(start, meal.from);
    if (overlap < 30) continue;
    used.add(meal.label);
    const ms = g <= 90 ? start : Math.max(start, meal.from);
    const me = g <= 90 ? end : Math.min(end, ms + meal.len);
    const out: Row[] = [];
    if (ms > start) out.push({ kind: "free", label: "Free time", start, end: ms });
    out.push({ kind: "meal", label: meal.label, start: ms, end: me });
    if (me < end) out.push({ kind: "free", label: "Free time", start: me, end });
    return out;
  }
  if (getReady && g <= 90) return [{ kind: "break", label: "Get ready", start, end }];
  const short = g <= BREAK_MAX;
  return [{ kind: short ? "break" : "free", label: short ? "Break" : "Free time", start, end }];
}

export function buildTimeline(slots: Slot[], s: Settings): Row[] {
  const events: Row[] = slots.map((x) => ({
    kind: "study", label: x.subject, start: mins(x.start_time), end: mins(x.end_time),
  }));
  for (const r of s.busy ?? []) {
    const [a, b] = r.split("-").map(mins);
    events.push({ kind: "busy", label: "Busy", start: a, end: b <= a ? 1440 : b });
  }
  // Meals the student told Wynky are fixed rows; the rest fall back to guesses.
  const used = new Set<string>();
  for (const [label, r] of [["Lunch", s.lunch], ["Dinner", s.dinner]] as const) {
    if (!r) continue;
    const [a, b] = r.split("-").map(mins);
    events.push({ kind: "meal", label, start: a, end: b <= a ? 1440 : b });
    used.add(label);
  }
  events.sort((x, y) => x.start - y.start);

  const wake = s.wake ? mins(s.wake) : null;
  let bed = s.sleep ? mins(s.sleep) : null;
  if (bed !== null && wake !== null && bed <= wake) bed += 1440; // sleeps past midnight

  const rows: Row[] = [];
  let cur = wake ?? events[0]?.start ?? 0;
  if (wake !== null) rows.push({ kind: "wake", label: "Wake up", start: wake, end: wake });

  let first = true;
  for (const e of events) {
    if (e.start > cur) rows.push(...fillGap(cur, e.start, used, first && wake !== null));
    rows.push(e);
    cur = Math.max(cur, e.end);
    first = false;
  }
  if (bed !== null) {
    if (bed > cur) rows.push(...fillGap(cur, bed, used, false));
    rows.push({ kind: "sleep", label: "Sleep", start: bed, end: bed });
  }
  return rows;
}

export function ScheduleTables({ days, settings }: { days: Day[]; settings?: Settings }) {
  const active = settings?.active_days?.length ? settings.active_days : [0, 1, 2, 3, 4, 5, 6];

  // "Every active day" expands into real days; A/B plans use keys 7-13 for Week B.
  const byKey = new Map<number, Slot[]>();
  for (const d of days) {
    if (d.day === "all") active.forEach((k) => byKey.set(k, d.slots));
    else byKey.set(d.day, d.slots);
  }
  const hasB = [...byKey.keys()].some((k) => k >= 7);
  const [week, setWeek] = useState<0 | 7>(0);
  const [picked, setPicked] = useState<number | null>(null);

  const order = MON_FIRST.map((k) => k + (hasB ? week : 0));
  const firstDay = order.find((k) => byKey.get(k)?.length) ?? order[0];
  const sel = picked !== null && order.includes(picked) ? picked : firstDay;
  const selSlots = byKey.get(sel) ?? [];
  const timeline = selSlots.length ? buildTimeline(selSlots, settings ?? {}) : [];
  const sum = (kinds: Kind[]) =>
    timeline.filter((r) => kinds.includes(r.kind)).reduce((n, r) => n + r.end - r.start, 0);

  if (![...byKey.values()].some((s) => s.length)) return null;

  return (
    <div className="wk-sched">
      {hasB && (
        <div className="wk-weeks">
          <button className={week === 0 ? "on" : ""} onClick={() => setWeek(0)}>Week A</button>
          <button className={week === 7 ? "on" : ""} onClick={() => setWeek(7)}>Week B</button>
        </div>
      )}

      <div className="wk-card wk-scroll wk-overview">
        <table>
          <thead><tr><th>Day</th><th>Subjects</th><th>Study</th></tr></thead>
          <tbody>
            {order.map((k) => {
              const slots = byKey.get(k) ?? [];
              const total = slots.reduce((n, s) => n + mins(s.end_time) - mins(s.start_time), 0);
              return (
                <tr key={k} className={k === sel ? "sel" : ""} onClick={() => slots.length && setPicked(k)}>
                  <td>{NAMES[k % 7]}</td>
                  <td>{slots.length ? [...new Set(slots.map((s) => s.subject))].join(", ") : "Day off"}</td>
                  <td>{slots.length ? dur(total) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {timeline.length > 0 && (
        <div className="wk-card">
          <div className="wk-head">
            <span>{NAMES[sel % 7]}</span>
            <span className="wk-total">
              {dur(sum(["study"]))} study · {dur(sum(["break", "meal"]))} breaks &amp; meals
            </span>
          </div>
          <div className="wk-scroll">
            <table>
              <thead><tr><th>Time</th><th>Activity</th><th>Duration</th></tr></thead>
              <tbody>
                {timeline.map((r, i) => {
                  const point = r.end <= r.start; // wake / sleep
                  return (
                    <tr key={i} className={`k-${r.kind}`}>
                      <td>{point ? clock(r.start) : `${clock(r.start)} – ${clock(r.end)}`}</td>
                      <td>{r.label}</td>
                      <td>{point ? "–" : dur(r.end - r.start)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
