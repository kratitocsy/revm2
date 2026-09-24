-- 1. A person can own any number of communities (the one-per-person rule
--    in rpc_create_community / rpc_transfer_community_ownership is gone).
-- 2. A community earns only from members who chose it as their Home
--    Community (community_home, 30-day lock). Communities that aren't a
--    member's home get nothing from that member; ordinary study groups keep
--    their existing study-time share.

-- ── Create: no per-person limit ──────────────────────────────────────────
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
  insert into public.study_groups (name, description, emoji, owner_id, visibility, is_revhead_group, member_limit, join_requires_approval)
  values (v_name, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_emoji, '')), ''), auth.uid(), 'public', true, 5000, true)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

-- ── Transfer: the new owner may already own other communities ────────────
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

  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = p_new_owner;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = auth.uid();
  update public.study_groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;

-- ── Revenue attribution: communities only via Home Community ─────────────
-- Same shape as before (study-time share over the attribution window, with
-- a floor for the primary group), but the only community that can appear
-- is the member's Home Community. The primary group is the Home Community
-- if set, otherwise the first ordinary (non-community) group they joined.
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
  v_total_seconds bigint;
  v_window_date date := (now() at time zone 'utc')::date - public.revenue_attribution_window_days();
  v_floor numeric := public.primary_group_floor_percent();
begin
  select h.group_id into v_home
    from public.community_home h
   where h.user_id = p_user_id
     and exists (select 1 from public.group_members hm where hm.group_id = h.group_id and hm.user_id = p_user_id);

  v_primary := coalesce(v_home, (
    select fj.group_id from public.group_first_join_log fj
     where fj.user_id = p_user_id and not public.is_community(fj.group_id)
  ));
  v_primary_ok := v_primary is not null and exists (
    select 1 from public.group_members where group_id = v_primary and user_id = p_user_id
  );

  return query
  with eligible as (
    select m.group_id as gid
      from public.group_members m
     where m.user_id = p_user_id
       and (not public.is_community(m.group_id) or m.group_id = v_home)
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
    -- make sure the primary group is present even with no study time there
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

-- Ads shown inside a community credit it only when it's the viewer's Home
-- Community; otherwise that revenue is split like any other of theirs.
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
  v_direct boolean;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'admin only';
  end if;

  for ev in
    select * from public.revenue_events where split_at is null
  loop
    v_direct := ev.group_id is not null and (
      not public.is_community(ev.group_id)
      or exists (select 1 from public.community_home h where h.user_id = ev.user_id and h.group_id = ev.group_id)
    );
    if v_direct then
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
