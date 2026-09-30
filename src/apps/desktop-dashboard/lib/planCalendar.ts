import type { FocusPlanSnapshot, ScheduleItem, StudyTask } from './studyPlanStore';

/* ============================================================
   Calendar rules shared by Home, Focus Lock and Schedules, so a task or
   block entered on one page shows up on the others on the right day.

   Two kinds of things live on a day:
     tasks            StudyTask.planDate ('YYYY-MM-DD', local). A task with no
                      planDate is from before dates existed and counts as today's.
     schedule blocks  ScheduleItem in the weekly grid (schedule[0] = Monday).
                      With `date` it is a one-off on that day; without, it
                      repeats every week on its weekday.

   A block also becomes a task (reconcileScheduleTasks) so Focus Lock, which
   runs timers on tasks, can start it. The task carries sourceScheduleId and a
   deterministic id, so deleting either side removes the other and two devices
   creating it at once end up with one row.
   ============================================================ */

/** Local calendar day as 'YYYY-MM-DD'. */
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Noon-local Date for a key, so DST shifts can never roll it onto another day. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Monday-first weekday index (Mon = 0 … Sun = 6), the schedule grid's order. */
export function weekdayIndex(key: string): number {
  const d = parseDateKey(key).getDay();
  return d === 0 ? 6 : d - 1;
}

/** The seven day keys of the Monday-first week containing `key`. */
export function weekKeysFor(key: string): string[] {
  const monday = shiftDateKey(key, -weekdayIndex(key));
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(monday, i));
}

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ── schedule blocks ──────────────────────────────────────────────────────────
/** Blocks that happen on `key`: that weekday's weekly blocks (minus days they were
 *  removed for) plus one-offs dated exactly `key`. */
export function itemsForDate(schedule: ScheduleItem[][], key: string): ScheduleItem[] {
  const day = schedule[weekdayIndex(key)] || [];
  return day.filter((s) => (s.date ? s.date === key : !s.skipDates?.includes(key)));
}

/** Key a block's task is linked by: a one-off is that block; a weekly block is
 *  one link per day it lands on. */
export function scheduleSourceKey(item: ScheduleItem, key: string): string {
  return item.date ? item.id : `${item.id}@${key}`;
}

export function scheduleTaskId(sourceKey: string): string {
  return `sched_${sourceKey}`.slice(0, 80);
}

/** Removes a block's occurrence on `key`: a one-off is deleted, a weekly block
 *  only skips that day (the rest of the weeks keep it). Returns the same array
 *  when nothing matched. */
export function removeScheduleOccurrence(
  schedule: ScheduleItem[][],
  key: string,
  matches: (item: ScheduleItem) => boolean,
): ScheduleItem[][] {
  const idx = weekdayIndex(key);
  const day = schedule[idx] || [];
  let changed = false;
  const nextDay: ScheduleItem[] = [];
  for (const s of day) {
    const onThisDay = s.date ? s.date === key : !s.skipDates?.includes(key);
    if (!onThisDay || !matches(s)) { nextDay.push(s); continue; }
    changed = true;
    if (!s.date) nextDay.push({ ...s, skipDates: [...(s.skipDates || []), key] });
  }
  if (!changed) return schedule;
  return schedule.map((d, i) => (i === idx ? nextDay : d));
}

// ── tasks ────────────────────────────────────────────────────────────────────
export function taskDate(t: StudyTask, today: string): string {
  return isDateKey(t.planDate) ? t.planDate : today;
}

export function tasksForDate(tasks: StudyTask[], key: string, today: string = dateKey()): StudyTask[] {
  return tasks.filter((t) => taskDate(t, today) === key);
}

const taskLabel = (subject: string, topic: string) => `${subject.trim().toLowerCase()}::${(topic || subject).trim().toLowerCase()}`;

// Nothing has been done on it yet, so removing it because its block went away loses no work.
function untouched(t: StudyTask): boolean {
  if (t.completed || t.regularElapsed > 0) return false;
  return t.pomodoroTotal == null || t.pomodoroRemaining === t.pomodoroTotal;
}

/** Makes the plan's tasks match the schedule:
 *   - every block dated today or later, and every weekly block landing on
 *     `today`, has a task on its day (an older undated task with the same
 *     subject and topic is adopted rather than duplicated);
 *   - a linked task whose block was deleted, or skipped for that day, is
 *     removed - unless it's running, done, or has progress.
 *  Returns the updated snapshot, or null when nothing needed to change. */
export function reconcileScheduleTasks(
  snap: FocusPlanSnapshot,
  schedule: ScheduleItem[][],
  today: string,
  makeTask: (subject: string, topic: string) => StudyTask,
): FocusPlanSnapshot | null {
  // Every occurrence that should have a task: sourceKey -> {item, day}.
  const wanted = new Map<string, { item: ScheduleItem; day: string }>();
  schedule.forEach((dayItems) => (dayItems || []).forEach((item) => {
    if (item.date) {
      if (isDateKey(item.date) && item.date >= today) wanted.set(scheduleSourceKey(item, item.date), { item, day: item.date });
    }
  }));
  itemsForDate(schedule, today).filter((s) => !s.date).forEach((item) => wanted.set(scheduleSourceKey(item, today), { item, day: today }));

  let tasks = snap.tasks;
  let changed = false;

  // Drop linked tasks whose occurrence is gone.
  const kept = tasks.filter((t) => {
    if (!t.sourceScheduleId || wanted.has(t.sourceScheduleId)) return true;
    if (taskDate(t, today) < today) return true; // history
    if (t.id === snap.activeTaskId || !untouched(t)) return true;
    return false;
  });
  if (kept.length !== tasks.length) { tasks = kept; changed = true; }

  const linked = new Set(tasks.map((t) => t.sourceScheduleId).filter(Boolean) as string[]);
  const additions: StudyTask[] = [];
  let adopted = tasks;
  wanted.forEach(({ item, day }, sourceKey) => {
    if (linked.has(sourceKey)) return;
    const topic = item.topic || item.subject;
    const label = taskLabel(item.subject, topic);
    // An unlinked task already on this day with the same subject/topic is the same thing.
    const twin = adopted.find((t) => !t.sourceScheduleId && taskDate(t, today) === day && taskLabel(t.subject, t.topic) === label);
    if (twin) {
      adopted = adopted.map((t) => (t.id === twin.id ? { ...t, planDate: day, sourceScheduleId: sourceKey } : t));
      changed = true;
      return;
    }
    additions.push({ ...makeTask(item.subject, topic), id: scheduleTaskId(sourceKey), planDate: day, sourceScheduleId: sourceKey });
    changed = true;
  });
  if (!changed) return null;
  tasks = [...additions, ...adopted];
  return { ...snap, tasks };
}
