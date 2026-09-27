-- Wynky learns from each student's own choices and from students in the
-- same exam, so every set-up needs fewer questions than the last.
--
-- wynky_events is the learning log: one row per answer Wynky saw the
-- student keep, change, ask for or remove (a wake time, the daily hours,
-- a site for Physics, a busy time...). The client blends the student's own
-- recent events with the aggregates below and with their Study DNA to pick
-- the pre-selected answer for every question (wynkyRecommender.ts).
--
-- exam_key / day_type are copied onto each row when it is written so the
-- cohort aggregates need no joins, and a student who changes exam starts
-- counting toward the new cohort from then on.
create table if not exists public.wynky_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_key text not null check (char_length(exam_key) between 1 and 40),
  day_type text check (day_type is null or char_length(day_type) between 1 and 40),
  -- 'wake', 'sleep', 'daily_minutes', 'block_minutes', 'busy',
  -- 'sites:<subject key>', 'note', 'setup_seconds'
  field text not null check (char_length(field) between 1 and 60),
  value text not null check (char_length(value) between 1 and 300),
  -- true when a field holds several values at once (the sites of a subject,
  -- busy times): each value is then kept or removed on its own.
  multi boolean not null default false,
  action text not null check (action in ('accepted', 'changed', 'requested', 'removed')),
  created_at timestamptz not null default now()
);

alter table public.wynky_events enable row level security;

-- Students read and write only their own events. Other students' choices
-- are only ever seen as counts, through the functions below.
drop policy if exists "wynky_events_owner" on public.wynky_events;
create policy "wynky_events_owner" on public.wynky_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_wynky_events_user on public.wynky_events(user_id, created_at desc);
create index if not exists idx_wynky_events_cohort on public.wynky_events(exam_key, field, created_at desc);

-- What students in the same exam currently choose for each field, as
-- counts only. Each student counts once per value: their latest event for
-- the field (or, for multi fields, for that value) decides whether it
-- counts, so a student who changed their mind stops counting for the old
-- answer. Only the last 120 days count.
--
-- The narrower cohort (same exam AND the caller's own Study DNA day type,
-- e.g. JEE + school and coaching) is used for a field when at least 5
-- students in it have answered that field; otherwise the whole exam;
-- otherwise nothing. The day type is read from the caller's own profile,
-- not taken as a parameter, so nobody can ask for both levels and subtract
-- one from the other to see a small group's answers.
-- A value must be chosen by at least 3 students to be returned at all, so
-- nothing one student typed (a private site, say) can leak to others.
-- Free-text notes and set-up timings are never aggregated.
create or replace function public.rpc_wynky_peer_stats(
  p_exam_key text,
  p_fields text[]
) returns table (field text, value text, users bigint, cohort_users bigint, cohort text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select nullif(up.quiz_answers->>'day_type', '') as day_type
    from public.user_profiles up where up.id = auth.uid()
  ),
  recent as (
    select e.*
    from public.wynky_events e
    where e.exam_key = p_exam_key
      and e.field = any(p_fields)
      and e.field not in ('note', 'setup_seconds')
      and e.created_at > now() - interval '120 days'
      and auth.uid() is not null
  ),
  latest_single as (
    select distinct on (user_id, field) user_id, field, value, action, day_type
    from recent where not multi
    order by user_id, field, created_at desc
  ),
  latest_multi as (
    select distinct on (user_id, field, value) user_id, field, value, action, day_type
    from recent where multi
    order by user_id, field, value, created_at desc
  ),
  current_choices as (
    select user_id, field, value, day_type from latest_single where action <> 'removed'
    union all
    select user_id, field, value, day_type from latest_multi where action <> 'removed'
  ),
  cohort_size as (
    select field,
      count(distinct user_id) filter (where day_type = (select day_type from me)) as daytype_users,
      count(distinct user_id) as exam_users
    from current_choices group by field
  ),
  chosen as (
    select field,
      case when daytype_users >= 5 then 'exam_daytype' when exam_users >= 5 then 'exam' end as cohort,
      case when daytype_users >= 5 then daytype_users else exam_users end as cohort_users
    from cohort_size
  )
  select c.field, c.value, count(distinct c.user_id) as users, ch.cohort_users, ch.cohort
  from current_choices c
  join chosen ch on ch.field = c.field and ch.cohort is not null
  where ch.cohort = 'exam' or c.day_type = (select day_type from me)
  group by c.field, c.value, ch.cohort_users, ch.cohort
  having count(distinct c.user_id) >= 3
  order by c.field, users desc;
$$;

revoke execute on function public.rpc_wynky_peer_stats(text, text[]) from public, anon;
grant execute on function public.rpc_wynky_peer_stats(text, text[]) to authenticated;

-- Everything Wynky knows about the YouTube channels for one subject, in
-- one call, as counts only (same 3-student floor as above):
--   same_exam_users   students in this exam who have the channel picked
--   other_exam_users  students in other exams who picked it for the same
--                     subject (so a channel JEE students find is quickly
--                     offered to NEET students studying Physics too)
--   also_picked_users students in this exam who picked any of p_picked and
--                     also picked this channel ("students who watch X also
--                     watch Y")
create or replace function public.rpc_wynky_channel_signals(
  p_exam_key text,
  p_subject_key text,
  p_picked text[] default '{}'
) returns table (channel_id text, channel_label text, same_exam_users bigint, other_exam_users bigint, also_picked_users bigint)
language sql
stable
security definer
set search_path = public
as $$
  with subject_picks as (
    select * from public.wynky_channel_picks where subject_key = p_subject_key and auth.uid() is not null
  ),
  co_users as (
    select distinct user_id from subject_picks
    where exam_key = p_exam_key and channel_id = any(coalesce(p_picked, '{}'))
  ),
  agg as (
    select sp.channel_id,
      -- The name most students saved, so one odd label can't rename a channel.
      mode() within group (order by sp.channel_label) as channel_label,
      count(distinct sp.user_id) filter (where sp.exam_key = p_exam_key) as same_exam_users,
      count(distinct sp.user_id) filter (where sp.exam_key <> p_exam_key) as other_exam_users,
      count(distinct sp.user_id) filter (where sp.exam_key = p_exam_key and sp.user_id in (select user_id from co_users)
        and not (sp.channel_id = any(coalesce(p_picked, '{}')))) as also_picked_users
    from subject_picks sp
    group by sp.channel_id
  )
  select channel_id, channel_label,
    case when same_exam_users >= 3 then same_exam_users else 0 end,
    case when other_exam_users >= 3 then other_exam_users else 0 end,
    case when also_picked_users >= 3 then also_picked_users else 0 end
  from agg
  where same_exam_users >= 3 or other_exam_users >= 3
  order by same_exam_users desc, other_exam_users desc
  limit 40;
$$;

revoke execute on function public.rpc_wynky_channel_signals(text, text, text[]) from public, anon;
grant execute on function public.rpc_wynky_channel_signals(text, text, text[]) to authenticated;
