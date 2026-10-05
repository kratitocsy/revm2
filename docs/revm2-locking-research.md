# RevM2 Cross-Platform Locking Research (Android + macOS)

Status: **Research only — not started on either platform.** Revisit after
desktop (Windows) work is done. Android is the priority when we return to
this; macOS is further deprioritized (see its section below).
Saved: Aug 2026.

## Android

## TL;DR

Android CANNOT match the desktop blocker's strength. Desktop kills processes
and blocks Task Manager directly (near-total control). Android sandboxing
makes that structurally impossible — no permission model on Android lets one
app kill or fully lock another. Realistic ceiling: **parity with Opal /
AppBlock / Forest**, not parity with our own desktop build. This is the
same ceiling every competitor hits, confirmed by their own docs (see
"Competitor benchmark" below) — not a shortfall of our engineering.

## Desktop today (what we're trying to approximate, not replicate)

Source: `desktop/src-tauri/src/`
- `app_guard.rs` — kills blacklisted native app processes via `sysinfo` crate, polling.
- `browser_guard.rs` / `gate_guard.rs` — coordinates with the browser extension to block sites.
- `taskmgr_guard.rs` / `taskmgr_backstop.rs` — blocks Task Manager so the guard process can't be killed by the user.

None of this ports to Android as-is. Needs a different mechanism, not a translation.

## Android capability table

