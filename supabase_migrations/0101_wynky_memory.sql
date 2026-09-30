-- What Wynky remembers about each student: short facts ("works on Wynko
-- 1:30-5 pm", "exam in April") and rules ("Chemistry every day") the AI chat
-- picks up. Sent with every chat message so nothing said once is lost, and
-- shown under Settings > Privacy > What Wynky remembers, where the student
-- can delete any of it.
--
-- Every add and delete is also logged to wynky_events (field 'memory'),
-- which the monthly wynky-archive job moves to the R2 "wynko-learning"
-- bucket, so the history is kept for training later.
--
-- The newest 60 per student are kept; the trigger below drops older ones.

create table if not exists public.wynky_memory (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fact text not null check (char_length(fact) between 1 and 300),
  -- Same fact in different case or spacing counts once.
  fact_key text generated always as (lower(btrim(fact))) stored,
  kind text not null default 'fact' check (kind in ('fact', 'rule')),
  created_at timestamptz not null default now(),
  unique (user_id, fact_key)
);

alter table public.wynky_memory enable row level security;

drop policy if exists "wynky_memory_owner" on public.wynky_memory;
create policy "wynky_memory_owner" on public.wynky_memory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_wynky_memory_user on public.wynky_memory(user_id, id desc);

create or replace function public.wynky_memory_trim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.wynky_memory
  where user_id = new.user_id
    and id < (
      select id from public.wynky_memory
      where user_id = new.user_id
      order by id desc offset 59 limit 1
    );
  return null;
end;
$$;

revoke all on function public.wynky_memory_trim() from public, anon, authenticated;

drop trigger if exists wynky_memory_trim on public.wynky_memory;
create trigger wynky_memory_trim after insert on public.wynky_memory
  for each row execute function public.wynky_memory_trim();
