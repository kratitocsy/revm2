-- Battleground: 1v1 focus duels between friends.
-- Rule: both players start Focus Lock together; whoever pauses first loses.
-- This migration is additive and does not touch the existing `friendships`
-- table/RPCs — the client already has friend ids via list_friends(), so
-- battle challenges and the leaderboard both take friend ids as input
-- rather than re-deriving them here.

alter table user_profiles add column if not exists battle_xp integer not null default 0;

-- ── TABLES ──────────────────────────────────────────────────────────────
create table if not exists battle_invitations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references user_profiles(id) on delete cascade,
  to_user uuid not null references user_profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  battle_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  responded_at timestamptz,
  constraint battle_invitations_not_self check (from_user <> to_user)
);
create index if not exists idx_battle_invitations_to_pending
  on battle_invitations(to_user) where status = 'pending';
create index if not exists idx_battle_invitations_from_pending
  on battle_invitations(from_user) where status = 'pending';

create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references user_profiles(id) on delete cascade,
  player_b uuid not null references user_profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','finished','cancelled')),
  a_ready boolean not null default false,
  b_ready boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  winner_id uuid references user_profiles(id),
  loser_id uuid references user_profiles(id),
  paused_by uuid references user_profiles(id),
  winner_xp_awarded int not null default 0,
  loser_xp_awarded int not null default 0,
  constraint battles_not_self check (player_a <> player_b)
);
create index if not exists idx_battles_player_a on battles(player_a, status);
create index if not exists idx_battles_player_b on battles(player_b, status);

alter table battle_invitations enable row level security;
alter table battles enable row level security;

drop policy if exists battle_invitations_select on battle_invitations;
create policy battle_invitations_select on battle_invitations for select
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists battles_select on battles;
create policy battles_select on battles for select
  using (auth.uid() = player_a or auth.uid() = player_b);

-- All writes happen through the security-definer RPCs below, so no
-- insert/update/delete policies are granted directly to clients.

do $$
begin
  alter publication supabase_realtime add table battle_invitations;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table battles;
exception when duplicate_object then null;
end $$;

-- ── TITLES (derived from XP, never stored) ─────────────────────────────
create or replace function battle_title_for_xp(p_xp int)
returns text language sql immutable as $$
  select case
    when p_xp >= 3000 then 'Unstoppable'
    when p_xp >= 1500 then 'Elite'
    when p_xp >= 700  then 'Warrior'
    when p_xp >= 300  then 'Focused'
    when p_xp >= 100  then 'Challenger'
    else 'Rookie'
  end;
$$;
grant execute on function battle_title_for_xp(int) to authenticated;

-- ── HUB SNAPSHOT (one round trip for the whole page) ───────────────────
create or replace function get_battleground_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_xp int;
  v_active json;
  v_outgoing json;
  v_incoming json;
  v_stats json;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select coalesce(battle_xp,0) into v_xp from user_profiles where id = v_me;

  update battle_invitations set status = 'expired'
    where status = 'pending' and expires_at < now();
  update battles set status = 'cancelled'
    where status = 'pending' and created_at < now() - interval '10 minutes';

  select to_json(t) into v_active from (
    select
      b.id, b.status, b.started_at,
      (case when b.player_a = v_me then b.player_b else b.player_a end) as opponent_id,
      op.username as opponent_username, op.avatar_url as opponent_avatar,
      (case when b.player_a = v_me then b.a_ready else b.b_ready end) as i_am_ready,
      (case when b.player_a = v_me then b.b_ready else b.a_ready end) as opponent_ready
    from battles b
    join user_profiles op
      on op.id = (case when b.player_a = v_me then b.player_b else b.player_a end)
    where (b.player_a = v_me or b.player_b = v_me) and b.status in ('pending','active')
    order by b.created_at desc limit 1
  ) t;

  select to_json(t) into v_outgoing from (
    select bi.id, bi.to_user, bi.created_at, bi.expires_at,
      up.username, up.avatar_url
    from battle_invitations bi
    join user_profiles up on up.id = bi.to_user
    where bi.from_user = v_me and bi.status = 'pending'
    order by bi.created_at desc limit 1
  ) t;

  select coalesce(json_agg(t), '[]'::json) into v_incoming from (
    select bi.id, bi.from_user, bi.created_at, bi.expires_at,
      up.username, up.avatar_url, battle_title_for_xp(coalesce(up.battle_xp,0)) as title
    from battle_invitations bi
    join user_profiles up on up.id = bi.from_user
    where bi.to_user = v_me and bi.status = 'pending'
    order by bi.created_at desc
  ) t;

  select json_build_object(
    'total', count(*),
    'wins', count(*) filter (where winner_id = v_me),
    'losses', count(*) filter (where loser_id = v_me),
    'total_focus_seconds', coalesce(sum(extract(epoch from (ended_at - started_at)))::int, 0)
  ) into v_stats
  from battles where (player_a = v_me or player_b = v_me) and status = 'finished';

  return json_build_object(
    'me', json_build_object('xp', v_xp, 'title', battle_title_for_xp(v_xp)),
    'active', v_active,
    'outgoing_invite', v_outgoing,
    'incoming_invites', v_incoming,
    'stats', v_stats
  );
end;
$$;
grant execute on function get_battleground_state() to authenticated;

-- ── FRIENDS LEADERBOARD (client supplies friend ids from list_friends()) ─
create or replace function get_friends_battle_xp(p_friend_ids uuid[])
returns table(id uuid, username text, avatar_url text, battle_xp int, title text)
language sql
security definer
set search_path = public
stable
as $$
  select up.id, up.username, up.avatar_url, coalesce(up.battle_xp,0) as battle_xp,
    battle_title_for_xp(coalesce(up.battle_xp,0)) as title
  from user_profiles up
  where up.id = any(p_friend_ids) and coalesce(up.battle_xp,0) > 0
  order by up.battle_xp desc, up.username
  limit 50;
