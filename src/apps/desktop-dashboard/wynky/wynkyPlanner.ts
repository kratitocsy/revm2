/* ============================================================
   wynkyPlanner.ts

   Data layer for the Wynky scheduler bot. Wynky recommends a day
   plan and asks the student to confirm before anything is saved —
   it never invents a new blocking mechanism, it only writes ordinary
   focus_lock_presets / focus_lock_schedules / focus_lock_schedule_slots
   rows, the same tables blocks.html's schedule builder writes, so
   the existing server-side schedule-tick enforcement (web, browser
   extension, Windows app) picks the plan up automatically.

   What Wynky already knows (no re-asking):
     - user_profiles.subjects / exam            (set at onboarding)
     - user_profiles.quiz_answers.daily_hours   (Study DNA quiz, Q2)
     - user_profiles.quiz_answers.distractions  (Study DNA quiz, Q3)

   What it asks once, then remembers in wynky_profiles:
     - wake time / sleep time
     - each subject's study sites (never guessed/invented — the ai-manage-
       blocks edge function has the same rule for the same reason)

   Personalization: rpc_wynky_record_outcome (migration 0095) nudges the
   remembered daily-minutes figure toward what the student actually keeps
   confirming, so returning visits need less adjustment over time. It is
   a running average over accept/edit history, not a trained model — kept
   modest on purpose, per the same "never invent data" rule above.
*/

import { generateSchedule, type FixedCommitment, type GeneratorResult, type SubjectInput } from '../../_shared/scheduleGenerator';
import type { PeerStats, StudyDna, WynkyAction, WynkyEvent } from './wynkyRecommender';

export interface SupaLike {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ChannelPick { id: string; label: string }
// appsMode mirrors blocks.html's "Block these apps" / "Allow only these
// apps" choice. Missing means 'blacklist' (lists saved before the choice
// existed were always enforced that way).
export interface SubjectAllowlist { sites: string[]; apps: string[]; channels?: ChannelPick[]; appsMode?: 'blacklist' | 'whitelist' }

export type DailyHoursBucket = '1-2' | '2-4' | '4-6' | '6-8' | 'custom';

export const DAILY_HOURS_MINUTES: Record<Exclude<DailyHoursBucket, 'custom'>, number> = {
  '1-2': 90,
  '2-4': 180,
  '4-6': 300,
  '6-8': 420,
};

// Distraction tag -> real, known domains only (same "never invent a domain"
// rule as ai-manage-blocks/index.ts's safe list). 'procrastination' has no
// site of its own, so it adds nothing here — it's still shown to the
// student as a reason Wynky is keeping the free-time block tight.
export const DISTRACTION_SITE_MAP: Record<string, string[]> = {
  instagram: ['instagram.com'],
  youtube: ['youtube.com'],
  whatsapp: ['web.whatsapp.com'],
};
export const DISTRACTION_APP_MAP: Record<string, string[]> = {
  instagram: ['Instagram'],
  youtube: ['YouTube'],
  whatsapp: ['WhatsApp'],
};

// Customer-care-bot style quick picks for "how do you study this subject":
// well-known, real platforms only (their own root domain — never a guessed
// channel or handle, which is exactly what yt-resolve-channel exists for
// instead). Tapping one adds its domain to the subject's allow-list; typing
// a custom answer always works too, same as a Flipkart-bot's "something
// else" option.
export interface StudyModeOption { id: string; label: string; site: string | null }
export const STUDY_MODE_OPTIONS: StudyModeOption[] = [
  { id: 'offline', label: '🏫 Offline coaching (no site needed)', site: null },
  { id: 'pw', label: 'Physics Wallah', site: 'pw.live' },
  { id: 'unacademy', label: 'Unacademy', site: 'unacademy.com' },
  { id: 'vedantu', label: 'Vedantu', site: 'vedantu.com' },
  { id: 'byjus', label: "BYJU'S", site: 'byjus.com' },
  { id: 'khan', label: 'Khan Academy', site: 'khanacademy.org' },
  { id: 'toppr', label: 'Toppr', site: 'toppr.com' },
  { id: 'doubtnut', label: 'Doubtnut', site: 'doubtnut.com' },
  { id: 'youtube', label: 'YouTube (pick channels after)', site: 'youtube.com' },
];

export interface WynkyKnownProfile {
  subjects: string[];
  exam: string | null;
  dailyHoursBucket: DailyHoursBucket | null;
  customDailyHoursText: string | null;
  distractionTags: string[];
  customDistractionText: string | null;
  /** The rest of the Study DNA quiz, used to pre-fill and skip questions. */
  dna: StudyDna;
}

export interface WynkyRemembered {
  wakeTime: string | null; // "HH:MM"
  sleepTime: string | null; // "HH:MM"
  subjectAllowlists: Record<string, SubjectAllowlist>;
  lastDailyMinutes: number | null;
  acceptedCount: number;
  adjustedCount: number;
}

/** Reads what Wynky already knows from the quiz/onboarding — never re-asked. */
export async function loadKnownProfile(sb: SupaLike, userId: string): Promise<WynkyKnownProfile> {
  const { data } = await sb.from('user_profiles')
    .select('subjects, exam, quiz_answers, archetype')
    .eq('id', userId).maybeSingle();
  const qa = (data?.quiz_answers ?? {}) as Record<string, unknown>;
  const dh = qa.daily_hours as string | undefined;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    subjects: Array.isArray(data?.subjects) ? data!.subjects.filter(Boolean) : [],
    exam: data?.exam ?? null,
    dailyHoursBucket: (dh === '1-2' || dh === '2-4' || dh === '4-6' || dh === '6-8' || dh === 'custom') ? dh : null,
    customDailyHoursText: (qa.custom_daily_hours as string) ?? null,
    distractionTags: Array.isArray(qa.distractions) ? (qa.distractions as string[]) : [],
    customDistractionText: (qa.custom_distraction as string) ?? null,
    dna: {
      dayType: typeof qa.day_type === 'string' ? qa.day_type : null,
      studyStyle: strings(qa.study_style),
      challenges: strings(qa.challenges),
      archetype: typeof data?.archetype === 'string' ? data.archetype : null,
    },
  };
}

