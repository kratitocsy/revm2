-- Monetised community ownership carries WynkoHead status with it.
--
-- When the owner of a MONETISED community hands it to someone else, the new
-- owner becomes a WynkoHead ("inherited") and the community keeps earning
-- (it shows the verified tick in the app while monetised). Inherited status
-- lasts only while that person owns a monetised community: it's revoked
-- automatically when they transfer it away, switch monetisation off, or the
-- community is deleted. WynkoHeads approved by an admin keep their status
-- regardless.

alter table public.user_profiles add column if not exists revhead_via text;
do $$
begin
  alter table public.user_profiles add constraint user_profiles_revhead_via_chk
    check (revhead_via is null or revhead_via in ('approved', 'inherited'));
exception when duplicate_object then null;
end $$;
update public.user_profiles set revhead_via = 'approved'
 where is_revhead and revhead_status = 'verified' and revhead_via is null;

-- revhead_via is server-managed like the other WynkoHead columns (0073).
create or replace function public.protect_user_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.is_moderator := false;
    new.is_revhead := false;
    new.revhead_status := 'none';
    new.revhead_via := null;
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
     or new.revhead_via is distinct from old.revhead_via
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

-- Admin approval now records how the status was earned.
create or replace function public.admin_verify_revhead(p_user_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  if not p_approve then
    update public.user_profiles set revhead_status = 'rejected' where id = p_user_id;
    return null;
  end if;

  select revhead_code into v_code from public.user_profiles where id = p_user_id;
  while v_code is null and v_tries < 5 loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
    if exists (select 1 from public.user_profiles where revhead_code = v_code) then
      v_code := null;
    end if;
    v_tries := v_tries + 1;
  end loop;

  update public.user_profiles
  set is_revhead = true,
      revhead_status = 'verified',
      revhead_via = 'approved',
      revhead_verified_at = now(),
      revhead_code = coalesce(revhead_code, v_code)
  where id = p_user_id;

  return (select revhead_code from public.user_profiles where id = p_user_id);
end;
$$;

-- Revokes INHERITED status from someone who no longer owns a monetised
-- community. Admin-approved WynkoHeads are never touched here.
create or replace function public.sync_inherited_wynkohead(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  update public.user_profiles
     set is_revhead = false, revhead_status = 'none', revhead_via = null, revhead_verified_at = null
   where id = p_user_id
     and revhead_via = 'inherited'
     and not exists (
       select 1 from public.study_groups g
        where g.owner_id = p_user_id and coalesce(g.is_revhead_group, false) and g.monetization_enabled
     );
end;
$$;
revoke all on function public.sync_inherited_wynkohead(uuid) from public, anon, authenticated;

-- BEFORE: a monetised community changing hands promotes the new owner, so
-- it stays monetised. SECURITY DEFINER so it can write the new owner's
-- profile (their row, and a server-only column).
create or replace function public.enforce_revhead_group_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.monetization_enabled and not coalesce(new.is_revhead_group, false) then
    new.monetization_enabled := false;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id
     and old.monetization_enabled and new.monetization_enabled then
    update public.user_profiles
       set is_revhead = true,
           revhead_status = 'verified',
           revhead_via = 'inherited',
           revhead_verified_at = now()
     where id = new.owner_id
       and not (is_revhead and revhead_status = 'verified');
  end if;

  if new.monetization_enabled and not exists (
    select 1 from public.user_profiles where id = new.owner_id and is_revhead and revhead_status = 'verified'
  ) then
    new.monetization_enabled := false;
  end if;
  if not new.monetization_enabled then
    new.monetization_enabled_at := null;
  end if;
  return new;
end;
$$;

-- AFTER: whoever might have just lost their monetised community (previous
-- owner on transfer, owner on switch-off, owner on delete) is re-checked.
create or replace function public.study_groups_sync_wynkoheads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_inherited_wynkohead(old.owner_id);
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    perform public.sync_inherited_wynkohead(new.owner_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_study_groups_sync_wynkoheads on public.study_groups;
create trigger trg_study_groups_sync_wynkoheads
  after update of owner_id, monetization_enabled, is_revhead_group or delete on public.study_groups
  for each row execute function public.study_groups_sync_wynkoheads();

-- Community ownership only moves through rpc_transfer_community_ownership()
-- (clients could previously rewrite owner_id directly as a group admin).
create or replace function public.protect_study_group_monetization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.monetization_enabled := false;
    new.monetization_enabled_at := null;
    return new;
  end if;
  if (new.monetization_enabled and not old.monetization_enabled)
     or (new.monetization_enabled_at is not null and new.monetization_enabled_at is distinct from old.monetization_enabled_at) then
    raise exception 'permission denied: use the monetisation program setting to change this' using errcode = '42501';
  end if;
  if coalesce(old.is_revhead_group, false) and new.owner_id is distinct from old.owner_id then
    raise exception 'permission denied: use Transfer ownership to hand over a community' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Transfer ownership ───────────────────────────────────────────────────
create or replace function public.rpc_transfer_community_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select owner_id into v_owner from public.study_groups where id = p_group_id and coalesce(is_revhead_group, false);
  if v_owner is null then raise exception 'community not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Only the owner can transfer this community'; end if;
  if p_new_owner is null or p_new_owner = auth.uid() then raise exception 'Pick another member to hand the community to'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner) then
    raise exception 'The new owner must be a member of this community';
  end if;
  if exists (select 1 from public.study_groups where owner_id = p_new_owner and coalesce(is_revhead_group, false)) then
    raise exception 'That member already runs a community of their own';
  end if;

  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = p_new_owner;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = auth.uid();
  update public.study_groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;
revoke all on function public.rpc_transfer_community_ownership(uuid, uuid) from public, anon;
grant execute on function public.rpc_transfer_community_ownership(uuid, uuid) to authenticated;
