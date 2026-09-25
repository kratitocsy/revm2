/* ============================================================
   quizEngine.ts

   Wynky's Study DNA quiz: the 5 questions, Study DNA scoring and
   the Wynkoins reward. Pure logic, no Supabase/network calls, no
   React — the UI drives Wynky's animations/reactions and
   quizPersistence.ts saves the result.

   CUSTOM ANSWERS: every question ends with a "Something else" chip
   (value 'custom') so a student who doesn't fit a preset option can
   type their own, capped at CUSTOM_ANSWER_MAX_LENGTH characters. The
   typed text lives in the question's `custom_<field>` property; a
   question isn't answered until that text passes validateCustomAnswer().

   SKIPPING: every question can be skipped; skipped question ids are
   kept in `answers.skipped` and earn no Wynkoins.

   REWARD: +10 Wynkoins per answered question, nothing else - 50 max.
   The server recomputes this itself (rpc_submit_study_dna, migration
   0088) and only pays it on the account's first completion.
*/

export const CUSTOM_VALUE = 'custom' as const;
export const CUSTOM_ANSWER_MAX_LENGTH = 60;

export function validateCustomAnswer(text: string | undefined): { valid: boolean; error?: string } {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) return { valid: false, error: 'Type an answer.' };
  if (trimmed.length > CUSTOM_ANSWER_MAX_LENGTH) {
    return { valid: false, error: `Keep it under ${CUSTOM_ANSWER_MAX_LENGTH} characters.` };
  }
  return { valid: true };
}

export type DayType = 'school_coaching' | 'school_college' | 'self_study' | 'working' | typeof CUSTOM_VALUE;
export type DailyHours = '1-2' | '2-4' | '4-6' | '6-8' | typeof CUSTOM_VALUE;
export type Distraction = 'instagram' | 'youtube' | 'whatsapp' | 'procrastination' | typeof CUSTOM_VALUE;
export type StudyStyle = 'videos' | 'books' | 'practice' | 'friends' | typeof CUSTOM_VALUE;
export type Challenge = 'timetable' | 'consistency' | 'revision' | 'syllabus' | typeof CUSTOM_VALUE;

export interface QuizAnswers {
  day_type?: DayType;
  custom_day_type?: string;
  daily_hours?: DailyHours;
  custom_daily_hours?: string;
  distractions?: Distraction[];
  custom_distraction?: string;
  study_style?: StudyStyle[];
  custom_study_style?: string;
  challenges?: Challenge[];
  custom_challenge?: string;
  /** Questions the student skipped with the Skip button (stored with the answers). */
  skipped?: QuestionId[];
}

export type QuestionId = 'q1' | 'q2' | 'q3' | 'q4' | 'q5';

export interface QuizOption {
  value: string;
  label: string;
}

export interface QuizQuestion {
  id: QuestionId;
  field: keyof QuizAnswers;
  customField: keyof QuizAnswers;
  multiSelect?: boolean;
  /** Most options a multi-select question accepts (undefined = no limit). */
  maxSelect?: number;
  options: QuizOption[];
}

