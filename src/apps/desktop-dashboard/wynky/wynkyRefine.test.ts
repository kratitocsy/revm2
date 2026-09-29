import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../../_shared/scheduleGenerator';
import { checkRefined, checkRefinedWeek, draftSlots, standingRequests, toResult, type RefineContext } from './wynkyRefine';
import { weakSubjects } from './wynkyPlanner';

const subjects = ['Physics', 'Chemistry', 'Maths'];
const draft = generateSchedule({
  wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 4, blockLengthMinutes: 60,
  subjects: subjects.map((name, i) => ({ id: `s${i}`, name })),
  fixedCommitments: [{ start: '08:00', end: '14:00' }],
});
const ctx: RefineContext = {
  subjects, wakeTime: '06:00', sleepTime: '23:00', busy: [{ start: '08:00', end: '14:00' }],
  requestNow: false, standingRequests: [],
};
const slot = (start_time: string, end_time: string, subject: string) => ({ start_time, end_time, subject });

describe('checkRefined', () => {
  it('accepts the draft itself', () => {
    expect(checkRefined(draftSlots(draft), draft, ctx).ok).toBe(true);
  });

  it('matches subject names without caring about case', () => {
    const r = checkRefined([slot('14:30', '15:30', 'maths'), slot('15:40', '16:40', 'PHYSICS'), slot('17:00', '18:00', 'Chemistry'), slot('18:10', '19:10', 'Maths')], draft, ctx);
    expect(r.ok && r.slots.map(s => s.subject)).toEqual(['Maths', 'Physics', 'Chemistry', 'Maths']);
  });

  it('rejects study during school, overlaps, unknown subjects and a very different total', () => {
    expect(checkRefined([slot('09:00', '13:00', 'Maths')], draft, ctx).ok).toBe(false);
    expect(checkRefined([slot('15:00', '16:00', 'Maths'), slot('15:30', '16:30', 'Physics')], draft, ctx).ok).toBe(false);
    expect(checkRefined([slot('15:00', '16:00', 'Biology')], draft, ctx).ok).toBe(false);
    expect(checkRefined([slot('15:00', '16:00', 'Maths')], draft, ctx).ok).toBe(false);
  });

  it('keeps study inside waking hours unless the student asked otherwise', () => {
    const late = [slot('14:30', '15:30', 'Maths'), slot('15:40', '16:40', 'Physics'), slot('17:00', '18:00', 'Chemistry'), slot('22:00', '23:00', 'Maths')];
    expect(checkRefined(late, draft, ctx).ok).toBe(false);
    expect(checkRefined(late, draft, { ...ctx, standingRequests: ['I like studying late'] }).ok).toBe(true);
  });

  it("lets a request made just now change the hours and busy time, since the student's words win", () => {
    expect(checkRefined([slot('10:00', '11:00', 'Maths')], draft, { ...ctx, requestNow: true }).ok).toBe(true);
  });
});

describe('toResult', () => {
  it("keeps the draft's sleep block and counts the new study time", () => {
    const r = toResult([slot('14:30', '15:30', 'Maths'), slot('15:40', '16:40', 'Physics')], draft);
    expect(r.placedStudyMinutes).toBe(120);
    expect(r.blocks.filter(b => b.kind === 'sleep')).toHaveLength(1);
    expect(r.blocks.filter(b => b.kind === 'break')).toHaveLength(1);
  });
});

describe('checkRefinedWeek', () => {
  // A varied week is only ever requested via a typed request, so the busy-
  // time/wake-sleep/total checks relax the same way a single-day request does.
  const weekCtx: RefineContext = { ...ctx, requestNow: true };
  const oneDay = [slot('14:30', '15:30', 'Maths'), slot('15:40', '16:40', 'Physics')];
  const sevenDays = (day: number) => ({ day, slots: oneDay });

  it('accepts exactly 7 distinct days, each checked like a single day', () => {
    const days = Array.from({ length: 7 }, (_, i) => sevenDays(i));
    const r = checkRefinedWeek(days, draft, weekCtx);
    expect(r.ok).toBe(true);
    expect(r.ok && Object.keys(r.days)).toHaveLength(7);
  });

  it('rejects anything other than 7 days', () => {
    expect(checkRefinedWeek([sevenDays(0)], draft, weekCtx).ok).toBe(false);
  });

  it('rejects a duplicate day number', () => {
    const days = [sevenDays(0), sevenDays(0), sevenDays(2), sevenDays(3), sevenDays(4), sevenDays(5), sevenDays(6)];
    expect(checkRefinedWeek(days, draft, weekCtx).ok).toBe(false);
  });

  it("rejects a day whose slots break the single-day rules (overlapping blocks)", () => {
    const badDay = [slot('14:30', '15:30', 'Maths'), slot('15:00', '16:00', 'Physics')];
    const days = Array.from({ length: 7 }, (_, i) => i === 0 ? { day: 0, slots: badDay } : sevenDays(i));
    expect(checkRefinedWeek(days, draft, weekCtx).ok).toBe(false);
  });
});

describe('standingRequests', () => {
  it('returns earlier typed requests, newest first, without repeats', () => {
    const e = (value: string, at: string, field = 'note', action = 'requested') => ({ field, value, action, at });
    expect(standingRequests([
      e('maths first', '2026-09-01T00:00:00Z'), e('No study after 9 pm', '2026-09-03T00:00:00Z'),
      e('Maths first', '2026-09-02T00:00:00Z'), e('5 hours', '2026-09-04T00:00:00Z', 'daily_minutes'),
    ])).toEqual(['No study after 9 pm', 'Maths first']);
  });
});

describe('weakSubjects', () => {
  it('picks subjects studied well below average in the last 30 days', () => {
    expect(weakSubjects(subjects, { bySubject: { physics: 600, chemistry: 500, maths: 60 }, sessions: 12 })).toEqual(['Maths']);
  });
  it('needs a few sessions of history first', () => {
    expect(weakSubjects(subjects, { bySubject: { physics: 60 }, sessions: 1 })).toEqual([]);
  });
});
