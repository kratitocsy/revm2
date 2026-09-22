import { describe, it, expect, vi } from 'vitest';
import {
  getNextQuestion,
  isQuizComplete,
  answeredQuestionCount,
  calculateQuizReward,
  scoreArchetype,
  blockLengthMinutesFor,
  generateUsername,
  q3AutoDefault,
  validateCustomAnswer,
  CUSTOM_ANSWER_MAX_LENGTH,
  type QuizAnswers,
} from './quizEngine';

describe('getNextQuestion branching', () => {
  it('starts at q1 (exam) on an empty quiz', () => {
    expect(getNextQuestion({})?.id).toBe('q1');
  });

  it('asks q2 with JEE/NEET-style options after exam is set', () => {
    const q = getNextQuestion({ exam: 'JEE' });
    expect(q?.id).toBe('q2');
    expect(q?.options.map((o) => o.value)).toContain('dropper');
  });

  it('asks q2 with UPSC-specific options for UPSC, plus the custom chip', () => {
    const q = getNextQuestion({ exam: 'UPSC' });
    expect(q?.options.map((o) => o.value)).toEqual(['upsc_1st', 'upsc_2nd', 'upsc_3rd_plus', 'custom']);
  });

  it('skips q3 for dropper and auto-defaults to coaching_only', () => {
    const q = getNextQuestion({ exam: 'JEE', student_type: 'dropper' });
    // Should skip straight past q3 to q4.
    expect(q?.id).toBe('q4');
  });

  it('q3AutoDefault matches the spec: dropper -> coaching_only, appeared -> self_study', () => {
    expect(q3AutoDefault('dropper')).toBe('coaching_only');
    expect(q3AutoDefault('appeared')).toBe('full_self_study');
    expect(q3AutoDefault('12th')).toBeUndefined();
  });

  it('does NOT skip q3 for 12th', () => {
    const q = getNextQuestion({ exam: 'JEE', student_type: '12th' });
    expect(q?.id).toBe('q3');
  });

  it('asks q6b only when distractions is exactly ["nothing"]', () => {
    const base: QuizAnswers = {
      exam: 'JEE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
    };
    const withNothing = getNextQuestion({ ...base, distractions: ['nothing'] });
    expect(withNothing?.id).toBe('q6b');

    const withMultiple = getNextQuestion({ ...base, distractions: ['instagram', 'youtube'] });
    expect(withMultiple?.id).toBe('q7'); // skips q6b straight to q7
  });

  it('reaches null (complete) after all required fields are set', () => {
    const answers: QuizAnswers = {
      exam: 'JEE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
      distractions: ['instagram'],
      study_mode: 'mix',
    };
    expect(getNextQuestion(answers)).toBeNull();
    expect(isQuizComplete(answers)).toBe(true);
  });
});

describe('custom free-text answers', () => {
  it('every question includes the "custom" chip as its last option', () => {
    const seenIds = new Set<string>();
    let answers: QuizAnswers = {};
    for (let i = 0; i < 10; i++) {
      const q = getNextQuestion(answers);
      if (!q || seenIds.has(q.id)) break;
      seenIds.add(q.id);
      expect(q.options[q.options.length - 1].value).toBe('custom');
      // Answer with the first real (non-custom) option to advance.
      const realOption = q.options[0];
      answers = { ...answers, [q.field]: q.multiSelect ? [realOption.value] : realOption.value };
    }
    expect(seenIds.size).toBeGreaterThan(0);
  });

  it('picking "custom" without valid text does NOT advance past the question', () => {
    const q = getNextQuestion({ exam: 'custom' });
    expect(q?.id).toBe('q1'); // still stuck on q1 - custom_exam is missing
  });

  it('picking "custom" with valid text advances to the next question', () => {
    const q = getNextQuestion({ exam: 'custom', custom_exam: 'GATE' });
    expect(q?.id).toBe('q2');
  });

  it('validateCustomAnswer enforces the character limit', () => {
    expect(validateCustomAnswer('GATE').valid).toBe(true);
    expect(validateCustomAnswer('   ').valid).toBe(false); // empty after trim
    expect(validateCustomAnswer('x'.repeat(CUSTOM_ANSWER_MAX_LENGTH)).valid).toBe(true);
    expect(validateCustomAnswer('x'.repeat(CUSTOM_ANSWER_MAX_LENGTH + 1)).valid).toBe(false);
  });

  it('custom distraction text gates completion the same way as a custom single-select', () => {
    const base: QuizAnswers = {
      exam: 'JEE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
      study_mode: 'mix',
    };
    const stuck = getNextQuestion({ ...base, distractions: ['custom'] });
    expect(stuck?.id).toBe('q6'); // no custom_distraction text yet

    const unstuck = getNextQuestion({ ...base, distractions: ['custom'], custom_distraction: 'Reddit doomscrolling' });
    expect(unstuck).toBeNull(); // now complete
  });

  it('a custom exam still falls through q2Options to the JEE/NEET fallback set without crashing', () => {
    const q = getNextQuestion({ exam: 'custom', custom_exam: 'GATE' });
    expect(q?.options.map((o) => o.value)).toContain('dropper');
  });

  it('custom answers count toward the coin reward once validated', () => {
    const answers: QuizAnswers = {
      exam: 'custom',
      custom_exam: 'GATE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
      distractions: ['instagram'],
      study_mode: 'mix',
    };
    expect(answeredQuestionCount(answers)).toBe(7);
    expect(isQuizComplete(answers)).toBe(true);
  });
});

