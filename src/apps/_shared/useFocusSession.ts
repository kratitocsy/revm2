import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from './supabaseClient';
import { logStudyTime, STUDY_LOGGED_EVENT } from './studyTimeLog';

/* ============================================================
   Backend wiring for the redesigned Focus Lock page
   (DesktopDashboard.tsx's FocusLockPage), matching timer.html's
   existing contract exactly rather than inventing a new one:

   - rpc_start_study_session / rpc_stop_study_session are the same
     RPCs timer.html's startRemoteSession()/stopRemoteSession() call.
     This is the row RevMGrid/group_live_totals and the leaderboards
     already read - there is only one live `study_sessions` row per
     user (enforced server-side), so starting one here is visible
     everywhere else the person is signed in, same as before.

   - "Pause" has no separate server verb. timer.html's own pause
     button doesn't call a pause RPC either - it just stops the
     remote session (see stopRemoteSession in timer.html) and a
     fresh one starts on Resume. Mirrored here on purpose so this
     page and timer.html can't disagree about what pausing means.

   - Site/app enforcement (focus_lock_sessions, Tauri
     set_session_active, the Android/Capacitor plugin) is
     deliberately NOT started from here. Per product decision, this
     page only reuses whatever block preset is already active
     (started from blocks.html or timer.html) - it never creates one.
     That's why this hook only *polls and relays* enforcement status,
     the same read-only role timer.html's pollBlockStatusForDesktop()
     plays, instead of calling startSelectedBlockPreset().
   ============================================================ */

function isDesktopApp(): boolean {
  return typeof (window as any).__TAURI__ !== 'undefined' && !!(window as any).__TAURI__.core;
}

function isNativeMobile(): boolean {
  const w = window as any;
  return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
}

export interface SubjectTotals {
  [subject: string]: number; // seconds studied today, from study_sessions
}

interface ActiveSession {
  id: string;
  subject: string | null;
  started_at: string;
}

