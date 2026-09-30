import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../../_shared/scheduleGenerator';
import { chatPlan, checkRefined, droppedRules, memoryLines, checkRefinedWeek, draftSlots, planForChat, recentChat, standingRequests, toResult, type RefineContext } from './wynkyRefine';
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

describe('recentChat', () => {
  const chat = [
    { from: 'divider', text: 'Your last chat was earlier today' },
    { from: 'user', text: 'more physics please' },
    { from: 'bot', text: 'Here is your plan:\n09:00-10:00 Physics' },
    { from: 'user', text: 'make it shorter' },
    { from: 'bot', text: "Got it. I'll build your plan around that." },
  ];

  it('keeps earlier turns oldest first and leaves out the message being answered', () => {
    expect(recentChat(chat, 'make it shorter')).toEqual([
      { sender: 'user', text: 'more physics please' },
      { sender: 'bot', text: 'Here is your plan:\n09:00-10:00 Physics' },
    ]);
  });

  it('matches a one-day edit by its first line and keeps everything when nothing matches', () => {
    expect(recentChat(chat, 'make it shorter\n(This change is only for Monday.)')).toHaveLength(2);
    expect(recentChat(chat, null)).toHaveLength(4);
  });

  it('caps how many turns and how much text are sent', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ from: i % 2 ? 'bot' : 'user', text: 'x'.repeat(2000) }));
    const out = recentChat(many, null);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.every(t => t.text.length <= (t.sender === 'bot' ? 1500 : 300))).toBe(true);
    expect(out.reduce((n, t) => n + t.text.length, 0)).toBeLessThanOrEqual(6000);
  });
});

describe('standingRequests with requests taken back', () => {
  it('drops a request whose newest event is removed', () => {
    const events = [
      { field: 'note', value: 'coaching 4-7 pm', action: 'requested', at: '2026-09-01T00:00:00Z' },
      { field: 'note', value: 'Coaching 4-7 pm', action: 'removed', at: '2026-09-02T00:00:00Z' },
      { field: 'note', value: 'Chemistry every day', action: 'requested', at: '2026-09-03T00:00:00Z' },
    ];
    expect(standingRequests(events)).toEqual(['Chemistry every day']);
  });
});

describe('chatPlan', () => {
  const all = [0, 1, 2, 3, 4, 5, 6];
  const chatCtx = { ...ctx, requestNow: true };

  it('turns an "all" answer into one plan for every active day, with midnight as 23:59', () => {
    const r = chatPlan([{ day: 'all', slots: [slot('05:30', '07:00', 'Chemistry'), slot('22:30', '24:00', 'physics')] }], null, draft, chatCtx, all);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.week).toBeNull();
    expect(draftSlots(r.single!)).toEqual([slot('05:30', '07:00', 'Chemistry'), slot('22:30', '23:59', 'Physics')]);
    expect(r.single!.placedStudyMinutes).toBe(179);
  });

  it('replaces only the answered days of the current week, and an empty day becomes a day off', () => {
    const current = Object.fromEntries(all.map(d => [d, draft]));
    const r = chatPlan([{ day: 2, slots: [slot('17:00', '18:30', 'Maths')] }, { day: 0, slots: [] }], current, draft, chatCtx, all);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activeDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.week![0]).toBeUndefined();
    expect(draftSlots(r.week![2])).toEqual([slot('17:00', '18:30', 'Maths')]);
    expect(r.week![3]).toBe(draft);
  });

  it('rejects a day with overlapping sessions', () => {
    const r = chatPlan([{ day: 1, slots: [slot('17:00', '18:30', 'Maths'), slot('18:00', '19:00', 'Physics')] }], null, draft, chatCtx, all);
    expect(r.ok).toBe(false);
  });

  it('describes the current plan per active day for the chat', () => {
    const week = { 1: draft, 2: draft, 7: draft };
    expect(planForChat(week, null, [1]).days.map(d => d.day)).toEqual([1]);
    expect(planForChat(null, draft, all).days[0].day).toBe('all');
  });
});

describe('memoryLines', () => {
  it('puts memory first and drops repeats ignoring case', () => {
    expect(memoryLines(['Chemistry every day', 'exam in April'], ['chemistry every day ', 'no maths after 9 pm'], 40))
      .toEqual(['Chemistry every day', 'exam in April', 'no maths after 9 pm'])
  })
  it('caps the list', () => {
    expect(memoryLines(['a', 'b', 'c'], ['d'], 2)).toEqual(['a', 'b'])
  })
})

describe('droppedRules', () => {
  it('returns rules no longer followed', () => {
    expect(droppedRules(['Chemistry every day', '2 subjects a day'], ['2 Subjects a day'])).toEqual(['Chemistry every day'])
  })
})
