// RevM2 - tests for utils/session-logic.js
//
// Plain Node, no chrome.* shimming needed - that's the whole point of
// keeping this logic pure (see the comment at the top of session-logic.js).
// Run with: node --test utils/session-logic.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCurrentlyEnforcing,
  resolveUnlimited,
  isRemoteSessionExpired,
  computeEndsAt,
  resolveRemotePause,
  shouldRelock,
} from "./session-logic.js";

test("isCurrentlyEnforcing", async (t) => {
  await t.test("null/inactive session never enforces", () => {
    assert.equal(isCurrentlyEnforcing(null), false);
    assert.equal(isCurrentlyEnforcing({ active: false }), false);
  });

  await t.test("active session with no pause enforces", () => {
    assert.equal(isCurrentlyEnforcing({ active: true }), true);
  });

  await t.test(
    "active session with a pausedUntil in the future does NOT enforce - " +
      "this is the exact bug: a paused session that stayed 'active' in " +
      "storage kept blocking fresh navigations because callers only " +
      "checked session.active",
    () => {
      const session = { active: true, pausedUntil: Date.now() + 5 * 60_000 };
      assert.equal(isCurrentlyEnforcing(session), false);
    }
  );

  await t.test("active session with a pausedUntil already in the past enforces again", () => {
    const session = { active: true, pausedUntil: Date.now() - 1000 };
    assert.equal(isCurrentlyEnforcing(session), true);
  });
});

test("resolveUnlimited", async (t) => {
  await t.test("explicit true/false always wins, regardless of durationMinutes", () => {
    assert.equal(resolveUnlimited(90, true), true);
    assert.equal(resolveUnlimited(null, false), false);
  });

  await t.test("null/undefined duration with no explicit flag means unlimited", () => {
    assert.equal(resolveUnlimited(null, undefined), true);
    assert.equal(resolveUnlimited(undefined, undefined), true);
  });

  await t.test(
    "zero minutes with no explicit flag is NOT unlimited - this is the " +
      "core bug: !0 === true used to make a just-finished timed session " +
      "look identical to one that never had a duration",
    () => {
      assert.equal(resolveUnlimited(0, undefined), false);
    }
  );

  await t.test("a real positive duration is not unlimited", () => {
    assert.equal(resolveUnlimited(90, undefined), false);
  });
});

test("isRemoteSessionExpired", async (t) => {
  await t.test("a genuinely unlimited remote session is never 'expired'", () => {
    assert.equal(isRemoteSessionExpired({ unlimited: true, durationMinutes: 0 }), false);
    assert.equal(isRemoteSessionExpired({ durationMinutes: null }), false);
    assert.equal(isRemoteSessionExpired({ durationMinutes: undefined }), false);
  });

  await t.test(
    "a timed session reporting 0 minutes left IS expired - this is the " +
      "case that used to resurrect a finished 90-minute block as a fresh " +
      "unlimited one",
    () => {
      assert.equal(isRemoteSessionExpired({ unlimited: false, durationMinutes: 0 }), true);
    }
  );

  await t.test("negative minutes (clock skew, late poll) also counts as expired", () => {
    assert.equal(isRemoteSessionExpired({ unlimited: false, durationMinutes: -2 }), true);
  });

  await t.test("a timed session with real time left is not expired", () => {
    assert.equal(isRemoteSessionExpired({ unlimited: false, durationMinutes: 42 }), false);
  });
});

test("computeEndsAt", async (t) => {
  await t.test("unlimited sessions have no endsAt", () => {
    assert.equal(computeEndsAt(true, 90), null);
    assert.equal(computeEndsAt(true, null), null);
  });

  await t.test("a timed session's endsAt is durationMinutes from `now`", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const result = computeEndsAt(false, 90, now);
    assert.equal(result, "2026-01-01T01:30:00.000Z");
  });

  await t.test("a negative/garbage duration never produces an endsAt in the past", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const result = computeEndsAt(false, -10, now);
    assert.equal(result, new Date(now).toISOString());
  });
});

test("resolveRemotePause", async (t) => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const future = new Date(now + 30 * 60_000).toISOString();
  const futureMs = now + 30 * 60_000;
  const past = new Date(now - 60_000).toISOString();

  await t.test("a remote session that doesn't report pausedUntil changes nothing", () => {
    const local = { active: true, pausedUntil: now + 60_000, remotePause: true };
    assert.deepEqual(resolveRemotePause(local, { active: true }, now), { action: "none" });
  });

  await t.test("future remote pause on an enforcing session -> pause until then", () => {
    assert.deepEqual(
      resolveRemotePause({ active: true }, { pausedUntil: future }, now),
      { action: "pause", until: futureMs },
    );
  });

  await t.test("already paused locally at least as long -> nothing to do", () => {
    const local = { active: true, pausedUntil: futureMs, remotePause: true };
    assert.deepEqual(resolveRemotePause(local, { pausedUntil: future }, now), { action: "none" });
  });

  await t.test("the backend echo of a local code-unlock pause (a few seconds later) is not a new pause", () => {
    const local = { active: true, pausedUntil: futureMs };
    const echo = new Date(futureMs + 3_000).toISOString();
    assert.deepEqual(resolveRemotePause(local, { pausedUntil: echo }, now), { action: "none" });
  });

  await t.test("remote pause longer than a local one extends it", () => {
    const local = { active: true, pausedUntil: now + 60_000 };
    assert.deepEqual(
      resolveRemotePause(local, { pausedUntil: future }, now),
      { action: "pause", until: futureMs },
    );
  });

  await t.test("backend cleared a pause it set -> resume", () => {
    const local = { active: true, pausedUntil: futureMs, remotePause: true };
    assert.deepEqual(resolveRemotePause(local, { pausedUntil: null }, now), { action: "resume" });
  });

  await t.test("a pause started on this device is never lifted by the backend", () => {
    const local = { active: true, pausedUntil: futureMs };
    assert.deepEqual(resolveRemotePause(local, { pausedUntil: null }, now), { action: "none" });
  });

  await t.test("a lapsed remote pause is ignored", () => {
    assert.deepEqual(resolveRemotePause({ active: true }, { pausedUntil: past }, now), { action: "none" });
  });

  await t.test("no local active session -> nothing to do", () => {
    assert.deepEqual(resolveRemotePause(null, { pausedUntil: future }, now), { action: "none" });
  });
});

test("shouldRelock", async (t) => {
  const now = Date.parse("2026-01-01T01:00:00.000Z");
  await t.test("no session or inactive -> never re-locks", () => {
    assert.equal(shouldRelock(null, now), false);
    assert.equal(shouldRelock({ active: false }, now), false);
  });
  await t.test("timed session past its endsAt -> does not re-lock (the end-alarm race)", () => {
    assert.equal(shouldRelock({ active: true, endsAt: "2026-01-01T01:00:00.000Z" }, now), false);
    assert.equal(shouldRelock({ active: true, endsAt: "2026-01-01T00:59:00.000Z" }, now), false);
  });
  await t.test("timed session with time left -> re-locks", () => {
    assert.equal(shouldRelock({ active: true, endsAt: "2026-01-01T01:30:00.000Z" }, now), true);
  });
  await t.test("unlimited session -> re-locks", () => {
    assert.equal(shouldRelock({ active: true, unlimited: true, endsAt: null }, now), true);
  });
});
