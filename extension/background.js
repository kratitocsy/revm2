// RevM2 - background service worker (MV3)
import {
  getSession,
  setSession,
  clearSession,
  apiRequest,
  getSettings,
  setSettings,
} from "./utils/storage.js";
import {
  isCurrentlyEnforcing,
  resolveUnlimited,
  isRemoteSessionExpired,
  computeEndsAt,
} from "./utils/session-logic.js";

// Dynamic rule ID ranges - kept clear of each other and of any static rules
// (adult_blocklist / adult_keyword_domains live in separate static rulesets
// and don't use dynamic IDs at all).
// Permanent allow rules for RevM2's own domains (see alwaysAllowedDomains
// below) - id range 19000-19099, kept OUTSIDE the session dynamic-rule
// range so applyBlockRules()/clearBlockRules() never touch it. These are
// (re)applied independently of any session and stay in place through
// blacklist blocks, whitelist blocks, and the adult-content filter alike.
const ALWAYS_ALLOW_ID_BASE = 19000;
const ALWAYS_ALLOW_ID_RANGE_END = ALWAYS_ALLOW_ID_BASE + 99; // 19099
const BLACKLIST_RULE_ID_BASE = 20000; // one redirect rule per blocked domain (20000-20999)
const WHITELIST_CATCHALL_ID = 21000; // single rule: redirect every main_frame nav by default
const WHITELIST_ALLOW_ID_BASE = 21001; // one allow rule per whitelisted domain (21001-21999)
const DYNAMIC_RULE_RANGE_START = BLACKLIST_RULE_ID_BASE;
const DYNAMIC_RULE_RANGE_END = WHITELIST_ALLOW_ID_BASE + 999; // 21999

const SYNC_ALARM = "revm2-sync";
const END_ALARM = "revm2-session-end";
const HEARTBEAT_ALARM = "revm2-heartbeat";
const RELOCK_ALARM = "revm2-emergency-relock";
const WARN_ALARM = "revm2-session-warn";
// How long before a timed session ends to show the "almost done" notification.
const WARN_MINUTES = 5;
// Both "Pause for a Cause" routes (the 150-char code and the paid Rs.90
// route) grant the same 20-minute pause, not a full session end - the
// block clears for this long, then re-applies itself automatically.
const PAUSE_MINUTES = 20;

// ---------- Desktop app heartbeat ----------
//
// The desktop app (see desktop/src-tauri/src/browser_guard.rs) figures out
// whether this extension is enabled by reading it off disk from Chromium's
// Preferences file, which is laggy - writes are batched, and if the
// browser gets force-closed before a write lands, re-enabling the
// extension in the UI can silently fail to ever reach disk. That's the
// "I turned it back on and it keeps closing my browser anyway" bug.
//
// This heartbeat sidesteps all of that: it's a tiny POST to a fixed
// localhost port that only a genuinely-running (i.e. enabled) copy of
// this service worker can ever send. The desktop app treats a recent
// heartbeat as proof the extension is alive even when its disk read still
// says otherwise. If the desktop app isn't running, this just fails
// silently (connection refused) and costs nothing.
const HEARTBEAT_URL = "http://127.0.0.1:47552/heartbeat";

function sendHeartbeat() {
  try {
    const brands =
      (typeof navigator !== "undefined" &&
        navigator.userAgentData &&
        navigator.userAgentData.brands) ||
      null;

    const send = (incognitoAllowed, allSitesAccess) => {
      const body = JSON.stringify({
        ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
        brands: brands ? brands.map((b) => b.brand) : null,
        incognitoAllowed,
        allSitesAccess,
      });
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) setTimeout(() => controller.abort(), 2000);
      fetch(HEARTBEAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller ? controller.signal : undefined,
      })
        .then(() => {
          // Visible in chrome://extensions -> RevM2 -> "service worker"
          // -> Inspect -> Console. Deliberately debug-level, not an
          // error - a desktop app that isn't running is the common case,
          // not a problem, so this should never look alarming by default.
          console.debug("RevM2: heartbeat sent", { incognitoAllowed, allSitesAccess });
        })
        .catch((err) => {
          console.debug("RevM2: heartbeat failed (desktop app not running?)", err?.message);
        });
    };

    // Blocking is implemented with declarativeNetRequest "redirect" rules
    // (see applyBlockRules), and Chrome's own docs are explicit that
    // redirect rules require host permissions on the target site - unlike
    // plain "block" rules, which don't. That means Chrome's per-extension
    // "Site access" control (chrome://extensions -> Details -> "On all
    // sites" / "On specific sites" / "On click") is a real bypass: narrow
    // it to exclude a site, or set it to "On click", and the redirect
    // silently stops firing there - the extension still shows Enabled,
    // Incognito can still show Allowed, nothing here looks wrong, the
    // site just quietly stops being blocked. chrome.permissions.contains
    // checks what's actually granted right now, not what's declared in
    // the manifest, so this reflects the live Site access setting the
    // same way chrome.extension.isAllowedIncognitoAccess() reflects live
    // Incognito access above.
    const checkAllSitesAccess = (cb) => {
      if (chrome.permissions && typeof chrome.permissions.contains === "function") {
        chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }, (granted) => {
          cb(!!granted);
        });
      } else {
        cb(false);
      }
    };

    // NOTE: this used to read chrome.management.getSelf().incognitoAccess,
    // which does not exist - chrome.management.ExtensionInfo has no
    // "incognitoAccess" field at all (confirmed live: it reads back as
    // undefined every time, regardless of the actual Incognito setting).
    // That meant incognitoAllowed was hard-coded to false on every single
    // heartbeat, no matter what the person had toggled in
    // chrome://extensions - not a lag/timing bug, just the wrong API.
    //
    // The correct call for an extension to check its own incognito
    // permission is chrome.extension.isAllowedIncognitoAccess() - it needs
    // no extra permission (unlike the management namespace, which was only
    // ever declared for this now-removed call) and is the officially
    // documented way to read this. If this namespace is ever unavailable
    // for some reason, that must NOT take the whole heartbeat down with it
    // via the outer catch below - a heartbeat with incognitoAllowed
    // defaulted to false (fail toward "not permitted", same as the Rust
    // side's own default) is far better than no heartbeat at all, since no
    // heartbeat means the extension can never prove it's alive except via
    // the laggy disk read this whole mechanism exists to route around.
    if (chrome.extension && typeof chrome.extension.isAllowedIncognitoAccess === "function") {
      chrome.extension.isAllowedIncognitoAccess((allowed) => {
        checkAllSitesAccess((allSitesAccess) => {
          send(!!allowed, allSitesAccess);
        });
      });
    } else {
      checkAllSitesAccess((allSitesAccess) => send(false, allSitesAccess));
    }
  } catch {
    // Heartbeat is a nice-to-have, not worth letting anything here throw
    // into whatever woke the service worker up.
  }
}

