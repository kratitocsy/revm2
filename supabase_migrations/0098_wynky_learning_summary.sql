-- Wynky keeps learning forever without wynky_events growing forever.
--
-- wynky_learned is the running summary Wynky learns from: one row per
-- student per answer (a wake time, a site for Physics, a typed request),
-- with how often they kept, changed, asked for or removed it and when they
-- last did. A trigger keeps it up to date from every wynky_events insert, so
-- the app writes events exactly as before. Its size depends on the number
-- of students, not on how long they have used Wynky.
--
-- wynky_events rows older than 120 days (the window rpc_wynky_peer_stats and
-- the recommender's recency weighting use) are copied to Cloudflare R2 as
-- compressed files by the wynky-archive edge function and only then deleted
-- here, so the full history is kept cheaply for training a model later.
-- The archive files never hold the real user id: it is replaced by a keyed
-- hash (the same student always gets the same hash, so their history stays
-- linkable for training, but it can't be turned back into an account).

create table if not exists public.wynky_learned (
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  value text not null,
  multi boolean not null default false,
  accepted_n integer not null default 0,
  changed_n integer not null default 0,
  requested_n integer not null default 0,
  removed_n integer not null default 0,
  last_action text not null check (last_action in ('accepted', 'changed', 'requested', 'removed')),
  first_at timestamptz not null,
  last_at timestamptz not null,
  primary key (user_id, field, value)
);

alter table public.wynky_learned enable row level security;

-- Students read only their own summary; only the trigger writes it.
drop policy if exists "wynky_learned_owner_read" on public.wynky_learned;
create policy "wynky_learned_owner_read" on public.wynky_learned for select
  using (auth.uid() = user_id);

create or replace function public.wynky_learn_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wynky_learned as l (
    user_id, field, value, multi, accepted_n, changed_n, requested_n, removed_n, last_action, first_at, last_at
  ) values (
    new.user_id, new.field, new.value, new.multi,
    (new.action = 'accepted')::int, (new.action = 'changed')::int,
    (new.action = 'requested')::int, (new.action = 'removed')::int,
    new.action, new.created_at, new.created_at
  )
  on conflict (user_id, field, value) do update set
    multi = excluded.multi,
    accepted_n = l.accepted_n + excluded.accepted_n,
    changed_n = l.changed_n + excluded.changed_n,
    requested_n = l.requested_n + excluded.requested_n,
    removed_n = l.removed_n + excluded.removed_n,
    last_action = case when excluded.last_at >= l.last_at then excluded.last_action else l.last_action end,
    last_at = greatest(l.last_at, excluded.last_at);
  return new;
end;
$$;

drop trigger if exists wynky_events_learn on public.wynky_events;
create trigger wynky_events_learn after insert on public.wynky_events
  for each row execute function public.wynky_learn_from_event();

-- Events written before this migration. Only on the first run: once events
-- have been archived, wynky_events no longer holds the full history, so a
-- re-run must never rebuild the summary from it.
insert into public.wynky_learned (user_id, field, value, multi, accepted_n, changed_n, requested_n, removed_n, last_action, first_at, last_at)
select user_id, field, value, bool_or(multi),
  count(*) filter (where action = 'accepted'), count(*) filter (where action = 'changed'),
  count(*) filter (where action = 'requested'), count(*) filter (where action = 'removed'),
  (array_agg(action order by created_at desc))[1], min(created_at), max(created_at)
from public.wynky_events
where not exists (select 1 from public.wynky_learned)
group by user_id, field, value;

-- ── Archive support (used only by the wynky-archive edge function) ──────

-- A random key made once, kept in Vault: it checks that a call really came
-- from the scheduled job, and salts the user-id hash in the archive files.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'wynky_archive_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'wynky_archive_key', 'wynky-archive job key and archive hash salt');
  end if;
end $$;

-- Returns the key only to the edge function (service role), never to users.
create or replace function public.wynky_archive_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wynky_archive_key' limit 1;
$$;
revoke execute on function public.wynky_archive_key() from public, anon, authenticated;
grant execute on function public.wynky_archive_key() to service_role;

create or replace function public.wynky_events_bytes()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select pg_total_relation_size('public.wynky_events');
$$;
revoke execute on function public.wynky_events_bytes() from public, anon, authenticated;
grant execute on function public.wynky_events_bytes() to service_role;

-- Once a day at 03:30 IST (22:00 UTC). The function itself decides whether
-- there is anything to do (1st of the month, or the log is over its size
-- limit) and does nothing until the R2 secrets are set.
do $$
begin
  perform cron.unschedule('wynky-archive') where exists (select 1 from cron.job where jobname = 'wynky-archive');
  perform cron.schedule('wynky-archive', '0 22 * * *', $cmd$
    select net.http_post(
      url := 'https://dhzjtjekbvxxsauzhadl.supabase.co/functions/v1/wynky-archive',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-archive-key', public.wynky_archive_key()),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$);
end $$;
