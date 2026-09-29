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
