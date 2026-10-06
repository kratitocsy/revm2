import { describe, it, expect } from 'vitest';
import { confirmAiPlan, confirmPlan, confirmWeekPlan, istWeekParity, ensurePresets, eventsFromSummary, NoEnforceableBlocksError, type LearnedRow, type SupaLike } from './wynkyPlanner';

// Minimal stand-in for the Supabase query builder: every lookup finds
// nothing, every insert gets a fresh id, and all writes are recorded.
function fakeSb() {
  const writes: { table: string; op: string; row: any }[] = [];
  let n = 0;
  const sb: SupaLike = {
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q,
        delete: () => { writes.push({ table, op: 'delete', row: null }); return q; },
        insert: (row: any) => { writes.push({ table, op: 'insert', row }); return q; },
        update: (row: any) => { writes.push({ table, op: 'update', row }); return q; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: `${table}-${++n}` }, error: null }),
        then: (resolve: (v: any) => void) => resolve({ data: null, error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { sb, writes };
}

const slotRows = (writes: ReturnType<typeof fakeSb>['writes']) =>
  writes.filter(w => w.table === 'focus_lock_schedule_slots').flatMap(w => w.row);

describe('confirmAiPlan', () => {
  const base = { userId: 'u1', planName: 'Plan', daysOfWeek: [1], freeTimeSites: [], freeTimeApps: [] };
  const sleep = { start_time: '23:00', end_time: '06:00', preset_name: '', is_sleep: true };

  it('refuses to save when no study block matches a preset, instead of writing only the sleep lock', async () => {
    const { sb, writes } = fakeSb();
    await expect(confirmAiPlan(sb, {
      ...base, subjectAllowlists: {},
      aiSlots: [{ start_time: '07:00', end_time: '09:00', preset_name: 'Made up', subject: 'Physics' }, sleep],
    })).rejects.toBeInstanceOf(NoEnforceableBlocksError);
    expect(writes.some(w => w.table.startsWith('focus_lock_schedule'))).toBe(false);
  });

  it('writes and reports only the blocks it could map, falling back to the subject preset', async () => {
    const { sb, writes } = fakeSb();
    const { writtenSlots } = await confirmAiPlan(sb, {
      ...base, subjectAllowlists: { Physics: { sites: ['khanacademy.org'], apps: [] } },
      aiSlots: [
        { start_time: '07:00', end_time: '09:00', preset_name: 'Physics', subject: 'Physics' },
        { start_time: '10:00', end_time: '11:00', preset_name: 'Made up', subject: 'Chemistry' },
        sleep,
      ],
    });
    expect(writtenSlots.map(s => s.subject ?? 'sleep')).toEqual(['Physics', 'sleep']);
    expect(slotRows(writes).map(r => r.is_sleep ? 'sleep' : r.subject)).toEqual(['Physics', 'sleep']);
  });
});

describe('confirmPlan', () => {
  const result = {
    blocks: [
      { kind: 'study' as const, startMinutes: 420, endMinutes: 480, startTime: '07:00', endTime: '08:00', subjectName: 'Physics' },
      { kind: 'sleep' as const, startMinutes: 1380, endMinutes: 1830, startTime: '23:00', endTime: '06:30' },
    ],
    requestedMinutes: 60, usableWindowMinutes: 900, scheduledStudyMinutes: 60, placedStudyMinutes: 60, blockLengthMinutes: 60, wasCut: false,
  };
  const base = { userId: 'u1', planName: 'Wynky Plan', result, daysOfWeek: [1], freeTimeApps: [] };

  it('refuses to save when no study block has anything to enforce', async () => {
    const { sb, writes } = fakeSb();
    await expect(confirmPlan(sb, { ...base, subjectAllowlists: {}, freeTimeSites: [] })).rejects.toBeInstanceOf(NoEnforceableBlocksError);
    expect(writes.some(w => w.table.startsWith('focus_lock_schedule'))).toBe(false);
  });

  it('covers a subject with no allow-list with the free-time blocklist and reports what it saved', async () => {
    const { sb } = fakeSb();
    const { writtenSlots } = await confirmPlan(sb, { ...base, subjectAllowlists: {}, freeTimeSites: ['instagram.com'] });
    expect(writtenSlots.map(s => (s.isSleep ? 'sleep' : s.subject))).toEqual(['Physics', 'sleep']);
  });
});

describe('ensurePresets apps mode', () => {
  const presetRow = (writes: ReturnType<typeof fakeSb>['writes']) =>
    writes.find(w => w.table === 'focus_lock_presets' && w.op === 'insert')!.row;

  it('blocks the listed apps unless the student chose "allow only"', async () => {
    const { sb, writes } = fakeSb();
    await ensurePresets(sb, 'u1', { subjectAllowlists: { Physics: { sites: [], apps: ['steam.exe'] } }, freeTimeSites: [], freeTimeApps: [] });
    expect(presetRow(writes).apps_mode).toBe('blacklist');
  });

  it('keeps only the listed apps open when the student chose "allow only"', async () => {
    const { sb, writes } = fakeSb();
    await ensurePresets(sb, 'u1', { subjectAllowlists: { Physics: { sites: [], apps: ['AcroRd32.exe'], appsMode: 'whitelist' } }, freeTimeSites: [], freeTimeApps: [] });
    expect(presetRow(writes).apps_mode).toBe('whitelist');
  });

  it('does not lock the whole web for a subject set up with only apps', async () => {
    const { sb, writes } = fakeSb();
    await ensurePresets(sb, 'u1', { subjectAllowlists: { Physics: { sites: [], apps: ['AcroRd32.exe'], appsMode: 'whitelist' } }, freeTimeSites: [], freeTimeApps: [] });
    expect(presetRow(writes).mode).toBe('blacklist');
    expect(presetRow(writes).sites).toEqual([]);
  });

  it('saves an empty allow-only app list when the student chose "close every app"', async () => {
    const { sb, writes } = fakeSb();
    await ensurePresets(sb, 'u1', { subjectAllowlists: { Physics: { sites: ['khanacademy.org'], apps: [], appsMode: 'whitelist' } }, freeTimeSites: [], freeTimeApps: [] });
    expect(presetRow(writes).apps_mode).toBe('whitelist');
    expect(presetRow(writes).apps).toEqual([]);
  });

  it('leaves apps alone when no apps were picked and no mode was chosen', async () => {
    const { sb, writes } = fakeSb();
    await ensurePresets(sb, 'u1', { subjectAllowlists: { Physics: { sites: ['khanacademy.org'], apps: [] } }, freeTimeSites: [], freeTimeApps: [] });
    expect(presetRow(writes).apps_mode).toBe('blacklist');
  });
});

describe('eventsFromSummary', () => {
  const row = (over: Partial<LearnedRow>): LearnedRow => ({
    field: 'wake', value: '06:00', multi: false, accepted_n: 3, changed_n: 0, requested_n: 0,
    last_action: 'accepted', last_at: '2026-01-10T00:00:00Z', ...over,
  });

  it('brings back archived answers as their last action, with a second "kept" when kept more than once', () => {
    const out = eventsFromSummary([row({})], []);
    expect(out.map(e => e.action)).toEqual(['accepted', 'accepted']);
    expect(out[0].at).toBe('2026-01-10T00:00:00Z');
  });

  it('skips answers whose own events are still loaded', () => {
    const recent = [{ field: 'wake', value: '06:00', multi: false, action: 'accepted' as const, at: '2026-09-01T00:00:00Z' }];
    expect(eventsFromSummary([row({})], recent)).toEqual([]);
  });

  it('keeps a removal as a single removal and a typed request as a request', () => {
    expect(eventsFromSummary([row({ field: 'sites:physics', value: 'youtube.com', multi: true, last_action: 'removed' })], []).map(e => e.action)).toEqual(['removed']);
    expect(eventsFromSummary([row({ requested_n: 1, accepted_n: 0, last_action: 'requested' })], [])[0].action).toBe('requested');
  });
});

describe('confirmWeekPlan', () => {
  const day = (subject: string) => ({
    blocks: [
      { kind: 'study' as const, startMinutes: 360, endMinutes: 420, startTime: '06:00', endTime: '07:00', subjectName: subject },
      { kind: 'study' as const, startMinutes: 1020, endMinutes: 1080, startTime: '17:00', endTime: '18:00', subjectName: subject },
    ],
    requestedMinutes: 120, usableWindowMinutes: 120, scheduledStudyMinutes: 120, placedStudyMinutes: 120,
    blockLengthMinutes: 60, wasCut: false,
  });
  const base = {
    userId: 'u1', planName: 'Plan', freeTimeSites: [], freeTimeApps: [],
    subjectAllowlists: { Physics: { sites: ['khanacademy.org'], apps: [] }, Maths: { sites: ['khanacademy.org'], apps: [] } },
  };
  const schedules = (writes: ReturnType<typeof fakeSb>['writes']) =>
    writes.filter(w => w.table === 'focus_lock_schedules' && w.op === 'insert').map(w => w.row);
  const week7 = (subject: string) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, day(subject)]));

  it('skips days off and saves every week with no week parity', async () => {
    const { sb, writes } = fakeSb();
    await confirmWeekPlan(sb, { ...base, week: week7('Physics'), activeDays: [1, 2, 3, 4, 5] });
    const rows = schedules(writes);
    expect(rows.map(r => r.name)).toEqual(['Plan - Mon', 'Plan - Tue', 'Plan - Wed', 'Plan - Thu', 'Plan - Fri']);
    expect(rows.every(r => r.week_parity === null)).toBe(true);
  });

  it('runs every other week starting this week', async () => {
    const { sb, writes } = fakeSb();
    const now = new Date('2026-09-29T06:00:00Z');
    await confirmWeekPlan(sb, { ...base, week: week7('Physics'), repeatWeeks: 2, now });
    const rows = schedules(writes);
    expect(rows).toHaveLength(7);
    expect(rows.every(r => r.week_parity === istWeekParity(now))).toBe(true);
  });

  it('saves Week A this week and Week B next week', async () => {
    const { sb, writes } = fakeSb();
    const now = new Date('2026-09-29T06:00:00Z');
    const week = { ...week7('Physics'), ...Object.fromEntries([7, 8, 9, 10, 11, 12, 13].map(d => [d, day('Maths')])) };
    await confirmWeekPlan(sb, { ...base, week, now });
    const rows = schedules(writes);
    const a = rows.find(r => r.name === 'Plan - A Tue');
    const b = rows.find(r => r.name === 'Plan - B Tue');
    expect(rows).toHaveLength(14);
    expect(a.days_of_week).toEqual([2]);
    expect(b.days_of_week).toEqual([2]);
    expect(a.week_parity).toBe(istWeekParity(now));
    expect(b.week_parity).toBe(1 - istWeekParity(now));
  });

  it('uses a block-only set-up for that block and the day set-up for the rest', async () => {
    const { sb, writes } = fakeSb();
    await confirmWeekPlan(sb, {
      ...base, week: { 2: day('Physics') },
      dayOverrides: { 2: { Physics: { sites: ['eduniti.in'], apps: [] }, 'Physics@17:00': { sites: ['youtube.com'], apps: [] } } },
    });
    const presetInserts = writes.filter(w => w.table === 'focus_lock_presets' && w.op === 'insert').map(w => w.row.name);
    expect(presetInserts).toEqual(expect.arrayContaining(['Wynky — Physics (Tue)', 'Wynky — Physics (Tue 17:00)']));
    const slots = slotRows(writes);
    expect(slots).toHaveLength(2);
    expect(slots[0].preset_id).not.toBe(slots[1].preset_id);
  });
});

describe('istWeekParity', () => {
  it('matches schedule-tick: week of Sunday 2026-08-02 is 0, weeks flip on Sunday, India time', () => {
    expect(istWeekParity(new Date('2026-08-02T00:00:00+05:30'))).toBe(0);
    expect(istWeekParity(new Date('2026-08-08T23:59:00+05:30'))).toBe(0);
    expect(istWeekParity(new Date('2026-08-09T00:00:00+05:30'))).toBe(1);
    expect(istWeekParity(new Date('2026-08-16T09:00:00+05:30'))).toBe(0);
    // Saturday 23:00 IST is still the old week even though UTC is earlier/later.
    expect(istWeekParity(new Date('2026-08-15T23:00:00+05:30'))).toBe(1);
  });
});
