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

/** Earlier typed requests, newest first, without repeats. */
export function standingRequests(events: { field: string; value: string; action: string; at: string }[], max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    if (e.field !== 'note' || e.action !== 'requested') continue;
    const key = e.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e.value.trim());
    if (out.length >= max) break;
  }
  return out;
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
