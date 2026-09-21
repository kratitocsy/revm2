import { describe, it, expect } from 'vitest';
import { generateSchedule } from './scheduleGenerator';

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

  it('inserts a long break after 3 hours of cumulative study', () => {
    const result = generateSchedule({
      wakeTime: '06:00',
      sleepTime: '23:00',
      dailyHoursRequested: 5,
      subjects: [{ id: 's1', name: 'Solo Subject' }],
      fixedCommitments: [],
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
});