export function useFocusSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [remoteSessionId, setRemoteSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [subjectTotals, setSubjectTotals] = useState<SubjectTotals>({});
  const [enforcementActive, setEnforcementActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulls today's per-subject totals from study_sessions directly,
  // same math schedule-tick / group_live_totals use: total_seconds
  // when the row is closed, or now() - started_at minus paused time
  // while it's still open.
  const refreshSubjectTotals = useCallback(async (uid: string) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from('study_sessions')
      .select('subject, started_at, ended_at, total_seconds, accumulated_paused_seconds')
      .eq('user_id', uid)
      .gte('started_at', startOfDay.toISOString());
    if (error || !data) return;

    const totals: SubjectTotals = {};
    for (const row of data as any[]) {
      const subj = row.subject || 'General';
      const secs =
        row.total_seconds ??
        Math.max(
          0,
          Math.floor(
            (new Date(row.ended_at || Date.now()).getTime() - new Date(row.started_at).getTime()) / 1000
          ) - (row.accumulated_paused_seconds || 0)
        );
      totals[subj] = (totals[subj] || 0) + secs;
    }
    setSubjectTotals(totals);
  }, []);

  // Reconciles with whatever's actually running server-side - if a
  // session was started from timer.html, blocks.html, or another
  // device, this page opens straight into "running" for it instead
  // of showing "Ready to focus" and silently racing a second one.
  // Also exposes startedAt so the page can seed its countdown from
  // real elapsed time on mount (previously this only synced
  // activeSubject - the countdown itself stayed a bare local
  // useState seeded to 25:00, so navigating away and back reset the
  // on-screen timer to 25:00 even though the real session underneath
  // it was untouched and still running).
  const reconcile = useCallback(
    async (uid: string) => {
      const { data } = await sb
        .from('study_sessions')
        .select('id, subject, started_at')
        .eq('user_id', uid)
        .is('ended_at', null)
        .maybeSingle();
      const active = data as ActiveSession | null;
      if (active) {
        setRemoteSessionId(active.id);
        setActiveSubject(active.subject);
        setStartedAt(active.started_at);
        setRunning(true);
      } else {
        setRemoteSessionId(null);
        setStartedAt(null);
        setRunning(false);
      }
    },
    []
  );

  // Read-only poll of block-preset enforcement, same role as
  // timer.html's pollBlockStatusForDesktop() - reuses whatever's
  // active, never starts one. Relays to Tauri when present so
  // desktop app/site blocking stays in sync while this page is open,
  // exactly like the existing pages already do for each other.
  const pollEnforcement = useCallback(async (uid: string) => {
    const { data } = await sb
      .from('focus_lock_sessions')
      .select('id, sites, apps, apps_mode, ends_at, no_early_unlock')
      .eq('user_id', uid)
      .eq('active', true)
      .maybeSingle();

    setEnforcementActive(!!data);

    if (isDesktopApp()) {
      const tauri = (window as any).__TAURI__;
      try {
        await tauri.core.invoke('set_session_active', { active: !!data, endsAt: data?.ends_at || null });
      } catch {
        /* enforcement relay must never break the timer UI */
      }
      try {
        await tauri.core.invoke('set_blocked_apps', {
          apps: data?.apps || [],
          mode: data?.apps_mode === 'whitelist' ? 'whitelist' : 'blacklist',
        });
      } catch {
        /* same */
      }
    }

    if (isNativeMobile()) {
      const plugin = (window as any).Capacitor?.Plugins?.RevM2Locking;
      if (plugin) {
        try {
          if (data) {
            await plugin.setBlockListAndStart({
              sessionId: data.id,
              noEarlyUnlock: !!data.no_early_unlock,
              appsMode: data.apps_mode === 'whitelist' ? 'whitelist' : 'blacklist',
              apps: data.apps || [],
              domains: [], // domain normalization lives in timer.html; this page doesn't start sessions, only relays status
            });
          } else {
            await plugin.endSession({});
          }
        } catch {
          /* same */
        }
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) {
        setLoading(false);
        return;
      }
      const uid = session.user.id;
      setUserId(uid);
      Promise.all([reconcile(uid), refreshSubjectTotals(uid), pollEnforcement(uid)]).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUserId(null);
        return;
      }
      setUserId(session.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [reconcile, refreshSubjectTotals, pollEnforcement]);

  // Same 5s cadence as timer.html's startBlockStatusPoller, so this
  // page and the legacy one settle on enforcement state at the same
  // rate rather than one lagging the other.
  useEffect(() => {
    if (!userId) return;
    pollEnforcement(userId);
    pollRef.current = setInterval(() => pollEnforcement(userId), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [userId, pollEnforcement]);

  const start = useCallback(
    async (subject: string) => {
      if (!userId) return;
      try {
        const { data, error } = await sb.rpc('rpc_start_study_session', {
          p_group_id: null,
          p_subject: subject,
        });
        if (error) throw error;
        setRemoteSessionId(data.id);
        setActiveSubject(data.subject);
        setStartedAt(data.started_at ?? new Date().toISOString());
        setRunning(true);
        // reflects immediately into set_session_active via the existing
        // poller on its next tick - matches timer.html's own latency
      } catch (e: any) {
        // Another tab/device already has this user's one open session:
        // adopt it rather than running a parallel local clock whose time
        // would then be logged a second time on top of that session's.
        if (/already running/i.test(e?.message || '')) {
          await reconcile(userId);
          return;
        }
        // Same fallback as timer.html: the local pomodoro clock keeps
        // running even if the remote sync failed, it just won't show
        // up on RevMGrid/leaderboards for this session.
        console.warn('Focus Lock: remote session sync unavailable, timer still runs locally:', e);
        setRemoteSessionId(null);
        setActiveSubject(subject);
        setStartedAt(new Date().toISOString());
        setRunning(true);
      }
    },
    [userId, reconcile]
  );

  // Closing a study_sessions row here previously left study_log (the
  // {date:{subject:seconds}} column Home's Today's Focus card and
  // tracker.html's streak both read) completely untouched - only
  // timer.html's own logSession() ever wrote it, as a second, separate
  // call alongside its own stopRemoteSession(). This page never had
  // that second call, so Focus Lock time here was invisible on Home
  // and didn't count toward the streak even though the
  // study_sessions row (and RevMGrid/leaderboards, which read that
  // table directly) was perfectly correct the whole time.
  //
  // Mirrors logSession()'s shape exactly: elapsed seconds keyed by
  // today's date and the session's subject, merged into (not
  // replacing) the existing study_log, plus total_study_seconds kept
  // in sync the same way syncTrackerToSupabase does.
  const logToStudyLog = useCallback(async (uid: string, subject: string | null, elapsedSeconds: number) => {
    if (elapsedSeconds < 1) return; // guard a stray 0-length start/stop, same as logSession()
    const sub = subject || 'General';
    const todayKey = new Date().toISOString().split('T')[0];
    try {
      const { data } = await sb.from('user_profiles').select('study_log, total_study_seconds').eq('id', uid).single();
      const slog = (data?.study_log as Record<string, Record<string, number>>) || {};
      const day = { ...(slog[todayKey] || {}) };
      day[sub] = (day[sub] || 0) + elapsedSeconds;
      const nextSlog = { ...slog, [todayKey]: day };
      await sb
        .from('user_profiles')
        .update({
          study_log: nextSlog,
          total_study_seconds: (data?.total_study_seconds || 0) + elapsedSeconds,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', uid);
    } catch (e) {
      // study_log sync must never block ending the session - the
      // study_sessions row (already closed by this point) stays the
      // source of truth for RevMGrid/leaderboards either way.
      console.warn('Focus Lock: study_log sync failed', e);
    }
  }, []);

  const stop = useCallback(async () => {
    if (remoteSessionId) {
      // One server call closes the row and adds its total_seconds to
      // study_log - only if this call is the one that closed it, so two tabs
      // stopping the same session can't count it twice (migration 0067).
      const { error } = await sb.rpc('rpc_stop_study_session_logged', { p_session_id: remoteSessionId });
      if (!error) {
        window.dispatchEvent(new Event(STUDY_LOGGED_EVENT));
      } else if (error.code === 'PGRST202') {
        // Migration 0067 not deployed yet: previous two-step behaviour.
        try {
          await sb.rpc('rpc_stop_study_session', { p_session_id: remoteSessionId });
        } catch (e) {
          console.warn('Focus Lock: stop remote session failed', e);
        }
        if (userId && startedAt) {
          const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
          await logToStudyLog(userId, activeSubject, elapsedSeconds);
        }
      } else {
        console.warn('Focus Lock: stop remote session failed', error);
      }
    } else if (startedAt) {
      // The clock ran local-only (start RPC unreachable): still save the time.
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
      logStudyTime(activeSubject || 'General', elapsedSeconds);
    }
    setRemoteSessionId(null);
    setStartedAt(null);
    setRunning(false);
    if (userId) {
      refreshSubjectTotals(userId);
      pollEnforcement(userId); // re-check real enforcement status, same note as timer.html's stopRemoteSession
    }
  }, [remoteSessionId, userId, startedAt, activeSubject, logToStudyLog, refreshSubjectTotals, pollEnforcement]);

  // Switching subjects mid-session = stop the current row, start a
  // new one under the new subject. study_sessions has no "current
  // subject" mutation RPC, and one-active-per-user is enforced
  // server-side, so this is the only valid way to change subject
  // without violating that constraint.
  const switchSubject = useCallback(
    async (subject: string) => {
      if (running) {
        await stop();
        await start(subject);
      } else {
        setActiveSubject(subject);
      }
    },
    [running, stop, start]
  );

  return {
    loading,
    running,
    activeSubject,
    startedAt,
    subjectTotals,
    enforcementActive,
    start,
    stop,
    switchSubject,
  };
}
