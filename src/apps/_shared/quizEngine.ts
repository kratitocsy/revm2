/* ============================================================
   quizEngine.ts

   Wynky onboarding quiz (spec Section 2), archetype scoring +
   result screen data (Section 3), and the Wynkoins reward calc.
   Pure logic, no Supabase/network calls, no React — the calling
   UI drives Wynky's animations/reactions and persists the result.

   CUSTOM ANSWERS: every question (Q1-Q7 and the Q6b follow-up)
   carries an extra 'custom' chip so a student who doesn't fit any
   preset option can type their own, capped at
   CUSTOM_ANSWER_MAX_LENGTH characters. Each field that supports
   this has a matching `custom_<field>` text column on QuizAnswers
   holding the actual typed string; the field itself just holds
   the literal 'custom' as a marker. A question isn't considered
   answered until its custom text (if any) passes
   validateCustomAnswer() — see hasValidAnswer() below.

   Downstream logic (q2Options, scoreArchetype, blockLengthMinutesFor)
   already falls back to a sane default whenever a value doesn't match
   a known literal, so 'custom' safely degrades to those same
   fallbacks without special-casing every call site.

   Where the spec is genuinely ambiguous, the assumption is called
   out in a comment rather than silently guessed at:

   - Q1 (exam) and the subject pool already live on user_profiles
     (exam, subjects columns) - not re-modeled here.
   - Section 5's generator needs a per-session block length
     (20-30/45-60/90/120+ min), but none of the 7 listed quiz
     questions asks for it directly. ASSUMPTION: derive it from
     the Q5 daily-hours bucket (more daily hours -> longer natural
     session length). This is documented in BLOCK_LENGTH_BY_HOURS
     below and should be revisited if a real duration question
     gets added later.
   - Archetype conditions in the Section 3 table overlap (e.g.
     several archetypes could fit "problems + morning"). Scoring
     below is an ordered rule list, first match wins, with
     Balanced Planner as the catch-all - the table's plain-English
     descriptions don't define strict priority, so this ordering
     is a reasonable-effort interpretation, not a spec quote.
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

export type Exam = 'JEE' | 'NEET' | 'UPSC' | 'CAT' | 'Boards' | 'Something else' | typeof CUSTOM_VALUE;

export type StudentType =
  | '11th' | '12th' | 'dropper' | 'appeared' // JEE/NEET
  | 'upsc_1st' | 'upsc_2nd' | 'upsc_3rd_plus' // UPSC
  | 'cat_working' | 'cat_fulltime' // CAT
  | typeof CUSTOM_VALUE;

export type FixedCommitmentType =
  | 'school_and_coaching' | 'school_self_study' | 'coaching_only' | 'full_self_study'
  | typeof CUSTOM_VALUE;

export type FocusTime = 'before_7am' | 'morning' | 'afternoon' | 'evening' | 'after_9pm' | typeof CUSTOM_VALUE;

export type DailyHoursBucket = '2-3' | '4-5' | '6-7' | '8-9' | '10+' | typeof CUSTOM_VALUE;

export type Distraction = 'instagram' | 'youtube' | 'whatsapp' | 'games' | 'ott' | 'nothing' | typeof CUSTOM_VALUE;

export type StudyMode = 'youtube' | 'books' | 'problems' | 'mix' | typeof CUSTOM_VALUE;

export interface QuizAnswers {
  exam?: Exam;
  custom_exam?: string;
  student_type?: StudentType;
  custom_student_type?: string;
  fixed_commitment_type?: FixedCommitmentType;
  custom_fixed_commitment_type?: string;
  focus_time?: FocusTime;
  custom_focus_time?: string;
  daily_hours?: DailyHoursBucket;
  custom_daily_hours?: string;
  distractions?: Distraction[];
  custom_distraction?: string; // only used if distractions includes 'custom'
  block_social_anyway?: boolean | typeof CUSTOM_VALUE; // only asked if distractions === ['nothing']
  custom_block_social_anyway?: string;
  study_mode?: StudyMode;
  custom_study_mode?: string;
}

export type QuestionId = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q6b' | 'q7';

export interface QuizOption {
  value: string;
  label: string;
}

export interface QuizQuestion {
  id: QuestionId;
  field: keyof QuizAnswers;
  customField: keyof QuizAnswers;
  multiSelect?: boolean;
  options: QuizOption[];
}

const CUSTOM_OPTION: QuizOption = { value: CUSTOM_VALUE, label: 'Something else (type your own)' };

/** Appends the shared "type your own" chip to every question's option list. */
function withCustom(options: QuizOption[]): QuizOption[] {
  return [...options, CUSTOM_OPTION];
}

