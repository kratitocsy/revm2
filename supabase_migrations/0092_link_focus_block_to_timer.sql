-- Block <-> timer, linked directly: the site/app block is active only
-- while the focus timer is running. Pausing or stopping the timer now
-- ends the block immediately (instead of relying on the pill/manual "End
-- block", which is removed) - the block can no longer outlive the timer
-- it goes with.
--
--   * A locked (no_early_unlock) block with time left keeps its own
--     protection: stopping the timer is not turned into a stop-early
--     loophole for it. Same exception rpc_end_my_focus_block already has.
--   * Only wired into rpc_pause_study_session / rpc_stop_study_session -
--     the two places a running timer stops being "running" for every
--     client (web, mobile, desktop, tracker.html, timer.html, study
--     rooms). schedule-tick already ends the block itself when it stops a
--     session directly, so it's untouched here.
--   * Starting/resuming a timer does NOT auto-start a block - there's no
--     site/app list to invent one from. Blocks are still started from
--     blocks.html same as before; this only closes the "block outlives
--     the timer" gap.
--   * end_stale_focus_blocks() (migration 0091) and its per-minute cron
--     stay as a backstop for cases with no pause/stop RPC call at all
--     (crashed tab, app killed).

create or replace function public.end_focus_block_for_timer_off(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.focus_lock_sessions;
begin
  select * into v from public.focus_lock_sessions
   where user_id = p_user_id and active
   for update;
  if not found then return; end if;

  if coalesce(v.no_early_unlock, false) and v.ends_at is not null and v.ends_at > now() then
    return;
  end if;

  update public.focus_lock_sessions
     set active = false,
         verified = (v.ends_at is not null and v.ends_at <= now()),
         ended_at = now(),
         end_reason = 'timer_stopped'
   where id = v.id;
end;
$$;
revoke execute on function public.end_focus_block_for_timer_off(uuid) from public, anon, authenticated;

create or replace function public.rpc_pause_study_session(p_session_id uuid)
returns study_sessions
language plpgsql
security definer
set search_path = public
as $function$
declare v_row public.study_sessions;
begin
  update public.study_sessions
    set paused_at = now()
  where id = p_session_id
    and user_id = auth.uid()
    and ended_at is null
    and paused_at is null
  returning * into v_row;

  if v_row.id is null then raise exception 'session not found, already ended, or already paused'; end if;

  perform public.end_focus_block_for_timer_off(auth.uid());

  return v_row;
end; $function$;

create or replace function public.rpc_stop_study_session(p_session_id uuid)
returns study_sessions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row         public.study_sessions;
  v_extra_pause int := 0;
begin
  select * into v_row from public.study_sessions
  where id = p_session_id and user_id = auth.uid();

  if v_row.id is null then raise exception 'session not found'; end if;
  if v_row.ended_at is not null then return v_row; end if; -- idempotent

  if v_row.paused_at is not null then
    v_extra_pause := greatest(0, floor(extract(epoch from (now() - v_row.paused_at)))::int);
  end if;

  update public.study_sessions
    set ended_at = now(),
        paused_at = null,
        accumulated_paused_seconds = accumulated_paused_seconds + v_extra_pause,
        total_seconds = greatest(0,
          floor(extract(epoch from (now() - started_at)))::int
          - (accumulated_paused_seconds + v_extra_pause))
  where id = p_session_id
  returning * into v_row;

  perform public.end_focus_block_for_timer_off(auth.uid());

  return v_row;
end; $function$;
