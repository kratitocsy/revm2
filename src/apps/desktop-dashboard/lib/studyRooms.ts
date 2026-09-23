import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Study Rooms data: the dashboard's rooms are the site's real
   study groups (study_groups / group_members / group_messages -
   the same tables groups.html uses), plus the helpers from
   migration 0070 (list_study_rooms, rpc_create/join/leave_study_room,
   room_members, study_room_secrets for private-room passwords).

   Membership, chat and "who's studying now" are enforced
   server-side (RLS + security-definer functions); nothing here is
   trusted for access control.
   ============================================================ */

export type JoinResult = 'joined' | 'already_member' | 'wrong_password' | 'full' | 'invite_only';

export interface RoomRow {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  visibility: 'public' | 'private';
  has_password: boolean;
  is_official: boolean;
  member_count: number;
  member_limit: number;
  live_count: number;
  is_member: boolean;
  my_role: 'admin' | 'member' | null;
  preview_initials: string[] | null;
  created_at: string;
}

export interface RoomMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'member';
  joined_at: string;
  is_me: boolean;
  is_live: boolean;
  is_paused: boolean;
  started_at: string | null;
  subject: string | null;
  today_seconds: number;
}

export interface RoomMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function messageOf(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  return m;
}

// ── rooms list ───────────────────────────────────────────────────────────────
export async function fetchRooms(): Promise<RoomRow[]> {
  const { data, error } = await sb.rpc('list_study_rooms');
  if (error) throw new Error(messageOf(error, 'Could not load study rooms'));
  return (data || []) as RoomRow[];
}

export async function createRoom(form: { name: string; subject: string; desc: string; isPublic: boolean; password: string }): Promise<string> {
  const { data, error } = await sb.rpc('rpc_create_study_room', {
    p_name: form.name,
    p_description: form.desc,
    p_subject: form.subject,
    p_is_public: form.isPublic,
    p_password: form.isPublic ? null : form.password,
  });
  if (error) throw new Error(messageOf(error, 'Could not create the room'));
  return data as string;
}

export async function joinRoom(groupId: string, password?: string): Promise<JoinResult> {
  const { data, error } = await sb.rpc('rpc_join_study_room', { p_group_id: groupId, p_password: password ?? null });
  if (error) throw new Error(messageOf(error, 'Could not join the room'));
  return data as JoinResult;
}

export async function leaveRoom(groupId: string): Promise<void> {
  const { error } = await sb.rpc('rpc_leave_study_room', { p_group_id: groupId });
  if (error) throw new Error(messageOf(error, 'Could not leave the room'));
}

/** Room admin removes a member (group_members delete policy allows admins). */
export async function kickMember(groupId: string, userId: string): Promise<void> {
  const { error } = await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) throw new Error(messageOf(error, 'Could not remove that member'));
}

/** Link that opens this room's Join flow in the dashboard (password prompt for private rooms). */
export function roomInviteLink(groupId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/home.html?room=${encodeURIComponent(groupId)}`;
}

// Last list seen this page load, so the Home card and the Study Rooms page
// don't flash empty while their own fetch is in flight.
let cachedRooms: RoomRow[] | null = null;

/** The rooms list, refreshed every minute, on tab focus, and after any change made through `refresh`. */
export function useStudyRooms(enabled: boolean) {
  const [rooms, setRooms] = useState<RoomRow[]>(() => cachedRooms ?? []);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(cachedRooms ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRooms();
      cachedRooms = next;
      setRooms(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      console.warn('Study rooms: load failed', e);
      setError(messageOf(e, 'Could not load study rooms'));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error')); // keep showing the last good list
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, refresh]);

  return { rooms, status, error, refresh };
}

// ── inside a room ────────────────────────────────────────────────────────────
export async function fetchMembers(groupId: string): Promise<RoomMember[]> {
  const { data, error } = await sb.rpc('room_members', { p_group_id: groupId });
  if (error) throw new Error(messageOf(error, 'Could not load room members'));
  return (data || []) as RoomMember[];
}

export async function fetchMessages(groupId: string): Promise<RoomMessage[]> {
  const { data, error } = await sb
    .from('group_messages')
    .select('id, sender_id, body, created_at')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(messageOf(error, 'Could not load chat'));
  return ((data || []) as RoomMessage[]).reverse();
}

export async function sendRoomMessage(groupId: string, senderId: string, body: string): Promise<void> {
  const { error } = await sb.from('group_messages').insert({ group_id: groupId, sender_id: senderId, body });
  if (error) throw new Error(messageOf(error, 'Message not sent'));
}

/** Live view of one room: members (with study state) and chat, kept current via realtime + a 30s poll. */
export function useRoomLive(groupId: string | null) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(groupId ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshMembers = useCallback(async () => {
    if (!groupId) return;
    try {
      const next = await fetchMembers(groupId);
      setMembers(next);
      setFetchedAt(Date.now());
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError(messageOf(e, 'Could not load room members'));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [groupId]);

  const soon = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void refreshMembers(), 400);
  }, [refreshMembers]);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setStatus('loading');
    void sb.auth.getSession().then(({ data }) => { if (!cancelled) setMyId(data.session?.user.id ?? null); });
    void refreshMembers();
    fetchMessages(groupId)
      .then((m) => { if (!cancelled) setMessages(m); })
      .catch((e) => console.warn('Room chat: load failed', e));

    const channel = sb
      .channel(`room-${groupId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` }, (p: any) => {
        const m = p.new as RoomMessage & { deleted_at?: string | null };
        if (m.deleted_at) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].slice(-50)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` }, (p: any) => {
        const m = p.new as RoomMessage & { deleted_at?: string | null };
        setMessages((prev) => (m.deleted_at ? prev.filter((x) => x.id !== m.id) : prev.map((x) => (x.id === m.id ? { ...x, body: m.body } : x))));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions', filter: `group_id=eq.${groupId}` }, soon)
      .subscribe((s) => { if (s === 'SUBSCRIBED') soon(); });

    // Members studying from Focus Lock / timer.html have no group_id on their
    // session, so those changes aren't in the realtime filter above: poll too.
    const poll = setInterval(() => void refreshMembers(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (timerRef.current) clearTimeout(timerRef.current);
      void sb.removeChannel(channel);
    };
  }, [groupId, refreshMembers, soon]);

  return { members, messages, fetchedAt, status, error, myId, refreshMembers };
}
