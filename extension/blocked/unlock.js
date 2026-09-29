// RevM2 - Unlock screen logic
// Runs inside blocked/blocked.html during an active focus session.
// Both paths sit behind a "Pause for a Cause" gate button - neither the
// code nor the payment option is shown until that's clicked. They are NOT
// equivalent once chosen:
//   (1) type the 150-char code - free, but only a temporary PAUSE_MINUTES
//       breather; the block re-applies itself automatically after that.
//   (2) pay Rs.90 via the website backend - ends the session for good.

import { apiRequest } from "../utils/storage.js";

const CODE_LENGTH = 150;
const PAUSE_MINUTES = 20;
const CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
// How many characters are visible in the scroll window at once. The person
// can drag the slider to look at any part of the 150-char code instead of
// it all being crammed into a wrapped, hard-to-read block.
const VISIBLE_CHARS = 32;

let currentCode = "";
let regenCount = 0;
let followTyping = true;
let resumeFollowTimer = null;
let mismatchTimeout = null;
let mismatchInterval = null;
let mismatchDeadline = null;
// Set from storage in populateContext once the session is known - true if
// the free code route has already been used this session (capped at once,
// see background.js's CODE_UNLOCK_CONFIRMED handler, which is the real
// enforcement point; this just avoids generating/showing a code the
// background script would reject anyway).
let codeUnlockUsed = false;
// Whether the person has clicked past the "Pause for a Cause" gate yet -
// the anti-cheat listeners below (tab-switch, copy, screenshot-key) are
// meaningless noise before that, since there's no code on screen yet.
let gateOpened = false;

// ---------- Desktop-app OS-level gate protection ----------
// Best-effort: if the desktop app (revm2-desktop.exe) isn't running, every
// call here just fails fast on a refused connection and is swallowed -
// the JS-only anti-cheat above (visibilitychange/copy/keydown) is all
// there is in that case, same as it always was. See gate_guard.rs's
// module doc for what arm_browser/disarm_browser actually do natively
// (capture-prevention + true OS-level foreground-window watching).
//
// This runs directly in this tab rather than through the offscreen-
// document/background.js relay used for session sync - that relay exists
// only to work around the background service worker's ~30s suspension,
// which doesn't apply here: this is a real, open tab for as long as the
// gate is on screen.
const GATE_BRIDGE_BASE = "http://127.0.0.1:47552";
const GATE_POLL_SAFETY_TIMEOUT_MS = 30000; // a little over the server's own ~25s long-poll timeout - an abort safety net, not the normal way this resolves
const GATE_RETRY_DELAY_MS = 4000; // desktop app not running (or briefly restarting) - don't hammer a refused connection

let gateBridgeSince = 0;
let gateBridgePolling = false;
let gateBridgeAbort = null;

function gateProtectionStart() {
  fetch(`${GATE_BRIDGE_BASE}/gate/start`, { method: "POST" }).catch(() => {});
  gateBridgeSince = 0;
  if (!gateBridgePolling) {
    gateBridgePolling = true;
    gateBridgePollLoop();
  }
}

function gateProtectionStop() {
  gateBridgePolling = false;
  if (gateBridgeAbort) gateBridgeAbort.abort();
  fetch(`${GATE_BRIDGE_BASE}/gate/stop`, { method: "POST" }).catch(() => {});
}

async function gateBridgePollLoop() {
  while (gateBridgePolling) {
    gateBridgeAbort = new AbortController();
    const timer = setTimeout(() => gateBridgeAbort.abort(), GATE_POLL_SAFETY_TIMEOUT_MS);
    try {
      const res = await fetch(`${GATE_BRIDGE_BASE}/gate/status?since=${gateBridgeSince}`, {
        signal: gateBridgeAbort.signal,
      });
      clearTimeout(timer);

      if (res.status === 204) continue; // server-side long-poll timed out with nothing new - reconnect immediately
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, GATE_RETRY_DELAY_MS));
        continue;
      }

      const data = await res.json();
      if (typeof data.seq === "number") gateBridgeSince = data.seq;
      // gateOpened guard: a stray event from a previous arm/disarm cycle
      // landing after this tab's gate already closed shouldn't regenerate
      // a code that isn't showing anymore.
      if (gateOpened) regenerate(`desktop app: ${data.reason || "focus lost"}`);
    } catch {
      clearTimeout(timer);
      // Desktop app not running (connection refused) or a genuine network
      // hiccup - back off instead of spinning in a tight loop.
      await new Promise((r) => setTimeout(r, GATE_RETRY_DELAY_MS));
    }
  }
}

