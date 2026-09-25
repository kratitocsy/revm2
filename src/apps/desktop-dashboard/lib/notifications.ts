/* Notification bell data (header on every dashboard page).
   Rows come from public.notifications: owner announcements (Owner Control ->
   Send notification) plus the invites other features already write there.
   RLS limits a user to their own rows; they can only mark them read
   (migration 0089). New rows arrive over Realtime. */
import { useEffect, useState } from 'react';
import { sb } from '../../_shared/supabaseClient';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ref_id: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const COLUMNS = 'id, type, title, body, ref_id, link, read, created_at';

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await sb
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

/** Marks the given notifications (or all of them) read; returns how many changed. */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await sb.rpc('mark_my_notifications_read', { p_ids: ids && ids.length ? ids : null });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/**
 * Live updates for this user's bell: onInsert gets each new notification;
 * onRemoved fires when notifications are deleted (e.g. an owner retracts an
 * announcement) so the caller can re-fetch. Returns an unsubscribe.
 */
export function subscribeNotifications(
  userId: string,
  handlers: { onInsert: (n: AppNotification) => void; onRemoved: () => void },
): () => void {
  const channel = sb
    .channel(`notifications-${userId}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => handlers.onInsert(payload.new as AppNotification))
    // Realtime can't filter deletes by column, so any delete just triggers a re-fetch.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, () => handlers.onRemoved())
    .subscribe();
  return () => { void sb.removeChannel(channel); };
}

/** Where tapping a notification goes: its own link, or one derived from its type. */
export function notificationHref(n: AppNotification): string | null {
  if (n.link) return n.link;
  if (n.type === 'grid_session_invite' && n.ref_id) return `/home.html?room=${encodeURIComponent(n.ref_id)}`;
  if (n.type === 'challenge_invite' || n.type === 'gvg_invite') return '/groups.html';
  return null;
}

export function notificationIcon(type: string): string {
  switch (type) {
    case 'announcement': return '📣';
    case 'grid_session_invite': return '🎥';
    case 'challenge_invite': return '⚔️';
    case 'gvg_invite': return '🏆';
    default: return '🔔';
  }
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** The signed-in user's notifications, kept live, with read actions. */
export function useNotifications(limit = 30) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let unsubscribe = () => {};
    const load = async () => {
      try {
        const rows = await fetchNotifications(limit);
        if (live) { setItems(rows); setError(null); }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load notifications');
      } finally {
        if (live) setLoading(false);
      }
    };
    void sb.auth.getSession().then(({ data: { session } }) => {
      if (!live) return;
      if (!session) { setLoading(false); return; }
      void load();
      unsubscribe = subscribeNotifications(session.user.id, {
        onInsert: (n) => setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, limit))),
        onRemoved: () => void load(),
      });
    });
    return () => { live = false; unsubscribe(); };
  }, [limit]);

  const markRead = async (ids?: string[]) => {
    const target = ids ?? items.filter((n) => !n.read).map((n) => n.id);
    if (!target.length) return;
    setItems((prev) => prev.map((n) => (target.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await markNotificationsRead(ids);
    } catch {
      // The next load shows the real state; nothing else to undo here.
    }
  };

  return { items, unread: items.filter((n) => !n.read).length, loading, error, markRead };
}
