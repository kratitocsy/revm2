// Schedule windows for the focus timer.
//
// On a day one of the member's active Focus Lock schedules runs, the timer can
// only be started inside one of that schedule's blocks, and pausing inside a
// block gets 2 free pauses per schedule per day before the 150-word gate
// (pauseReflection.ts) applies. On a day no schedule runs, or for someone with
// no schedule at all, nothing here restricts anything.
//
// Times are India time, the same clock schedule-tick runs schedules on.

import { useEffect, useSyncExternalStore } from 'react';
import { istWeekParity } from '../wynky/wynkyPlanner';

export const FREE_PAUSES_PER_SCHEDULE = 2;

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export interface WindowSlot { start: string; end: string; subject: string | null }
export interface WindowSchedule {
  id: string;
  name: string;
  /** 0 (Sun) to 6 (Sat) */
  days: number[];
  /** 0/1: only in weeks of that parity; null: every week */
  parity: 0 | 1 | null;
  slots: WindowSlot[];
}

export interface WindowMatch { schedule: WindowSchedule; slot: WindowSlot; endsInMin: number }
export interface NextWindow { schedule: WindowSchedule; slot: WindowSlot; startsInMin: number; dayOffset: number }
export interface WindowGate {
  /** A schedule runs today, so starting the timer is limited to its blocks. */
  restricted: boolean;
  inside: WindowMatch | null;
  next: NextWindow | null;
}