function generateCode(length = CODE_LENGTH) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

function renderCode() {
  clearMismatchCountdown();
  currentCode = generateCode();
  const codeEl = document.getElementById("unlock-code");
  const sliderEl = document.getElementById("code-slider");
  const inputEl = document.getElementById("unlock-input");

  if (codeEl) {
    codeEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < currentCode.length; i++) {
      const span = document.createElement("span");
      span.textContent = currentCode[i];
      span.className = "code-char";
      frag.appendChild(span);
    }
    codeEl.appendChild(frag);
  }
  if (sliderEl) {
    sliderEl.max = String(Math.max(0, CODE_LENGTH - VISIBLE_CHARS));
    sliderEl.value = "0";
  }
  followTyping = true;
  scrollCodeWindow(0);

  if (inputEl) {
    inputEl.value = "";
    inputEl.focus();
  }
  const unlockBtn = document.getElementById("unlock-btn");
  if (unlockBtn) unlockBtn.disabled = true;
  updateProgress(0);
}

function scrollCodeWindow(startIndex) {
  const codeEl = document.getElementById("unlock-code");
  if (codeEl) codeEl.style.transform = `translateX(-${startIndex}ch)`;
}

function updateProgress(typedLength) {
  const bar = document.getElementById("unlock-progress");
  if (bar) bar.style.width = `${(typedLength / CODE_LENGTH) * 100}%`;
}

function clearHighlight() {
  const codeEl = document.getElementById("unlock-code");
  if (!codeEl) return;
  const chars = codeEl.children;
  for (let i = 0; i < chars.length; i++) {
    chars[i].classList.remove("ok", "bad", "current");
  }
}

// Colors each character span green/red against what's been typed so far,
// and underlines the next character expected. Called live on every
// keystroke, plus again from attemptUnlock() when Unlock is clicked.
function highlightAgainst(typed) {
  const codeEl = document.getElementById("unlock-code");
  if (!codeEl) return;
  const chars = codeEl.children;
  for (let i = 0; i < chars.length; i++) {
    const span = chars[i];
    span.classList.remove("ok", "bad", "current");
    if (i < typed.length) {
      span.classList.add(typed[i] === currentCode[i] ? "ok" : "bad");
    } else if (i === typed.length) {
      span.classList.add("current");
    }
  }
}

function clearMismatchCountdown() {
  if (mismatchTimeout) clearTimeout(mismatchTimeout);
  if (mismatchInterval) clearInterval(mismatchInterval);
  mismatchTimeout = null;
  mismatchInterval = null;
  mismatchDeadline = null;
}

// After a failed attempt, give a full minute to fix it and retry with the
// SAME code before it gets regenerated - rather than yanking the code away
// almost immediately. The status line counts down live so it's clear how
// much time is left.
function startMismatchCountdown(firstBad) {
  clearMismatchCountdown();
  const statusEl = document.getElementById("unlock-status");
  const WINDOW_MS = 60000;
  mismatchDeadline = Date.now() + WINDOW_MS;

  const tick = () => {
    const remaining = Math.max(0, mismatchDeadline - Date.now());
    const secs = Math.ceil(remaining / 1000);
    if (statusEl) {
      statusEl.textContent = `Character ${firstBad + 1} didn't match. Fix it and hit Unlock again — ${secs}s left before the code resets.`;
    }
    if (remaining <= 0) {
      clearMismatchCountdown();
    }
  };
  tick();
  mismatchInterval = setInterval(tick, 250);
  mismatchTimeout = setTimeout(() => {
    clearMismatchCountdown();
    regenerate(`mismatch at character ${firstBad + 1}, timed out`);
  }, WINDOW_MS);
}

function regenerate(reason) {
  regenCount += 1;
  const statusEl = document.getElementById("unlock-status");
  if (statusEl) {
    statusEl.textContent = `Code reset (${reason}). Try again — attempt #${regenCount + 1}.`;
  }
  renderCode();
}

function openUnlockChoices() {
  if (gateOpened) return;
  gateOpened = true;
  gateProtectionStart();
  document.getElementById("gate-box")?.classList.add("hidden");
  document.getElementById("unlock-choices")?.classList.remove("hidden");
  if (codeUnlockUsed) {
    // Already spent this session's one free pause - swap the code panel
    // for a short note instead of generating a code the background
    // script would reject anyway. The paid option stays available.
    const unlockBox = document.querySelector(".unlock-box");
    if (unlockBox) {
      unlockBox.innerHTML = `
        <p class="unlock-label">Free pause already used</p>
        <p style="font-size:12px;color:var(--muted);line-height:1.6;">
          You've already used this session's one free 20-minute pause. Only the paid option below can end it now.
        </p>
      `;
    }
    return;
  }
  // Only generate/show the actual code once the person has chosen to see
  // it - no point burning a code (or giving something to screenshot)
  // before they've even clicked past the gate.
  renderCode();
}

