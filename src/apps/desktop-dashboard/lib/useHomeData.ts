import { useEffect, useRef, useState, useCallback } from 'react';
import { sb } from '../../_shared/supabaseClient';
import {
  applyAddTopic,
  applyMarkReviewed,
  applyRemoveTopicBySubject,
  rowsToReviewItems,
  type TrackerRow,
  type ReviewItem,
} from '../../_shared/wynkoTracker';

export type AuthState = 'loading' | 'signed-out' | 'ready';

const SAVE_DEBOUNCE_MS = 1500; // matches src/features/tracker/tracker-sync.js

/** Home page data: the review queue (real retention/urgency, same
 *  math as tracker.html and mobile-home) plus add/remove/mark-reviewed
 *  actions that write back to the same user_profiles.tracker_data
 *  column every other page already reads and writes. */
export function useHomeData() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadForSession = useCallback(async (userId: string) => {
    setLoadingRows(true);
    const { data, error } = await sb
      .from('user_profiles')
      .select('tracker_data')
      .eq('id', userId)
      .single();
    if (!error && data?.tracker_data) {
      setRows(data.tracker_data as TrackerRow[]);
    } else {
      setRows([]);
    }
    setLoadingRows(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        setAuthState('signed-out');
        setLoadingRows(false);
        return;
      }
      userIdRef.current = session.user.id;
      setAuthState('ready');
      loadForSession(session.user.id);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        userIdRef.current = null;
        setAuthState('signed-out');
        setRows([]);
        return;
      }
      userIdRef.current = session.user.id;
      setAuthState('ready');
      loadForSession(session.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadForSession]);

  // Same 1.5s debounce as tracker-sync.js / mobile-home's
  // useWynkoTopics, so the three don't fight over save timing if
  // more than one happens to be open at once.
  const persist = useCallback((nextRows: TrackerRow[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const userId = userIdRef.current;
      if (!userId) return;
      try {
        await sb
          .from('user_profiles')
          .update({ tracker_data: nextRows, last_active_at: new Date().toISOString() })
          .eq('id', userId);
      } catch {
        // sync must never break the app — same policy as tracker-sync.js
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const mutate = useCallback(
    (updater: (prev: TrackerRow[]) => TrackerRow[]) => {
      setRows((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // subject + one-or-more topics (QuickAddUnit collects several at
  // once) — joined into today's single tracker_data row. See the
  // one-row-per-day note in _shared/wynkoTracker.ts.
  const addUnit = useCallback(
    (subject: string, topics: string[]) => mutate((prev) => applyAddTopic(prev, subject, topics)),
    [mutate]
  );
  const removeUnitBySubject = useCallback(
    (subject: string) => mutate((prev) => applyRemoveTopicBySubject(prev, subject)),
    [mutate]
  );
  const markAsReviewed = useCallback(
    (key: string) => mutate((prev) => applyMarkReviewed(prev, Number(key))),
    [mutate]
  );

  const reviewItems: ReviewItem[] = rowsToReviewItems(rows);

  return { authState, reviewItems, loading: loadingRows, addUnit, removeUnitBySubject, markAsReviewed };
}
