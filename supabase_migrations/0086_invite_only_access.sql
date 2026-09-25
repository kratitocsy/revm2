-- Invite-only access, with an owner switch to open Wynko to everyone.
--
-- While invite-only (the default), only the platform owner accounts
-- (platform_owner_emails(), 0085) can sign up, sign in or stay signed in:
--   * auth.users BEFORE INSERT     - no new accounts for any other email
--                                    (email/password, Google, Telegram...)
--   * auth.refresh_tokens BEFORE INSERT - no sign-in and no token refresh
--                                    for any other account; every sign-in
--                                    and every refresh writes a refresh token
-- Both are enforced by Supabase Auth's own writes, so no page, app or edge
-- function can get around them. Owners switch it from owner.html (Access).
--
-- Switching back to invite-only also signs every non-owner out (their
-- sessions are deleted; an access token already handed out lasts up to its
-- normal expiry, then can't be refreshed).
--
-- (site_config.launch_gate is an older flag nothing reads; left as is.)

insert into public.site_config (key, value, updated_at)
values ('app_access', '{"invite_only": true}'::jsonb, now())
on conflict (key) do nothing;

-- Missing or unreadable setting = invite-only (fail closed).
create or replace function public.app_invite_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value->>'invite_only')::boolean from public.site_config where key = 'app_access'), true)
$$;

create or replace function public.app_user_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select not public.app_invite_only() or public.is_platform_owner_account(p_user_id) $$;

create or replace function public.app_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select not public.app_invite_only() or lower(coalesce(p_email, '')) = any (public.platform_owner_emails()) $$;

revoke execute on function public.app_user_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.app_email_allowed(text) from public, anon, authenticated;
revoke execute on function public.app_invite_only() from public, anon, authenticated;

-- ── Enforcement on Supabase Auth's own tables ────────────────────────────
create or replace function public.enforce_app_access_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_email_allowed(new.email) then
    raise exception 'wynko is invite-only: sign-ups are closed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_app_access_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and not public.app_user_allowed(new.user_id::uuid) then
    raise exception 'wynko is invite-only: sign-in is closed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_app_access_signup() from public, anon, authenticated;
revoke execute on function public.enforce_app_access_session() from public, anon, authenticated;

drop trigger if exists enforce_app_access_signup on auth.users;
create trigger enforce_app_access_signup
  before insert on auth.users
  for each row execute function public.enforce_app_access_signup();

drop trigger if exists enforce_app_access_session on auth.refresh_tokens;
create trigger enforce_app_access_session
  before insert on auth.refresh_tokens
  for each row execute function public.enforce_app_access_session();

-- ── Status for pages ─────────────────────────────────────────────────────
-- Login page: is Wynko invite-only right now? (no details beyond that)
create or replace function public.app_access_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select jsonb_build_object('invite_only', public.app_invite_only()) $$;
grant execute on function public.app_access_status() to anon, authenticated;

-- Signed-in page: may this account use the app?
create or replace function public.my_app_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select jsonb_build_object('invite_only', public.app_invite_only(), 'allowed', public.app_user_allowed(auth.uid())) $$;
revoke execute on function public.my_app_access() from public, anon;
grant execute on function public.my_app_access() to authenticated;

-- ── Owner switch ─────────────────────────────────────────────────────────
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
               'has_account', u.id is not null,
               'confirmed', u.email_confirmed_at is not null,
               'username', p.username,
               'last_active_at', p.last_active_at) order by ord)
        from unnest(public.platform_owner_emails()) with ordinality as l(e, ord)
        left join auth.users u on lower(u.email) = l.e
        left join public.user_profiles p on p.id = u.id),
    'other_accounts', (select count(*) from auth.users u where not public.is_platform_owner_account(u.id)),
    'other_signed_in', (select count(distinct s.user_id) from auth.sessions s where not public.is_platform_owner_account(s.user_id))
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
      from auth.sessions s where not public.is_platform_owner_account(s.user_id);
    delete from auth.refresh_tokens t
     where not public.is_platform_owner_account(t.user_id::uuid);
    delete from auth.sessions s
     where not public.is_platform_owner_account(s.user_id);
  end if;

  perform public.owner_log('access', 'app', null,
    case when p_invite_only then 'Invite-only' else 'Open to everyone' end, null,
    jsonb_build_object('invite_only', p_invite_only, 'signed_out', v_signed_out));

  return jsonb_build_object('invite_only', p_invite_only, 'signed_out', v_signed_out);
end;
$$;

revoke execute on function public.owner_app_access() from public, anon;
grant execute on function public.owner_app_access() to authenticated;
revoke execute on function public.owner_set_app_access(boolean) from public, anon;
grant execute on function public.owner_set_app_access(boolean) to authenticated;

-- ── Sign everyone else out now ───────────────────────────────────────────
delete from auth.refresh_tokens t where not public.is_platform_owner_account(t.user_id::uuid);
delete from auth.sessions s where not public.is_platform_owner_account(s.user_id);
