-- Each user's saved Pomodoro configuration for Focus Lock / Study Rooms:
-- focus length, break length, Repeat and Auto-start breaks. Chosen once in
-- the "Customize Pomodoro" modal (click the Pomodoro Timer card in Focus
-- Lock) and then used for every new Pomodoro session, on every device,
-- until the user changes it again.
--
-- NULL means "never customized" - the app falls back to its built-in
-- defaults (25 min focus / 5 min break / Repeat on / Auto-start breaks on).
-- The app also keeps a localStorage copy (see src/apps/_shared/
-- pomodoroSettings.ts) and reconciles the two by `updatedAt` (ms epoch,
-- last write wins), so this column being absent - migration not yet
-- applied - only means settings stay per-device, never that they're lost.
--
-- Shape: { "focusMinutes": 50, "breakMinutes": 10, "repeat": true,
--          "autoStartBreaks": true, "updatedAt": 1789881691427 }

alter table user_profiles
  add column if not exists pomodoro_settings jsonb
  check (
    pomodoro_settings is null
    or (
      jsonb_typeof(pomodoro_settings) = 'object'
      -- CASE guarantees the regex test runs before the int cast.
      and case when (pomodoro_settings->>'focusMinutes') ~ '^[0-9]{1,3}$'
               then (pomodoro_settings->>'focusMinutes')::int between 1 and 180
               else false end
      and case when (pomodoro_settings->>'breakMinutes') ~ '^[0-9]{1,3}$'
               then (pomodoro_settings->>'breakMinutes')::int between 1 and 60
               else false end
    )
  );

comment on column user_profiles.pomodoro_settings is
  'The user''s saved Pomodoro configuration ({focusMinutes, breakMinutes, repeat, autoStartBreaks, updatedAt}). NULL = never customized; app defaults are 25/5, repeat on, auto-start breaks on.';
