-- Anyone can create a community; only approved WynkoHeads can turn on the
-- monetisation program for theirs.
--
-- Until now "community" (study_groups.is_revhead_group) and "earns money"
-- were the same flag: enforce_revhead_group_flag() refused the flag unless
-- the owner was a verified WynkoHead, and payouts treated every community
-- as eligible at the full WynkoHead rate. This splits them:
--   is_revhead_group       - it's a community (anyone may create one)
--   monetization_enabled   - it earns (owner must be a verified WynkoHead)
-- A community only earns while monetisation is on AND its owner is still
-- verified, and only for revenue that happened after it was switched on
-- (no retroactive backlog from before approval).

alter table public.study_groups add column if not exists monetization_enabled boolean not null default false;
alter table public.study_groups add column if not exists monetization_enabled_at timestamptz;

-- Communities that already exist all belonged to verified WynkoHeads under
-- the old rule, so they keep earning as before.
update public.study_groups g
   set monetization_enabled = true, monetization_enabled_at = coalesce(g.monetization_enabled_at, g.created_at)
 where g.is_revhead_group and not g.monetization_enabled
   and exists (select 1 from public.user_profiles p where p.id = g.owner_id and p.is_revhead and p.revhead_status = 'verified');

-- ── Flag enforcement: community is free, monetisation needs verification ──
-- Silently switches monetisation off (rather than raising) when ownership
-- passes to someone who isn't verified, so leaving/transferring a group
-- never gets blocked by it.
create or replace function public.enforce_revhead_group_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.monetization_enabled and not new.is_revhead_group then
    new.monetization_enabled := false;
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

drop trigger if exists trg_enforce_revhead_group_flag on public.study_groups;
create trigger trg_enforce_revhead_group_flag
  before insert or update of is_revhead_group, owner_id, monetization_enabled on public.study_groups
  for each row execute function public.enforce_revhead_group_flag();

-- Clients may edit their group's settings directly (RLS: group admin), but
-- monetisation only changes through rpc_set_community_monetization().
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
  -- Turning it off is always fine (the flag trigger does exactly that when
  -- ownership passes to an unverified user); only turning it on is locked.
  if (new.monetization_enabled and not old.monetization_enabled)
     or (new.monetization_enabled_at is not null and new.monetization_enabled_at is distinct from old.monetization_enabled_at) then
    raise exception 'permission denied: use the monetisation program setting to change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_study_group_monetization on public.study_groups;
create trigger trg_protect_study_group_monetization
  before insert or update on public.study_groups
  for each row execute function public.protect_study_group_monetization();

-- ── Create: open to everyone (one community per person) ──────────────────
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
revoke all on function public.rpc_create_community(text, text, text) from public, anon;
grant execute on function public.rpc_create_community(text, text, text) to authenticated;

