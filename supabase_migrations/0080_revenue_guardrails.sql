-- Revenue guardrails.
--   1. Splits run on NET revenue: premium/store purchases have GST (18%)
--      and the channel fee (app store 15% / payment gateway 2%) taken out
--      before the 50/50. Ad revenue is already what the ad network pays us,
--      and is now recorded in full (the old 40% cut for ads seen outside a
--      group predates the Home Community model).
--      Refunds reverse the original purchase's splits exactly, so an owner
--      (and referrer) already paid is clawed back on the next payout run.
--   2. Minimum payout ₹500 (no holding period).
--   3. No earning from your own spending: an owner's own purchases/ads in a
--      community they own pay nobody (owner or referrer); the platform keeps it.
--   4. Inherited WynkoHeads (0075) earn from the communities they inherited
--      but can't switch monetisation on for any other community.
--   5. Monetisation is for adults: the owner must have a date of birth on
--      file and be 18+, including when a monetised community is transferred.

-- ── Constants ────────────────────────────────────────────────────────────
create or replace function public.gst_rate() returns numeric
language sql immutable set search_path = public as $$ select 0.18::numeric $$;
create or replace function public.app_store_fee_rate() returns numeric
language sql immutable set search_path = public as $$ select 0.15::numeric $$;
create or replace function public.payment_gateway_fee_rate() returns numeric
language sql immutable set search_path = public as $$ select 0.02::numeric $$;
create or replace function public.min_payout_inr() returns numeric
language sql immutable set search_path = public as $$ select 500::numeric $$;

create or replace function public.net_revenue_amount(p_event_type text, p_gross numeric, p_source text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_event_type in ('premium_conversion', 'store_purchase') then
      round(p_gross / (1 + public.gst_rate())
            * (1 - case when lower(coalesce(p_source, '')) in ('google_play', 'play_store', 'android', 'app_store', 'apple', 'ios')
                        then public.app_store_fee_rate() else public.payment_gateway_fee_rate() end), 4)
    else p_gross
  end
$$;

create or replace function public.is_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.dob is not null and p.dob <= (current_date - interval '18 years')::date
                     from public.user_profiles p where p.id = p_user_id), false)
$$;

-- Refund clawbacks are negative ledger entries (they reduce the wallet).
alter table public.revhead_earnings_ledger drop constraint if exists revhead_earnings_ledger_amount_check;
alter table public.revhead_earnings_ledger add constraint revhead_earnings_ledger_amount_check check (amount <> 0);

-- ── Revenue events: gross kept for records, amount = net; refunds ─────────
alter table public.revenue_events add column if not exists gross_amount numeric;
alter table public.revenue_events add column if not exists refund_of uuid references public.revenue_events(id);
alter table public.revenue_events drop constraint if exists revenue_events_amount_check;
alter table public.revenue_events add constraint revenue_events_amount_check
  check ((event_type = 'refund' and amount <= 0 and refund_of is not null) or (event_type <> 'refund' and amount >= 0));
alter table public.revenue_events drop constraint if exists revenue_events_event_type_check;
alter table public.revenue_events add constraint revenue_events_event_type_check
  check (event_type in ('ad_impression', 'premium_conversion', 'store_purchase', 'refund'));

