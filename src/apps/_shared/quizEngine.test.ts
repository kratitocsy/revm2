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
  questionNumber,
  usernameProblem,
  cleanUsernameInput,
  usernameFromName,
  CUSTOM_ANSWER_MAX_LENGTH,
  MAX_QUIZ_COINS,
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

describe('answeredQuestionCount + coin reward (+10 per answer, +30 finish, 100 max)', () => {
  const full: QuizAnswers = {
    exam: 'JEE',
    student_type: '12th',
    fixed_commitment_type: 'school_and_coaching',
    focus_time: 'morning',
    daily_hours: '4-5',
    distractions: ['instagram'],
    study_mode: 'mix',
  };

  it('all 7 answered, first time = 100 coins', () => {
    expect(answeredQuestionCount(full)).toBe(7);
    expect(calculateQuizReward(full, true)).toBe(7 * 10 + 30);
    expect(calculateQuizReward(full, true)).toBe(MAX_QUIZ_COINS);
  });

  it("dropper: Q3's automatic answer counts, the Q6 follow-up doesn't - still 7, still 100", () => {
    const answers: QuizAnswers = {
      exam: 'JEE',
      student_type: 'dropper',
      fixed_commitment_type: 'coaching_only', // auto-defaulted
      focus_time: 'before_7am',
      daily_hours: '10+',
      distractions: ['nothing'],
      block_social_anyway: true,
      study_mode: 'problems',
    };
    expect(answeredQuestionCount(answers)).toBe(7);
    expect(calculateQuizReward(answers, true)).toBe(100);
  });

  it('re-taking the quiz earns nothing', () => {
    expect(calculateQuizReward(full, false)).toBe(0);
  });

  it('skipped questions earn nothing, finishing still earns +30', () => {
    const answers: QuizAnswers = { exam: 'JEE', student_type: '12th', skipped: ['q3', 'q4', 'q5', 'q6', 'q7'] };
    expect(getNextQuestion(answers)).toBeNull();
    expect(answeredQuestionCount(answers)).toBe(2);
    expect(calculateQuizReward(answers, true)).toBe(2 * 10 + 30);
  });

  it('questionNumber folds the Q6 follow-up into question 6', () => {
    expect(questionNumber('q1')).toBe(1);
    expect(questionNumber('q6b')).toBe(6);
    expect(questionNumber('q7')).toBe(7);
  });
});

describe('skipping questions', () => {
  it('skipping q1 moves on to q2 with the default (JEE/NEET) options', () => {
    const q = getNextQuestion({ skipped: ['q1'] });
    expect(q?.id).toBe('q2');
    expect(q?.options.map((o) => o.value)).toContain('dropper');
  });

  it('skipping q6 never asks the q6b follow-up', () => {
    const q = getNextQuestion({
      exam: 'JEE', student_type: '12th', fixed_commitment_type: 'school_and_coaching',
      focus_time: 'morning', daily_hours: '4-5', skipped: ['q6'],
    });
    expect(q?.id).toBe('q7');
  });

  it('skipping every question ends the quiz with 0 answers', () => {
    const answers: QuizAnswers = { skipped: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] };
    expect(getNextQuestion(answers)).toBeNull();
    expect(answeredQuestionCount(answers)).toBe(0);
  });
});

describe('username helpers', () => {
  it('usernameProblem matches the database rules', () => {
    expect(usernameProblem('nightowl83')).toBeNull();
    expect(usernameProblem('ab')).not.toBeNull();
    expect(usernameProblem('a'.repeat(21))).not.toBeNull();
    expect(usernameProblem('_rohan')).not.toBeNull();
    expect(usernameProblem('rohan_')).not.toBeNull();
    expect(usernameProblem('Rohan')).not.toBeNull();
    expect(usernameProblem('ro_han')).toBeNull();
  });

  it('cleanUsernameInput lowercases and drops characters usernames cannot have', () => {
    expect(cleanUsernameInput('Rohan Mehta!')).toBe('rohanmehta');
    expect(cleanUsernameInput('x'.repeat(30))).toHaveLength(20);
  });

  it('usernameFromName builds a valid username from a first name, or falls back to wynko', () => {
    for (const name of ['Rohan Mehta', 'ANU SINGH', '', 'विंकी', 'Jo']) {
      const u = usernameFromName(name);
      expect(usernameProblem(u)).toBeNull();
    }
    expect(usernameFromName('Rohan Mehta')).toMatch(/^rohan\d{3}$/);
    expect(usernameFromName('')).toMatch(/^wynko\d{4}$/);
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