function toMin(t: string): number {
  const [h, m] = t.split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

function istParts(now: Date) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { day: ist.getUTCDay(), min: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** The India-time calendar date, e.g. "2026-10-01". */
export function istDateKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whether the schedule runs on the India-time weekday `day`, `weekShift` weeks from this week. */
function runsOn(s: WindowSchedule, day: number, now: Date, dayOffset: number): boolean {
  if (!s.days.includes(day)) return false;
  if (s.parity === null) return true;
  const later = new Date(now.getTime() + dayOffset * 86_400_000);
  return istWeekParity(later) === s.parity;
}

/** The day's [start, end) minute spans of a schedule's blocks, midnight-crossing blocks cut at 24:00. */
function spansForDay(s: WindowSchedule, day: number, now: Date, dayOffset: number): { slot: WindowSlot; from: number; to: number }[] {
  const out: { slot: WindowSlot; from: number; to: number }[] = [];
  if (runsOn(s, day, now, dayOffset)) {
    for (const slot of s.slots) {
      const a = toMin(slot.start), b = toMin(slot.end);
      out.push({ slot, from: a, to: b > a ? b : 1440 });
    }
  }
  // The tail of last night's midnight-crossing blocks.
  const prev = (day + 6) % 7;
  if (runsOn(s, prev, now, dayOffset - 1)) {
    for (const slot of s.slots) {
      const a = toMin(slot.start), b = toMin(slot.end);
      if (b <= a && b > 0) out.push({ slot, from: 0, to: b });
    }
  }
  return out;
}

export function computeGate(schedules: WindowSchedule[], now: Date = new Date()): WindowGate {
  const { day, min } = istParts(now);
  let restricted = false;
  let inside: WindowMatch | null = null;
  for (const s of schedules) {
    const today = spansForDay(s, day, now, 0);
    if (today.length) restricted = true;
    for (const sp of today) {
      if (min >= sp.from && min < sp.to && (!inside || sp.to - min < inside.endsInMin)) {
        inside = { schedule: s, slot: sp.slot, endsInMin: sp.to - min };
      }
    }
  }
  let next: NextWindow | null = null;
  if (!inside) {
    for (let off = 0; off <= 14 && !next; off++) {
      const d = (day + off) % 7;
      for (const s of schedules) {
        for (const sp of spansForDay(s, d, now, off)) {
          const startsIn = off * 1440 + sp.from - min;
          if (startsIn > 0 && (!next || startsIn < next.startsInMin)) {
            next = { schedule: s, slot: sp.slot, startsInMin: startsIn, dayOffset: off };
          }
        }
      }
    }
  }
  return { restricted, inside, next };
}

/** "4:00 PM" from "16:00". */
export function clockLabel(hhmm: string): string {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The one-line reason shown when the timer can't be started right now. */
export function blockedMessage(gate: WindowGate): string {
  const n = gate.next;
  if (!n) return 'Your schedule is on, so the timer starts only inside its blocks.';
  const what = n.slot.subject ? `${n.slot.subject} at ${clockLabel(n.slot.start)}` : clockLabel(n.slot.start);
  const when = n.dayOffset === 0 ? 'today' : n.dayOffset === 1 ? 'tomorrow' : 'later this week';
  return `Your schedule is on, so the timer starts only inside its blocks. Next block: ${what} ${when}.`;
}

// ── Free pauses (2 per schedule per day) ────────────────────────────────────

function pauseKey(scheduleId: string, now: Date) { return `wynko.freePauses.${scheduleId}.${istDateKey(now)}`; }

export function freePausesLeft(scheduleId: string, now: Date = new Date()): number {
  try {
    const used = parseInt(localStorage.getItem(pauseKey(scheduleId, now)) || '0', 10) || 0;
    return Math.max(0, FREE_PAUSES_PER_SCHEDULE - used);
  } catch { return FREE_PAUSES_PER_SCHEDULE; }
}

export function spendFreePause(scheduleId: string, now: Date = new Date()): void {
  try {
    const used = parseInt(localStorage.getItem(pauseKey(scheduleId, now)) || '0', 10) || 0;
    localStorage.setItem(pauseKey(scheduleId, now), String(used + 1));
  } catch { /* the 150-word gate still applies once storage is gone */ }
}

// A free pause lasts FREE_PAUSE_MINUTES, then the timer resumes by itself.
// The end time is kept here so it survives leaving the page.
export const FREE_PAUSE_MINUTES = 20;
const UNTIL_KEY = 'wynko.freePauseUntil';

/** Uses one of the schedule's free pauses and starts its 20-minute clock. */
export function beginFreePause(scheduleId: string, now: Date = new Date()): void {
  spendFreePause(scheduleId, now);
  try { localStorage.setItem(UNTIL_KEY, String(now.getTime() + FREE_PAUSE_MINUTES * 60_000)); } catch { /* no clock: the pause just stays until resumed */ }
}

/** When the running free pause ends (ms), or null when none is running. */
export function freePauseUntil(): number | null {
  try {
    const v = parseInt(localStorage.getItem(UNTIL_KEY) || '', 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

export function clearFreePause(): void {
  try { localStorage.removeItem(UNTIL_KEY); } catch { /* nothing to clear */ }
}

// ── Store: the member's active schedules, loaded once and shared ───────────

let current: WindowSchedule[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

export function setWindowSchedules(next: WindowSchedule[]) { current = next; emit(); }
export function getWindowSchedules(): WindowSchedule[] { return current; }

type SupaLike = { from: (t: string) => any };

/** Loads the member's active schedules (sleep blocks don't count). Quietly keeps what it had on failure. */
export async function refreshWindowSchedules(sb: SupaLike, userId: string): Promise<void> {
  try {
    const { data: rows, error } = await sb.from('focus_lock_schedules')
      .select('id, name, days_of_week, week_parity, active').eq('user_id', userId).eq('active', true);
    if (error || !rows) return;
    const ids = (rows as any[]).map(r => r.id);
    const slotsBy = new Map<string, WindowSlot[]>();
    if (ids.length) {
      const { data: slots, error: e2 } = await sb.from('focus_lock_schedule_slots')
        .select('schedule_id, start_time, end_time, subject, is_sleep, slot_order').in('schedule_id', ids).order('slot_order');
      if (e2 || !slots) return;
      for (const s of slots as any[]) {
        if (s.is_sleep) continue;
        const list = slotsBy.get(s.schedule_id) ?? [];
        list.push({ start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5), subject: s.subject ?? null });
        slotsBy.set(s.schedule_id, list);
      }
    }
    setWindowSchedules((rows as any[]).map(r => ({
      id: r.id, name: r.name, days: (r.days_of_week ?? []) as number[],
      parity: r.week_parity === 0 || r.week_parity === 1 ? r.week_parity : null,
      slots: slotsBy.get(r.id) ?? [],
    })));
  } catch { /* keep the last known schedules */ }
}

/** The live gate: recomputed every 30 seconds and whenever the schedules change. */
export function useWindowGate(): WindowGate {
  const schedules = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getWindowSchedules,
  );
  const minute = useSyncExternalStore(
    cb => { const t = setInterval(cb, 30_000); return () => clearInterval(t); },
    () => Math.floor(Date.now() / 30_000),
  );
  void minute;
  return computeGate(schedules, new Date());
}

/** Keeps the shared schedules fresh while a member is signed in. */
export function useWindowSchedulesLoader(sb: SupaLike, userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    void refreshWindowSchedules(sb, userId);
    const t = setInterval(() => void refreshWindowSchedules(sb, userId), 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshWindowSchedules(sb, userId); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [sb, userId]);
}
