# RevM2 native Android app

Full native replacement for the Capacitor shell in `../mobile/`. Kotlin + Jetpack Compose, same Supabase backend as the web app. Android only.

## Status: phase 1 (skeleton)
- Compose project, Wynko theme (`ui/theme`, tokens from `src/styles/colors.css`)
- Supabase auth (email/password) with persisted session, bottom-tab navigation
- Tier 2+3 locking code copied verbatim from `mobile/` (`locking/`), called directly through `LockingController` instead of the Capacitor plugin bridge
- Blocks tab: the four lock permissions plus a start/stop test session
- Home / Study / Community / Profile are placeholders (see TODO comments for the web code to port)

Not yet built or run: no Android SDK was available when this was scaffolded. Open `android-native/` in Android Studio and sync first.

## Build
`./gradlew :app:assembleDebug` (needs the Android SDK). Optional: `-PappVersionCode`, `-PappVersionName`, `-PsupabaseUrl`, `-PsupabaseAnon`.

## Next phases
2. Onboarding quiz, home, focus-lock schedules/presets/slots, study timer
3. Communities, chat, battles, wallet/Razorpay, shop
4. Wynky AI chat, notifications, widgets

Both apps share `applicationId com.revm2.app`, so they can't be installed side by side; remove `mobile/` once this reaches parity.
