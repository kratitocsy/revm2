-- 0106_voice_nudge.sql
--
-- "Ask to talk": a member of a study room can nudge another member of the same
-- room, which drops a notification into that person's bell
-- ("<name> asked you to talk") that opens the room.
--
-- Users cannot insert into public.notifications themselves (RLS only lets them
-- read their own rows and flip `read`), so this is a security-definer function
-- that does the checks the table's policies can't:
--   * the caller is signed in and a member of the room;
--   * the target is a different member of the same room;
--   * at most 10 nudges per caller per 10 minutes (enforce_rate_limit raises);
--   * a target is nudged for a room at most once a minute, by anyone, so a
--     group can't pile notifications on one person.
-- Returns 'sent' or 'cooldown'.

create or replace function public.rpc_nudge_to_talk(p_group_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_room text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_user_id is null or p_user_id = v_me then raise exception 'pick someone else in the room'; end if;
  if not public.is_group_member(p_group_id, v_me) then raise exception 'not a member of this room'; end if;
  if not public.is_group_member(p_group_id, p_user_id) then raise exception 'that person is not in this room'; end if;

  perform public.enforce_rate_limit('voice_nudge', 10, 600);

  if exists (
    select 1 from public.notifications n
    where n.user_id = p_user_id and n.type = 'voice_nudge' and n.ref_id = p_group_id
      and n.created_at > now() - interval '1 minute'
  ) then
    return 'cooldown';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.full_name), ''), p.username, 'Someone')
    into v_name
  from public.user_profiles p where p.id = v_me;
  select g.name into v_room from public.study_groups g where g.id = p_group_id;

  insert into public.notifications (user_id, type, title, body, ref_id, link)
  values (
    p_user_id,
    'voice_nudge',
    coalesce(v_name, 'Someone') || ' asked you to talk',
    'In ' || coalesce(v_room, 'your study room') || '. Open the room and tap Join voice.',
    p_group_id,
    '/home.html?room=' || p_group_id::text
  );
  return 'sent';
end;
$$;

revoke all on function public.rpc_nudge_to_talk(uuid, uuid) from public;
revoke execute on function public.rpc_nudge_to_talk(uuid, uuid) from anon;
grant execute on function public.rpc_nudge_to_talk(uuid, uuid) to authenticated;
