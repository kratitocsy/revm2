-- Owner Control (owner.html): a page only the platform owners can open.
--
-- Owners are a fixed list of confirmed account emails (platform_owner_emails).
-- From the page they can:
--   * see platform stats: users, WynkoHeads, communities, revenue, payouts
--   * approve / reject WynkoHead applications (existing admin_verify_revhead)
--   * look anyone up by username / name / email, or paste any Wynko link
--     (community invite, room, group, profile, referral) or id
--   * ban / unban an account, and remove content (group chat messages, DMs,
--     community announcements, materials, whole communities / rooms)
--   * mark payouts paid / rejected (existing admin_mark_payout_paid /
--     admin_reject_payout)
-- Every owner action is written to owner_actions.
--
-- A ban works at three levels:
--   1. auth.users.banned_until - Supabase Auth refuses sign-in and token
--      refresh, and all of the account's sessions are deleted, so it is
--      signed out everywhere within the lifetime of its current access token.
--   2. Restrictive RLS on the tables people post to, so nothing can be
--      written with that remaining access token either.
--   3. Money: a banned account can't request payouts, and a banned owner's
--      communities stop paying out (their share is held, not lost - it pays
--      out if the ban is lifted).

-- ── Who is an owner ──────────────────────────────────────────────────────
create or replace function public.platform_owner_emails()
returns text[]
language sql
immutable
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

create or replace function public.is_platform_owner_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
     where u.id = p_user_id
       and u.email_confirmed_at is not null
       and lower(u.email) = any (public.platform_owner_emails())
  );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_platform_owner_account(auth.uid()) $$;

-- Every platform owner also has the existing owner powers (admin.html,
-- moderators, payouts). Temp grants are kept as before.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
  or exists (
    select 1 from public.temp_global_roles t
    where t.user_id = auth.uid()
      and t.role = 'owner'
      and t.expires_at > now()
  );
$$;

revoke execute on function public.platform_owner_emails() from public, anon, authenticated;
revoke execute on function public.is_platform_owner_account(uuid) from public, anon, authenticated;
revoke execute on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────
-- One row per account; re-banning overwrites it. Full history is in owner_actions.
create table if not exists public.user_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  banned_by uuid references auth.users(id) on delete set null,
  banned_at timestamptz not null default now(),
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null
);
alter table public.user_bans enable row level security;
revoke all on public.user_bans from anon, authenticated;

create table if not exists public.owner_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_kind text not null,
  target_id uuid,
  target_label text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists owner_actions_created_at_idx on public.owner_actions (created_at desc);
alter table public.owner_actions enable row level security;
revoke all on public.owner_actions from anon, authenticated;

create or replace function public.is_user_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_bans b
     where b.user_id = p_user_id
       and b.lifted_at is null
       and (b.expires_at is null or b.expires_at > now())
  );
$$;
revoke execute on function public.is_user_banned(uuid) from public, anon, authenticated;

-- Used by the RLS policies below; only ever answers for the caller.
create or replace function public.current_user_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_user_banned(auth.uid()) $$;
revoke execute on function public.current_user_banned() from public, anon;
grant execute on function public.current_user_banned() to authenticated;

-- ── Banned accounts can't write ──────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'group_messages', 'dm_messages', 'community_announcements', 'study_groups',
    'group_members', 'group_materials', 'friend_requests', 'partner_likes',
    'battle_invitations', 'community_join_requests', 'user_events'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "banned: no insert" on public.%I', t);
      execute format(
        'create policy "banned: no insert" on public.%I as restrictive for insert to authenticated with check (not public.current_user_banned())', t);
    end if;
  end loop;

  foreach t in array array[
    'group_messages', 'community_announcements', 'study_groups', 'user_profiles'
  ] loop
    execute format('drop policy if exists "banned: no update" on public.%I', t);
    execute format(
      'create policy "banned: no update" on public.%I as restrictive for update to authenticated using (not public.current_user_banned())', t);
  end loop;
end $$;

-- ── Money: banned accounts don't get paid (from 0080, plus the ban checks) ──
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
  -- Held, not lost: unpaid splits stay unpaid and pay out if the ban is lifted.
  if public.is_user_banned(g.owner_id) then return false; end if;
  if coalesce(g.is_revhead_group, false) then
    return g.monetization_enabled
       and public.is_adult(g.owner_id)
       and exists (select 1 from public.user_profiles where id = g.owner_id and is_revhead and revhead_status = 'verified');
  end if;
  select count(*) into v_members from public.group_members where group_id = p_group_id;
  return v_members >= public.group_owner_earning_min_members();