// ── Q2/Q3 options branch by exam/student_type (spec Section 2) ──
function q2Options(exam?: Exam): QuizOption[] {
  if (exam === 'UPSC') {
    return withCustom([
      { value: 'upsc_1st', label: '1st attempt' },
      { value: 'upsc_2nd', label: '2nd' },
      { value: 'upsc_3rd_plus', label: "3rd or more — I don't give up" },
    ]);
  }
  if (exam === 'CAT') {
    return withCustom([
      { value: 'cat_working', label: 'Working alongside prep' },
      { value: 'cat_fulltime', label: 'Full-time prep' },
    ]);
  }
  // JEE/NEET and the spec-unlisted Boards/Something else fall back to the
  // JEE/NEET option set (not specified for Boards/Other in the PDF).
  return withCustom([
    { value: '11th', label: '11th — just getting started' },
    { value: '12th', label: '12th — boards + entrance' },
    { value: 'dropper', label: 'Dropper — all in this year' },
    { value: 'appeared', label: 'Appeared, waiting' },
  ]);
}

const Q1_OPTIONS: QuizOption[] = withCustom([
  { value: 'JEE', label: 'JEE' },
  { value: 'NEET', label: 'NEET' },
  { value: 'UPSC', label: 'UPSC' },
  { value: 'CAT', label: 'CAT' },
  { value: 'Boards', label: 'Boards' },
  { value: 'Something else', label: 'Something else' },
]);

const Q3_OPTIONS: QuizOption[] = withCustom([
  { value: 'school_and_coaching', label: 'School + coaching both' },
  { value: 'school_self_study', label: 'School, self study after' },
  { value: 'coaching_only', label: 'Only coaching, no school' },
  { value: 'full_self_study', label: 'Full self study, nothing fixed' },
]);

const Q4_OPTIONS: QuizOption[] = withCustom([
  { value: 'before_7am', label: 'Before 7 AM' },
  { value: 'morning', label: 'Morning 7–11 AM' },
  { value: 'afternoon', label: 'Afternoon 12–4 PM' },
  { value: 'evening', label: 'Evening 5–9 PM' },
  { value: 'after_9pm', label: 'After 9 PM' },
]);

const Q5_OPTIONS: QuizOption[] = withCustom([
  { value: '2-3', label: '2–3 h' },
  { value: '4-5', label: '4–5 h' },
  { value: '6-7', label: '6–7 h' },
  { value: '8-9', label: '8–9 h' },
  { value: '10+', label: "10+ h, I'm built different" },
]);

const Q6_OPTIONS: QuizOption[] = withCustom([
  { value: 'instagram', label: 'Instagram/Reels' },
  { value: 'youtube', label: 'Random YouTube' },
  { value: 'whatsapp', label: 'WhatsApp/chats' },
  { value: 'games', label: 'Games' },
  { value: 'ott', label: 'Netflix/OTT' },
  { value: 'nothing', label: 'Honestly nothing' },
]);

const Q6B_OPTIONS: QuizOption[] = withCustom([
  { value: 'true', label: 'Fine, block it all' },
  { value: 'false', label: 'No really' },
]);

const Q7_OPTIONS: QuizOption[] = withCustom([
  { value: 'youtube', label: 'Watch YouTube lectures' },
  { value: 'books', label: 'Read books and notes' },
  { value: 'problems', label: 'Solve problems till it clicks' },
  { value: 'mix', label: 'Mix of everything' },
]);

/** Auto-fill defaults for Q3 when it's skipped (spec: dropper -> coaching_only, appeared -> self_study). */
export function q3AutoDefault(studentType?: StudentType): FixedCommitmentType | undefined {
  if (studentType === 'dropper') return 'coaching_only';
  if (studentType === 'appeared') return 'full_self_study';
  return undefined;
}

/** True once a (value, customText) pair represents a real, valid answer. */
function hasValidAnswer(value: unknown, customText: string | undefined): boolean {
  if (value === undefined) return false;
  if (value === CUSTOM_VALUE) return validateCustomAnswer(customText).valid;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    if (value.includes(CUSTOM_VALUE)) return validateCustomAnswer(customText).valid;
  }
  return true;
}

/**
 * Returns the next question to show, or null if the quiz is complete.
 * Encodes the spec's skip rules:
 * - Q3 is skipped for dropper/appeared (auto-defaulted via q3AutoDefault).
 * - Q6b ("Block social anyway?") only appears if Q6 = ['nothing'] exactly.
 * - Any question answered with the 'custom' chip isn't considered
 *   complete until its paired custom_* text passes validation.
 */
