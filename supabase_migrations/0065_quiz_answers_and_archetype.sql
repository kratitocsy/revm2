-- Wynko Quiz Bot spec, Section 2/3 (Quiz + Result screen), build order Step 2.
--
-- exam/subjects/track already exist on user_profiles and map directly to
-- quiz Q1 and the subject pool - no need to duplicate them. username /
-- has_custom_username also already exist (format-constrained, "editable
-- once free" flag) and are unused elsewhere in the codebase - reused here
-- for the archetype-based identity reveal instead of adding new columns.
--
-- What's actually missing: the rest of the quiz's raw answers (Q2-Q7,
-- everything the SetupBot needs to read before asking chip questions) and
-- the computed archetype.

alter table user_profiles
  add column if not exists quiz_answers jsonb,
  add column if not exists archetype text,
  add column if not exists quiz_completed_at timestamptz;

comment on column user_profiles.quiz_answers is
  'Raw Wynky onboarding quiz answers (Q2-Q7): student_type, fixed_commitment_type, focus_time, daily_hours, distractions[], study_mode. Q1 (exam) and subjects already live on their own columns. Read by SetupBot before asking chip questions - see Section 4 of the quiz bot spec.';
comment on column user_profiles.archetype is
  'One of the 8 quiz archetypes (Dawn Warrior, Night Owl, Sprinter, Marathoner, Visual Learner, Social Battler, Grind Machine, Balanced Planner). Null until first quiz completion.';
comment on column user_profiles.quiz_completed_at is
  'Set on first quiz completion only - re-taking the quiz does not re-grant the completion/first-time Wynkoin bonuses (115 max, one-time).';
