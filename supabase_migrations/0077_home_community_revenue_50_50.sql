-- Home Community revenue model.
--
-- Each user has exactly one Home Community (community_home, primary key
-- user_id), changeable once per 30 days (rpc_set_home_community). Everything
-- that user generates - premium, ad boosters, store purchases, ad revenue -
-- is credited 100% to their Home Community, and a monetised community's
-- WynkoHead gets a flat 50% of it; the other 50% stays with the platform.
-- (A community that isn't monetised earns its owner nothing; see 0074.)
-- Users without a Home Community keep the old behaviour for ordinary study
-- groups (study-time split, no communities).

create or replace function public.community_owner_revenue_share()
returns numeric
language sql
immutable
set search_path = public
as $$ select 0.50::numeric $$;

create or replace function public.compute_user_group_time_split(p_user_id uuid)
returns table(group_id uuid, share numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_home uuid;
  v_primary uuid;
  v_primary_ok boolean;
  v_window_date date := (now() at time zone 'utc')::date - public.revenue_attribution_window_days();
  v_floor numeric := public.primary_group_floor_percent();
begin
  select h.group_id into v_home
    from public.community_home h
   where h.user_id = p_user_id
     and exists (select 1 from public.group_members hm where hm.group_id = h.group_id and hm.user_id = p_user_id);

  -- Home Community set: it gets everything.
  if v_home is not null then
    return query select v_home, 1.0::numeric;
    return;
  end if;

  -- No Home Community: ordinary study groups only, by study time, with the
  -- first-joined ordinary group guaranteed its floor.
  select fj.group_id into v_primary
    from public.group_first_join_log fj
   where fj.user_id = p_user_id and not public.is_community(fj.group_id);
  v_primary_ok := v_primary is not null and exists (
    select 1 from public.group_members where group_id = v_primary and user_id = p_user_id
  );

  return query
  with eligible as (
    select m.group_id as gid
      from public.group_members m
     where m.user_id = p_user_id and not public.is_community(m.group_id)
  ), combined as (
    select ss.group_id as gid,
           coalesce(ss.total_seconds, greatest(0,
             extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0)
           )) as secs
      from public.study_sessions ss
     where ss.user_id = p_user_id
       and ss.group_id in (select gid from eligible)
       and ss.started_at >= v_window_date
    union all
    select gud.group_id as gid, gud.seconds_used as secs
      from public.group_user_daily_seconds gud
     where gud.user_id = p_user_id
       and gud.group_id in (select gid from eligible)
       and gud.usage_date >= v_window_date
  ), totals as (
    select gid, sum(secs)::numeric as secs from combined group by gid
  ), grand as (
    select coalesce(sum(secs), 0) as total from totals
  ), with_primary as (
    select gid, secs from totals
    union all
    select v_primary, 0 where v_primary_ok and not exists (select 1 from totals where gid = v_primary)
  )
  select w.gid,
         case
           when (select total from grand) = 0 then 1.0::numeric
           when v_primary_ok and w.gid = v_primary then v_floor + (1 - v_floor) * (w.secs / (select total from grand))
           when v_primary_ok then (1 - v_floor) * (w.secs / (select total from grand))
           else w.secs / (select total from grand)
         end
    from with_primary w
   where (select total from grand) > 0 or (v_primary_ok and w.gid = v_primary);
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
    -- Everything from a user with a Home Community goes there (via the split,
    -- which returns it at 100%). Otherwise an event tagged to an ordinary
    -- group stays with that group; anything else is split by study time.
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
      sum(s.share_amount) as raw_total,
      sum(
        case
          -- Monetised community: flat 50/50 with the platform, every event type.
          when m.monetized then s.share_amount * public.community_owner_revenue_share()
          -- Ordinary study groups keep their existing per-type rates.
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

-- Owner-facing estimate on the same 50% rule for monetised communities.
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
  v_ad_rate := case when v_is_rh then public.community_owner_revenue_share() else public.ad_inhouse_revhead_share() * public.normal_group_ad_share_ratio() end;
  v_premium_rate := case when v_is_rh then public.community_owner_revenue_share() else public.premium_revhead_share() * public.normal_group_share_ratio() end;
  select coalesce(sum(secs), 0) into v_seconds from (
    select coalesce(ss.total_seconds, greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int - coalesce(ss.accumulated_paused_seconds, 0))) as secs
    from public.study_sessions ss where ss.group_id = p_group_id and ss.started_at >= v_window_date
    union all
    select gud.seconds_used as secs from public.group_user_daily_seconds gud where gud.group_id = p_group_id and gud.usage_date >= v_window_date
  ) x;
  -- Only members who made this their Home Community generate its revenue.
  select count(*) into v_members from public.community_home h
   where h.group_id = p_group_id and exists (select 1 from public.group_members m where m.group_id = h.group_id and m.user_id = h.user_id);
  if not coalesce((select is_revhead_group from public.study_groups where id = p_group_id), false) then
    select count(*) into v_members from public.group_members where group_id = p_group_id;
  end if;
  return query select
    round(v_seconds / 3600.0, 1),
    v_members,
    round((v_seconds / 3600.0) * public.ad_revenue_per_hour_estimate_inr() * v_ad_rate, 2),
    round(v_members * public.assumed_premium_conversion_rate() * public.suggested_premium_price_inr() * v_premium_rate, 2),
    round(((v_seconds / 3600.0) * public.ad_revenue_per_hour_estimate_inr() * v_ad_rate)
          + (v_members * public.assumed_premium_conversion_rate() * public.suggested_premium_price_inr() * v_premium_rate), 2);
end;
$$;
