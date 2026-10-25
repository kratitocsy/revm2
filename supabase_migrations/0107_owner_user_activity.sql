-- Owner Control: "Activity" module.
--
--   owner_user_activity(p_sort, p_range, p_limit)
--     p_sort  'active'  -> accounts ordered by last_active_at (most recent first)
--             'studied' -> accounts ordered by study time in the range (most first)
--     p_range '1d' | '7d' | '30d' | 'all'
--
-- Study time uses the same expression as the leaderboards / communities:
-- total_seconds when set, else (ended_at or now) - started_at - paused time.
-- studying_now = a session that has not ended and started in the last 6 hours.
-- Owner-only: re-checked server-side with is_platform_owner().

create or replace function public.owner_user_activity(
  p_sort text default 'active',
  p_range text default '7d',
  p_limit integer default 100
)
returns table(
  user_id uuid, username text, full_name text, avatar_url text,
  last_active_at timestamptz, studied_seconds bigint, session_count integer,
  studying_now boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;

  v_start := case p_range
    when '1d'  then now() - interval '1 day'
    when '7d'  then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    else '-infinity'::timestamptz
  end;

  return query
  with study as (
    select ss.user_id as uid,
           sum(coalesce(ss.total_seconds,
                 greatest(0, extract(epoch from (coalesce(ss.ended_at, now()) - ss.started_at))::int
                             - coalesce(ss.accumulated_paused_seconds, 0))))::bigint as secs,
           count(*)::int as n,
           bool_or(ss.ended_at is null and ss.started_at > now() - interval '6 hours') as live
      from public.study_sessions ss
     where ss.started_at >= v_start
     group by ss.user_id
  )
  select p.id, p.username, coalesce(p.full_name, p.display_name), p.avatar_url,
         p.last_active_at, coalesce(s.secs, 0)::bigint, coalesce(s.n, 0)::int,
         coalesce(s.live, false)
    from public.user_profiles p
    left join study s on s.uid = p.id
   where (p_sort = 'studied' and coalesce(s.secs, 0) > 0)
      or (p_sort <> 'studied' and p.last_active_at >= v_start)
   order by case when p_sort = 'studied' then coalesce(s.secs, 0) end desc nulls last,
            p.last_active_at desc nulls last
   limit v_limit;
end;
$$;

revoke execute on function public.owner_user_activity(text, text, integer) from public, anon;
grant execute on function public.owner_user_activity(text, text, integer) to authenticated;