export const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1', field: 'day_type', customField: 'custom_day_type',
    options: [
      { value: 'school_coaching', label: '🏫 School + Coaching' },
      { value: 'school_college', label: '📚 School / College' },
      { value: 'self_study', label: '🏠 Full-time Self-study' },
      { value: 'working', label: '💼 Working + Studying' },
      { value: CUSTOM_VALUE, label: '✨ Something else (Type your own)' },
    ],
  },
  {
    id: 'q2', field: 'daily_hours', customField: 'custom_daily_hours',
    options: [
      { value: '1-2', label: '🌱 1–2 hours' },
      { value: '2-4', label: '📖 2–4 hours' },
      { value: '4-6', label: '🔥 4–6 hours' },
      { value: '6-8', label: '🚀 6–8 hours' },
      { value: CUSTOM_VALUE, label: '✨ Something else (Enter your target)' },
    ],
  },
  {
    id: 'q3', field: 'distractions', customField: 'custom_distraction', multiSelect: true,
    options: [
      { value: 'instagram', label: '📸 Instagram / Reels' },
      { value: 'youtube', label: '▶️ YouTube / Shorts' },
      { value: 'whatsapp', label: '💬 WhatsApp / Social Media' },
      { value: 'procrastination', label: '😴 Procrastination' },
      { value: CUSTOM_VALUE, label: '✨ Something else (Type your own)' },
    ],
  },
  {
    id: 'q4', field: 'study_style', customField: 'custom_study_style', multiSelect: true, maxSelect: 2,
    options: [
      { value: 'videos', label: '🎥 Video Lectures' },
      { value: 'books', label: '📚 Books & Notes' },
      { value: 'practice', label: '✍️ Practice Questions' },
      { value: 'friends', label: '👥 Studying with Friends' },
      { value: CUSTOM_VALUE, label: '✨ Something else (Type your own)' },
    ],
  },
  {
    id: 'q5', field: 'challenges', customField: 'custom_challenge', multiSelect: true, maxSelect: 2,
    options: [
      { value: 'timetable', label: '📅 Following a Timetable' },
      { value: 'consistency', label: '🔥 Staying Consistent' },
      { value: 'revision', label: '🧠 Remembering & Revising' },
      { value: 'syllabus', label: '📚 Completing My Syllabus' },
      { value: CUSTOM_VALUE, label: '✨ Something else (Type your own)' },
    ],
  },
];

export const QUESTION_COUNT = QUESTIONS.length; // 5
export const COINS_PER_ANSWER = 10;
export const MAX_QUIZ_COINS = QUESTION_COUNT * COINS_PER_ANSWER; // 50

/** 1-5 */
export function questionNumber(id: QuestionId): number {
  return Number(id.slice(1));
}

/** True once a (value, customText) pair represents a real, valid answer. */
function hasValidAnswer(value: unknown, customText: string | undefined, maxSelect?: number): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    if (maxSelect !== undefined && value.length > maxSelect) return false;
    if (value.includes(CUSTOM_VALUE)) return validateCustomAnswer(customText).valid;
    return true;
  }
  if (value === CUSTOM_VALUE) return validateCustomAnswer(customText).valid;
  return true;
}

function isAnswered(answers: QuizAnswers, q: QuizQuestion): boolean {
  return hasValidAnswer(answers[q.field], answers[q.customField] as string | undefined, q.maxSelect);
}

/** The next question to show, or null when every question is answered or skipped. */
export function getNextQuestion(answers: QuizAnswers): QuizQuestion | null {
  for (const q of QUESTIONS) {
    if (answers.skipped?.includes(q.id)) continue;
    if (!isAnswered(answers, q)) return q;
  }
  return null;
}

export function isQuizComplete(answers: QuizAnswers): boolean {
  return getNextQuestion(answers) === null;
}

/** For each question (index 0 = Q1), whether it holds a real answer. */
export function answeredQuestions(answers: QuizAnswers): boolean[] {
  return QUESTIONS.map((q) => isAnswered(answers, q));
}

export function answeredQuestionCount(answers: QuizAnswers): number {
  return answeredQuestions(answers).filter(Boolean).length;
}

/** Coins for finishing the quiz: +10 per answer, first completion only (50 max). */
export function calculateQuizReward(answers: QuizAnswers, isFirstTimeCompletion: boolean): number {
  if (!isFirstTimeCompletion) return 0;
  return answeredQuestionCount(answers) * COINS_PER_ANSWER;
}