describe('answeredQuestionCount + coin reward', () => {
  it('full first-time completion (7 real questions, no q3 skip) = 115 coins, matching the spec max', () => {
    const answers: QuizAnswers = {
      exam: 'JEE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
      distractions: ['instagram'],
      study_mode: 'mix',
    };
    expect(answeredQuestionCount(answers)).toBe(7);
    expect(calculateQuizReward(answers, true)).toBe(7 * 5 + 50 + 30); // 115
  });

  it('dropper skips q3, so only 6 questions counted (auto-default not counted)', () => {
    const answers: QuizAnswers = {
      exam: 'JEE',
      student_type: 'dropper',
      fixed_commitment_type: 'coaching_only', // auto-defaulted, not user-answered
      focus_time: 'before_7am',
      daily_hours: '10+',
      distractions: ['nothing'],
      block_social_anyway: true,
      study_mode: 'problems',
    };
    expect(answeredQuestionCount(answers)).toBe(7); // q1,q2,q4,q5,q6,q6b,q7 (q3 excluded)
    expect(isQuizComplete(answers)).toBe(true);
  });

  it('re-taking the quiz (isFirstTimeCompletion=false) gets no first-time bonus', () => {
    const answers: QuizAnswers = {
      exam: 'JEE',
      student_type: '12th',
      fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning',
      daily_hours: '4-5',
      distractions: ['instagram'],
      study_mode: 'mix',
    };
    expect(calculateQuizReward(answers, false)).toBe(7 * 5 + 50); // 85, no +30
  });

  it('incomplete quiz gets no completion or first-time bonus, only per-question coins', () => {
    const answers: QuizAnswers = { exam: 'JEE', student_type: '12th' };
    expect(calculateQuizReward(answers, true)).toBe(2 * 5); // 10
  });
});

describe('scoreArchetype', () => {
  it('heavy social distractions -> Social Battler', () => {
    expect(
      scoreArchetype({ distractions: ['instagram', 'whatsapp'], study_mode: 'mix' })
    ).toBe('Social Battler');
  });

  it('youtube study mode -> Visual Learner (when not overridden by heavy social)', () => {
    expect(scoreArchetype({ study_mode: 'youtube', distractions: ['games'] })).toBe('Visual Learner');
  });

  it('dropper + problems + early focus time -> Grind Machine', () => {
    expect(
      scoreArchetype({
        student_type: 'dropper',
        study_mode: 'problems',
        focus_time: 'before_7am',
        distractions: [],
      })
    ).toBe('Grind Machine');
  });

  it('before_7am alone (not dropper/problems) -> Dawn Warrior', () => {
    expect(scoreArchetype({ focus_time: 'before_7am', study_mode: 'books', distractions: [] })).toBe(
      'Dawn Warrior'
    );
  });

  it('after_9pm -> Night Owl', () => {
    expect(scoreArchetype({ focus_time: 'after_9pm', study_mode: 'books', distractions: [] })).toBe(
      'Night Owl'
    );
  });

  it('short daily hours + problems -> Sprinter', () => {
    expect(
      scoreArchetype({ study_mode: 'problems', daily_hours: '2-3', focus_time: 'afternoon', distractions: [] })
    ).toBe('Sprinter');
  });

  it('morning + long daily hours -> Marathoner', () => {
    expect(
      scoreArchetype({ focus_time: 'morning', daily_hours: '10+', study_mode: 'books', distractions: [] })
    ).toBe('Marathoner');
  });

  it('falls back to Balanced Planner when nothing else matches', () => {
    expect(
      scoreArchetype({ focus_time: 'afternoon', daily_hours: '4-5', study_mode: 'mix', distractions: [] })
    ).toBe('Balanced Planner');
  });
});

describe('blockLengthMinutesFor', () => {
  it('maps daily hours buckets to a representative session length', () => {
    expect(blockLengthMinutesFor({ daily_hours: '2-3' })).toBe(25);
    expect(blockLengthMinutesFor({ daily_hours: '10+' })).toBe(120);
  });

  it('defaults to 45 when daily_hours is unset', () => {
    expect(blockLengthMinutesFor({})).toBe(45);
  });
});

describe('generateUsername', () => {
  it('produces a format-valid username on the first attempt when nothing is taken', async () => {
    const isTaken = vi.fn().mockResolvedValue(false);
    const name = await generateUsername('after_9pm', 'Night Owl', { isTaken });
    expect(name).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$/); // matches user_profiles.username check
    expect(name).toMatch(/^Night/);
    expect(isTaken).toHaveBeenCalledTimes(1);
  });

  it('swaps to the fallback word after exhausting number attempts on the primary word', async () => {
    let calls = 0;
    const isTaken = vi.fn().mockImplementation(async (candidate: string) => {
      calls++;
      return !candidate.includes('Guardian'); // only the fallback word succeeds
    });
    const name = await generateUsername('before_7am', 'Dawn Warrior', { isTaken, maxAttemptsPerWord: 3 });
    expect(name).toContain('Guardian');
    expect(calls).toBe(4); // 3 failed attempts on "Warrior" + 1 success on "Guardian"
  });

  it('returns null when both words are exhausted (caller should fall back to manual input)', async () => {
    const isTaken = vi.fn().mockResolvedValue(true);
    const name = await generateUsername('morning', 'Sprinter', { isTaken, maxAttemptsPerWord: 2 });
    expect(name).toBeNull();
  });

  it('respects the blocklist and never calls isTaken with a blocked candidate', async () => {
    const isTaken = vi.fn().mockResolvedValue(false);
    const name = await generateUsername('evening', 'Grind Machine', {
      isTaken,
      blocklist: ['dusk'], // blocks the entire "Dusk..." time-word family for this test
      maxAttemptsPerWord: 3,
    });
    // Every candidate contains "Dusk" (evening's time word) so all attempts
    // should be blocked before ever reaching isTaken, exhausting to null.
    expect(name).toBeNull();
    expect(isTaken).not.toHaveBeenCalled();
  });
});