function initUnlockScreen() {
  document.getElementById("pause-cause-btn")?.addEventListener("click", openUnlockChoices);

  const inputEl = document.getElementById("unlock-input");
  if (!inputEl) return;

  // Block paste, drag-drop, and context-menu paste entirely.
  ["paste", "drop", "contextmenu"].forEach((evt) => {
    inputEl.addEventListener(evt, (e) => e.preventDefault());
  });

  // Any copy/cut attempt on the page (e.g. selecting the displayed code)
  // invalidates the current code immediately. Guarded on gateOpened -
  // before the gate is clicked there's no code showing yet, so a stray
  // copy/cut elsewhere on the page shouldn't do anything.
  ["copy", "cut"].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      if (!gateOpened) return;
      e.preventDefault();
      regenerate("copy attempt detected");
    });
  });

  // Losing focus on the tab/window (switching tabs, minimizing, alt-tabbing
  // to another app) resets progress. This also catches most OS-level
  // screenshot shortcuts (Win+Shift+S, Cmd+Shift+4) because they open a
  // full-screen overlay that pulls focus away from the browser first.
  // Note: this only sees browser-level focus changes. True cross-application
  // detection requires the desktop companion app (OS-level foreground
  // window hook) - not possible from a browser extension alone.
  document.addEventListener("visibilitychange", () => {
    if (!gateOpened) return;
    if (document.hidden) {
      regenerate("left the tab");
    }
  });
  // NOTE: a window "blur" listener used to live here too, resetting the code
  // on ANY loss of window focus. That's far more trigger-happy than
  // visibilitychange - it also fires for in-page focus shifts that have
  // nothing to do with switching apps or tabs (browser spellcheck/autofill
  // popups, extension-injected UI stealing focus from the input, IME
  // candidate windows while typing special characters, etc). Removed it;
  // visibilitychange alone reliably catches real tab-switches, minimizing,
  // and most screenshot tools without the false positives.

  // Direct key capture for screenshot shortcuts that DON'T shift focus
  // (e.g. plain PrintScreen on Windows just copies to clipboard silently).
  // The browser still sees the keydown while it has focus, so we catch it
  // before the OS acts on it. Covers PrintScreen and the Mac region-capture
  // combos; doesn't cover third-party grab tools or an external camera -
  // no web API can see those, so this is a partial layer, not a guarantee.
  window.addEventListener("keydown", (e) => {
    if (!gateOpened) return;
    const isPrintScreen = e.key === "PrintScreen";
    const isMacCapture =
      e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key);
    if (isPrintScreen || isMacCapture) {
      regenerate("screenshot shortcut detected");
    }
  });

  // Live per-character feedback as they type, plus an Unlock button that
  // only checks/submits once the full code length is reached.
  const sliderEl = document.getElementById("code-slider");
  const unlockBtn = document.getElementById("unlock-btn");

  inputEl.addEventListener("input", () => {
    const typed = inputEl.value;

    // Live highlighting - colors update on every keystroke.
    highlightAgainst(typed);
    updateProgress(typed.length);

    if (unlockBtn) unlockBtn.disabled = typed.length !== CODE_LENGTH;

    // Keep the caret roughly centered in the visible window as they type,
    // so they don't have to manually scroll just to see what they're
    // typing against. Dragging the slider by hand (below) temporarily
    // pauses this so they can look ahead without it snapping back mid-drag.
    if (followTyping && sliderEl) {
      const maxStart = Number(sliderEl.max || 0);
      const start = Math.min(
        Math.max(0, typed.length - Math.floor(VISIBLE_CHARS / 2)),
        maxStart
      );
      sliderEl.value = String(start);
      scrollCodeWindow(start);
    }
  });

  if (unlockBtn) {
    unlockBtn.addEventListener("click", attemptUnlock);
  }

  if (sliderEl) {
    sliderEl.addEventListener("input", () => {
      followTyping = false;
      scrollCodeWindow(Number(sliderEl.value));
      // Resume auto-following the caret a couple seconds after the person
      // stops dragging, rather than forcing them to manually scroll back.
      clearTimeout(resumeFollowTimer);
      resumeFollowTimer = setTimeout(() => {
        followTyping = true;
      }, 2500);
    });
  }
}

