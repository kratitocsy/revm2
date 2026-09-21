import { useSyncExternalStore } from 'react';

/* ============================================================
   The user's last-selected timer mode ('pomodoro' | 'regular').

   This is deliberately separate from pomodoroSettings.ts (which
   holds the focus/break *lengths*): this file only remembers
   WHICH of the two timer blocks the user picked last, so that:

     - Adding a task never asks "which timer mode?" - Start just
       uses whatever was picked last (defaulting to Pomodoro for
       a user who has never picked anything).
     - The choice persists across visits/reloads until the user
       taps the other timer block themselves.
     - Home, Focus Lock and the task picker all agree, since they
       all read/write this one store instead of keeping their own
       local `useState<TimerMode>`.

   Same lightweight pattern as pomodoroSettings.ts: a module-level
   store (for the instant in-memory read) backed by localStorage
   (so it survives reloads and works before/without a network
   round trip). No Supabase sync here - unlike focus/break length,
   which timer block is selected right now is a light, per-device
   UI preference, not data worth reconciling across devices.
   ============================================================ */

export type TimerMode = 'pomodoro' | 'regular';

export const DEFAULT_TIMER_MODE: TimerMode = 'pomodoro';

const LOCAL_KEY = 'wynko_timer_mode_v1';

function readLocal(): TimerMode {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw === 'pomodoro' || raw === 'regular' ? raw : DEFAULT_TIMER_MODE;
  } catch {
    return DEFAULT_TIMER_MODE;
  }
}

let current: TimerMode = typeof window === 'undefined' ? DEFAULT_TIMER_MODE : readLocal();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

/** Synchronous current value - safe to call outside React (e.g. when creating a task). */
export function getTimerMode(): TimerMode {
  return current;
}

/** Sets the mode as the user's new default. Persists immediately and notifies every mounted reader. */
export function setTimerMode(mode: TimerMode): void {
  if (mode === current) return;
  current = mode;
  try { localStorage.setItem(LOCAL_KEY, mode); } catch { /* ignore (private mode / quota) */ }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read - re-renders the component whenever the selected mode changes, anywhere. */
export function useTimerMode(): TimerMode {
  return useSyncExternalStore(subscribe, getTimerMode, () => DEFAULT_TIMER_MODE);
}
