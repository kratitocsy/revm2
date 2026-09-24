import { useSyncExternalStore } from 'react';
import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Study plan store: the one place Home, Focus Lock, Study Rooms and
   Schedules read and write the user's tasks and weekly schedule.

   Supabase is the source of truth (study_plan_tasks + study_plans,
   migration 0067); localStorage is only an offline/first-paint cache.
   The pages keep their existing snapshot API - loadFocusPlanSnapshot /
   saveFocusPlanSnapshot in DesktopDashboard.tsx now call
   getPlanSnapshot / setPlanSnapshot here - so their timer logic is
   unchanged.

   Timer progress is not written every second. A running plan is stored
   as "task values as of anchor_at" (the snapshot's runningStartedAtMs),
   so any reader fast-forwards by now - anchor_at, the same catch-up the
   pages already do after a reload. Structural changes (add, delete,
   complete, start, pause) sync within ~300ms; progress-only ticks at
   most every PROGRESS_SYNC_MS.

   The same study_plans row also carries Focus Lock's Quick Notes
   (quick_notes, migration 0068), synced the same way.

   Realtime: every flush ends by touching the user's study_plans row, so
   subscribing to that one filtered row is enough to hear about any
   change. Our own writes carry updated_by = CLIENT_ID and are ignored.
   ============================================================ */

export type TimerMode = 'pomodoro' | 'regular';
export type PomodoroPhase = 'focus' | 'break';
export interface StudyTask {
  id: string;
  subject: string;
  topic: string;
  mode: TimerMode;
  pomodoroRemaining: number; // seconds left in the current Pomodoro phase, meaningful when mode === 'pomodoro'
  regularElapsed: number; // seconds elapsed, meaningful when mode === 'regular'
  // Both optional so plans saved before Pomodoro was customizable (which have neither) still load.
  pomodoroPhase?: PomodoroPhase; // 'focus' unless the task is currently in its break
  pomodoroTotal?: number; // full length (s) of the phase now counting - a session finishes at the length it started with
  completed?: boolean; // manually marked done from the ⋮ menu - shows a strikethrough, doesn't touch the timer itself
}
export interface FocusPlanSnapshot {
  tasks: StudyTask[];
  activeTaskId: string | null;
  running: boolean;
  runningStartedAtMs: number | null; // when the task values above were current, for catch-up
}
export interface ScheduleItem {
  id: string; subject: string; topic: string;
  startTime: string; endTime: string; color: string; iconEmoji: string;
}
export interface StudyUnit { subject: string; exam: string; topics: string[] }
export interface StudyWeek { schedule: ScheduleItem[][]; units: StudyUnit[] }

export type PlanSyncStatus = 'signed-out' | 'loading' | 'ready' | 'error';
// 'remote' = the plan/week data was replaced from outside this page (Supabase
// load, another tab/device, sign-out). 'local' = a write from this tab, or a
// sync-status change only.
export type PlanChangeSource = 'local' | 'remote';

const PLAN_CACHE_KEY = 'wynko_focus_plan_v1'; // same key the plan always lived under
const WEEK_CACHE_KEY = 'wynko_study_week_v1';
const NOTES_CACHE_KEY = 'wynko_quick_notes_v1';
const NOTES_SYNC_MS = 800;
const STRUCTURAL_SYNC_MS = 300;
const PROGRESS_SYNC_MS = 15000;
const RETRY_MS = 10000;

const CLIENT_ID = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// ── state ────────────────────────────────────────────────────────────────────
let userId: string | null = null;
let status: PlanSyncStatus = 'loading';
let lastError: string | null = null;
let plan: FocusPlanSnapshot | null = null;
let week: StudyWeek | null = null; // null = nothing saved yet (Schedules starts empty)
let notes: string | null = null; // Focus Lock Quick Notes; null = never written
let version = 0;
let initialized = false;
let hydrated = false; // this user's plan has been read from Supabase at least once
let emittedStructuralKey = '';

// What Supabase has, as of our last successful fetch/flush.
let syncedRows = new Map<string, string>(); // task id -> serialized row
let syncedPlanKey = '';
let syncedWeekKey = '';
let syncedNotes: string | null = null;

let planTimer: ReturnType<typeof setTimeout> | null = null;
let planTimerDue = 0;
let weekTimer: ReturnType<typeof setTimeout> | null = null;
let notesTimer: ReturnType<typeof setTimeout> | null = null;
let notesFlushing = false;
let flushing = false;
let refetchAfterFlush = false;
let channel: ReturnType<typeof sb.channel> | null = null;

const listeners = new Set<(source: PlanChangeSource) => void>();

interface Snapshot { status: PlanSyncStatus; error: string | null; plan: FocusPlanSnapshot | null; week: StudyWeek | null; version: number }
let reactSnapshot: Snapshot = { status, error: lastError, plan, week, version };

function emit(source: PlanChangeSource) {
  version++;
  emittedStructuralKey = plan ? structuralKey(plan) : '';
  reactSnapshot = { status, error: lastError, plan, week, version };
  listeners.forEach((l) => {
    try { l(source); } catch (e) { console.warn('study plan listener failed', e); }
  });
}

// ── local cache ──────────────────────────────────────────────────────────────
function readCache<T>(key: string): (T & { ownerId?: string }) | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
}
function cachedPlanFor(uid: string | null): FocusPlanSnapshot | null {
  const c = readCache<FocusPlanSnapshot>(PLAN_CACHE_KEY);
  if (!c || !Array.isArray(c.tasks)) return null;
  // No ownerId = saved by the old localStorage-only build: still this browser's plan.
  if (c.ownerId && uid && c.ownerId !== uid) return null;
  return { tasks: c.tasks, activeTaskId: c.activeTaskId ?? null, running: !!c.running, runningStartedAtMs: c.runningStartedAtMs ?? null };
}
function cachedNotesFor(uid: string | null): string | null {
  const c = readCache<{ text: string }>(NOTES_CACHE_KEY);
  return c && c.ownerId === uid && typeof c.text === 'string' ? c.text : null;
}
function cachedWeekFor(uid: string | null): StudyWeek | null {
  const c = readCache<StudyWeek>(WEEK_CACHE_KEY);
  if (!c || !c.ownerId || c.ownerId !== uid || !isWeek(c.schedule)) return null;
  return { schedule: c.schedule, units: Array.isArray(c.units) ? c.units : [] };
}

