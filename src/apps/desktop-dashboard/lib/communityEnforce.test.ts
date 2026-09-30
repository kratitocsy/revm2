import { describe, it, expect } from 'vitest';
import type { SupaLike } from '../wynky/wynkyPlanner';
import { communityWeekSlots, enforceCommunitySchedule, releaseCommunitySchedule, toHHMM, COMMUNITY_STUDY_PRESET_NAME } from './communityEnforce';

// Tests run in node, which has no localStorage.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};

// Supabase stand-in: `tables` answers selects on focus_lock_schedules /
// wynky_profiles, inserts get fresh ids, every write is recorded.
function fakeSb(tables: { schedules?: any[]; profile?: any } = {}) {
  const writes: { table: string; op: string; row: any; id?: string }[] = [];
  let n = 0;
  const sb: SupaLike = {
    from(table: string) {
      let op = 'select'; let row: any = null; let id: string | undefined;
      const q: any = {
        select: () => q,
        eq: (col: string, v: string) => { if (col === 'id') id = v; return q; },
        delete: () => { op = 'delete'; return q; },
        insert: (r: any) => { writes.push({ table, op: 'insert', row: r }); return q; },
        update: (r: any) => { op = 'update'; row = r; return q; },
        maybeSingle: async () => ({ data: table === 'wynky_profiles' ? tables.profile ?? null : null, error: null }),
        single: async () => ({ data: { id: `${table}-${++n}` }, error: null }),
        then: (resolve: (v: any) => void) => {
          if (op !== 'select') writes.push({ table, op, row, id });
          resolve({ data: op === 'select' && table === 'focus_lock_schedules' ? tables.schedules ?? [] : null, error: null });
        },
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { sb, writes };
}

describe('toHHMM', () => {
  it('reads the dashboard clock format and 24-hour times', () => {
    expect(toHHMM('9:05 AM')).toBe('09:05');
    expect(toHHMM('12:30 AM')).toBe('00:30');
    expect(toHHMM('12:00 PM')).toBe('12:00');
    expect(toHHMM('7:15 pm')).toBe('19:15');
    expect(toHHMM('6:00')).toBe('06:00');
    expect(toHHMM('soon')).toBeNull();
  });
});

describe('communityWeekSlots', () => {
  it('moves Monday-first days to Sunday-first and caps blocks past midnight', () => {
    const week = [
      [{ subject: 'Physics', startTime: '10:00 AM', endTime: '11:00 AM' }, { subject: 'Maths', startTime: '8:00 AM', endTime: '9:00 AM' }],
      [], [], [], [], [],
      [{ subject: 'Chemistry', startTime: '11:00 PM', endTime: '1:00 AM' }, { subject: 'Bad', startTime: '', endTime: '2:00 PM' }],
    ];
    expect(communityWeekSlots(week)).toEqual({
      1: [{ subject: 'Maths', startTime: '08:00', endTime: '09:00' }, { subject: 'Physics', startTime: '10:00', endTime: '11:00' }],
      0: [{ subject: 'Chemistry', startTime: '23:00', endTime: '23:59' }],
    });
  });
});

describe('enforceCommunitySchedule', () => {
  const week = [[{ subject: 'Physics', startTime: '9:00 AM', endTime: '10:00 AM' }, { subject: 'Biology', startTime: '10:30 AM', endTime: '11:30 AM' }], [], [], [], [], [], []];

  it('uses the member\'s own allow-list, blocks distractions for other subjects, and pauses their own schedules', async () => {
    localStorage.clear();
    const { sb, writes } = fakeSb({
      profile: { subject_allowlists: { Physics: { sites: ['khanacademy.org'], apps: [] } } },
      schedules: [{ id: 'own1', name: 'Wynky Plan', active: true }, { id: 'off', name: 'Old', active: false }],
    });
    await enforceCommunitySchedule(sb, 'u1', 'JEE Squad', week);

    expect(writes.filter(w => w.table === 'focus_lock_schedules' && w.op === 'update' && w.row.active === false).map(w => w.id)).toEqual(['own1']);
    const presets = writes.filter(w => w.table === 'focus_lock_presets' && w.op === 'insert').map(w => w.row.name);
    expect(presets).toEqual(['Wynky — Physics', COMMUNITY_STUDY_PRESET_NAME]);
    const schedule = writes.find(w => w.table === 'focus_lock_schedules' && w.op === 'insert')!.row;
    expect(schedule).toMatchObject({ name: 'Community — JEE Squad - Mon', days_of_week: [1] });
    const slots = writes.filter(w => w.table === 'focus_lock_schedule_slots' && w.op === 'insert').flatMap(w => w.row);
    expect(slots.map(s => [s.subject, s.start_time, s.end_time, !!s.preset_id])).toEqual([
      ['Physics', '09:00', '10:00', true], ['Biology', '10:30', '11:30', true],
    ]);
    expect(localStorage.getItem('wynko.communityPaused.u1')).toBe('["own1"]');
  });

  it('switches paused schedules back on when released, only for the enforced community', async () => {
    localStorage.setItem('wynko.communityPaused.u1', '["own1"]');
    const other = fakeSb({ schedules: [{ id: 'c1', name: 'Community — JEE Squad - Mon', active: true }] });
    await releaseCommunitySchedule(other.sb, 'u1', 'NEET Crew');
    expect(other.writes).toEqual([]);

    const { sb, writes } = fakeSb({ schedules: [{ id: 'c1', name: 'Community — JEE Squad - Mon', active: true }] });
    await releaseCommunitySchedule(sb, 'u1', 'JEE Squad');
    expect(writes.filter(w => w.table === 'focus_lock_schedules' && w.op === 'delete').map(w => w.id)).toEqual(['c1']);
    expect(writes.filter(w => w.op === 'update').map(w => [w.id, w.row.active])).toEqual([['own1', true]]);
    expect(localStorage.getItem('wynko.communityPaused.u1')).toBeNull();
  });
});
