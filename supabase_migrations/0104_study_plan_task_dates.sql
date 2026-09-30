-- Dates for Focus Lock / Home tasks, so a task lives on a calendar day and
-- Home, Focus Lock and Schedules show it on that day.
--
--   plan_date            local calendar day the task belongs to. null = a task
--                        from before dates existed, which the client treats as
--                        today's (see planCalendar.ts).
--   source_schedule_id   set when the task was created from a block on the
--                        Schedules page (weekly_schedule jsonb on study_plans;
--                        blocks there now carry an optional "date" and
--                        "skipDates" - no schema change needed for those).
--                        The client links the two so deleting either removes
--                        the other, and derives the task id from it so two
--                        devices creating it at once converge on one row.

alter table public.study_plan_tasks
  add column if not exists plan_date date,
  add column if not exists source_schedule_id text
    check (source_schedule_id is null or char_length(source_schedule_id) <= 200);

create index if not exists idx_study_plan_tasks_user_date
  on public.study_plan_tasks (user_id, plan_date);

comment on column public.study_plan_tasks.plan_date is
  'Calendar day (client-local) this task belongs to; null = legacy undated task, shown as today''s.';
comment on column public.study_plan_tasks.source_schedule_id is
  'Schedules block this task was created from (block id, or "<block id>@<date>" for a weekly block).';
