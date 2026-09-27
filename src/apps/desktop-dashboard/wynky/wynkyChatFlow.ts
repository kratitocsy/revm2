/* ============================================================
   wynkyChatFlow.ts

   The pure parts of Wynky's guided chat (WynkyChat.tsx): the quick-reply
   options each question offers and the parsers for what a student types
   instead of tapping one. Like a support bot, every question has options
   to tap, and typing either filters them or is read as the answer, so a
   student never has to leave the chat for a form.
   ============================================================ */

import {
  DAILY_HOURS_MINUTES, defaultDailyMinutes, examFamilyKey,
  type SubjectAllowlist, type WynkyKnownProfile, type WynkyRemembered,
} from './wynkyPlanner';
import type { GeneratorResult } from '../../_shared/scheduleGenerator';

export interface ChatOption { id: string; label: string }

// Starting suggestions only: the student ticks what applies and can type
// any other subject. Their own onboarding subjects always come first.
const EXAM_SUBJECTS: Record<string, string[]> = {
  jee: ['Physics', 'Chemistry', 'Maths'],
  neet: ['Physics', 'Chemistry', 'Biology'],
  upsc: ['General Studies', 'CSAT', 'Current Affairs', 'Optional Subject'],
  cat: ['Quant', 'Verbal (VARC)', 'DILR'],
  gate: ['Engineering Maths', 'General Aptitude', 'Core Subject'],
  general: ['Maths', 'Science', 'English', 'Social Science'],
};

export function uniqueCaseless(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Subjects to offer: the ones Wynky already has for this student
 *  (saved set-up, then onboarding), then common ones for their exam. */
export function subjectChoices(known: WynkyKnownProfile, remembered: WynkyRemembered): string[] {
  return uniqueCaseless([
    ...Object.keys(remembered.subjectAllowlists),
    ...known.subjects,
    ...(EXAM_SUBJECTS[examFamilyKey(known.exam)] || EXAM_SUBJECTS.general),
  ]);
}

/** A subject has something Focus Lock can enforce during its blocks. */
export function isEnforceable(allow: SubjectAllowlist | undefined): boolean {
  return !!allow && (allow.sites.length > 0 || allow.apps.length > 0 || (allow.channels || []).length > 0);
}

export function hasSavedSetup(remembered: WynkyRemembered): boolean {
  return Object.values(remembered.subjectAllowlists).some(isEnforceable);
}

export function fmtHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

const HOUR_BUCKETS: { minutes: number; label: string }[] = [
  { minutes: DAILY_HOURS_MINUTES['1-2'], label: '1–2 hours' },
  { minutes: DAILY_HOURS_MINUTES['2-4'], label: '2–4 hours' },
  { minutes: DAILY_HOURS_MINUTES['4-6'], label: '4–6 hours' },
  { minutes: DAILY_HOURS_MINUTES['6-8'], label: '6–8 hours' },
];

/** Option ids are "m<minutes>". The student's usual amount (nudged by what
 *  they kept confirming before) comes first and says so. */
export function hoursOptions(known: WynkyKnownProfile, remembered: WynkyRemembered): ChatOption[] {
  const usual = defaultDailyMinutes(known, remembered);
  const why = remembered.lastDailyMinutes != null ? 'your usual' : (known.dailyHoursBucket ? 'from your quiz' : null);
  const opts: ChatOption[] = [];
  if (why && !HOUR_BUCKETS.some(b => b.minutes === usual)) opts.push({ id: `m${usual}`, label: `About ${fmtHours(usual)} (${why})` });
  for (const b of HOUR_BUCKETS) {
    opts.push({ id: `m${b.minutes}`, label: why && b.minutes === usual ? `${b.label} (${why})` : b.label });
  }
  return opts;
}

export function minutesFromOptionId(id: string): number | null {
  const m = /^m(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

/** "5", "5h", "4.5 hours", "90 min" -> minutes, or null if it isn't a
 *  sensible amount of study for one day (30 minutes to 12 hours). */
export function parseStudyMinutes(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?\b/i.exec(text.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  const minutes = unit.startsWith('m') ? Math.round(n) : Math.round(n * 60);
  return minutes >= 30 && minutes <= 720 ? minutes : null;
}

export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "6", "6:30", "6.30 am", "11 pm", "23:00" -> "HH:MM". Without am/pm a
 *  bedtime of 7–11 is read as evening and 12 as midnight, since that's
 *  what "I sleep at 11" means. */
export function parseClock(text: string, kind: 'wake' | 'sleep'): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*m?\.?$/i.exec(text.trim().toLowerCase());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (h > 23 || min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
  } else if (kind === 'sleep' && h <= 12) {
    if (h >= 7 && h <= 11) h += 12;
    else if (h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const WAKE_TIMES = ['05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00'];
const SLEEP_TIMES = ['21:30', '22:00', '22:30', '23:00', '23:30', '00:00', '00:30'];

/** Option ids are the "HH:MM" time itself; a remembered time comes first. */
export function clockOptions(kind: 'wake' | 'sleep', rememberedTime: string | null): ChatOption[] {
  const times = kind === 'wake' ? WAKE_TIMES : SLEEP_TIMES;
  const opts: ChatOption[] = [];
  if (rememberedTime) opts.push({ id: rememberedTime, label: `${fmtClock(rememberedTime)} (usual)` });
  for (const t of times) if (t !== rememberedTime) opts.push({ id: t, label: fmtClock(t) });
  return opts;
}

/** A typed website, reduced to the bare domain Focus Lock matches on, or
 *  null if it doesn't look like one ("allen" is a name, not a site). */
export function siteFromText(text: string): string | null {
  const host = text.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

export function filterOptions<T extends ChatOption>(opts: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
}

/** The option a typed answer clearly means: an exact label, or the only
 *  label containing it. */
export function clearMatch<T extends ChatOption>(opts: T[], query: string): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = opts.find(o => o.label.toLowerCase() === q);
  if (exact) return exact;
  const partial = filterOptions(opts, q);
  return partial.length === 1 ? partial[0] : null;
}

export function formatRecommendedPlan(result: GeneratorResult): string {
  const lines = result.blocks
    .filter(b => b.kind !== 'break')
    .map(b => `${b.startTime}–${b.endTime}  ${b.kind === 'sleep' ? '😴 Sleep' : (b.subjectName || 'Study')}`);
  const cut = result.wasCut ? ' (trimmed to fit between your wake and sleep times)' : '';
  return `Here's your day: ${fmtHours(result.scheduledStudyMinutes)} of study${cut}.\n\n${lines.join('\n')}\n\nTap Confirm to make it live, or tell me what to change.`;
}
