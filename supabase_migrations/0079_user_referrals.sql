-- Referral program (replaces the WynkoHead-to-WynkoHead sponsor share).
--
-- Anyone - plain user or community owner - has a referral code/link. When
-- someone signs up through it and later creates a community, and that
-- community gets monetised, the referrer earns 10% of the PLATFORM's 50%
-- share of that community's revenue (5% of the revenue) for 6 months from
-- the day the community was first monetised. The community owner's 50% is
-- untouched; the platform keeps 45% while the referral runs.
--
--   On ₹100 from a referred community's Home-Community members:
--     owner ₹50 · referrer ₹5 · platform ₹45   (first 6 months)
--     owner ₹50 · platform ₹50                (afterwards)

-- ── Columns ──────────────────────────────────────────────────────────────
alter table public.user_profiles add column if not exists referral_code text;
alter table public.user_profiles add column if not exists referred_by_user_id uuid references auth.users(id) on delete set null;
alter table public.user_profiles add column if not exists referred_at timestamptz;
create unique index if not exists user_profiles_referral_code_key on public.user_profiles (referral_code) where referral_code is not null;

alter table public.study_groups add column if not exists referrer_id uuid references auth.users(id) on delete set null;
alter table public.study_groups add column if not exists first_monetized_at timestamptz;
update public.study_groups set first_monetized_at = coalesce(monetization_enabled_at, now())
 where monetization_enabled and first_monetized_at is null;

create or replace function public.referral_platform_share() returns numeric
language sql immutable set search_path = public as $$ select 0.10::numeric $$;
create or replace function public.referral_window() returns interval
language sql immutable set search_path = public as $$ select interval '6 months' $$;

-- ── Server-managed columns (extends 0073/0075) ────────────────────────────
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
    new.referral_code := null;
    new.referred_by_user_id := null;
    new.referred_at := null;
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
     or new.referral_code is distinct from old.referral_code
     or new.referred_by_user_id is distinct from old.referred_by_user_id
     or new.referred_at is distinct from old.referred_at
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
    new.first_monetized_at := null;
    new.referrer_id := null;
    return new;
  end if;
  if (new.monetization_enabled and not old.monetization_enabled)
     or (new.monetization_enabled_at is not null and new.monetization_enabled_at is distinct from old.monetization_enabled_at) then
    raise exception 'permission denied: use the monetisation program setting to change this' using errcode = '42501';
  end if;
  if new.first_monetized_at is distinct from old.first_monetized_at
     or new.referrer_id is distinct from old.referrer_id then
    raise exception 'permission denied: that community field can only be changed by the server' using errcode = '42501';
  end if;
  if coalesce(old.is_revhead_group, false) and new.owner_id is distinct from old.owner_id then
    raise exception 'permission denied: use Transfer ownership to hand over a community' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- First monetisation starts the referral clock (0075 body + first_monetized_at).
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
  elsif new.first_monetized_at is null then
    new.first_monetized_at := now();
  end if;
  return new;
end;
$$;

-- ── Codes & claiming ─────────────────────────────────────────────────────
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select referral_code into v_code from public.user_profiles where id = auth.uid();
  while v_code is null and v_tries < 8 loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 1, 8));
    if exists (select 1 from public.user_profiles where referral_code = v_code) then
      v_code := null;
    end if;
    v_tries := v_tries + 1;
  end loop;
  if v_code is null then raise exception 'Could not create a referral code, try again'; end if;
  update public.user_profiles set referral_code = v_code where id = auth.uid() and referral_code is null;
  return (select referral_code from public.user_profiles where id = auth.uid());
end;
$$;
revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- Called once right after sign-in when the user arrived via a referral link.
-- Only a new account (created within the last 7 days) can be claimed, only
-- once, and never by the referrer themselves.
create or replace function public.rpc_claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me record;
  v_referrer uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id, created_at, referred_by_user_id into v_me from public.user_profiles where id = auth.uid();
  if v_me.id is null then return 'invalid'; end if;
  if v_me.referred_by_user_id is not null then return 'already_referred'; end if;
  select id into v_referrer from public.user_profiles where referral_code = upper(trim(coalesce(p_code, '')));
  if v_referrer is null then return 'invalid'; end if;
  if v_referrer = auth.uid() then return 'self'; end if;
  if v_me.created_at < now() - interval '7 days' then return 'not_a_new_account'; end if;
  update public.user_profiles set referred_by_user_id = v_referrer, referred_at = now() where id = auth.uid();
  return 'claimed';
end;
$$;
revoke all on function public.rpc_claim_referral(text) from public, anon;
grant execute on function public.rpc_claim_referral(text) to authenticated;

-- ── Community creation records the creator's referrer ─────────────────────
create or replace function public.rpc_create_community(p_name text, p_description text default null, p_emoji text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'Community name must be 1-60 characters'; end if;
  if p_description is not null and char_length(trim(p_description)) > 240 then raise exception 'Description must be at most 240 characters'; end if;
  insert into public.study_groups (name, description, emoji, owner_id, visibility, is_revhead_group, member_limit, join_requires_approval, referrer_id)
  values (v_name, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_emoji, '')), ''), auth.uid(), 'public', true, 5000, true,
          (select referred_by_user_id from public.user_profiles where id = auth.uid()))
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