// ── Study DNA (archetype) ────────────────────────────────────────
// Ordered rules, first match wins, Balanced Planner as the catch-all.
export const ARCHETYPES = [
  'Social Battler', 'Grind Machine', 'Marathoner', 'Focus Seeker', 'Team Player',
  'Visual Learner', 'Deep Reader', 'Sprinter', 'Balanced Planner',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

const SOCIAL_APPS: Distraction[] = ['instagram', 'youtube', 'whatsapp'];

export function scoreArchetype(answers: QuizAnswers): Archetype {
  const distractions = answers.distractions ?? [];
  const style = answers.study_style ?? [];
  const challenges = answers.challenges ?? [];
  const hours = answers.daily_hours;

  if (distractions.filter((d) => SOCIAL_APPS.includes(d)).length >= 2) return 'Social Battler';
  if (hours === '6-8' && style.includes('practice')) return 'Grind Machine';
  if (hours === '6-8') return 'Marathoner';
  if (distractions.includes('procrastination') || challenges.includes('consistency')) return 'Focus Seeker';
  if (style.includes('friends')) return 'Team Player';
  if (style.includes('videos')) return 'Visual Learner';
  if (style.includes('books')) return 'Deep Reader';
  if (style.includes('practice') && (hours === '1-2' || hours === '2-4')) return 'Sprinter';
  return 'Balanced Planner';
}

// ── Username generation ("socialbattler42"-style, from the Study DNA) ──
const USERNAME_MAX_LEN = 20; // matches the DB check

function randomDigits(n: 2 | 3): string {
  return n === 2 ? String(10 + Math.floor(Math.random() * 90)) : String(100 + Math.floor(Math.random() * 900));
}

export interface UsernameGenOptions {
  /** Async check against the server. Returns true if taken. */
  isTaken: (candidate: string) => Promise<boolean>;
  /** Optional extra blocklist substrings (case-insensitive). */
  blocklist?: string[];
  maxAttempts?: number; // per digit length, default 5
}

/**
 * A free username built from the Study DNA ("SocialBattler42"; the caller
 * lowercases it), or null if every attempt was taken - the caller then
 * falls back to a name-based one or manual input.
 */
export async function generateUsername(archetype: Archetype, opts: UsernameGenOptions): Promise<string | null> {
  const word = archetype.replace(/\s+/g, '');
  const maxAttempts = opts.maxAttempts ?? 5;
  const blocklist = (opts.blocklist ?? []).map((w) => w.toLowerCase());
  for (const n of [2, 3] as const) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const digits = randomDigits(n);
      const candidate = `${word.slice(0, USERNAME_MAX_LEN - digits.length)}${digits}`;
      if (blocklist.some((w) => candidate.toLowerCase().includes(w))) continue;
      // eslint-disable-next-line no-await-in-loop
      if (!(await opts.isTaken(candidate))) return candidate;
    }
  }
  return null;
}

// ── Username rules (match the database: rpc_check_username, migration 0088) ──
// 3-20 characters of a-z 0-9 _, starting and ending with a letter or number.
export const USERNAME_RE = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;

/** Lowercases and drops anything a username can't contain (for typing). */
export function cleanUsernameInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_MAX_LEN);
}

/** null when the username is fine, otherwise what's wrong with it. */
export function usernameProblem(u: string): string | null {
  if (u.length < 3) return 'Usernames need at least 3 characters.';
  if (u.length > USERNAME_MAX_LEN) return 'Usernames can be at most 20 characters.';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Use only lowercase letters, numbers and _.';
  if (!USERNAME_RE.test(u)) return 'Start and end with a letter or number.';
  return null;
}

/**
 * A starting username for someone who skipped the quiz: their first name
 * plus 3 digits ("rohan347"), or "wynko" + 4 digits without a usable name.
 * The caller checks availability and retries with a new call.
 */
export function usernameFromName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  let base = first.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 14);
  if (base.length < 2) base = 'wynko';
  const digits = String(Math.floor(Math.random() * (base === 'wynko' ? 9000 : 900)) + (base === 'wynko' ? 1000 : 100));
  return base + digits;
}
