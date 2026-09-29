import { describe, it, expect } from 'vitest';
import {
  subjectChoices, hasSavedSetup, hoursOptions, minutesFromOptionId, parseStudyMinutes, parseClock,
  fmtClock, clockOptions, siteFromText, clearMatch, filterOptions, wantsWeeklyVariation, formatWeeklyPlan,
  repeatWeek, formatDayOverrides, mentionsWeek, mentionedDays, repeatFromText, wantsDaysOff, mentionsWeekB,
  dayLabel, planDays,
} from './wynkyChatFlow';
import { recommend, type WynkyKnownProfile, type WynkyRemembered } from './wynkyPlanner';
import type { GeneratorResult } from '../../_shared/scheduleGenerator';

const known = (over: Partial<WynkyKnownProfile> = {}): WynkyKnownProfile => ({
  subjects: [], exam: null, dailyHoursBucket: null, customDailyHoursText: null, distractionTags: [], customDistractionText: null,
  dna: { dayType: null, studyStyle: [], challenges: [], archetype: null }, ...over,
});
const remembered = (over: Partial<WynkyRemembered> = {}): WynkyRemembered => ({
  wakeTime: null, sleepTime: null, subjectAllowlists: {}, lastDailyMinutes: null, acceptedCount: 0, adjustedCount: 0, ...over,
});

describe('subjectChoices', () => {
  it('offers the exam subjects when onboarding saved none', () => {
    expect(subjectChoices(known({ exam: 'jee main' }), remembered())).toEqual(['Physics', 'Chemistry', 'Maths']);
  });
  it('puts saved and onboarding subjects first, without case duplicates', () => {
    const r = remembered({ subjectAllowlists: { Organic: { sites: ['pw.live'], apps: [] } } });
    expect(subjectChoices(known({ exam: 'NEET', subjects: ['biology', 'Physics'] }), r))
      .toEqual(['Organic', 'biology', 'Physics', 'Chemistry']);
  });
});

describe('hasSavedSetup', () => {
  it('needs at least one subject with something to enforce', () => {
    expect(hasSavedSetup(remembered({ subjectAllowlists: { Physics: { sites: [], apps: [] } } }))).toBe(false);
    expect(hasSavedSetup(remembered({ subjectAllowlists: { Physics: { sites: [], apps: [], channels: [{ id: '@pw', label: 'PW' }] } } }))).toBe(true);
  });
});

describe('hoursOptions', () => {
  it('marks the usual amount first when it is not one of the ranges', () => {
    const opts = hoursOptions(known(), remembered({ lastDailyMinutes: 210 }));
    expect(opts[0]).toEqual({ id: 'm210', label: 'About 3.5 hours (your usual)' });
    expect(minutesFromOptionId(opts[0].id)).toBe(210);
  });
  it('marks the matching range when the quiz answer is one', () => {
    const opts = hoursOptions(known({ dailyHoursBucket: '4-6' }), remembered());
    expect(opts.map(o => o.label)).toEqual(['1–2 hours', '2–4 hours', '4–6 hours (from your quiz)', '6–8 hours']);
  });
});

describe('parseStudyMinutes', () => {
  it.each([['5', 300], ['4.5 hours', 270], ['90 min', 90], ['about 3h today', 180]])('%s -> %i', (text, minutes) => {
    expect(parseStudyMinutes(text)).toBe(minutes);
  });
  it('rejects amounts that make no sense for one day', () => {
    expect(parseStudyMinutes('20')).toBeNull();
    expect(parseStudyMinutes('10 min')).toBeNull();
    expect(parseStudyMinutes('lots')).toBeNull();
  });
});

describe('parseClock', () => {
  it.each([
    ['6', 'wake', '06:00'], ['6:30 am', 'wake', '06:30'], ['6.45', 'wake', '06:45'],
    ['11', 'sleep', '23:00'], ['11 pm', 'sleep', '23:00'], ['12', 'sleep', '00:00'], ['12:30 am', 'sleep', '00:30'],
    ['1', 'sleep', '01:00'], ['23:30', 'sleep', '23:30'], ['7 PM', 'wake', '19:00'],
  ] as const)('%s (%s) -> %s', (text, kind, out) => {
    expect(parseClock(text, kind)).toBe(out);
  });
  it('rejects things that are not times', () => {
    expect(parseClock('25:00', 'wake')).toBeNull();
    expect(parseClock('13 pm', 'sleep')).toBeNull();
    expect(parseClock('early', 'wake')).toBeNull();
  });
});