$$;
grant execute on function get_friends_battle_xp(uuid[]) to authenticated;

-- ── HISTORY ──────────────────────────────────────────────────────────────
create or replace function get_battle_history(p_limit int default 20)
returns table(
  id uuid, ended_at timestamptz, opponent_id uuid, opponent_username text,
  opponent_avatar text, result text, focus_seconds int, xp_earned int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id, b.ended_at,
    (case when b.player_a = auth.uid() then b.player_b else b.player_a end) as opponent_id,
    op.username, op.avatar_url,
    (case when b.winner_id = auth.uid() then 'won' else 'lost' end) as result,
    extract(epoch from (b.ended_at - b.started_at))::int as focus_seconds,
    (case when b.winner_id = auth.uid() then b.winner_xp_awarded else b.loser_xp_awarded end) as xp_earned
  from battles b
  join user_profiles op on op.id = (case when b.player_a = auth.uid() then b.player_b else b.player_a end)
  where (b.player_a = auth.uid() or b.player_b = auth.uid()) and b.status = 'finished'
  order by b.ended_at desc
  limit greatest(1, least(p_limit, 100));
$$;
grant execute on function get_battle_history(int) to authenticated;

-- ── ACTIONS ──────────────────────────────────────────────────────────────
create or replace function send_battle_challenge(p_to_user uuid)
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
grant execute on function send_battle_challenge(uuid) to authenticated;

create or replace function cancel_battle_challenge(p_invitation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update battle_invitations set status = 'cancelled', responded_at = now()
  where id = p_invitation_id and from_user = auth.uid() and status = 'pending';
$$;
grant execute on function cancel_battle_challenge(uuid) to authenticated;

create or replace function respond_battle_challenge(p_invitation_id uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_inv battle_invitations;
  v_battle battles;
begin
  select * into v_inv from battle_invitations
    where id = p_invitation_id and to_user = v_me and status = 'pending'
    for update;
  if not found then raise exception 'invitation not found or already handled'; end if;

  if not p_accept then
    update battle_invitations set status = 'declined', responded_at = now()
      where id = p_invitation_id;
    return json_build_object('accepted', false);
  end if;

  insert into battles(player_a, player_b, status)
  values (v_inv.from_user, v_me, 'pending')
  returning * into v_battle;

  update battle_invitations
    set status = 'accepted', responded_at = now(), battle_id = v_battle.id
    where id = p_invitation_id;

  -- Any other pending invites either of us sent become moot.
  update battle_invitations set status = 'cancelled', responded_at = now()
    where status = 'pending' and id <> p_invitation_id
      and (from_user in (v_inv.from_user, v_me) or to_user in (v_inv.from_user, v_me));

  return json_build_object('accepted', true, 'battle_id', v_battle.id);
end;
$$;
grant execute on function respond_battle_challenge(uuid, boolean) to authenticated;

create or replace function ready_battle(p_battle_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_b battles;
begin
  select * into v_b from battles where id = p_battle_id for update;
  if not found or v_b.status <> 'pending' then raise exception 'battle not ready-able'; end if;
  if v_b.player_a <> v_me and v_b.player_b <> v_me then raise exception 'not your battle'; end if;

  if v_b.player_a = v_me then
    update battles set a_ready = true where id = p_battle_id;
  else
    update battles set b_ready = true where id = p_battle_id;
  end if;

  select * into v_b from battles where id = p_battle_id;
  if v_b.a_ready and v_b.b_ready then
    update battles set status = 'active', started_at = now() where id = p_battle_id;
  end if;

  select * into v_b from battles where id = p_battle_id;
  return to_json(v_b);
end;
$$;
grant execute on function ready_battle(uuid) to authenticated;

create or replace function cancel_pending_battle(p_battle_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update battles set status = 'cancelled'
  where id = p_battle_id and status = 'pending'
    and (player_a = auth.uid() or player_b = auth.uid());
$$;
grant execute on function cancel_pending_battle(uuid) to authenticated;

-- Called by whoever pauses. That caller loses; the other player wins.
-- XP: winner gets 20 + 1 per minute focused (cap 60); loser gets 1 per
-- minute focused (cap 20), so a long fight still earns something.
create or replace function pause_battle(p_battle_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_b battles;
  v_winner uuid;
  v_minutes int;
  v_win_xp int;
  v_lose_xp int;
begin
  select * into v_b from battles where id = p_battle_id for update;
  if not found or v_b.status <> 'active' then raise exception 'battle is not active'; end if;
  if v_b.player_a <> v_me and v_b.player_b <> v_me then raise exception 'not your battle'; end if;

  v_winner := case when v_b.player_a = v_me then v_b.player_b else v_b.player_a end;
  v_minutes := greatest(0, extract(epoch from (now() - v_b.started_at))::int / 60);
  v_win_xp := least(60, 20 + v_minutes);
  v_lose_xp := least(20, v_minutes);

  update battles set
    status = 'finished', ended_at = now(), paused_by = v_me,
    loser_id = v_me, winner_id = v_winner,
    winner_xp_awarded = v_win_xp, loser_xp_awarded = v_lose_xp
  where id = p_battle_id;

  update user_profiles set battle_xp = coalesce(battle_xp,0) + v_win_xp where id = v_winner;
  update user_profiles set battle_xp = coalesce(battle_xp,0) + v_lose_xp where id = v_me;

  select * into v_b from battles where id = p_battle_id;
  return to_json(v_b);
end;
$$;
grant execute on function pause_battle(uuid) to authenticated;