// Only called once the person clicks Unlock - not on every keystroke - so
// correctness is never revealed mid-typing.
function attemptUnlock() {
  const inputEl = document.getElementById("unlock-input");
  const unlockBtn = document.getElementById("unlock-btn");
  if (!inputEl) return;

  const typed = inputEl.value;
  if (typed.length !== CODE_LENGTH) return;

  highlightAgainst(typed);
  if (unlockBtn) unlockBtn.disabled = true;

  if (typed === currentCode) {
    clearMismatchCountdown();
    confirmUnlock();
    return;
  }

  let firstBad = 0;
  while (firstBad < CODE_LENGTH && typed[firstBad] === currentCode[firstBad]) {
    firstBad++;
  }
  startMismatchCountdown(firstBad);
}

async function confirmUnlock() {
  const statusEl = document.getElementById("unlock-status");
  if (statusEl) statusEl.textContent = "Verifying...";

  // background.js is the real gate (session storage, not this page, is
  // the source of truth) - it'll reject this if the free pause was
  // already used once this session, even if this page's own check above
  // somehow got bypassed.
  const result = await chrome.runtime.sendMessage({ type: "CODE_UNLOCK_CONFIRMED" });
  if (!result?.ok) {
    if (statusEl) {
      statusEl.textContent =
        "You've already used this session's one free pause — only the paid option can end it now.";
    }
    const unlockBtn = document.getElementById("unlock-btn");
    if (unlockBtn) unlockBtn.disabled = true;
    return;
  }

  // Best-effort note to the backend so blocks.html can show "Paused -
  // resumes at X" instead of a normal running timer. Doesn't block on
  // this - if it fails (offline, cold start) the pause still happened
  // locally above, the website just won't reflect it until the next poll.
  apiRequest("/api/extension/session/pause", {
    method: "POST",
    body: JSON.stringify({ minutes: PAUSE_MINUTES }),
  });

  if (statusEl) {
    statusEl.textContent = `Unlocked for ${PAUSE_MINUTES} minutes — the block resumes automatically after that.`;
  }
  gateProtectionStop();
  setTimeout(() => window.close(), 1600);
}

async function startEmergencyUnlock() {
  const { revm2Settings } = await chrome.storage.local.get("revm2Settings");
  const webBase = revm2Settings?.webBase ?? "";
  const token = revm2Settings?.token ?? "";

  // Payment happens on the website (Razorpay checkout), not in the
  // extension - opens a new tab, backend confirms via webhook and
  // issues a short-lived unlock token the extension redeems below.
  chrome.tabs.create({
    url: `${webBase}/emergency-unlock?token=${encodeURIComponent(token)}`,
  });
}

// Reasons set by the various adult-content layers (rules/adult-blocklist.json,
// rules/adult-keyword-domains.json, content/rta-check.js, content/adult-
// heuristic.js) - each maps to a short, honest explanation of which layer
// caught the site.
const ADULT_REASON_COPY = {
  tld: "its domain ends in an adult-only TLD (.xxx / .porn / .adult / .sex).",
  keyword: "its domain matches a common adult-site naming pattern.",
  rta: 'it self-labels as "Restricted To Adults" (RTA).',
  content: "its page content matched several adult-content signals.",
};

function populateAdultContext(params, site, titleEl, subEl) {
  const reason = params.get("reason");
  if (titleEl) titleEl.textContent = "Adult content is blocked";
  if (subEl) {
    const reasonText = ADULT_REASON_COPY[reason] || "it matched your content filter.";
    subEl.textContent = site
      ? `${site} was blocked because ${reasonText}`
      : `This page was blocked because ${reasonText}`;
  }

  // This is a standing filter (Options -> Content filtering), not a focus
  // session - there's nothing here to "unlock early" with the 150-char
  // code, and it shouldn't be as easy to bypass as ending a focus block on
  // purpose. Replace the gate with a short explanation and drop the
  // (hidden, unreachable) choices panel entirely instead of leaving a
  // "Pause for a Cause" button that doesn't actually do anything useful here.
  const gateBox = document.querySelector(".gate-box");
  const choices = document.getElementById("unlock-choices");
  if (gateBox) {
    gateBox.innerHTML = `
      <p class="unlock-label">This isn't a timed focus session</p>
      <p style="font-size:12px;color:var(--muted);line-height:1.6;">
        Adult content filtering applies all the time, not just during a block.
        To turn it off, open the extension's Options page and switch off
        "Block adult content" - worth pausing on whether you actually want to.
      </p>
    `;
  }
  if (choices) choices.remove();
}

