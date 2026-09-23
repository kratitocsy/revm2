-- Study Rooms (desktop dashboard) on the real groups backend.
--
-- The dashboard's Study Rooms were mock data (8 hardcoded rooms with their
-- passwords in the bundle, scripted bot participants, local-only chat and
-- join state). They now run on the same tables groups.html uses:
--   study_groups    = rooms           group_members = who joined
--   group_messages  = room chat       study_sessions.group_id = time studied in a room
-- This migration only adds what the Study Rooms UI needs on top of that:
--
--   study_groups.subject         the room's subject (list filter / card text)
--   study_room_secrets           bcrypt hash of a private room's join password.
--                                A separate table with RLS and NO policies, so
--                                the hash is unreachable from the client even
--                                though groups.html does `select *` on study_groups.
--   list_study_rooms()           the rooms list: public rooms, private rooms that
--                                have a password (joinable from the list), and
--                                every room the caller is in - with member/live
--                                counts that RLS would otherwise hide from non-members.
--   rpc_create_study_room(...)   create + become admin, optional password.
--   rpc_join_study_room(...)     join a public room, or a private one with its
--                                password (rate-limited; wrong password is a
--                                returned status, not an error, so the attempt
--                                is still counted by enforce_rate_limit).
--   rpc_leave_study_room(...)    leave; an admin leaving hands the room to the
--                                longest-standing member.
--   room_members(...)            members of a room the caller is in, with the
--                                public bits of their profile (name, avatar) and
--                                their live study state (from group_live_totals).
--                                user_profiles itself stays own-row-only.

-- ── Columns / secrets ────────────────────────────────────────────────────────
alter table public.study_groups
  add column if not exists subject text check (subject is null or char_length(subject) <= 60);

create table if not exists public.study_room_secrets (
  group_id uuid primary key references public.study_groups(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.study_room_secrets enable row level security;
-- (no policies on purpose: only the security-definer functions below read it)
revoke all on public.study_room_secrets from anon, authenticated;

-- ── List ─────────────────────────────────────────────────────────────────────
create or replace function public.list_study_rooms()
returns table (
  id uuid, name text, description text, subject text, visibility text,
  has_password boolean, is_official boolean, member_count integer, member_limit integer,
  live_count integer, is_member boolean, my_role text, preview_initials text[], created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
    -- Initials of up to 4 members (no names/ids/avatars) for the card's face pile.
    -- Private rooms only show them to their own members.
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
  where (m.group_id is not null)
     or ((g.visibility = 'public' or s.group_id is not null) and (coalesce(c.n, 0) > 0 or coalesce(g.is_official, false)))
  order by (m.group_id is not null) desc, coalesce(l.n, 0) desc, coalesce(c.n, 0) desc, g.created_at desc
  limit 200;
end;
$$;

-- ── Create ───────────────────────────────────────────────────────────────────
create or replace function public.rpc_create_study_room(
  p_name text, p_description text, p_subject text, p_is_public boolean, p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'Room name must be 1-60 characters'; end if;
  if v_desc is not null and char_length(v_desc) > 200 then raise exception 'Description must be at most 200 characters'; end if;
  if v_subject is not null and char_length(v_subject) > 60 then raise exception 'Subject must be at most 60 characters'; end if;
  if not coalesce(p_is_public, true) and (p_password is null or char_length(p_password) < 4 or char_length(p_password) > 64) then
    raise exception 'Private rooms need a password of 4-64 characters';
  end if;
  perform public.enforce_rate_limit('create_study_room', 5, 3600);

  insert into public.study_groups (name, description, subject, owner_id, visibility)
  values (v_name, v_desc, v_subject, auth.uid(), case when coalesce(p_is_public, true) then 'public' else 'private' end)
  returning id into v_id;

  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');

  if not coalesce(p_is_public, true) then
    insert into public.study_room_secrets (group_id, password_hash) values (v_id, crypt(p_password, gen_salt('bf')));
  end if;
  return v_id;
end;
$$;

-- ── Join ─────────────────────────────────────────────────────────────────────
-- Returns 'joined' | 'already_member' | 'wrong_password' | 'full' | 'invite_only'.
create or replace function public.rpc_join_study_room(p_group_id uuid, p_password text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vis text;
  v_limit int;
  v_hash text;
  v_count int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select g.visibility, g.member_limit into v_vis, v_limit from public.study_groups g where g.id = p_group_id;
  if v_vis is null then raise exception 'Room not found'; end if;

  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then
    return 'already_member';
  end if;

  if v_vis <> 'public' then
    select s.password_hash into v_hash from public.study_room_secrets s where s.group_id = p_group_id;
    if v_hash is null then return 'invite_only'; end if;
    -- 10 password attempts per 15 minutes per user (raises once exceeded).
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

-- ── Leave ────────────────────────────────────────────────────────────────────
create or replace function public.rpc_leave_study_room(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_next uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  delete from public.group_members
   where group_id = p_group_id and user_id = auth.uid()
  returning role into v_role;

  -- An admin leaving hands the room to whoever has been in it longest, so a
  -- room never ends up with members but no one who can manage it.
  if v_role = 'admin' and not exists (
    select 1 from public.group_members where group_id = p_group_id and role = 'admin'
  ) then
    select gm.user_id into v_next from public.group_members gm
     where gm.group_id = p_group_id order by gm.joined_at limit 1;
    if v_next is not null then
      update public.group_members set role = 'admin' where group_id = p_group_id and user_id = v_next;
      update public.study_groups set owner_id = v_next where id = p_group_id;
    end if;
  end if;
end;
$$;

-- ── Members (inside a room) ──────────────────────────────────────────────────
create or replace function public.room_members(p_group_id uuid)
returns table (
  user_id uuid, name text, avatar_url text, role text, joined_at timestamptz, is_me boolean,
  is_live boolean, is_paused boolean, started_at timestamptz, paused_at timestamptz,
  accumulated_paused_seconds integer, subject text, today_seconds integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this room';
  end if;

  return query
  select
    gm.user_id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), ''), p.username, 'Member'),
    p.avatar_url,
    gm.role,
    gm.joined_at,
    gm.user_id = auth.uid(),
    coalesce(t.is_live, false), coalesce(t.is_paused, false),
    t.started_at, t.paused_at, t.accumulated_paused_seconds, t.subject,
    coalesce(t.today_seconds, 0)
  from public.group_members gm
  left join public.user_profiles p on p.id = gm.user_id
  left join public.group_live_totals(p_group_id) t on t.user_id = gm.user_id
  where gm.group_id = p_group_id
  order by coalesce(t.is_live, false) desc, gm.joined_at;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Joins/leaves/kicks show up live inside a room. group_members' select policy
-- (is_group_member) still decides who receives which rows.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members') then
    alter publication supabase_realtime add table public.group_members;
  end if;
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke all on function public.list_study_rooms() from public, anon;
revoke all on function public.rpc_create_study_room(text, text, text, boolean, text) from public, anon;
revoke all on function public.rpc_join_study_room(uuid, text) from public, anon;
revoke all on function public.rpc_leave_study_room(uuid) from public, anon;
revoke all on function public.room_members(uuid) from public, anon;
grant execute on function public.list_study_rooms() to authenticated;
grant execute on function public.rpc_create_study_room(text, text, text, boolean, text) to authenticated;
grant execute on function public.rpc_join_study_room(uuid, text) to authenticated;
grant execute on function public.rpc_leave_study_room(uuid) to authenticated;
grant execute on function public.room_members(uuid) to authenticated;