// ── row mapping ──────────────────────────────────────────────────────────────
function taskToRow(t: StudyTask, position: number, uid: string) {
  return {
    user_id: uid,
    id: t.id,
    subject: t.subject || 'General',
    topic: t.topic ?? '',
    mode: t.mode === 'regular' ? 'regular' : 'pomodoro',
    pomodoro_phase: t.pomodoroPhase ?? null,
    pomodoro_total: t.pomodoroTotal == null ? null : Math.max(0, Math.round(t.pomodoroTotal)),
    pomodoro_remaining: Math.max(0, Math.round(t.pomodoroRemaining || 0)),
    regular_elapsed: Math.max(0, Math.round(t.regularElapsed || 0)),
    completed: !!t.completed,
    position,
  };
}
type TaskRow = ReturnType<typeof taskToRow>;
function rowToTask(r: TaskRow): StudyTask {
  const t: StudyTask = {
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    mode: r.mode === 'regular' ? 'regular' : 'pomodoro',
    pomodoroRemaining: r.pomodoro_remaining,
    regularElapsed: r.regular_elapsed,
  };
  if (r.pomodoro_phase) t.pomodoroPhase = r.pomodoro_phase as PomodoroPhase;
  if (r.pomodoro_total != null) t.pomodoroTotal = r.pomodoro_total;
  if (r.completed) t.completed = true;
  return t;
}
function planStateOf(snap: FocusPlanSnapshot) {
  return {
    active_task_id: snap.activeTaskId,
    running: snap.running,
    anchor_at: snap.running && snap.runningStartedAtMs ? new Date(snap.runningStartedAtMs).toISOString() : null,
  };
}
// Progress fields and the anchor move every second while running; everything
// else is "structural" and worth syncing right away.
function structuralKey(snap: FocusPlanSnapshot): string {
  return JSON.stringify([
    snap.activeTaskId, snap.running,
    snap.tasks.map((t) => [t.id, t.subject, t.topic, t.mode, t.pomodoroPhase ?? null, t.pomodoroTotal ?? null, !!t.completed]),
  ]);
}
let syncedStructuralKey = '';