// Fires immediately at module load - which happens every time this service
// worker (re)starts, including the moment the person re-enables a
// previously-disabled extension (MV3 reloads the background script from
// scratch on enable). That's what lets the desktop app learn "re-enabled"
// within one tick instead of waiting on a Preferences file write that
// might never come. The alarm below is the fallback for keeping heartbeats
// flowing while the worker would otherwise sit idle.
sendHeartbeat();
chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });

// ---------- Blocking rules ----------

// Domains that stay reachable even in whitelist mode, regardless of what the
// person typed - so a strict "allow only these sites" block can never lock
// them out of the RevM2 site itself (needed to end the session, pay for an
// emergency unlock, etc.) or basic local dev testing.
function alwaysAllowedDomains(settings) {
  const out = new Set(["wynko.in", "www.wynko.in", "localhost", "127.0.0.1"]);
  const fromUrl = (u) => {
    try {
      out.add(new URL(u).hostname.replace(/^www\./, ""));
    } catch {}
  };
  if (settings?.webBase) fromUrl(settings.webBase);
  if (settings?.apiBase) fromUrl(settings.apiBase);
  return Array.from(out);
}

function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function urlHost(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// youtube.com/youtu.be, but ONLY when the session has real per-channel
// rules configured (see content/youtube-guard.js). declarativeNetRequest
// can only see whole-domain requests - it has no idea which channel a
// youtube.com navigation is for, since that's SPA content, not a separate
// request. So if youtube.com stayed subject to the normal domain-level
// block/allow rules below, a blacklist that includes youtube.com would
// redirect every single YouTube navigation before the page (and
// youtube-guard.js, which is what actually reads youtubeRules and enforces
// the per-channel allow/block list) ever got a chance to load - meaning an
// "allow only these channels" list could never actually be reached, no
// matter how correctly it was configured. Exempting the domain here and
// leaving the real enforcement to the content script is what makes that
// carve-out possible; the "block these channels" case doesn't strictly
// need this exemption (the domain wouldn't have been on a blacklist in
// that combination), but the exemption doesn't hurt it either.
const YOUTUBE_DOMAINS = ["youtube.com", "youtu.be"];
function youtubeExceptionDomains(youtubeRules) {
  if (!youtubeRules || !Array.isArray(youtubeRules.channels) || !youtubeRules.channels.length) {
    return [];
  }
  return YOUTUBE_DOMAINS;
}

function computeAllowHosts(sites, mode, settings, youtubeRules) {
  const siteHosts = sites.map((s) => s.replace(/^www\./, ""));
  const always = alwaysAllowedDomains(settings).map((d) => d.replace(/^www\./, ""));
  const ytExceptions = youtubeExceptionDomains(youtubeRules);
  // `always` (RevM2's own domains) is included here regardless of mode -
  // previously this only applied in whitelist mode, which meant someone
  // could still accidentally (or a synced block could) put wynko.in on a
  // *blacklist* and lock themselves out of it. Now it's exempt either way.
  // `ytExceptions` is included regardless of mode for the same reason -
  // see the comment above.
  const allowHosts = mode === "whitelist"
    ? [...siteHosts, ...always, ...ytExceptions]
    : [...always, ...ytExceptions];
  return { siteHosts, allowHosts };
}

function shouldBlockUrl(urlStr, siteHosts, allowHosts, mode) {
  if (!/^https?:\/\//i.test(urlStr)) return false;
  const host = urlHost(urlStr);
  if (!host) return false;
  // Always-allowed domains win outright, in either mode - see
  // computeAllowHosts above.
  if (allowHosts.some((d) => hostMatchesDomain(host, d))) return false;
  return mode === "whitelist"
    ? !allowHosts.some((d) => hostMatchesDomain(host, d))
    : siteHosts.some((d) => hostMatchesDomain(host, d));
}

// declarativeNetRequest rules only fire on a NEW navigation - a tab that was
// already open before a block/allow-list started won't get touched until it
// happens to reload (and single-page apps like Gmail mostly never do a full
// reload at all once loaded, so their main_frame rule almost never re-fires
// after the first load). Sweeping already-open tabs and sending the blocked
// ones to the blocked page closes that gap instead of relying on the person
// to notice and manually reload every tab themselves.
async function redirectAlreadyOpenTabs(sites, mode, youtubeRules) {
  const settings = await getSettings();
  const { siteHosts, allowHosts } = computeAllowHosts(sites, mode, settings, youtubeRules);

  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return; // "tabs" permission unavailable in this context - nothing to sweep
  }

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (shouldBlockUrl(tab.url, siteHosts, allowHosts, mode)) {
      const host = urlHost(tab.url);
      const target = chrome.runtime.getURL(
        `blocked/blocked.html?site=${encodeURIComponent(host || "")}&mode=${mode}`
      );
      chrome.tabs.update(tab.id, { url: target }).catch(() => {});
    }
  }
}

// The other half of redirectAlreadyOpenTabs above: when a session ends
// (naturally, early, or via unlock), any tab currently sitting on
// blocked.html has no way to know that on its own - it doesn't poll or
// listen for anything, it just renders once and sits there. Without this,
// a blocked tab stays stuck showing the block page indefinitely after the
// session that caused it is long over, until the person happens to
// manually navigate away - which reads as "the block never cleared" /
// "sync is slow", when really nothing was ever going to un-stick it.
// Recovers the original destination from blocked.html's own `site` query
// param (the same one it uses to render "site.com is blocked") rather
// than needing any new state.
async function restoreBlockedTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return; // "tabs" permission unavailable in this context
  }

  const blockedPagePrefix = chrome.runtime.getURL("blocked/blocked.html");
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.url.startsWith(blockedPagePrefix)) continue;

    let target = "https://www.google.com/"; // sane fallback if `site` is somehow missing
    try {
      const site = new URL(tab.url).searchParams.get("site");
      if (site) target = `https://${site}/`;
    } catch {
      // malformed URL - fall through to the generic fallback above
    }
    chrome.tabs.update(tab.id, { url: target }).catch(() => {});
  }
}


