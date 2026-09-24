-- Home Community assignment rules.
--   * Member of exactly one community  -> it's automatically their Home
--     Community (not locked, marked chosen = false).
--   * Member of two or more            -> they must pick one themselves
--     (the app blocks until they do); an explicit pick locks for 30 days.
--   * Leaving/removal from the Home Community clears it, and the rules
--     above are re-applied.

alter table public.community_home add column if not exists chosen boolean not null default true;

-- Explicit pick: marks chosen and locks for 30 days. An automatic
-- (chosen = false) home never blocks a change.
create or replace function public.rpc_set_home_community(p_group_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
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
    if v_cur.group_id = p_group_id and v_cur.chosen then
      return v_cur.locked_until;
    end if;
    if v_cur.chosen and v_cur.locked_until > now()
       and exists (select 1 from public.group_members m where m.group_id = v_cur.group_id and m.user_id = auth.uid()) then
      raise exception 'Your Home Community is locked until %', to_char(v_cur.locked_until at time zone 'utc', 'DD Mon YYYY');
    end if;
  end if;
  insert into public.community_home (user_id, group_id, locked_until, set_at, chosen)
  values (auth.uid(), p_group_id, v_until, now(), true)
  on conflict (user_id) do update
    set group_id = excluded.group_id, locked_until = excluded.locked_until, set_at = now(), chosen = true;
  return v_until;
end;
$$;

-- Re-applies the rules for one user after their community memberships change.
create or replace function public.ensure_home_community(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_only uuid;
begin
  if p_user_id is null then return; end if;

  -- A home they're no longer a member of doesn't count.
  delete from public.community_home h
   where h.user_id = p_user_id
     and not exists (select 1 from public.group_members m where m.group_id = h.group_id and m.user_id = p_user_id);

  select count(*), min(m.group_id::text)::uuid into v_count, v_only
    from public.group_members m
    join public.study_groups g on g.id = m.group_id
   where m.user_id = p_user_id and coalesce(g.is_revhead_group, false);

  if v_count = 1 then
    insert into public.community_home (user_id, group_id, locked_until, set_at, chosen)
    values (p_user_id, v_only, now(), now(), false)
    on conflict (user_id) do nothing;
  end if;
end;
$$;
revoke all on function public.ensure_home_community(uuid) from public, anon, authenticated;

create or replace function public.group_members_home_community_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_community(new.group_id) then
      perform public.ensure_home_community(new.user_id);
    end if;
    return null;
  end if;
  perform public.ensure_home_community(old.user_id);
  return null;
end;
$$;

drop trigger if exists trg_group_members_home_community on public.group_members;
create trigger trg_group_members_home_community
  after insert or delete on public.group_members
  for each row execute function public.group_members_home_community_sync();

-- Existing members.
do $$
declare u uuid;
begin
  for u in select distinct m.user_id from public.group_members m join public.study_groups g on g.id = m.group_id where coalesce(g.is_revhead_group, false)
  loop
    perform public.ensure_home_community(u);
  end loop;
end $$;