function isWeek(v: unknown): v is ScheduleItem[][] {
  return Array.isArray(v) && v.length === 7 && v.every((d) => Array.isArray(d));
}
function weekKey(w: StudyWeek | null): string {
  return w ? JSON.stringify([w.schedule, w.units]) : '';
}

// ── merging a remote plan into a page ────────────────────────────────────────
/** Applies a plan that changed elsewhere (another tab/device, the first load)
 *  to a page that may itself be running one of its tasks. That task keeps the
 *  page's own to-the-second clock; everything else comes from the remote copy,
 *  fast-forwarded to now with `advance` when it's running somewhere else.
 *  `stopHere`: the page was running something the remote copy paused, switched
 *  away from or deleted, so the page should close its own study session. */
export function mergeRemotePlan(
  remote: FocusPlanSnapshot,
  local: { tasks: StudyTask[]; activeTaskId: string | null; running: boolean },
  advance: (task: StudyTask, seconds: number) => { task: StudyTask; running: boolean },
  nowMs: number = Date.now(),
): { tasks: StudyTask[]; activeTaskId: string | null; running: boolean; stopHere: boolean } {
  const activeTaskId = remote.activeTaskId && remote.tasks.some((t) => t.id === remote.activeTaskId) ? remote.activeTaskId : null;
  const liveHere = local.running && remote.running && !!activeTaskId && activeTaskId === local.activeTaskId;
  let running = remote.running && !!activeTaskId;
  let tasks = remote.tasks;
  if (liveHere) {
    const mine = local.tasks.find((t) => t.id === activeTaskId);
    if (mine) {
      tasks = remote.tasks.map((t) => t.id !== activeTaskId ? t : {
        ...t,
        pomodoroRemaining: mine.pomodoroRemaining,
        pomodoroPhase: mine.pomodoroPhase,
        pomodoroTotal: mine.pomodoroTotal,
        regularElapsed: mine.regularElapsed,
      });
    }
  } else if (running && remote.runningStartedAtMs) {
    const elapsed = Math.max(0, Math.floor((nowMs - remote.runningStartedAtMs) / 1000));
    if (elapsed > 0) {
      tasks = remote.tasks.map((t) => {
        if (t.id !== activeTaskId) return t;
        const r = advance(t, elapsed);
        if (!r.running) running = false;
        return r.task;
      });
    }
  }
  const stopHere = local.running && (!running || activeTaskId !== local.activeTaskId);
  return { tasks, activeTaskId, running, stopHere };
}

// ── remote ───────────────────────────────────────────────────────────────────
async function fetchRemote(uid: string) {
  const [planRes, tasksRes] = await Promise.all([
    sb.from('study_plans').select('active_task_id, running, anchor_at, weekly_schedule, study_units, quick_notes').eq('user_id', uid).maybeSingle(),
    sb.from('study_plan_tasks')
      .select('user_id, id, subject, topic, mode, pomodoro_phase, pomodoro_total, pomodoro_remaining, regular_elapsed, completed, position')
      .eq('user_id', uid)
      .order('position', { ascending: true }),
  ]);
  if (planRes.error) throw planRes.error;
  if (tasksRes.error) throw tasksRes.error;
  return { planRow: planRes.data as any, taskRows: (tasksRes.data || []) as TaskRow[] };
}

