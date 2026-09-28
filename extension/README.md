# Wynko Focus Lock — browser extension

MV3 extension for Chrome and Edge (same codebase, both Chromium). Handles site blocking, session timers, and the unlock flow. Talks to your website backend for session sync and the verified-badge signal — none of those backend endpoints exist yet, they're stubbed here with clear TODOs.

## Load it locally

1. `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Pin the extension so the popup is one click away

## What's wired up

- **Popup** — start a named block (custom site list + duration or unlimited), one-click "block this site now" for whatever tab you're on, live countdown, saved presets. Two modes per block: **Blacklist** (block just the listed sites, everything else stays reachable — the default) and **Whitelist** (allow only the listed sites, everything else is blocked for the duration of the session).
- **Background service worker** — owns session state, builds `declarativeNetRequest` rules for the active block (per-domain redirects in blacklist mode; a single catch-all redirect plus per-domain allow rules in whitelist mode), timers via `chrome.alarms`, and a 1-minute poll to pick up sessions started from the website.
- **Blocked page** — shown when a blocked site loads. 150-char random unlock code (no paste, resets on copy attempt, tab-blur, or screenshot-shortcut keydown), plus the ₹90/30-min emergency unlock path. Copy adapts to *why* the page was reached — blacklist block, whitelist "not on your allow list", or one of the adult-content layers below (which skip the unlock code entirely, since that's a standing filter, not a session).
- **Options page** — paste a sync token from your web dashboard, manage saved presets (each shows its mode), toggle content filtering.

## Content filtering (anti-adult-content)

One "Block adult content" toggle in Options controls four layers, applied all the time (not just during a focus session):

1. **`rules/adult-blocklist.json`** — ~25k exact known adult domains, static `declarativeNetRequest` ruleset.
2. **`rules/adult-keyword-domains.json`** — regex rules matching common adult-site *domain-naming patterns* (tube/cam-site names, plus Hindi/desi text-story-site terms like the ones Antarvasna and its many clones/mirrors use) — catches new or rotating domains that aren't on the exact list yet without needing to know the specific domain in advance.
3. **`content/rta-check.js`** — looks for the self-declared RTA ("Restricted To Adults") meta tag many adult sites embed specifically so filters can find them.
4. **`content/adult-heuristic.js`** — a conservative page-text check (title/meta/body sample) that only fires on several distinct high-signal explicit terms together, for text-based "story" sites hosted on otherwise generic domains that layers 1–3 wouldn't catch.

Also included: a regex rule blocking anything on adult-specific TLDs (`.xxx`/`.porn`/`.adult`/`.sex`), bundled inside `adult-blocklist.json`.

None of this is (or can be) 100% — it's several independent, additive layers rather than one that has to be perfect on its own.

## What still needs your backend

Search for `TODO` and `apiRequest(` calls in `background.js` and `blocked/unlock.js`. The extension currently expects:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/extension/session/status` | GET | Poll for a session started on the website |
| `/api/extension/session/start` | POST | Report a session the extension just started |
| `/api/extension/session/end` | POST | Report session end + whether it should count as verified |
| `/api/extension/session/sites` | PATCH | Report a site added mid-session |
| `/api/extension/session/end-early` | POST | Report the manual-unlock-code path |
| `/emergency-unlock?token=...` | (web page) | Razorpay checkout for the ₹90 emergency unlock, should webhook back to end the session and hand a short-lived unlock token back to the extension |

Auth is a bearer token pasted into the options page for now — swap for whatever your real login/session flow ends up being (ideally this becomes an OAuth-style connect flow off your website instead of a copy-pasted token, same reasoning as any third-party integration).

**Mode field**: session payloads (both `session/start` and whatever the website sends via `RM2_START_SESSION`) now carry an optional `mode: "blacklist" | "whitelist"` alongside `sites`. If your dashboard doesn't send it yet, the extension defaults to `"blacklist"` (today's block-only behavior) — nothing breaks, but you'll want a mode selector on the website side too so blocks created there can use whitelist mode.

## Known limits — read before promising these to users

- **Verified badge**: must be granted server-side based on continuous heartbeats + no manual/emergency unlock used. Never trust a client-reported "I finished honestly" flag.
- **Cross-app detection** (leaving the browser entirely) and **force-closing the browser** if the extension is disabled/removed are **not possible from a browser extension alone** — that needs the Desktop Companion app (Stage 3 on your roadmap) running with OS-level permissions. This extension exposes a heartbeat hook ready for that later.
- **Screenshot detection** has no reliable technical solution anywhere (browser or native app). What's implemented here (copy-block, blur-detection, PrintScreen keydown) catches the *shortcuts*, not the act of a photo or a tool that doesn't use those paths. Don't market this as "screenshot-proof."

