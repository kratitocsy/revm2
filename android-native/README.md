# RevM2 native Android app

Native Android app (the old Capacitor shell in `mobile/` has been removed). Kotlin + Jetpack Compose, same Supabase backend as the web app. Android only.

## Status
- Phase 1 skeleton + the **Claude Design "Wynko Mobile" UI** in Compose: Plus Jakarta Sans theme, 5-tab bar with the raised Focus button, side drawer, mini player, bottom sheets, and all 10 modules (Home, Focus Lock, Study Rooms, Room, Communities + student/manage views, Profile, Battleground, WYNKOINS, Settings, Schedules, Earn, Quick Timer).
- **Wired to Supabase** (`data/`, same tables/RPCs/edge functions as the web app, so one account stays in sync across web, desktop and phone): profile, settings, preferences, sign out, delete account, wallet, coin packs + Razorpay checkout (create/verify edge functions), shop redemptions, study plan tasks + running state (`study_plans`), focus-timer study sessions (`rpc_start_study_session` / `rpc_stop_study_session_logged`), Quick Timer time (`rpc_log_study_time`), Home's 7-day chart and streak (`study_log`), notifications, Battleground, Study Rooms (list/join/create/leave, members, chat), Communities (mine, discover, invite codes, home, announcements, schedule accept/reject, head overview/analytics/join requests), routines (= `focus_lock_presets`), and Wynky (shared chat history, the `chat` mode of `ai-generate-schedule`, memory and agreed settings; plans are saved as `Wynky Plan - <day>` schedules via `data/PlanWriter.kt`, a port of the web's ensurePresets/writeSchedule/communityEnforce).
- Updates from other devices are polled (plan/tasks every 30 s, notifications and progress every 60 s, an open room every 10 s), not Realtime.
- Not on mobile yet: Wynky's guided set-up steps (per-subject allow-lists, app/channel picking: done on web/desktop and reused here), community schedule editing and publishing, earnings/payouts, voice calls in rooms. Razorpay for digital goods may conflict with Google Play billing rules.
- Real behaviour already hooked up: the Focus timer (Pomodoro/Regular, 150-word pause gate), live Focus sessions start the on-device blocking in `locking/` (accessibility overlay + VPN DNS), the permission checklist on Focus Lock, and the previous presets/sessions screen (`ui/blocks`, reachable via Focus Lock → Manage).
- Auth: email/password sign-in via Supabase gates the app (`ui/auth/AuthGate.kt`); the profile screen shows sample data for now.

- Blocking is at the Play Store ceiling (see the Oct 2026 addendum in `docs/revm2-locking-research.md`): foreground guard service, boot resume, strict mode, notification blocking, DoH hardening, tamper reporting, usage stats, prominent permission disclosures. Reels & Shorts blocking for Instagram and YouTube (off / in sessions / always; hints in `locking/ShortFormHints.kt`, best-effort until verified on a device). Schedules follow the desktop rules (see the Oct 2026 addendum in the locking doc). Unit tests: `BlockLogicTest`, `ShortFormHintsTest`, `ScheduleGateTest`.

**Not compiled or run yet** (no Android SDK where this was written). Open `android-native/` in Android Studio, sync, and fix any compile errors first.

## Build
`./gradlew :app:assembleDebug` (needs the Android SDK). Optional: `-PappVersionCode`, `-PappVersionName`, `-PsupabaseUrl`, `-PsupabaseAnon`.

## Next phases
2. (remaining) Onboarding quiz, home, focus-lock schedules/slots, study timer
3. Communities, chat, battles, wallet/Razorpay, shop
4. Wynky AI chat, notifications, widgets
