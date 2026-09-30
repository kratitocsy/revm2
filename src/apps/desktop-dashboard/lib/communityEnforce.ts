import { ensurePresets, loadRemembered, rememberAllowlists, writeSchedule, type PlanSlotInput, type SubjectAllowlist, type SupaLike } from '../wynky/wynkyPlanner';
import { isEnforceable } from '../wynky/wynkyChatFlow';

/* ============================================================
   Focus Lock enforcement of an accepted community schedule.

   On accepting, the member confirms per subject which sites, channels
   and apps stay allowed (CommunityFocusSetup.tsx). The week is then written as real
   focus_lock_schedules (one per weekday, "Community — <name> - Mon"),
   the same tables schedule-tick and the desktop app enforce every
   minute. Each block uses the member's own saved allow-list for that
   subject (the "Wynky — <subject>" preset); a subject with none gets a
   shared blocklist of common distractions, so every block is enforced.

   While a community schedule is followed, the member's other active
   schedules are paused (they would otherwise pre-empt community blocks)
   and switched back on when the member rejects it or leaves.
   ============================================================ */

export const COMMUNITY_PLAN_PREFIX = 'Community — ';
export const COMMUNITY_STUDY_PRESET_NAME = 'Community — Study';
// Real, well-known domains only. YouTube stays open for study videos.
export const COMMUNITY_BLOCKED_SITES = [
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'reddit.com',
  'netflix.com', 'twitch.tv', 'tiktok.com', 'pinterest.com', 'web.whatsapp.com',
];
export const COMMUNITY_BLOCKED_APPS = ['Instagram', 'WhatsApp', 'Netflix'];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const planLabel = (communityName: string) => (communityName.trim() || 'Community').slice(0, 60);
const pausedKey = (userId: string) => `wynko.communityPaused.${userId}`;

export interface CommunityItem { subject: string; startTime: string; endTime: string }

/** "9:00 AM" (or "09:00") to "09:00"; null when it isn't a time. */
export function toHHMM(t: string): string | null {
  const s = t.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    const h = (parseInt(ampm[1], 10) % 12) + (/pm/i.test(ampm[3]) ? 12 : 0);
    const m = parseInt(ampm[2], 10);
    return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
  }
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24 && +h24[1] < 24 && +h24[2] < 60) return `${h24[1].padStart(2, '0')}:${h24[2]}`;
  return null;
}

/** The community week (index 0 = Monday) as slots per Focus Lock weekday
 *  (0 = Sunday). A block running past midnight stops at 23:59, since a
 *  slot can't cross into the next day. */
export function communityWeekSlots(week: CommunityItem[][]): Record<number, { subject: string; startTime: string; endTime: string }[]> {
  const out: Record<number, { subject: string; startTime: string; endTime: string }[]> = {};
  week.slice(0, 7).forEach((items, mondayFirst) => {
    const day = (mondayFirst + 1) % 7;
    const slots = (items || [])
      .map(it => ({ subject: (it.subject || 'Study').trim() || 'Study', startTime: toHHMM(it.startTime), endTime: toHHMM(it.endTime) }))
      .filter((s): s is { subject: string; startTime: string; endTime: string } => !!s.startTime && !!s.endTime && s.startTime !== s.endTime)
      .map(s => (s.endTime < s.startTime ? { ...s, endTime: '23:59' } : s))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (slots.length) out[day] = slots;
  });
  return out;
}

function readPaused(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(pausedKey(userId)) || '[]') as string[]; } catch { return []; }
}
function writePaused(userId: string, ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(pausedKey(userId), JSON.stringify(ids));
    else localStorage.removeItem(pausedKey(userId));
  } catch { /* private window: schedules then stay paused until switched back on by hand */ }
}

async function deleteCommunitySchedules(sb: SupaLike, userId: string): Promise<void> {
  const { data } = await sb.from('focus_lock_schedules').select('id, name').eq('user_id', userId);
  for (const r of ((data as { id: string; name: string }[]) || []).filter(r => r.name.startsWith(COMMUNITY_PLAN_PREFIX))) {
    await sb.from('focus_lock_schedule_slots').delete().eq('schedule_id', r.id);
    await sb.from('focus_lock_schedules').delete().eq('id', r.id);
  }
}

