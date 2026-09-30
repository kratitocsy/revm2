-- Communities: public ones are free to enter, private ones need the
-- WynkoHead's password.
--
-- Before: every community was created public with join_requires_approval
-- on, so joining always sent a request the WynkoHead had to approve.
-- After:
--   * public  -> anyone joins instantly (no request).
--   * private -> listed with a lock; joining needs the password the
--                WynkoHead set (bcrypt hash in study_room_secrets, the
--                same table private study rooms use). The invite link
--                still lets someone in directly, since the WynkoHead
--                shared it.
--   rpc_set_community_access(group, private, password) switches between them.

-- 1. Existing communities become free to enter; people already waiting are let in.
update public.study_groups set join_requires_approval = false
where coalesce(is_revhead_group, false) and join_requires_approval;

insert into public.group_members (group_id, user_id, role)
select r.group_id, r.user_id, 'member'
from public.community_join_requests r
join public.study_groups g on g.id = r.group_id
where r.status = 'pending'
  and (select count(*) from public.group_members m where m.group_id = r.group_id) < g.member_limit
on conflict do nothing;

update public.community_join_requests r set status = 'approved', decided_at = now()
where r.status = 'pending'
  and exists (select 1 from public.group_members m where m.group_id = r.group_id and m.user_id = r.user_id);

-- 2. New communities start public and free to enter.
create or replace function public.rpc_create_community(p_name text, p_description text default null, p_emoji text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'Community name must be 1-60 characters'; end if;
  if p_description is not null and char_length(trim(p_description)) > 240 then raise exception 'Description must be at most 240 characters'; end if;
  insert into public.study_groups (name, description, emoji, owner_id, visibility, is_revhead_group, member_limit, join_requires_approval, referrer_id)
  values (v_name, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_emoji, '')), ''), auth.uid(), 'public', true, 5000, false,
          (select referred_by_user_id from public.user_profiles where id = auth.uid()))
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

-- 3. Public / private switch (WynkoHead only).
create or replace function public.rpc_set_community_access(p_group_id uuid, p_private boolean, p_password text default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.study_groups g where g.id = p_group_id and coalesce(g.is_revhead_group, false)) then
    raise exception 'Community not found';
  end if;
  if not public.is_group_admin(p_group_id) then raise exception 'Only the WynkoHead can change who can join'; end if;
  if p_private then
    if p_password is null or char_length(p_password) < 4 or char_length(p_password) > 64 then
      -- Keeping private with the current password is fine.
      if p_password is null and exists (select 1 from public.study_room_secrets s where s.group_id = p_group_id) then
        update public.study_groups set visibility = 'private', join_requires_approval = false where id = p_group_id;
        return 'private';
      end if;
      raise exception 'Password must be 4-64 characters';
    end if;
    insert into public.study_room_secrets (group_id, password_hash, updated_at)
    values (p_group_id, crypt(p_password, gen_salt('bf')), now())
    on conflict (group_id) do update set password_hash = excluded.password_hash, updated_at = now();
    update public.study_groups set visibility = 'private', join_requires_approval = false where id = p_group_id;
    return 'private';
  end if;
  delete from public.study_room_secrets where group_id = p_group_id;
  update public.study_groups set visibility = 'public', join_requires_approval = false where id = p_group_id;
  return 'public';
end;
$$;
revoke all on function public.rpc_set_community_access(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_set_community_access(uuid, boolean, text) to authenticated;

-- 4. Joining: public instantly, private with the password, invite link directly.
drop function if exists public.rpc_join_community(uuid, text, text);
create function public.rpc_join_community(p_group_id uuid default null, p_token text default null, p_note text default null, p_password text default null)
returns table(status text, group_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_vis text;
  v_limit int;
  v_approval boolean;
  v_hash text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.enforce_rate_limit('join_community', 30, 3600);
  if p_token is not null and trim(p_token) <> '' then
    select g.id, g.visibility, g.member_limit, g.join_requires_approval into v_id, v_vis, v_limit, v_approval
    from public.study_groups g where g.invite_token = trim(p_token) and coalesce(g.is_revhead_group, false);
  elsif p_group_id is not null then
    select g.id, g.visibility, g.member_limit, g.join_requires_approval into v_id, v_vis, v_limit, v_approval
    from public.study_groups g where g.id = p_group_id and coalesce(g.is_revhead_group, false);
    if v_id is not null and v_vis <> 'public' then
      select s.password_hash into v_hash from public.study_room_secrets s where s.group_id = v_id;
      if v_hash is null then v_id := null;  -- private with no password: invite link only
      elsif not exists (select 1 from public.group_members m where m.group_id = v_id and m.user_id = auth.uid()) then
        if p_password is null or p_password = '' then return query select 'password_required'::text, v_id; return; end if;
        perform public.enforce_rate_limit('community_password', 10, 900);
        if crypt(p_password, v_hash) <> v_hash then return query select 'wrong_password'::text, v_id; return; end if;
      end if;
    end if;
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
revoke all on function public.rpc_join_community(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_join_community(uuid, text, text, text) to authenticated;

-- 5. Discover lists private communities that have a password too, marked private.
drop function if exists public.discover_communities();
create function public.discover_communities()
returns table(id uuid, name text, description text, emoji text, member_count integer, head_name text, join_requires_approval boolean, requested boolean, is_private boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select g.id, g.name, g.description, g.emoji,
    (select count(*)::int from public.group_members x where x.group_id = g.id) as n,
    public.public_display_name(g.owner_id),
    g.join_requires_approval,
    exists (select 1 from public.community_join_requests r where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'),
    g.visibility <> 'public'
  from public.study_groups g
  where coalesce(g.is_revhead_group, false)
    and (g.visibility = 'public' or exists (select 1 from public.study_room_secrets s where s.group_id = g.id))
    and not exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = auth.uid())
  order by n desc, g.created_at desc
  limit 30;
end;
$$;
revoke all on function public.discover_communities() from public, anon;
grant execute on function public.discover_communities() to authenticated;