end;
$$;
revoke execute on function public.is_group_owner_earning_eligible(uuid) from public, anon, authenticated;

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
  if public.is_user_banned(auth.uid()) then
    raise exception 'this account is suspended';
  end if;
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

-- ── Helpers ──────────────────────────────────────────────────────────────
create or replace function public.owner_user_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce('@' || nullif(p.username, ''), p.full_name, p.display_name, p.email, p_user_id::text)
    from public.user_profiles p where p.id = p_user_id
$$;
revoke execute on function public.owner_user_label(uuid) from public, anon, authenticated;

create or replace function public.owner_log(p_action text, p_kind text, p_id uuid, p_label text, p_reason text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.owner_actions (actor_id, action, target_kind, target_id, target_label, reason, details)
  values (auth.uid(), p_action, p_kind, p_id, left(p_label, 200), p_reason, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.owner_log(text, text, uuid, text, text, jsonb) from public, anon, authenticated;

-- ── Overview ─────────────────────────────────────────────────────────────
create or replace function public.owner_overview()
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
    'users', jsonb_build_object(
      'total',      (select count(*) from public.user_profiles),
      'new_7d',     (select count(*) from public.user_profiles where created_at > now() - interval '7 days'),
      'new_30d',    (select count(*) from public.user_profiles where created_at > now() - interval '30 days'),
      'active_1d',  (select count(*) from public.user_profiles where last_active_at > now() - interval '1 day'),
      'active_7d',  (select count(*) from public.user_profiles where last_active_at > now() - interval '7 days'),
      'active_30d', (select count(*) from public.user_profiles where last_active_at > now() - interval '30 days'),
      'banned',     (select count(*) from public.user_bans b where b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))
    ),
    'wynkoheads', jsonb_build_object(
      'verified', (select count(*) from public.user_profiles where is_revhead and revhead_status = 'verified'),
      'pending',  (select count(*) from public.user_profiles where revhead_status = 'pending'),
      'rejected', (select count(*) from public.user_profiles where revhead_status = 'rejected')
    ),
    'communities', jsonb_build_object(
      'total',         (select count(*) from public.study_groups where coalesce(is_revhead_group, false)),
      'monetized',     (select count(*) from public.study_groups where coalesce(is_revhead_group, false) and monetization_enabled),
      'members',       (select count(*) from public.group_members m join public.study_groups g on g.id = m.group_id where coalesce(g.is_revhead_group, false)),
      'home_members',  (select count(*) from public.community_home),
      'join_requests_pending', (select count(*) from public.community_join_requests where status = 'pending'),
      'rooms',         (select count(*) from public.study_groups where not coalesce(is_revhead_group, false))
    ),
    'study', jsonb_build_object(
      'seconds_7d',  (select coalesce(sum(total_seconds), 0) from public.study_sessions where started_at > now() - interval '7 days'),
      'seconds_30d', (select coalesce(sum(total_seconds), 0) from public.study_sessions where started_at > now() - interval '30 days')
    ),
    -- revenue_events.amount is net (after GST / store / gateway fees, see 0080); refunds are negative rows.
    'revenue', jsonb_build_object(
      'gross_all_time', (select coalesce(sum(coalesce(gross_amount, amount)), 0) from public.revenue_events where event_type <> 'refund'),
      'net_all_time',   (select coalesce(sum(amount), 0) from public.revenue_events),
      'net_30d',        (select coalesce(sum(amount), 0) from public.revenue_events where occurred_at > now() - interval '30 days'),
      'net_7d',         (select coalesce(sum(amount), 0) from public.revenue_events where occurred_at > now() - interval '7 days'),
      'refunds_all_time', (select coalesce(-sum(amount), 0) from public.revenue_events where event_type = 'refund'),
      'by_type_30d', coalesce((
        select jsonb_object_agg(event_type, total) from (
          select event_type, sum(amount) as total from public.revenue_events
           where occurred_at > now() - interval '30 days' group by event_type) t), '{}'::jsonb),
      'by_type_all_time', coalesce((
        select jsonb_object_agg(event_type, total) from (
          select event_type, sum(amount) as total from public.revenue_events group by event_type) t), '{}'::jsonb),
      'monthly', coalesce((
        select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'net', coalesce(total, 0)) order by m)
          from generate_series(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months',
                               date_trunc('month', now() at time zone 'Asia/Kolkata'), interval '1 month') m
          left join (
            select date_trunc('month', occurred_at at time zone 'Asia/Kolkata') as mon, sum(amount) as total
              from public.revenue_events group by 1) r on r.mon = m), '[]'::jsonb),
      'orders_paid',       (select count(*) from public.payment_orders where status in ('paid', 'refunded')),
      'orders_paid_inr',   (select round(coalesce(sum(amount_paise), 0) / 100.0, 2) from public.payment_orders where status in ('paid', 'refunded')),
      'orders_refunded_inr', (select round(coalesce(sum(refunded_paise), 0) / 100.0, 2) from public.payment_orders)
    ),
    'creators', jsonb_build_object(
      'earnings_all_time',    (select coalesce(sum(amount), 0) from public.revhead_earnings_ledger),
      'earnings_unrequested', (select coalesce(sum(amount), 0) from public.revhead_earnings_ledger where payout_request_id is null),
      'referral_shares_all_time', (select coalesce(sum(share_amount), 0) from public.revhead_referral_shares)
    ),
    'payouts', jsonb_build_object(
      'pending_count',  (select count(*) from public.payout_requests where status = 'pending'),
      'pending_amount', (select coalesce(sum(amount), 0) from public.payout_requests where status = 'pending'),
      'paid_count',     (select count(*) from public.payout_requests where status = 'paid'),
      'paid_amount',    (select coalesce(sum(amount), 0) from public.payout_requests where status = 'paid')
    ),
    'coins_outstanding', (select coalesce(sum(coins), 0) from public.user_wallets),
    'generated_at', now()
  ) into v;
  return v;