function applyRemote(uid: string, planRow: any, taskRows: TaskRow[]) {
  syncedRows = new Map(taskRows.map((r) => [r.id, JSON.stringify(r)]));
  if (planRow) {
    const ids = new Set(taskRows.map((r) => r.id));
    const activeTaskId = planRow.active_task_id && ids.has(planRow.active_task_id) ? planRow.active_task_id : null;
    plan = {
      tasks: taskRows.map(rowToTask),
      activeTaskId,
      running: !!planRow.running && !!activeTaskId,
      runningStartedAtMs: planRow.anchor_at ? new Date(planRow.anchor_at).getTime() : null,
    };
    syncedPlanKey = JSON.stringify(planStateOf(plan));
    syncedStructuralKey = structuralKey(plan);
    writeCache(PLAN_CACHE_KEY, { ...plan, ownerId: uid });

    week = isWeek(planRow.weekly_schedule)
      ? { schedule: planRow.weekly_schedule, units: Array.isArray(planRow.study_units) ? planRow.study_units : [] }
      : null;
    syncedWeekKey = weekKey(week);
    if (week) writeCache(WEEK_CACHE_KEY, { ...week, ownerId: uid });

    notes = typeof planRow.quick_notes === 'string' ? planRow.quick_notes : null;
    syncedNotes = notes;
    writeCache(NOTES_CACHE_KEY, { text: notes ?? '', ownerId: uid });
  }
}

async function hydrate(uid: string) {
  // A retry after a failed load keeps showing 'error' (and the cached copy)
  // instead of flipping the page back to its loading state.
  if (status !== 'error') { status = 'loading'; emit('local'); } // status only, plan unchanged
  try {
    const { planRow, taskRows } = await fetchRemote(uid);
    if (userId !== uid) return; // signed out / switched account meanwhile
    hydrated = true;
    if (planRow) {
      applyRemote(uid, planRow, taskRows);
    } else {
      // First time on this account: carry over whatever this browser already
      // had (the localStorage-only plan), then create the row.
      syncedRows = new Map();
      syncedPlanKey = '';
      syncedStructuralKey = '';
      syncedWeekKey = '';
      syncedNotes = null;
      plan = plan ?? cachedPlanFor(uid);
      week = week ?? cachedWeekFor(uid);
      notes = notes ?? cachedNotesFor(uid);
      await flushPlan(true);
      if (week) await flushWeek();
      if (notes) await flushNotes();
    }
    status = 'ready';
    lastError = null;
    emit('remote');
    subscribe(uid);
  } catch (e: any) {
    if (userId !== uid) return;
    console.warn('Study plan: could not load from Supabase, using this device\'s copy', e);
    status = 'error';
    lastError = e?.message || 'Could not reach the server';
    emit('local'); // status only: keep working from this device's copy
    setTimeout(() => { if (userId === uid && !hydrated) void hydrate(uid); }, RETRY_MS);
  }
}

