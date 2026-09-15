import { useEffect, useRef, useState, useCallback } from 'react';
import { sb } from '../../_shared/supabaseClient';
import {
  applyAddTopic,
  applyMarkReviewed,
  applyRemoveTopicBySubject,
  rowsToReviewItems,
  buildRecallCurve,
  type TrackerRow,
  type ReviewItem,
  type RecallCurveData,
} from '../../_shared/wynkoTracker';

export type AuthState = 'loading' | 'signed-out' | 'ready';

export interface ProfileInfo {
  displayName: string | null;
  avatarUrl: string | null;
  exam: string | null; // e.g. "JEE 2026" - same cfg.exam value onboarding.html writes
}

// {date: {subject: seconds}} - same shape/column tracker.html and
// timer.html already read as `slog` via shared.js's
// pullTrackerFromSupabase(). Keeping the same shape here (rather
// than inventing a new one) means Home's streak/today-total agree
// with what tracker.html shows for the same account.
export type StudyLog = Record<string, Record<string, number>>;

export interface TodayFocus {
  goalMinutes: number; // user_profiles.daily_focus_goal_minutes
  doneMinutes: number; // sum of today's study_log entry, in minutes
  bySubject: { subject: string; minutes: number }[]; // today's entry, one row per subject actually logged
  streakDays: number; // consecutive days (today backward) with any study_log total > 0
}

function dateKeyUTC(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Same algorithm as tracker.html's renderAnalytics() streak block:
// walk backward from today one day at a time, stop at the first day
// with a zero total. Duplicated here rather than shared because
// tracker.html is a plain script (not a module this can import).
function computeStreak(slog: StudyLog): number {
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = dateKeyUTC(d);
    const total = Object.values(slog[key] || {}).reduce((a, b) => a + b, 0);
    if (total > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

const SAVE_DEBOUNCE_MS = 1500; // matches src/features/tracker/tracker-sync.js

/** Home page data: the review queue (real retention/urgency, same
 *  math as tracker.html and mobile-home) plus add/remove/mark-reviewed
 *  actions that write back to the same user_profiles.tracker_data
 *  column every other page already reads and writes. Also carries
 *  display_name/avatar_url/exam so Sidebar/Header can show the real
 *  signed-in person instead of the design's placeholder "Jatin
 *  Sinsinwar / JEE 2026". onboarding.html's finish() only ever writes
 *  display_name, but full_name is a separate, older column that's
 *  actually populated on MORE rows in production (23/36 vs 19/36 as
 *  of this pass) - some earlier flow or manual entry set it and
 *  nothing here should assume it's unused. So: prefer display_name
 *  (what new signups get), fall back to full_name so existing users
 *  with only the old column set still see their real name instead of
 *  the placeholder.
 *
 *  Also carries todayFocus (goal/done minutes, per-subject today
 *  breakdown, streak) for the "Today's Focus" gauge card - all
 *  derived from study_log + daily_focus_goal_minutes, the same two
 *  columns tracker.html's streak math and migration 0061's own
 *  comment ("shown as a progress bar on the Home page Today's Focus
 *  card") already point at. Nothing wrote this card's data before
 *  this pass - it was fully hardcoded (fixed 1h15m/2h30m, a fixed
 *  3-item session list, fixed "7-day streak"). */
export function useHomeData() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [profile, setProfile] = useState<ProfileInfo>({ displayName: null, avatarUrl: null, exam: null });
  const [todayFocus, setTodayFocus] = useState<TodayFocus>({ goalMinutes: 180, doneMinutes: 0, bySubject: [], streakDays: 0 });
  const [loadingRows, setLoadingRows] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadForSession = useCallback(async (userId: string) => {
    setLoadingRows(true);
    const { data, error } = await sb
      .from('user_profiles')
      .select('tracker_data, study_log, daily_focus_goal_minutes, display_name, full_name, avatar_url, exam')
      .eq('id', userId)
      .single();
    if (!error && data?.tracker_data) {
      setRows(data.tracker_data as TrackerRow[]);
    } else {
      setRows([]);
    }
    setProfile({
      displayName: data?.display_name ?? data?.full_name ?? null,
      avatarUrl: data?.avatar_url ?? null,
      exam: data?.exam ?? null,
    });

    const slog: StudyLog = (data?.study_log as StudyLog) || {};
    const todayKey = dateKeyUTC(new Date());
    const todayEntry = slog[todayKey] || {};
    const bySubject = Object.entries(todayEntry)
      .map(([subject, secs]) => ({ subject, minutes: Math.round(secs / 60) }))
      .filter((s) => s.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    const doneMinutes = bySubject.reduce((sum, s) => sum + s.minutes, 0);
    setTodayFocus({
      goalMinutes: data?.daily_focus_goal_minutes ?? 180,
      doneMinutes,
      bySubject,
      streakDays: computeStreak(slog),
    });

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
        setProfile({ displayName: null, avatarUrl: null, exam: null });
        setTodayFocus({ goalMinutes: 180, doneMinutes: 0, bySubject: [], streakDays: 0 });
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

  // Recall curve for the "Memory at Risk" chart tracks whichever
  // topic is currently driving TodayHero's headline (reviewItems[0]
  // — lowest retention, same row `topSubject` text already names).
  const topItem = reviewItems[0];
  const topRow = topItem ? rows.find((r) => `${r.no}` === topItem.key) : undefined;
  const recallCurve: RecallCurveData | null = topRow && topItem ? buildRecallCurve(topRow, topItem) : null;

  return { authState, reviewItems, recallCurve, profile, todayFocus, loading: loadingRows, addUnit, removeUnitBySubject, markAsReviewed };
}
