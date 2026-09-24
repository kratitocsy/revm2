-- Communities (desktop dashboard "Community" module) on real data.
--
-- A community is a study_groups row with is_revhead_group = true. Only a
-- verified WynkoHead (user_profiles.is_revhead + revhead_status = 'verified',
-- the pre-rename "RevHead" columns) can own one - already enforced by
-- trg_enforce_revhead_group_flag. Its members are group_members, its study
-- room is the group itself, and time studied there is study_sessions.group_id.
--
-- Added here:
--   study_groups.emoji / join_requires_approval
--   community_home                 each user's chosen Home Community + 30-day lock
--   community_announcements        the WynkoHead's feed (members read, admins write)
--   community_schedules            the published schedule students receive
--   community_schedule_drafts      the WynkoHead's unpublished editor state
--   community_schedule_choices     each student's accept / reject / seen state
--   community_join_requests        manual-approval queue
--   RPCs for both views (list, discover, join, leave, home, detail, publish,
--   choices, requests, head overview, student analytics, create)
--   Payouts: the 50% "primary group" floor now goes to the chosen Home
--   Community (still falling back to the first group ever joined).
--   Security: group_members self-insert is limited to public non-community
--   groups (or your own group), and only with role 'member' - previously any
--   user could add themselves to any group, with any role, which bypassed
--   room passwords and community approval.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.study_groups
  add column if not exists emoji text check (emoji is null or char_length(emoji) <= 8),
  add column if not exists join_requires_approval boolean not null default false;

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.is_community(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select g.is_revhead_group from public.study_groups g where g.id = p_group_id), false);
$$;

-- Display name for another user (display_name -> full_name -> username).
create or replace function public.public_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), 'Member')
  from public.user_profiles p where p.id = p_user_id;
$$;

-- Minutes scheduled on one weekday (0 = Monday) of a published week
-- ([[{startTime:'9:00 AM', endTime:'10:30 AM', ...}], ...] - the dashboard's ScheduleItem).
create or replace function public.schedule_day_minutes(p_week jsonb, p_day int)
returns integer language plpgsql immutable set search_path = public as $$
declare
  v_item jsonb;
  v_total int := 0;
  v_mins int;
begin
  if p_week is null or jsonb_typeof(p_week) <> 'array' or jsonb_typeof(p_week -> p_day) <> 'array' then return 0; end if;
  for v_item in select * from jsonb_array_elements(p_week -> p_day) loop
    begin
      v_mins := (extract(epoch from (to_timestamp(v_item ->> 'endTime', 'HH12:MI AM')::time
                                   - to_timestamp(v_item ->> 'startTime', 'HH12:MI AM')::time)) / 60)::int;
      if v_mins <= 0 then v_mins := v_mins + 1440; end if;
      v_total := v_total + v_mins;
    exception when others then null; -- a malformed slot counts as 0
    end;
  end loop;
  return v_total;
end;
$$;

-- Seconds a user studied on one UTC day (any group, open sessions up to now).
create or replace function public.user_day_study_seconds(p_user_id uuid, p_day date, p_group_id uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(ss.total_seconds,
           greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)))), 0)::int
  from public.study_sessions ss
  where ss.user_id = p_user_id
    and (ss.started_at at time zone 'utc')::date = p_day
    and (p_group_id is null or ss.group_id = p_group_id);
$$;

-- Schedule adherence over the last p_days (UTC) since the schedule was
-- published: for each day with scheduled minutes, min(1, studied/scheduled),
-- averaged. Null when there's nothing to measure yet.
create or replace function public.community_adherence(p_user_id uuid, p_group_id uuid, p_days int default 7)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_week jsonb;
  v_from date;
  v_day date;
  v_sched int;
  v_score numeric := 0;
  v_n int := 0;
begin
  select s.week, (s.published_at at time zone 'utc')::date into v_week, v_from
  from public.community_schedules s where s.group_id = p_group_id;
  if v_week is null then return null; end if;
  for i in 0 .. greatest(p_days, 1) - 1 loop
    v_day := (now() at time zone 'utc')::date - i;
    exit when v_day < v_from;
    v_sched := public.schedule_day_minutes(v_week, extract(isodow from v_day)::int - 1);
    if v_sched > 0 then
      v_score := v_score + least(1, public.user_day_study_seconds(p_user_id, v_day) / 60.0 / v_sched);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then return null; end if;
  return round(100 * v_score / v_n)::int;
