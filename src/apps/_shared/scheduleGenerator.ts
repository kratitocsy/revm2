/* ============================================================
   scheduleGenerator.ts

   Rule-based schedule generator from the Wynko Quiz Bot spec,
   Section 5 ("Rule-Based Generator (no AI, under 1 second)").
   Pure function, no Supabase/network calls — the caller is
   responsible for turning the returned blocks into
   focus_lock_schedules / focus_lock_schedule_slots rows.

   Algorithm (spec wording in comments below each step):
   1. Usable window = [wake+1h, sleep-1h], minus fixed commitments.
   2. Cap requested study time to the smaller of requested vs. free
      window. Report if it was cut.
   3. Weight subjects — weak subjects (quiz Q3 "is_weak") get 1.5x
      time. Divide total time proportionally.
   4. Block length comes from the quiz's duration-bucket answer
      (20-30 / 45-60 / 90 / 120+ min) — passed in as
      blockLengthMinutes, a single representative number per user.
   5. Order: alternate between weak and non-weak subjects rather
      than bunching one subject's blocks together (spec: "Order:
      hardest or weakest subject first (highest energy). Alternate
      heavy and light."). With only a boolean weak/not-weak signal
      from the quiz (no per-subject difficulty scale), "alternate
      heavy and light" is implemented as round-robin between the
      weak group and the rest, weak group going first each round.
   6. 10-15 min break after each block; 30 min break after 3 hours
      of cumulative study.
   7. Sleep block blocks everything except alarm/calls (caller
      applies the actual block-list; this just marks the block).
*/

export interface FixedCommitment {
  /** "HH:MM", 24h */
  start: string;
  /** "HH:MM", 24h */
  end: string;
}

export interface SubjectInput {
  id: string;
  name: string;
  isWeak?: boolean;
}

export interface GeneratorInput {
  /** "HH:MM" — when the student wakes up. */
  wakeTime: string;
  /** "HH:MM" — when the student goes to sleep. May be past midnight (e.g. "01:00"). */
  sleepTime: string;
  /** Quiz Q5 answer, in hours (e.g. 6 for "6-7h" bucket's midpoint). */
  dailyHoursRequested: number;
  subjects: SubjectInput[];
  /** School/coaching blocks etc. to subtract from the usable window. */
  fixedCommitments?: FixedCommitment[];
  /** Quiz duration-bucket answer, in minutes (20-30/45-60/90/120+). */
  blockLengthMinutes: number;
  /** Default 10 (spec: "10-15 min break after each block"). */
  breakAfterBlockMinutes?: number;
  /** Default 180 (3h) — spec: "Add 30 min break after 3 hours." */
  longBreakEveryMinutes?: number;
  /** Default 30 — the long-break duration itself. */
  longBreakMinutes?: number;
}

export type BlockKind = 'study' | 'break' | 'sleep';

export interface GeneratedBlock {
  kind: BlockKind;
  /** Minutes from midnight, start of block (may exceed 1440 for post-midnight sleep). */
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  subjectId?: string;
  subjectName?: string;
}

export interface GeneratorResult {
  blocks: GeneratedBlock[];
  requestedMinutes: number;
  usableWindowMinutes: number;
  scheduledStudyMinutes: number;
  wasCut: boolean;
}

// ── time helpers ──────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

interface Interval {
  start: number;
  end: number;
}

/** Subtract `subtract` intervals from `base`, returning the remaining free intervals, sorted. */
function subtractIntervals(base: Interval, subtract: Interval[]): Interval[] {
  let free: Interval[] = [base];
  for (const sub of subtract) {
    const next: Interval[] = [];
    for (const f of free) {
      const s = Math.max(sub.start, f.start);
      const e = Math.min(sub.end, f.end);
      if (s >= e) {
        // no overlap
        next.push(f);
        continue;
      }
      if (f.start < s) next.push({ start: f.start, end: s });
      if (e < f.end) next.push({ start: e, end: f.end });
    }
    free = next;
  }
  return free.filter((f) => f.end > f.start).sort((a, b) => a.start - b.start);
}

function intervalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}

