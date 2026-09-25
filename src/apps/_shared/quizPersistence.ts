/* ============================================================
   quizPersistence.ts

   Wires quizEngine.ts (pure logic) to Supabase. This is the only
   file in the quiz stack that touches the network - kept thin on
   purpose so quizEngine's branching/scoring stays unit-testable
   without mocking Supabase.

   First-run flow (migration 0088_study_dna_onboarding.sql):
     submitStudyDna      -> rpc_submit_study_dna: saves the answers and
                            archetype; the server counts the answers and
                            credits the Wynkoins itself (never trusted
                            from here).
     suggestUsername /
     checkUsername       -> rpc_check_username: availability is checked on
                            the server - other people's profiles aren't
                            readable from the app.
     finishOnboarding    -> rpc_finish_onboarding: name, exam, username;
                            marks onboarding done so it's never shown again.
*/

import {
  type Archetype,
  type QuizAnswers,
  generateUsername,
  scoreArchetype,
  usernameFromName,
  usernameProblem,
} from './quizEngine';

// Minimal shape of the Supabase client methods this module needs, so it
// doesn't have to import the full generated client type.
export interface QuizSupabaseClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface StudyDnaResult {
  archetype: Archetype;
  answered: number;
  coinsAwarded: number;
  isFirstTime: boolean;
  /** Wallet balance after the reward, when the server reports it. */
  balance: number | null;
}

export async function submitStudyDna(supabase: QuizSupabaseClient, answers: QuizAnswers): Promise<StudyDnaResult> {
  const archetype = scoreArchetype(answers);
  const { data, error } = await supabase.rpc('rpc_submit_study_dna', {
    p_quiz_answers: answers,
    p_archetype: archetype,
  });
  if (error) throw new Error(error.message);
  const r = data as { archetype: Archetype; answered: number; coins_awarded: number; is_first_time: boolean; balance: number | null };
  return {
    archetype: r.archetype,
    answered: r.answered,
    coinsAwarded: r.coins_awarded,
    isFirstTime: r.is_first_time,
    balance: r.balance ?? null,
  };
}

export interface UsernameCheck {
  username: string;
  available: boolean;
  message: string | null;
}

export async function checkUsername(supabase: QuizSupabaseClient, username: string): Promise<UsernameCheck> {
  const problem = usernameProblem(username);
  if (problem) return { username, available: false, message: problem };
  const { data, error } = await supabase.rpc('rpc_check_username', { p_username: username });
  if (error) throw new Error(error.message);
  const r = data as { username: string; available: boolean; message: string | null };
  return { username: r.username, available: r.available, message: r.message };
}

async function isFree(supabase: QuizSupabaseClient, candidate: string): Promise<boolean> {
  try {
    return (await checkUsername(supabase, candidate)).available;
  } catch {
    return false; // fail closed: try another candidate
  }
}

/**
 * A free username to pre-fill the profile step with (lowercase, the form the
 * database stores). Quiz finishers get one from their Study DNA
 * ("focusseeker42"), skippers one from their name ("rohan347"). Returns the
 * last candidate even if none was confirmed free - the student can edit it,
 * and the profile step checks it again anyway.
 */
export async function suggestUsername(
  supabase: QuizSupabaseClient,
  from: { archetype?: Archetype | null; name?: string | null }
): Promise<string> {
  if (from.archetype) {
    const generated = await generateUsername(from.archetype, {
      isTaken: async (c) => !(await isFree(supabase, c.toLowerCase())),
    });
    if (generated) return generated.toLowerCase();
  }
  let candidate = usernameFromName(from.name);
  for (let i = 0; i < 5; i++) {
    if (await isFree(supabase, candidate)) return candidate;
    candidate = usernameFromName(i < 2 ? from.name : null);
  }
  return candidate;
}

export async function finishOnboarding(
  supabase: QuizSupabaseClient,
  profile: { fullName: string; exam: string; username: string }
): Promise<{ username: string }> {
  const { data, error } = await supabase.rpc('rpc_finish_onboarding', {
    p_full_name: profile.fullName,
    p_exam: profile.exam,
    p_username: profile.username,
  });
  if (error) throw new Error(error.message);
  return { username: (data as { username: string }).username };
}