async function applyBlockRules(sites, mode = "blacklist", youtubeRules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= DYNAMIC_RULE_RANGE_START && r.id <= DYNAMIC_RULE_RANGE_END)
    .map((r) => r.id);

  const ytExceptions = youtubeExceptionDomains(youtubeRules);
  let addRules;

  if (mode === "whitelist") {
    const settings = await getSettings();
    const allowDomains = Array.from(
      new Set([...sites, ...alwaysAllowedDomains(settings), ...ytExceptions])
    ).slice(0, 999);

    // Catch-all: redirect every top-level navigation by default. Deliberately
    // uses a plain condition with NO urlFilter/regexFilter at all (which in
    // declarativeNetRequest means "matches every URL" for the given
    // resourceTypes) rather than a regex-capture trick to show the exact
    // blocked domain - that's cosmetic, and a rule this critical (it's what
    // makes whitelist mode actually block anything) needs to be the
    // simplest, most reliable thing possible rather than clever.
    const catchAll = {
      id: WHITELIST_CATCHALL_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: "/blocked/blocked.html?mode=whitelist",
        },
      },
      condition: {
        resourceTypes: ["main_frame"],
      },
    };

    // Per-domain allow rules, given higher priority so they win over the
    // catch-all above for anything on the allow list (requestDomains also
    // matches subdomains automatically).
    const allowRules = allowDomains.map((domain, i) => ({
      id: WHITELIST_ALLOW_ID_BASE + i,
      priority: 2,
      action: { type: "allow" },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"],
      },
    }));

    addRules = [catchAll, ...allowRules];
  } else {
    // Drop youtube.com/youtu.be from the actual redirect rules when
    // per-channel rules exist - see youtubeExceptionDomains() above. The
    // domain still shows in session.sites (so the website's UI and the
    // "block name" stay accurate), it's just not given its own
    // declarativeNetRequest redirect rule.
    const blockableSites = sites.filter(
      (domain) => !ytExceptions.some((yd) => domain === yd || domain.endsWith(`.${yd}`))
    );
    addRules = blockableSites.map((domain, i) => ({
      id: BLACKLIST_RULE_ID_BASE + i,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: `/blocked/blocked.html?site=${encodeURIComponent(domain)}&mode=blacklist`,
        },
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"],
      },
    }));
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

// Registers a standing declarativeNetRequest "allow" rule for every RevM2
// domain (see alwaysAllowedDomains), independent of any focus session.
// Priority 2 beats: the per-domain blacklist redirect rules (priority 1),
// the whitelist catch-all (priority 1), and both adult-content static
// rulesets (priority 1) - so RevM2's own site can never end up blocked by
// any of those, even if someone typed wynko.in into a blacklist, or an
// adult-domain-pattern regex happened to false-positive on it. Called on
// install/startup and whenever settings (apiBase/webBase) change, and left
// in place across sessions - applyBlockRules()/clearBlockRules() never
// touch this id range.
async function applyAlwaysAllowRules() {
  const settings = await getSettings();
  const domains = alwaysAllowedDomains(settings).slice(0, ALWAYS_ALLOW_ID_RANGE_END - ALWAYS_ALLOW_ID_BASE + 1);

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= ALWAYS_ALLOW_ID_BASE && r.id <= ALWAYS_ALLOW_ID_RANGE_END)
    .map((r) => r.id);

  const addRules = domains.map((domain, i) => ({
    id: ALWAYS_ALLOW_ID_BASE + i,
    priority: 2,
    action: { type: "allow" },
    condition: { requestDomains: [domain], resourceTypes: ["main_frame"] },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules });
}

async function clearBlockRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter((r) => r.id >= DYNAMIC_RULE_RANGE_START && r.id <= DYNAMIC_RULE_RANGE_END)
    .map((r) => r.id);
  if (removeIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
  }
}

// ---------- Blocked-attempt counter ----------
//
// Counts how many times this session's rules sent someone to the blocked
// page, per site, for the popup's "Blocked N times" line. Chrome blocks via
// declarativeNetRequest without telling us, so we ask it afterwards with
// getMatchedRules (the declarativeNetRequestFeedback permission). Stays in
// local storage only - never sent to the backend.
//
// getMatchedRules only remembers the last 5 minutes and allows 20 calls per
// 10 minutes, so calls are spaced at least ATTEMPTS_MIN_GAP_MS apart (the
// sync alarm and the open popup both ask) and each call only adds matches
// newer than the last one counted.
const ATTEMPTS_KEY = "revm2BlockedAttempts";
const ATTEMPTS_MIN_GAP_MS = 35_000;

async function getBlockedAttempts({ refresh = true } = {}) {
  const session = await getSession();
  if (!session?.active) return null;

  const stored = (await chrome.storage.local.get(ATTEMPTS_KEY))[ATTEMPTS_KEY];
  // A different startedAt means a new session - start counting from zero.
  let attempts =
    stored && stored.sessionStartedAt === session.startedAt
      ? stored
      : { sessionStartedAt: session.startedAt, total: 0, bySite: {}, countedUntil: 0, lastCheckedAt: 0 };

  if (refresh && Date.now() - attempts.lastCheckedAt >= ATTEMPTS_MIN_GAP_MS) {
    attempts.lastCheckedAt = Date.now();
    try {
      const since = Math.max(attempts.countedUntil + 1, new Date(session.startedAt).getTime());
      const [{ rulesMatchedInfo }, rules] = await Promise.all([
        chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: since }),
        chrome.declarativeNetRequest.getDynamicRules(),
      ]);
      const siteByRuleId = new Map(
        rules
          .filter((r) => r.id >= BLACKLIST_RULE_ID_BASE && r.id < WHITELIST_CATCHALL_ID)
          .map((r) => [r.id, r.condition.requestDomains?.[0]]),
      );
      for (const match of rulesMatchedInfo) {
        const { ruleId, rulesetId } = match.rule;
        if (rulesetId !== chrome.declarativeNetRequest.DYNAMIC_RULESET_ID) continue;
        // Whitelist mode blocks everything through one catch-all rule, so
        // there's no single site to name.
        const site = ruleId === WHITELIST_CATCHALL_ID ? "other sites" : siteByRuleId.get(ruleId);
        if (!site) continue; // always-allow rules and anything outside this session's block rules
        attempts.total += 1;
        attempts.bySite[site] = (attempts.bySite[site] || 0) + 1;
        attempts.countedUntil = Math.max(attempts.countedUntil, match.timeStamp);
      }
    } catch (err) {
      // Quota hit or API unavailable - keep the last count, try again next time.
      console.warn("Wynko: couldn't read blocked attempts", err);
    }
    await chrome.storage.local.set({ [ATTEMPTS_KEY]: attempts });
  }

  return { total: attempts.total, bySite: attempts.bySite };
}

// ---------- Session notifications ----------

// Best-effort: a notification that fails to show (Chrome notifications
// turned off, OS focus assist) must never get in the way of ending or
// running a session.
function showSessionNotification(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
      priority: 1,
    }, () => void chrome.runtime.lastError);
  } catch (err) {
    console.warn("Wynko: couldn't show notification", err);
  }
}

// ---------- Session lifecycle ----------

