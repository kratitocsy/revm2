import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock('./supabaseClient', () => ({ sb: { rpc: (...a: unknown[]) => rpc(...a), auth: { getSession: () => getSession() } } }));

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

import { logStudyTime, flushStudyTimeQueue, studyLogDayKey } from './studyTimeLog';

const queue = () => JSON.parse(store.get('wynko_pending_study_log_v1') || '[]');

describe('studyTimeLog', () => {
  beforeEach(() => {
    store.clear();
    rpc.mockReset();
    getSession.mockReset();
  });

  it('sends queued time through rpc_log_study_time and empties the queue', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    rpc.mockResolvedValue({ error: null });
    logStudyTime('Quick Timer', 90.7);
    await flushStudyTimeQueue();
    expect(rpc).toHaveBeenCalledWith('rpc_log_study_time', { p_subject: 'Quick Timer', p_seconds: 90, p_day: studyLogDayKey() });
    expect(queue()).toEqual([]);
  });

  it('keeps time queued while signed out or when the server call fails', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    logStudyTime('Quick Timer', 60);
    await flushStudyTimeQueue();
    expect(rpc).not.toHaveBeenCalled();
    expect(queue()).toEqual([{ day: studyLogDayKey(), subject: 'Quick Timer', seconds: 60 }]);

    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    rpc.mockResolvedValue({ error: { message: 'offline' } });
    await flushStudyTimeQueue();
    expect(queue()).toEqual([{ day: studyLogDayKey(), subject: 'Quick Timer', seconds: 60 }]);
  });

  it('merges repeated entries for the same day and subject, and ignores under a second', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    logStudyTime('Quick Timer', 60);
    logStudyTime('Quick Timer', 30);
    logStudyTime('Physics', 0.4);
    await flushStudyTimeQueue();
    expect(queue()).toEqual([{ day: studyLogDayKey(), subject: 'Quick Timer', seconds: 90 }]);
  });
});
