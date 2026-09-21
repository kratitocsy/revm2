-- Wynko Quiz Bot / Schedule Plan (Section 1 of build order): data model.
--
-- Design decision: this project already has focus_lock_schedules /
-- focus_lock_schedule_slots / focus_lock_schedule_overrides / _runs, which
-- cover the spec's day_types / day_blocks / day_overrides concepts almost
-- exactly (weekday-recurring, server-enforced via schedule-tick). Rather
-- than fork a parallel schema, we extend that system with the one thing
-- it's missing: a `subjects` table where the allow-list itself lives.
--
-- Spec's key rule (Section 5): "Allow-lists belong to the subject, not the
-- block or the day. Edit a subject's channels once and every block using
-- it updates automatically." Today allow-lists live on focus_lock_presets,
-- which bundle multiple subjects together (e.g. preset "chemistry+maths").
-- subjects gives each subject its own allow-list, reusing the exact same
-- JSON shapes focus_lock_presets already uses (sites: string[], youtube_rules:
-- {mode, channels:[{id,label}]}, apps: string[]) so the extension/desktop
-- enforcement code needs zero new parsing logic.

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- Quiz Q3/generator input: weak subjects get 1.5x time in the rule-based
  -- generator (Section 5).
  is_weak boolean not null default false,
  allow_sites jsonb not null default '[]',
  youtube_rules jsonb,
  allow_apps jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create index if not exists idx_subjects_user on subjects(user_id);

-- Link schedule slots (= spec's day_blocks) to a subject's allow-list.
-- Additive: the existing free-text `subject`/`subject_tag` columns stay as
-- the display label and tracker-matching key respectively; subject_id is
-- the new pointer to the actual allow-list owner. Nullable so existing
-- rows and manually-built (non-generator) slots keep working unchanged.
alter table focus_lock_schedule_slots
  add column if not exists subject_id uuid references subjects(id) on delete set null;

create index if not exists idx_schedule_slots_subject on focus_lock_schedule_slots(subject_id);

alter table subjects enable row level security;

drop policy if exists "subjects_owner" on subjects;
create policy "subjects_owner" on subjects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
