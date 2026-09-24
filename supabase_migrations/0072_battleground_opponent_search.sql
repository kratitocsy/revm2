-- Battleground: opponent discovery.
-- 0062_battleground.sql's get_friends_battle_xp() assumed a friends system
-- ("the client already has friend ids via list_friends()") that doesn't
-- exist in this schema. These two functions are what the Battleground UI
-- actually needs to find someone to challenge and to show a leaderboard,
-- without inventing a whole friends feature: username search (same
-- public username/avatar already exposed via community RPCs) and a
-- global top-XP board (same pattern as leaderboard_global in 0050).

create or replace function search_battle_opponents(p_query text default '', p_limit int default 20)
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
    and (nullif(trim(p_query), '') is null or up.username ilike '%' || trim(p_query) || '%')
  order by up.username
  limit greatest(1, least(p_limit, 50));
$$;
grant execute on function search_battle_opponents(text, int) to authenticated;

-- Excludes the caller - the client always adds its own "You" row from
-- get_battleground_state()'s me.xp, so this only needs everyone else.
create or replace function get_top_battlers(p_limit int default 10)
returns table(id uuid, username text, avatar_url text, battle_xp int, title text)
language sql
security definer
set search_path = public
stable
as $$
  select up.id, up.username, up.avatar_url, coalesce(up.battle_xp,0) as battle_xp,
    battle_title_for_xp(coalesce(up.battle_xp,0)) as title
  from user_profiles up
  where coalesce(up.battle_xp,0) > 0 and up.id <> auth.uid()
  order by up.battle_xp desc, up.username
  limit greatest(1, least(p_limit, 50));
$$;
grant execute on function get_top_battlers(int) to authenticated;
