/* ============================================================
   wynkyRefine.ts

   Gemini improves every Wynky plan. The rule-based generator builds a
   draft day in under a second; this sends that draft plus everything
   Wynky knows (Study DNA, busy times, weak subjects, and the student's
   own requests) to ai-generate-schedule's "refine" mode, then checks
   the answer before it is shown.

   Priority, as the prompt tells the AI: what the student asks for right
   now, then requests they made in earlier chats (remembered in
   wynky_events as 'note' requests), then busy times and wake/sleep,
   then Study DNA, then the draft.

   Checks here are the safety net: an answer that breaks them is thrown
   away and the rule-based plan is used, so the AI can only make a plan
   better, never break it. When the student has asked for something,
   the wake/sleep and total-time checks relax (their words win), but the
   format, subject and overlap checks never do.
   Pure functions, no network.
   ============================================================ */

import type { GeneratedBlock, GeneratorResult } from '../../_shared/scheduleGenerator';

export interface RefinedSlot { start_time: string; end_time: string; subject: string }

export interface RefineContext {
  subjects: string[];
  wakeTime: string;
  sleepTime: string;
  busy: { start: string; end: string }[];
  /** Did the student ask for something in this message? */
  requestNow: boolean;
  /** Requests from earlier chats that still apply. */
  standingRequests: string[];
}

const HHMM = /^\d{2}:\d{2}$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The draft's study blocks, the way the edge function expects them. */
export function draftSlots(result: GeneratorResult): RefinedSlot[] {
  return result.blocks
    .filter(b => b.kind === 'study')
    .map(b => ({ start_time: b.startTime, end_time: b.endTime, subject: b.subjectName || 'Study' }));
}

export interface ChatTurn { sender: 'bot' | 'user'; text: string }

/** The last few messages of the chat, oldest first, so the AI can read a
 *  follow-up ("make it shorter", "move that to the evening") against what
 *  was said and shown before. The message being answered now is sent on
 *  its own as the request, so the chat's copy of it is left out. Long
 *  messages are cut: a plan Wynky showed keeps its first lines. */
export function recentChat(messages: { from: string; text: string }[], requestNow: string | null, max = 10, budget = 6000): ChatTurn[] {
  const turns = messages.filter((m): m is ChatTurn & { from: 'bot' | 'user' } => (m.from === 'bot' || m.from === 'user') && !!m.text.trim())
  const now = requestNow?.split('\n')[0].trim()
  // Drop it and Wynky's "Got it" after it, if the chat already shows them.
  const lastUser = turns.map(m => m.from).lastIndexOf('user')
  if (now && lastUser >= 0 && turns[lastUser].text.trim() === now) turns.splice(lastUser)
  const out: ChatTurn[] = []
  let used = 0
  for (const m of turns.slice(-max).reverse()) {
    const text = m.text.trim().slice(0, m.from === 'bot' ? 1500 : 300)
    if (used + text.length > budget) break
    used += text.length
    out.unshift({ sender: m.from, text })
  }
  return out
}

/** Earlier typed requests, newest first, without repeats or ones taken back. */
export function standingRequests(events: { field: string; value: string; action: string; at: string }[], max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    if (e.field !== 'note') continue;
    const key = e.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // The newest event for a request decides: 'removed' means the student
    // said it no longer holds.
    if (e.action !== 'requested') continue;
    out.push(e.value.trim());
    if (out.length >= max) break;
  }
  return out;
}

/** What the chat sends as "remembered": the memory table first (newest
 *  first), then typed requests from before it existed, each once. */
export function memoryLines(memory: string[], notes: string[], max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...memory, ...notes]) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
    if (out.length >= max) break;
  }
  return out;
}

/** Rules the AI stopped following since the last message, so they're
 *  forgotten rather than kept in memory. */
export function droppedRules(before: string[], after: string[]): string[] {
  const kept = new Set(after.map(r => r.trim().toLowerCase()));
  return before.filter(r => r.trim() && !kept.has(r.trim().toLowerCase()));
}

/** Returns the refined slots with subjects matched to the student's own
 *  subject names, or the reason the answer can't be used. */
