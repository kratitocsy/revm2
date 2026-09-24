import { useEffect, useSyncExternalStore } from 'react';
import { sb } from './supabaseClient';

/* ============================================================
   The user's last-selected timer mode ('pomodoro' | 'regular').

   This is deliberately separate from pomodoroSettings.ts (which
   holds the focus/break *lengths*): this file only remembers
   WHICH of the two timer blocks the user picked last, so that:

     - Adding a task never asks "which timer mode?" - Start just
       uses whatever was picked last (defaulting to Pomodoro for
       a user who has never picked anything).
     - The choice persists across visits, reloads and devices until
       the user taps the other timer block themselves.
     - Home, Focus Lock and the task picker all agree, since they
       all read/write this one store instead of keeping their own
       local `useState<TimerMode>`.

   Persistence follows pomodoroSettings.ts exactly:
     1. Module store  - the instant in-memory value every reader uses.
     2. localStorage  - synchronous cache, so the first render already
        shows the saved mode, and it keeps working offline.
     3. Supabase      - user_profiles.timer_mode (migration 0069), per
        user, carried across devices; realtime pushes a change made on
        another device into pages that are already open.
   Reconciliation is last-write-wins on `updatedAt`. `updatedAt === 0`
   means "never chosen" (the Pomodoro default), which never wins over
   a real choice.
   ============================================================ */

export type TimerMode = 'pomodoro' | 'regular';

export const DEFAULT_TIMER_MODE: TimerMode = 'pomodoro';

interface TimerModeRecord {
  mode: TimerMode;
  updatedAt: number; // ms epoch of the user's pick; 0 = never chosen
}

const LOCAL_KEY = 'wynko_timer_mode_v1';
const DEFAULT_RECORD: TimerModeRecord = { mode: DEFAULT_TIMER_MODE, updatedAt: 0 };

function isMode(v: unknown): v is TimerMode {
  return v === 'pomodoro' || v === 'regular';
}

/** Validates anything (localStorage JSON, a DB value). null = not a usable record. */
export function normalizeTimerMode(raw: unknown): TimerModeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isMode(r.mode)) return null;
  return { mode: r.mode, updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? r.updatedAt : 0 };
}

/* ── adapter 1: localStorage ─────────────────────────────── */

interface LocalRecord { userId: string | null; record: TimerModeRecord }

function readLocal(): LocalRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    // Before this was synced, the key held just 'pomodoro' / 'regular'. That
    // was still a real pick on this device: it wins over "never chosen" (1 > 0)
    // but loses to any choice actually saved to the account.
    if (isMode(raw)) return { userId: null, record: { mode: raw, updatedAt: 1 } };
    const parsed = JSON.parse(raw);
    const record = normalizeTimerMode(parsed?.record);
    if (!record) return null;
    return { userId: typeof parsed.userId === 'string' ? parsed.userId : null, record };
  } catch {
    return null;
  }
}

function writeLocal(record: TimerModeRecord, userId: string | null) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ userId, record }));
  } catch {
    /* best-effort cache (private mode / quota) */
  }
}

/* ── adapter 2: Supabase (user_profiles.timer_mode) ──────── */

async function fetchRemote(userId: string): Promise<TimerModeRecord | null | undefined> {
  // undefined = backend unavailable (offline, column not migrated yet);
  // null      = reachable, but this user has never picked a mode.
  try {
    const { data, error } = await sb.from('user_profiles').select('timer_mode').eq('id', userId).maybeSingle();
    if (error) return undefined;
    return normalizeTimerMode((data as any)?.timer_mode);
  } catch {
    return undefined;
  }
}

