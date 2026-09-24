-- Home dashboard ↔ Supabase wiring.
--
-- Until now the desktop dashboard (src/apps/desktop-dashboard) kept its
-- study plan in localStorage (wynko_focus_plan_v1) and the weekly schedule
-- only in React state, so Home, Focus Lock and Schedules agreed with each
-- other inside one tab but not across tabs/devices, and the schedule was lost
-- on every reload. Study time from the Quick Timers was never saved at all,
-- and Focus Lock's study_log write was a client-side read-modify-write that
-- double-counted when two tabs stopped the same session.
--
--   study_plan_tasks   one row per Focus Lock task (subject/topic/timer progress)
--   study_plans        one row per user: which task is live + the progress
--                      anchor, plus the weekly schedule and study units the
--                      Schedules page edits. Every client write ends by
--                      touching this row, so it doubles as the realtime
--                      "plan changed" signal (see studyPlanStore.ts).
--   rpc_log_study_time              atomic add into user_profiles.study_log
--   rpc_stop_study_session_logged   stop + log in one transaction, exactly once

-- ── Tasks ────────────────────────────────────────────────────────────────────
create table if not exists public.study_plan_tasks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Client-generated (makeTaskId in DesktopDashboard.tsx: "task_<ms>_<rand>"),
  -- so ids already sitting in someone's localStorage plan carry over unchanged.
  id text not null check (char_length(id) between 1 and 80),
  subject text not null check (char_length(subject) between 1 and 200),
  topic text not null default '' check (char_length(topic) <= 300),
  mode text not null default 'pomodoro' check (mode in ('pomodoro', 'regular')),
  -- Nullable on purpose: plans saved before customizable Pomodoro have neither,
  -- and the client treats "missing" as focus / 25:00.
  pomodoro_phase text check (pomodoro_phase in ('focus', 'break')),
  pomodoro_total integer check (pomodoro_total >= 0),
  pomodoro_remaining integer not null default 0 check (pomodoro_remaining >= 0),
  regular_elapsed integer not null default 0 check (regular_elapsed >= 0),
  completed boolean not null default false,
  position integer not null default 0,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_study_plan_tasks_user_position
  on public.study_plan_tasks (user_id, position);

alter table public.study_plan_tasks enable row level security;

drop policy if exists "study_plan_tasks: own rows" on public.study_plan_tasks;
create policy "study_plan_tasks: own rows" on public.study_plan_tasks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Plan state + weekly schedule ─────────────────────────────────────────────
create table if not exists public.study_plans (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  active_task_id text,
  running boolean not null default false,
  -- The moment the saved task progress was current. A client that finds
  -- running = true fast-forwards the active task by now() - anchor_at, so
  -- progress stays exact without writing every second.
  anchor_at timestamptz,
  -- null = never saved from the Schedules page yet (distinct from "saved empty").
  weekly_schedule jsonb check (weekly_schedule is null or jsonb_typeof(weekly_schedule) = 'array'),
  study_units jsonb check (study_units is null or jsonb_typeof(study_units) = 'array'),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.study_plans enable row level security;

drop policy if exists "study_plans: own row" on public.study_plans;
create policy "study_plans: own row" on public.study_plans
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- study_plans: the plan-changed signal. user_profiles: study_log /
-- display_name / avatar_url changes from any page or device refresh Home.
-- Both are subscribed with a user filter; realtime also applies the tables'
-- RLS select policies, so nobody receives another user's row.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_plans') then
    alter publication supabase_realtime add table public.study_plans;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_profiles') then
    alter publication supabase_realtime add table public.user_profiles;
  end if;
end $$;

-- ── Study time logging ───────────────────────────────────────────────────────
-- Same {date: {subject: seconds}} shape tracker.html / timer.html / Home
-- already use, keyed by UTC date (they all key by toISOString().split('T')[0]).
-- One UPDATE statement, so concurrent writers can't lose each other's time.
create or replace function public.rpc_log_study_time(p_subject text, p_seconds integer, p_day text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_day text;
  v_subject text := coalesce(nullif(trim(p_subject), ''), 'General');
  v_seconds integer := least(greatest(coalesce(p_seconds, 0), 0), 86400);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_seconds = 0 then return; end if;

  -- Clients may flush a queued entry a little later (offline), so accept a
  -- recent day they pass; anything malformed or out of range lands on today.
  v_day := to_char(v_today, 'YYYY-MM-DD');
  if p_day ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      if p_day::date between v_today - 7 and v_today + 1 then v_day := p_day; end if;
    exception when others then null;
    end;
  end if;

  update public.user_profiles
     set study_log = jsonb_set(
           case when jsonb_typeof(study_log) = 'object' then study_log else '{}'::jsonb end,
           array[v_day],
           (case when jsonb_typeof(study_log -> v_day) = 'object' then study_log -> v_day else '{}'::jsonb end)
             || jsonb_build_object(v_subject,
                  coalesce(floor((study_log -> v_day ->> v_subject)::numeric)::integer, 0) + v_seconds),
           true),
         total_study_seconds = coalesce(total_study_seconds, 0) + v_seconds,
         last_active_at = now()
   where id = v_uid;
end;
$$;

-- Stops the caller's session and, only if THIS call is the one that closed
-- it, adds its server-computed total_seconds to study_log. Two tabs (or
-- Focus Lock + a study room) stopping the same session log it once.
create or replace function public.rpc_stop_study_session_logged(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.study_sessions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.study_sessions
   where id = p_session_id and user_id = auth.uid()
   for update;
  if v_row.id is null then raise exception 'session not found'; end if;
  if v_row.ended_at is not null then return v_row; end if; -- already closed and logged by whoever closed it

  v_row := public.rpc_stop_study_session(p_session_id);
  if coalesce(v_row.total_seconds, 0) > 0 then
    perform public.rpc_log_study_time(v_row.subject, v_row.total_seconds, to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD'));
  end if;
  return v_row;
end;
$$;

revoke all on function public.rpc_log_study_time(text, integer, text) from public, anon;
revoke all on function public.rpc_stop_study_session_logged(uuid) from public, anon;
grant execute on function public.rpc_log_study_time(text, integer, text) to authenticated;
grant execute on function public.rpc_stop_study_session_logged(uuid) to authenticated;