async function startSession({ blockName, sites, durationMinutes, mode, youtubeRules, noEarlyUnlock, unlimited: explicitUnlimited }) {
  const startedAt = new Date().toISOString();
  // See utils/session-logic.js - deliberately not a falsy check on
  // durationMinutes, since 0 minutes left is not the same as no duration
  // ever being set.
  const unlimited = resolveUnlimited(durationMinutes, explicitUnlimited);
  const endsAt = computeEndsAt(unlimited, durationMinutes);

  // "blacklist" (default) = block just these sites, everything else stays
  // reachable. "whitelist" = only these sites stay reachable, everything
  // else gets redirected to the blocked page. Anything unrecognized falls
  // back to blacklist, so older sessions synced from the website (which may
  // not send `mode` yet) keep working exactly as before.
  const resolvedMode = mode === "whitelist" ? "whitelist" : "blacklist";

  // Optional per-channel YouTube rules, set on the website's "YouTube
  // channels" panel and layered on top of whatever site-level mode above
  // does with youtube.com itself. Not required - most blocks won't set
  // this, and content/youtube-guard.js is a no-op when it's missing.
  const resolvedYoutubeRules =
    youtubeRules && Array.isArray(youtubeRules.channels) && youtubeRules.channels.length
      ? { mode: youtubeRules.mode === "allow" ? "allow" : "block", channels: youtubeRules.channels }
      : null;

  // "Locked" mode - no 150-char code, no Rs.90 emergency unlock, the
  // session just runs until endsAt. Mirrors the DB check constraint on
  // focus_lock_sessions (no_early_unlock requires a real duration) - an
  // unlimited session has no end to lock toward, so this can't apply to
  // one even if something upstream sent it that way.
  const resolvedNoEarlyUnlock = !!noEarlyUnlock && !unlimited;

  const session = {
    active: true,
    blockName,
    sites,
    mode: resolvedMode,
    youtubeRules: resolvedYoutubeRules,
    startedAt,
    endsAt,
    unlimited,
    verified: true, // downgraded to false if the person uses the manual code or emergency unlock
    usedEmergencyUnlock: false,
    // The free code-pause route (see pauseActiveSession) is capped at
    // once per session - without a cap someone could just retype the
    // code every 20 minutes indefinitely and never actually sit through
    // a block. Checked server-side (here, not just hidden in the UI)
    // since the UI check alone is trivially bypassed via devtools.
    usedCodeUnlock: false,
    noEarlyUnlock: resolvedNoEarlyUnlock,
  };

  // Apply the actual browser-level rules FIRST, before persisting the
  // session as "active". If this throws, we deliberately let it propagate
  // (see the message handlers below) rather than silently leaving a
  // session marked active in storage while nothing is actually being
  // blocked - a session that *looks* active but isn't enforced is worse
  // than one that visibly failed to start.
  await applyBlockRules(sites, resolvedMode, resolvedYoutubeRules);
  await setSession(session);
  redirectAlreadyOpenTabs(sites, resolvedMode, resolvedYoutubeRules); // don't block on this - it's a cleanup pass

  if (endsAt) {
    const endMs = new Date(endsAt).getTime();
    await chrome.alarms.create(END_ALARM, { when: endMs });
    // Skip the warning for sessions shorter than WARN_MINUTES - it would
    // fire straight away and read like a mistake.
    const warnMs = endMs - WARN_MINUTES * 60_000;
    if (warnMs > Date.now()) {
      await chrome.alarms.create(WARN_ALARM, { when: warnMs });
    } else {
      await chrome.alarms.clear(WARN_ALARM);
    }
  } else {
    await chrome.alarms.clear(END_ALARM);
    await chrome.alarms.clear(WARN_ALARM);
  }

  // Best-effort sync so the website / Live Grid can show the session
  // (and, later, the verified badge) as soon as it starts.
  apiRequest("/api/extension/session/start", {
    method: "POST",
    body: JSON.stringify(session),
  });

  updateBadge(session);
  return session;
}

// Everything needed to actually stop enforcing right now, in one place.
// clearBlockRules() alone only stops NEW navigations from being blocked -
// it does nothing for a tab that's already sitting on blocked.html (that
// page doesn't poll or listen for anything once rendered, see
// restoreBlockedTabs' own comment), so a caller that only remembers the
// first half looks like it "half-worked": rules gone, website/popup both
// say unlocked, but the tab you're actually looking at never moves. That
// exact split call is what pauseActiveSession originally got wrong.
// Anything that stops enforcement - now or in the future - should call
// this instead of picking its own subset.
async function releaseEnforcement() {
  await clearBlockRules();
  await restoreBlockedTabs();
}

// The free "type the 150-char code" route - unlike endSession below, this
// doesn't finish the session or tell the backend anything. It just clears
// the block rules for PAUSE_MINUTES and schedules RELOCK_ALARM to bring
// them back, same mechanism the paid route used to use before paying
// became a full end (see EMERGENCY_UNLOCK_CONFIRMED). Session stays
// "active" in storage the whole time - only verified/usedCodeUnlock change.
async function pauseActiveSession(usedFlagKey) {
  const session = await getSession();
  if (!session) return;
  session.verified = false;
  session[usedFlagKey] = true;
  // session.active stays true on purpose (see the comment above this
  // function) so the block re-applies itself automatically once
  // PAUSE_MINUTES is up. But that same "active" flag is what
  // isCurrentlyEnforcing() (see utils/session-logic.js) - used by the
  // tabs.onUpdated redirect listener and the onInstalled/onStartup
  // re-apply checks - looks at first; without a separate signal for "yes
  // active, but paused right now" those all kept treating a paused
  // session as still fully enforcing. Stamping when the pause actually
  // ends is that signal.
  session.pausedUntil = Date.now() + PAUSE_MINUTES * 60_000;
  await setSession(session);
  await releaseEnforcement();
  await chrome.alarms.create(RELOCK_ALARM, {
    when: Date.now() + PAUSE_MINUTES * 60_000,
  });
}