-- ── Referrer dashboard numbers ───────────────────────────────────────────
create or replace function public.my_referral_summary()
returns table(referral_code text, people_referred int, communities_created int, communities_earning int, total_earned numeric, wallet_balance numeric, upi_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query select
    (select p.referral_code from public.user_profiles p where p.id = auth.uid()),
    (select count(*)::int from public.user_profiles p where p.referred_by_user_id = auth.uid()),
    (select count(*)::int from public.study_groups g where g.referrer_id = auth.uid() and coalesce(g.is_revhead_group, false)),
    (select count(*)::int from public.study_groups g where g.referrer_id = auth.uid() and g.monetization_enabled
        and g.first_monetized_at > now() - public.referral_window()),
    coalesce((select sum(s.share_amount) from public.revhead_referral_shares s where s.sponsor_id = auth.uid()), 0),
    public.my_wallet_balance(),
    (select p.upi_id from public.user_profiles p where p.id = auth.uid());
end;
$$;
revoke all on function public.my_referral_summary() from public, anon;
grant execute on function public.my_referral_summary() to authenticated;

-- ── Payouts ──────────────────────────────────────────────────────────────
-- The old automatic sponsor share (10% of a referred WynkoHead's earnings
-- for 90 days) is retired; referral money now comes out of the platform's
-- half in aggregate_and_pay_group_owners() below.
create or replace function public.record_group_owner_earning(p_group_id uuid, p_amount numeric, p_source text default 'platform')
returns table(eligible boolean, earning_id uuid, referral_share_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_earning_id uuid;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  select owner_id into v_owner from public.study_groups where id = p_group_id;
  if v_owner is null then
    raise exception 'group not found';
  end if;

  if not public.is_group_owner_earning_eligible(p_group_id) then
    return query select false, null::uuid, 0::numeric;
    return;
  end if;

  insert into public.revhead_earnings_ledger (revhead_id, amount, source)
  values (v_owner, p_amount, p_source)
  returning id into v_earning_id;

  return query select true, v_earning_id, 0::numeric;
end;
$$;

create or replace function public.aggregate_and_pay_group_owners()
returns table(group_id uuid, owner_id uuid, base_amount numeric, paid_amount numeric, eligible boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  split_row record;
  r record;
  v_eligible boolean;
  v_has_home boolean;
  v_earning record;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  for ev in
    select * from public.revenue_events where split_at is null
  loop
    v_has_home := ev.user_id is not null and exists (
      select 1 from public.community_home h
       where h.user_id = ev.user_id
         and exists (select 1 from public.group_members m where m.group_id = h.group_id and m.user_id = ev.user_id)
    );
    if not v_has_home and ev.group_id is not null and not public.is_community(ev.group_id) then
      insert into public.revenue_event_splits (event_id, group_id, share_amount)
      values (ev.id, ev.group_id, ev.amount);
    elsif ev.user_id is not null then
      for split_row in select * from public.compute_user_group_time_split(ev.user_id) loop
        insert into public.revenue_event_splits (event_id, group_id, share_amount)
        values (ev.id, split_row.group_id, round(ev.amount * split_row.share, 4));
      end loop;
    end if;

    update public.revenue_events set split_at = now() where id = ev.id;
  end loop;

  for r in
    select
      s.group_id as gid,
      sg.owner_id as owner,
      sg.referrer_id as referrer,
      sum(s.share_amount) as raw_total,
      sum(
        case
          when m.monetized then s.share_amount * public.community_owner_revenue_share()
          when e.event_type = 'ad_impression' and e.group_id is not null then
            s.share_amount * public.ad_inhouse_revhead_share() * public.normal_group_ad_share_ratio()
          when e.event_type = 'ad_impression' and e.group_id is null then
            s.share_amount * public.ad_outside_revhead_share() * public.normal_group_ad_share_ratio()
          when e.event_type = 'premium_conversion' then
            s.share_amount * public.premium_revhead_share() * public.normal_group_share_ratio()
          when e.event_type = 'store_purchase' then
            s.share_amount * public.store_revhead_share() * public.normal_group_share_ratio()
          else
            s.share_amount * public.group_owner_tier_multiplier(false)
        end
      ) as payable,
      -- 10% of the platform's half, for revenue inside the 6-month window.
      sum(
        case when m.monetized and sg.referrer_id is not null
                  and e.occurred_at < sg.first_monetized_at + public.referral_window()
             then s.share_amount * (1 - public.community_owner_revenue_share()) * public.referral_platform_share()
             else 0 end
      ) as referral_amt
    from public.revenue_event_splits s
    join public.revenue_events e on e.id = s.event_id
    join public.study_groups sg on sg.id = s.group_id
    cross join lateral (select (coalesce(sg.is_revhead_group, false) and sg.monetization_enabled) as monetized) m
    where s.paid_at is null
      and (not coalesce(sg.is_revhead_group, false)
           or (sg.monetization_enabled and e.occurred_at >= sg.monetization_enabled_at))
    group by s.group_id, sg.owner_id, sg.referrer_id
  loop
    v_eligible := public.is_group_owner_earning_eligible(r.gid);

    if v_eligible then
      select * into v_earning from public.record_group_owner_earning(r.gid, round(r.payable, 2), 'revenue_events_batch');

      if r.referrer is not null and r.referrer <> r.owner and round(r.referral_amt, 2) > 0 and v_earning.earning_id is not null then
        insert into public.revhead_referral_shares (sponsor_id, referred_id, earning_id, share_amount)
        values (r.referrer, r.owner, v_earning.earning_id, round(r.referral_amt, 2));
      end if;

      update public.revenue_event_splits
      set paid_at = now()
      where revenue_event_splits.group_id = r.gid and paid_at is null;
    end if;

    group_id := r.gid;
    owner_id := r.owner;
    base_amount := r.raw_total;
    paid_amount := case when v_eligible then round(r.payable, 2) else 0 end;
    eligible := v_eligible;
    return next;
  end loop;
end;
$$;
