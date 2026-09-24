import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { sb } from '../../_shared/supabaseClient';
import { normalizePreferences } from './settings';
import { STUDY_LOGGED_EVENT } from '../../_shared/studyTimeLog';
import {
  applyAddTopic,
  applyMarkReviewed,
  applyRemoveTopicBySubject,
  rowsToReviewItems,
  buildMultiRecallCurve,
  type TrackerRow,
  type ReviewItem,
  type MultiRecallCurveData,
} from '../../_shared/wynkoTracker';

export type AuthState = 'loading' | 'signed-out' | 'ready';

export interface ProfileInfo {
  displayName: string | null;
  avatarUrl: string | null;
  exam: string | null; // e.g. "JEE 2026" - same cfg.exam value onboarding.html writes
  avatarPreset: number | null; // user_profiles.preferences.avatar_preset - a bundled avatar picked in Settings
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

export interface WeeklyStudyDay {
  label: string; // short weekday, e.g. "Mon"
  minutes: number;
  isToday: boolean;
}

function dateKeyUTC(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Last 7 calendar days (6 days ago .. today), oldest first, each day's
// total minutes summed across subjects — same study_log column/shape
// computeStreak already reads. Used by the Home "Your Study Progress"
// card so its chart and Total/Average stats are real, never hardcoded.
function computeWeeklyStudy(slog: StudyLog, today: Date = new Date()): WeeklyStudyDay[] {
  const days: WeeklyStudyDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKeyUTC(d);
    const totalSecs = Object.values(slog[key] || {}).reduce((a, b) => a + b, 0);
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      minutes: Math.round(totalSecs / 60),
      isToday: i === 0,
    });
  }
  return days;
}

