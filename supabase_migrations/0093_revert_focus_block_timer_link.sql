-- Revert 0092: the study timer no longer ends the focus block on pause or
-- stop. Per direction, block <-> timer linking will come back later via
-- Schedules (fixed clock windows), not tied to the study timer's own
-- pause/stop. rpc_pause_study_session and rpc_stop_study_session go back
-- to exactly their pre-0092 bodies; end_focus_block_for_timer_off() is
-- dropped since nothing calls it any more.
--
-- Still in place, untouched by this revert: migration 0091's per-minute
-- cron (end_stale_focus_blocks) - a timed block still ends when its time
-- is up, and an unlimited block still auto-closes after 12h idle with no
-- timer running. That's the actual fix for the 14 Aug bug; this migration
-- only undoes the timer-pause/stop link that came after it.

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

  return v_row;
end; $function$;

drop function if exists public.end_focus_block_for_timer_off(uuid);