| Capability | Desktop | Android ceiling | Mechanism | Permission needed |
|---|---|---|---|---|
| Block a distracting app | Kill the process | Full-screen overlay when app detected in foreground (app keeps running underneath) | `AccessibilityService` (Android 14+ per Opal's own Play listing) or `UsageStatsManager` polling + `SYSTEM_ALERT_WINDOW` overlay | Accessibility / Usage Access + Overlay — all manual grants in Settings |
| Block a website | Browser-extension-level block | Local on-device VPN blackholing DNS/domains for blocked sites | `VpnService` API, loopback only, no real remote server | VPN permission (one-tap system dialog, not Restricted-Settings-gated) |
| Prevent circumventing the block | Blocks Task Manager entirely | **Partial** — Device Admin permission can prevent app uninstall during an active session (confirmed: AppBlock calls this "Strict Mode") | `DevicePolicyManager` (Device Admin, NOT full enterprise Device Owner/MDM) | Device Admin grant, revocable by user outside a session |
| Getting the permissions in the first place | Just run the installer | Multi-tap Settings flow, worse on Samsung | — | See Restricted Settings below |

## Platform friction that erodes reliability even after permissions are granted

1. **Restricted Settings (Android 13+, tightened in 15).** Apps installed
   from anywhere other than an app-store's purpose-built install API
   (i.e. sideloaded APKs from browsers/file managers/messaging apps) are
   blocked by default from being granted Accessibility, Usage Access,
   Overlay, or Device Admin. User must manually "allow restricted settings"
   per app, worse on Samsung (extra identity-verification step).
   **Distribute via Play Store, not raw APK, to avoid stacking this on
   top of everything else.**
2. **Google is tightening sideloading further.** Reports of a broader
   unverified-sideloading restriction rolling out industry-wide later in
   2026 — direction of travel is more restriction, not less. Re-check
   before building.
3. **OEM battery managers silently kill the background service.**
   Samsung/Xiaomi/OnePlus kill background processes to save battery unless
   the user manually whitelists the app — the "don't kill my app" problem.
   Blocker can silently stop working with zero user action.
4. **VPN conflicts.** Only one VPN active system-wide. If the user already
   runs a real VPN, our local blocking VPN can't coexist.

## Competitor benchmark (checked their own docs/listings, 2026)

- **Opal** (Play Store listing): uses `AccessibilityService` API on Android
  14+ to manage the block list. Uses a local VPN system for site blocking,
  explicitly states no private browsing data leaves the device.
  Android and iOS/Mac are different codebases — Android trails iOS in
  feature parity per their own FAQ.
- **AppBlock** (help docs): documents the full permission set — Usage
  Access, Overlay, Notification Access (for notification blocking +
  keeping the background service alive), Device Admin (uninstall
  prevention = "Strict Mode"), Location (geofence/WiFi-based blocking).
- **Independent review of Opal (2026):** explicit admission that no
  screen-time app can fully take control from the user — it's still their
  phone, they can always change a setting, end a session, or delete the
  app. Stated as true of every app in the category, not just Opal.

## Revised target feature set for RevM2 Android (matches category leader tier)

- Accessibility-based foreground app detection + overlay block
- Local `VpnService` for website blocking
- Device Admin for uninstall-resistance during an active session
  (revocable outside a session — be upfront about this in-app)
- Usage Access for reporting/limits, reused for stats parity with desktop
- Friction dial for breaks, matching Opal's "easy / harder to skip" pattern,
  rather than claiming an unbreakable lock

## Build path (when we get to it)

> **Update (Oct 2026):** superseded. The Android app is fully native (`android-native/`, Kotlin + Compose) and the Capacitor shell was removed. The Capacitor steps below are kept for history only.


1. **Capacitor**, not a bare PWA/TWA wrapper — wraps existing web frontend
   (`groups.html`, `materials.js`, `materials-viewer.js`, etc.) completely
   unchanged. Native Kotlin plugin added on top for the blocking logic,
   exposed to JS the same way Tauri's `invoke()` works on desktop.
2. Supabase schema needs **zero changes** —
   `focus_lock_sessions` / `focus_lock_schedules` / presets with
   `apps_mode` (blacklist/whitelist) are already platform-agnostic rows,
   shared across desktop, web, and future Android.
3. Play Store submission needs an explicit Accessibility-usage
   declaration + in-app disclosure (standard for this app category,
   generally approved when the listing matches the permission use — not
   a red flag by itself, but a real review step to budget time for).
4. Distribute via Play Store internal testing track even during
   development, to sidestep Restricted Settings friction from day one
   rather than fighting it while iterating.

## macOS — deprioritized (low expected usage among target users — Indian students, Mac ownership is low)

Revisit only if actual demand shows up. Full analysis below, done but shelved.

**Distribution:** direct notarized DMG, not the Mac App Store — App Sandbox
is mandatory for Store distribution and categorically forbids the
process-killing behavior our guards rely on (no `runFullTrust`-style
escape hatch like Windows MSIX has). Mac App Store would need a
fundamentally different, Screen-Time-API-based build — separate,
open-ended effort gated on Apple approving that restricted entitlement.

**Guard-by-guard status:**
- `app_guard.rs` — already cross-platform (`sysinfo`), works on macOS as-is.
- `browser_guard.rs` — cross-platform except `request_graceful_close`,
  which shells out to Windows' `taskkill`; needs a `SIGTERM`/`kill` branch.
- `taskmgr_backstop.rs` — currently a no-op on macOS; port `schtasks` to
  `launchd` (`.plist` in `~/Library/LaunchAgents`).
- `gate_guard.rs` (screen-capture protection for the reader) — currently a
  no-op on macOS; needs real `NSWindow.sharingType = .none` via
  `objc2`/`cocoa` crate bridging. Biggest unknown/highest-risk item.
- `taskmgr_guard.rs` (Windows Task Manager disable) — **no macOS
  equivalent exists.** Replace with a `launchd` watchdog that respawns the
  guard process within seconds if force-quit via Activity Monitor, resuming
  session state from Supabase (`focus_lock_sessions`). Deterrent/friction,
  not a hard block — same honesty framing as every other platform gap in
  this doc.

**No local Mac available — build/test logistics:**
- Can't cross-compile/sign/notarize from Windows; macOS itself is required
  for that step.
- **GitHub Actions macOS runners** (Tauri has an official GitHub Action for
  build+sign+notarize) handle everything except the one piece requiring a
  human eyeball — screen-capture protection has to be visually verified on
  a real screen, can't be confirmed headlessly in CI.
- For that one piece: rent time on **MacinCloud** or similar (pay-by-hour
  remote Mac access) — a few hours, not days, once the code itself is
  written and compiling cleanly via CI.
- Cheapest long-term option if this becomes ongoing: a used Mac mini (M1),
  removes rental time-pressure entirely.

**Time estimate (single dev, direct-DMG path, no App Store):**
Roughly 8–14 working days assuming a local Mac. Add ~1 day of logistics
overhead for CI signing setup + rental-session scheduling given no local
Mac. Cutting the `gate_guard.rs` Cocoa work (ship without capture
protection initially, JS blur/visibility fallback only) saves 2–4 days.

**Trigger to revisit:** meaningful share of actual users on macOS, or a
paying/institutional customer specifically requesting it.

## Decision (locked in)

We're committing to the full technical ceiling described above — Accessibility
+ overlay, local VPN, Device Admin, Usage Access — not a lighter-weight
version. Framed honestly to users as "the strongest blocking Android allows,"
not as parity with desktop. Revisit this file when desktop work is done.

## Open questions to resolve when we start this

- Which exact permission set to request up front vs. progressively
  (all-at-once during onboarding vs. only when a feature is first used)?
- Device Admin UX: how to explain "uninstall-blocked during session" so it
  doesn't read as sketchy/malware-like to users or reviewers.
- Whether to reuse Opal's "Breaks Allowed: easy / harder" pattern verbatim
  or design our own friction curve tied to `focus_lock_presets`.
- Confirm current sideloading-restriction rollout status before building
  (this area moves fast; re-search closer to build time).

---

## Addendum (Aug 2026): Device Owner ceiling, default-vs-opt-in decision, Capacitor UI approach

This section adds detail beyond the "Device Admin" row above — specifically
the harder ceiling above it (**Device Owner**, not Device Admin), and locks
in how it fits the product.

### Device Admin vs Device Owner — these are different things

The "Prevent circumventing the block" row above refers to **Device Admin**,
a lightweight, revocable-anytime permission. **Device Owner** is a
categorically stronger mode and deserves its own entry:

- Only claimable on a device with **no Google account signed in** —
  practically requires a factory reset (or a never-used device) before
  setup, via QR/NFC provisioning during Android's initial setup wizard, or
  `adb shell dpm set-device-owner` over a debug connection on a clean device.
- Once granted, unlocks `setPackagesSuspended()` (other apps greyed out,
  unlaunchable), `setLockTaskPackages()` (true kiosk pinning — Home/Recents
  disabled, only our app runs), and the ability to restrict access to the
  Settings app itself (including hiding the Accessibility/Uninstall
  sub-screens that a user would otherwise use to escape).
- **Cannot be triggered from inside our app.** No API lets an app silently
  self-elevate to Device Owner — it only works through Android's own
  device-setup flow on a device that isn't already in normal use. This is
  intentional on Google's part: it's the same mechanism that (mis-used)
  enables stalkerware, so Google deliberately gates it behind a flow a
  device's actual owner has to walk through knowingly.
- Exiting Device Owner mode later also requires another factory reset —
  the cost is symmetric on the way in and the way out.
- Not a Play Store policy fit for a consumer app used as installed — this
  category of API is scoped for enterprise/education device management
  (company fleets, school-issued tablets), not a personal study app
  self-provisioning a user's own phone. Relevant to the "opt-in, own risk"
  framing below, not to whether it's technically real (it is).

### Decision: Tier 2+3 (Accessibility + Overlay + VPN) is the default for
### every user; Device Owner is opt-in only, never gated behind session-start

- Default experience for all RevM2 Android users = the "Revised target
  feature set" already listed above (Accessibility overlay block + VPN site
  blocking + Device Admin uninstall-resistance + Usage Access stats). This
  needs no special disclosure beyond the standard in-app permission asks.