function populateWhitelistContext(params, site, titleEl, subEl, session) {
  if (titleEl) {
    titleEl.textContent = session?.blockName
      ? `"${session.blockName}" only allows chosen sites`
      : "Only your allowed sites are reachable";
  }
  if (subEl) {
    subEl.textContent = site
      ? `${site} isn't on your allow list for this session, so it's blocked until the session ends.`
      : "This site isn't on your allow list for this session, so it's blocked until the session ends.";
  }
}

function populateYoutubeContext(site, titleEl, subEl, session) {
  const rules = session?.youtubeRules;
  if (titleEl) {
    titleEl.textContent = session?.blockName
      ? `"${session.blockName}" restricts YouTube channels`
      : "This YouTube channel is restricted";
  }
  if (subEl) {
    subEl.textContent =
      rules?.mode === "allow"
        ? "Only your chosen channels are reachable during this session."
        : "This channel is on your blocked-channels list for this session.";
  }
}

// A "locked" session (see blocks.html's "Lock until time is up" toggle)
// has no early exit at all - not the 150-char code, not the paid
// emergency unlock, not even the "Pause for a Cause" gate button to get to
// either. This is the real enforcement point: the page is most often
// reached by a site redirect during an active session, not through
// RM2_OPEN_UNLOCK_GATE's "Stop early" button, so checking here is what
// actually matters (that handler's own check is just to skip a pointless
// navigation, not the source of truth).
function applyNoEarlyUnlockLock(session) {
  const gateBox = document.querySelector(".gate-box");
  const choices = document.getElementById("unlock-choices");

  let untilText = "until it ends";
  if (session?.endsAt) {
    const d = new Date(session.endsAt);
    if (!Number.isNaN(d.getTime())) {
      untilText = `until ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
  }

  if (gateBox) {
    gateBox.innerHTML = `
      <p class="unlock-label">This block is locked</p>
      <p style="font-size:12px;color:var(--muted);line-height:1.6;">
        ${session?.blockName ? `"${session.blockName}" was` : "This block was"} started with early unlock turned off -
        there's no code to type and no emergency unlock, it stays on ${untilText} and ends automatically.
      </p>
    `;
  }
  if (choices) choices.remove();
}

async function populateContext() {
  const params = new URLSearchParams(window.location.search);
  const site = params.get("site");
  const mode = params.get("mode");
  const isAdult = params.get("adult") === "1";
  const isYoutube = params.get("youtube") === "1";
  const { revm2Session } = await chrome.storage.local.get("revm2Session");
  codeUnlockUsed = !!revm2Session?.usedCodeUnlock;

  const titleEl = document.getElementById("block-title");
  const subEl = document.getElementById("block-sub");

  if (isAdult) {
    populateAdultContext(params, site, titleEl, subEl);
  } else if (isYoutube) {
    populateYoutubeContext(site, titleEl, subEl, revm2Session);
  } else if (mode === "whitelist") {
    populateWhitelistContext(params, site, titleEl, subEl, revm2Session);
  } else {
    if (revm2Session?.blockName && titleEl) {
      titleEl.textContent = `"${revm2Session.blockName}" is active`;
    }
    if (site && subEl) {
      subEl.textContent = `${site} is blocked until your session ends.`;
    }
  }

  // Locked sessions override the unlock box regardless of which branch
  // above ran - the adult-content filter branch already replaces it for
  // its own (unrelated) reason, so only apply this for an actual active
  // session.
  if (!isAdult && revm2Session?.active && revm2Session?.noEarlyUnlock) {
    applyNoEarlyUnlockLock(revm2Session);
    return; // nothing below applies to a locked session - no emergency shortcut
  }

  // Reached directly via the popup's "Pause for a Cause" / "Emergency
  // unlock" shortcuts rather than a redirected site. The emergency
  // shortcut jumps straight to the payment tab, but also reveal the
  // choices panel on this tab so the code option is there as a fallback
  // if they back out of paying.
  if (params.get("emergency") === "1") {
    openUnlockChoices();
    startEmergencyUnlock();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUnlockScreen();
  populateContext();
});
// Covers closing the tab, navigating away, or the block itself ending out
// from under this page - any of which should release protection on the
// desktop side rather than leaving it armed against a window that no
// longer has a code on screen. Best-effort (a hard process kill can't run
// this), but gate_guard.rs's own watcher only fires on a real foreground
// change anyway, so a merely-stale arm is inert, not harmful.
window.addEventListener("pagehide", () => {
  if (gateOpened) gateProtectionStop();
});
document.getElementById("emergency-unlock-btn")?.addEventListener(
  "click",
  startEmergencyUnlock
);
