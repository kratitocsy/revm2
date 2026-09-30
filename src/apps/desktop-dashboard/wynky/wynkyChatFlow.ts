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
  type SubjectAllowlist, type WynkyKnownProfile, type WynkyRemembered, type DayOverrides,
} from './wynkyPlanner';
import type { GeneratorResult } from '../../_shared/scheduleGenerator';
import type { Day as TimelineDay } from './scheduleTimeline';

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

/** Common subjects for the student's exam, used when onboarding saved none. */
export function examSubjects(exam: string | null): string[] {
  return EXAM_SUBJECTS[examFamilyKey(exam)] || EXAM_SUBJECTS.general;
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
export function hoursOptions(known: WynkyKnownProfile, remembered: WynkyRemembered, recommended?: { minutes: number; why: string | null }): ChatOption[] {
  const usual = recommended?.minutes ?? defaultDailyMinutes(known, remembered);
  const why = recommended ? recommended.why : remembered.lastDailyMinutes != null ? 'your usual' : (known.dailyHoursBucket ? 'from your quiz' : null);
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
export function clockOptions(kind: 'wake' | 'sleep', rememberedTime: string | null, note: string | null = 'usual'): ChatOption[] {
  const times = kind === 'wake' ? WAKE_TIMES : SLEEP_TIMES;
  const opts: ChatOption[] = [];
  if (rememberedTime) opts.push({ id: rememberedTime, label: note ? `${fmtClock(rememberedTime)} (${note})` : fmtClock(rememberedTime) });
  for (const t of times) if (t !== rememberedTime) opts.push({ id: t, label: fmtClock(t) });
  return opts;
}

/** A typed website, reduced to the bare domain Focus Lock matches on, or
 *  null if it doesn't look like one ("allen" is a name, not a site). */
export function siteFromText(text: string): string | null {
  const host = text.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
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

const BLOCK_CHOICES = [45, 60, 90, 120];

/** Option ids are "b<minutes>"; the recommended length comes first. */
export function blockOptions(recommended: number, why: string | null): ChatOption[] {
  const opts: ChatOption[] = [{ id: `b${recommended}`, label: `${recommended} minutes${why ? ` (${why})` : ''}` }];
  for (const m of BLOCK_CHOICES) if (m !== recommended) opts.push({ id: `b${m}`, label: `${m} minutes` });
  return opts;
}

/** "4-7 pm", "16:00-19:00", "8 to 2", "5-8" -> "HH:MM-HH:MM", or null.
 *  Without am/pm, an end hour earlier than the start is read as afternoon
 *  ("8 to 2"), and a window starting before 6 as evening ("5-8"). */
export function parseBusyText(text: string): string | null {
  const m = /^(\d{1,2}(?:[:.]\d{2})?)\s*([ap]\.?m\.?)?\s*(?:-|to|–)\s*(\d{1,2}(?:[:.]\d{2})?)\s*([ap]\.?m\.?)?$/i.exec(text.trim().toLowerCase());
  if (!m) return null;
  const endAp = m[4] ? m[4][0] : null;
  const startAp = m[2] ? m[2][0] : endAp;
  const clock = (t: string, ap: string | null) => parseClock(ap ? `${t} ${ap}m` : t, 'wake');
  let end = clock(m[3], endAp);
  let start = clock(m[1], startAp);
  // "11-2 pm": the pm belongs to the end only.
  if (!m[2] && start && end && start >= end) start = clock(m[1], null);
  // "2-5" or "5-8" with no am/pm: nobody means the middle of the night.
  if (!startAp && start && end && start < '06:00' && end <= '12:00') {
    const plus12 = (t: string) => `${String(Number(t.slice(0, 2)) + 12).padStart(2, '0')}${t.slice(2)}`;
    start = plus12(start); end = plus12(end);
  }
  if (!start || !end) return null;
  if (end <= start && !endAp) {
    const [eh, em] = end.split(':').map(Number);
    if (eh + 12 < 24) end = `${String(eh + 12).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }
  return end > start ? `${start}-${end}` : null;
}

export function fmtBusy(value: string): string {
  const [a, b] = value.split('-');
  return a && b ? `${fmtClock(a)}–${fmtClock(b)}` : value;
}

// Gaps up to this long between two study blocks read as a break; longer
// ones are free time (meals, school, anything the student is busy with).
const BREAK_MAX_MINUTES = 30

/** "45 min", "1 hour", "1 hour 20 min": exact, unlike fmtHours' "1.3 hours". */
export function fmtGap(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : ''
  return [hours, m ? `${m} min` : ''].filter(Boolean).join(' ')
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** One line per block, timetable style, with what fills each gap between
 *  study blocks spelled out: the student's busy times (school, coaching),
 *  then short gaps as breaks and longer ones as free time. */
export function timetableLines(result: GeneratorResult, busy: { start: string; end: string }[] = []): string[] {
  const blocks = result.blocks.filter(b => b.kind !== 'break').slice().sort((a, b) => a.startMinutes - b.startMinutes)
  const busyMins = busy.map(w => [toMinutes(w.start), toMinutes(w.end)] as const).sort((a, b) => a[0] - b[0])
  const gapLines = (from: number, to: number) => {
    const out: string[] = []
    const free = (a: number, b: number) => {
      if (b <= a) return
      const gap = b - a
      out.push(`${toClock(a)}–${toClock(b)}  ${gap <= BREAK_MAX_MINUTES ? `☕ Break (${gap} min)` : `Free time (${fmtGap(gap)})`}`)
    }
    let at = from
    for (const [bs, be] of busyMins) {
      const s = Math.max(bs, at), e = Math.min(be, to)
      if (e <= s) continue
      free(at, s)
      out.push(`${toClock(s)}–${toClock(e)}  🏫 Busy`)
      at = e
    }
    free(at, to)
    return out
  }
  const lines: string[] = []
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1]
    if (prev && prev.kind === 'study' && b.kind === 'study' && b.startMinutes > prev.endMinutes) {
      lines.push(...gapLines(prev.endMinutes, b.startMinutes))
    }
    lines.push(`${b.startTime}–${b.endTime}  ${b.kind === 'sleep' ? '😴 Sleep' : `📘 ${b.subjectName || 'Study'}`}`)
  })
  return lines
}

export function formatRecommendedPlan(result: GeneratorResult, busy: { start: string; end: string }[] = [], opts: { tables?: boolean } = {}): string {
  const lines = opts.tables === false ? '' : `${timetableLines(result, busy).join('\n')}\n\n`
  const cut = result.wasCut ? ' (trimmed to fit between your wake and sleep times)' : '';
  return `Here's your day: ${fmtHours(result.placedStudyMinutes)} of study${cut}.\n\n${lines}Tap Confirm to make it live, or tell me what to change.`;
}

/** True when the student is asking for a week where each day differs,
 *  rather than one day repeated all week (the default). Deliberately
 *  narrow — a plain "give me a weekly plan" should still repeat the
 *  single-day plan, since that is what most students mean. */
export function mentionsWeek(text: string): boolean {
  return /\bweek(ly)?\b/i.test(text);
}

export function wantsWeeklyVariation(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\bweek(ly)?\b/.test(t)) return false;
  return /(each day|every day|per day|different (subjects|plans?)|day[- ]wise|day of week|vary(ing)? by day|alternat\w* days?)/.test(t);
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Days in the order a student reads a week: Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The same day plan on all 7 days, for when a repeated plan gets a
 *  day-specific change and has to be saved day by day. */
export function repeatWeek(result: GeneratorResult): Record<number, GeneratorResult> {
  return Object.fromEntries(WEEK_ORDER.map(day => [day, result]));
}

/** Every day key of a plan in reading order: Mon..Sun, then Week B's Mon..Sun. */
export function planDays(twoWeeks: boolean): number[] {
  return twoWeeks ? [...WEEK_ORDER, ...WEEK_ORDER.map(d => d + 7)] : WEEK_ORDER;
}

/** "Tue", or "Week B Tue" for days 7-13 of a two-week plan. */
export function dayLabel(day: number, twoWeeks = day >= 7): string {
  return twoWeeks ? `Week ${day >= 7 ? 'B' : 'A'} ${DAY_NAMES[day % 7]}` : DAY_NAMES[day % 7];
}

export type Repeat = 'weekly' | 'every2' | 'ab';

/** "Every other week", "fortnightly" or "Week A / Week B" in a request. */
export function repeatFromText(text: string): Repeat | null {
  const t = text.toLowerCase();
  if (/(week a\b|week b\b|(two|2) different weeks|alternat\w* (between )?(two|2) (weeks|plans))/.test(t)) return 'ab';
  if (/(every (other|2(nd)?|two|second) weeks?|alternate weeks?|fortnight\w*|bi-?weekly)/.test(t)) return 'every2';
  return null;
}

const DAY_RES = [
  /\bsun(day)?s?\b/, /\bmon(day)?s?\b/, /\btue(s|sday)?s?\b/, /\bwed(nesday)?s?\b/,
  /\bthu(r|rs|rsday)?s?\b/, /\bfri(day)?s?\b/, /\bsat(urday)?s?\b/,
];

/** Weekdays (0 Sun .. 6 Sat) a message names, including "weekends",
 *  "weekdays", "today" and "tomorrow". */
export function mentionedDays(text: string, today: number = new Date().getDay()): number[] {
  const t = text.toLowerCase();
  const out = new Set<number>();
  DAY_RES.forEach((re, i) => { if (re.test(t)) out.add(i); });
  if (/\bweekends?\b/.test(t)) { out.add(0); out.add(6); }
  if (/\bweekdays?\b/.test(t)) [1, 2, 3, 4, 5].forEach(d => out.add(d));
  // today < 0: named days only, no "today"/"tomorrow".
  if (today >= 0 && /\btoday\b/.test(t)) out.add(today);
  if (today >= 0 && /\btomorrow\b/.test(t)) out.add((today + 1) % 7);
  return [...out].sort((a, b) => a - b);
}

/** True when the named days should have no study at all ("Sunday off"). */
export function wantsDaysOff(text: string): boolean {
  return /\b(off|holiday|rest day|no (study|studying|plan|blocks?)|free day|don'?t study|skip)\b/i.test(text);
}

/** True when a Week B day is meant ("week b tuesday", "next week's Monday"). */
export function mentionsWeekB(text: string): boolean {
  return /\b(week b|second week|next week)\b/i.test(text);
}

/** One line per day-specific set-up, e.g. "Tue Physics: eduniti.in, youtube.com, 2 channels"
 *  or "Tue Physics 17:00: ..." for a single block. */
export function formatDayOverrides(overrides: DayOverrides): string {
  const lines: string[] = [];
  const twoWeeks = Object.keys(overrides).some(k => Number(k) >= 7);
  for (const day of planDays(twoWeeks)) {
    for (const [key, allow] of Object.entries(overrides[day] || {})) {
      const bits = [...allow.sites];
      if (allow.channels?.length) bits.push(`${allow.channels.length} channel${allow.channels.length === 1 ? '' : 's'}`);
      if (allow.apps.length) bits.push(`${allow.apps.length} app${allow.apps.length === 1 ? '' : 's'}`);
      lines.push(`${dayLabel(day, twoWeeks)} ${key.replace('@', ' ')}: ${bits.join(', ') || 'nothing picked, uses the usual'}`);
    }
  }
  return lines.length ? `Day-specific set-up:\n${lines.join('\n')}` : '';
}

/** One line per day with each block's subject and start time and the
 *  study total, so a student can scan the whole week before confirming.
 *  Days 7-13 are shown as Week B; days not in activeDays as "off". */
export function formatWeeklyPlan(
  week: Record<number, GeneratorResult>,
  opts: { activeDays?: number[]; repeat?: Repeat; busy?: { start: string; end: string }[]; tables?: boolean } = {},
): string {
  const active = new Set(opts.activeDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const twoWeeks = Object.keys(week).some(k => Number(k) >= 7);
  // Each day is a small timetable. A day identical to one already shown in
  // the same week just points back to it, so a mostly-repeating week stays short.
  const section = (days: number[]) => {
    const seen: { name: string; lines: string }[] = [];
    return days.map(day => {
      const name = FULL_DAY_NAMES[day % 7];
      const result = week[day];
      if (!active.has(day % 7) || !result) return `${name}: day off`;
      const lines = timetableLines(result, opts.busy).join('\n');
      const same = seen.find(s => s.lines === lines);
      if (same) return `${name}: same as ${same.name}`;
      seen.push({ name, lines });
      return `${name} · ${fmtHours(result.placedStudyMinutes)} of study\n${lines}`;
    }).join('\n\n');
  };
  const body = twoWeeks
    ? `WEEK A (this week)\n\n${section(WEEK_ORDER)}\n\nWEEK B (next week)\n\n${section(WEEK_ORDER.map(d => d + 7))}`
    : section(WEEK_ORDER);
  const repeatNote = twoWeeks
    ? '\n\nWeek A and Week B take turns, starting with Week A this week.'
    : opts.repeat === 'every2' ? '\n\nRuns every 2 weeks, starting this week.' : '';
  // Without tables the chat shows the week as the day-wise timetable instead.
  if (opts.tables === false) return `Here's your week:${repeatNote}\n\nTap Confirm to make it live, or tell me what to change.`;
  return `Here's your week:\n\n${body}${repeatNote}\n\nTap Confirm to make it live, or tell me what to change.`;
}

/** The study sessions of a plan, day by day, for the chat's timetable view.
 *  A varied or two-week plan gives one entry per day (keys 7-13 are Week B,
 *  kept only for days that run); a plan that is the same every day gives one
 *  entry for "all". */
export function planTimelineDays(
  week: Record<number, GeneratorResult> | null,
  single: GeneratorResult | null,
  activeDays: number[],
): TimelineDay[] {
  const slotsOf = (r: GeneratorResult) => r.blocks
    .filter(b => b.kind === 'study')
    .map(b => ({ start_time: b.startTime, end_time: b.endTime, subject: b.subjectName || 'Study' }))
  if (week) {
    return Object.entries(week)
      .filter(([k]) => activeDays.includes(Number(k) % 7))
      .map(([k, r]) => ({ day: Number(k), slots: slotsOf(r) }))
  }
  return single ? [{ day: 'all', slots: slotsOf(single) }] : []
}

export interface PlanRow { start: string; end: string; minutes: number; activity: string; kind: 'study' | 'break' | 'sleep' | 'busy' | 'free' }
export type PlanPart = { kind: 'text'; text: string } | { kind: 'table'; rows: PlanRow[] }

const PLAN_LINE = /^(\d{1,2}:\d{2})–(\d{1,2}:\d{2}) {2}(.+)$/

/** Splits a chat message into plain text and the timetable lines
 *  timetableLines() writes, so the chat can show those as a table. */
export function splitPlanText(text: string): PlanPart[] {
  const parts: PlanPart[] = []
  let buf: string[] = []
  let rows: PlanRow[] = []
  const flushText = () => { if (buf.length) parts.push({ kind: 'text', text: buf.join('\n') }); buf = [] }
  const flushRows = () => { if (rows.length) parts.push({ kind: 'table', rows }); rows = [] }
  for (const line of text.split('\n')) {
    const m = PLAN_LINE.exec(line)
    if (!m) { flushRows(); buf.push(line); continue }
    flushText()
    const [, start, end, raw] = m
    const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number)
    const minutes = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440 || 1440
    const kind: PlanRow['kind'] = raw.startsWith('😴') ? 'sleep' : raw.startsWith('☕') ? 'break' : raw.startsWith('🏫') ? 'busy' : raw.startsWith('Free time') ? 'free' : 'study'
    const activity = raw.replace(/^(📘|😴|☕|🏫)\s*/u, '').replace(/\s*\([^)]*\)$/, '')
    rows.push({ start, end, minutes, activity, kind })
  }
  flushRows()
  flushText()
  // Blank lines around a table are spacing the table already has.
  return parts
    .map(p => p.kind === 'text' ? { kind: 'text' as const, text: p.text.replace(/^\s*\n|\n\s*$/g, '') } : p)
    .filter(p => p.kind === 'table' || p.text.trim())
}