- Device Owner is offered as a **separate, clearly-labeled "Advanced Lock"
  path**, not a toggle inside a normal session flow, because it physically
  can't be — it has to route the user out to Android's own setup wizard on
  a freshly wiped/clean device.
- Framing to users must be concrete, not a generic risk waiver: "requires a
  full factory reset to enable, and another factory reset to undo; gives
  RevM2 administrative control over the device including restricting
  Settings and other apps." Position it for a **spare/study-only device**,
  not a user's daily phone — most serious aspirants who'd want this already
  have an old phone lying around, which sidesteps most of the real
  downside of the opt-in.

### UI approach: Capacitor, but genuinely mobile-native — not a website mirror

Confirmed direction for the app shell itself (separate from the blocking
plugin): don't just responsively shrink the desktop/web layout. Capacitor
gives full control over what actually gets rendered, so build a real mobile
shell:

- `Capacitor.getPlatform()` / `isNativePlatform()` in `shared.js` to swap
  desktop's sidebar nav for a bottom tab bar (Tracker / Groups / Timer /
  Leaderboard / Profile) when running as the Android app specifically.
- Native-feeling chrome via small Capacitor plugins: `@capacitor/status-bar`
  (match app theme), `@capacitor/splash-screen`, `@capacitor/haptics` (tap
  feedback), `@capacitor/keyboard` (proper keyboard push behavior for chat
  input).
- Touch-first redesigns of specific components that currently assume
  hover/cursor input — presence grid, group sidebar icons, leaderboard
  podium — swap hover-to-reveal for tap/swipe patterns, bottom sheets
  instead of dropdown modals, `env(safe-area-inset-*)` throughout.