/** Reads what Wynky remembers from earlier Wynky sessions — asked once, reused after. */
export async function loadRemembered(sb: SupaLike, userId: string): Promise<WynkyRemembered> {
  const { data } = await sb.from('wynky_profiles')
    .select('wake_time, sleep_time, subject_allowlists, last_daily_minutes, accepted_count, adjusted_count')
    .eq('user_id', userId).maybeSingle();
  return {
    wakeTime: data?.wake_time ? String(data.wake_time).slice(0, 5) : null,
    sleepTime: data?.sleep_time ? String(data.sleep_time).slice(0, 5) : null,
    subjectAllowlists: (data?.subject_allowlists as WynkyRemembered['subjectAllowlists']) ?? {},
    lastDailyMinutes: data?.last_daily_minutes ?? null,
    acceptedCount: data?.accepted_count ?? 0,
    adjustedCount: data?.adjusted_count ?? 0,
  };
}

export function bucketMinutes(known: WynkyKnownProfile): number {
  if (known.dailyHoursBucket && known.dailyHoursBucket !== 'custom') {
    return DAILY_HOURS_MINUTES[known.dailyHoursBucket];
  }
  const parsed = parseFloat(known.customDailyHoursText || '');
  if (!isNaN(parsed) && parsed > 0) return Math.round(parsed * 60);
  return 240; // fall back to the '2-4' midpoint
}

/** Best current default for "how many minutes of study today" — remembered
 *  figure (nudged by past accept/edit history) if we have one, else the
 *  quiz bucket. This is the "needs less setup over time" mechanic. */
export function defaultDailyMinutes(known: WynkyKnownProfile, remembered: WynkyRemembered): number {
  return remembered.lastDailyMinutes ?? bucketMinutes(known);
}

export function distractionSites(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) for (const site of DISTRACTION_SITE_MAP[t] || []) out.add(site);
  return [...out];
}

export function distractionApps(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) for (const app of DISTRACTION_APP_MAP[t] || []) out.add(app);
  return [...out];
}

/** Study minutes per subject over the last 30 days (study_sessions), so
 *  Wynky can give more time to what the student has been neglecting. */
