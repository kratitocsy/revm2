/* The site/app block that's currently on (focus_lock_sessions, active = true),
   shown as a pill on every dashboard page so a block is never running
   without the student being able to see it and end it. Blocks are started
   by schedules or the older Blocks/Timer pages; the server ends expired
   and abandoned ones every minute (migration 0091, end_stale_focus_blocks). */
import { useCallback, useEffect, useState } from 'react';
import { sb } from '../../_shared/supabaseClient';

export interface ActiveBlock {
  id: string;
  block_name: string | null;
  ends_at: string | null;
  unlimited: boolean | null;
  no_early_unlock: boolean | null;
  paused_until: string | null;
}

export async function fetchActiveBlock(): Promise<ActiveBlock | null> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('focus_lock_sessions')
    .select('id, block_name, ends_at, unlimited, no_early_unlock, paused_until')
    .eq('user_id', session.user.id).eq('active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const b = data as ActiveBlock | null;
  // Past its end time: the server closes it within a minute; don't show it.
  if (b && !b.unlimited && b.ends_at && new Date(b.ends_at).getTime() <= Date.now()) return null;
  return b;
}

/** Ends the active block (refused server-side while a no-early-unlock block has time left). */
export async function endMyFocusBlock(): Promise<void> {
  const { error } = await sb.rpc('rpc_end_my_focus_block');
  if (error) throw new Error(error.message);
}

export function canEndEarly(b: ActiveBlock): boolean {
  return !(b.no_early_unlock && b.ends_at && new Date(b.ends_at).getTime() > Date.now());
}

export function blockUntilLabel(b: ActiveBlock): string {
  if (b.unlimited || !b.ends_at) return 'no time limit';
  return 'until ' + new Date(b.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The signed-in user's active block, re-checked every 30s and when the tab regains focus. */
export function useActiveBlock(enabled: boolean) {
  const [block, setBlock] = useState<ActiveBlock | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBlock(await fetchActiveBlock());
    } catch {
      // Keep whatever we last knew; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setBlock(null); return; }
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [enabled, refresh]);

  return { block, refresh };
}
