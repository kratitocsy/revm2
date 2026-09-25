-- New first-run flow (onboarding-quiz.html): language -> Wynky hello ->
-- either "Find Your Study DNA" (the quiz) or "Skip for Now" -> a profile
-- step (name, exam, username) -> Home. Shown once per account.
--
--   * user_profiles.onboarding_completed_at - set when the profile step is
--     saved. login.html and the quiz page send anyone with it set straight
--     to Home, so neither the quiz nor the profile step is shown again.
--     Accounts that already finished the old quiz count as onboarded.
--   * Study DNA reward (first completion only, computed here, never trusted
--     from the page): +10 Wynkoins per answered question (7 questions; the
--     Q6 follow-up isn't a separate question, and Q3's automatic answer for
--     droppers / "appeared" counts as answered) + 30 for finishing = 100 max.
--     Skipped questions earn nothing. Someone who chose "Skip for Now" can't
--     claim it afterwards.
--   * rpc_check_username / rpc_finish_onboarding - the profile step's
--     username check and save. Usernames: 3-20 of a-z 0-9 _, starting and
--     ending with a letter or number (the table's existing rules).
--   * rpc_complete_quiz (old quiz, 115 coins) is no longer callable.

alter table public.user_profiles add column if not exists onboarding_completed_at timestamptz;

update public.user_profiles
   set onboarding_completed_at = quiz_completed_at
 where onboarding_completed_at is null and quiz_completed_at is not null;

-- ── Answer / username checks ─────────────────────────────────────────────
-- True when a quiz answer field holds a real answer (a 'custom' pick needs
-- its 1-60 character custom text).
create or replace function public.study_dna_answer_ok(p jsonb, p_field text, p_custom_field text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb := p -> p_field;
  v_custom_len int := coalesce(char_length(btrim(p ->> p_custom_field)), 0);
begin
  if v is null or jsonb_typeof(v) = 'null' then return false; end if;
  if jsonb_typeof(v) = 'array' then
    if jsonb_array_length(v) = 0 then return false; end if;
    if v ? 'custom' then return v_custom_len between 1 and 60; end if;
    return true;
  end if;
  if jsonb_typeof(v) = 'string' then
    if v #>> '{}' = 'custom' then return v_custom_len between 1 and 60; end if;
    return char_length(btrim(v #>> '{}')) between 1 and 60;
  end if;
  return jsonb_typeof(v) = 'boolean';
end;
$$;

create or replace function public.study_dna_answered_count(p jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select (public.study_dna_answer_ok(p, 'exam', 'custom_exam'))::int
       + (public.study_dna_answer_ok(p, 'student_type', 'custom_student_type'))::int
       + (public.study_dna_answer_ok(p, 'fixed_commitment_type', 'custom_fixed_commitment_type'))::int
       + (public.study_dna_answer_ok(p, 'focus_time', 'custom_focus_time'))::int
       + (public.study_dna_answer_ok(p, 'daily_hours', 'custom_daily_hours'))::int
       + (public.study_dna_answer_ok(p, 'distractions', 'custom_distraction'))::int
       + (public.study_dna_answer_ok(p, 'study_mode', 'custom_study_mode'))::int
$$;

-- null when fine, otherwise what's wrong (shown to the student as-is).
create or replace function public.username_problem(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_username is null or char_length(p_username) < 3 then 'Usernames need at least 3 characters.'
    when char_length(p_username) > 20 then 'Usernames can be at most 20 characters.'
    when p_username !~ '^[a-z0-9_]+$' then 'Use only lowercase letters, numbers and _.'
    when p_username !~ '^[a-z0-9].*[a-z0-9]$' then 'Start and end with a letter or number.'
    else null
  end
$$;

revoke execute on function public.study_dna_answer_ok(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.study_dna_answered_count(jsonb) from public, anon, authenticated;
revoke execute on function public.username_problem(text) from public, anon, authenticated;

-- ── Profile step: username check ─────────────────────────────────────────
create or replace function public.rpc_check_username(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text := lower(btrim(coalesce(p_username, '')));
  v_problem text := public.username_problem(v_clean);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v_problem is not null then
    return jsonb_build_object('username', v_clean, 'available', false, 'message', v_problem);
  end if;
  if exists (select 1 from public.user_profiles where lower(username) = v_clean and id <> auth.uid()) then
    return jsonb_build_object('username', v_clean, 'available', false, 'message', 'That username is already taken.');
  end if;
  return jsonb_build_object('username', v_clean, 'available', true, 'message', null);
end;
$$;

-- ── Study DNA result + coins ─────────────────────────────────────────────
create or replace function public.rpc_submit_study_dna(p_quiz_answers jsonb, p_archetype text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prof record;
  v_answered int;
  v_reward int := 0;
  v_first boolean;
  v_subject text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_archetype not in ('Dawn Warrior','Night Owl','Sprinter','Marathoner',
                         'Visual Learner','Social Battler','Grind Machine','Balanced Planner') then
    raise exception 'Unknown archetype: %', p_archetype;
  end if;
  if p_quiz_answers is null or jsonb_typeof(p_quiz_answers) <> 'object' or pg_column_size(p_quiz_answers) > 8192 then
    raise exception 'Invalid quiz answers';
  end if;

  select quiz_completed_at, onboarding_completed_at, subjects into v_prof
    from public.user_profiles where id = v_uid;
  if not found then raise exception 'No user profile found for this account'; end if;
  if v_prof.onboarding_completed_at is not null and v_prof.quiz_completed_at is null then
    raise exception 'The Study DNA quiz was skipped for this account';
  end if;

  v_first := v_prof.quiz_completed_at is null;
  v_answered := public.study_dna_answered_count(p_quiz_answers);

  update public.user_profiles
     set quiz_answers = p_quiz_answers,
         archetype = p_archetype,
         quiz_completed_at = coalesce(quiz_completed_at, now())
   where id = v_uid;

  -- Same starter subjects as the old quiz (0066).
  if v_prof.subjects is not null then
    foreach v_subject in array v_prof.subjects loop
      insert into public.subjects (user_id, name) values (v_uid, v_subject)
      on conflict (user_id, name) do nothing;
    end loop;
  end if;

  if v_first then
    v_reward := v_answered * 10 + 30;
    perform public.increment_wallet(v_uid, v_reward, v_reward);
  end if;

  return jsonb_build_object(
    'archetype', p_archetype,
    'answered', v_answered,
    'coins_awarded', v_reward,
    'is_first_time', v_first,
    'balance', (select coalesce(coins, 0) from public.user_wallets where user_id = v_uid)
  );
end;
$$;

-- ── Profile step: save and finish ────────────────────────────────────────
create or replace function public.rpc_finish_onboarding(p_full_name text, p_exam text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_exam text := btrim(coalesce(p_exam, ''));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_problem text := public.username_problem(v_username);
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'Enter your name (up to 60 characters).'; end if;
  if char_length(v_exam) not between 1 and 40 then raise exception 'Choose your exam.'; end if;
  if v_problem is not null then raise exception '%', v_problem; end if;
  if exists (select 1 from public.user_profiles where lower(username) = v_username and id <> v_uid) then
    raise exception 'That username is already taken.';
  end if;

  update public.user_profiles
     set full_name = v_name,
         display_name = v_name,
         exam = v_exam,
         username = v_username,
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = v_uid;
  if not found then raise exception 'No user profile found for this account'; end if;

  return jsonb_build_object('username', v_username, 'full_name', v_name, 'exam', v_exam);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_check_username(text)',
    'public.rpc_submit_study_dna(jsonb,text)',
    'public.rpc_finish_onboarding(text,text,text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- The old quiz's save (115 coins) is replaced by rpc_submit_study_dna.
revoke execute on function public.rpc_complete_quiz(jsonb, text, text) from public, anon, authenticated;