export function checkRefined(slots: unknown, draft: GeneratorResult, ctx: RefineContext): { ok: true; slots: RefinedSlot[] } | { ok: false; reason: string } {
  if (!Array.isArray(slots) || !slots.length) return { ok: false, reason: 'no study blocks' };
  const bySubject = new Map(ctx.subjects.map(s => [s.toLowerCase(), s]));
  const out: RefinedSlot[] = [];
  let prevEnd = -1;
  for (const raw of slots as Record<string, unknown>[]) {
    const start = raw?.start_time, end = raw?.end_time, subject = raw?.subject;
    if (typeof start !== 'string' || typeof end !== 'string' || !HHMM.test(start) || !HHMM.test(end)) return { ok: false, reason: 'bad time' };
    const s = toMin(start), e = toMin(end);
    if (e <= s) return { ok: false, reason: 'block ends before it starts' };
    if (s < prevEnd) return { ok: false, reason: 'overlapping blocks' };
    const name = typeof subject === 'string' ? bySubject.get(subject.trim().toLowerCase()) : undefined;
    if (!name) return { ok: false, reason: `unknown subject ${String(subject)}` };
    if (e - s < 15 || e - s > 240) return { ok: false, reason: 'block length out of range' };
    out.push({ start_time: start, end_time: end, subject: name });
    prevEnd = e;
  }

  const hasRequests = ctx.requestNow || ctx.standingRequests.length > 0;
  // Busy times always hold unless the student asked for something just now.
  if (!ctx.requestNow) {
    for (const b of ctx.busy) {
      const bs = toMin(b.start), be = toMin(b.end);
      if (out.some(x => toMin(x.start_time) < be && toMin(x.end_time) > bs)) return { ok: false, reason: 'study during busy time' };
    }
  }
  if (!hasRequests) {
    const earliest = toMin(ctx.wakeTime) + 30;
    let sleep = toMin(ctx.sleepTime);
    if (sleep <= toMin(ctx.wakeTime)) sleep += 1440;
    const latest = Math.min(sleep - 30, 1440);
    if (out.some(x => toMin(x.start_time) < earliest || toMin(x.end_time) > latest)) return { ok: false, reason: 'outside waking hours' };
  }
  if (!ctx.requestNow) {
    const target = draft.placedStudyMinutes;
    const total = out.reduce((sum, x) => sum + toMin(x.end_time) - toMin(x.start_time), 0);
    const [lo, hi] = hasRequests ? [0.5, 1.5] : [0.8, 1.2];
    if (target > 0 && (total < target * lo || total > target * hi)) return { ok: false, reason: 'total study time far from the plan' };
  }
  return { ok: true, slots: out };
}

/** Same checks as checkRefined, run once per day of a refine_week answer.
 *  Each day is checked on its own terms (its own overlap/order check),
 *  but the wake/sleep/busy/total checks still apply to every day since
 *  those don't vary by day of week. */
export function checkRefinedWeek(days: unknown, draft: GeneratorResult, ctx: RefineContext): { ok: true; days: Record<number, RefinedSlot[]> } | { ok: false; reason: string } {
  if (!Array.isArray(days) || days.length !== 7) return { ok: false, reason: 'need exactly 7 days' };
  const out: Record<number, RefinedSlot[]> = {};
  const seen = new Set<number>();
  for (const raw of days as Record<string, unknown>[]) {
    const day = raw?.day;
    if (typeof day !== 'number' || day < 0 || day > 6) return { ok: false, reason: `invalid day ${String(day)}` };
    if (seen.has(day)) return { ok: false, reason: `duplicate day ${day}` };
    seen.add(day);
    const check = checkRefined(raw?.slots, draft, ctx);
    if (!check.ok) return { ok: false, reason: `day ${day}: ${check.reason}` };
    out[day] = check.slots;
  }
  return { ok: true, days: out };
}

/** The refined day as a GeneratorResult, keeping the draft's sleep block
 *  and adding the breaks between blocks back for display. */
