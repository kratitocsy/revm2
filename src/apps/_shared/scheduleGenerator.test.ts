import { describe, it, expect } from 'vitest';
import { generateSchedule, splitBlocks } from './scheduleGenerator';

describe('generateSchedule', () => {
  it('dropper: full self-study, no fixed commitments, 10+ hours requested — gets cut to the usable window', () => {
    const result = generateSchedule({
      wakeTime: '05:00',
      sleepTime: '23:00',
      dailyHoursRequested: 12,
      subjects: [
        { id: 'phy', name: 'Physics', isWeak: false },
        { id: 'chem', name: 'Chemistry', isWeak: true },
        { id: 'math', name: 'Maths', isWeak: false },
      ],
      fixedCommitments: [],
      blockLengthMinutes: 90,
    });

    // usable window = wake+1h (06:00) to sleep-1h (22:00) = 16h = 960min
    expect(result.usableWindowMinutes).toBe(960);
    expect(result.requestedMinutes).toBe(720); // 12h requested
    // 720 <= 960, so NOT cut in this case — sanity check the boundary logic
    expect(result.wasCut).toBe(false);
    expect(result.scheduledStudyMinutes).toBe(720);

    const studyBlocks = result.blocks.filter((b) => b.kind === 'study');
    expect(studyBlocks.length).toBeGreaterThan(0);
    // Chemistry is weak (1.5x weight) so it should get the most blocks among the three.
    const counts: Record<string, number> = {};
    for (const b of studyBlocks) counts[b.subjectName!] = (counts[b.subjectName!] || 0) + 1;
    expect(counts['Chemistry']).toBeGreaterThanOrEqual(counts['Physics']);
    expect(counts['Chemistry']).toBeGreaterThanOrEqual(counts['Maths']);

    // Sleep block present and starts at the original sleep time (not shifted).
    const sleepBlock = result.blocks.find((b) => b.kind === 'sleep');
    expect(sleepBlock?.startTime).toBe('23:00');
  });

  it('12th (school + coaching both): fixed commitments shrink the usable window and cut requested hours', () => {
    const result = generateSchedule({
      wakeTime: '06:00',
      sleepTime: '22:30',
      dailyHoursRequested: 8,
      subjects: [
        { id: 'phy', name: 'Physics' },
        { id: 'chem', name: 'Chemistry' },
      ],
      fixedCommitments: [
        { start: '08:00', end: '14:00' }, // school
        { start: '16:00', end: '19:00' }, // coaching
      ],
      blockLengthMinutes: 45,
    });

    // window: 07:00-21:30 = 870min, minus school (360) minus coaching (180) = 330min
    expect(result.usableWindowMinutes).toBe(330);
    expect(result.requestedMinutes).toBe(480);
    expect(result.wasCut).toBe(true);
    expect(result.scheduledStudyMinutes).toBe(330);

    // No study block should overlap the fixed commitment windows.
    const overlaps = (b: { startMinutes: number; endMinutes: number }, s: number, e: number) =>
      b.startMinutes < e && b.endMinutes > s;
    const schoolStart = 8 * 60;
    const schoolEnd = 14 * 60;
    const coachingStart = 16 * 60;
    const coachingEnd = 19 * 60;
    for (const b of result.blocks.filter((b) => b.kind !== 'sleep')) {
      expect(overlaps(b, schoolStart, schoolEnd)).toBe(false);
      expect(overlaps(b, coachingStart, coachingEnd)).toBe(false);
    }
  });

  it('coaching-only, no school: a smaller single fixed block leaves most of the day free', () => {
    const result = generateSchedule({
      wakeTime: '07:00',
      sleepTime: '23:30',
      dailyHoursRequested: 6,
      subjects: [{ id: 'bio', name: 'Biology', isWeak: true }],
      fixedCommitments: [{ start: '10:00', end: '13:00' }], // coaching only
      blockLengthMinutes: 60,
    });

    // window: 08:00-22:30 = 870min, minus coaching (180) = 690min
    expect(result.usableWindowMinutes).toBe(690);
    expect(result.requestedMinutes).toBe(360);
    expect(result.wasCut).toBe(false);
    expect(result.scheduledStudyMinutes).toBe(360);

    const studyBlocks = result.blocks.filter((b) => b.kind === 'study');
    // 360 minutes / 60-minute blocks = 6 blocks, single subject so all 6 go to Biology.
    expect(studyBlocks.length).toBe(6);
    expect(studyBlocks.every((b) => b.subjectName === 'Biology')).toBe(true);
  });

  it('inserts a long break after 3 hours of study in one sitting', () => {
    const result = generateSchedule({
      wakeTime: '06:00',
      sleepTime: '23:00',
      dailyHoursRequested: 4,
      subjects: [{ id: 's1', name: 'Solo Subject' }],
      // Only 17:00-22:00 is free, so all four blocks run in one evening sitting.
      fixedCommitments: [{ start: '07:00', end: '17:00' }],
      blockLengthMinutes: 60,
      breakAfterBlockMinutes: 10,
      longBreakEveryMinutes: 180,
      longBreakMinutes: 30,
    });

    const breaks = result.blocks.filter((b) => b.kind === 'break');
    const longBreaks = breaks.filter(
      (b) => b.endMinutes - b.startMinutes === 30
    );
    expect(longBreaks.length).toBeGreaterThanOrEqual(1);
  });

  it('no subject blocks scheduled during sleep window', () => {
    const result = generateSchedule({
      wakeTime: '06:00',
      sleepTime: '22:00',
      dailyHoursRequested: 4,
      subjects: [{ id: 's1', name: 'X' }],
      blockLengthMinutes: 30,
    });
    const sleepBlock = result.blocks.find((b) => b.kind === 'sleep')!;
    for (const b of result.blocks.filter((b) => b.kind !== 'sleep')) {
      expect(b.startMinutes >= sleepBlock.startMinutes && b.endMinutes <= sleepBlock.endMinutes).toBe(false);
    }
  });

  const study = (r: ReturnType<typeof generateSchedule>) => r.blocks.filter((b) => b.kind === 'study');

  it('never returns an empty plan because each subject rounded down to zero blocks', () => {
    const result = generateSchedule({
      wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 1.5, blockLengthMinutes: 60,
      subjects: ['Physics', 'Chemistry', 'Maths', 'Biology'].map((name, i) => ({ id: `s${i}`, name })),
    });
    // 90 minutes can't give 4 subjects a 25+ minute block each, so the weakest-first
    // round-robin fills what fits: at least one real block, never over the time asked.
    expect(study(result).length).toBeGreaterThan(0);
    expect(result.placedStudyMinutes).toBe(90);
  });

  it('shortens blocks so every subject gets a turn when there is enough time', () => {
    const result = generateSchedule({
      wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 2, blockLengthMinutes: 60,
      subjects: ['Physics', 'Chemistry', 'Maths', 'Biology'].map((name, i) => ({ id: `s${i}`, name })),
    });
    expect(new Set(study(result).map((b) => b.subjectName)).size).toBe(4);
    expect(result.blockLengthMinutes).toBe(30);
  });

  it('matches the hours asked instead of rounding every subject up', () => {
    const result = generateSchedule({
      wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 5, blockLengthMinutes: 60,
      subjects: ['Physics', 'Chemistry', 'Maths'].map((name, i) => ({ id: `s${i}`, name })),
    });
    expect(result.placedStudyMinutes).toBe(300);
  });

  it('spreads a free day over morning and evening instead of one long run from 7 AM', () => {
    const result = generateSchedule({
      wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 5, blockLengthMinutes: 60,
      subjects: ['Physics', 'Chemistry', 'Maths'].map((name, i) => ({ id: `s${i}`, name })),
    });
    const starts = study(result).map((b) => b.startMinutes);
    expect(starts.some((m) => m < 13 * 60)).toBe(true);
    expect(starts.some((m) => m >= 17 * 60)).toBe(true);
  });

  it('uses the gaps around school and coaching', () => {
    const result = generateSchedule({
      wakeTime: '06:00', sleepTime: '23:00', dailyHoursRequested: 4, blockLengthMinutes: 60,
      subjects: ['Physics', 'Chemistry', 'Maths'].map((name, i) => ({ id: `s${i}`, name })),
      fixedCommitments: [{ start: '08:00', end: '14:00' }, { start: '16:00', end: '19:00' }],
    });
    for (const b of study(result)) {
      expect(b.startMinutes < 14 * 60 && b.endMinutes > 8 * 60).toBe(false);
      expect(b.startMinutes < 19 * 60 && b.endMinutes > 16 * 60).toBe(false);
    }
    expect(result.placedStudyMinutes).toBe(240);
  });
});

describe('splitBlocks', () => {
  it('always adds up to the total and gives weak subjects more', () => {
    expect(splitBlocks(5, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(5);
    const [weak, a, b] = splitBlocks(7, [1.5, 1, 1]);
    expect(weak).toBeGreaterThanOrEqual(a);
    expect(weak).toBeGreaterThanOrEqual(b);
    expect(splitBlocks(2, [1, 1.5, 1, 1])).toEqual([1, 1, 0, 0]);
  });
});
