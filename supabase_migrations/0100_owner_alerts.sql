-- Owner alerts: things the owner must act on, shown as a red banner at the
-- top of Owner Control until dismissed. First use: an AI model Wynky
-- relies on (Groq or Gemini) was retired or is about to be.
--
-- Written only by the server (ai-generate-schedule with the service role,
-- or the daily check) through record_owner_alert(); an open alert with the
-- same key is not added twice, so a retired model makes one banner, not
-- one per student request.

create table if not exists public.owner_alerts (
  id           bigint generated always as identity primary key,
  alert_key    text not null check (char_length(alert_key) <= 200),
  title        text not null check (char_length(title) <= 200),
  body         text check (char_length(body) <= 2000),
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz
);

-- One open alert per key.
create unique index if not exists owner_alerts_open_key
  on public.owner_alerts (alert_key) where dismissed_at is null;

alter table public.owner_alerts enable row level security;
-- No policies: only the security-definer functions below touch it.
revoke all on public.owner_alerts from public, anon, authenticated;

create or replace function public.record_owner_alert(p_key text, p_title text, p_body text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.owner_alerts (alert_key, title, body)
  values (left(p_key, 200), left(p_title, 200), left(p_body, 2000))
  on conflict (alert_key) where dismissed_at is null do nothing;
$$;
revoke execute on function public.record_owner_alert(text, text, text) from public, anon, authenticated;
grant execute on function public.record_owner_alert(text, text, text) to service_role;

create or replace function public.owner_list_alerts()
returns table (id bigint, title text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  return query
    select a.id, a.title, a.body, a.created_at
      from public.owner_alerts a
     where a.dismissed_at is null
     order by a.created_at desc
     limit 20;
end;
$$;

create or replace function public.owner_dismiss_alert(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  update public.owner_alerts set dismissed_at = now() where id = p_id and dismissed_at is null;
end;
$$;

revoke execute on function public.owner_list_alerts() from public, anon;
revoke execute on function public.owner_dismiss_alert(bigint) from public, anon;
grant execute on function public.owner_list_alerts() to authenticated;
grant execute on function public.owner_dismiss_alert(bigint) to authenticated;
