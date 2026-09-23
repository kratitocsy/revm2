-- The user's selected Focus Lock timer mode (the Pomodoro / Regular blocks
-- on Focus Lock and the mode chip on Home's Focus Timer card). It was a
-- per-device localStorage preference; it is now saved per user so it stays
-- the same across sessions and devices until the user picks the other mode.
--
-- Same shape/rules as pomodoro_settings (migration 0063): the client keeps a
-- localStorage copy and reconciles the two by `updatedAt` (ms epoch, last
-- write wins), so a change made offline is pushed up later instead of being
-- overwritten by an older server value. NULL = never chosen (the app
-- defaults to Pomodoro). See src/apps/_shared/timerModeSettings.ts.
--
-- Shape: { "mode": "regular", "updatedAt": 1790200000000 }

alter table public.user_profiles
  add column if not exists timer_mode jsonb
  check (
    timer_mode is null
    or (
      jsonb_typeof(timer_mode) = 'object'
      and timer_mode ? 'mode'
      and timer_mode->>'mode' in ('pomodoro', 'regular')
    )
  );

comment on column public.user_profiles.timer_mode is
  'Focus Lock timer mode the user last picked ({mode: pomodoro|regular, updatedAt}). NULL = never chosen; the app defaults to pomodoro.';