export async function loadStudyMinutes(sb: SupaLike, userId: string): Promise<{ bySubject: Record<string, number>; sessions: number }> {
  const { data } = await sb.from('study_sessions')
    .select('subject, total_seconds')
    .eq('user_id', userId)
    .gte('started_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .limit(500);
  const bySubject: Record<string, number> = {};
  const rows = Array.isArray(data) ? data : [];
  for (const r of rows as { subject: string | null; total_seconds: number | null }[]) {
    if (!r.subject) continue;
    const key = subjectKey(r.subject);
    bySubject[key] = (bySubject[key] || 0) + Math.max(0, r.total_seconds || 0) / 60;
  }
  return { bySubject, sessions: rows.length };
}

/** Subjects that get 1.5x time: the ones studied well below the average
 *  share over the last 30 days (never studied counts), at most half of
 *  them. Needs 3+ logged sessions; with less history nobody is weak. */
export function weakSubjects(subjects: string[], study: { bySubject: Record<string, number>; sessions: number }): string[] {
  if (subjects.length < 2 || study.sessions < 3) return [];
  const mins = subjects.map(s => ({ s, m: study.bySubject[subjectKey(s)] || 0 }));
  const total = mins.reduce((a, b) => a + b.m, 0);
  if (total <= 0) return [];
  const avg = total / subjects.length;
  return mins.filter(x => x.m < 0.6 * avg).sort((a, b) => a.m - b.m)
    .slice(0, Math.floor(subjects.length / 2)).map(x => x.s);
}

export interface RecommendInput {
  wakeTime: string;
  sleepTime: string;
  dailyMinutes: number;
  subjects: string[];
  /** Subjects to give 1.5x time (see weakSubjects). */
  weak?: string[];
  blockLengthMinutes: number;
  /** School, coaching or work hours to plan around. */
  fixedCommitments?: FixedCommitment[];
}

export function recommend(input: RecommendInput): GeneratorResult {
  const subjectInputs: SubjectInput[] = input.subjects.length
    ? input.subjects.map((name, i) => ({ id: `s${i}`, name, isWeak: !!input.weak?.includes(name) }))
    : [{ id: 's0', name: 'Study', isWeak: false }];
  return generateSchedule({
    wakeTime: input.wakeTime,
    sleepTime: input.sleepTime,
    dailyHoursRequested: input.dailyMinutes / 60,
    subjects: subjectInputs,
    blockLengthMinutes: input.blockLengthMinutes,
    fixedCommitments: input.fixedCommitments,
  });
}

export const FREE_TIME_PRESET_NAME = 'Wynky — Free time';
export function subjectPresetName(name: string): string { return `Wynky — ${name}`; }

export interface EnsurePresetsResult {
  presetIdBySubject: Record<string, string>;
  freeTimePresetId: string | null;
  /** Every preset name Wynky just ensured exists — handed to the AI edge
   *  function as the exact list it's allowed to reference (never lets it
   *  invent or rename a block). */
  presetNames: string[];
}

/** Creates or updates one whitelist preset per subject plus a shared
 *  free-time blacklist preset. Reused by both the rule-based recommender
 *  and the custom AI path so a plan built either way enforces the same
 *  way. Never invents a site/app that wasn't typed in by the student. */
export async function ensurePresets(sb: SupaLike, userId: string, args: {
  subjectAllowlists: Record<string, SubjectAllowlist>;
  freeTimeSites: string[];
  freeTimeApps: string[];
}): Promise<EnsurePresetsResult> {
  const presetIdBySubject: Record<string, string> = {};
  const presetNames: string[] = [];

  for (const [name, allow] of Object.entries(args.subjectAllowlists)) {
    const channels = allow.channels || [];
    if (!allow.sites.length && !allow.apps.length && !channels.length) continue; // nothing to enforce with — skip rather than write an empty block
    const presetName = subjectPresetName(name);
    // youtube_rules only makes sense once YouTube itself is in the allowed
    // sites (same rule blocks.html's hasYoutubeSite()/ytPanel enforces) —
    // otherwise a picked channel would silently do nothing.
    const youtubeRules = (channels.length && allow.sites.some(s => s === 'youtube.com' || s.endsWith('.youtube.com')))
      ? { mode: 'allow', channels } : null;
    const { data: existing } = await sb.from('focus_lock_presets')
      .select('id').eq('user_id', userId).eq('name', presetName).maybeSingle();
    // The student picks, per subject, whether the apps are closed or are
    // the only ones kept open (same choice blocks.html offers) — never
    // implied, because one list is enforced on every device and an
    // allow-only list of desktop apps would close everything on the phone.
    // With no apps, 'whitelist' would close everything, so fall back to
    // 'blacklist' (a no-op with an empty apps array).
    const appsMode = allow.apps.length && allow.appsMode === 'whitelist' ? 'whitelist' : 'blacklist';
    // Same for sites: an allow-list with no sites would block the whole web,
    // which a subject set up with only apps never asked for.
    const siteMode = allow.sites.length ? 'whitelist' : 'blacklist';
    if (existing?.id) {
      await sb.from('focus_lock_presets').update({
        mode: siteMode, sites: allow.sites, apps: allow.apps, apps_mode: appsMode, youtube_rules: youtubeRules,
      }).eq('id', existing.id);
      presetIdBySubject[name] = existing.id;
    } else {
      const { data: created, error } = await sb.from('focus_lock_presets').insert({
        user_id: userId, name: presetName, mode: siteMode,
        sites: allow.sites, apps: allow.apps, apps_mode: appsMode, youtube_rules: youtubeRules,
      }).select('id').single();
      if (error) throw new Error(error.message);
      presetIdBySubject[name] = created.id;
    }
    presetNames.push(presetName);
  }

  // One shared "free time" blacklist preset covers every gap left
  // uncovered (before/after study blocks, inside the day) so distraction
  // time stays low there too, not just during study blocks.
  let freeTimePresetId: string | null = null;
  if (args.freeTimeSites.length || args.freeTimeApps.length) {
    const { data: existingFree } = await sb.from('focus_lock_presets')
      .select('id').eq('user_id', userId).eq('name', FREE_TIME_PRESET_NAME).maybeSingle();
    if (existingFree?.id) {
      await sb.from('focus_lock_presets').update({
        mode: 'blacklist', sites: args.freeTimeSites, apps: args.freeTimeApps, apps_mode: 'blacklist',
      }).eq('id', existingFree.id);
      freeTimePresetId = existingFree.id;
    } else {
      const { data: createdFree, error } = await sb.from('focus_lock_presets').insert({
        user_id: userId, name: FREE_TIME_PRESET_NAME, mode: 'blacklist',
        sites: args.freeTimeSites, apps: args.freeTimeApps, apps_mode: 'blacklist',
      }).select('id').single();
      if (error) throw new Error(error.message);
      freeTimePresetId = createdFree.id;
    }
    presetNames.push(FREE_TIME_PRESET_NAME);
  }

  return { presetIdBySubject, freeTimePresetId, presetNames };
}

export interface PlanSlotInput {
  presetId: string | null;
  subject: string | null;
  startTime: string;
  endTime: string;
  isSleep: boolean;
  breakAfterMinutes?: number;
}

/** Writes (or replaces) the named schedule's slots. Reused by both the
 *  rule-based and custom-AI confirm paths once each has resolved its
 *  blocks down to real preset ids. */
export async function writeSchedule(sb: SupaLike, userId: string, args: {
  planName: string;
  daysOfWeek: number[];
  slots: PlanSlotInput[];
  /** 0 or 1 to run only in weeks of that parity (every other week, see
   *  istWeekParity); left out to run every week. */
  weekParity?: 0 | 1;
}): Promise<{ scheduleId: string }> {
  const scheduleName = args.planName || 'Wynky Plan';
  const { data: existingSchedule } = await sb.from('focus_lock_schedules')
    .select('id').eq('user_id', userId).eq('name', scheduleName).maybeSingle();

  let scheduleId: string;
  if (existingSchedule?.id) {
    scheduleId = existingSchedule.id;
    await sb.from('focus_lock_schedules').update({
      days_of_week: args.daysOfWeek, active: true,
      week_parity: args.weekParity ?? null,
    }).eq('id', scheduleId);
    await sb.from('focus_lock_schedule_slots').delete().eq('schedule_id', scheduleId);
  } else {
    const { data: created, error } = await sb.from('focus_lock_schedules')
      .insert({
      user_id: userId, name: scheduleName, days_of_week: args.daysOfWeek,
      week_parity: args.weekParity ?? null,
    }).select('id').single();
    if (error) throw new Error(error.message);
    scheduleId = created.id;
  }

  const rows = args.slots
    .filter(s => s.isSleep || s.presetId) // nothing to enforce with — skip rather than guess
    .map((s, i) => ({
      schedule_id: scheduleId, slot_order: i,
      preset_id: s.isSleep ? null : s.presetId,
      subject: s.isSleep ? null : s.subject,
      start_time: s.startTime, end_time: s.endTime,
      is_sleep: s.isSleep, break_after_minutes: s.breakAfterMinutes || 0,
    }));

  if (rows.length) await sb.from('focus_lock_schedule_slots').insert(rows);
  return { scheduleId };
}

export interface ConfirmPlanArgs {
  userId: string;
  planName: string;
  result: GeneratorResult;
  subjectAllowlists: Record<string, SubjectAllowlist>;
  freeTimeSites: string[];
  freeTimeApps: string[];
  daysOfWeek: number[];
}

/** Writes the confirmed rule-based plan as real focus_lock_presets + a
 *  real focus_lock_schedule/slots — the same tables the (existing,
 *  server-enforced) Focus Lock schedule engine already reads every
 *  minute, so enforcement starts without touching blocks.html at all. */
export async function confirmPlan(sb: SupaLike, args: ConfirmPlanArgs): Promise<{ scheduleId: string; writtenSlots: PlanSlotInput[] }> {
  const { presetIdBySubject, freeTimePresetId } = await ensurePresets(sb, args.userId, {
    subjectAllowlists: args.subjectAllowlists,
    freeTimeSites: args.freeTimeSites,
    freeTimeApps: args.freeTimeApps,
  });
  // A student who previously asked for a varied week and now confirms a
  // single repeated day shouldn't keep the old per-weekday schedules too.
  await clearWeekdayVariants(sb, args.userId, args.planName);

  const slots: PlanSlotInput[] = args.result.blocks
    .filter(b => b.kind !== 'break') // represented as break_after_minutes on the previous slot, not its own slot
    .map(block => ({
      presetId: block.kind === 'sleep' ? null : (block.subjectName ? presetIdBySubject[block.subjectName] : null) ?? freeTimePresetId,
      subject: block.kind === 'sleep' ? null : (block.subjectName ?? null),
      startTime: block.startTime,
      endTime: block.endTime,
      isSleep: block.kind === 'sleep',
    }));
  // Same rule as confirmAiPlan: never save a plan whose study blocks all
  // have nothing to enforce, which would leave only the sleep lock.
  const writtenSlots = slots.filter(s => s.isSleep || s.presetId);
  if (slots.some(s => !s.isSleep) && !writtenSlots.some(s => !s.isSleep)) throw new NoEnforceableBlocksError();

  const { scheduleId } = await writeSchedule(sb, args.userId, { planName: args.planName, daysOfWeek: args.daysOfWeek, slots });
  return { scheduleId, writtenSlots };
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Deletes the per-weekday schedules ("<planName> - Mon" etc.) a varied
 *  week left behind, so switching back to a single repeated day doesn't
 *  leave stale schedules still enforcing on other days. */
async function clearWeekdayVariants(sb: SupaLike, userId: string, planName: string): Promise<void> {
  const { data: rows } = await sb.from('focus_lock_schedules').select('id, name').eq('user_id', userId);
  const stale = ((rows as { id: string; name: string }[]) || []).filter(r => r.name.startsWith(`${planName} - `));
  for (const r of stale) {
    await sb.from('focus_lock_schedule_slots').delete().eq('schedule_id', r.id);
    await sb.from('focus_lock_schedules').delete().eq('id', r.id);
  }
}

/** Day -> subject -> the allow-list to use for that subject on that day
 *  only, instead of the subject's usual one. Days 0 (Sun) to 6 (Sat) are the
 *  week (Week A in a two-week plan); 7 to 13 are Week B's Sun to Sat. The
 *  subject key is "Physics" for every Physics block that day, or
 *  "Physics@17:00" for just the block starting at 17:00. */
export type DayOverrides = Record<number, Record<string, SubjectAllowlist>>;

export function splitOverrideKey(key: string): { subject: string; time: string | null } {
  const m = /^(.*)@(\d{2}:\d{2})$/.exec(key);
  return m ? { subject: m[1], time: m[2] } : { subject: key, time: null };
}

/** The name a day override's preset is saved under, e.g. "Physics (Tue)",
 *  "Physics (Tue 17:00)" or "Physics (B Tue)". */
export function dayOverrideKey(subject: string, day: number, time: string | null = null): string {
  return `${subject} (${day >= 7 ? 'B ' : ''}${WEEKDAY_NAMES[day % 7]}${time ? ` ${time}` : ''})`;
}

// Same anchor as the deployed schedule-tick: the Sunday-to-Saturday week
// starting Sunday 2026-08-02 (India time) is parity 0, the next is 1, and so on.
const WEEK_PARITY_EPOCH_DAYS = Date.UTC(2026, 7, 2) / 86_400_000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** 0 or 1 for this week (Sunday to Saturday, India time), matching the
 *  week_parity that schedule-tick runs schedules on. */
export function istWeekParity(now: Date = new Date()): 0 | 1 {
  const istDays = Math.floor((now.getTime() + IST_OFFSET_MS) / 86_400_000);
  const sunday = istDays - new Date(istDays * 86_400_000).getUTCDay();
  const weeks = Math.floor((sunday - WEEK_PARITY_EPOCH_DAYS) / 7);
  return (((weeks % 2) + 2) % 2) as 0 | 1;
}

export interface ConfirmWeekPlanArgs {
  userId: string;
  planName: string;
  /** One rule/AI result per day: 0 (Sun) to 6 (Sat), plus 7 to 13 for Week B. */
  week: Record<number, GeneratorResult>;
  subjectAllowlists: Record<string, SubjectAllowlist>;
  /** Per-day (or per-block) sites/channels/apps; anything left out uses subjectAllowlists. */
  dayOverrides?: DayOverrides;
  freeTimeSites: string[];
  freeTimeApps: string[];
  /** Days (0-6) the plan runs on; the rest are days off. Default: all. */
  activeDays?: number[];
  /** 1 = every week (default), 2 = every other week starting this week
   *  (saved as week_parity).
   *  A week with days 7-13 is always a two-week Week A / Week B plan. */
  repeatWeeks?: number;
  now?: Date;
}

/** Writes a varied week as one schedule per day ("<planName> - Mon", ...)
 *  instead of the single repeated-day schedule confirmPlan writes, since
 *  focus_lock_schedules has one slot set per schedule — a day-varying week
 *  needs a schedule per day. Replaces both the single schedule and any
 *  earlier per-weekday ones, so re-confirming a week never doubles up.
 *  A Week A / Week B plan is saved as "<planName> - A Mon" and "- B Mon",
 *  each running every other week (A this week, B next week). */
export async function confirmWeekPlan(sb: SupaLike, args: ConfirmWeekPlanArgs): Promise<{ writtenSlots: Record<number, PlanSlotInput[]> }> {
  const { presetIdBySubject, freeTimePresetId } = await ensurePresets(sb, args.userId, {
    subjectAllowlists: args.subjectAllowlists,
    freeTimeSites: args.freeTimeSites,
    freeTimeApps: args.freeTimeApps,
  });

  // A day override gets its own preset ("Wynky — Physics (Tue)"), built the
  // same way as a subject's usual one; an empty override falls back to it.
  const overrideAllow: Record<string, SubjectAllowlist> = {};
  for (const [dayStr, bySubject] of Object.entries(args.dayOverrides || {})) {
    for (const [key, allow] of Object.entries(bySubject)) {
      const { subject, time } = splitOverrideKey(key);
      overrideAllow[dayOverrideKey(subject, Number(dayStr), time)] = allow;
    }
  }
  const overridePresetIds = Object.keys(overrideAllow).length
    ? (await ensurePresets(sb, args.userId, { subjectAllowlists: overrideAllow, freeTimeSites: [], freeTimeApps: [] })).presetIdBySubject
    : {};

  const twoWeeks = Object.keys(args.week).some(k => Number(k) >= 7);
  const everyOther = twoWeeks || (args.repeatWeeks ?? 1) === 2;
  const thisWeek = istWeekParity(args.now);
  const active = new Set(args.activeDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const presetFor = (subject: string, day: number, start: string) =>
    overridePresetIds[dayOverrideKey(subject, day, start)] ?? overridePresetIds[dayOverrideKey(subject, day)] ?? presetIdBySubject[subject];

  const writtenSlots: Record<number, PlanSlotInput[]> = {};
  let anyStudy = false;
  let anyUsableStudy = false;
  for (const [dayStr, result] of Object.entries(args.week)) {
    const day = Number(dayStr);
    if (!active.has(day % 7)) continue;
    const slots: PlanSlotInput[] = result.blocks
      .filter(b => b.kind !== 'break')
      .map(block => ({
        presetId: block.kind === 'sleep' ? null
          : (block.subjectName ? presetFor(block.subjectName, day, block.startTime) : null) ?? freeTimePresetId,
        subject: block.kind === 'sleep' ? null : (block.subjectName ?? null),
        startTime: block.startTime,
        endTime: block.endTime,
        isSleep: block.kind === 'sleep',
      }));
    const usable = slots.filter(s => s.isSleep || s.presetId);
    anyStudy ||= slots.some(s => !s.isSleep);
    anyUsableStudy ||= usable.some(s => !s.isSleep);
    writtenSlots[day] = usable;
  }
  if (anyStudy && !anyUsableStudy) throw new NoEnforceableBlocksError();

  // Only now, with a plan that can be saved, remove the old one.
  const { data: single } = await sb.from('focus_lock_schedules').select('id').eq('user_id', args.userId).eq('name', args.planName).maybeSingle();
  if (single?.id) {
    await sb.from('focus_lock_schedule_slots').delete().eq('schedule_id', single.id);
    await sb.from('focus_lock_schedules').delete().eq('id', single.id);
  }
  await clearWeekdayVariants(sb, args.userId, args.planName);

  for (const [dayStr, usable] of Object.entries(writtenSlots)) {
    const day = Number(dayStr);
    const label = twoWeeks ? `${day >= 7 ? 'B' : 'A'} ${WEEKDAY_NAMES[day % 7]}` : WEEKDAY_NAMES[day];
    await writeSchedule(sb, args.userId, {
      planName: `${args.planName} - ${label}`, daysOfWeek: [day % 7], slots: usable,
      weekParity: everyOther ? (day >= 7 ? (1 - thisWeek) as 0 | 1 : thisWeek) : undefined,
    });
  }
  return { writtenSlots };
}

export interface AiSlot {
  start_time: string;
  end_time: string;
  preset_name: string;
  subject?: string;
  is_sleep?: boolean;
}

/** Writes a custom AI-generated plan (from the existing ai-generate-schedule
 *  edge function) the same way confirmPlan writes a rule-based one — the
 *  AI only ever picks from preset names Wynky already created from the
 *  student's own typed allow-lists (ensurePresets), so it can't invent a
 *  block that blocks/allows something the student never specified. */
/** Thrown instead of saving an AI plan whose study blocks all point at
 *  presets that don't exist (no subject allow-lists set up yet): saving it
 *  would leave only the sleep lock and no study block at all. */
export class NoEnforceableBlocksError extends Error {
  constructor() {
    super("None of those study blocks match a subject you've set up, so there's nothing for Focus Lock to enforce yet. Pick the sites, apps or YouTube channels each subject needs first.");
    this.name = 'NoEnforceableBlocksError';
  }
}

export async function confirmAiPlan(sb: SupaLike, args: {
  userId: string;
  planName: string;
  daysOfWeek: number[];
  aiSlots: AiSlot[];
  subjectAllowlists: Record<string, SubjectAllowlist>;
  freeTimeSites: string[];
  freeTimeApps: string[];
}): Promise<{ scheduleId: string; writtenSlots: AiSlot[] }> {
  const { presetIdBySubject, freeTimePresetId } = await ensurePresets(sb, args.userId, {
    subjectAllowlists: args.subjectAllowlists,
    freeTimeSites: args.freeTimeSites,
    freeTimeApps: args.freeTimeApps,
  });
  const idByPresetName: Record<string, string | null> = { [FREE_TIME_PRESET_NAME]: freeTimePresetId };
  for (const [subject, id] of Object.entries(presetIdBySubject)) idByPresetName[subjectPresetName(subject)] = id;

  // The AI is only offered real preset names, but nothing server-side
  // checks it used one, so fall back to the slot's own subject preset
  // (same lookup confirmPlan does) before giving up on a block.
  const resolved = args.aiSlots.map(s => ({
    ai: s,
    presetId: s.is_sleep ? null : (idByPresetName[s.preset_name] ?? (s.subject ? presetIdBySubject[s.subject] : undefined) ?? null),
  }));
  const studyCount = resolved.filter(r => !r.ai.is_sleep).length;
  const writable = resolved.filter(r => r.ai.is_sleep || r.presetId);
  if (studyCount > 0 && !writable.some(r => !r.ai.is_sleep)) throw new NoEnforceableBlocksError();

  const slots: PlanSlotInput[] = writable.map(({ ai, presetId }) => ({
    presetId,
    subject: ai.is_sleep ? null : (ai.subject ?? null),
    startTime: ai.start_time,
    endTime: ai.end_time,
    isSleep: !!ai.is_sleep,
  }));

  const { scheduleId } = await writeSchedule(sb, args.userId, { planName: args.planName, daysOfWeek: args.daysOfWeek, slots });
  return { scheduleId, writtenSlots: writable.map(r => r.ai) };
}

export async function rememberAnswers(sb: SupaLike, userId: string, args: {
  wakeTime: string;
  sleepTime: string;
  subjectAllowlists: Record<string, SubjectAllowlist>;
}): Promise<void> {
  await sb.from('wynky_profiles').upsert({
    user_id: userId,
    wake_time: args.wakeTime,
    sleep_time: args.sleepTime,
    subject_allowlists: args.subjectAllowlists,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/** Saves just the per-subject set-up, so what the student answered in the
 *  chat is remembered even if they close it before confirming a plan.
 *  The upsert only sends this column, so saved wake/sleep times stay. */
export async function rememberAllowlists(sb: SupaLike, userId: string, subjectAllowlists: Record<string, SubjectAllowlist>): Promise<void> {
  const { error } = await sb.from('wynky_profiles').upsert({
    user_id: userId,
    subject_allowlists: subjectAllowlists,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/** What was agreed in the AI chat, kept so the next chat starts from it
 *  (migration 0102). Best-effort: without the column nothing is kept. */
export async function saveChatSettings(sb: SupaLike, userId: string, settings: Record<string, unknown> | null): Promise<void> {
  await sb.from('wynky_profiles').upsert({
    user_id: userId,
    chat_settings: settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function loadChatSettings(sb: SupaLike, userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb.from('wynky_profiles').select('chat_settings').eq('user_id', userId).maybeSingle();
  if (error || !data?.chat_settings || typeof data.chat_settings !== 'object') return null;
  return data.chat_settings as Record<string, unknown>;
}

export async function recordOutcome(sb: SupaLike, args: {
  source: 'rule_based' | 'ai_custom';
  requestedMinutes: number | null;
  confirmedMinutes: number;
  outcome: 'accepted_as_is' | 'accepted_edited' | 'discarded';
}): Promise<void> {
  await sb.rpc('rpc_wynky_record_outcome', {
    p_source: args.source,
    p_requested_minutes: args.requestedMinutes,
    p_confirmed_minutes: args.confirmedMinutes,
    p_outcome: args.outcome,
  });
}

/* ── Learning (migration 0097) ───────────────────────────────────────
   Every answer the student keeps, changes, asks for or removes is logged
   to wynky_events; wynkyRecommender.ts turns that history, the same-exam
   counts below and the Study DNA into the next set of pre-selected
   answers. */

export async function loadEvents(sb: SupaLike, userId: string): Promise<WynkyEvent[]> {
  const [{ data }, { data: learned }] = await Promise.all([
    sb.from('wynky_events')
      .select('field, value, multi, action, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(400),
    // The running summary (migration 0098). Older events are archived to R2
    // and removed from wynky_events, so this is what keeps them counting.
    sb.from('wynky_learned')
      .select('field, value, multi, accepted_n, changed_n, requested_n, last_action, last_at')
      .eq('user_id', userId)
      .limit(1000),
  ]);
  const events: WynkyEvent[] = (Array.isArray(data) ? data : []).map((r: any) => ({
    field: r.field, value: r.value, multi: !!r.multi, action: r.action as WynkyAction, at: r.created_at,
  }));
  return [...events, ...eventsFromSummary(Array.isArray(learned) ? learned : [], events)];
}

export interface LearnedRow {
  field: string; value: string; multi: boolean;
  accepted_n: number; changed_n: number; requested_n: number;
  last_action: string; last_at: string;
}

/** Stand-in events for answers whose own events are no longer loaded
 *  (archived, or past the 400 most recent): the last thing the student did
 *  with it, at the time they did it, plus one more "kept" when they kept it
 *  more than once. Recency weighting then treats them like the originals. */
export function eventsFromSummary(rows: LearnedRow[], recent: WynkyEvent[]): WynkyEvent[] {
  const seen = new Set(recent.map(e => `${e.field}\u0000${e.value}`));
  const out: WynkyEvent[] = [];
  for (const r of rows) {
    if (!r?.field || !r?.value || !r.last_at || seen.has(`${r.field}\u0000${r.value}`)) continue;
    const action = (['accepted', 'changed', 'requested', 'removed'].includes(r.last_action) ? r.last_action : 'accepted') as WynkyAction;
    out.push({ field: r.field, value: r.value, multi: !!r.multi, action, at: r.last_at });
    const kept = (r.accepted_n || 0) + (r.changed_n || 0) + (r.requested_n || 0);
    if (action !== 'removed' && kept >= 2) {
      out.push({ field: r.field, value: r.value, multi: !!r.multi, action: 'accepted', at: new Date(Date.parse(r.last_at) - 1000).toISOString() });
    }
  }
  return out;
}

export interface NewEvent { field: string; value: string; multi?: boolean; action: WynkyAction }

export async function recordEvents(sb: SupaLike, userId: string, cohort: { examKey: string; dayType: string | null }, events: NewEvent[]): Promise<void> {
  if (!events.length) return;
  const { error } = await sb.from('wynky_events').insert(events.map(e => ({
    user_id: userId, exam_key: cohort.examKey, day_type: cohort.dayType,
    field: e.field.slice(0, 60), value: e.value.slice(0, 300), multi: !!e.multi, action: e.action,
  })));
  if (error) throw new Error(error.message);
}

/** Same-exam counts per field. The server narrows to the student's own
 *  Study DNA day type itself when that group is big enough. */
export async function fetchPeerStats(sb: SupaLike, examKey: string, fields: string[]): Promise<PeerStats> {
  const { data } = await sb.rpc('rpc_wynky_peer_stats', { p_exam_key: examKey, p_fields: fields });
  const out: PeerStats = {};
  for (const r of (Array.isArray(data) ? data : []) as { field: string; value: string; users: number; cohort_users: number; cohort: 'exam_daytype' | 'exam' }[]) {
    const f = out[r.field] || (out[r.field] = { cohort: r.cohort, cohortUsers: Number(r.cohort_users), counts: [] });
    f.counts.push({ value: r.value, users: Number(r.users) });
  }
  return out;
}

export interface ChannelSignal { channelId: string; label: string; sameExam: number; otherExams: number; alsoPicked: number }

export async function fetchChannelSignals(sb: SupaLike, examKey: string, subjKey: string, picked: string[]): Promise<ChannelSignal[]> {
  const { data } = await sb.rpc('rpc_wynky_channel_signals', { p_exam_key: examKey, p_subject_key: subjKey, p_picked: picked });
  return ((Array.isArray(data) ? data : []) as any[]).map(r => ({
    channelId: r.channel_id, label: r.channel_label,
    sameExam: Number(r.same_exam_users) || 0, otherExams: Number(r.other_exam_users) || 0, alsoPicked: Number(r.also_picked_users) || 0,
  }));
}

/* ── YouTube channel suggestions ──────────────────────────────────────
   "Top channels for your exam/subject" — but never trusted from a
   hardcoded list on its own. CHANNEL_SEEDS below are just search terms
   (well-known institute/channel names) fed into the existing
   yt-resolve-channel function, the same real YouTube-search lookup
   blocks.html's manual picker already relies on — so the channel that
   actually gets suggested is whatever YouTube's own search returns for
   that name, with a real channelId/handle, never an invented one.

   Personalization: rpc_wynky_popular_channels (migration 0096) re-ranks
   these suggestions by how many students in the same exam currently have
   that channel picked — a plain count across everyone's live picks, not
   a trained model, so it's described that way rather than oversold. */

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40) || 'general';
}

const EXAM_FAMILY_PATTERNS: [RegExp, string][] = [
  [/\bjee\b|\biit\b/i, 'jee'],
  [/\bneet\b/i, 'neet'],
  [/\bupsc\b|\bias\b/i, 'upsc'],
  [/\bcat\b|\bmba\b/i, 'cat'],
  [/\bgate\b/i, 'gate'],
];

export function examFamilyKey(exam: string | null): string {
  if (exam) for (const [pattern, key] of EXAM_FAMILY_PATTERNS) if (pattern.test(exam)) return key;
  return 'general';
}

const SUBJECT_KEY_PATTERNS: [RegExp, string][] = [
  [/phys/i, 'physics'],
  [/chem/i, 'chemistry'],
  [/math/i, 'maths'],
  [/bio|zoo|botan/i, 'biology'],
  [/english/i, 'english'],
  [/reason|aptitude|logical/i, 'reasoning'],
  [/(general studies|\bgs\b|current affairs|polity|history|geography|economy)/i, 'gs'],
];

export function subjectKey(subject: string): string {
  for (const [pattern, key] of SUBJECT_KEY_PATTERNS) if (pattern.test(subject)) return key;
  return normalizeKey(subject);
}

// Real, well-known Indian exam-prep channels/institutes — used only as
// search seeds (see the note above), so an entry that's slightly wrong or
// no longer active just returns no/weak matches rather than reaching the
// student as fact.
const CHANNEL_SEEDS: Record<string, Record<string, string[]>> = {
  jee: {
    physics: ['Physics Wallah', 'Vedantu JEE', 'Unacademy JEE', 'Arvind Academy', 'Etoosindia'],
    chemistry: ['Physics Wallah', 'Unacademy JEE', 'Vedantu JEE', 'Etoosindia'],
    maths: ['Physics Wallah', 'Unacademy JEE', 'Vedantu JEE', 'Cheenta'],
    _default: ['Physics Wallah', 'Unacademy JEE', 'Vedantu JEE'],
  },
  neet: {
    biology: ['Physics Wallah NEET', 'Unacademy NEET', 'Vedantu NEET'],
    physics: ['Physics Wallah NEET', 'Unacademy NEET'],
    chemistry: ['Physics Wallah NEET', 'Unacademy NEET'],
    _default: ['Physics Wallah NEET', 'Unacademy NEET', 'Vedantu NEET'],
  },
  upsc: {
    gs: ['StudyIQ', 'Unacademy UPSC', 'Drishti IAS', 'Vision IAS'],
    _default: ['StudyIQ', 'Unacademy UPSC', 'Drishti IAS'],
  },
  cat: {
    _default: ['Unacademy CAT', '2IIM CAT Preparation', 'Career Launcher'],
  },
  gate: {
    _default: ['Unacademy GATE', 'Gate Wallah', 'NPTEL'],
  },
  general: {
    _default: ['Unacademy', 'Physics Wallah', 'Khan Academy'],
  },
};

export function seedQueriesFor(exam: string | null, subject: string): string[] {
  const family = CHANNEL_SEEDS[examFamilyKey(exam)] || CHANNEL_SEEDS.general;
  return family[subjectKey(subject)] || family._default;
}

export interface ResolvedChannelMatch { channelId: string | null; handle: string | null; title: string }

/** Calls the existing yt-resolve-channel function for one search term and
 *  returns its top real match, or null if nothing came back. */
export async function resolveChannelSeed(supabaseUrl: string, anonKey: string, query: string): Promise<ResolvedChannelMatch | null> {
  const res = await fetch(`${supabaseUrl}/functions/v1/yt-resolve-channel?q=${encodeURIComponent(query)}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const match = Array.isArray(data.matches) ? data.matches[0] : null;
  return match || null;
}

export function channelPickId(m: ResolvedChannelMatch): string {
  return (m.handle ? m.handle.toLowerCase() : m.channelId) || m.title;
}

export async function fetchPopularChannels(sb: SupaLike, examKey: string, subjKey: string, limit = 20): Promise<{ channel_id: string; channel_label: string; pick_count: number }[]> {
  const { data } = await sb.rpc('rpc_wynky_popular_channels', { p_exam_key: examKey, p_subject_key: subjKey, p_limit: limit });
  return Array.isArray(data) ? data as { channel_id: string; channel_label: string; pick_count: number }[] : [];
}

export async function setChannelPick(sb: SupaLike, args: {
  examKey: string; subjectKey: string; channelId: string; channelLabel: string; picked: boolean;
}): Promise<void> {
  await sb.rpc('rpc_wynky_set_channel_pick', {
    p_exam_key: args.examKey, p_subject_key: args.subjectKey,
    p_channel_id: args.channelId, p_channel_label: args.channelLabel, p_picked: args.picked,
  });
}

/* --- App picker: same native app enumeration blocks.html already uses ---
   Wynky never invents an app name for its allow/block lists either — it
   reuses the exact same real-app sources the existing Focus Lock preset
   editor (blocks.html) reads from, so a picked app is guaranteed to
   actually be running (desktop) or installed (mobile), never guessed:
     - desktop (Tauri): window.__TAURI__.core.invoke('list_running_apps')
       -> real process names, e.g. "steam.exe"
     - mobile (Capacitor RevM2Locking plugin): listInstalledApps()
       -> real Android package names read from PackageManager
   A plain browser tab has neither bridge, so the picker is simply
   unavailable there and the free-text input remains the only way in,
   exactly like blocks.html's own fallback. */
export function isDesktopApp(): boolean {
  return typeof (window as any).__TAURI__ !== 'undefined' && !!(window as any).__TAURI__.core;
}
export function isMobileApp(): boolean {
  const w = window as any;
  return !!(w.RM2Native && w.RM2Native.isNative && w.RM2Native.isNative());
}
export function appPickerAvailable(): boolean {
  return isDesktopApp() || isMobileApp();
}

export interface PickableApp { id: string; label: string }

/** Lists real apps from whichever native bridge is present — running
 *  processes on desktop, installed launcher apps on mobile — or an empty
 *  list in a plain browser tab. Never returns a curated/guessed name. */
export async function listPickableApps(): Promise<PickableApp[]> {
  if (isMobileApp()) {
    const plugin = (window as any).Capacitor?.Plugins?.RevM2Locking;
    if (!plugin) return [];
    const { apps } = await plugin.listInstalledApps();
    return (apps || [])
      .map((a: { packageName: string; label?: string }) => ({ id: a.packageName, label: a.label || a.packageName }))
      .sort((a: PickableApp, b: PickableApp) => a.label.localeCompare(b.label));
  }
  if (isDesktopApp()) {
    const apps = await (window as any).__TAURI__.core.invoke('list_running_apps');
    return (apps || []).map((a: { name: string }) => ({ id: a.name, label: a.name }));
  }
  return [];
}

// ── What Wynky remembers (migration 0101) ─────────────────────────────────

export interface MemoryItem { id: number; fact: string; kind: 'fact' | 'rule'; created_at: string }

const memoryKey = (fact: string) => fact.trim().toLowerCase();

/** The student's remembered facts and rules, newest first. Empty if the
 *  table isn't there yet or can't be read; the chat works without it. */
export async function loadMemory(sb: SupaLike, userId: string): Promise<MemoryItem[]> {
  const { data, error } = await sb.from('wynky_memory')
    .select('id, fact, kind, created_at')
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(60);
  if (error) return [];
  return (data || []) as MemoryItem[];
}

/** Saves new facts and rules (ones already remembered are skipped) and logs
 *  each to wynky_events as field 'memory', which the archive job moves to R2. */
export async function rememberFacts(sb: SupaLike, userId: string, cohort: { examKey: string; dayType: string | null }, items: { fact: string; kind: 'fact' | 'rule' }[]): Promise<void> {
  const seen = new Set<string>();
  const rows = items
    .map(i => ({ fact: i.fact.trim().slice(0, 300), kind: i.kind }))
    .filter(i => i.fact && !seen.has(memoryKey(i.fact)) && seen.add(memoryKey(i.fact)));
  if (!rows.length) return;
  const { error } = await sb.from('wynky_memory')
    .upsert(rows.map(r => ({ user_id: userId, ...r })), { onConflict: 'user_id,fact_key', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await recordEvents(sb, userId, cohort, rows.map(r => ({ field: 'memory', value: r.fact, multi: true, action: 'requested' as const })));
}

/** Forgets facts (matched ignoring case and spacing) and logs each as
 *  removed. A 'note' removal is logged too, so a request typed before the
 *  memory table existed stops being sent as well. */
export async function forgetFacts(sb: SupaLike, userId: string, cohort: { examKey: string; dayType: string | null }, facts: string[]): Promise<void> {
  const keys = [...new Set(facts.map(memoryKey).filter(Boolean))];
  if (!keys.length) return;
  const { error } = await sb.from('wynky_memory').delete().eq('user_id', userId).in('fact_key', keys);
  // Before migration 0101 there's no table; the 'note' removal below still applies.
  if (error && !/does not exist|could not find the table|schema cache/i.test(error.message)) throw new Error(error.message);
  const values = [...new Set(facts.map(f => f.trim().slice(0, 300)).filter(Boolean))];
  await recordEvents(sb, userId, cohort, values.flatMap(v => [
    { field: 'memory', value: v, multi: true, action: 'removed' as const },
    { field: 'note', value: v, action: 'removed' as const },
  ]));
}