// Same algorithm as tracker.html's renderAnalytics() streak block:
// walk backward from today one day at a time, stop at the first day
// with a zero total. Duplicated here rather than shared because
// tracker.html is a plain script (not a module this can import).
function computeStreak(slog: StudyLog, today: Date = new Date()): number {
  let streak = 0;
  const d = new Date(today);
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

// The one study_sessions row that may still be open (one per user, enforced
// server-side). Its time reaches study_log only when it stops.
interface OpenSession {
  started_at: string;
  paused_at: string | null;
  accumulated_paused_seconds: number | null;
  subject: string | null;
}

// Same elapsed math as rpc_stop_study_session: wall time minus paused time.
function withOpenSession(slog: StudyLog, open: OpenSession | null, nowMs: number): StudyLog {
  if (!open) return slog;
  const endMs = open.paused_at ? new Date(open.paused_at).getTime() : nowMs;
  const secs = Math.floor((endMs - new Date(open.started_at).getTime()) / 1000) - (open.accumulated_paused_seconds || 0);
  if (!(secs > 0)) return slog;
  const key = dateKeyUTC(new Date(nowMs));
  const subject = open.subject || 'General';
  const day = { ...(slog[key] || {}) };
  day[subject] = (day[subject] || 0) + secs;
  return { ...slog, [key]: day };
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
 *  3-item session list, fixed "7-day streak").
 *
 *  Everything stays live: realtime on the user's user_profiles row and
 *  study_sessions, plus the time of a still-open session added on top
 *  of study_log (see withOpenSession). */
export function useHomeData() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [profile, setProfile] = useState<ProfileInfo>({ displayName: null, avatarUrl: null, exam: null, avatarPreset: null });
  const [goalMinutes, setGoalMinutes] = useState(180);
  const [studyLog, setStudyLog] = useState<StudyLog>({});
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `initial` is the first load for a signed-in user: it drives the page's
  // loading/error screens. Every later refresh (realtime event, tab focus,
  // study time saved) swaps the numbers in place without blanking the page.
  const loadForSession = useCallback(async (userId: string, initial = false) => {
    if (initial) { setLoadingRows(true); setError(null); }
    const [profileRes, sessionRes] = await Promise.all([
      sb
        .from('user_profiles')
        .select('tracker_data, study_log, daily_focus_goal_minutes, display_name, full_name, avatar_url, exam, preferences')
        .eq('id', userId)
        .maybeSingle(),
      sb
        .from('study_sessions')
        .select('started_at, paused_at, accumulated_paused_seconds, subject')
        .eq('user_id', userId)
        .is('ended_at', null)
        .maybeSingle(),
    ]);
    if (userIdRef.current !== userId) return; // signed out / switched account meanwhile

    if (profileRes.error) {
      console.warn('Home: could not load profile', profileRes.error);
      if (initial) {
        setError(profileRes.error.message || 'Could not load your dashboard');
        setLoadingRows(false);
      }
      return; // a failed background refresh keeps showing the last good data
    }
    const data = profileRes.data;
    // Local edits still waiting for their debounced save win over the server copy.
    if (!saveTimerRef.current) setRows((data?.tracker_data as TrackerRow[]) || []);
    setProfile({
      displayName: data?.display_name ?? data?.full_name ?? null,
      avatarUrl: data?.avatar_url ?? null,
      exam: data?.exam ?? null,
      avatarPreset: normalizePreferences(data?.preferences).avatar_preset,
    });
    setGoalMinutes(data?.daily_focus_goal_minutes ?? 180);
    setStudyLog((data?.study_log as StudyLog) || {});
    if (!sessionRes.error) setOpenSession((sessionRes.data as OpenSession | null) ?? null);
    setNowMs(Date.now());
    setError(null);
    setLoadingRows(false);
  }, []);

  const scheduleReload = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void loadForSession(uid);
    }, 300);
  }, [loadForSession]);

  // Auth. The client persists the session in localStorage and refreshes the
  // token on its own (see supabaseClient.ts), so a returning user lands here
  // already signed in. Only a change of user reloads the dashboard - hourly
  // TOKEN_REFRESHED events used to re-run the full load behind a loading screen.
  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      if (!uid) {
        userIdRef.current = null;
        setAuthState('signed-out');
        setRows([]);
        setProfile({ displayName: null, avatarUrl: null, exam: null, avatarPreset: null });
        setGoalMinutes(180);
        setStudyLog({});
        setOpenSession(null);
        setError(null);
        setLoadingRows(false);
        return;
      }
      if (uid === userIdRef.current) return;
      userIdRef.current = uid;
      setAuthState('ready');
      void loadForSession(uid, true);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadForSession]);

  // Realtime: this user's profile row (study_log, name, avatar, goal - written
  // by Focus Lock, the Quick Timers, tracker.html, timer.html, Settings, other
  // devices) and their study_sessions (a Focus Lock session starting or
  // stopping anywhere). Both filtered to this user; RLS applies as well.
  useEffect(() => {
    if (authState !== 'ready' || !userIdRef.current) return;
    const uid = userIdRef.current;
    const channel = sb
      .channel(`home-${uid}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${uid}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions', filter: `user_id=eq.${uid}` }, scheduleReload)
      .subscribe((status) => {
        // Catch up on anything missed while the socket was down.
        if (status === 'SUBSCRIBED') scheduleReload();
      });
    return () => { void sb.removeChannel(channel); };
  }, [authState, scheduleReload]);

  // Same-tab saves (Quick Timer, Focus Lock stop) and coming back to the tab
  // refresh straight away instead of waiting on the realtime round trip.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleReload(); };
    window.addEventListener(STUDY_LOGGED_EVENT, scheduleReload);
    window.addEventListener('focus', scheduleReload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(STUDY_LOGGED_EVENT, scheduleReload);
      window.removeEventListener('focus', scheduleReload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scheduleReload]);

  // Clock for the live parts: a session that's still open keeps adding to
  // today's total, and the 7-day window / streak roll over at midnight.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), openSession ? 30_000 : 60_000);
    return () => clearInterval(id);
  }, [openSession]);

  const retry = useCallback(() => {
    if (userIdRef.current) void loadForSession(userIdRef.current, true);
  }, [loadForSession]);

  // Same 1.5s debounce as tracker-sync.js / mobile-home's
  // useWynkoTopics, so the three don't fight over save timing if
  // more than one happens to be open at once.
  const persist = useCallback((nextRows: TrackerRow[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const userId = userIdRef.current;
      if (!userId) { saveTimerRef.current = null; return; }
      try {
        await sb
          .from('user_profiles')
          .update({ tracker_data: nextRows, last_active_at: new Date().toISOString() })
          .eq('id', userId);
      } catch {
        // sync must never break the app — same policy as tracker-sync.js
      }
      saveTimerRef.current = null; // only now may a realtime refresh replace rows again
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

  // Recall curve for the "Memory at Risk" chart now plots every
  // active topic as its own line (most-at-risk first), instead of
  // locking to a single topic — see buildMultiRecallCurve.
  const recallCurves: MultiRecallCurveData | null = buildMultiRecallCurve(rows, reviewItems);

  // study_log only gains a session's time once it stops; until then its
  // elapsed time so far is added on top, so Home is live while you study.
  const liveLog = useMemo(() => withOpenSession(studyLog, openSession, nowMs), [studyLog, openSession, nowMs]);
  const todayFocus: TodayFocus = useMemo(() => {
    const todayEntry = liveLog[dateKeyUTC(new Date(nowMs))] || {};
    const bySubject = Object.entries(todayEntry)
      .map(([subject, secs]) => ({ subject, minutes: Math.round(secs / 60) }))
      .filter((s) => s.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    return {
      goalMinutes,
      doneMinutes: bySubject.reduce((sum, s) => sum + s.minutes, 0),
      bySubject,
      streakDays: computeStreak(liveLog, new Date(nowMs)),
    };
  }, [liveLog, goalMinutes, nowMs]);
  const weeklyStudy = useMemo(() => computeWeeklyStudy(liveLog, new Date(nowMs)), [liveLog, nowMs]);

  const totalWeekMinutes = weeklyStudy.reduce((sum, d) => sum + d.minutes, 0);
  const avgWeekMinutes = totalWeekMinutes / (weeklyStudy.length || 1);

  return {
    authState,
    error,
    retry,
    reviewItems,
    recallCurves,
    profile,
    todayFocus,
    weeklyStudy,
    totalWeekMinutes,
    avgWeekMinutes,
    loading: loadingRows,
    addUnit,
    removeUnitBySubject,
    markAsReviewed,
  };
}
