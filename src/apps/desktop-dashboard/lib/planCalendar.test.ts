import { describe, expect, it } from 'vitest';
import {
  dateKey, itemsForDate, reconcileScheduleTasks, removeScheduleOccurrence, scheduleTaskId,
  shiftDateKey, tasksForDate, weekKeysFor, weekdayIndex,
} from './planCalendar';
import type { FocusPlanSnapshot, ScheduleItem, StudyTask } from './studyPlanStore';

const empty = (): ScheduleItem[][] => Array.from({ length: 7 }, () => []);
const block = (id: string, extra: Partial<ScheduleItem> = {}): ScheduleItem =>
  ({ id, subject: 'Physics', topic: 'Optics', startTime: '9:00 AM', endTime: '10:00 AM', color: '#fff', iconEmoji: '📘', ...extra });
const mk = (subject: string, topic: string): StudyTask =>
  ({ id: `t_${subject}`, subject, topic, mode: 'pomodoro', pomodoroRemaining: 1500, pomodoroTotal: 1500, regularElapsed: 0 });
const snap = (tasks: StudyTask[] = [], activeTaskId: string | null = null): FocusPlanSnapshot =>
  ({ tasks, activeTaskId, running: false, runningStartedAtMs: null });

// 2026-09-30 is a Wednesday.
const TODAY = '2026-09-30';

describe('date keys', () => {
  it('shifts across month ends and maps weekdays Monday-first', () => {
    expect(shiftDateKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(weekdayIndex('2026-09-28')).toBe(0);
    expect(weekdayIndex('2026-10-04')).toBe(6);
    expect(weekKeysFor(TODAY)[0]).toBe('2026-09-28');
    expect(weekKeysFor(TODAY)[6]).toBe('2026-10-04');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('itemsForDate', () => {
  it('shows weekly blocks every week and one-offs only on their date', () => {
    const s = empty();
    s[2] = [block('weekly'), block('once', { date: TODAY }), block('elsewhere', { date: '2026-10-07' })];
    expect(itemsForDate(s, TODAY).map((i) => i.id)).toEqual(['weekly', 'once']);
    expect(itemsForDate(s, '2026-10-07').map((i) => i.id)).toEqual(['weekly', 'elsewhere']);
  });
  it('honours skipped days', () => {
    const s = empty();
    s[2] = [block('weekly', { skipDates: [TODAY] })];
    expect(itemsForDate(s, TODAY)).toEqual([]);
    expect(itemsForDate(s, '2026-10-07')).toHaveLength(1);
  });
});

describe('removeScheduleOccurrence', () => {
  it('deletes a one-off and only skips a weekly block for that day', () => {
    const s = empty();
    s[2] = [block('weekly'), block('once', { date: TODAY })];
    const next = removeScheduleOccurrence(s, TODAY, () => true);
    expect(next[2].map((i) => i.id)).toEqual(['weekly']);
    expect(next[2][0].skipDates).toEqual([TODAY]);
    expect(removeScheduleOccurrence(next, TODAY, () => true)).toBe(next);
  });
});

describe('tasksForDate', () => {
  it('treats undated tasks as today', () => {
    const tasks = [{ ...mk('a', 'x') }, { ...mk('b', 'y'), planDate: '2026-10-02' }];
    expect(tasksForDate(tasks, TODAY, TODAY).map((t) => t.subject)).toEqual(['a']);
    expect(tasksForDate(tasks, '2026-10-02', TODAY).map((t) => t.subject)).toEqual(['b']);
  });
});

describe('reconcileScheduleTasks', () => {
  it('creates a task for a dated block on its own day and is idempotent', () => {
    const s = empty();
    s[3] = [block('b1', { date: '2026-10-01' })];
    const next = reconcileScheduleTasks(snap(), s, TODAY, mk)!;
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({ id: scheduleTaskId('b1'), planDate: '2026-10-01', sourceScheduleId: 'b1', topic: 'Optics' });
    expect(reconcileScheduleTasks(next, s, TODAY, mk)).toBeNull();
  });
  it('only materialises weekly blocks for today', () => {
    const s = empty();
    s[2] = [block('w')];
    s[4] = [block('fri')];
    const next = reconcileScheduleTasks(snap(), s, TODAY, mk)!;
    expect(next.tasks.map((t) => t.sourceScheduleId)).toEqual([`w@${TODAY}`]);
  });
  it('skips one-offs in the past', () => {
    const s = empty();
    s[0] = [block('old', { date: '2026-09-28' })];
    expect(reconcileScheduleTasks(snap(), s, TODAY, mk)).toBeNull();
  });
  it('adopts an existing task with the same subject and topic instead of duplicating', () => {
    const s = empty();
    s[2] = [block('once', { date: TODAY })];
    const existing = { ...mk('Physics', 'Optics'), id: 'mine' };
    const next = reconcileScheduleTasks(snap([existing]), s, TODAY, mk)!;
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({ id: 'mine', sourceScheduleId: 'once', planDate: TODAY });
  });
  it('removes the task when its block is deleted, unless it has progress or is running', () => {
    const linked = { ...mk('Physics', 'Optics'), id: 'sched_gone', planDate: TODAY, sourceScheduleId: 'gone' };
    expect(reconcileScheduleTasks(snap([linked]), empty(), TODAY, mk)!.tasks).toEqual([]);
    const started = { ...linked, pomodoroRemaining: 1200 };
    expect(reconcileScheduleTasks(snap([started]), empty(), TODAY, mk)).toBeNull();
    expect(reconcileScheduleTasks(snap([linked], 'sched_gone'), empty(), TODAY, mk)).toBeNull();
  });
  it('keeps past linked tasks as history', () => {
    const past = { ...mk('Physics', 'Optics'), id: 'sched_p', planDate: '2026-09-01', sourceScheduleId: 'p' };
    expect(reconcileScheduleTasks(snap([past]), empty(), TODAY, mk)).toBeNull();
  });
  it('does not bring back a weekly block removed for today', () => {
    const s = empty();
    s[2] = [block('w', { skipDates: [TODAY] })];
    expect(reconcileScheduleTasks(snap(), s, TODAY, mk)).toBeNull();
  });
});
