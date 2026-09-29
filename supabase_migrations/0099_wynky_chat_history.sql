-- Wynky's chat history, so a student who closes or reloads the chat still
-- sees what they talked about last time (on any device they sign in on).
--
-- Only the latest 300 messages per student are kept: the trigger below
-- trims older ones on every insert, so the table stays small on the free
-- tier. Students can clear their own history from the chat at any time.
create table if not exists public.wynky_chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sender text not null check (sender in ('bot', 'user')),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);

alter table public.wynky_chat_messages enable row level security;

drop policy if exists "wynky_chat_messages_owner" on public.wynky_chat_messages;
create policy "wynky_chat_messages_owner" on public.wynky_chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_wynky_chat_messages_user on public.wynky_chat_messages(user_id, id desc);

create or replace function public.wynky_chat_trim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.wynky_chat_messages
  where user_id = new.user_id
    and id < (
      select id from public.wynky_chat_messages
      where user_id = new.user_id
      order by id desc offset 299 limit 1
    );
  return null;
end;
$$;

revoke all on function public.wynky_chat_trim() from public, anon, authenticated;

drop trigger if exists wynky_chat_trim on public.wynky_chat_messages;
create trigger wynky_chat_trim after insert on public.wynky_chat_messages
  for each row execute function public.wynky_chat_trim();
