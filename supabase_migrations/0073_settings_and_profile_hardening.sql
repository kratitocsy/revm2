-- Settings module backend + user_profiles hardening.
--
-- 1. Columns the Settings page edits that didn't exist yet.
-- 2. SECURITY FIX: the "own profile update" RLS policy only checks
--    auth.uid() = id and `authenticated` holds UPDATE on every column, so
--    any signed-in user could run
--      update user_profiles set is_admin = true where id = auth.uid()
--    (same for is_moderator, revhead_status, battle_xp, upi_id, ...).
--    A trigger now rejects direct client changes to those columns. Server
--    functions (SECURITY DEFINER, which run as their owner, not as
--    `authenticated`) and the service role are unaffected, so the existing
--    RPCs that legitimately set them (admin_set_moderator,
--    admin_verify_revhead, set_my_username, save_partner_profile,
--    set_my_upi_id, pause_battle, rpc_complete_quiz, ...) keep working.
-- 3. allow_battle_invites: a real, server-enforced opt-out.
-- 4. delete_my_account(): the Settings "Delete account" button.

-- ── 1. Settings columns ─────────────────────────────────────────────────
alter table public.user_profiles add column if not exists bio text;
alter table public.user_profiles add column if not exists school text;
alter table public.user_profiles add column if not exists class_year text;
alter table public.user_profiles add column if not exists course text;
alter table public.user_profiles add column if not exists allow_battle_invites boolean not null default true;
alter table public.user_profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.user_profiles add constraint user_profiles_bio_len_chk check (bio is null or char_length(bio) <= 160);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.user_profiles add constraint user_profiles_school_len_chk check (school is null or char_length(school) <= 100);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.user_profiles add constraint user_profiles_class_year_len_chk check (class_year is null or char_length(class_year) <= 40);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.user_profiles add constraint user_profiles_course_len_chk check (course is null or char_length(course) <= 40);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.user_profiles add constraint user_profiles_preferences_obj_chk
    check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 4096);
exception when duplicate_object then null;
end $$;

-- ── 2. Block direct client writes to privileged columns ─────────────────
create or replace function public.protect_user_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only direct PostgREST writes run as these roles. SECURITY DEFINER
  -- functions run as their owner and the service role is separate, so
  -- both pass through untouched.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_moderator := false;
    new.is_revhead := false;
    new.revhead_status := 'none';
    new.revhead_applied_at := null;
    new.revhead_verified_at := null;
    new.revhead_code := null;
    new.referred_by_revhead_id := null;
    new.upi_id := null;
    new.battle_xp := 0;
    new.partner_reports_count := 0;
    new.partner_needs_review := false;
    new.gender_unlocked := false;
    new.gender_unlocked_at := null;
    new.telegram_user_id := null;
    new.telegram_chat_id := null;
    new.telegram_linked := false;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.is_admin is distinct from old.is_admin
     or new.is_moderator is distinct from old.is_moderator
     or new.is_revhead is distinct from old.is_revhead
     or new.revhead_status is distinct from old.revhead_status
     or new.revhead_applied_at is distinct from old.revhead_applied_at
     or new.revhead_verified_at is distinct from old.revhead_verified_at
     or new.revhead_code is distinct from old.revhead_code
     or new.referred_by_code is distinct from old.referred_by_code
     or new.referred_by_revhead_id is distinct from old.referred_by_revhead_id
     or new.upi_id is distinct from old.upi_id
     or new.battle_xp is distinct from old.battle_xp
     or new.username is distinct from old.username
     or new.has_custom_username is distinct from old.has_custom_username
     or new.gender is distinct from old.gender
     or new.dob is distinct from old.dob
     or new.gender_unlocked is distinct from old.gender_unlocked
     or new.gender_unlocked_at is distinct from old.gender_unlocked_at
     or new.partner_setup_complete is distinct from old.partner_setup_complete
     or new.partner_reports_count is distinct from old.partner_reports_count
     or new.partner_needs_review is distinct from old.partner_needs_review
     or new.quiz_answers is distinct from old.quiz_answers
     or new.archetype is distinct from old.archetype
     or new.quiz_completed_at is distinct from old.quiz_completed_at
     or new.telegram_user_id is distinct from old.telegram_user_id
     or new.telegram_chat_id is distinct from old.telegram_chat_id
     or new.telegram_linked is distinct from old.telegram_linked
  then
    raise exception 'permission denied: that profile field can only be changed by the server'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists user_profiles_protect_privileged on public.user_profiles;