export function toResult(slots: RefinedSlot[], draft: GeneratorResult): GeneratorResult {
  const blocks: GeneratedBlock[] = [];
  slots.forEach((x, i) => {
    const s = toMin(x.start_time), e = toMin(x.end_time);
    blocks.push({ kind: 'study', startMinutes: s, endMinutes: e, startTime: x.start_time, endTime: x.end_time, subjectName: x.subject, subjectId: x.subject });
    const next = slots[i + 1];
    if (next && toMin(next.start_time) > e && toMin(next.start_time) - e <= 45) {
      blocks.push({ kind: 'break', startMinutes: e, endMinutes: toMin(next.start_time), startTime: fromMin(e), endTime: next.start_time });
    }
  });
  const sleep = draft.blocks.filter(b => b.kind === 'sleep');
  const placed = slots.reduce((sum, x) => sum + toMin(x.end_time) - toMin(x.start_time), 0);
  return { ...draft, blocks: [...blocks, ...sleep], placedStudyMinutes: placed };
}

// ── Wynky chat (ai-generate-schedule "chat" mode) ─────────────────────────

/** What Wynky and the student agreed. Sent with every chat message and
 *  kept until the student changes it, so nothing said once is lost. */
export interface ChatSettings {
  lunch?: string;
  dinner?: string;
  daily_hours?: number;
  session_minutes?: number;
  break_minutes?: number;
  wake?: string;
  sleep?: string;
  busy?: string[];
  study_windows?: string[];
  week_shape?: 'same' | 'vary' | 'ab';
  repeat?: 'weekly' | 'every2' | 'ab';
  active_days?: number[];
  rules?: string[];
}

export interface ChatDay { day: number | 'all'; slots: RefinedSlot[] }

/** The plan the student is looking at, the way the chat mode reads it. */
export function planForChat(week: Record<number, GeneratorResult> | null, single: GeneratorResult | null, activeDays: number[]): { days: ChatDay[] } {
  if (!week) return { days: single ? [{ day: 'all', slots: draftSlots(single) }] : [] };
  const days = Object.keys(week).map(Number).sort((a, b) => a - b)
    .filter(day => activeDays.includes(day % 7))
    .map(day => ({ day, slots: draftSlots(week[day]) }));
  return { days };
}

/** "24:00" (midnight as an end time) as the last minute of the day, which
 *  the rest of the app can store and compare. */
const endOfDay = (t: string) => (t === '24:00' ? '23:59' : t);

/** Turns the chat answer's days into the plan to show: one day for every
 *  active day ('all'), or a week that starts from the current one with the
 *  answered days replaced. A day answered with no sessions becomes a day off.
 *  Returns null (with the reason) when a day doesn't pass the checks. */
export function chatPlan(
  days: ChatDay[],
  current: Record<number, GeneratorResult> | null,
  base: GeneratorResult,
  ctx: RefineContext,
  activeDays: number[],
): { ok: true; single: GeneratorResult | null; week: Record<number, GeneratorResult> | null; activeDays: number[] } | { ok: false; reason: string } {
  const fix = (slots: RefinedSlot[]) => slots.map(x => ({ ...x, start_time: endOfDay(x.start_time), end_time: endOfDay(x.end_time) }));
  const all = days.find(d => d.day === 'all');
  if (all) {
    const check = checkRefined(fix(all.slots), base, { ...ctx, requestNow: true });
    if (!check.ok) return check;
    return { ok: true, single: toResult(check.slots, base), week: null, activeDays };
  }
  const week: Record<number, GeneratorResult> = { ...(current ?? Object.fromEntries(activeDays.map(day => [day, base]))) };
  let active = [...activeDays];
  for (const d of days) {
    const day = d.day as number;
    if (!d.slots.length) {
      delete week[day];
      if (day < 7) active = active.filter(x => x !== day);
      continue;
    }
    const check = checkRefined(fix(d.slots), base, { ...ctx, requestNow: true });
    if (!check.ok) return { ok: false, reason: `${day}: ${check.reason}` };
    week[day] = toResult(check.slots, base);
    if (day < 7 && !active.includes(day)) active.push(day);
  }
  return { ok: true, single: null, week, activeDays: active.sort((a, b) => a - b) };
}