export function getNextQuestion(answers: QuizAnswers): QuizQuestion | null {
  if (!hasValidAnswer(answers.exam, answers.custom_exam)) {
    return { id: 'q1', field: 'exam', customField: 'custom_exam', options: Q1_OPTIONS };
  }
  if (!hasValidAnswer(answers.student_type, answers.custom_student_type)) {
    return { id: 'q2', field: 'student_type', customField: 'custom_student_type', options: q2Options(answers.exam) };
  }
  if (!hasValidAnswer(answers.fixed_commitment_type, answers.custom_fixed_commitment_type)) {
    const auto = q3AutoDefault(answers.student_type);
    if (auto !== undefined) {
      // Caller should apply this default and not render a question.
      return getNextQuestion({ ...answers, fixed_commitment_type: auto });
    }
    return {
      id: 'q3',
      field: 'fixed_commitment_type',
      customField: 'custom_fixed_commitment_type',
      options: Q3_OPTIONS,
    };
  }
  if (!hasValidAnswer(answers.focus_time, answers.custom_focus_time)) {
    return { id: 'q4', field: 'focus_time', customField: 'custom_focus_time', options: Q4_OPTIONS };
  }
  if (!hasValidAnswer(answers.daily_hours, answers.custom_daily_hours)) {
    return { id: 'q5', field: 'daily_hours', customField: 'custom_daily_hours', options: Q5_OPTIONS };
  }
  if (!hasValidAnswer(answers.distractions, answers.custom_distraction)) {
    return {
      id: 'q6',
      field: 'distractions',
      customField: 'custom_distraction',
      multiSelect: true,
      options: Q6_OPTIONS,
    };
  }
  const distractionsIsExactlyNothing =
    answers.distractions!.length === 1 && answers.distractions![0] === 'nothing';
  if (distractionsIsExactlyNothing && !hasValidAnswer(answers.block_social_anyway, answers.custom_block_social_anyway)) {
    return {
      id: 'q6b',
      field: 'block_social_anyway',
      customField: 'custom_block_social_anyway',
      options: Q6B_OPTIONS,
    };
  }
  if (!hasValidAnswer(answers.study_mode, answers.custom_study_mode)) {
    return { id: 'q7', field: 'study_mode', customField: 'custom_study_mode', options: Q7_OPTIONS };
  }
  return null;
}

export function isQuizComplete(answers: QuizAnswers): boolean {
  return getNextQuestion(answers) === null;
}

/** Number of questions actually presented to (and answered by) this student, for the coin calc. */
export function answeredQuestionCount(answers: QuizAnswers): number {
  let count = 0;
  if (hasValidAnswer(answers.exam, answers.custom_exam)) count++;
  if (hasValidAnswer(answers.student_type, answers.custom_student_type)) count++;
  // Q3 only counts if it wasn't auto-defaulted, i.e. the student wasn't dropper/appeared.
  if (
    hasValidAnswer(answers.fixed_commitment_type, answers.custom_fixed_commitment_type) &&
    q3AutoDefault(answers.student_type) === undefined
  ) {
    count++;
  }
  if (hasValidAnswer(answers.focus_time, answers.custom_focus_time)) count++;
  if (hasValidAnswer(answers.daily_hours, answers.custom_daily_hours)) count++;
  if (hasValidAnswer(answers.distractions, answers.custom_distraction)) count++;
  if (hasValidAnswer(answers.block_social_anyway, answers.custom_block_social_anyway)) count++;
  if (hasValidAnswer(answers.study_mode, answers.custom_study_mode)) count++;
  return count;
}

// ── Wynkoins reward (spec: 5/question + 50 completion + 30 first-time) ──
export function calculateQuizReward(answers: QuizAnswers, isFirstTimeCompletion: boolean): number {
  const perQuestion = answeredQuestionCount(answers) * 5;
  const completionBonus = isQuizComplete(answers) ? 50 : 0;
  const firstTimeBonus = isFirstTimeCompletion && isQuizComplete(answers) ? 30 : 0;
  return perQuestion + completionBonus + firstTimeBonus;
}

// ── Archetype scoring (Section 3) ────────────────────────────────
export type Archetype =
  | 'Dawn Warrior' | 'Night Owl' | 'Sprinter' | 'Marathoner'
  | 'Visual Learner' | 'Social Battler' | 'Grind Machine' | 'Balanced Planner';

const SOCIAL_DISTRACTIONS: Distraction[] = ['instagram', 'whatsapp'];

