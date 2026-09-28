import { describe, it, expect } from 'vitest';
import {
  rank, best, preselect, isSettled, latestOwn, blendWeights, personalEvidence, blockMinutesPriors, sitePriors, busyPriors,
  parseLocalRequest, type WynkyEvent,
} from './wynkyRecommender';
import { parseClock, siteFromText, parseBusyText } from './wynkyChatFlow';

const NOW = Date.parse('2026-09-27T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const ev = (field: string, value: string, action: WynkyEvent['action'] = 'accepted', age = 1, multi = false): WynkyEvent =>
  ({ field, value, action, at: daysAgo(age), multi });
const helpers = { parseClock, siteFromText };

describe('blend weights', () => {
  it('moves trust to the student as they answer, and to peers as the cohort grows', () => {
    expect(blendWeights(0, 0)).toEqual({ you: 0, peers: 0, prior: 1 });
    expect(blendWeights(0, 3).peers).toBe(0); // under 5 students: no crowd signal
    expect(blendWeights(0, 20).peers).toBeCloseTo(0.8); // Study DNA keeps a say
    expect(blendWeights(1, 20).you).toBeCloseTo(0.4);
    expect(blendWeights(2, 20).you).toBeGreaterThan(0.5);
  });
});

describe('personal evidence', () => {
  it('fades old answers and weights requests higher', () => {
    const recent = personalEvidence([ev('wake', '06:00', 'accepted', 0)], 'wake', NOW).total;
    const old = personalEvidence([ev('wake', '06:00', 'accepted', 28)], 'wake', NOW).total;
    expect(old).toBeCloseTo(recent / 4, 2); // two 14-day half-lives
    const req = personalEvidence([ev('wake', '06:00', 'requested', 0)], 'wake', NOW).total;
    expect(req).toBeCloseTo(3);
  });
  it('drops a value the student removed', () => {
    const { byValue } = personalEvidence([ev('sites:physics', 'pw.live', 'accepted', 5, true), ev('sites:physics', 'pw.live', 'removed', 1, true)], 'sites:physics', NOW);
    expect(byValue.has('pw.live')).toBe(false);
  });
});

describe('rank', () => {
  const peers = { cohort: 'exam' as const, cohortUsers: 40, counts: [{ value: '06:00', users: 30 }, { value: '07:00', users: 10 }] };

  it('uses the crowd for a new student', () => {
    const top = best({ field: 'wake', events: [], peers, now: NOW });
    expect(top).toMatchObject({ value: '06:00', source: 'peers' });
  });

  it("lets one kept answer outweigh the crowd's favourite", () => {
    const top = best({ field: 'wake', events: [ev('wake', '07:00'), ev('wake', '07:00', 'accepted', 3)], peers, now: NOW });
    expect(top).toMatchObject({ value: '07:00', source: 'you' });
  });

  it('puts what the student asked for first and says so', () => {
    const top = best({ field: 'wake', events: [ev('wake', '05:30', 'requested')], peers, now: NOW });
    expect(top).toMatchObject({ value: '05:30', source: 'request' });
  });

  it('falls back to Study DNA with no history and no peers', () => {
    const top = best({ field: 'block_minutes', events: [], priors: blockMinutesPriors({ dayType: null, studyStyle: [], challenges: [], archetype: 'Sprinter' }), now: NOW });
    expect(top).toMatchObject({ value: '45', source: 'study_dna' });
  });

  it('adds also-picked and other-exam signals for channels', () => {
    const ranked = rank({
      field: 'channels:physics', events: [], now: NOW,
      extras: [{ value: '@a', share: 1, source: 'also_picked' }, { value: '@b', share: 1, source: 'other_exams' }],
    });
    expect(ranked.map(c => c.value)).toEqual(['@a', '@b']);
    expect(ranked[1].source).toBe('other_exams');
  });

  it('pre-ticks kept and strong picks only', () => {
    const picks = preselect({
      field: 'sites:physics', now: NOW,
      events: [ev('sites:physics', 'allen.ac.in', 'accepted', 1, true)],
      peers: { cohort: 'exam', cohortUsers: 30, counts: [{ value: 'pw.live', users: 25 }, { value: 'vedantu.com', users: 3 }] },
    });
    expect(picks.map(c => c.value)).toContain('allen.ac.in');
    expect(picks.map(c => c.value)).toContain('pw.live');
    expect(picks.map(c => c.value)).not.toContain('vedantu.com');
  });
});

describe('removals', () => {
  it('keeps a removed site out even when peers and Study DNA like it', () => {
    const ranked = rank({
      field: 'sites:physics', now: NOW,
      events: [ev('sites:physics', 'youtube.com', 'accepted', 5, true), ev('sites:physics', 'youtube.com', 'removed', 1, true)],
      peers: { cohort: 'exam', cohortUsers: 30, counts: [{ value: 'youtube.com', users: 25 }] },
      priors: [{ value: 'youtube.com', weight: 1, source: 'study_dna' }],
    });
    expect(ranked.map(c => c.value)).not.toContain('youtube.com');
  });
  it('lets a later re-add bring it back', () => {
    const ranked = rank({ field: 'sites:physics', now: NOW, events: [ev('sites:physics', 'pw.live', 'removed', 5, true), ev('sites:physics', 'pw.live', 'accepted', 1, true)] });
    expect(ranked.map(c => c.value)).toContain('pw.live');
  });
  it('reads the latest own answer', () => {
    expect(latestOwn([ev('wake', '06:00', 'accepted', 30), ev('wake', '05:30', 'changed', 2)], 'wake')).toBe('05:30');
  });
});

describe('isSettled', () => {
  it('stops asking after the same answer twice, or a request', () => {
    expect(isSettled([ev('wake', '06:00')], 'wake')).toBe(false);
    expect(isSettled([ev('wake', '06:00', 'accepted', 1), ev('wake', '06:00', 'accepted', 2)], 'wake')).toBe(true);
    expect(isSettled([ev('wake', '06:30', 'changed', 1), ev('wake', '06:00', 'accepted', 2)], 'wake')).toBe(false);
    expect(isSettled([ev('wake', '05:00', 'requested', 1)], 'wake')).toBe(true);
  });
});

describe('Study DNA priors', () => {
  const dna = { dayType: 'school_coaching', studyStyle: ['videos', 'practice'], challenges: [], archetype: null };
  it('reads study style and day type', () => {
    expect(sitePriors(dna).map(p => p.value)).toEqual(['youtube.com', 'offline']);
    expect(busyPriors(dna).map(p => p.value)).toEqual(['08:00-14:00', '16:00-19:00']);
    expect(blockMinutesPriors({ ...dna, archetype: 'Marathoner' })[0].value).toBe('90');
  });
});

describe('parseLocalRequest', () => {
  const subjects = ['Physics', 'Maths'];
  it.each([
    ['5 hours', { kind: 'hours', minutes: 300 }],
    ['study 4.5 hours today', { kind: 'hours', minutes: 270 }],
    ['I wake up at 6', { kind: 'wake', time: '06:00' }],
    ['sleep at 11', { kind: 'sleep', time: '23:00' }],
    ['45 minute blocks', { kind: 'block', minutes: 45 }],
    ['pw.live for physics', { kind: 'site', site: 'pw.live', subject: 'Physics' }],
    ['allen.ac.in', { kind: 'site', site: 'allen.ac.in', subject: null }],
  ])('%s', (text, out) => {
    expect(parseLocalRequest(text, subjects, helpers)).toEqual(out);
  });
  it('leaves everything else to the AI', () => {
    expect(parseLocalRequest('I have coaching 4 to 7 on weekdays', subjects, helpers)).toBeNull();
    expect(parseLocalRequest('wake at 6 and study 5 hours', subjects, helpers)).toBeNull();
    expect(parseLocalRequest('maths first please', subjects, helpers)).toBeNull();
    expect(parseLocalRequest('block instagram.com during physics', subjects, helpers)).toBeNull();
    expect(parseLocalRequest('no youtube.com for maths', subjects, helpers)).toBeNull();
  });
});

describe('parseBusyText', () => {
  it.each([
    ['4-7 pm', '16:00-19:00'], ['16:00-19:00', '16:00-19:00'], ['8 to 2', '08:00-14:00'],
    ['11-2 pm', '11:00-14:00'], ['6am-9am', '06:00-09:00'], ['5-8', '17:00-20:00'], ['2-5', '14:00-17:00'], ['6-9', '06:00-09:00'],
  ])('%s -> %s', (text, out) => {
    expect(parseBusyText(text)).toBe(out);
  });
  it('rejects nonsense', () => {
    expect(parseBusyText('after lunch')).toBeNull();
    expect(parseBusyText('25-26')).toBeNull();
    expect(parseBusyText('9 pm-9 am')).toBeNull();
  });
});