function subscribe(uid: string) {
  if (channel) void sb.removeChannel(channel);
  channel = sb
    .channel(`study-plan-${uid}-${CLIENT_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'study_plans', filter: `user_id=eq.${uid}` }, (payload: any) => {
      if (payload?.new?.updated_by === CLIENT_ID) return; // our own write echoing back
      void refetch(uid);
    })
    .subscribe((s) => {
      // After a dropped connection, catch up on anything missed while offline.
      if (s === 'SUBSCRIBED' && status === 'ready') void refetch(uid);
    });
}

// Unsynced edits a server read would wipe out. Pending progress ticks don't
// count: the server copy plus its anchor catches up to the same values, and a
// page that is itself running the task keeps its own clock (see FocusLockPage).
function hasUnsyncedEdits(): boolean {
  return flushing || !!weekTimer || !!notesTimer || notesFlushing || (!!plan && structuralKey(plan) !== syncedStructuralKey);
}

let refetchTimer: ReturnType<typeof setTimeout> | null = null;
function refetch(uid: string) {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(async () => {
    refetchTimer = null;
    // Local edits not yet written would be overwritten by an older server copy:
    // write them first, then read.
    if (hasUnsyncedEdits()) { refetchAfterFlush = true; return; }
    try {
      const { planRow, taskRows } = await fetchRemote(uid);
      if (userId !== uid) return;
      if (hasUnsyncedEdits()) { refetchAfterFlush = true; return; }
      if (!planRow) return;
      applyRemote(uid, planRow, taskRows);
      status = 'ready';
      lastError = null;
      emit('remote');
    } catch (e) {
      console.warn('Study plan: refresh failed', e);
    }
  }, 250);
}

async function flushPlan(force = false) {
  const uid = userId;
  if (!uid || !hydrated) return;
  if (flushing) { schedulePlanFlush(STRUCTURAL_SYNC_MS); return; }
  if (planTimer) { clearTimeout(planTimer); planTimer = null; }
  const snap = plan ?? { tasks: [], activeTaskId: null, running: false, runningStartedAtMs: null };
  const rows = snap.tasks.map((t, i) => taskToRow(t, i, uid));
  const changed = rows.filter((r) => syncedRows.get(r.id) !== JSON.stringify(r));
  const removed = [...syncedRows.keys()].filter((id) => !rows.some((r) => r.id === id));
  const state = planStateOf(snap);
  const stateKey = JSON.stringify(state);
  if (!force && !changed.length && !removed.length && stateKey === syncedPlanKey) return;

  flushing = true;
  const now = new Date().toISOString();
  try {
    if (changed.length) {
      const { error } = await sb.from('study_plan_tasks')
        .upsert(changed.map((r) => ({ ...r, updated_by: CLIENT_ID, updated_at: now })), { onConflict: 'user_id,id' });
      if (error) throw error;
    }
    if (removed.length) {
      const { error } = await sb.from('study_plan_tasks').delete().eq('user_id', uid).in('id', removed);
      if (error) throw error;
    }
    // Last, so that anyone reacting to this row's realtime event reads the tasks above.
    const { error } = await sb.from('study_plans')
      .upsert({ user_id: uid, ...state, updated_by: CLIENT_ID, updated_at: now }, { onConflict: 'user_id' });
    if (error) throw error;

    changed.forEach((r) => syncedRows.set(r.id, JSON.stringify(r)));
    removed.forEach((id) => syncedRows.delete(id));
    syncedPlanKey = stateKey;
    syncedStructuralKey = structuralKey(snap);
    lastError = null;
  } catch (e: any) {
    console.warn('Study plan: save failed, will retry', e);
    lastError = e?.message || 'Could not save your plan';
    schedulePlanFlush(RETRY_MS);
  } finally {
    flushing = false;
  }
  if (refetchAfterFlush && !hasUnsyncedEdits()) { refetchAfterFlush = false; void refetch(uid); }
}

async function flushWeek() {
  const uid = userId;
  if (weekTimer) { clearTimeout(weekTimer); weekTimer = null; }
  if (!uid || !week || !hydrated) return;
  const key = weekKey(week);
  if (key === syncedWeekKey) return;
  try {
    const { error } = await sb.from('study_plans').upsert({
      user_id: uid,
      weekly_schedule: week.schedule,
      study_units: week.units,
      updated_by: CLIENT_ID,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    syncedWeekKey = key;
  } catch (e) {
    console.warn('Study plan: schedule save failed, will retry', e);
    weekTimer = setTimeout(() => void flushWeek(), RETRY_MS);
  }
  if (refetchAfterFlush && !hasUnsyncedEdits()) { refetchAfterFlush = false; void refetch(uid); }
}

async function flushNotes() {
  const uid = userId;
  if (notesTimer) { clearTimeout(notesTimer); notesTimer = null; }
  if (!uid || !hydrated || notes === syncedNotes) return;
  const sending = notes;
  notesFlushing = true;
  try {
    const { error } = await sb.from('study_plans').upsert({
      user_id: uid,
      quick_notes: sending,
      updated_by: CLIENT_ID,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    syncedNotes = sending;
  } catch (e) {
    console.warn('Quick notes: save failed, will retry', e);
    notesTimer = setTimeout(() => void flushNotes(), RETRY_MS);
  } finally {
    notesFlushing = false;
  }
  if (notes !== syncedNotes && !notesTimer) notesTimer = setTimeout(() => void flushNotes(), NOTES_SYNC_MS); // typed more meanwhile
  if (refetchAfterFlush && !hasUnsyncedEdits()) { refetchAfterFlush = false; void refetch(uid); }
}

function schedulePlanFlush(delay: number) {
  const due = Date.now() + delay;
  if (planTimer && planTimerDue <= due) return; // an earlier flush is already booked
  if (planTimer) clearTimeout(planTimer);
  planTimerDue = due;
  planTimer = setTimeout(() => { planTimer = null; void flushPlan(); }, delay);
}

// ── auth ─────────────────────────────────────────────────────────────────────
function onUser(uid: string | null) {
  if (uid === userId) return;
  userId = uid;
  hydrated = false;
  if (planTimer) { clearTimeout(planTimer); planTimer = null; }
  if (weekTimer) { clearTimeout(weekTimer); weekTimer = null; }
  if (notesTimer) { clearTimeout(notesTimer); notesTimer = null; }
  if (channel) { void sb.removeChannel(channel); channel = null; }
  syncedRows = new Map();
  syncedPlanKey = syncedStructuralKey = syncedWeekKey = '';
  syncedNotes = null;
  if (!uid) {
    status = 'signed-out';
    plan = null;
    week = null;
    notes = null;
    emit('remote');
    return;
  }
  plan = cachedPlanFor(uid);
  week = cachedWeekFor(uid);
  notes = cachedNotesFor(uid);
  void hydrate(uid);
}

/** Starts auth tracking + sync. Idempotent; call once from the app root. */
export function initStudyPlanSync() {
  if (initialized) return;
  initialized = true;
  plan = cachedPlanFor(null);
  sb.auth.onAuthStateChange((_event, session) => onUser(session?.user.id ?? null));
  if (typeof window !== 'undefined') {
    // Best-effort: push the latest progress when the tab is hidden or closed.
    const flushNow = () => { if (planTimer) void flushPlan(); if (weekTimer) void flushWeek(); if (notesTimer) void flushNotes(); };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
      else if (userId && status === 'ready') void refetch(userId);
    });
    window.addEventListener('online', () => { if (userId && !hydrated) void hydrate(userId); });
  }
}

// ── public API ───────────────────────────────────────────────────────────────
export function getPlanSnapshot(): FocusPlanSnapshot | null {
  return plan;
}

export function setPlanSnapshot(next: FocusPlanSnapshot) {
  plan = next;
  writeCache(PLAN_CACHE_KEY, { ...next, ownerId: userId ?? undefined });
  if (!userId || !hydrated) return; // hydrate() decides what wins
  const key = structuralKey(next);
  schedulePlanFlush(key === syncedStructuralKey ? PROGRESS_SYNC_MS : STRUCTURAL_SYNC_MS);
  // Per-second progress ticks don't re-render subscribers; anything else does.
  if (key !== emittedStructuralKey) emit('local');
}

export function getStudyWeek(): StudyWeek | null {
  return week;
}

export function setStudyWeek(schedule: ScheduleItem[][], units: StudyUnit[]) {
  const next = { schedule, units };
  if (weekKey(next) === weekKey(week)) return;
  week = next;
  if (userId) writeCache(WEEK_CACHE_KEY, { ...next, ownerId: userId });
  if (!userId || !hydrated) return;
  if (weekTimer) clearTimeout(weekTimer);
  weekTimer = setTimeout(() => void flushWeek(), STRUCTURAL_SYNC_MS);
  emit('local');
}

/** Focus Lock Quick Notes for the signed-in user ('' when none). */
export function getQuickNotes(): string {
  return notes ?? '';
}

/** Saves the Quick Notes text (debounced). No re-render is triggered here:
 *  the panel owns the text while typing; other tabs/devices get it via realtime. */
export function setQuickNotes(text: string) {
  if (text === (notes ?? '')) return;
  notes = text;
  if (userId) writeCache(NOTES_CACHE_KEY, { text, ownerId: userId });
  if (!userId || !hydrated) return;
  if (notesTimer) clearTimeout(notesTimer);
  notesTimer = setTimeout(() => void flushNotes(), NOTES_SYNC_MS);
}

export function subscribePlan(listener: (source: PlanChangeSource) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React view of the store; re-renders on every local or remote change. */
export function useStudyPlanStore(): Snapshot {
  return useSyncExternalStore(
    (cb) => subscribePlan(cb),
    () => reactSnapshot,
    () => reactSnapshot,
  );
}
