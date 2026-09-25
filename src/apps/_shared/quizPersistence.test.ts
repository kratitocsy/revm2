import { describe, it, expect, vi } from 'vitest';
import { checkUsername, finishOnboarding, submitStudyDna, suggestUsername, type QuizSupabaseClient } from './quizPersistence';
import type { QuizAnswers } from './quizEngine';

const ANSWERS: QuizAnswers = {
  exam: 'JEE',
  student_type: '12th',
  fixed_commitment_type: 'school_and_coaching',
  focus_time: 'after_9pm',
  daily_hours: '6-7',
  distractions: ['instagram'],
  study_mode: 'books',
};

function client(rpc: QuizSupabaseClient['rpc']): QuizSupabaseClient {
  return { rpc };
}

describe('submitStudyDna', () => {
  it('sends the answers with the scored archetype and returns the server-side reward', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { archetype: 'Night Owl', answered: 7, coins_awarded: 100, is_first_time: true, balance: 100 },
      error: null,
    });
    const r = await submitStudyDna(client(rpc), ANSWERS);
    expect(rpc).toHaveBeenCalledWith('rpc_submit_study_dna', { p_quiz_answers: ANSWERS, p_archetype: 'Night Owl' });
    expect(r).toEqual({ archetype: 'Night Owl', answered: 7, coinsAwarded: 100, isFirstTime: true, balance: 100 });
  });

  it('throws the server error message', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'The Study DNA quiz was skipped for this account' } });
    await expect(submitStudyDna(client(rpc), ANSWERS)).rejects.toThrow('skipped');
  });
});

describe('checkUsername', () => {
  it('rejects a badly formed username without asking the server', async () => {
    const rpc = vi.fn();
    const r = await checkUsername(client(rpc), '_x');
    expect(r.available).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks the server whether a well-formed username is free', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { username: 'nightowl42', available: true, message: null }, error: null });
    const r = await checkUsername(client(rpc), 'nightowl42');
    expect(rpc).toHaveBeenCalledWith('rpc_check_username', { p_username: 'nightowl42' });
    expect(r.available).toBe(true);
  });
});

describe('suggestUsername', () => {
  it('suggests a lowercase Study DNA username for quiz finishers', async () => {
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => ({
      data: { username: args.p_username, available: true, message: null }, error: null,
    }));
    const u = await suggestUsername(client(rpc), { archetype: 'Night Owl', focusTime: 'after_9pm', name: 'Rohan' });
    expect(u).toMatch(/^nightowl\d{2}$/);
  });

  it('suggests a name-based username for people who skipped the quiz', async () => {
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => ({
      data: { username: args.p_username, available: true, message: null }, error: null,
    }));
    const u = await suggestUsername(client(rpc), { name: 'Rohan Mehta' });
    expect(u).toMatch(/^rohan\d{3}$/);
  });

  it('tries another candidate when the first one is taken', async () => {
    let calls = 0;
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
      calls++;
      return { data: { username: args.p_username, available: calls > 1, message: calls > 1 ? null : 'That username is already taken.' }, error: null };
    });
    const u = await suggestUsername(client(rpc), { name: 'Rohan' });
    expect(calls).toBe(2);
    expect(u).toMatch(/^rohan\d{3}$/);
  });
});

describe('finishOnboarding', () => {
  it('saves name, exam and username through the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { username: 'rohan347' }, error: null });
    const r = await finishOnboarding(client(rpc), { fullName: 'Rohan Mehta', exam: 'JEE', username: 'rohan347' });
    expect(rpc).toHaveBeenCalledWith('rpc_finish_onboarding', { p_full_name: 'Rohan Mehta', p_exam: 'JEE', p_username: 'rohan347' });
    expect(r.username).toBe('rohan347');
  });

  it('surfaces "already taken" from the server', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'That username is already taken.' } });
    await expect(finishOnboarding(client(rpc), { fullName: 'A', exam: 'JEE', username: 'taken1' })).rejects.toThrow('already taken');
  });
});