describe('clock options', () => {
  it('formats and puts the remembered time first', () => {
    expect(fmtClock('00:30')).toBe('12:30 AM');
    const opts = clockOptions('sleep', '23:15');
    expect(opts[0]).toEqual({ id: '23:15', label: '11:15 PM (usual)' });
    expect(opts.some(o => o.id === '00:00' && o.label === '12:00 AM')).toBe(true);
  });
});

describe('siteFromText', () => {
  it('reduces a typed site to its domain and rejects names', () => {
    expect(siteFromText('https://www.Allen.ac.in/courses')).toBe('allen.ac.in');
    expect(siteFromText('allen')).toBeNull();
    expect(siteFromText('physics wallah')).toBeNull();
    expect(siteFromText('4.5')).toBeNull();
  });
});

describe('matching typed answers to options', () => {
  const opts = [{ id: 'a', label: 'Physics Wallah' }, { id: 'b', label: 'Physical Education' }, { id: 'c', label: 'Maths' }];
  it('filters and only treats an exact or single match as the answer', () => {
    expect(filterOptions(opts, 'phys').map(o => o.id)).toEqual(['a', 'b']);
    expect(clearMatch(opts, 'phys')).toBeNull();
    expect(clearMatch(opts, 'wallah')?.id).toBe('a');
    expect(clearMatch(opts, 'MATHS')?.id).toBe('c');
  });
});

describe('recommended day across midnight', () => {
  it('still plans study when bedtime is after midnight', () => {
    const r = recommend({ wakeTime: '06:30', sleepTime: '00:30', dailyMinutes: 240, subjects: ['Physics'], blockLengthMinutes: 60 });
    expect(r.blocks.some(b => b.kind === 'study')).toBe(true);
    expect(r.scheduledStudyMinutes).toBeGreaterThan(0);
  });
});

describe('wantsWeeklyVariation', () => {
  it('detects a request for a plan that differs by day', () => {
    expect(wantsWeeklyVariation('give me weekly plan for each day of week')).toBe(true);
    expect(wantsWeeklyVariation('different subjects every day this week')).toBe(true);
    expect(wantsWeeklyVariation('can you do a day-wise weekly schedule')).toBe(true);
  });

  it('does not fire for a plain weekly request (repeat the same day)', () => {
    expect(wantsWeeklyVariation('give me a weekly plan')).toBe(false);
    expect(wantsWeeklyVariation('apply this to the whole week')).toBe(false);
    expect(wantsWeeklyVariation('I want 5 hours a day')).toBe(false);
  });
});

describe('formatWeeklyPlan', () => {
  it('lists all 7 days with their subjects and totals', () => {
    const day = (subject: string): GeneratorResult => ({
      blocks: [{ kind: 'study', startMinutes: 360, endMinutes: 420, startTime: '06:00', endTime: '07:00', subjectName: subject }],
      requestedMinutes: 60, usableWindowMinutes: 60, scheduledStudyMinutes: 60, placedStudyMinutes: 60,
      blockLengthMinutes: 60, wasCut: false,
    });
    const text = formatWeeklyPlan({ 0: day('Biology'), 1: day('Physics') });
    expect(text).toContain('Sun: Biology');
    expect(text).toContain('Mon: Physics');
    expect(text).toContain('Tue: off');
  });
});

describe('mentionsWeek', () => {
  it('spots a request about the week, so Wynky can ask same or different', () => {
    expect(mentionsWeek('make me a weekly plan')).toBe(true);
    expect(mentionsWeek('plan for this week')).toBe(true);
    expect(mentionsWeek('more maths please')).toBe(false);
    expect(mentionsWeek('weekend free')).toBe(false);
  });
});

describe('repeatWeek', () => {
  it('uses the same day for all seven days', () => {
    const day = { blocks: [] } as never;
    const week = repeatWeek(day);
    expect(Object.keys(week).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week[3]).toBe(day);
  });
});

