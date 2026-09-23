import { describe, it, expect, vi } from 'vitest';

vi.mock('../../_shared/supabaseClient', () => ({ sb: {} }));

import { mergeRemotePlan, type StudyTask, type FocusPlanSnapshot } from './studyPlanStore';

const task = (id: string, over: Partial<StudyTask> = {}): StudyTask => ({
  id, subject: 'Physics', topic: id, mode: 'regular', pomodoroRemaining: 1500, regularElapsed: 0, ...over,
});
// Regular counts up; a Pomodoro-like task "finishes" once it has run 100s.
const advance = (t: StudyTask, secs: number) =>
  t.mode === 'regular'
    ? { task: { ...t, regularElapsed: t.regularElapsed + secs }, running: true }
    : { task: { ...t, pomodoroRemaining: Math.max(0, t.pomodoroRemaining - secs) }, running: t.pomodoroRemaining - secs > 0 };

const NOW = 1_000_000_000_000;

describe('mergeRemotePlan', () => {
  it('takes the remote list (added and removed tasks) when nothing runs here', () => {
    const remote: FocusPlanSnapshot = { tasks: [task('b'), task('c')], activeTaskId: null, running: false, runningStartedAtMs: null };
    const r = mergeRemotePlan(remote, { tasks: [task('a'), task('b')], activeTaskId: null, running: false }, advance, NOW);
    expect(r.tasks.map((t) => t.id)).toEqual(['b', 'c']);
    expect(r).toMatchObject({ activeTaskId: null, running: false, stopHere: false });
  });

  it('fast-forwards a task running on another device by the time since its anchor', () => {
    const remote: FocusPlanSnapshot = {
      tasks: [task('a', { regularElapsed: 600 })], activeTaskId: 'a', running: true, runningStartedAtMs: NOW - 90_000,
    };
    const r = mergeRemotePlan(remote, { tasks: [], activeTaskId: null, running: false }, advance, NOW);
    expect(r.tasks[0].regularElapsed).toBe(690);
    expect(r).toMatchObject({ activeTaskId: 'a', running: true, stopHere: false });
  });

  it('stops the clock when the catch-up runs a task out', () => {
    const remote: FocusPlanSnapshot = {
      tasks: [task('p', { mode: 'pomodoro', pomodoroRemaining: 60 })], activeTaskId: 'p', running: true, runningStartedAtMs: NOW - 120_000,
    };
    const r = mergeRemotePlan(remote, { tasks: [], activeTaskId: null, running: false }, advance, NOW);
    expect(r.tasks[0].pomodoroRemaining).toBe(0);
    expect(r.running).toBe(false);
  });

  it("keeps this page's own clock for the task it is running, but takes everything else", () => {
    const local = { tasks: [task('a', { regularElapsed: 1234 })], activeTaskId: 'a', running: true };
    const remote: FocusPlanSnapshot = {
      tasks: [task('new'), task('a', { regularElapsed: 1200, completed: true })], activeTaskId: 'a', running: true, runningStartedAtMs: NOW - 5_000,
    };
    const r = mergeRemotePlan(remote, local, advance, NOW);
    expect(r.tasks.map((t) => t.id)).toEqual(['new', 'a']);
    expect(r.tasks[1]).toMatchObject({ regularElapsed: 1234, completed: true });
    expect(r).toMatchObject({ running: true, stopHere: false });
  });

  it('tells the page to close its session when the task was paused elsewhere', () => {
    const local = { tasks: [task('a', { regularElapsed: 300 })], activeTaskId: 'a', running: true };
    const remote: FocusPlanSnapshot = { tasks: [task('a', { regularElapsed: 290 })], activeTaskId: 'a', running: false, runningStartedAtMs: null };
    const r = mergeRemotePlan(remote, local, advance, NOW);
    expect(r).toMatchObject({ running: false, stopHere: true });
    expect(r.tasks[0].regularElapsed).toBe(290);
  });

  it('tells the page to close its session when its running task was deleted elsewhere', () => {
    const local = { tasks: [task('a'), task('b')], activeTaskId: 'a', running: true };
    const remote: FocusPlanSnapshot = { tasks: [task('b')], activeTaskId: 'a', running: true, runningStartedAtMs: NOW };
    const r = mergeRemotePlan(remote, local, advance, NOW);
    expect(r).toMatchObject({ activeTaskId: null, running: false, stopHere: true });
  });
});