async function pushRemote(userId: string, record: TimerModeRecord): Promise<boolean> {
  try {
    const { error } = await sb.from('user_profiles').update({ timer_mode: record }).eq('id', userId);
    if (error) {
      console.warn('Timer mode: backend save unavailable, kept locally:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Timer mode: backend save failed, kept locally:', e);
    return false;
  }
}

/* ── the shared store ────────────────────────────────────── */

const initialLocal = typeof window === 'undefined' ? null : readLocal();
let state: TimerModeRecord = initialLocal?.record ?? DEFAULT_RECORD;
let stateOwner: string | null = initialLocal?.userId ?? null;
let currentUserId: string | null = null;
let liveFor: string | null = null;
const listeners = new Set<() => void>();

function commit(next: TimerModeRecord) {
  state = next;
  listeners.forEach((l) => l());
}

/** Synchronous current value - safe to call outside React (e.g. when creating a task). */
export function getTimerMode(): TimerMode {
  return state.mode;
}

// Realtime: a pick made on another device/tab lands in user_profiles; take
// it if it's newer than what this page has.
function followRemote(uid: string) {
  if (liveFor === uid) return;
  liveFor = uid;
  let timer: ReturnType<typeof setTimeout> | null = null;
  sb.channel(`timer-mode-${uid}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${uid}` }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (currentUserId !== uid) return;
        const remote = await fetchRemote(uid);
        if (remote && remote.updatedAt > state.updatedAt) {
          commit(remote);
          writeLocal(remote, uid);
        }
      }, 400);
    })
    .subscribe();
}

let hydration: Promise<void> | null = null;

/** Pulls the signed-in user's saved mode and reconciles it with the local cache. */
export function hydrateTimerMode(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          hydration = null; // not signed in yet - a later mount retries
          return;
        }
        const uid = session.user.id;
        currentUserId = uid;

        // The cache belongs to a different account (shared browser): don't carry it over.
        if (stateOwner && stateOwner !== uid) {
          commit(DEFAULT_RECORD);
          writeLocal(DEFAULT_RECORD, uid);
        }
        stateOwner = uid;
        followRemote(uid);

        const remote = await fetchRemote(uid);
        if (remote === undefined) {
          hydration = null; // backend unavailable - local cache keeps working; retry on a later mount
          return;
        }
        if (remote && remote.updatedAt > state.updatedAt) {
          commit(remote);
          writeLocal(remote, uid);
        } else if (state.updatedAt > 0 && (!remote || state.updatedAt > remote.updatedAt)) {
          // Picked on this device (offline, or before the column existed) and not saved yet.
          writeLocal(state, uid);
          await pushRemote(uid, state);
        } else {
          writeLocal(state, uid);
        }
      } catch {
        hydration = null; // transient failure - allow a retry
      }
    })();
  }
  return hydration;
}

/** Sets the mode as the user's new default everywhere (store + localStorage + Supabase). */
export function setTimerMode(mode: TimerMode): void {
  if (mode === state.mode) return;
  const next: TimerModeRecord = { mode, updatedAt: Date.now() };
  commit(next);
  writeLocal(next, currentUserId ?? stateOwner);
  void (async () => {
    try {
      let uid = currentUserId;
      if (!uid) {
        const { data: { session } } = await sb.auth.getSession();
        uid = session?.user.id ?? null;
      }
      if (!uid) return; // signed out: hydrateTimerMode() pushes it after sign-in
      currentUserId = uid;
      stateOwner = uid;
      writeLocal(next, uid);
      await pushRemote(uid, next);
    } catch {
      /* offline - hydrateTimerMode() pushes it up on a later visit */
    }
  })();
}

// Signing in (or switching account) without a reload: load that user's mode.
if (typeof window !== 'undefined') {
  sb.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null;
    if (uid && uid !== currentUserId) {
      hydration = null;
      void hydrateTimerMode();
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read - re-renders the component whenever the selected mode changes, anywhere. */
export function useTimerMode(): TimerMode {
  const mode = useSyncExternalStore(subscribe, getTimerMode, () => DEFAULT_TIMER_MODE);
  useEffect(() => {
    void hydrateTimerMode();
  }, []);
  return mode;
}