- Underlying page logic (tracker, groups data, materials viewer, Supabase
  realtime wiring) stays fully shared with web/desktop — only the
  navigation shell and touch-interaction layer are mobile-specific.

### Rough time estimate (solo dev, around school)

| Phase | Days |
|---|---|
| Capacitor wrapper setup (existing `www/`, build + run on device) | 1–2 |
| Mobile-native UI shell (bottom nav, touch redesigns, not just resizing) | 3–5 |
| Accessibility Service + overlay block + Capacitor plugin bridge | 3–4 |
| VpnService site blocking | 2–3 |
| Permission-gating + friction/commitment layer (unlock-phrase pause, disable-triggers-cooldown, group visibility on broken sessions) | 2 |
| Cross-device testing, OEM battery-optimization edge cases | 3–5 |
| **Total** | **~17–26 working days (~5–7 calendar weeks solo)** |

Fastest path to something real: Phases 1–2 alone (wrapper + mobile-native
shell, no blocking yet) is a shippable v1 APK in under a week — Tier 2+3
blocking can follow as a v1.1 once the base app is stable on real devices.

---

## Addendum (Oct 2026): native Android app - Play-compliant ceiling, as built

The native app (`android-native/`) implements the strongest blocking that fits Google Play. Device Owner (Tier 4)
stays out of the Play build (see the Advanced Lock APK download on the website).

| Capability | How | Play notes |
|---|---|---|
| App block | Accessibility service reads only the foreground package, shows an overlay then sends the user Home | Prominent in-app disclosure before the Settings hand-off; `isAccessibilityTool="false"`; no window content read |
| Site block | Local VPN, DNS-only, NXDOMAIN for blocked domains; DoH/DoT resolver domains blocked so secure DNS can't bypass it | Disclosure; no remote server |
| Reels & Shorts block | Same accessibility service, `canRetrieveWindowContent` on, but content events are only subscribed while Instagram or YouTube is in front **and** the feature is on. It looks up specific view ids (`ShortFormHints.kt`) and presses Back (Home if it keeps returning). Modes: off / in sessions / always | Separate consent dialog; the Accessibility disclosure mentions it; Permission Declaration Form must say it reads only the Reels/Shorts markers. View ids are internal to those apps and drift with updates - keep the list current |
| Notification block | `NotificationListenerService` cancels notifications from blocked apps | Disclosure; reads only the posting package |
| Stay alive | Foreground `GuardService` (specialUse) with ongoing notification; battery "Unrestricted" prompt (no restricted permission); `BootReceiver` resumes a running session after reboot | `FOREGROUND_SERVICE_SPECIAL_USE` declaration needed in Play Console |
| Tamper resistance | Device Admin (uninstall needs an extra step); **strict mode** also blocks the Settings app and package installer for the session | Strict mode is opt-in; timed sessions end by themselves so it cannot trap a user |
| Tamper reporting | Accessibility off / VPN revoked / admin deactivated mid-session marks the session unverified | |
| Stats | Usage Access screen time | |
| App picker | `<queries>` for launchable apps instead of `QUERY_ALL_PACKAGES` | Avoids a restricted permission |

Still outside the Play ceiling: killing apps, kiosk pinning and locking Settings against the user outside a session.

### Schedules on the phone (Oct 2026)

The native app follows the desktop's schedule rules (`schedule/ScheduleGate.kt` is a port of
`src/apps/desktop-dashboard/lib/scheduleWindow.ts`):

- Schedules, slots and the preset each slot enforces are read from the same Supabase tables as desktop and `schedule-tick`, and cached on the phone.
- India-time clock, alternate-week parity, midnight-crossing blocks.
- On a day a schedule runs the focus timer only starts inside one of its blocks.
- Inside a block: 2 free 20-minute pauses per schedule per day, then the 150-character reflection (spaces don't count).
- Pausing/removing a schedule needs the 500-character typed code.
- On-device enforcement (`ScheduleEnforcer` + exact alarms + boot re-arm) mirrors `schedule-tick`: starts the slot's saved block once per slot per day, schedule wins over a running block, Sleep slots block everything (allow-only, empty list, locked), ending a block early does not relock that slot, the block ends with the slot. It never writes to the database, so it agrees with the server tick instead of racing it.
- Not ported yet: creating/editing schedules (desktop/web only, behind the 500/250-character gates), study-timer auto-start from a slot's subject, schedule overrides.
