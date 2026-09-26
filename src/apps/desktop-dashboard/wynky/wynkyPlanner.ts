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

import { generateSchedule, type GeneratorResult, type SubjectInput } from '../../_shared/scheduleGenerator';

export interface SupaLike {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

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
}

export interface WynkyRemembered {
  wakeTime: string | null; // "HH:MM"
  sleepTime: string | null; // "HH:MM"
  subjectAllowlists: Record<string, { sites: string[]; apps: string[] }>;
  lastDailyMinutes: number | null;
  acceptedCount: number;
  adjustedCount: number;
}

/** Reads what Wynky already knows from the quiz/onboarding — never re-asked. */
export async function loadKnownProfile(sb: SupaLike, userId: string): Promise<WynkyKnownProfile> {
  const { data } = await sb.from('user_profiles')
    .select('subjects, exam, quiz_answers')
    .eq('id', userId).maybeSingle();
  const qa = (data?.quiz_answers ?? {}) as Record<string, unknown>;
  const dh = qa.daily_hours as string | undefined;
  return {
    subjects: Array.isArray(data?.subjects) ? data!.subjects.filter(Boolean) : [],
    exam: data?.exam ?? null,
    dailyHoursBucket: (dh === '1-2' || dh === '2-4' || dh === '4-6' || dh === '6-8' || dh === 'custom') ? dh : null,
    customDailyHoursText: (qa.custom_daily_hours as string) ?? null,
    distractionTags: Array.isArray(qa.distractions) ? (qa.distractions as string[]) : [],
    customDistractionText: (qa.custom_distraction as string) ?? null,
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

export interface RecommendInput {
  wakeTime: string;
  sleepTime: string;
  dailyMinutes: number;
  subjects: string[];
  blockLengthMinutes: number;
}

export function recommend(input: RecommendInput): GeneratorResult {
  const subjectInputs: SubjectInput[] = input.subjects.length
    ? input.subjects.map((name, i) => ({ id: `s${i}`, name, isWeak: false }))
    : [{ id: 's0', name: 'Study', isWeak: false }];
  return generateSchedule({
    wakeTime: input.wakeTime,
    sleepTime: input.sleepTime,
    dailyHoursRequested: input.dailyMinutes / 60,
    subjects: subjectInputs,
    blockLengthMinutes: input.blockLengthMinutes,
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
  subjectAllowlists: Record<string, { sites: string[]; apps: string[] }>;
  freeTimeSites: string[];
  freeTimeApps: string[];
}): Promise<EnsurePresetsResult> {
  const presetIdBySubject: Record<string, string> = {};
  const presetNames: string[] = [];

  for (const [name, allow] of Object.entries(args.subjectAllowlists)) {
    if (!allow.sites.length && !allow.apps.length) continue; // nothing to enforce with — skip rather than write an empty block
    const presetName = subjectPresetName(name);
    const { data: existing } = await sb.from('focus_lock_presets')
      .select('id').eq('user_id', userId).eq('name', presetName).maybeSingle();
    if (existing?.id) {
      await sb.from('focus_lock_presets').update({
        mode: 'whitelist', sites: allow.sites, apps: allow.apps, apps_mode: 'blacklist',
      }).eq('id', existing.id);
      presetIdBySubject[name] = existing.id;
    } else {
      const { data: created, error } = await sb.from('focus_lock_presets').insert({
        user_id: userId, name: presetName, mode: 'whitelist',
        sites: allow.sites, apps: allow.apps, apps_mode: 'blacklist',
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
}): Promise<{ scheduleId: string }> {
  const scheduleName = args.planName || 'Wynky Plan';
  const { data: existingSchedule } = await sb.from('focus_lock_schedules')
    .select('id').eq('user_id', userId).eq('name', scheduleName).maybeSingle();

  let scheduleId: string;
  if (existingSchedule?.id) {
    scheduleId = existingSchedule.id;
    await sb.from('focus_lock_schedules').update({ days_of_week: args.daysOfWeek, active: true }).eq('id', scheduleId);
    await sb.from('focus_lock_schedule_slots').delete().eq('schedule_id', scheduleId);
  } else {
    const { data: created, error } = await sb.from('focus_lock_schedules')
      .insert({ user_id: userId, name: scheduleName, days_of_week: args.daysOfWeek }).select('id').single();
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
  subjectAllowlists: Record<string, { sites: string[]; apps: string[] }>;
  freeTimeSites: string[];
  freeTimeApps: string[];
  daysOfWeek: number[];
}

/** Writes the confirmed rule-based plan as real focus_lock_presets + a
 *  real focus_lock_schedule/slots — the same tables the (existing,
 *  server-enforced) Focus Lock schedule engine already reads every
 *  minute, so enforcement starts without touching blocks.html at all. */
export async function confirmPlan(sb: SupaLike, args: ConfirmPlanArgs): Promise<{ scheduleId: string }> {
  const { presetIdBySubject, freeTimePresetId } = await ensurePresets(sb, args.userId, {
    subjectAllowlists: args.subjectAllowlists,
    freeTimeSites: args.freeTimeSites,
    freeTimeApps: args.freeTimeApps,
  });

  const slots: PlanSlotInput[] = args.result.blocks
    .filter(b => b.kind !== 'break') // represented as break_after_minutes on the previous slot, not its own slot
    .map(block => ({
      presetId: block.kind === 'sleep' ? null : (block.subjectName ? presetIdBySubject[block.subjectName] : null) ?? freeTimePresetId,
      subject: block.kind === 'sleep' ? null : (block.subjectName ?? null),
      startTime: block.startTime,
      endTime: block.endTime,
      isSleep: block.kind === 'sleep',
    }));

  return writeSchedule(sb, args.userId, { planName: args.planName, daysOfWeek: args.daysOfWeek, slots });
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
export async function confirmAiPlan(sb: SupaLike, args: {
  userId: string;
  planName: string;
  daysOfWeek: number[];
  aiSlots: AiSlot[];
  subjectAllowlists: Record<string, { sites: string[]; apps: string[] }>;
  freeTimeSites: string[];
  freeTimeApps: string[];
}): Promise<{ scheduleId: string }> {
  const { presetIdBySubject, freeTimePresetId } = await ensurePresets(sb, args.userId, {
    subjectAllowlists: args.subjectAllowlists,
    freeTimeSites: args.freeTimeSites,
    freeTimeApps: args.freeTimeApps,
  });
  const idByPresetName: Record<string, string | null> = { [FREE_TIME_PRESET_NAME]: freeTimePresetId };
  for (const [subject, id] of Object.entries(presetIdBySubject)) idByPresetName[subjectPresetName(subject)] = id;

  const slots: PlanSlotInput[] = args.aiSlots.map(s => ({
    presetId: s.is_sleep ? null : (idByPresetName[s.preset_name] ?? null),
    subject: s.is_sleep ? null : (s.subject ?? null),
    startTime: s.start_time,
    endTime: s.end_time,
    isSleep: !!s.is_sleep,
  }));

  return writeSchedule(sb, args.userId, { planName: args.planName, daysOfWeek: args.daysOfWeek, slots });
}

export async function rememberAnswers(sb: SupaLike, userId: string, args: {
  wakeTime: string;
  sleepTime: string;
  subjectAllowlists: Record<string, { sites: string[]; apps: string[] }>;
}): Promise<void> {
  await sb.from('wynky_profiles').upsert({
    user_id: userId,
    wake_time: args.wakeTime,
    sleep_time: args.sleepTime,
    subject_allowlists: args.subjectAllowlists,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function recordOutcome(sb: SupaLike, args: {
  source: 'rule_based' | 'ai_custom';
  requestedMinutes: number;
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
