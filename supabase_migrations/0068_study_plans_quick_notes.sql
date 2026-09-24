-- Focus Lock's "Quick Notes" panel was component state only, so a note was
-- gone the moment you left the page. It now lives on the user's study_plans
-- row (migration 0067), which Focus Lock already syncs and subscribes to, so
-- the note survives reloads and follows the user across tabs and devices.
--
-- null = never written. 20k characters is far beyond a scratch note but keeps
-- one row from growing without bound.

alter table public.study_plans
  add column if not exists quick_notes text
  check (quick_notes is null or char_length(quick_notes) <= 20000);

comment on column public.study_plans.quick_notes is
  'Focus Lock Quick Notes scratchpad for this user. Synced by src/apps/desktop-dashboard/lib/studyPlanStore.ts.';
