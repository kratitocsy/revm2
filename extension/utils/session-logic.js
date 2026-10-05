// RevM2 - pure session-lifecycle decisions
//
// Every function here is a plain function of its inputs - no chrome.*
// calls, no storage, no network. That's deliberate: background.js is
// where these decisions turn into actual browser actions (DNR rules, tab
// redirects, alarms), but the decisions themselves - "is this session
// currently enforcing?", "should this be treated as unlimited?" - are
// exactly the kind of small, easy-to-get-subtly-wrong logic that caused
// today's bugs (0 treated as null, a pause listener that didn't know
// about pauses). Keeping them here means they can be unit-tested with
// plain `node --test`, no browser or extension shims required, and every
// caller (the enforcement listener, startSession, mirrorSessionState,
// onInstalled/onStartup) goes through the same answer instead of each
// re-deriving its own slightly different version.

/**
 * Whether a session is actively enforcing right now: active, and not
 * inside a temporary pause window (see pauseActiveSession in
 * background.js). A session mid-pause stays `active: true` in storage on
 * purpose, so it can auto-relock later - callers that only checked
 * `session.active` (the tabs.onUpdated redirect listener, onInstalled/
 * onStartup's re-apply-on-restart logic) were exactly what let a paused
 * session keep blocking fresh navigations.
 */
export function isCurrentlyEnforcing(session) {
  if (!session?.active) return false;
  if (session.pausedUntil && Date.now() < session.pausedUntil) return false;
  return true;
}

/**
 * Resolves whether a session should be treated as unlimited.
 * `explicitUnlimited`, when provided, always wins - callers that already
 * know for certain (mirrorSessionState, once it's checked the remote
 * session properly) should pass it rather than let this guess. Otherwise
 * falls back to "was any duration value given at all" - deliberately
 * NOT a falsy check on the number, since 0 minutes remaining is not the
 * same thing as no duration ever being set.
 */
export function resolveUnlimited(durationMinutes, explicitUnlimited) {
  if (typeof explicitUnlimited === "boolean") return explicitUnlimited;
  return durationMinutes === null || durationMinutes === undefined;
}

/**
 * Whether a remote-reported session (from /session-status) should be
 * treated as already finished rather than resumed locally. True only for
 * a non-unlimited session reporting zero or negative minutes left - the
 * exact shape a timed session takes when it ran out while this device
 * was asleep/offline and its own end-of-session call never landed.
 */
export function isRemoteSessionExpired(remoteSession) {
  const unlimited =
    remoteSession?.unlimited === true ||
    remoteSession?.durationMinutes === null ||
    remoteSession?.durationMinutes === undefined;
  if (unlimited) return false;
  return Number(remoteSession?.durationMinutes) <= 0;
}

/**
 * Computes the ISO endsAt timestamp for a session, or null for an
 * unlimited one. `now` is injectable for tests; defaults to the real
 * clock in normal use.
 */
export function computeEndsAt(unlimited, durationMinutes, now = Date.now()) {
  if (unlimited) return null;
  return new Date(now + Math.max(0, Number(durationMinutes) || 0) * 60_000).toISOString();
}

/**
 * Decides what the extension should do about a pause reported by the
 * backend (focus_lock_sessions.paused_until, via /session-status) for a
 * session that's already mirrored locally.
 *
 *   - "pause":  the backend says paused until a future time, and this device
 *               isn't already paused at least that long -> release the block
 *               and re-lock at `until`.
 *   - "resume": THIS device is paused only because of an earlier backend
 *               pause (`local.remotePause`), and the backend has since
 *               cleared it or let it lapse -> re-apply the block now.
 *   - "none":   nothing to do.
 *
 * A pause the person started on this device (the code route in
 * pauseActiveSession) never sets `remotePause`, so a backend that doesn't
 * know about it (or a push without the field at all, like the desktop
 * bridge's) can never lift it early. `pausedUntil` must be *present* on the
 * remote session (even as null) for anything to happen - a source that
 * doesn't report it says nothing about pauses either way.
 */
export function resolveRemotePause(local, remoteSession, now = Date.now()) {
  if (!local?.active || !remoteSession || !("pausedUntil" in remoteSession)) {
    return { action: "none" };
  }

  const parsed = remoteSession.pausedUntil ? Date.parse(remoteSession.pausedUntil) : NaN;
  const remoteUntil = Number.isFinite(parsed) && parsed > now ? parsed : null;
  const localPaused = !!local.pausedUntil && local.pausedUntil > now;

  // The code-unlock route stamps the backend a moment after the local pause
  // starts, so allow a little slack before treating it as a longer pause.
  if (remoteUntil && !(localPaused && local.pausedUntil + 60_000 >= remoteUntil)) {
    return { action: "pause", until: remoteUntil };
  }
  if (!remoteUntil && local.remotePause && localPaused) {
    return { action: "resume" };
  }
  return { action: "none" };
}
