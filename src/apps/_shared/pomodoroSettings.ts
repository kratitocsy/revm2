import { useEffect, useSyncExternalStore } from 'react';
import { sb } from './supabaseClient';

/* ============================================================
   The user's saved Pomodoro configuration (focus length, break
   length, Repeat, Auto-start breaks).

   Persistence, in layers - each one is a small adapter below, so
   the storage can change without touching the UI or the timer:

   1. Module store  - the live value every mounted component reads
      (Focus Lock, Study Rooms, ...) via usePomodoroSettings().
   2. localStorage  - synchronous cache, so the very first render
      already shows the saved 50/10 instead of flashing 25/5, and
      so it keeps working offline / before the backend column
      exists. Survives refresh, sign-out/sign-in and new days
      (sign-out here never clears local keys).
   3. Supabase      - user_profiles.pomodoro_settings (jsonb), the
      same per-user table Home's daily goal etc. already live in
      (see supabase_migrations/0063_*). This is what carries the
      setting across devices and browsers.

   Reconciliation is last-write-wins on `updatedAt`, so a change
   made offline (or before the migration was applied) is pushed up
   later instead of being overwritten by an older server value.
   `updatedAt === 0` means "never customized" - the built-in
   defaults, which never win over a real saved value.
   ============================================================ */

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  /** After a break ends, keep going into the next focus session. */
  repeat: boolean;
  /** Start the break automatically when a focus session ends. */
  autoStartBreaks: boolean;
  /** ms epoch of the last save; 0 = never customized (defaults). */
  updatedAt: number;
}

export const POMODORO_LIMITS = {
  focus: { min: 1, max: 180 },
  break: { min: 1, max: 60 },
} as const;

// Only the initial defaults - a saved value always replaces them.
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  repeat: true,
  autoStartBreaks: true,
  updatedAt: 0,
};

export type PomodoroSettingsInput = Omit<PomodoroSettings, 'updatedAt'>;

const LOCAL_KEY = 'wynko_pomodoro_settings_v1';

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}

/** Validates/clamps anything (localStorage JSON, a DB row, form input). null = not an object. */
export function normalizePomodoroSettings(raw: unknown): PomodoroSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_POMODORO_SETTINGS;
  return {
    focusMinutes: clampInt(r.focusMinutes, POMODORO_LIMITS.focus.min, POMODORO_LIMITS.focus.max, d.focusMinutes),
    breakMinutes: clampInt(r.breakMinutes, POMODORO_LIMITS.break.min, POMODORO_LIMITS.break.max, d.breakMinutes),
    repeat: typeof r.repeat === 'boolean' ? r.repeat : d.repeat,
    autoStartBreaks: typeof r.autoStartBreaks === 'boolean' ? r.autoStartBreaks : d.autoStartBreaks,
    updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? r.updatedAt : 0,
  };
}

/** "Focus • 50/10 • Repeat" - always built from the saved values, never hard-coded. */
export function pomodoroSummaryLabel(s: Pick<PomodoroSettings, 'focusMinutes' | 'breakMinutes' | 'repeat'>): string {
  return `Focus • ${s.focusMinutes}/${s.breakMinutes} • ${s.repeat ? 'Repeat' : 'Once'}`;
}

/* ── adapter 1: localStorage ─────────────────────────────── */

interface LocalRecord {
  userId: string | null;
  settings: PomodoroSettings;
}

function readLocal(): LocalRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const settings = normalizePomodoroSettings(parsed?.settings);
    if (!settings) return null;
    return { userId: typeof parsed.userId === 'string' ? parsed.userId : null, settings };
  } catch {
    return null; // corrupt/inaccessible storage - fall back to defaults
  }
}

function writeLocal(settings: PomodoroSettings, userId: string | null) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ userId, settings }));
  } catch {
    /* best-effort cache */
  }
}

/* ── adapter 2: Supabase (user_profiles.pomodoro_settings) ─ */

async function fetchRemote(userId: string): Promise<PomodoroSettings | null | undefined> {
  // undefined = backend unavailable (column not migrated yet, offline);
  // null      = reachable, but this user has never saved anything.
  try {
    const { data, error } = await sb.from('user_profiles').select('pomodoro_settings').eq('id', userId).maybeSingle();
    if (error) return undefined;
    return normalizePomodoroSettings((data as any)?.pomodoro_settings);
  } catch {
    return undefined;
  }
}

async function pushRemote(userId: string, settings: PomodoroSettings): Promise<boolean> {
  try {
    const { error } = await sb.from('user_profiles').update({ pomodoro_settings: settings }).eq('id', userId);
    if (error) {
      console.warn('Pomodoro settings: backend save unavailable, kept locally:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Pomodoro settings: backend save failed, kept locally:', e);
    return false;
  }
}

/* ── the shared store ────────────────────────────────────── */

const initialLocal = readLocal();
let state: PomodoroSettings = initialLocal?.settings ?? DEFAULT_POMODORO_SETTINGS;
let stateOwner: string | null = initialLocal?.userId ?? null;
let currentUserId: string | null = null;
const listeners = new Set<() => void>();

function commit(next: PomodoroSettings) {
  state = next;
  listeners.forEach(l => l());
}

export function getPomodoroSettings(): PomodoroSettings {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let hydration: Promise<void> | null = null;

/** Pulls the signed-in user's saved settings and reconciles with the local cache. Runs once per page load. */
export function hydratePomodoroSettings(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) {
          hydration = null; // not signed in yet - let a later mount retry
          return;
        }
        const uid = session.user.id;
        currentUserId = uid;

        // The cache belongs to a different account (shared browser): don't leak it across users.
        if (stateOwner && stateOwner !== uid) {
          commit(DEFAULT_POMODORO_SETTINGS);
          writeLocal(DEFAULT_POMODORO_SETTINGS, uid);
        }
        stateOwner = uid;

        const remote = await fetchRemote(uid);
        if (remote === undefined) {
          hydration = null; // backend unavailable (offline / column not migrated) - local cache keeps working; retry on a later mount
          return;
        }

        if (remote && remote.updatedAt > state.updatedAt) {
          commit(remote);
          writeLocal(remote, uid);
        } else if (state.updatedAt > 0 && (!remote || state.updatedAt > remote.updatedAt)) {
          // Saved locally (offline, or before the column existed) and the server hasn't seen it yet.
          writeLocal(state, uid);
          await pushRemote(uid, state);
        }
      } catch {
        hydration = null; // transient failure - allow a retry on next mount
      }
    })();
  }
  return hydration;
}

/** Saves as the user's new default everywhere (store + localStorage + Supabase). */
export async function savePomodoroSettings(input: PomodoroSettingsInput): Promise<PomodoroSettings> {
  const next = normalizePomodoroSettings({ ...input, updatedAt: Date.now() }) as PomodoroSettings;
  commit(next);
  writeLocal(next, currentUserId ?? stateOwner);
  try {
    let uid = currentUserId;
    if (!uid) {
      const {
        data: { session },
      } = await sb.auth.getSession();
      uid = session?.user.id ?? null;
    }
    if (uid) {
      currentUserId = uid;
      stateOwner = uid;
      writeLocal(next, uid);
      await pushRemote(uid, next);
    }
  } catch {
    /* offline - hydrate() pushes it up on a later visit */
  }
  return next;
}

export function usePomodoroSettings() {
  const settings = useSyncExternalStore(subscribe, getPomodoroSettings, getPomodoroSettings);
  useEffect(() => {
    void hydratePomodoroSettings();
  }, []);
  return { settings, save: savePomodoroSettings };
}
