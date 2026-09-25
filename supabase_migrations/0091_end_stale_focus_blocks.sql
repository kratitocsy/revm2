-- Focus blocks can no longer be left "running" with nothing on screen.
--
-- A focus_lock_sessions row with active = true drives site/app blocking
-- (desktop app, Android, browser extension). Two kinds of rows used to stay
-- active forever:
--   * a timed block past its ends_at - nothing on the server ever closed it
--     (schedule-tick only closes blocks its own schedule slots started);
--   * an "unlimited" block started on the old Blocks page - it only ends
--     when stopped there, and the new Focus Lock page neither shows it nor
--     can stop it.
--
--   * end_stale_focus_blocks(), run every minute by pg_cron:
--       - timed blocks end once ends_at has passed (end_reason 'expired');
--       - unlimited blocks end once they're 12 hours old with no focus
--         timer running (end_reason 'no_timer_12h').
--   * rpc_end_my_focus_block(): the new app's "End block" button. Refuses
--     while a no-early-unlock block still has time left (same rule as the
--     Blocks page).

create or replace function public.end_stale_focus_blocks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired int;
  v_idle int;
begin
  update public.focus_lock_sessions
     set active = false,
         verified = true,
         ended_at = coalesce(ended_at, ends_at, now()),
         end_reason = coalesce(end_reason, 'expired')
   where active
     and not coalesce(unlimited, false)
     and ends_at is not null
     and ends_at < now();
  get diagnostics v_expired = row_count;

  update public.focus_lock_sessions f
     set active = false,
         verified = false,
         ended_at = coalesce(f.ended_at, now()),
         end_reason = coalesce(f.end_reason, 'no_timer_12h')
   where f.active
     and (coalesce(f.unlimited, false) or f.ends_at is null)
     and f.started_at < now() - interval '12 hours'
     and not exists (
       select 1 from public.study_sessions s
        where s.user_id = f.user_id and s.ended_at is null and s.paused_at is null
     );
  get diagnostics v_idle = row_count;

  return v_expired + v_idle;
end;
$$;
revoke execute on function public.end_stale_focus_blocks() from public, anon, authenticated;

create or replace function public.rpc_end_my_focus_block()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.focus_lock_sessions;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v from public.focus_lock_sessions
   where user_id = auth.uid() and active
   for update;
  if not found then return jsonb_build_object('ended', false); end if;

  if coalesce(v.no_early_unlock, false) and v.ends_at is not null and v.ends_at > now() then
    raise exception 'This block was started with early unlock turned off, so it can''t be stopped early. It ends at %.',
      to_char(v.ends_at at time zone 'Asia/Kolkata', 'HH12:MI AM');
  end if;

  update public.focus_lock_sessions
     set active = false,
         verified = (v.ends_at is not null and v.ends_at <= now()),
         ended_at = now(),
         end_reason = case when v.ends_at is not null and v.ends_at <= now() then 'expired' else 'ended_early' end
   where id = v.id;
  return jsonb_build_object('ended', true, 'id', v.id);
end;
$$;
revoke execute on function public.rpc_end_my_focus_block() from public, anon;
grant execute on function public.rpc_end_my_focus_block() to authenticated;

-- Close anything already stale, then keep doing it every minute.
select public.end_stale_focus_blocks();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'end-stale-focus-blocks') then
    perform cron.unschedule('end-stale-focus-blocks');
  end if;
  perform cron.schedule('end-stale-focus-blocks', '* * * * *', 'select public.end_stale_focus_blocks()');
end $$;
