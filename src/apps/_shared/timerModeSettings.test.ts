import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Supabase stand-in: one user_profiles row, auth session, realtime no-op.
const db: { timer_mode: unknown } = { timer_mode: null };
const updates: unknown[] = [];
let session: { user: { id: string } } | null = { user: { id: 'u1' } };
vi.mock('./supabaseClient', () => ({
  sb: {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timer_mode: db.timer_mode }, error: null }) }) }),
      update: (patch: { timer_mode: unknown }) => ({
        eq: async () => { db.timer_mode = patch.timer_mode; updates.push(patch.timer_mode); return { error: null }; },
      }),
    }),
  },
}));

const store = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

async function freshModule() {
  vi.resetModules();
  return import('./timerModeSettings');
}

describe('timer mode saved per user', () => {
  beforeEach(() => {
    store.clear();
    updates.length = 0;
    db.timer_mode = null;
    session = { user: { id: 'u1' } };
  });

  it('defaults to Pomodoro for a user who never picked one', async () => {
    const m = await freshModule();
    await m.hydrateTimerMode();
    expect(m.getTimerMode()).toBe('pomodoro');
    expect(updates).toEqual([]);
  });

  it("loads the account's saved mode on a new device", async () => {
    db.timer_mode = { mode: 'regular', updatedAt: 1000 };
    const m = await freshModule();
    await m.hydrateTimerMode();
    expect(m.getTimerMode()).toBe('regular');
  });

  it('saves a manual change to the account and keeps it after reload', async () => {
    const m = await freshModule();
    await m.hydrateTimerMode();
    m.setTimerMode('regular');
    await vi.waitFor(() => expect(updates.length).toBe(1));
    expect(db.timer_mode).toMatchObject({ mode: 'regular' });

    const reloaded = await freshModule();
    expect(reloaded.getTimerMode()).toBe('regular'); // local cache, first render
    await reloaded.hydrateTimerMode();
    expect(reloaded.getTimerMode()).toBe('regular');
  });

  it('carries over a mode picked on this device before it was synced', async () => {
    store.set('wynko_timer_mode_v1', 'regular'); // old plain-string format
    const m = await freshModule();
    await m.hydrateTimerMode();
    expect(m.getTimerMode()).toBe('regular');
    expect(db.timer_mode).toMatchObject({ mode: 'regular' });
  });

  it("an older local copy doesn't override a newer choice from another device", async () => {
    store.set('wynko_timer_mode_v1', JSON.stringify({ userId: 'u1', record: { mode: 'pomodoro', updatedAt: 100 } }));
    db.timer_mode = { mode: 'regular', updatedAt: 200 };
    const m = await freshModule();
    await m.hydrateTimerMode();
    expect(m.getTimerMode()).toBe('regular');
    expect(updates).toEqual([]);
  });

  it("doesn't carry one account's mode over to another account", async () => {
    store.set('wynko_timer_mode_v1', JSON.stringify({ userId: 'someone-else', record: { mode: 'regular', updatedAt: 500 } }));
    const m = await freshModule();
    await m.hydrateTimerMode();
    expect(m.getTimerMode()).toBe('pomodoro');
    expect(updates).toEqual([]);
  });
});