create trigger user_profiles_protect_privileged
  before insert or update on public.user_profiles
  for each row execute function public.protect_user_profile_privileged_columns();

-- ── 3. Battle invite opt-out, enforced server-side ──────────────────────
create or replace function public.send_battle_challenge(p_to_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row battle_invitations;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_to_user then raise exception 'cannot challenge yourself'; end if;

  if not coalesce((select allow_battle_invites from user_profiles where id = p_to_user), false) then
    raise exception 'this user isn''t accepting battle invites';
  end if;

  if exists (
    select 1 from battles
    where status in ('pending','active')
      and ((player_a = v_me or player_b = v_me) or (player_a = p_to_user or player_b = p_to_user))
  ) then
    raise exception 'a battle is already in progress';
  end if;

  if exists (
    select 1 from battle_invitations
    where status = 'pending' and from_user = v_me
  ) then
    raise exception 'you already have a pending challenge out';
  end if;

  insert into battle_invitations(from_user, to_user)
  values (v_me, p_to_user)
  returning * into v_row;

  return to_json(v_row);
end;
$$;

create or replace function public.search_battle_opponents(p_query text default '', p_limit int default 20)
returns table(id uuid, username text, avatar_url text, battle_xp int, title text)
language sql
security definer
set search_path = public
stable
as $$
  select up.id, up.username, up.avatar_url, coalesce(up.battle_xp,0) as battle_xp,
    battle_title_for_xp(coalesce(up.battle_xp,0)) as title
  from user_profiles up
  where up.id <> auth.uid()
    and up.username is not null
    and up.allow_battle_invites
    and (nullif(trim(p_query), '') is null or up.username ilike '%' || trim(p_query) || '%')
  order by up.username
  limit greatest(1, least(p_limit, 50));
$$;

-- Advisor warning (function_search_path_mutable).
alter function public.battle_title_for_xp(int) set search_path = public;

-- ── 4. Account deletion ──────────────────────────────────────────────────
-- Deleting the auth.users row cascades to user_profiles and everything
-- keyed to it. The few references that don't cascade are cleared first; a
-- user who still owns a community or study room must hand it over first,
-- since deleting it would take every other member's group with it.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_owned int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'type DELETE to confirm'; end if;

  select count(*) into v_owned from study_groups where owner_id = v_me;
  if v_owned > 0 then
    raise exception 'You still own % community/study room(s). Leave them (ownership passes to another member) or delete them first.', v_owned;
  end if;

  update study_groups set system_owner_id = null where system_owner_id = v_me;
  update user_profiles set referred_by_revhead_id = null where referred_by_revhead_id = v_me;
  update pledge_appeals set reviewer_id = null where reviewer_id = v_me;
  update site_config set updated_by = null where updated_by = v_me;
  delete from group_challenges where created_by = v_me;
  delete from gvg_challenges where created_by = v_me;
  delete from user_milestone_log where user_id = v_me;

  delete from auth.users where id = v_me;
end;
$$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ── 5. Battleground RPCs are for signed-in users only ────────────────────
-- 0062 left them executable by `anon` (Postgres grants EXECUTE to PUBLIC by
-- default). They all reject or return nothing without a user, but there's
-- no reason for them to be reachable signed-out.
revoke execute on function public.get_battleground_state() from public, anon;
revoke execute on function public.get_friends_battle_xp(uuid[]) from public, anon;
revoke execute on function public.get_battle_history(int) from public, anon;
revoke execute on function public.send_battle_challenge(uuid) from public, anon;
revoke execute on function public.cancel_battle_challenge(uuid) from public, anon;
revoke execute on function public.respond_battle_challenge(uuid, boolean) from public, anon;
revoke execute on function public.ready_battle(uuid) from public, anon;
revoke execute on function public.cancel_pending_battle(uuid) from public, anon;
revoke execute on function public.pause_battle(uuid) from public, anon;
revoke execute on function public.search_battle_opponents(text, int) from public, anon;
revoke execute on function public.get_top_battlers(int) from public, anon;
grant execute on function public.get_battleground_state(), public.get_friends_battle_xp(uuid[]), public.get_battle_history(int),
  public.send_battle_challenge(uuid), public.cancel_battle_challenge(uuid), public.respond_battle_challenge(uuid, boolean),
  public.ready_battle(uuid), public.cancel_pending_battle(uuid), public.pause_battle(uuid),
  public.search_battle_opponents(text, int), public.get_top_battlers(int) to authenticated;
