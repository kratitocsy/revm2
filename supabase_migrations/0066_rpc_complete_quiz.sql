-- Wynko Quiz Bot spec, Step 2 "persistence wiring": save quiz_answers/
-- archetype/username, seed the subjects table (from Step 1) for the
-- generator, and award Wynkoins through the existing user_wallets/
-- increment_wallet system (not coin_transactions, which is a separate
-- ad-reward audit log; user_wallets.coins is the real balance used by
-- rpc_create_battle_challenge etc).
--
-- Reward is computed server-side, not trusted from the client, and is
-- only ever granted on first genuine completion - re-calling this RPC
-- after quiz_completed_at is already set just updates the saved answers/
-- archetype (e.g. a later re-take) without granting more coins. This
-- matches the spec: "Reward is for first-time completion only. Cannot be
-- farmed by re-taking."
--
-- p_username is expected pre-lowercased by the caller (client-side
-- generateUsername() produces a mixed-case display string like
-- "NightOwl83"; the DB's username format constraint is lowercase-only,
-- so the caller lowercases it before calling this RPC and keeps the
-- mixed-case string only for the result-screen typewriter reveal).

create or replace function public.is_quiz_answers_complete(p jsonb, p_student_type text)
returns boolean
language plpgsql
stable
as $$
declare
  v_distractions jsonb;
begin
  -- exam
  if p->>'exam' is null then return false; end if;
  if p->>'exam' = 'custom' and coalesce(length(trim(p->>'custom_exam')), 0) not between 1 and 60 then
    return false;
  end if;

  -- student_type
  if p_student_type is null then return false; end if;
  if p_student_type = 'custom' and coalesce(length(trim(p->>'custom_student_type')), 0) not between 1 and 60 then
    return false;
  end if;

  -- fixed_commitment_type: not required for dropper/appeared (auto-defaulted client-side)
  if p_student_type not in ('dropper', 'appeared') then
    if p->>'fixed_commitment_type' is null then return false; end if;
    if p->>'fixed_commitment_type' = 'custom' and coalesce(length(trim(p->>'custom_fixed_commitment_type')), 0) not between 1 and 60 then
      return false;
    end if;
  end if;

  -- focus_time
  if p->>'focus_time' is null then return false; end if;
  if p->>'focus_time' = 'custom' and coalesce(length(trim(p->>'custom_focus_time')), 0) not between 1 and 60 then
    return false;
  end if;

  -- daily_hours
  if p->>'daily_hours' is null then return false; end if;
  if p->>'daily_hours' = 'custom' and coalesce(length(trim(p->>'custom_daily_hours')), 0) not between 1 and 60 then
    return false;
  end if;

  -- distractions (array)
  v_distractions := p->'distractions';
  if v_distractions is null or jsonb_typeof(v_distractions) <> 'array' or jsonb_array_length(v_distractions) = 0 then
    return false;
  end if;
  if v_distractions ? 'custom' and coalesce(length(trim(p->>'custom_distraction')), 0) not between 1 and 60 then
    return false;
  end if;
  -- q6b follow-up only required if distractions is exactly ['nothing']
  if jsonb_array_length(v_distractions) = 1 and v_distractions->>0 = 'nothing' then
    if p->>'block_social_anyway' is null then return false; end if;
  end if;

  -- study_mode
  if p->>'study_mode' is null then return false; end if;
  if p->>'study_mode' = 'custom' and coalesce(length(trim(p->>'custom_study_mode')), 0) not between 1 and 60 then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.rpc_complete_quiz(
  p_quiz_answers jsonb,
  p_archetype text,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_student_type text := p_quiz_answers->>'student_type';
  v_is_first_time boolean;
  v_answered_count integer;
  v_reward integer := 0;
  v_final_username text;
  v_seeded_subjects text[];
  v_subject text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if p_archetype not in (
    'Dawn Warrior','Night Owl','Sprinter','Marathoner',
    'Visual Learner','Social Battler','Grind Machine','Balanced Planner'
  ) then
    raise exception 'Unknown archetype: %', p_archetype;
  end if;

  if not public.is_quiz_answers_complete(p_quiz_answers, v_student_type) then
    raise exception 'Quiz answers are incomplete';
  end if;

  select quiz_completed_at is null into v_is_first_time
    from public.user_profiles where id = v_uid;
  if v_is_first_time is null then
    raise exception 'No user profile found for this account';
  end if;

  v_answered_count := case when v_student_type in ('dropper','appeared') then 6 else 7 end;

  -- Username: only claim it if the account doesn't already have one, and
  -- only if it's actually free (case-insensitive, matching the existing
  -- lower(username) unique indexes).
  select username into v_final_username from public.user_profiles where id = v_uid;
  if v_final_username is null and p_username is not null then
    if exists(select 1 from public.user_profiles where lower(username) = lower(p_username) and id <> v_uid) then
      raise exception 'username_taken';
    end if;
    v_final_username := p_username;
  end if;

  update public.user_profiles
    set quiz_answers = p_quiz_answers,
        archetype = p_archetype,
        quiz_completed_at = coalesce(quiz_completed_at, now()),
        username = coalesce(username, v_final_username)
    where id = v_uid;

  -- Seed the Step 1 `subjects` table from the exam-derived subject pool
  -- already on user_profiles.subjects, so the generator has something to
  -- work with immediately after the quiz (Section 6: "Day 1 - Exam-specific
  -- starter pack pre-ticked"). Only inserts subjects that don't exist yet.
  select subjects into v_seeded_subjects from public.user_profiles where id = v_uid;
  if v_seeded_subjects is not null then
    foreach v_subject in array v_seeded_subjects loop
      insert into public.subjects(user_id, name)
        values (v_uid, v_subject)
        on conflict (user_id, name) do nothing;
    end loop;
  end if;

  if v_is_first_time then
    v_reward := v_answered_count * 5 + 50 + 30; -- matches spec's 115-coin max
    perform public.increment_wallet(v_uid, v_reward, v_reward);
  end if;

  return jsonb_build_object(
    'archetype', p_archetype,
    'username', v_final_username,
    'coins_awarded', v_reward,
    'is_first_time', v_is_first_time
  );
end;
$$;

revoke all on function public.rpc_complete_quiz(jsonb, text, text) from public;
grant execute on function public.rpc_complete_quiz(jsonb, text, text) to authenticated;