async function endSession(reason) {
  const session = await getSession();
  if (!session) return;

  await releaseEnforcement();
  await chrome.alarms.clear(END_ALARM);
  await chrome.alarms.clear(WARN_ALARM);

  // Only a session that ran its full time gets the "done" notification -
  // ending it early or from the website is something the person just did
  // themselves, so telling them about it would be noise.
  if (reason === "completed") {
    showSessionNotification(
      "Focus session complete",
      session.blockName ? `"${session.blockName}" is done. Your sites are unblocked.` : "Nice work. Your sites are unblocked.",
    );
  }

  const verified = session.verified && reason === "completed";

  // This used to be fire-and-forget, then immediately wipe local session
  // state regardless of whether the call actually succeeded. If it failed
  // (cold service-worker start dropping the request, a network blip, a
  // 401 from an expired-but-not-yet-refreshed token) the backend's
  // focus_lock_sessions row just stayed active forever - nothing ever
  // retried, because the local record proving "this needs to be flushed"
  // was already gone. That's exactly what a session stuck showing
  // "Ending..." on the website (extension already stopped, backend never
  // heard about it) looks like. Now: wait for the result, and if it
  // didn't land, keep the {reason, verified} pair around so the next
  // sync pass (see flushPendingEnd in syncWithBackend, runs every minute)
  // retries it instead of dropping it on the floor.
  const result = await apiRequest("/api/extension/session/end", {
    method: "POST",
    body: JSON.stringify({ reason, verified }),
  });
  if (!result.ok) {
    await chrome.storage.local.set({
      revm2PendingEnd: { reason, verified, queuedAt: Date.now() },
    });
  }

  await clearSession();
  updateBadge(null);
}

// Retries a session-end call that failed to reach the backend when it was
// first fired (see the comment in endSession above). Runs at the top of
// every sync pass so it self-heals within a minute without needing the
// person to notice or do anything.
async function flushPendingEnd() {
  const { revm2PendingEnd } = await chrome.storage.local.get("revm2PendingEnd");
  if (!revm2PendingEnd) return;

  const result = await apiRequest("/api/extension/session/end", {
    method: "POST",
    body: JSON.stringify({
      reason: revm2PendingEnd.reason,
      verified: revm2PendingEnd.verified,
    }),
  });
  if (result.ok) {
    await chrome.storage.local.remove("revm2PendingEnd");
  }
  // Still failing - leave it queued, try again on the next sync pass.
}

async function addSiteToActiveSession(domain) {
  const session = await getSession();
  if (!session || !session.active) return { ok: false, reason: "no_active_session" };
  if (session.sites.includes(domain)) return { ok: true, alreadyBlocked: true };

  // In blacklist mode this adds one more site to block; in whitelist mode it
  // adds one more site to the allow list (there's no other meaningful action
  // for "block this site now" once everything is already blocked by default).
  const previousSites = [...session.sites];
  session.sites.push(domain);
  try {
    await applyBlockRules(session.sites, session.mode, session.youtubeRules);
  } catch (err) {
    console.error("RevM2: failed to update block rules", err);
    return { ok: false, reason: "apply_rules_failed", error: String(err?.message || err) };
  }
  await setSession(session);
  redirectAlreadyOpenTabs(session.sites, session.mode, session.youtubeRules); // don't block on this - it's a cleanup pass
  apiRequest("/api/extension/session/sites", {
    method: "PATCH",
    body: JSON.stringify({ sites: session.sites }),
  });
  return { ok: true, session };
}

async function addYoutubeChannelToActiveSession(channel) {
  const session = await getSession();
  if (!session || !session.active) return { ok: false, reason: "no_active_session" };

  // Add to whichever list already exists for this session - "block" (these
  // channels are off-limits) or "allow" (only these channels are reachable).
  // No existing list yet: default to starting a "block" list, since that's
  // the more common first move (picking a couple of channels to avoid,
  // rather than locking YouTube down to an allow-only handful).
  const rules = session.youtubeRules?.channels
    ? session.youtubeRules
    : { mode: "block", channels: [] };

  if (rules.channels.some((c) => c.id === channel.id)) {
    return { ok: true, alreadyBlocked: true, session };
  }

  rules.channels = [...rules.channels, { id: channel.id, label: channel.label || channel.id }];
  session.youtubeRules = rules;
  await setSession(session);

  // Re-apply the network-level rules: going from zero channels to one is
  // exactly the moment youtube.com's treatment can change (see
  // youtubeExceptionDomains in applyBlockRules) - a blacklist that
  // includes youtube.com was fully redirecting it until this first
  // channel rule existed, so without this the newly-added "allow" channel
  // would still be unreachable until something else happened to trigger a
  // rule refresh (e.g. the next sync alarm, up to a minute away).
  try {
    await applyBlockRules(session.sites, session.mode, session.youtubeRules);
    redirectAlreadyOpenTabs(session.sites, session.mode, session.youtubeRules);
  } catch (err) {
    console.error("RevM2: failed to update block rules after youtube channel change", err);
  }

  // Best-effort - mirrors addSiteToActiveSession's site sync. If the
  // backend doesn't have a matching endpoint yet this just fails silently
  // (apiRequest swallows network/4xx errors), same as any other offline
  // moment; the channel rule is still applied locally either way.
  apiRequest("/api/extension/session/youtube-rules", {
    method: "PATCH",
    body: JSON.stringify({ youtubeRules: rules }),
  });

  return { ok: true, session };
}

