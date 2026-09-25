-- Notification bell (Home dashboard header) + owner announcements.
--
--   * notifications.link - optional place a notification opens (an app path
--     like /home?room=... or an https:// URL).
--   * notifications go out over Realtime so the bell updates live (RLS still
--     limits each user to their own rows).
--   * Users can only flip `read` on their own notifications (column grant +
--     mark_my_notifications_read), not rewrite the text of an announcement.
--   * notification_broadcasts + owner_send_notification: the owner (Owner
--     Control -> Send notification) sends a custom notification to every
--     account; owner_list_broadcasts shows what was sent and how many read
--     it; owner_retract_broadcast takes one back from everyone's bell.

alter table public.notifications add column if not exists link text;
alter table public.notifications drop constraint if exists notifications_link_chk;
alter table public.notifications add constraint notifications_link_chk
  check (link is null or (char_length(link) <= 500 and link ~ '^(/|https://)'));

-- Only the read flag is theirs to change.
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

create or replace function public.mark_my_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.notifications set read = true
   where user_id = auth.uid() and not read and (p_ids is null or id = any (p_ids));
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke execute on function public.mark_my_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_my_notifications_read(uuid[]) to authenticated;

-- ── Owner announcements ──────────────────────────────────────────────────
create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 1000),
  link text check (link is null or (char_length(link) <= 500 and link ~ '^(/|https://)')),
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  recipients int not null default 0,
  retracted_at timestamptz
);
alter table public.notification_broadcasts enable row level security;
revoke all on public.notification_broadcasts from anon, authenticated;

create or replace function public.owner_send_notification(p_title text, p_body text default null, p_link text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_id uuid;
  v_count int;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'Give the notification a title (up to 120 characters).'; end if;
  if v_body is not null and char_length(v_body) > 1000 then raise exception 'Keep the message under 1000 characters.'; end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~ '^(/|https://)') then
    raise exception 'Links must start with / (a Wynko page) or https://';
  end if;

  insert into public.notification_broadcasts (title, body, link, sent_by)
  values (v_title, v_body, v_link, auth.uid())
  returning id into v_id;

  insert into public.notifications (user_id, type, title, body, ref_id, link)
  select u.id, 'announcement', v_title, v_body, v_id, v_link
    from auth.users u;
  get diagnostics v_count = row_count;

  update public.notification_broadcasts set recipients = v_count where id = v_id;
  perform public.owner_log('notify', 'broadcast', v_id, v_title, null,
    jsonb_build_object('recipients', v_count, 'body', left(v_body, 1000), 'link', v_link));
  return jsonb_build_object('id', v_id, 'recipients', v_count);
end;
$$;

create or replace function public.owner_list_broadcasts()
returns table(
  id uuid, title text, body text, link text, sent_at timestamptz, sent_by_label text,
  recipients int, read_count int, retracted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  return query
  select b.id, b.title, b.body, b.link, b.sent_at, public.owner_user_label(b.sent_by),
         b.recipients,
         (select count(*)::int from public.notifications n where n.type = 'announcement' and n.ref_id = b.id and n.read),
         b.retracted_at
    from public.notification_broadcasts b
   order by b.sent_at desc
   limit 100;
end;
$$;

create or replace function public.owner_retract_broadcast(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v int;
begin
  if not public.is_platform_owner() then raise exception 'owner only'; end if;
  select title into v_title from public.notification_broadcasts where id = p_id and retracted_at is null;
  if not found then raise exception 'That notification was not found or is already retracted.'; end if;
  delete from public.notifications where type = 'announcement' and ref_id = p_id;
  get diagnostics v = row_count;
  update public.notification_broadcasts set retracted_at = now() where id = p_id;
  perform public.owner_log('retract', 'broadcast', p_id, v_title, null, jsonb_build_object('removed', v));
  return v;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.owner_send_notification(text,text,text)',
    'public.owner_list_broadcasts()',
    'public.owner_retract_broadcast(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
