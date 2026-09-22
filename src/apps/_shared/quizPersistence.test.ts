import { describe, it, expect, vi } from 'vitest';
import { completeQuiz, type QuizSupabaseClient } from './quizPersistence';
import type { QuizAnswers } from './quizEngine';

const COMPLETE_ANSWERS: QuizAnswers = {
  exam: 'JEE',
  student_type: '12th',
  fixed_commitment_type: 'school_and_coaching',
  focus_time: 'after_9pm',
  daily_hours: '6-7',
  distractions: ['instagram'],
  study_mode: 'books',
};

function mockSupabase(opts: {
  usernameTakenAlways?: boolean;
  rpcImpl?: QuizSupabaseClient['rpc'];
}): QuizSupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ count: opts.usernameTakenAlways ? 1 : 0, error: null }),
      }),
    }),
    rpc: opts.rpcImpl ?? (async () => ({
      data: { archetype: 'Night Owl', username: 'nightowl42', coins_awarded: 115, is_first_time: true },
      error: null,
    })),
  };
}

describe('completeQuiz', () => {
  it('happy path: generates a username, calls the RPC, returns coin/first-time info', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { archetype: 'Night Owl', username: 'nightowl42', coins_awarded: 115, is_first_time: true },
      error: null,
    });
    const supabase = mockSupabase({ rpcImpl: rpc });

    const result = await completeQuiz(supabase, COMPLETE_ANSWERS);

    expect(result.archetype).toBe('Night Owl');
    expect(result.coinsAwarded).toBe(115);
    expect(result.isFirstTime).toBe(true);
    expect(result.storedUsername).toBe('nightowl42');
    expect(result.displayUsername).not.toBeNull();

    // The RPC was called with a lowercase username and the raw answers/archetype.
    expect(rpc).toHaveBeenCalledWith(
      'rpc_complete_quiz',
      expect.objectContaining({
        p_archetype: 'Night Owl',
        p_quiz_answers: COMPLETE_ANSWERS,
        p_username: expect.stringMatching(/^[a-z0-9]+$/),
      })
    );
  });

  it('retakes (isFirstTime=false) still return successfully with zero coins', async () => {
    const supabase = mockSupabase({
      rpcImpl: async () => ({
        data: { archetype: 'Balanced Planner', username: 'existinguser', coins_awarded: 0, is_first_time: false },
        error: null,
      }),
    });
    const result = await completeQuiz(supabase, COMPLETE_ANSWERS);
    expect(result.coinsAwarded).toBe(0);
    expect(result.isFirstTime).toBe(false);
  });

  it('retries once with no username on a username_taken race, and succeeds', async () => {
    let callCount = 0;
    const rpc = vi.fn().mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
      callCount++;
      if (callCount === 1) {
        expect(args.p_username).not.toBeNull();
        return { data: null, error: { message: 'username_taken' } };
      }
      expect(args.p_username).toBeNull(); // retry drops the username
      return {
        data: { archetype: 'Night Owl', username: null, coins_awarded: 115, is_first_time: true },
        error: null,
      };
    });
    const supabase = mockSupabase({ rpcImpl: rpc });

    const result = await completeQuiz(supabase, COMPLETE_ANSWERS);
    expect(callCount).toBe(2);
    expect(result.storedUsername).toBeNull();
    expect(result.displayUsername).toBeNull();
    expect(result.coinsAwarded).toBe(115);
  });

  it('throws on a non-username-collision RPC error instead of silently swallowing it', async () => {
    const supabase = mockSupabase({
      rpcImpl: async () => ({ data: null, error: { message: 'Quiz answers are incomplete' } }),
    });
    await expect(completeQuiz(supabase, COMPLETE_ANSWERS)).rejects.toThrow('Quiz answers are incomplete');
  });

  it('when every generated username candidate is taken, sends p_username: null to the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { archetype: 'Night Owl', username: null, coins_awarded: 115, is_first_time: true },
      error: null,
    });
    const supabase = mockSupabase({ usernameTakenAlways: true, rpcImpl: rpc });

    await completeQuiz(supabase, COMPLETE_ANSWERS);
    expect(rpc).toHaveBeenCalledWith('rpc_complete_quiz', expect.objectContaining({ p_username: null }));
  });
});