function updateBadge(session) {
  if (session && session.active) {
    chrome.action.setBadgeText({ text: "\u25CF" }); // solid dot while a block is running
    chrome.action.setBadgeBackgroundColor({ color: "#0F6E56" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ---------- Backend sync (picks up sessions started from the website) ----------

// Mirrors an externally-reported session state into local session state -
// shared by the Edge Function poll below (syncWithBackend) and the
// desktop app's local push (RM2_DESKTOP_SESSION_EVENT, see the
// offscreen-document section further down). Only acts on an actual
// transition either way: a session already mirrored locally is never
// re-started just because "still active" gets reported again (that would
// reset its countdown - see startSession()'s durationMinutes handling),
// and there's nothing to end if nothing is active locally.
async function mirrorSessionState(remoteActive, remoteSession) {
  const local = await getSession();
  if (remoteActive && remoteSession && !local?.active) {
    // A session the backend still calls "active" but which reports zero
    // (or negative) minutes left isn't something to resume - it already
    // finished, almost certainly while this device was asleep/offline and
    // the original end-of-session call never landed (see endSession's
    // flushPendingEnd comment). Recognize that here and ask the backend to
    // close it out properly instead of calling startSession(), which used
    // to treat that 0 as "no duration was ever set" and quietly turn a
    // finished 90-minute block into a fresh unlimited one.
    if (isRemoteSessionExpired(remoteSession)) {
      const result = await apiRequest("/api/extension/session/end", {
        method: "POST",
        body: JSON.stringify({ reason: "completed", verified: true }),
      });
      if (!result.ok) {
        await chrome.storage.local.set({
          revm2PendingEnd: { reason: "completed", verified: true, queuedAt: Date.now() },
        });
      }
      return;
    }

    await startSession({
      blockName: remoteSession.blockName,
      sites: remoteSession.sites,
      durationMinutes: remoteSession.durationMinutes ?? null,
      mode: remoteSession.mode,
      youtubeRules: remoteSession.youtubeRules,
      noEarlyUnlock: remoteSession.noEarlyUnlock,
      unlimited: resolveUnlimited(remoteSession.durationMinutes, remoteSession.unlimited === true ? true : undefined),
    });
  } else if (!remoteActive && local?.active) {
    await endSession("ended_remotely");
  } else if (remoteActive && remoteSession && local?.active) {
    // Already mirrored as active - startSession() above intentionally
    // doesn't re-run here (that would reset startedAt/endsAt and the
    // popup's countdown every poll). But noEarlyUnlock specifically is a
    // security-relevant flag, not a cosmetic one: if it was ever wrong on
    // the very first sync (a timing race, a field not populated yet
    // server-side, anything), leaving it stuck for the rest of the
    // session means the popup and blocked-page gate would trust a local
    // "false" for a session that's actually supposed to be locked, and
    // show the code/emergency-unlock UI that's meant to be unreachable.
    // Reconcile just this flag on every poll instead - cheap, and it
    // can only ever tighten enforcement (false->true), never loosen it,
    // since ending a genuinely-unlockable session already goes through
    // endSession() above, not this branch.
    const resolvedRemoteNoEarlyUnlock = !!remoteSession.noEarlyUnlock && !local.unlimited;
    if (local.noEarlyUnlock !== resolvedRemoteNoEarlyUnlock) {
      local.noEarlyUnlock = resolvedRemoteNoEarlyUnlock;
      await setSession(local);
    }
  }
}

// ---------- Direct link with the desktop app ----------
//
// Without a token this extension never learns about sessions started by
// schedules or the desktop app. The website used to be the only way to get
// one (RM2_CONNECT above). When the Wynko desktop app runs on this PC and is
// signed in, it hands over its own token here instead, so no website visit
// is needed. X-Wynko-Pair is what lets the desktop app tell this request
// apart from a web page (see the desktop's pair_token.rs).
const PAIR_URL = "http://127.0.0.1:47552/pair";

async function pairWithDesktop() {
  const settings = await getSettings();
  if (settings.token) return false;
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (controller) setTimeout(() => controller.abort(), 2000);
    const res = await fetch(PAIR_URL, {
      headers: { "X-Wynko-Pair": "1" },
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    });
    if (res.status !== 200) return false; // 204: desktop app not signed in yet
    const data = await res.json().catch(() => null);
    if (!data || typeof data.token !== "string" || !data.token) return false;
    // Re-check: the website may have connected in the meantime.
    if ((await getSettings()).token) return false;
    await setSettings({ token: data.token });
    console.debug("Wynko: linked with the desktop app");
    return true;
  } catch (err) {
    console.debug("Wynko: desktop app not reachable for linking", err?.message);
    return false;
  }
}

async function syncWithBackend() {
  await pairWithDesktop();
  await flushPendingEnd(); // see comment on endSession() - retries a session-end that didn't land yet

  const remote = await apiRequest("/api/extension/session/status");

  // Profile sync (exam type etc.) is independent of session state - keeps
  // the blocked page's personalized audio current even between sessions.
  const profile = await apiRequest("/api/extension/profile");
  if (profile.ok && profile.data) {
    await chrome.storage.local.set({ revm2Profile: profile.data });
  }

  if (!remote.ok || !remote.data) return; // offline or not configured yet - keep local state as-is

  const remoteSession = remote.data.session;
  await mirrorSessionState(!!remoteSession?.active, remoteSession);
}

// ---------- Desktop-app local bridge (instant, no Supabase involved) ----------
//
// The poll above (syncWithBackend/SYNC_ALARM) is the only way to learn
// about a session that started/ended somewhere this extension can't be
// messaged directly - but when that "somewhere" is the desktop companion
// app running on this same machine, waiting on a 35s alarm is needless:
// the desktop app already knows the instant its own DB poll
// (blocks.html's loadActiveBlock()) sees a change, and can just say so
// directly over localhost. See desktop/src-tauri/src/session_bridge.rs
// for the other end of this and offscreen.js/offscreen.html for what
// actually holds the connection open (a plain MV3 service worker can't -
// it gets suspended after ~30s idle, which is exactly why the offscreen
// document exists).
//
// This is additive, not a replacement for the Edge Function poll above:
// it only ever covers "the desktop app on this machine knew about it."
// A session started/ended on a genuinely different device with no
// desktop app running still relies on SYNC_ALARM, same as always.
const OFFSCREEN_URL = "offscreen.html";

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  }
  // Older Chrome without getContexts() - hasDocument() is the fallback.
  if (chrome.offscreen.hasDocument) return chrome.offscreen.hasDocument();
  return false;
}

let creatingOffscreenDocument = null;
async function ensureOffscreenDocument() {
  if (!chrome.offscreen) return; // Chrome too old for the Offscreen API - desktop-bridge instant sync just isn't available here, SYNC_ALARM still covers it
  if (await hasOffscreenDocument()) return;

  // Guards against a race where two wakeups both see "no document yet"
  // and both call createDocument() - Chrome only allows one at a time and
  // the second call would throw.
  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }
  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    // None of the documented Reason values is a literal fit for "hold a
    // long-poll connection open" - WORKERS is the closest match in
    // practice (it's what Chromium added to cover exactly this kind of
    // "something needs to keep running that the service worker can't
    // host itself" gap) and is what other extensions use for the same
    // reason.
    reasons: ["WORKERS"],
    justification:
      "Hold a local long-poll connection to the desktop companion app open across service-worker suspensions, so session start/end signals from the desktop app reach the extension within seconds instead of waiting on the periodic sync alarm.",
  });
  try {
    await creatingOffscreenDocument;
  } catch (err) {
    console.warn("RevM2: ensureOffscreenDocument failed", err);
  } finally {
    creatingOffscreenDocument = null;
  }
}

