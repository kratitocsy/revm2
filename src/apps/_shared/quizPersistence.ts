/* ============================================================
   quizPersistence.ts

   Wires quizEngine.ts (pure logic) to Supabase. This is the only
   file in the quiz stack that touches the network - kept thin on
   purpose so quizEngine's branching/scoring stays unit-testable
   without mocking Supabase.

   Flow: scoreArchetype -> generateUsername (client-side candidate
   generation + uniqueness probe) -> rpc_complete_quiz (server
   re-validates completeness, computes the coin reward itself, and
   is the only place coins actually get credited - see the
   migration's comments for why the reward isn't trusted from here).
*/

import {
  type QuizAnswers,
  type Archetype,
  scoreArchetype,
  generateUsername,
} from './quizEngine';

// Minimal shape of the Supabase client methods this module needs, so it
// doesn't have to import the full generated client type.
export interface QuizSupabaseClient {
  from(table: string): {
    select(columns: string, opts?: { count?: 'exact'; head?: boolean }): {
      eq(column: string, value: string): Promise<{ count: number | null; error: unknown }>;
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface CompleteQuizResult {
  archetype: Archetype;
  /** The mixed-case string for the result-screen typewriter reveal, e.g. "NightOwl83". Null if no username could be assigned. */
  displayUsername: string | null;
  /** What actually got stored (lowercase), or null. */
  storedUsername: string | null;
  coinsAwarded: number;
  isFirstTime: boolean;
}

function resolveFocusTimeForUsername(answers: QuizAnswers): Parameters<typeof generateUsername>[0] {
  // generateUsername already degrades 'custom' to a neutral word (see
  // resolveTimeWord in quizEngine.ts), so any value here is safe to pass
  // through as-is.
  return (answers.focus_time as Parameters<typeof generateUsername>[0]) ?? 'morning';
}

async function isUsernameTaken(supabase: QuizSupabaseClient, candidateLower: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', candidateLower);
  if (error) {
    // Fail closed on lookup errors - better to retry generation than to
    // risk a collision the DB's unique index would reject anyway.
    return true;
  }
  return (count ?? 0) > 0;
}

/**
 * Completes the quiz: scores the archetype, generates+claims a username
 * (if the account doesn't already have one), and persists everything via
 * rpc_complete_quiz. Coins are awarded server-side; see that RPC's
 * comments for the anti-farming guard.
 *
 * Caller should have already confirmed `isQuizComplete(answers)` before
 * calling this - the RPC will reject an incomplete payload regardless.
 */
export async function completeQuiz(
  supabase: QuizSupabaseClient,
  answers: QuizAnswers,
  opts?: { usernameBlocklist?: string[] }
): Promise<CompleteQuizResult> {
  const archetype = scoreArchetype(answers);
  const focusTime = resolveFocusTimeForUsername(answers);

  const displayUsername = await generateUsername(focusTime, archetype, {
    isTaken: (candidate) => isUsernameTaken(supabase, candidate.toLowerCase()),
    blocklist: opts?.usernameBlocklist,
  });
  const usernameToSend = displayUsername ? displayUsername.toLowerCase() : null;

  const { data, error } = await supabase.rpc('rpc_complete_quiz', {
    p_quiz_answers: answers,
    p_archetype: archetype,
    p_username: usernameToSend,
  });

  if (error) {
    if (error.message.includes('username_taken')) {
      // Rare race: someone else claimed it between our probe and the
      // write. Retry once without a username - the student keeps
      // whatever default they already had; a fresh username can be
      // generated again from the profile screen later.
      const { data: retryData, error: retryError } = await supabase.rpc('rpc_complete_quiz', {
        p_quiz_answers: answers,
        p_archetype: archetype,
        p_username: null,
      });
      if (retryError) throw new Error(retryError.message);
      const r = retryData as { archetype: Archetype; username: string | null; coins_awarded: number; is_first_time: boolean };
      return {
        archetype: r.archetype,
        displayUsername: null,
        storedUsername: r.username,
        coinsAwarded: r.coins_awarded,
        isFirstTime: r.is_first_time,
      };
    }
    throw new Error(error.message);
  }

  const result = data as { archetype: Archetype; username: string | null; coins_awarded: number; is_first_time: boolean };
  return {
    archetype: result.archetype,
    displayUsername: result.username ? displayUsername : null,
    storedUsername: result.username,
    coinsAwarded: result.coins_awarded,
    isFirstTime: result.is_first_time,
  };
}