end;
$$;

-- Consecutive UTC days (today backward) with any study_log time - same rule
-- as the dashboard's Home streak and tracker.html.
create or replace function public.study_log_streak(p_log jsonb)
returns integer language plpgsql immutable set search_path = public as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_n int := 0;
  v_total numeric;
begin
  if p_log is null or jsonb_typeof(p_log) <> 'object' then return 0; end if;
  loop
    select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) into v_total
    from jsonb_each(coalesce(p_log -> to_char(v_day, 'YYYY-MM-DD'), '{}'::jsonb)) as e(k, v);
    exit when v_total <= 0 or v_n > 3650;
    v_n := v_n + 1;
    v_day := v_day - 1;
  end loop;
  return v_n;
end;
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.community_home (
  user_id uuid primary key references auth.users(id) on delete cascade,
  group_id uuid not null references public.study_groups(id) on delete cascade,
  locked_until timestamptz not null,
  set_at timestamptz not null default now()
);
alter table public.community_home enable row level security;
drop policy if exists "community_home: read own" on public.community_home;
create policy "community_home: read own" on public.community_home for select to authenticated using (auth.uid() = user_id);

create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  message text not null check (char_length(trim(message)) between 1 and 400),
  pinned boolean not null default false,
  important boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_announcements_group on public.community_announcements (group_id, created_at desc);
alter table public.community_announcements enable row level security;
drop policy if exists "announcements: members read" on public.community_announcements;
create policy "announcements: members read" on public.community_announcements for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists "announcements: admins post" on public.community_announcements;
create policy "announcements: admins post" on public.community_announcements for insert to authenticated
  with check (public.is_group_admin(group_id) and author_id = auth.uid());
drop policy if exists "announcements: admins edit" on public.community_announcements;
create policy "announcements: admins edit" on public.community_announcements for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
drop policy if exists "announcements: admins delete" on public.community_announcements;
create policy "announcements: admins delete" on public.community_announcements for delete to authenticated
  using (public.is_group_admin(group_id));

create table if not exists public.community_schedules (
  group_id uuid primary key references public.study_groups(id) on delete cascade,
  week jsonb not null check (jsonb_typeof(week) = 'array' and jsonb_array_length(week) = 7),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  published_by_name text
);
alter table public.community_schedules enable row level security;
drop policy if exists "community_schedules: members read" on public.community_schedules;
create policy "community_schedules: members read" on public.community_schedules for select to authenticated
  using (public.is_group_member(group_id));