// ---------- One-click connect (pushed from the website, no copy/paste) ----------
// The website calls chrome.runtime.sendMessage(EXTENSION_ID, {...}) after the
// user clicks "Connect extension". Only origins listed in manifest.json's
// externally_connectable.matches are allowed to reach this at all - anything
// else is silently ignored by Chrome before it gets here.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "RM2_PING") {
      // Lets the website detect "extension is installed" before showing the
      // Connect button, instead of guessing.
      sendResponse({ ok: true, installed: true, version: chrome.runtime.getManifest().version });
      return;
    }

    if (msg?.type === "RM2_STATUS") {
      // Lets the website know whether it still needs to connect at all -
      // used to auto-connect silently on page load instead of requiring a click.
      const settings = await getSettings();
      sendResponse({ ok: true, installed: true, connected: !!settings.token });
      return;
    }

    if (msg?.type === "RM2_CONNECT") {
      if (!msg.token) {
        sendResponse({ ok: false, reason: "missing_token" });
        return;
      }
      const partial = { token: msg.token };
      if (msg.apiBase) partial.apiBase = msg.apiBase;
      if (msg.webBase) partial.webBase = msg.webBase;
      await setSettings(partial);
      await syncWithBackend(); // pick up any session immediately instead of waiting up to 1 min
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RM2_SET_WEBBASE") {
      // Sent on every blocks.html page load for an already-connected
      // extension, so a stale/default webBase (e.g. from before this
      // message existed) self-corrects without the person having to
      // disconnect and reconnect.
      if (msg.webBase) await setSettings({ webBase: msg.webBase });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RM2_DISCONNECT") {
      await setSettings({ token: "" });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RM2_START_SESSION") {
      // Pushed the instant a block is created on the website, so blocking
      // applies right away instead of waiting for the next 1-minute poll.
      const settings = await getSettings();
      if (!settings.token) {
        sendResponse({ ok: false, reason: "not_connected" });
        return;
      }
      try {
        const session = await startSession(msg.payload);
        sendResponse({ ok: true, session });
      } catch (err) {
        console.error("RevM2: failed to start session", err);
        sendResponse({ ok: false, reason: "apply_rules_failed", error: String(err?.message || err) });
      }
      return;
    }

    if (msg?.type === "RM2_END_SESSION") {
      const settings = await getSettings();
      if (!settings.token) {
        sendResponse({ ok: false, reason: "not_connected" });
        return;
      }
      await endSession(msg.reason || "ended_remotely");
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "RM2_OPEN_UNLOCK_GATE") {
      // Sent when the person clicks "Stop early" on the website instead of
      // ending the session there directly. Rather than trusting the web
      // page to mark the session unverified itself (trivially bypassable
      // from devtools), redirect them to the same 150-char honesty gate
      // used for a redirected blocked site - the only thing that actually
      // ends the session is unlock.js's confirmUnlock() hitting the
      // website backend and this extension's own SESSION_ENDED_EARLY path.
      const settings = await getSettings();
      if (!settings.token) {
        sendResponse({ ok: false, reason: "not_connected" });
        return;
      }
      const session = await getSession();
      if (!session?.active) {
        sendResponse({ ok: false, reason: "no_active_session" });
        return;
      }
      // Locked sessions don't get a gate at all - opening one just to have
      // unlock.js refuse the code entry is pointless navigation for a path
      // that can never succeed. blocked/unlock.js still independently
      // refuses to run the code challenge for a locked session too (the
      // real enforcement point, since a redirected blocked site reaches
      // the same page without ever going through this message handler).
      if (session.noEarlyUnlock) {
        sendResponse({ ok: false, reason: "locked_no_early_unlock" });
        return;
      }
      const gateUrl = chrome.runtime.getURL("blocked/blocked.html?manual=1");
      // Navigate the tab the message came from (the blocks.html page
      // itself) rather than opening a new one - the person asked to be
      // taken to the gate, not have another tab pop up alongside it.
      if (sender?.tab?.id != null) {
        await chrome.tabs.update(sender.tab.id, { url: gateUrl });
        sendResponse({ ok: true, tabId: sender.tab.id });
      } else {
        // No tab context (shouldn't normally happen for a page-sent
        // message) - fall back to opening one so the flow still works.
        const tab = await chrome.tabs.create({ url: gateUrl });
        sendResponse({ ok: true, tabId: tab?.id });
      }
      return;
    }

    sendResponse({ ok: false, reason: "unknown_message" });
  })();
  return true; // keep the message channel open for the async response
});

// ---------- Adult content filter ----------
// Two static (network-level) layers, toggled together by the one "Block
// adult content" setting:
//   1. adult_blocklist        - ~25k exact known adult domains
//   2. adult_keyword_domains  - regex rules catching domains built around
//      common adult/porn-site naming patterns (xxx/porn/sex/hentai/tube
//      sites, plus common Hindi-transliteration terms used by text "story"
//      sites like Antarvasna and its many clones/mirrors) - this is what
//      catches new or rotating domains that aren't on the exact list yet.
// A fourth, content-level layer lives in content/adult-heuristic.js (keyword
// density in the page's own text) for sites whose domain name gives nothing
// away - e.g. a generic blogspot/wordpress URL hosting explicit stories.
// A fifth layer, content/rta-check.js, looks for the self-declared RTA tag.

const ADULT_RULESET_IDS = ["adult_blocklist", "adult_keyword_domains"];

async function setAdultBlockEnabled(enabled) {
  if (enabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ADULT_RULESET_IDS });
  } else {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ADULT_RULESET_IDS });
  }
  await setSettings({ blockAdultContent: enabled });
}

// Chrome persists enabled-ruleset state across browser restarts, but NOT
// reliably across extension updates - so re-apply the saved preference
// every time the service worker (re)starts, rather than trusting the
// manifest's default "enabled": false to still reflect what the user chose.
async function reapplyAdultBlockState() {
  const settings = await getSettings();
  const enabledIds = await chrome.declarativeNetRequest.getEnabledRulesets();
  const allEnabled = ADULT_RULESET_IDS.every((id) => enabledIds.includes(id));
  const noneEnabled = ADULT_RULESET_IDS.every((id) => !enabledIds.includes(id));
  if (settings.blockAdultContent && !allEnabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ADULT_RULESET_IDS });
  } else if (!settings.blockAdultContent && !noneEnabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ADULT_RULESET_IDS });
  }
}

// ---------- Event wiring ----------

