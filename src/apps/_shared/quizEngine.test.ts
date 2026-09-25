import { describe, it, expect, vi } from 'vitest';
import {
  QUESTIONS,
  MAX_QUIZ_COINS,
  CUSTOM_ANSWER_MAX_LENGTH,
  getNextQuestion,
  isQuizComplete,
  answeredQuestionCount,
  calculateQuizReward,
  scoreArchetype,
  generateUsername,
  validateCustomAnswer,
  questionNumber,
  usernameProblem,
  cleanUsernameInput,
  usernameFromName,
  type QuizAnswers,
} from './quizEngine';

const FULL: QuizAnswers = {
  day_type: 'school_coaching',
  daily_hours: '2-4',
  distractions: ['instagram'],
  study_style: ['books'],
  challenges: ['revision'],
};

describe('the 5 questions', () => {
  it('asks q1..q5 in order', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    let answers: QuizAnswers = {};
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const q = getNextQuestion(answers);
      if (!q) break;
      seen.push(q.id);
      answers = { ...answers, [q.field]: q.multiSelect ? [q.options[0].value] : q.options[0].value };
    }
    expect(seen).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(isQuizComplete(answers)).toBe(true);
  });

  it('every question has 4 choices plus "Something else" last', () => {
    for (const q of QUESTIONS) {
      expect(q.options).toHaveLength(5);
      expect(q.options[4].value).toBe('custom');
    }
  });

  it('Q3 is multi-select with no limit; Q4 and Q5 allow up to 2', () => {
    const [, , q3, q4, q5] = QUESTIONS;
    expect(q3.multiSelect).toBe(true);
    expect(q3.maxSelect).toBeUndefined();
    expect(q4.maxSelect).toBe(2);
    expect(q5.maxSelect).toBe(2);
    expect(QUESTIONS[0].multiSelect).toBeFalsy();
    expect(QUESTIONS[1].multiSelect).toBeFalsy();
  });

  it('more than 2 picks on Q4 is not a valid answer', () => {
    const q = getNextQuestion({ day_type: 'working', daily_hours: '1-2', distractions: ['youtube'], study_style: ['videos', 'books', 'practice'] });
    expect(q?.id).toBe('q4');
  });

  it('questionNumber is 1-5', () => {
    expect(QUESTIONS.map((q) => questionNumber(q.id))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('custom free-text answers', () => {
  it('"Something else" without text does not advance', () => {
    expect(getNextQuestion({ day_type: 'custom' })?.id).toBe('q1');
  });

  it('"Something else" with text advances', () => {
    expect(getNextQuestion({ day_type: 'custom', custom_day_type: 'Night shifts + self study' })?.id).toBe('q2');
  });

  it('a multi-select with "Something else" needs the text too', () => {
    const base: QuizAnswers = { day_type: 'working', daily_hours: '4-6' };
    expect(getNextQuestion({ ...base, distractions: ['instagram', 'custom'] })?.id).toBe('q3');
    expect(getNextQuestion({ ...base, distractions: ['instagram', 'custom'], custom_distraction: 'Cricket' })?.id).toBe('q4');
  });

  it('validateCustomAnswer enforces the character limit', () => {
    expect(validateCustomAnswer('GATE').valid).toBe(true);
    expect(validateCustomAnswer('   ').valid).toBe(false);
    expect(validateCustomAnswer('x'.repeat(CUSTOM_ANSWER_MAX_LENGTH)).valid).toBe(true);
    expect(validateCustomAnswer('x'.repeat(CUSTOM_ANSWER_MAX_LENGTH + 1)).valid).toBe(false);
  });
});

describe('coins: +10 per answer, nothing else (50 max)', () => {
  it('all 5 answered, first time = 50', () => {
    expect(answeredQuestionCount(FULL)).toBe(5);
    expect(calculateQuizReward(FULL, true)).toBe(50);
    expect(MAX_QUIZ_COINS).toBe(50);
  });

  it('skipped questions earn nothing and there is no finishing bonus', () => {
    const answers: QuizAnswers = { day_type: 'working', daily_hours: '4-6', skipped: ['q3', 'q4', 'q5'] };
    expect(getNextQuestion(answers)).toBeNull();
    expect(calculateQuizReward(answers, true)).toBe(20);
  });

  it('skipping everything earns 0', () => {
    const answers: QuizAnswers = { skipped: ['q1', 'q2', 'q3', 'q4', 'q5'] };
    expect(getNextQuestion(answers)).toBeNull();
    expect(calculateQuizReward(answers, true)).toBe(0);
  });

  it('re-taking the quiz earns nothing', () => {
    expect(calculateQuizReward(FULL, false)).toBe(0);
  });
});

describe('skipping questions', () => {
  it('a skipped question moves on to the next one', () => {
    expect(getNextQuestion({ skipped: ['q1'] })?.id).toBe('q2');
    expect(getNextQuestion({ day_type: 'working', skipped: ['q2', 'q3'] })?.id).toBe('q4');
  });
});

describe('scoreArchetype (Study DNA)', () => {
  it('2+ social apps -> Social Battler', () => {
    expect(scoreArchetype({ ...FULL, distractions: ['instagram', 'whatsapp'] })).toBe('Social Battler');
  });
  it('6-8 hours + practice -> Grind Machine; 6-8 hours otherwise -> Marathoner', () => {
    expect(scoreArchetype({ ...FULL, daily_hours: '6-8', study_style: ['practice'] })).toBe('Grind Machine');
    expect(scoreArchetype({ ...FULL, daily_hours: '6-8' })).toBe('Marathoner');
  });
  it('procrastination or consistency trouble -> Focus Seeker', () => {
    expect(scoreArchetype({ ...FULL, distractions: ['procrastination'] })).toBe('Focus Seeker');
    expect(scoreArchetype({ ...FULL, challenges: ['consistency'] })).toBe('Focus Seeker');
  });
  it('study style decides the rest', () => {
    expect(scoreArchetype({ ...FULL, study_style: ['friends'] })).toBe('Team Player');
    expect(scoreArchetype({ ...FULL, study_style: ['videos'] })).toBe('Visual Learner');
    expect(scoreArchetype(FULL)).toBe('Deep Reader');
    expect(scoreArchetype({ ...FULL, study_style: ['practice'] })).toBe('Sprinter');
  });
  it('nothing to go on -> Balanced Planner', () => {
    expect(scoreArchetype({})).toBe('Balanced Planner');
    expect(scoreArchetype({ skipped: ['q1', 'q2', 'q3', 'q4', 'q5'] })).toBe('Balanced Planner');
  });
});

describe('generateUsername', () => {
  it('builds <Archetype><digits> and returns the first free one', async () => {
    const isTaken = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const u = await generateUsername('Focus Seeker', { isTaken });
    expect(u).toMatch(/^FocusSeeker\d{2}$/);
    expect(isTaken).toHaveBeenCalledTimes(2);
  });

  it('falls back to 3 digits, then gives up with null', async () => {
    const calls: string[] = [];
    const u = await generateUsername('Balanced Planner', { isTaken: async (c) => { calls.push(c); return true; }, maxAttempts: 2 });
    expect(u).toBeNull();
    expect(calls.map((c) => c.replace('BalancedPlanner', '').length)).toEqual([2, 2, 3, 3]);
  });

  it('every archetype makes a valid username once lowercased', async () => {
    for (const a of ['Social Battler', 'Grind Machine', 'Marathoner', 'Focus Seeker', 'Team Player', 'Visual Learner', 'Deep Reader', 'Sprinter', 'Balanced Planner'] as const) {
      const u = await generateUsername(a, { isTaken: async () => false });
      expect(usernameProblem(u!.toLowerCase())).toBeNull();
    }
  });
});

describe('username helpers', () => {
  it('usernameProblem matches the database rules', () => {
    expect(usernameProblem('focusseeker42')).toBeNull();
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
      expect(usernameProblem(usernameFromName(name))).toBeNull();
    }
    expect(usernameFromName('Rohan Mehta')).toMatch(/^rohan\d{3}$/);
    expect(usernameFromName('')).toMatch(/^wynko\d{4}$/);
  });
});
