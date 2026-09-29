-- Schedules that repeat every N weeks instead of every week.
--
-- A schedule runs on its days_of_week only in the weeks where
--   week_index % repeat_weeks = week_offset
-- where week_index counts whole weeks (Monday to Sunday, Asia/Kolkata) since
-- Monday 2024-01-01. schedule-tick and the apps compute it the same way.
--
-- repeat_weeks = 1 (the default) is every week, as before. "Every 2 weeks"
-- is repeat_weeks = 2; a Week A / Week B plan is two sets of schedules with
-- repeat_weeks = 2 and week_offset 0 and 1.

alter table focus_lock_schedules
  add column if not exists repeat_weeks smallint not null default 1,
  add column if not exists week_offset smallint not null default 0;

alter table focus_lock_schedules drop constraint if exists focus_lock_schedules_repeat_weeks_check;
alter table focus_lock_schedules add constraint focus_lock_schedules_repeat_weeks_check
  check (repeat_weeks between 1 and 4 and week_offset >= 0 and week_offset < repeat_weeks);
