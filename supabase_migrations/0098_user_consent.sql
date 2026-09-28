-- Consent for the optional uses of a student's data (Privacy Policy 4.1).
--
-- Signing in already means agreeing to the Terms and Privacy Policy (the
-- note under the sign-in buttons). What's recorded here is the separate,
-- optional part the DPDP Act wants asked on its own: product emails,
-- usage analytics and personalised ads. Saying no to any of these never
-- blocks using Wynko - it only means general ads and no marketing email.
--
-- age_group is self-declared on the consent screen. Personalised ads are
-- only ever on for 'adult'; a known date of birth under 18 overrides the
-- declaration (see set_my_consent).
create table if not exists public.user_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  age_group text not null check (age_group in ('under_18', 'adult')),
  marketing boolean not null default false,
  analytics boolean not null default false,
  personalised_ads boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_consent_ads_adults_only check (personalised_ads = false or age_group = 'adult')
);

alter table public.user_consent enable row level security;

-- Read own row only. Writes go through set_my_consent so the adult-only
-- rule and the audit log below can't be skipped.
drop policy if exists "user_consent_select_own" on public.user_consent;
create policy "user_consent_select_own" on public.user_consent for select
  using (auth.uid() = user_id);

-- Every change, kept as proof of what each person agreed to and when.
create table if not exists public.user_consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  age_group text not null,
  marketing boolean not null,
  analytics boolean not null,
  personalised_ads boolean not null,
  source text not null check (source in ('consent_screen', 'settings')),
  created_at timestamptz not null default now()
);

alter table public.user_consent_log enable row level security;

drop policy if exists "user_consent_log_select_own" on public.user_consent_log;
create policy "user_consent_log_select_own" on public.user_consent_log for select
  using (auth.uid() = user_id);

create index if not exists idx_user_consent_log_user
  on public.user_consent_log(user_id, created_at desc);

create or replace function public.set_my_consent(
  p_policy_version text,
  p_age_group text,
  p_marketing boolean,
  p_analytics boolean,
  p_personalised_ads boolean,
  p_source text default 'consent_screen'
) returns public.user_consent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dob date;
  v_age_group text := p_age_group;
  v_row public.user_consent;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_age_group not in ('under_18', 'adult') then raise exception 'invalid age group'; end if;
  if p_source not in ('consent_screen', 'settings') then raise exception 'invalid source'; end if;
  if coalesce(trim(p_policy_version), '') = '' then raise exception 'policy version required'; end if;

  -- A date of birth on file that says under 18 wins over the self-declared answer.
  select dob into v_dob from public.user_profiles where id = v_user;
  if v_dob is not null and v_dob > (current_date - interval '18 years')::date then
    v_age_group := 'under_18';
  end if;

  insert into public.user_consent as c
    (user_id, policy_version, age_group, marketing, analytics, personalised_ads)
  values
    (v_user, p_policy_version, v_age_group, coalesce(p_marketing, false), coalesce(p_analytics, false),
     coalesce(p_personalised_ads, false) and v_age_group = 'adult')
  on conflict (user_id) do update set
    policy_version = excluded.policy_version,
    age_group = excluded.age_group,
    marketing = excluded.marketing,
    analytics = excluded.analytics,
    personalised_ads = excluded.personalised_ads,
    updated_at = now()
  returning * into v_row;

  insert into public.user_consent_log
    (user_id, policy_version, age_group, marketing, analytics, personalised_ads, source)
  values
    (v_user, v_row.policy_version, v_row.age_group, v_row.marketing, v_row.analytics, v_row.personalised_ads, p_source);

  return v_row;
end;
$$;

revoke all on function public.set_my_consent(text, text, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.set_my_consent(text, text, boolean, boolean, boolean, text) to authenticated;
