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

/** Deletes the student's other Wynky schedules (any "Wynky Plan…" name not
 *  in keep), so a new set of day types never runs on top of an older one. */
export async function removeStaleWynkyPlans(sb: SupaLike, userId: string, keep: string[], isWynkyName: (name: string) => boolean): Promise<void> {
  const { data } = await sb.from('focus_lock_schedules').select('id, name').eq('user_id', userId);
  const stale = ((data || []) as { id: string; name: string }[]).filter(s => isWynkyName(s.name) && !keep.includes(s.name)).map(s => s.id);
  if (stale.length) await sb.from('focus_lock_schedules').delete().in('id', stale);
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
  const { data } = await sb.from('wynky_events')
    .select('field, value, multi, action, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(400);
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    field: r.field, value: r.value, multi: !!r.multi, action: r.action as WynkyAction, at: r.created_at,
  }));
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