async function ensureCommunityStudyPreset(sb: SupaLike, userId: string): Promise<string> {
  const fields = { mode: 'blacklist', sites: COMMUNITY_BLOCKED_SITES, apps: COMMUNITY_BLOCKED_APPS, apps_mode: 'blacklist' };
  const { data: existing } = await sb.from('focus_lock_presets')
    .select('id').eq('user_id', userId).eq('name', COMMUNITY_STUDY_PRESET_NAME).maybeSingle();
  if (existing?.id) {
    await sb.from('focus_lock_presets').update(fields).eq('id', existing.id);
    return existing.id;
  }
  const { data: created, error } = await sb.from('focus_lock_presets')
    .insert({ user_id: userId, name: COMMUNITY_STUDY_PRESET_NAME, ...fields }).select('id').single();
  if (error) throw new Error(error.message);
  return created.id;
}

export function communitySubjects(week: CommunityItem[][]): string[] {
  return [...new Set(Object.values(communityWeekSlots(week)).flat().map(s => s.subject))];
}

/** The member's saved Wynky set-up, used to pre-fill the accept step. */
export async function savedAllowlists(sb: SupaLike, userId: string): Promise<Record<string, SubjectAllowlist>> {
  return (await loadRemembered(sb, userId)).subjectAllowlists;
}

/** Makes Focus Lock enforce an accepted community week for this member,
 *  with the allow-lists they confirmed on accepting (saved back to their
 *  Wynky set-up too). Replaces any earlier community schedule (one is
 *  followed at a time). */
export async function enforceCommunitySchedule(sb: SupaLike, userId: string, communityName: string, week: CommunityItem[][], chosen?: Record<string, SubjectAllowlist>): Promise<void> {
  const byDay = communityWeekSlots(week);
  const subjects = [...new Set(Object.values(byDay).flat().map(s => s.subject))];

  const saved = await savedAllowlists(sb, userId);
  if (chosen) await rememberAllowlists(sb, userId, { ...saved, ...chosen });
  const subjectAllowlists = { ...saved, ...(chosen || {}) };
  const own = Object.fromEntries(subjects.filter(s => isEnforceable(subjectAllowlists[s])).map(s => [s, subjectAllowlists[s]]));
  const { presetIdBySubject } = await ensurePresets(sb, userId, { subjectAllowlists: own, freeTimeSites: [], freeTimeApps: [] });
  const fallback = subjects.some(s => !presetIdBySubject[s]) ? await ensureCommunityStudyPreset(sb, userId) : null;

  // Pause the member's own active schedules, remembering which, so they
  // come back exactly as they were.
  const { data: rows } = await sb.from('focus_lock_schedules').select('id, name, active').eq('user_id', userId);
  const toPause = ((rows as { id: string; name: string; active: boolean }[]) || [])
    .filter(r => r.active && !r.name.startsWith(COMMUNITY_PLAN_PREFIX)).map(r => r.id);
  for (const id of toPause) await sb.from('focus_lock_schedules').update({ active: false }).eq('id', id);
  writePaused(userId, [...new Set([...readPaused(userId), ...toPause])]);

  await deleteCommunitySchedules(sb, userId);
  const name = planLabel(communityName);
  for (const [dayStr, slots] of Object.entries(byDay)) {
    const day = Number(dayStr);
    const planSlots: PlanSlotInput[] = slots.map(s => ({
      presetId: presetIdBySubject[s.subject] ?? fallback, subject: s.subject,
      startTime: s.startTime, endTime: s.endTime, isSleep: false,
    }));
    await writeSchedule(sb, userId, { planName: `${COMMUNITY_PLAN_PREFIX}${name} - ${WEEKDAY_NAMES[day]}`, daysOfWeek: [day], slots: planSlots });
  }
}

/** Stops enforcing the community schedule and switches the member's own
 *  paused schedules back on. */
export async function releaseCommunitySchedule(sb: SupaLike, userId: string, communityName?: string): Promise<void> {
  if (communityName !== undefined) {
    // Only when it's this community's week that is enforced.
    const prefix = `${COMMUNITY_PLAN_PREFIX}${planLabel(communityName)} - `;
    const { data } = await sb.from('focus_lock_schedules').select('id, name').eq('user_id', userId);
    if (!((data as { name: string }[]) || []).some(r => r.name.startsWith(prefix))) return;
  }
  await deleteCommunitySchedules(sb, userId);
  const paused = readPaused(userId);
  for (const id of paused) await sb.from('focus_lock_schedules').update({ active: true }).eq('id', id);
  writePaused(userId, []);
}
