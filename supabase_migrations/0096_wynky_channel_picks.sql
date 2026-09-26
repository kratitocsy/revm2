-- Wynky's "suggested YouTube channels" for a subject: seeded from a small
-- curated list of well-known exam-prep channels (query strings only — the
-- actual channel identity always comes from yt-resolve-channel's real
-- YouTube search, same as blocks.html's manual picker, never guessed),
-- then re-ranked over time by what students actually keep. This table is
-- the "other students in the same exam picked this too" signal.
--
-- Deliberately just a count, not a trained model: one row per
-- (user, exam, subject, channel) the student currently has picked; adding
-- a channel upserts a row, removing it deletes the row, so a popularity
-- count is always "how many students have this on right now", never a
-- historical tally that never comes back down.
create table if not exists public.wynky_channel_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Free-text exam/subject, same values Wynky already reads off
  -- user_profiles (exam) and shows per-subject (subjects[]) — bucketed
  -- client-side into a normalized key so "JEE 2026" and "JEE 2027" share
  -- the same popularity pool. Stored as the normalized key, not the raw
  -- text, so the aggregate stays meaningful across cohorts.
  exam_key text not null check (char_length(exam_key) between 1 and 40),
  subject_key text not null check (char_length(subject_key) between 1 and 40),
  channel_id text not null check (char_length(channel_id) between 1 and 100),
  channel_label text not null check (char_length(channel_label) between 1 and 150),
  created_at timestamptz not null default now(),
  primary key (user_id, exam_key, subject_key, channel_id)
);

alter table public.wynky_channel_picks enable row level security;

-- Students manage only their own picks directly...
drop policy if exists "wynky_channel_picks_owner" on public.wynky_channel_picks;
create policy "wynky_channel_picks_owner" on public.wynky_channel_picks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ...the cross-student "popular in your exam" ranking is served only
-- through this aggregate RPC, which returns counts and the channel's own
-- public label/id — never which student picked what.
create or replace function public.rpc_wynky_popular_channels(
  p_exam_key text,
  p_subject_key text,
  p_limit int default 20
) returns table (channel_id text, channel_label text, pick_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select channel_id, min(channel_label) as channel_label, count(*) as pick_count
  from public.wynky_channel_picks
  where exam_key = p_exam_key and subject_key = p_subject_key
  group by channel_id
  order by pick_count desc, channel_label asc
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.rpc_wynky_popular_channels(text, text, int) to authenticated;

create or replace function public.rpc_wynky_set_channel_pick(
  p_exam_key text,
  p_subject_key text,
  p_channel_id text,
  p_channel_label text,
  p_picked boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_picked then
    insert into public.wynky_channel_picks(user_id, exam_key, subject_key, channel_id, channel_label)
    values (v_user, p_exam_key, p_subject_key, p_channel_id, p_channel_label)
    on conflict (user_id, exam_key, subject_key, channel_id)
    do update set channel_label = excluded.channel_label;
  else
    delete from public.wynky_channel_picks
    where user_id = v_user and exam_key = p_exam_key and subject_key = p_subject_key and channel_id = p_channel_id;
  end if;
end;
$$;

grant execute on function public.rpc_wynky_set_channel_pick(text, text, text, text, boolean) to authenticated;