describe('formatDayOverrides', () => {
  it('lists each day-specific subject set-up, Monday first', () => {
    const text = formatDayOverrides({
      0: { Maths: { sites: ['khanacademy.org'], apps: [] } },
      2: { Physics: { sites: ['eduniti.in', 'youtube.com'], channels: [{ id: 'a', title: 'A' }] as never, apps: ['notes'] } },
    });
    expect(text).toBe('Day-specific set-up:\nTue Physics: eduniti.in, youtube.com, 1 channel, 1 app\nSun Maths: khanacademy.org');
  });
  it('names single blocks and Week B days', () => {
    const text = formatDayOverrides({
      2: { 'Physics@17:00': { sites: ['eduniti.in'], apps: [] } },
      9: { Maths: { sites: ['youtube.com'], apps: [] } },
    });
    expect(text).toBe('Day-specific set-up:\nWeek A Tue Physics 17:00: eduniti.in\nWeek B Tue Maths: youtube.com');
  });
  it('is empty when nothing is customised', () => {
    expect(formatDayOverrides({})).toBe('');
  });
});

describe('mentionedDays', () => {
  it('finds named days, weekends and weekdays', () => {
    expect(mentionedDays('move Tuesday physics to 5 pm', -1)).toEqual([2]);
    expect(mentionedDays('tues and thurs maths', -1)).toEqual([2, 4]);
    expect(mentionedDays('no study on weekends', -1)).toEqual([0, 6]);
    expect(mentionedDays('weekdays only', -1)).toEqual([1, 2, 3, 4, 5]);
    expect(mentionedDays('more maths please', -1)).toEqual([]);
  });
  it('reads today and tomorrow only when asked to', () => {
    expect(mentionedDays('physics today, maths tomorrow', 6)).toEqual([0, 6]);
    expect(mentionedDays('physics today', -1)).toEqual([]);
  });
});

describe('repeatFromText', () => {
  it('spots every other week and two alternating weeks', () => {
    expect(repeatFromText('repeat it every 2 weeks')).toBe('every2');
    expect(repeatFromText('a fortnightly plan')).toBe('every2');
    expect(repeatFromText('every other week')).toBe('every2');
    expect(repeatFromText('week A and week B should be different')).toBe('ab');
    expect(repeatFromText('two different weeks that alternate')).toBe('ab');
    expect(repeatFromText('a weekly plan')).toBeNull();
  });
});

describe('wantsDaysOff and mentionsWeekB', () => {
  it('tells a day off from a change to that day', () => {
    expect(wantsDaysOff('Sunday off')).toBe(true);
    expect(wantsDaysOff('no study on Saturday')).toBe(true);
    expect(wantsDaysOff('move Tuesday physics to 5 pm')).toBe(false);
    expect(mentionsWeekB('week B tuesday more chemistry')).toBe(true);
    expect(mentionsWeekB('tuesday more chemistry')).toBe(false);
  });
});

describe('two-week plans', () => {
  const day = (subject: string): GeneratorResult => ({
    blocks: [{ kind: 'study', startMinutes: 360, endMinutes: 420, startTime: '06:00', endTime: '07:00', subjectName: subject }],
    requestedMinutes: 60, usableWindowMinutes: 60, scheduledStudyMinutes: 60, placedStudyMinutes: 60,
    blockLengthMinutes: 60, wasCut: false,
  });
  it('labels and orders Week A then Week B', () => {
    expect(planDays(true)).toEqual([1, 2, 3, 4, 5, 6, 0, 8, 9, 10, 11, 12, 13, 7]);
    expect(dayLabel(9)).toBe('Week B Tue');
    expect(dayLabel(2)).toBe('Tue');
  });
  it('shows both weeks, days off and the repeat', () => {
    const week = Object.fromEntries(planDays(true).map(d => [d, day(d >= 7 ? 'Chemistry' : 'Physics')]));
    const text = formatWeeklyPlan(week, { activeDays: [1, 2, 3, 4, 5] });
    expect(text).toContain('Week A (this week):\nMon: Physics 06:00 (1 hour)');
    expect(text).toContain('Week B (next week):\nMon: Chemistry 06:00 (1 hour)');
    expect(text).toContain('Sun: off');
    expect(text).toContain('take turns');
    expect(formatWeeklyPlan(repeatWeek(day('Maths')), { repeat: 'every2' })).toContain('every 2 weeks');
  });
});