-- ── Turn the monetisation program on/off ─────────────────────────────────
create or replace function public.rpc_set_community_monetization(p_group_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_community boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select owner_id, coalesce(is_revhead_group, false) into v_owner, v_is_community from public.study_groups where id = p_group_id;
  if v_owner is null or not v_is_community then raise exception 'community not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Only the community owner can change monetisation'; end if;
  if p_enabled and not exists (
    select 1 from public.user_profiles where id = auth.uid() and is_revhead and revhead_status = 'verified'
  ) then
    raise exception 'Only approved WynkoHeads can turn on the monetisation program. Apply from the Earn page.';
  end if;
  update public.study_groups
     set monetization_enabled = p_enabled,
         monetization_enabled_at = case when p_enabled then coalesce(monetization_enabled_at, now()) else null end
   where id = p_group_id;
  return p_enabled;
end;
$$;
revoke all on function public.rpc_set_community_monetization(uuid, boolean) from public, anon;
grant execute on function public.rpc_set_community_monetization(uuid, boolean) to authenticated;

-- ── Payout eligibility ───────────────────────────────────────────────────
-- A community earns only while monetised with a still-verified owner.
-- Ordinary (non-community) groups are unchanged: member-count threshold.
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
    return g.monetization_enabled and exists (
      select 1 from public.user_profiles where id = g.owner_id and is_revhead and revhead_status = 'verified'
    );
  end if;
  select count(*) into v_members from public.group_members where group_id = p_group_id;
  return v_members >= public.group_owner_earning_min_members();
end;
$$;

-- Same body as before except: the premium ("revhead") rate now requires a
-- monetised community rather than just the community flag, and a
-- community's splits only count from monetization_enabled_at onward.
-- Earlier splits of a community are marked paid with the rest when it's
-- paid out (forfeited), so they don't linger as an unpaid backlog.
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
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  for ev in
    select * from public.revenue_events where split_at is null
  loop
    if ev.group_id is not null then
      insert into public.revenue_event_splits (event_id, group_id, share_amount)
      values (ev.id, ev.group_id, ev.amount);
    else
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
      sum(s.share_amount) as raw_total,
      sum(
        case
          when e.event_type = 'ad_impression' and e.group_id is not null then
            s.share_amount * public.ad_inhouse_revhead_share() * (case when m.monetized then 1 else public.normal_group_ad_share_ratio() end)
          when e.event_type = 'ad_impression' and e.group_id is null then
            s.share_amount * public.ad_outside_revhead_share() * (case when m.monetized then 1 else public.normal_group_ad_share_ratio() end)
          when e.event_type = 'premium_conversion' then
            s.share_amount * public.premium_revhead_share() * (case when m.monetized then 1 else public.normal_group_share_ratio() end)
          when e.event_type = 'store_purchase' then
            s.share_amount * public.store_revhead_share() * (case when m.monetized then 1 else public.normal_group_share_ratio() end)
          else
            s.share_amount * public.group_owner_tier_multiplier(m.monetized)
        end
      ) as payable
    from public.revenue_event_splits s
    join public.revenue_events e on e.id = s.event_id
    join public.study_groups sg on sg.id = s.group_id
    cross join lateral (select (coalesce(sg.is_revhead_group, false) and sg.monetization_enabled) as monetized) m
    where s.paid_at is null
      and (not coalesce(sg.is_revhead_group, false)
           or (sg.monetization_enabled and e.occurred_at >= sg.monetization_enabled_at))
    group by s.group_id, sg.owner_id
  loop
    v_eligible := public.is_group_owner_earning_eligible(r.gid);

    if v_eligible then
      perform public.record_group_owner_earning(r.gid, round(r.payable, 2), 'revenue_events_batch');

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

-- Owner-facing estimate uses the same "monetised" rule as real payouts.
create or replace function public.my_group_earnings_estimate(p_group_id uuid, p_days int default 30)
returns table(study_hours numeric, member_count integer, estimated_ad_revenue numeric, estimated_premium_revenue numeric, estimated_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_rh boolean;
  v_ad_rate numeric;
  v_premium_rate numeric;
  v_seconds bigint;
  v_members int;
  v_window_date date := (now() at time zone 'utc')::date - p_days;
begin
  select owner_id, (coalesce(is_revhead_group, false) and monetization_enabled) into v_owner, v_is_rh from public.study_groups where id = p_group_id;
  if v_owner is null then raise exception 'group not found'; end if;
  if v_owner <> auth.uid() and not public.is_admin_or_moderator() then raise exception 'not your group'; end if;
  v_ad_rate := public.ad_inhouse_revhead_share() * (case when v_is_rh then 1 else public.normal_group_ad_share_ratio() end);
  v_premium_rate := public.premium_revhead_share() * (case when v_is_rh then 1 else public.normal_group_share_ratio() end);
  select coalesce(sum(secs), 0) into v_seconds from (
    select coalesce(ss.total_seconds, greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0))) as secs
    from public.study_sessions ss where ss.group_id = p_group_id and ss.started_at >= v_window_date
    union all
    select gud.seconds_used as secs from public.group_user_daily_seconds gud where gud.group_id = p_group_id and gud.usage_date >= v_window_date
  ) x;
  select count(*) into v_members from public.group_members where group_id = p_group_id;
  return query select
    round(v_seconds / 3600.0, 1),
    v_members,
    round((v_seconds / 3600.0) * public.ad_revenue_per_hour_estimate_inr() * v_ad_rate, 2),
    round(v_members * public.assumed_premium_conversion_rate() * public.suggested_premium_price_inr() * v_premium_rate, 2),
    round(((v_seconds / 3600.0) * public.ad_revenue_per_hour_estimate_inr() * v_ad_rate)
          + (v_members * public.assumed_premium_conversion_rate() * public.suggested_premium_price_inr() * v_premium_rate), 2);
end;
$$;