// ── generator ─────────────────────────────────────────────────
export function generateSchedule(input: GeneratorInput): GeneratorResult {
  const breakAfterBlockMinutes = input.breakAfterBlockMinutes ?? 10;
  const longBreakEveryMinutes = input.longBreakEveryMinutes ?? 180;
  const longBreakMinutes = input.longBreakMinutes ?? 30;
  const blockLength = Math.max(5, input.blockLengthMinutes);

  const wakeMin = timeToMinutes(input.wakeTime) + 60; // Step 1: wake +1h
  let sleepMin = timeToMinutes(input.sleepTime) - 60; // Step 1: sleep -1h
  if (sleepMin <= wakeMin) sleepMin += 1440; // sleep time is past midnight

  const fixed: Interval[] = (input.fixedCommitments ?? []).map((c) => {
    const s = timeToMinutes(c.start);
    let e = timeToMinutes(c.end);
    if (e <= s) e += 1440;
    return { start: s, end: e };
  });

  const freeIntervals = subtractIntervals({ start: wakeMin, end: sleepMin }, fixed);
  const usableWindowMinutes = intervalMinutes(freeIntervals);

  // Step 2: cap requested hours to the free window.
  const requestedMinutes = Math.round(input.dailyHoursRequested * 60);
  const scheduledStudyMinutes = Math.min(requestedMinutes, usableWindowMinutes);
  const wasCut = requestedMinutes > usableWindowMinutes;

  // Step 3: weight subjects — weak = 1.5x.
  const subjects = input.subjects.length > 0 ? input.subjects : [];
  const weights = subjects.map((s) => (s.isWeak ? 1.5 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  // Step 4: convert each subject's proportional minutes into a block count.
  const blockCounts = subjects.map((s, i) => {
    const subjectMinutes = subjects.length > 0 ? (scheduledStudyMinutes * weights[i]) / totalWeight : 0;
    return Math.max(0, Math.round(subjectMinutes / blockLength));
  });

  // Step 5: round-robin ordering, weak subjects' turn comes first each round.
  const order = subjects
    .map((s, i) => ({ subject: s, weak: !!s.isWeak, index: i }))
    .sort((a, b) => Number(b.weak) - Number(a.weak));

  const remaining = order.map((o) => blockCounts[o.index]);
  const blockQueue: SubjectInput[] = [];
  let anyLeft = remaining.some((r) => r > 0);
  while (anyLeft) {
    anyLeft = false;
    for (let i = 0; i < order.length; i++) {
      if (remaining[i] > 0) {
        blockQueue.push(order[i].subject);
        remaining[i] -= 1;
        if (remaining[i] > 0) anyLeft = true;
      }
    }
  }

  // Step 6/7: walk free intervals, placing study blocks + breaks.
  const blocks: GeneratedBlock[] = [];
  let intervalIdx = 0;
  let cursor = freeIntervals[0]?.start ?? wakeMin;
  let sinceLongBreak = 0;

  const advanceToNextInterval = (): boolean => {
    intervalIdx += 1;
    if (intervalIdx >= freeIntervals.length) return false;
    cursor = freeIntervals[intervalIdx].start;
    return true;
  };

  for (let qi = 0; qi < blockQueue.length; qi++) {
    const subject = blockQueue[qi];
    // Skip forward past any interval we've exhausted.
    while (
      intervalIdx < freeIntervals.length &&
      cursor + blockLength > freeIntervals[intervalIdx].end
    ) {
      if (!advanceToNextInterval()) break;
    }
    if (intervalIdx >= freeIntervals.length) break; // ran out of usable window

    const start = cursor;
    const end = start + blockLength;
    blocks.push({
      kind: 'study',
      startMinutes: start,
      endMinutes: end,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      subjectId: subject.id,
      subjectName: subject.name,
    });
    cursor = end;
    sinceLongBreak += blockLength;

    const isLastBlock = qi === blockQueue.length - 1;
    if (!isLastBlock) {
      const takeLongBreak = sinceLongBreak >= longBreakEveryMinutes;
      const breakLen = takeLongBreak ? longBreakMinutes : breakAfterBlockMinutes;
      if (takeLongBreak) sinceLongBreak = 0;

      // Only insert the break if it still fits in the current interval;
      // otherwise just let the next block roll into the next interval.
      if (cursor + breakLen <= (freeIntervals[intervalIdx]?.end ?? cursor)) {
        blocks.push({
          kind: 'break',
          startMinutes: cursor,
          endMinutes: cursor + breakLen,
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(cursor + breakLen),
        });
        cursor += breakLen;
      }
    }
  }

  // Sleep block: original sleep time -> original wake time (next day).
  const sleepStart = timeToMinutes(input.sleepTime);
  let wakeNext = timeToMinutes(input.wakeTime) + 1440;
  if (wakeNext <= sleepStart) wakeNext += 1440;
  blocks.push({
    kind: 'sleep',
    startMinutes: sleepStart,
    endMinutes: wakeNext,
    startTime: minutesToTime(sleepStart),
    endTime: minutesToTime(wakeNext),
  });

  return {
    blocks,
    requestedMinutes,
    usableWindowMinutes,
    scheduledStudyMinutes,
    wasCut,
  };
}