chrome.runtime.onInstalled.addListener(async () => {
  // 35s, not the usual once-a-minute cadence for chrome.alarms - only
  // possible because this extension runs unpacked (dev mode); Chrome
  // clamps periodInMinutes to a 1-minute minimum for anything installed
  // from the Web Store. If this ever gets published, this needs to go
  // back to something >= 1.
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 35 / 60 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  applyAlwaysAllowRules();
  reapplyAdultBlockState();
  ensureOffscreenDocument();
  // Reloading/updating the extension (e.g. loading a new build over an old
  // one) does NOT fire onStartup - only a real browser restart does. So a
  // tab that was already open before the update, for a session that was
  // already active, would otherwise never get swept until it happened to
  // reload on its own. Re-apply and re-sweep here too.
  // isCurrentlyEnforcing, not a bare session.active check - the same gap
  // that let a paused session's fresh navigations keep getting blocked
  // (see the tabs.onUpdated listener) would otherwise also re-lock a
  // session the moment the browser restarts or the extension reloads
  // mid-pause, even though PAUSE_MINUTES hasn't actually run out yet.
  const session = await getSession();
  if (isCurrentlyEnforcing(session)) {
    await applyBlockRules(session.sites, session.mode, session.youtubeRules);
    redirectAlreadyOpenTabs(session.sites, session.mode, session.youtubeRules);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  applyAlwaysAllowRules();
  reapplyAdultBlockState();
  ensureOffscreenDocument();
  const session = await getSession();
  if (isCurrentlyEnforcing(session)) redirectAlreadyOpenTabs(session.sites, session.mode, session.youtubeRules);
});

// The service worker itself gets suspended and restarted constantly (that's
// normal MV3 behavior, not a bug) - each restart is a chance the offscreen
// document somehow isn't there yet (very first install before onInstalled's
// async work finishes, or a rare edge case where it got closed). Calling
// this at module load, every time the worker spins up, is cheap (it's a
// no-op if the document already exists - see hasOffscreenDocument()) and
// means the desktop-bridge connection self-heals without needing its own
// dedicated alarm.
ensureOffscreenDocument();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncWithBackend();
    // Keeps the count going while the popup is closed - Chrome forgets
    // matches after 5 minutes.
    await getBlockedAttempts();
  }
  if (alarm.name === HEARTBEAT_ALARM) {
    sendHeartbeat();
  }
  if (alarm.name === END_ALARM) {
    await endSession("completed");
  }
  if (alarm.name === WARN_ALARM) {
    const session = await getSession();
    if (session?.active) {
      showSessionNotification(
        `${WARN_MINUTES} minutes left`,
        session.blockName ? `"${session.blockName}" ends in ${WARN_MINUTES} minutes. Keep going!` : `Your focus session ends in ${WARN_MINUTES} minutes. Keep going!`,
      );
    }
  }
  if (alarm.name === RELOCK_ALARM) {
    const session = await getSession();
    if (session?.active) {
      delete session.pausedUntil; // pause window is over - back to normal enforcement
      await setSession(session);
      await applyBlockRules(session.sites, session.mode, session.youtubeRules);
      redirectAlreadyOpenTabs(session.sites, session.mode, session.youtubeRules);
    }
  }
});

// declarativeNetRequest only sees real network requests. Two common things
// never generate one, so they'd otherwise slip straight past every rule
// above:
//   - Back/forward-cache restores (hitting the back/forward button, or Chrome
//     waking a suspended tab) - the page is restored from memory, not
//     re-fetched.
//   - Single-page apps changing the URL via the History API (pushState) -
//     no navigation, no request, just a URL bar change.
// Both of those DO fire chrome.tabs.onUpdated with a changed `url`, though -
// so watch for that continuously (not just at fixed checkpoints like session
// start) for as long as a session is active, and force-redirect on the spot.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const session = await getSession();
  // isCurrentlyEnforcing (see utils/session-logic.js) knows about pause
  // windows, unlike a bare session.active check - a session mid-pause is
  // still "active" in storage on purpose (see pauseActiveSession) so it
  // can auto-relock later, but that must NOT mean this listener keeps
  // treating fresh navigations as blocked in the meantime.
  if (!isCurrentlyEnforcing(session)) return;

  const settings = await getSettings();
  const { siteHosts, allowHosts } = computeAllowHosts(session.sites, session.mode, settings, session.youtubeRules);
  if (!shouldBlockUrl(changeInfo.url, siteHosts, allowHosts, session.mode)) return;

  const host = urlHost(changeInfo.url);
  const target = chrome.runtime.getURL(
    `blocked/blocked.html?site=${encodeURIComponent(host || "")}&mode=${session.mode}`
  );
  chrome.tabs.update(tabId, { url: target }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "START_SESSION": {
        try {
          const session = await startSession(msg.payload);
          sendResponse({ ok: true, session });
        } catch (err) {
          console.error("RevM2: failed to start session", err);
          sendResponse({ ok: false, reason: "apply_rules_failed", error: String(err?.message || err) });
        }
        break;
      }
      case "GET_STATUS": {
        const session = await getSession();
        sendResponse({ ok: true, session });
        break;
      }
      case "GET_BLOCKED_ATTEMPTS": {
        sendResponse({ ok: true, attempts: await getBlockedAttempts() });
        break;
      }
      case "ADD_CURRENT_SITE": {
        const result = await addSiteToActiveSession(msg.domain);
        sendResponse(result);
        break;
      }
      case "ADD_YT_CHANNEL_BLOCK": {
        const result = await addYoutubeChannelToActiveSession(msg.channel);
        sendResponse(result);
        break;
      }
      case "CODE_UNLOCK_CONFIRMED": {
        // Sent from blocked.html once the 150-char code is completed
        // correctly. Free route - only a temporary breather, not a way
        // out entirely: pauses the block for PAUSE_MINUTES, then it
        // re-applies itself automatically (see pauseActiveSession below).
        // Capped at once per session - checked here (not just in
        // unlock.js's UI) since that's the only check that can't be
        // bypassed via devtools.
        const codeSession = await getSession();
        if (codeSession?.usedCodeUnlock) {
          sendResponse({ ok: false, reason: "already_used" });
          break;
        }
        await pauseActiveSession("usedCodeUnlock");
        sendResponse({ ok: true });
        break;
      }
      case "EMERGENCY_UNLOCK_CONFIRMED": {
        // Sent after the website confirms the Rs.90 payment webhook-side
        // and hands back a short-lived token (validated in msg.payload).
        // Paying is the "get me out for real" route - it ends the session
        // fully, unlike the free code above which only pauses it.
        await endSession("emergency_unlock");
        sendResponse({ ok: true });
        break;
      }
      case "TOGGLE_ADULT_BLOCK": {
        await setAdultBlockEnabled(!!msg.enabled);
        sendResponse({ ok: true, enabled: !!msg.enabled });
        break;
      }
      case "GET_ADULT_BLOCK_STATE": {
        const settings = await getSettings();
        sendResponse({ ok: true, enabled: !!settings.blockAdultContent });
        break;
      }
      case "RM2_SETTINGS_SAVED": {
        // Sent from options.js right after apiBase/webBase are saved, so a
        // changed RevM2 domain gets added to the always-allow list
        // immediately instead of waiting for the next sync alarm.
        await applyAlwaysAllowRules();
        sendResponse({ ok: true });
        break;
      }
      case "RM2_DESKTOP_SESSION_EVENT": {
        // Forwarded by offscreen.js from the desktop app's local bridge -
        // see the "Desktop-app local bridge" section above. Gated on
        // being connected at all (same bar as every other session-mirror
        // path), so an extension that was never paired to an account
        // can't have a session started for it just because some desktop
        // app happens to be running on the same machine.
        const settings = await getSettings();
        if (settings.token) {
          try {
            await mirrorSessionState(!!msg.active, msg.session);
          } catch (err) {
            console.error("RevM2: failed to mirror desktop session event", err);
          }
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, reason: "unknown_message" });
    }
  })();
  return true; // keep the message channel open for the async response
});
