import { describe, it, expect } from 'vitest';
import {
  subjectChoices, hasSavedSetup, hoursOptions, minutesFromOptionId, parseStudyMinutes, parseClock,
  fmtClock, clockOptions, siteFromText, clearMatch, filterOptions,
} from './wynkyChatFlow';
import { recommend, type WynkyKnownProfile, type WynkyRemembered } from './wynkyPlanner';

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