create or replace function public.record_revenue_event(p_user_id uuid, p_event_type text, p_amount numeric, p_source text default null, p_group_id uuid default null)
returns table(event_id uuid, attributed_group_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_id uuid;
begin
  if not (public.is_admin_or_moderator() or auth.role() = 'service_role') then
    raise exception 'admin only';
  end if;
  if p_event_type = 'refund' then raise exception 'use record_revenue_refund() for refunds'; end if;
  if p_event_type = 'ad_impression' and p_group_id is not null then
    if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
      raise exception 'user is not a member of the attributed group';
    end if;
    v_group_id := p_group_id;
  else
    v_group_id := null;
  end if;
  insert into public.revenue_events (user_id, group_id, event_type, amount, gross_amount, source)
  values (p_user_id, v_group_id, p_event_type, public.net_revenue_amount(p_event_type, p_amount, p_source), p_amount, p_source)
  returning id into v_id;
  return query select v_id, v_group_id;
end;
$$;

-- Refund all (default) or part of a recorded purchase. The refund mirrors the
-- original event's splits negatively, so whoever was credited is debited.
create or replace function public.record_revenue_refund(p_original_event_id uuid, p_gross_amount numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig record;
  v_gross numeric;
  v_net numeric;
  v_already numeric;
  v_id uuid;
begin
  if not (public.is_admin_or_moderator() or auth.role() = 'service_role') then
    raise exception 'admin only';
  end if;
  select * into v_orig from public.revenue_events where id = p_original_event_id and event_type <> 'refund';
  if not found then raise exception 'original revenue event not found'; end if;
  v_gross := coalesce(p_gross_amount, v_orig.gross_amount, v_orig.amount);
  v_net := case when coalesce(v_orig.gross_amount, 0) > 0 then round(v_orig.amount * v_gross / v_orig.gross_amount, 4) else v_gross end;
  select coalesce(-sum(amount), 0) into v_already from public.revenue_events where refund_of = p_original_event_id;
  if v_already + v_net > v_orig.amount + 0.0001 then raise exception 'refund exceeds the original amount'; end if;
  insert into public.revenue_events (user_id, group_id, event_type, amount, gross_amount, source, refund_of)
  values (v_orig.user_id, v_orig.group_id, 'refund', -v_net, -v_gross, v_orig.source, p_original_event_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_revenue_refund(uuid, numeric) from public, anon, authenticated;

-- ── Adults only + inherited WynkoHeads can't monetise new communities ─────
create or replace function public.set_my_date_of_birth(p_dob date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_dob is null or p_dob > (current_date - interval '10 years')::date or p_dob < (current_date - interval '100 years')::date then
    raise exception 'Enter a valid date of birth';
  end if;
  if exists (select 1 from public.user_profiles where id = auth.uid() and dob is not null) then
    raise exception 'Your date of birth is already on file';
  end if;
  update public.user_profiles set dob = p_dob where id = auth.uid();
end;
$$;
revoke all on function public.set_my_date_of_birth(date) from public, anon;
grant execute on function public.set_my_date_of_birth(date) to authenticated;

create or replace function public.rpc_set_community_monetization(p_group_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_community boolean;
  v_me record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select owner_id, coalesce(is_revhead_group, false) into v_owner, v_is_community from public.study_groups where id = p_group_id;
  if v_owner is null or not v_is_community then raise exception 'community not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Only the community owner can change monetisation'; end if;
  if p_enabled then
    select is_revhead, revhead_status, revhead_via into v_me from public.user_profiles where id = auth.uid();
    if not (coalesce(v_me.is_revhead, false) and v_me.revhead_status = 'verified') then
      raise exception 'Only approved WynkoHeads can turn on the monetisation program. Apply from the Earn page.';
    end if;
    if v_me.revhead_via = 'inherited' then
      raise exception 'Your WynkoHead status came with a community you took over, so it only covers that community. Apply from the Earn page to monetise others.';
    end if;
    if not public.is_adult(auth.uid()) then
      raise exception 'Monetisation is for 18+ only - add your date of birth first.';
    end if;
  end if;
  update public.study_groups
     set monetization_enabled = p_enabled,
         monetization_enabled_at = case when p_enabled then coalesce(monetization_enabled_at, now()) else null end
   where id = p_group_id;
  return p_enabled;
end;
$$;

-- 0079 body, plus: a monetised community only stays monetised with an adult
-- owner, and a transfer only promotes an adult new owner.
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
     and old.monetization_enabled and new.monetization_enabled
     and public.is_adult(new.owner_id) then
    update public.user_profiles
       set is_revhead = true,
           revhead_status = 'verified',
           revhead_via = 'inherited',
           revhead_verified_at = now()
     where id = new.owner_id
       and not (is_revhead and revhead_status = 'verified');
  end if;

  if new.monetization_enabled and not (
    exists (select 1 from public.user_profiles where id = new.owner_id and is_revhead and revhead_status = 'verified')
    and public.is_adult(new.owner_id)
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

create or replace function public.is_group_owner_earning_eligible(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_members int;
  g record;
begin
  select is_revhead_group, monetization_enabled, owner_id into g from public.study_groups where id = p_group_id;
  if not found then return false; end if;
  if coalesce(g.is_revhead_group, false) then
    return g.monetization_enabled
       and public.is_adult(g.owner_id)
       and exists (select 1 from public.user_profiles where id = g.owner_id and is_revhead and revhead_status = 'verified');
  end if;
  select count(*) into v_members from public.group_members where group_id = p_group_id;
  return v_members >= public.group_owner_earning_min_members();
end;
$$;

-- ── Minimum payout ───────────────────────────────────────────────────────
create or replace function public.request_payout()
returns table(request_id uuid, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upi text;
  v_amount numeric;
  v_request_id uuid;
begin
  if exists (select 1 from public.payout_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'you already have a payout request pending review';
  end if;
  select upi_id into v_upi from public.user_profiles where id = auth.uid();
  if v_upi is null then raise exception 'add a UPI ID before requesting a payout'; end if;
  v_amount := public.my_wallet_balance();
  if v_amount < public.min_payout_inr() then
    raise exception 'The minimum payout is ₹% - your balance is ₹%', public.min_payout_inr()::int, round(greatest(v_amount, 0), 2);
  end if;
  insert into public.payout_requests (user_id, amount, upi_id_snapshot)
  values (auth.uid(), v_amount, v_upi)
  returning id into v_request_id;
  update public.revhead_earnings_ledger set payout_request_id = v_request_id
   where revhead_id = auth.uid() and payout_request_id is null;
  update public.revhead_referral_shares set payout_request_id = v_request_id
   where sponsor_id = auth.uid() and payout_request_id is null;
  return query select v_request_id, v_amount;
end;
$$;

-- ── Payout job: no self-earning; refunds mirror the original splits ───────
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
  v_orig_amount numeric;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  for ev in
    select * from public.revenue_events where split_at is null order by occurred_at
  loop
    if ev.event_type = 'refund' then
      -- Mirror the original purchase's splits (negative), whoever they went to.
      select amount into v_orig_amount from public.revenue_events where id = ev.refund_of;
      if coalesce(v_orig_amount, 0) > 0 then
        insert into public.revenue_event_splits (event_id, group_id, share_amount)
        select ev.id, os.group_id, round(os.share_amount * ev.amount / v_orig_amount, 4)
          from public.revenue_event_splits os
         where os.event_id = ev.refund_of;
      end if;
    else
      v_has_home := ev.user_id is not null and exists (
        select 1 from public.community_home h
         where h.user_id = ev.user_id
           and exists (select 1 from public.group_members m where m.group_id = h.group_id and m.user_id = ev.user_id)
      );
      if not v_has_home and ev.group_id is not null and not public.is_community(ev.group_id) then
        -- An owner's own spending in a group they own pays nobody.
        if not exists (select 1 from public.study_groups g where g.id = ev.group_id and g.owner_id = ev.user_id) then
          insert into public.revenue_event_splits (event_id, group_id, share_amount)
          values (ev.id, ev.group_id, ev.amount);
        end if;
      elsif ev.user_id is not null then
        for split_row in select * from public.compute_user_group_time_split(ev.user_id) loop
          if not exists (select 1 from public.study_groups g where g.id = split_row.group_id and g.owner_id = ev.user_id) then
            insert into public.revenue_event_splits (event_id, group_id, share_amount)
            values (ev.id, split_row.group_id, round(ev.amount * split_row.share, 4));
          end if;
        end loop;
      end if;
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
      sum(
        case when m.monetized and sg.referrer_id is not null
                  and coalesce(o.occurred_at, e.occurred_at) < sg.first_monetized_at + public.referral_window()
             then s.share_amount * (1 - public.community_owner_revenue_share()) * public.referral_platform_share()
             else 0 end
      ) as referral_amt
    from public.revenue_event_splits s
    join public.revenue_events e on e.id = s.event_id
    left join public.revenue_events o on o.id = e.refund_of
    join public.study_groups sg on sg.id = s.group_id
    cross join lateral (select (coalesce(sg.is_revhead_group, false) and sg.monetization_enabled) as monetized) m
    where s.paid_at is null
      and (not coalesce(sg.is_revhead_group, false)
           or (sg.monetization_enabled and coalesce(o.occurred_at, e.occurred_at) >= sg.monetization_enabled_at))
    group by s.group_id, sg.owner_id, sg.referrer_id
  loop
    v_eligible := public.is_group_owner_earning_eligible(r.gid);

    if v_eligible and round(r.payable, 2) <> 0 then
      select * into v_earning from public.record_group_owner_earning(r.gid, round(r.payable, 2), 'revenue_events_batch');

      if r.referrer is not null and r.referrer <> r.owner and round(r.referral_amt, 2) <> 0 and v_earning.earning_id is not null then
        insert into public.revhead_referral_shares (sponsor_id, referred_id, earning_id, share_amount)
        values (r.referrer, r.owner, v_earning.earning_id, round(r.referral_amt, 2));
      end if;
    end if;
    if v_eligible then
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
