-- Owners and the invite-only allowlist become separate lists.
--
--   platform_owner_emails()  - Owner Control and every owner power: now only
--                              wynko1010@gmail.com
--   app_allowlist_emails()   - who may sign up / sign in while Wynko is
--                              invite-only (0086): the five original accounts.
--                              Owners are always allowed as well.
--
-- The other four accounts become ordinary users: they lose Owner Control,
-- the admin page and owner RPCs, and any leftover admin / moderator flag.
--
-- Both email lists are STABLE (not IMMUTABLE) so no cached plan can keep
-- an old list after a change like this one.

create or replace function public.platform_owner_emails()
returns text[]
language sql
stable
set search_path = public
as $$ select array['wynko1010@gmail.com']::text[] $$;

create or replace function public.app_allowlist_emails()
returns text[]
language sql
stable
set search_path = public
as $$
  select array[
    'kiarase2288@gmail.com',
    'jatinsinsinwar7@gmail.com',
    'jatinsinsinwar18@gmail.com',
    'peacefuldraft@gmail.com',
    'wynko1010@gmail.com'
  ]::text[]
$$;
revoke execute on function public.platform_owner_emails() from public, anon, authenticated;
revoke execute on function public.app_allowlist_emails() from public, anon, authenticated;

-- Allowlisted = confirmed email on the allowlist, or an owner.
create or replace function public.is_allowlisted_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner_account(p_user_id) or exists (
    select 1 from auth.users u
     where u.id = p_user_id
       and u.email_confirmed_at is not null
       and lower(u.email) = any (public.app_allowlist_emails())
  );
$$;
revoke execute on function public.is_allowlisted_account(uuid) from public, anon, authenticated;

-- Invite-only checks (0086) now use the allowlist instead of the owner list.
create or replace function public.app_user_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select not public.app_invite_only() or public.is_allowlisted_account(p_user_id) $$;

create or replace function public.app_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.app_invite_only()
      or lower(coalesce(p_email, '')) = any (public.app_allowlist_emails() || public.platform_owner_emails())
$$;
revoke execute on function public.app_user_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.app_email_allowed(text) from public, anon, authenticated;

create or replace function public.owner_app_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  select jsonb_build_object(
    'invite_only', public.app_invite_only(),
    'updated_at', (select updated_at from public.site_config where key = 'app_access'),
    'updated_by', (select public.owner_user_label(updated_by) from public.site_config where key = 'app_access'),
    'allowlist', (
      select jsonb_agg(jsonb_build_object(
               'email', e,
               'is_owner', e = any (public.platform_owner_emails()),
               'has_account', u.id is not null,
               'confirmed', u.email_confirmed_at is not null,
               'username', p.username,
               'last_active_at', p.last_active_at) order by ord)
        from unnest(public.app_allowlist_emails()) with ordinality as l(e, ord)
        left join auth.users u on lower(u.email) = l.e
        left join public.user_profiles p on p.id = u.id),
    'other_accounts', (select count(*) from auth.users u where not public.is_allowlisted_account(u.id)),
    'other_signed_in', (select count(distinct s.user_id) from auth.sessions s where not public.is_allowlisted_account(s.user_id))
  ) into v;
  return v;
end;
$$;

create or replace function public.owner_set_app_access(p_invite_only boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signed_out int := 0;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  if p_invite_only is null then raise exception 'choose invite-only or open'; end if;

  insert into public.site_config (key, value, updated_at, updated_by)
  values ('app_access', jsonb_build_object('invite_only', p_invite_only), now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  if p_invite_only then
    select count(distinct s.user_id) into v_signed_out
      from auth.sessions s where not public.is_allowlisted_account(s.user_id);
    delete from auth.refresh_tokens t
     where not public.is_allowlisted_account(t.user_id::uuid);
    delete from auth.sessions s
     where not public.is_allowlisted_account(s.user_id);
  end if;

  perform public.owner_log('access', 'app', null,
    case when p_invite_only then 'Invite-only' else 'Open to everyone' end, null,
    jsonb_build_object('invite_only', p_invite_only, 'signed_out', v_signed_out));

  return jsonb_build_object('invite_only', p_invite_only, 'signed_out', v_signed_out);
end;
$$;

-- The four former owners are ordinary users now.
update public.user_profiles
   set is_admin = false, is_moderator = false
 where (is_admin or is_moderator)
   and not public.is_platform_owner_account(id);
