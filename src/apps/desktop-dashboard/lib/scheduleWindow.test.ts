import { beforeEach, describe, expect, it } from 'vitest';
import { beginFreePause, blockedMessage, clearFreePause, clockLabel, computeGate, freePausesLeft, freePauseUntil, spendFreePause, FREE_PAUSES_PER_SCHEDULE, FREE_PAUSE_MINUTES, type WindowSchedule } from './scheduleWindow';

// 2026-10-01 is a Thursday (day 4). All times India time.
const at = (hhmm: string, date = '2026-10-01') => new Date(`${date}T${hhmm}:00+05:30`);

const physics: WindowSchedule = {
  id: 's1', name: 'Wynky Plan', days: [1, 2, 3, 4, 5], parity: null,
  slots: [{ start: '16:00', end: '18:00', subject: 'Physics' }, { start: '19:00', end: '20:30', subject: 'Maths' }],
};

describe('computeGate', () => {
  it('is unrestricted with no schedule', () => {
    expect(computeGate([], at('10:00'))).toEqual({ restricted: false, inside: null, next: null });
  });

  it('is inside a block, with the time left', () => {
    const g = computeGate([physics], at('16:30'));
    expect(g.restricted).toBe(true);
    expect(g.inside?.slot.subject).toBe('Physics');
    expect(g.inside?.endsInMin).toBe(90);
  });

  it('end of a block is outside', () => {
    expect(computeGate([physics], at('18:00')).inside).toBeNull();
  });

  it('outside a block on a schedule day points at the next block', () => {
    const g = computeGate([physics], at('18:30'));
    expect(g.restricted).toBe(true);
    expect(g.inside).toBeNull();
    expect(g.next?.slot.subject).toBe('Maths');
    expect(g.next?.startsInMin).toBe(30);
    expect(g.next?.dayOffset).toBe(0);
  });

  it('after the last block the next block is tomorrow', () => {
    const g = computeGate([physics], at('21:00'));
    expect(g.next?.dayOffset).toBe(1);
    expect(g.next?.slot.subject).toBe('Physics');
    expect(blockedMessage(g)).toContain('Physics at 4:00 PM tomorrow');
  });

  it('a day the schedule does not run is unrestricted', () => {
    const g = computeGate([physics], at('10:00', '2026-10-04')); // Sunday
    expect(g.restricted).toBe(false);
    expect(g.inside).toBeNull();
    expect(g.next?.dayOffset).toBe(1); // Monday
  });

  it('a midnight-crossing block covers both sides of midnight', () => {
    const night: WindowSchedule = { id: 'n', name: 'Night', days: [4], parity: null, slots: [{ start: '23:00', end: '01:00', subject: 'Chem' }] };
    expect(computeGate([night], at('23:30')).inside?.slot.subject).toBe('Chem');
    const after = computeGate([night], at('00:30', '2026-10-02')); // Friday, tail of Thursday's block
    expect(after.inside?.slot.subject).toBe('Chem');
    expect(after.inside?.endsInMin).toBe(30);
    expect(computeGate([night], at('01:30', '2026-10-02')).inside).toBeNull();
  });

  it('every-other-week schedules run only in their week', () => {
    const wk0: WindowSchedule = { ...physics, parity: 0 };
    const wk1: WindowSchedule = { ...physics, parity: 1 };
    const a = computeGate([wk0], at('16:30'));
    const b = computeGate([wk1], at('16:30'));
    expect(a.restricted).not.toBe(b.restricted);
  });
});

describe('free pauses', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('gives 2 per schedule per day', () => {
    const now = at('16:30');
    expect(freePausesLeft('s1', now)).toBe(FREE_PAUSES_PER_SCHEDULE);
    spendFreePause('s1', now);
    expect(freePausesLeft('s1', now)).toBe(1);
    spendFreePause('s1', now);
    expect(freePausesLeft('s1', now)).toBe(0);
    expect(freePausesLeft('s2', now)).toBe(2);
    expect(freePausesLeft('s1', at('16:30', '2026-10-02'))).toBe(2);
  });
});

describe('free pause clock', () => {
  it('lasts 20 minutes and counts as a used pause', () => {
    const now = at('16:30');
    expect(freePauseUntil()).toBeNull();
    beginFreePause('s9', now);
    expect(freePauseUntil()).toBe(now.getTime() + FREE_PAUSE_MINUTES * 60_000);
    expect(FREE_PAUSE_MINUTES).toBe(20);
    expect(freePausesLeft('s9', now)).toBe(1);
    clearFreePause();
    expect(freePauseUntil()).toBeNull();
  });
});

describe('clockLabel', () => {
  it('formats', () => {
    expect(clockLabel('00:05')).toBe('12:05 AM');
    expect(clockLabel('13:30')).toBe('1:30 PM');
  });
});