end;
$$;

-- ── WynkoHead applicants ─────────────────────────────────────────────────
create or replace function public.owner_wynkohead_applicants(p_status text default 'pending')
returns table(
  user_id uuid, username text, full_name text, email text, avatar_url text,
  revhead_status text, applied_at timestamptz, verified_at timestamptz, hours_waiting numeric,
  is_adult boolean, communities_owned int, community_members int, study_seconds_30d bigint,
  referred_by_code text, account_created_at timestamptz, banned boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  if p_status not in ('pending', 'verified', 'rejected') then raise exception 'invalid status'; end if;

  return query
  select p.id, p.username, coalesce(p.full_name, p.display_name), p.email, p.avatar_url,
         p.revhead_status, p.revhead_applied_at, p.revhead_verified_at,
         round(extract(epoch from (now() - p.revhead_applied_at)) / 3600, 1),
         public.is_adult(p.id),
         (select count(*)::int from public.study_groups g where g.owner_id = p.id and coalesce(g.is_revhead_group, false)),
         (select count(*)::int from public.group_members m join public.study_groups g on g.id = m.group_id
           where g.owner_id = p.id and coalesce(g.is_revhead_group, false)),
         (select coalesce(sum(s.total_seconds), 0)::bigint from public.study_sessions s
           where s.user_id = p.id and s.started_at > now() - interval '30 days'),
         p.referred_by_code, p.created_at, public.is_user_banned(p.id)
    from public.user_profiles p
   where case when p_status = 'verified' then p.is_revhead and p.revhead_status = 'verified'
              else p.revhead_status = p_status end
   order by case when p_status = 'pending' then p.revhead_applied_at end asc nulls last,
            coalesce(p.revhead_verified_at, p.revhead_applied_at) desc nulls last
   limit 300;
end;
$$;

-- ── Communities ──────────────────────────────────────────────────────────
create or replace function public.owner_communities(p_include_rooms boolean default false)
returns table(
  group_id uuid, name text, emoji text, is_community boolean, visibility text,
  monetization_enabled boolean, created_at timestamptz,
  owner_id uuid, owner_username text, owner_name text, owner_banned boolean,
  members int, home_members int, study_seconds_30d bigint,
  revenue_30d numeric, revenue_all_time numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;

  return query
  select g.id, g.name, g.emoji, coalesce(g.is_revhead_group, false), g.visibility,
         coalesce(g.monetization_enabled, false), g.created_at,
         g.owner_id, op.username, coalesce(op.full_name, op.display_name, op.email), public.is_user_banned(g.owner_id),
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         (select count(*)::int from public.community_home h where h.group_id = g.id),
         (select coalesce(sum(s.total_seconds), 0)::bigint from public.study_sessions s
           where s.group_id = g.id and s.started_at > now() - interval '30 days'),
         -- Revenue attributed to the community (before the owner's share is taken).
         (select coalesce(sum(x.share_amount), 0) from public.revenue_event_splits x
            join public.revenue_events e on e.id = x.event_id
           where x.group_id = g.id and e.occurred_at > now() - interval '30 days'),
         (select coalesce(sum(x.share_amount), 0) from public.revenue_event_splits x where x.group_id = g.id)
    from public.study_groups g
    left join public.user_profiles op on op.id = g.owner_id
   where p_include_rooms or coalesce(g.is_revhead_group, false)
   order by 12 desc, g.created_at desc
   limit 500;
end;
$$;

-- ── Search people ────────────────────────────────────────────────────────
create or replace function public.owner_search_users(p_query text)
returns table(
  user_id uuid, username text, full_name text, email text, avatar_url text,
  created_at timestamptz, last_active_at timestamptz,
  is_revhead boolean, revhead_status text, communities_owned int,
  is_platform_owner boolean, banned boolean, ban_reason text, ban_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := btrim(coalesce(p_query, ''));
  v_like text;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  q := regexp_replace(q, '^@', '');
  if char_length(q) < 2 then return; end if;
  v_like := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, p.username, coalesce(p.full_name, p.display_name), p.email, p.avatar_url,
         p.created_at, p.last_active_at,
         coalesce(p.is_revhead, false), p.revhead_status,
         (select count(*)::int from public.study_groups g where g.owner_id = p.id and coalesce(g.is_revhead_group, false)),
         public.is_platform_owner_account(p.id),
         public.is_user_banned(p.id),
         b.reason, b.expires_at
    from public.user_profiles p
    left join public.user_bans b on b.user_id = p.id and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
   where p.id::text = lower(q)
      or lower(p.username) = lower(q)
      or p.username ilike v_like
      or p.full_name ilike v_like
      or p.display_name ilike v_like
      or p.email ilike v_like
      or upper(p.referral_code) = upper(q)
      or upper(p.revhead_code) = upper(q)
   order by (lower(p.username) = lower(q)) desc, p.last_active_at desc nulls last
   limit 30;
end;
$$;

-- ── Resolve a pasted link / id to whatever it points at ──────────────────
-- The page pulls every candidate token out of the link (query values, path
-- parts, @handles) and sends them here.
create or replace function public.owner_resolve_content(p_tokens text[])
returns table(
  kind text, id uuid, title text, body text, group_id uuid, group_name text,
  author_id uuid, author_label text, created_at timestamptz, removed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
  u uuid;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;

  foreach t in array coalesce(p_tokens[1:20], '{}'::text[]) loop
    t := regexp_replace(btrim(t), '^@', '');
    continue when t = '' or char_length(t) > 200;

    if t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      u := t::uuid;

      return query
      select 'user'::text, p.id, coalesce('@' || p.username, p.full_name, p.email), p.email, null::uuid, null::text,
             p.id, public.owner_user_label(p.id), p.created_at, public.is_user_banned(p.id)
        from public.user_profiles p where p.id = u;

      return query
      select case when coalesce(g.is_revhead_group, false) then 'community' else 'room' end, g.id,
             coalesce(g.emoji || ' ', '') || g.name, g.description, g.id, g.name,
             g.owner_id, public.owner_user_label(g.owner_id), g.created_at, false
        from public.study_groups g where g.id = u;

      return query
      select 'group_message'::text, m.id, 'Chat message'::text, m.body, m.group_id, g.name,
             m.sender_id, public.owner_user_label(m.sender_id), m.created_at, m.deleted_at is not null
        from public.group_messages m left join public.study_groups g on g.id = m.group_id where m.id = u;

      return query
      select 'dm_message'::text, d.id, 'Direct message to ' || coalesce(public.owner_user_label(d.recipient_id), '?'), d.body, null::uuid, null::text,
             d.sender_id, public.owner_user_label(d.sender_id), d.created_at, false
        from public.dm_messages d where d.id = u;

      return query
      select 'announcement'::text, a.id, coalesce(a.title, 'Announcement'), a.message, a.group_id, g.name,
             a.author_id, public.owner_user_label(a.author_id), a.created_at, false
        from public.community_announcements a left join public.study_groups g on g.id = a.group_id where a.id = u;

      return query
      select 'material'::text, mt.id, coalesce(mt.title, 'Material'), mt.source_type, mt.group_id, g.name,
             mt.uploaded_by, public.owner_user_label(mt.uploaded_by), mt.created_at, false
        from public.group_materials mt left join public.study_groups g on g.id = mt.group_id where mt.id = u;
    else
      return query
      select case when coalesce(g.is_revhead_group, false) then 'community' else 'room' end, g.id,
             coalesce(g.emoji || ' ', '') || g.name, g.description, g.id, g.name,
             g.owner_id, public.owner_user_label(g.owner_id), g.created_at, false
        from public.study_groups g where g.invite_token = t;

      return query
      select 'user'::text, p.id, coalesce('@' || p.username, p.full_name, p.email), p.email, null::uuid, null::text,
             p.id, public.owner_user_label(p.id), p.created_at, public.is_user_banned(p.id)
        from public.user_profiles p
       where lower(p.username) = lower(t)
          or upper(p.referral_code) = upper(t)
          or upper(p.revhead_code) = upper(t);
    end if;
  end loop;
end;
$$;

-- ── Ban / unban ──────────────────────────────────────────────────────────
create or replace function public.owner_ban_user(p_user_id uuid, p_reason text, p_days int default null, p_remove_messages boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_expires timestamptz;
  v_label text;
  v_removed int := 0;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  if p_user_id is null then raise exception 'pick an account to ban'; end if;
  if p_user_id = auth.uid() then raise exception 'you can''t ban your own account'; end if;
  if public.is_platform_owner_account(p_user_id) then raise exception 'owner accounts can''t be banned'; end if;
  if v_reason = '' then raise exception 'give a reason for the ban'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'ban length must be 1-3650 days, or permanent'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'no such account'; end if;

  v_expires := case when p_days is null then null else now() + make_interval(days => p_days) end;
  v_label := public.owner_user_label(p_user_id);

  insert into public.user_bans (user_id, reason, banned_by, banned_at, expires_at, lifted_at, lifted_by)
  values (p_user_id, left(v_reason, 500), auth.uid(), now(), v_expires, null, null)
  on conflict (user_id) do update
    set reason = excluded.reason, banned_by = excluded.banned_by, banned_at = excluded.banned_at,
        expires_at = excluded.expires_at, lifted_at = null, lifted_by = null;

  -- Supabase Auth: no sign-in, no token refresh; sign out every device.
  update auth.users set banned_until = coalesce(v_expires, now() + interval '100 years') where id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;

  if p_remove_messages then
    update public.group_messages set deleted_at = now(), body = ''
     where sender_id = p_user_id and deleted_at is null;
    get diagnostics v_removed = row_count;
  end if;

  perform public.owner_log('ban', 'user', p_user_id, v_label, v_reason,
    jsonb_build_object('expires_at', v_expires, 'messages_removed', v_removed));

  return jsonb_build_object('expires_at', v_expires, 'messages_removed', v_removed);
end;
$$;

create or replace function public.owner_unban_user(p_user_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  update public.user_bans set lifted_at = now(), lifted_by = auth.uid()
   where user_id = p_user_id and lifted_at is null;
  update auth.users set banned_until = null where id = p_user_id;
  perform public.owner_log('unban', 'user', p_user_id, public.owner_user_label(p_user_id), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

create or replace function public.owner_list_bans()
returns table(
  user_id uuid, username text, full_name text, email text, reason text,
  banned_at timestamptz, expires_at timestamptz, lifted_at timestamptz,
  banned_by_label text, lifted_by_label text, active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  return query
  select b.user_id, p.username, coalesce(p.full_name, p.display_name), p.email, b.reason,
         b.banned_at, b.expires_at, b.lifted_at,
         public.owner_user_label(b.banned_by), public.owner_user_label(b.lifted_by),
         (b.lifted_at is null and (b.expires_at is null or b.expires_at > now()))
    from public.user_bans b
    left join public.user_profiles p on p.id = b.user_id
   where b.lifted_at is null or b.lifted_at > now() - interval '90 days'
      or (b.expires_at is not null and b.expires_at > now() - interval '90 days')
   order by 11 desc, b.banned_at desc
   limit 300;
end;
$$;

-- ── Remove content ───────────────────────────────────────────────────────
create or replace function public.owner_remove_content(p_kind text, p_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_label text;
  v_author uuid;
  v_details jsonb;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;

  if p_kind = 'group_message' then
    select left(coalesce(m.body, ''), 200), m.sender_id, jsonb_build_object('group_id', m.group_id, 'body', left(m.body, 1000))
      into v_label, v_author, v_details from public.group_messages m where m.id = p_id;
    if not found then raise exception 'message not found'; end if;
    update public.group_messages set deleted_at = now(), body = '' where id = p_id;

  elsif p_kind = 'dm_message' then
    select left(coalesce(d.body, ''), 200), d.sender_id, jsonb_build_object('recipient_id', d.recipient_id, 'body', left(d.body, 1000))
      into v_label, v_author, v_details from public.dm_messages d where d.id = p_id;
    if not found then raise exception 'message not found'; end if;
    delete from public.dm_messages where id = p_id;

  elsif p_kind = 'announcement' then
    select coalesce(a.title, left(a.message, 120)), a.author_id, jsonb_build_object('group_id', a.group_id, 'message', left(a.message, 1000))
      into v_label, v_author, v_details from public.community_announcements a where a.id = p_id;
    if not found then raise exception 'announcement not found'; end if;
    delete from public.community_announcements where id = p_id;

  elsif p_kind = 'material' then
    select mt.title, mt.uploaded_by, jsonb_build_object('group_id', mt.group_id)
      into v_label, v_author, v_details from public.group_materials mt where mt.id = p_id;
    if not found then raise exception 'material not found'; end if;
    delete from public.group_materials where id = p_id;

  elsif p_kind in ('community', 'room') then
    select g.name, g.owner_id,
           jsonb_build_object('members', (select count(*) from public.group_members m where m.group_id = g.id),
                              'is_community', coalesce(g.is_revhead_group, false))
      into v_label, v_author, v_details from public.study_groups g where g.id = p_id;
    if not found then raise exception 'community / room not found'; end if;
    -- The only reference to study_groups without ON DELETE behaviour.
    delete from public.gvg_participants where group_id = p_id;
    delete from public.study_groups where id = p_id;

  else
    raise exception 'unknown content type: %', p_kind;
  end if;

  perform public.owner_log('remove', p_kind, p_id, v_label, v_reason,
    coalesce(v_details, '{}'::jsonb) || jsonb_build_object('author_id', v_author));
  return 'removed';
end;
$$;

-- ── Payouts with ban flag (mark paid / reject use the existing RPCs) ─────
create or replace function public.owner_payout_requests(p_status text default 'pending')
returns table(
  request_id uuid, user_id uuid, username text, full_name text, email text,
  amount numeric, upi_id_snapshot text, requested_at timestamptz, processed_at timestamptz,
  payment_reference text, admin_note text, hours_pending numeric, banned boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  return query
  select pr.id, pr.user_id, p.username, coalesce(p.full_name, p.display_name), p.email,
         pr.amount, pr.upi_id_snapshot, pr.requested_at, pr.processed_at,
         pr.payment_reference, pr.admin_note,
         round(extract(epoch from (now() - pr.requested_at)) / 3600, 1),
         public.is_user_banned(pr.user_id)
    from public.payout_requests pr
    left join public.user_profiles p on p.id = pr.user_id
   where pr.status = p_status
   order by case when p_status = 'pending' then pr.requested_at end asc nulls last,
            coalesce(pr.processed_at, pr.requested_at) desc
   limit 200;
end;
$$;

-- ── Activity log ─────────────────────────────────────────────────────────
create or replace function public.owner_recent_actions(p_limit int default 100)
returns table(
  id uuid, created_at timestamptz, actor_label text, action text, target_kind text,
  target_id uuid, target_label text, reason text, details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  return query
  select a.id, a.created_at, public.owner_user_label(a.actor_id), a.action, a.target_kind,
         a.target_id, a.target_label, a.reason, a.details
    from public.owner_actions a
   order by a.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ── Grants: owner RPCs are callable by signed-in users (each checks is_platform_owner) ──
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.owner_overview()',
    'public.owner_wynkohead_applicants(text)',
    'public.owner_communities(boolean)',
    'public.owner_search_users(text)',
    'public.owner_resolve_content(text[])',
    'public.owner_ban_user(uuid,text,integer,boolean)',
    'public.owner_unban_user(uuid,text)',
    'public.owner_list_bans()',
    'public.owner_remove_content(text,uuid,text)',
    'public.owner_payout_requests(text)',
    'public.owner_recent_actions(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