export function scoreArchetype(answers: QuizAnswers): Archetype {
  const heavySocial =
    (answers.distractions?.filter((d) => SOCIAL_DISTRACTIONS.includes(d)).length ?? 0) >= 2 ||
    (answers.distractions?.includes('instagram') && answers.distractions.length >= 3);

  if (heavySocial) return 'Social Battler';
  if (answers.study_mode === 'youtube') return 'Visual Learner';
  if (
    answers.study_mode === 'problems' &&
    answers.student_type === 'dropper' &&
    (answers.focus_time === 'before_7am' || answers.focus_time === 'morning')
  ) {
    return 'Grind Machine';
  }
  if (answers.focus_time === 'before_7am') return 'Dawn Warrior';
  if (answers.focus_time === 'after_9pm') return 'Night Owl';
  if (answers.study_mode === 'problems' && (answers.daily_hours === '2-3' || answers.daily_hours === '4-5')) {
    return 'Sprinter';
  }
  if (answers.focus_time === 'morning' && (answers.daily_hours === '8-9' || answers.daily_hours === '10+')) {
    return 'Marathoner';
  }
  return 'Balanced Planner';
}

// ── Block length for the generator (documented assumption, see header) ──
const BLOCK_LENGTH_BY_HOURS: Partial<Record<DailyHoursBucket, number>> = {
  '2-3': 25,
  '4-5': 45,
  '6-7': 60,
  '8-9': 90,
  '10+': 120,
};

export function blockLengthMinutesFor(answers: QuizAnswers): number {
  const bucket = answers.daily_hours;
  if (bucket && bucket in BLOCK_LENGTH_BY_HOURS) return BLOCK_LENGTH_BY_HOURS[bucket]!;
  return 45; // default, also covers the 'custom' bucket (no known duration to map to)
}

// ── Username generation (Section 3: [FocusWord][ArchetypeWord] + 2 digits) ──
// Only defined for the 5 preset focus-time buckets; a 'custom' Q4 answer
// falls back to a neutral word (see resolveTimeWord) rather than crashing.
const TIME_WORD: Record<Exclude<FocusTime, typeof CUSTOM_VALUE>, string> = {
  before_7am: 'Dawn',
  morning: 'Solar',
  afternoon: 'Noon',
  evening: 'Dusk',
  after_9pm: 'Night',
};

function resolveTimeWord(focusTime: FocusTime): string {
  return focusTime === CUSTOM_VALUE ? 'Study' : TIME_WORD[focusTime];
}

// Primary + fallback word per archetype, for the "swap word" step of the
// spec's collision-resolution order (swap number -> swap word -> manual).
const ARCHETYPE_WORDS: Record<Archetype, [string, string]> = {
  'Dawn Warrior': ['Warrior', 'Guardian'],
  'Night Owl': ['Owl', 'Watcher'],
  Sprinter: ['Sprinter', 'Racer'],
  Marathoner: ['Runner', 'Marathoner'],
  'Visual Learner': ['Viewer', 'Watcher'],
  'Social Battler': ['Battler', 'Fighter'],
  'Grind Machine': ['Grinder', 'Machine'],
  'Balanced Planner': ['Planner', 'Balancer'],
};

const USERNAME_MAX_LEN = 20; // matches the DB check: 1 + up to 18 + 1

function randomTwoDigit(): string {
  return String(10 + Math.floor(Math.random() * 90));
}

function buildCandidate(timeWord: string, archetypeWord: string, digits: string): string {
  const base = `${timeWord}${archetypeWord}`.slice(0, USERNAME_MAX_LEN - digits.length);
  return `${base}${digits}`;
}

export interface UsernameGenOptions {
  /** Async check against the DB / existing usernames. Returns true if taken. */
  isTaken: (candidate: string) => Promise<boolean>;
  /** Optional extra blocklist substrings (case-insensitive), on top of a screened word pool. */
  blocklist?: string[];
  maxAttemptsPerWord?: number; // default 5, spec: "swap number" a few times before giving up on a word
}

/**
 * Returns a generated username, or null if both word/number swaps were
 * exhausted (per spec: "If taken: swap number → swap word → manual input" -
 * the caller should fall through to manual input in that case).
 */
export async function generateUsername(
  focusTime: FocusTime,
  archetype: Archetype,
  opts: UsernameGenOptions
): Promise<string | null> {
  const timeWord = resolveTimeWord(focusTime);
  const [primaryWord, fallbackWord] = ARCHETYPE_WORDS[archetype];
  const maxAttempts = opts.maxAttemptsPerWord ?? 5;
  const blocklist = (opts.blocklist ?? []).map((w) => w.toLowerCase());

  const isBlocked = (candidate: string) => blocklist.some((w) => candidate.toLowerCase().includes(w));

  for (const word of [primaryWord, fallbackWord]) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = buildCandidate(timeWord, word, randomTwoDigit());
      if (isBlocked(candidate)) continue;
      // eslint-disable-next-line no-await-in-loop
      const taken = await opts.isTaken(candidate);
      if (!taken) return candidate;
    }
  }
  return null; // caller falls through to manual input
}