create table if not exists public.community_schedule_drafts (
  group_id uuid primary key references public.study_groups(id) on delete cascade,
  week jsonb not null check (jsonb_typeof(week) = 'array' and jsonb_array_length(week) = 7),
  units jsonb not null default '[]'::jsonb check (jsonb_typeof(units) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.community_schedule_drafts enable row level security;
drop policy if exists "community_schedule_drafts: admins" on public.community_schedule_drafts;
create policy "community_schedule_drafts: admins" on public.community_schedule_drafts for all to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create table if not exists public.community_schedule_choices (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.study_groups(id) on delete cascade,
  choice text check (choice in ('accepted', 'rejected')),
  seen_published_at timestamptz,
  decided_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
alter table public.community_schedule_choices enable row level security;
drop policy if exists "community_schedule_choices: read own" on public.community_schedule_choices;
create policy "community_schedule_choices: read own" on public.community_schedule_choices for select to authenticated
  using (auth.uid() = user_id);

create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create unique index if not exists community_join_requests_one_pending
  on public.community_join_requests (group_id, user_id) where status = 'pending';
alter table public.community_join_requests enable row level security;
drop policy if exists "community_join_requests: own or admin" on public.community_join_requests;
create policy "community_join_requests: own or admin" on public.community_join_requests for select to authenticated
  using (auth.uid() = user_id or public.is_group_admin(group_id));

-- ── Membership integrity ─────────────────────────────────────────────────────
create or replace function public.can_self_join_group(p_group_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.study_groups g
    where g.id = p_group_id and (
      g.owner_id = auth.uid()   -- creating your own group (groups.html adds its creator as admin)
      or (coalesce(p_role, 'member') = 'member' and g.visibility = 'public' and not coalesce(g.is_revhead_group, false))
    )
  );
$$;
drop policy if exists "members: self can join" on public.group_members;
create policy "members: self can join" on public.group_members for insert to authenticated
  with check (auth.uid() = user_id and public.can_self_join_group(group_id, role));

-- Communities aren't study rooms: keep them out of the rooms list and the
-- room join path (which has no approval step).
create or replace function public.list_study_rooms()
returns table (
  id uuid, name text, description text, subject text, visibility text,
  has_password boolean, is_official boolean, member_count integer, member_limit integer,
  live_count integer, is_member boolean, my_role text, preview_initials text[], created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  with counts as (
    select gm.group_id, count(*)::int as n from public.group_members gm group by gm.group_id
  ),
  live as (
    select gm.group_id, count(distinct gm.user_id)::int as n
    from public.group_members gm
    join public.study_sessions ss on ss.user_id = gm.user_id
    where ss.ended_at is null and ss.paused_at is null and ss.is_private = false
    group by gm.group_id
  ),
  mine as (
    select gm.group_id, gm.role from public.group_members gm where gm.user_id = auth.uid()
  )
  select
    g.id, g.name, g.description, g.subject, g.visibility,
    (s.group_id is not null) as has_password,
    coalesce(g.is_official, false),
    coalesce(c.n, 0), g.member_limit, coalesce(l.n, 0),
    (m.group_id is not null) as is_member, m.role,
    case when g.visibility = 'public' or m.group_id is not null then (
      select array_agg(upper(left(split_part(x.n, ' ', 1), 1) || left(split_part(x.n, ' ', 2), 1))) from (
        select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), '?') as n
        from public.group_members gm2
        join public.user_profiles p on p.id = gm2.user_id
        where gm2.group_id = g.id
        order by gm2.joined_at
        limit 4
      ) x
    ) end,
    g.created_at
  from public.study_groups g
  left join counts c on c.group_id = g.id
  left join live l on l.group_id = g.id
  left join mine m on m.group_id = g.id
  left join public.study_room_secrets s on s.group_id = g.id
  where not coalesce(g.is_revhead_group, false)
    and ((m.group_id is not null)
      or ((g.visibility = 'public' or s.group_id is not null) and (coalesce(c.n, 0) > 0 or coalesce(g.is_official, false))))
  order by (m.group_id is not null) desc, coalesce(l.n, 0) desc, coalesce(c.n, 0) desc, g.created_at desc
  limit 200;
end;
$$;

create or replace function public.rpc_join_study_room(p_group_id uuid, p_password text default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_vis text;
  v_limit int;
  v_hash text;
  v_count int;
  v_community boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select g.visibility, g.member_limit, coalesce(g.is_revhead_group, false) into v_vis, v_limit, v_community
  from public.study_groups g where g.id = p_group_id;
  if v_vis is null then raise exception 'Room not found'; end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then
    return 'already_member';
  end if;
  if v_community then return 'invite_only'; end if; -- communities are joined through rpc_join_community
  if v_vis <> 'public' then
    select s.password_hash into v_hash from public.study_room_secrets s where s.group_id = p_group_id;
    if v_hash is null then return 'invite_only'; end if;
    perform public.enforce_rate_limit('study_room_password', 10, 900);
    if p_password is null or crypt(p_password, v_hash) <> v_hash then
      return 'wrong_password';
    end if;
  end if;
  select count(*) into v_count from public.group_members where group_id = p_group_id;
  if v_count >= v_limit then return 'full'; end if;
  insert into public.group_members (group_id, user_id, role) values (p_group_id, auth.uid(), 'member');
  return 'joined';
end;
$$;

-- groups.html invite links: a community that approves members manually
-- must not be joinable by its raw invite token.
create or replace function public.rpc_join_via_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_limit int;
  v_count int;
  v_already boolean;
  v_needs_approval boolean;
begin
  select id, member_limit, coalesce(is_revhead_group, false) and join_requires_approval
    into v_group_id, v_limit, v_needs_approval
  from study_groups where invite_token = p_token;

  if v_group_id is null then
    raise exception 'Invalid or expired invite link';
  end if;

  select exists(
    select 1 from group_members where group_id = v_group_id and user_id = auth.uid()
  ) into v_already;

  if not v_already then
    if v_needs_approval then
      raise exception 'This community approves new members. Open the invite link in the Wynko app to send a join request.';
    end if;
    select count(*) into v_count from group_members where group_id = v_group_id;
    if v_count >= v_limit then
      raise exception 'This group is full';
    end if;
    insert into group_members(group_id, user_id, role) values (v_group_id, auth.uid(), 'member');
  end if;

  return v_group_id;
end;
$$;

-- ── Student side ─────────────────────────────────────────────────────────────
create or replace function public.my_communities()
returns table (
  id uuid, name text, description text, emoji text, member_count integer, live_count integer,
  my_role text, is_home boolean, home_locked_until timestamptz, head_name text,
  join_requires_approval boolean, invite_token text, preview_initials text[], joined_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select
    g.id, g.name, g.description, g.emoji,
    (select count(*)::int from public.group_members x where x.group_id = g.id),
    (select count(distinct x.user_id)::int from public.group_members x
       join public.study_sessions ss on ss.user_id = x.user_id
      where x.group_id = g.id and ss.ended_at is null and ss.paused_at is null and ss.is_private = false),
    gm.role,
    (h.group_id = g.id),
    h.locked_until,
    public.public_display_name(g.owner_id),
    g.join_requires_approval,
    case when gm.role = 'admin' then g.invite_token end,
    (select array_agg(upper(left(split_part(y.n, ' ', 1), 1) || left(split_part(y.n, ' ', 2), 1))) from (
       select public.public_display_name(x.user_id) as n from public.group_members x
       where x.group_id = g.id order by x.joined_at limit 4) y),
    gm.joined_at
  from public.group_members gm
  join public.study_groups g on g.id = gm.group_id and coalesce(g.is_revhead_group, false)
  left join public.community_home h on h.user_id = auth.uid()
  where gm.user_id = auth.uid()
  order by (h.group_id = g.id) desc nulls last, gm.joined_at;
end;
$$;

create or replace function public.discover_communities()
returns table (id uuid, name text, description text, emoji text, member_count integer, head_name text,
               join_requires_approval boolean, requested boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select g.id, g.name, g.description, g.emoji,
    (select count(*)::int from public.group_members x where x.group_id = g.id) as n,
    public.public_display_name(g.owner_id),
    g.join_requires_approval,
    exists (select 1 from public.community_join_requests r where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending')
  from public.study_groups g
  where coalesce(g.is_revhead_group, false) and g.visibility = 'public'
    and not exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = auth.uid())
  order by n desc, g.created_at desc
  limit 30;
end;
$$;

-- Join by id (Discover) or invite token (invite link / code).
-- Returns 'joined' | 'requested' | 'already_member' | 'full' | 'invalid'.
create or replace function public.rpc_join_community(p_group_id uuid default null, p_token text default null, p_note text default null)
returns table (status text, group_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_vis text;
  v_limit int;
  v_approval boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.enforce_rate_limit('join_community', 30, 3600);

  if p_token is not null and trim(p_token) <> '' then
    select g.id, g.visibility, g.member_limit, g.join_requires_approval into v_id, v_vis, v_limit, v_approval
    from public.study_groups g where g.invite_token = trim(p_token) and coalesce(g.is_revhead_group, false);
  elsif p_group_id is not null then
    select g.id, g.visibility, g.member_limit, g.join_requires_approval into v_id, v_vis, v_limit, v_approval
    from public.study_groups g where g.id = p_group_id and coalesce(g.is_revhead_group, false) and g.visibility = 'public';
  end if;
  if v_id is null then return query select 'invalid'::text, null::uuid; return; end if;

  if exists (select 1 from public.group_members m where m.group_id = v_id and m.user_id = auth.uid()) then
    return query select 'already_member'::text, v_id; return;
  end if;
  if exists (select 1 from public.community_join_requests r where r.group_id = v_id and r.user_id = auth.uid() and r.status = 'pending') then
    return query select 'requested'::text, v_id; return;
  end if;
  if v_approval then
    insert into public.community_join_requests (group_id, user_id, note)
    values (v_id, auth.uid(), nullif(left(trim(coalesce(p_note, '')), 120), ''));
    return query select 'requested'::text, v_id; return;
  end if;
  if (select count(*) from public.group_members m where m.group_id = v_id) >= v_limit then
    return query select 'full'::text, v_id; return;
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'member');
  return query select 'joined'::text, v_id;
end;
$$;

create or replace function public.rpc_leave_community(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_community(p_group_id) then raise exception 'Not a community'; end if;
  if public.is_group_admin(p_group_id) then raise exception 'You manage this community'; end if;
  if exists (select 1 from public.community_home h where h.user_id = auth.uid() and h.group_id = p_group_id) then
    raise exception 'This is your Home Community. Change it first.';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
  delete from public.community_schedule_choices where group_id = p_group_id and user_id = auth.uid();
end;
$$;

-- Pick the Home Community. Locked for 30 days after each change.
create or replace function public.rpc_set_home_community(p_group_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_cur record;
  v_until timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_community(p_group_id) or not public.is_group_member(p_group_id) then
    raise exception 'Join that community first';
  end if;
  select * into v_cur from public.community_home where user_id = auth.uid();
  if v_cur.user_id is not null then
    if v_cur.group_id = p_group_id then return v_cur.locked_until; end if;
    if v_cur.locked_until > now()
       and exists (select 1 from public.group_members m where m.group_id = v_cur.group_id and m.user_id = auth.uid()) then
      raise exception 'Your Home Community is locked until %', to_char(v_cur.locked_until at time zone 'utc', 'DD Mon YYYY');
    end if;
  end if;
  insert into public.community_home (user_id, group_id, locked_until, set_at)
  values (auth.uid(), p_group_id, v_until, now())
  on conflict (user_id) do update set group_id = excluded.group_id, locked_until = excluded.locked_until, set_at = now();
  return v_until;
end;
$$;

-- Everything the student's community page shows except the announcement feed
-- (read directly from community_announcements).
create or replace function public.community_detail(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_owner uuid;
  v_week jsonb;
  v_weekly int[] := '{}';
  v_members int;
  v_active int;
  v_total7 bigint;
  v_subjects int;
  v_avg_adh numeric;
begin
  if not public.is_community(p_group_id) or not public.is_group_member(p_group_id) then
    raise exception 'not a member of this community';
  end if;
  select g.owner_id into v_owner from public.study_groups g where g.id = p_group_id;
  select s.week into v_week from public.community_schedules s where s.group_id = p_group_id;
  for i in reverse 6 .. 0 loop
    v_weekly := v_weekly || (public.user_day_study_seconds(auth.uid(), v_today - i, p_group_id) / 60);
  end loop;

  select count(*) into v_members from public.group_members m where m.group_id = p_group_id;
  -- Members' study (any source) over the last 7 days, per member who studied, per day.
  select count(distinct ss.user_id), coalesce(sum(coalesce(ss.total_seconds,
           greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)))), 0)
    into v_active, v_total7
  from public.study_sessions ss
  join public.group_members m on m.user_id = ss.user_id and m.group_id = p_group_id
  where ss.started_at >= (v_today - 6)::timestamp at time zone 'utc';

  if v_week is not null then
    select count(distinct lower(trim(x.item ->> 'subject'))) into v_subjects
    from jsonb_array_elements(v_week) as d(day), jsonb_array_elements(d.day) as x(item)
    where jsonb_typeof(d.day) = 'array' and coalesce(trim(x.item ->> 'subject'), '') <> '';
  else
    select count(distinct lower(trim(ss.subject))) into v_subjects
    from public.study_sessions ss where ss.group_id = p_group_id and ss.started_at >= now() - interval '7 days' and ss.subject is not null;
  end if;

  select avg(a) into v_avg_adh from (
    select public.community_adherence(m.user_id, p_group_id) as a from public.group_members m where m.group_id = p_group_id
  ) x where a is not null;

  return jsonb_build_object(
    'head', jsonb_build_object('name', public.public_display_name(v_owner),
                               'avatar_url', (select p.avatar_url from public.user_profiles p where p.id = v_owner)),
    'member_count', v_members,
    'studying_now', (select count(distinct m.user_id) from public.group_members m
                       join public.study_sessions ss on ss.user_id = m.user_id
                      where m.group_id = p_group_id and ss.ended_at is null and ss.paused_at is null and ss.is_private = false),
    'my', jsonb_build_object(
      'today_minutes', public.user_day_study_seconds(auth.uid(), v_today, p_group_id) / 60,
      'today_sessions', (select count(*) from public.study_sessions ss where ss.user_id = auth.uid() and ss.group_id = p_group_id
                           and (ss.started_at at time zone 'utc')::date = v_today),
      'total_minutes', (select coalesce(sum(coalesce(ss.total_seconds,
                           greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)))), 0) / 60
                         from public.study_sessions ss where ss.user_id = auth.uid() and ss.group_id = p_group_id),
      'total_sessions', (select count(*) from public.study_sessions ss where ss.user_id = auth.uid() and ss.group_id = p_group_id),
      'weekly_minutes', to_jsonb(v_weekly),
      'adherence', public.community_adherence(auth.uid(), p_group_id)
    ),
    'stats', jsonb_build_object(
      'avg_daily_minutes', case when v_active > 0 then round(v_total7 / 60.0 / 7 / v_active) else 0 end,
      'active_subjects', coalesce(v_subjects, 0),
      'avg_adherence', case when v_avg_adh is null then null else round(v_avg_adh) end
    )
  );
end;
$$;

-- Published schedules of the caller's communities + their accept/reject/seen
-- state (drives the Schedule tab and the "new schedule" notification).
create or replace function public.my_community_schedules()
returns table (group_id uuid, name text, week jsonb, published_at timestamptz, published_by_name text,
               choice text, seen_published_at timestamptz, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select s.group_id, g.name, s.week, s.published_at, s.published_by_name, c.choice, c.seen_published_at, (m.role = 'admin')
  from public.community_schedules s
  join public.study_groups g on g.id = s.group_id
  join public.group_members m on m.group_id = s.group_id and m.user_id = auth.uid()
  left join public.community_schedule_choices c on c.group_id = s.group_id and c.user_id = auth.uid();
$$;

-- p_choice: 'accepted' | 'rejected' | null (just mark the current schedule as seen).
-- Only one community schedule can be followed at a time.
create or replace function public.rpc_set_schedule_choice(p_group_id uuid, p_choice text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_published timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_choice is not null and p_choice not in ('accepted', 'rejected') then raise exception 'invalid choice'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not a member of this community'; end if;
  select s.published_at into v_published from public.community_schedules s where s.group_id = p_group_id;
  if p_choice = 'accepted' then
    update public.community_schedule_choices set choice = null
     where user_id = auth.uid() and group_id <> p_group_id and choice = 'accepted';
  end if;
  insert into public.community_schedule_choices (user_id, group_id, choice, seen_published_at, decided_at)
  values (auth.uid(), p_group_id, p_choice, v_published, now())
  on conflict (user_id, group_id) do update
    set choice = case when p_choice is null then public.community_schedule_choices.choice else excluded.choice end,
        seen_published_at = excluded.seen_published_at,
        decided_at = now();
end;
$$;

-- ── WynkoHead side ───────────────────────────────────────────────────────────
create or replace function public.rpc_create_community(p_name text, p_description text default null, p_emoji text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_revhead and p.revhead_status = 'verified') then
    raise exception 'Only approved WynkoHeads can create a community';
  end if;
  if exists (select 1 from public.study_groups g where g.owner_id = auth.uid() and coalesce(g.is_revhead_group, false)) then
    raise exception 'You already run a community';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'Community name must be 1-60 characters'; end if;
  if p_description is not null and char_length(trim(p_description)) > 240 then raise exception 'Description must be at most 240 characters'; end if;

  insert into public.study_groups (name, description, emoji, owner_id, visibility, is_revhead_group, member_limit, join_requires_approval)
  values (v_name, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_emoji, '')), ''), auth.uid(), 'public', true, 5000, true)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

create or replace function public.rpc_publish_community_schedule(p_group_id uuid, p_week jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
begin
  if not public.is_community(p_group_id) or not public.is_group_admin(p_group_id) then raise exception 'Only the WynkoHead can publish'; end if;
  if p_week is null or jsonb_typeof(p_week) <> 'array' or jsonb_array_length(p_week) <> 7 then raise exception 'A schedule needs 7 days'; end if;
  if pg_column_size(p_week) > 200000 then raise exception 'Schedule is too large'; end if;
  insert into public.community_schedules (group_id, week, published_at, published_by, published_by_name)
  values (p_group_id, p_week, v_now, auth.uid(), public.public_display_name(auth.uid()))
  on conflict (group_id) do update set week = excluded.week, published_at = v_now,
    published_by = excluded.published_by, published_by_name = excluded.published_by_name;
  -- Everyone is asked again about the new version.
  update public.community_schedule_choices set choice = null where group_id = p_group_id;
  return v_now;
end;
$$;

create or replace function public.community_join_request_list(p_group_id uuid)
returns table (id uuid, user_id uuid, name text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_admin(p_group_id) then raise exception 'Only the WynkoHead can see join requests'; end if;
  return query
  select r.id, r.user_id, public.public_display_name(r.user_id), r.note, r.created_at
  from public.community_join_requests r
  where r.group_id = p_group_id and r.status = 'pending'
  order by r.created_at;
end;
$$;

create or replace function public.rpc_decide_join_request(p_request_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_limit int;
begin
  select * into v_req from public.community_join_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then return 'gone'; end if;
  if not public.is_group_admin(v_req.group_id) then raise exception 'Only the WynkoHead can decide join requests'; end if;
  if p_approve then
    select member_limit into v_limit from public.study_groups where id = v_req.group_id;
    if (select count(*) from public.group_members where group_id = v_req.group_id) >= v_limit then return 'full'; end if;
    insert into public.group_members (group_id, user_id, role) values (v_req.group_id, v_req.user_id, 'member')
    on conflict do nothing;
  end if;
  update public.community_join_requests
     set status = case when p_approve then 'approved' else 'declined' end, decided_at = now(), decided_by = auth.uid()
   where id = p_request_id;
  return case when p_approve then 'approved' else 'declined' end;
end;
$$;

create or replace function public.community_head_overview(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_members int;
  v_active_today int;
  v_active7 int;
  v_total7 bigint;
  v_avg_adh numeric;
  v_subject text;
  v_live int;
begin
  if not public.is_community(p_group_id) or not public.is_group_admin(p_group_id) then raise exception 'Only the WynkoHead can see this'; end if;
  select count(*) into v_members from public.group_members m where m.group_id = p_group_id and m.role <> 'admin';
  select count(distinct ss.user_id) into v_active_today
  from public.study_sessions ss join public.group_members m on m.user_id = ss.user_id and m.group_id = p_group_id and m.role <> 'admin'
  where (ss.started_at at time zone 'utc')::date = v_today;
  select count(distinct ss.user_id), coalesce(sum(coalesce(ss.total_seconds,
           greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)))), 0)
    into v_active7, v_total7
  from public.study_sessions ss join public.group_members m on m.user_id = ss.user_id and m.group_id = p_group_id and m.role <> 'admin'
  where ss.started_at >= (v_today - 6)::timestamp at time zone 'utc';
  select avg(a) into v_avg_adh from (
    select public.community_adherence(m.user_id, p_group_id) as a from public.group_members m where m.group_id = p_group_id and m.role <> 'admin'
  ) x where a is not null;
  select count(distinct ss.user_id) into v_live
  from public.study_sessions ss join public.group_members m on m.user_id = ss.user_id and m.group_id = p_group_id
  where ss.ended_at is null and ss.paused_at is null and ss.is_private = false;
  select ss.subject into v_subject
  from public.study_sessions ss join public.group_members m on m.user_id = ss.user_id and m.group_id = p_group_id
  where ss.ended_at is null and ss.paused_at is null and ss.is_private = false and ss.subject is not null
  group by ss.subject order by count(*) desc limit 1;
  return jsonb_build_object(
    'members', v_members,
    'active_today', v_active_today,
    'avg_daily_minutes', case when v_active7 > 0 then round(v_total7 / 60.0 / 7 / v_active7) else 0 end,
    'avg_adherence', case when v_avg_adh is null then null else round(v_avg_adh) end,
    'studying_now', v_live,
    'current_subject', v_subject
  );
end;
$$;

create or replace function public.community_student_analytics(p_group_id uuid)
returns table (user_id uuid, name text, avatar_url text, study_minutes integer, sessions integer, streak_days integer,
               revision integer, tasks integer, last_active_at timestamptz, adherence integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if not public.is_community(p_group_id) or not public.is_group_admin(p_group_id) then raise exception 'Only the WynkoHead can see this'; end if;
  return query
  select m.user_id,
    public.public_display_name(m.user_id),
    p.avatar_url,
    (select coalesce(sum(coalesce(ss.total_seconds,
        greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)))), 0) / 60
       from public.study_sessions ss where ss.user_id = m.user_id and ss.started_at >= v_month)::int,
    (select count(*) from public.study_sessions ss where ss.user_id = m.user_id and ss.started_at >= v_month)::int,
    public.study_log_streak(p.study_log),
    coalesce(p.total_reviews_done, 0),
    (select count(*) from public.study_plan_tasks t where t.user_id = m.user_id and t.completed)::int,
    greatest(p.last_active_at, (select max(ss.started_at) from public.study_sessions ss where ss.user_id = m.user_id)),
    public.community_adherence(m.user_id, p_group_id)
  from public.group_members m
  left join public.user_profiles p on p.id = m.user_id
  where m.group_id = p_group_id and m.role <> 'admin'
  order by m.joined_at;
end;
$$;

-- ── Payouts: the 50% floor follows the chosen Home Community ────────────────
create or replace function public.user_primary_group(p_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.group_id from public.community_home h
      where h.user_id = p_user_id
        and exists (select 1 from public.group_members m where m.group_id = h.group_id and m.user_id = p_user_id)),
    (select group_id from public.group_members where user_id = p_user_id order by joined_at asc limit 1)
  );
$$;

-- compute_user_group_time_split (used by aggregate_and_pay_group_owners)
-- gives its primary_group_floor_percent to "the first group ever joined".
-- Swap only that lookup for "the chosen Home Community if still a member,
-- else the first group ever joined"; the rest of the function is untouched.
--
-- Also fixes a pre-existing bug: the function RETURNS TABLE(group_id, ...)
-- and its queries use unqualified group_id, which PL/pgSQL rejects as
-- ambiguous - every call for a user in any group raised
-- 'column reference "group_id" is ambiguous', so the owner payout job could
-- never have run. #variable_conflict use_column makes those references mean
-- the table column, which is what every one of them intends.
-- Fails loudly if the function no longer has the expected line.
do $$
declare
  v_def text := pg_get_functiondef('public.compute_user_group_time_split(uuid)'::regprocedure);
  v_old text := 'select group_id into v_first_group from public.group_first_join_log where user_id = p_user_id;';
  v_new text := 'select coalesce((select h.group_id from public.community_home h where h.user_id = p_user_id and exists (select 1 from public.group_members hm where hm.group_id = h.group_id and hm.user_id = p_user_id)), (select fj.group_id from public.group_first_join_log fj where fj.user_id = p_user_id)) into v_first_group;';
begin
  if position('community_home' in v_def) > 0 then return; end if; -- already applied
  if position(v_old in v_def) = 0 then
    raise exception 'compute_user_group_time_split changed; update migration 0071 by hand';
  end if;
  v_def := replace(v_def, v_old, v_new);
  v_def := regexp_replace(v_def, 'AS \$function\$', 'AS $function$' || chr(10) || '#variable_conflict use_column');
  execute v_def;
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_announcements') then
    alter publication supabase_realtime add table public.community_announcements;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_schedules') then
    alter publication supabase_realtime add table public.community_schedules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_join_requests') then
    alter publication supabase_realtime add table public.community_join_requests;
  end if;
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_community(uuid)', 'public.public_display_name(uuid)', 'public.user_day_study_seconds(uuid, date, uuid)',
    'public.community_adherence(uuid, uuid, integer)', 'public.can_self_join_group(uuid, text)',
    'public.my_communities()', 'public.discover_communities()', 'public.rpc_join_community(uuid, text, text)',
    'public.rpc_leave_community(uuid)', 'public.rpc_set_home_community(uuid)', 'public.community_detail(uuid)',
    'public.my_community_schedules()', 'public.rpc_set_schedule_choice(uuid, text)', 'public.rpc_create_community(text, text, text)',
    'public.rpc_publish_community_schedule(uuid, jsonb)', 'public.community_join_request_list(uuid)',
    'public.rpc_decide_join_request(uuid, boolean)', 'public.community_head_overview(uuid)',
    'public.community_student_analytics(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Internal-only helpers: no client access.
revoke all on function public.user_day_study_seconds(uuid, date, uuid) from authenticated;
revoke all on function public.community_adherence(uuid, uuid, integer) from authenticated;
revoke all on function public.public_display_name(uuid) from authenticated;
