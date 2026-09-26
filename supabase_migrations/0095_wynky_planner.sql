-- Wynky Scheduler: a recommend-and-confirm planner bot on top of the
-- existing Focus Lock enforcement (focus_lock_presets / focus_lock_schedules
-- / focus_lock_schedule_slots, already enforced server-side by
-- schedule-tick). Wynky never invents a new blocking mechanism — it only
-- proposes ordinary presets + a schedule from what it already knows about
-- the student (user_profiles.subjects/exam, the Study DNA quiz answers)
-- plus a couple of one-time questions (wake/sleep time), and writes them
-- only after the student taps Confirm.
--
-- wynky_profiles is the "gets to know you" state: it remembers the last
-- answers so the next visit needs fewer questions, and keeps a light
-- accepted/adjusted count so the recommended daily hours can drift toward
-- what the student actually keeps confirming instead of the quiz's raw
-- bucket every time. This is a simple running-average nudge, not a model —
-- described that way to the user, not oversold as "AI" anywhere it isn't.
create table if not exists public.wynky_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wake_time time,
  sleep_time time,
  -- Per-subject site/app allow-lists the student typed in Wynky's setup,
  -- keyed by subject name so a returning visit can prefill instead of
  -- asking again: { "Physics": { "sites": ["youtube.com"], "apps": [] }, ... }
  subject_allowlists jsonb not null default '{}'::jsonb,
  -- Last daily-hours figure the student actually confirmed (minutes).
  -- Seeded from the quiz bucket the first time, then nudged by
  -- rpc_wynky_record_outcome below.
  last_daily_minutes int check (last_daily_minutes is null or last_daily_minutes between 30 and 960),
  accepted_count int not null default 0,
  adjusted_count int not null default 0,
  last_recommended_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wynky_profiles enable row level security;

drop policy if exists "wynky_profiles_owner" on public.wynky_profiles;
create policy "wynky_profiles_owner" on public.wynky_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per recommendation shown, so accepted-vs-adjusted is a real
-- history rather than just the two running counters above (useful for
-- support/debugging, and for a future "why is Wynky suggesting this"
-- explanation without re-deriving it from scratch).
create table if not exists public.wynky_recommendation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('rule_based', 'ai_custom')),
  requested_minutes int,
  confirmed_minutes int,
  outcome text not null check (outcome in ('accepted_as_is', 'accepted_edited', 'discarded')),
  created_at timestamptz not null default now()
);

alter table public.wynky_recommendation_log enable row level security;

drop policy if exists "wynky_recommendation_log_owner" on public.wynky_recommendation_log;
create policy "wynky_recommendation_log_owner" on public.wynky_recommendation_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_wynky_recommendation_log_user
  on public.wynky_recommendation_log(user_id, created_at desc);

-- Records one recommendation's outcome and nudges last_daily_minutes 30%
-- of the way toward what was actually confirmed (simple exponential
-- moving average) so the next default is closer to what this student
-- keeps choosing, without a single outlier session swinging it wildly.
create or replace function public.rpc_wynky_record_outcome(
  p_source text,
  p_requested_minutes int,
  p_confirmed_minutes int,
  p_outcome text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_prev int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_outcome not in ('accepted_as_is', 'accepted_edited', 'discarded') then
    raise exception 'bad outcome';
  end if;
  if p_source not in ('rule_based', 'ai_custom') then raise exception 'bad source'; end if;

  insert into public.wynky_recommendation_log(user_id, source, requested_minutes, confirmed_minutes, outcome)
  values (v_user, p_source, p_requested_minutes, p_confirmed_minutes, p_outcome);

  if p_outcome = 'discarded' then return; end if;

  select last_daily_minutes into v_prev from public.wynky_profiles where user_id = v_user;

  insert into public.wynky_profiles (user_id, last_daily_minutes, accepted_count, adjusted_count, last_recommended_at, updated_at)
  values (
    v_user,
    coalesce(
      case when v_prev is null then p_confirmed_minutes
        else round(v_prev * 0.7 + p_confirmed_minutes * 0.3)::int end,
      p_confirmed_minutes
    ),
    case when p_outcome = 'accepted_as_is' then 1 else 0 end,
    case when p_outcome = 'accepted_edited' then 1 else 0 end,
    now(), now()
  )
  on conflict (user_id) do update set
    last_daily_minutes = coalesce(
      round(public.wynky_profiles.last_daily_minutes * 0.7 + excluded.last_daily_minutes * 0.3)::int,
      excluded.last_daily_minutes
    ),
    accepted_count = public.wynky_profiles.accepted_count + excluded.accepted_count,
    adjusted_count = public.wynky_profiles.adjusted_count + excluded.adjusted_count,
    last_recommended_at = now(),
    updated_at = now();
end;
$$;

grant execute on function public.rpc_wynky_record_outcome(text, int, int, text) to authenticated;