## One-click connect (no copy/paste)

The manual "paste a token into Options" flow described above still works as a fallback, but the extension now also accepts a token **pushed directly from the website** via `chrome.runtime.onMessageExternal` — this is what the OAuth-style-connect TODO above refers to.

How it works:
- `manifest.json` has a pinned `"key"` field so the extension's ID never changes across reinstalls (`knofmgookchmjekaefloaljcamjlbnmp`), and an `"externally_connectable"` allowlist of origins that are permitted to message it.
- When the user clicks **Connect extension** on the website, the page calls `chrome.runtime.sendMessage(EXTENSION_ID, {type:'RM2_CONNECT', token})`.
- `background.js` receives it in the `onMessageExternal` listener, saves the token via `setSettings()`, and immediately runs a sync — no waiting for the 1-minute alarm, no copy/paste.
- If the extension isn't installed (or the user is on Firefox/Safari, or the site's origin isn't in the allowlist yet), `sendMessage` just times out and the website falls back to showing the token for manual paste, same as before.

**Before shipping**: update the `externally_connectable.matches` list in `manifest.json` to your real deployed domain(s) — it currently only allows `revm2.app`, `*.revm2.app`, and a couple of local dev ports. Any origin not on that list is silently blocked by Chrome, so this fails safe if you forget.

If you ever regenerate the extension's private key, the extension ID changes too — update `RM2_EXTENSION_ID` in `blocks.html` on the website to match.

**Chrome Web Store note**: this pinned ID is only guaranteed while you load the extension unpacked/private. Once you publish to the Web Store, Google assigns the *production* ID (tied to your developer account), which will differ from this dev one — update `RM2_EXTENSION_ID` again at that point, and re-check `externally_connectable.matches` still covers your live domain.

## Changelog

**0.3.4** — Merged build combining:
- The YouTube per-channel whitelist/blacklist fix (0.3.3): `youtube.com`/`youtu.be` are now exempted from the domain-level `declarativeNetRequest` redirect rules whenever per-channel `youtubeRules` are configured for a session. Previously, a whitelist session that didn't explicitly include `youtube.com` would redirect *every* YouTube navigation at the network level before `content/youtube-guard.js` (which enforces the actual per-channel allow/block list) ever got a chance to run — so "allow only these channels" could never work no matter how it was set up. Enforcement is now correctly delegated to the content script, with the network layer only guarding the domain as a whole.
- The desktop-companion heartbeat (from 0.2.6): `background.js` POSTs a heartbeat to `http://127.0.0.1:47552/heartbeat` on load and every 30s, which `desktop/src-tauri/src/heartbeat.rs` listens for and treats as proof the extension is enabled even when its own disk-based check (reading Chromium's `Preferences` file) is lagging behind a fresh (re)enable.
- All the popup/blocked-page/options UI work that shipped alongside the YouTube fix (scrollable 150-char unlock code with a slider + live per-character highlighting and a 60s fix-it grace window instead of an instant reset; "Block this channel" row in the popup; block-creation moved to the website with the popup now just a hand-off).

These two feature sets had diverged into separate builds before this merge (0.2.6 → heartbeat, 0.3.3 → YouTube fix) and are now combined into one.

## Building the zips

`python3 extension/build-zips.py` writes both downloads:

- `downloads/wynko-extension.zip` for "Load unpacked" installs (keeps the pinned `key`, so the ID stays `knofmgookchmjekaefloaljcamjlbnmp`).
- `downloads/wynko-extension-store.zip` for uploading to the Chrome Web Store. It drops `key` (the Store rejects it and assigns its own ID) and the localhost dev-server addresses. The desktop bridge on `127.0.0.1:47552` stays.

Once the Store listing exists, its extension ID has to be added wherever the website and desktop app look for this extension by ID.

## Blocked-attempt counter

The popup shows "Blocked N times this session" with the top sites. The background worker reads Chrome's `declarativeNetRequest.getMatchedRules` (needs `declarativeNetRequestFeedback`) on the sync alarm and when the popup asks, at most once every 35 seconds because Chrome allows 20 calls per 10 minutes and only keeps 5 minutes of matches. The count lives in `chrome.storage.local` (`revm2BlockedAttempts`) and is never sent to the backend.
