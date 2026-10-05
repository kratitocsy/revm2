package com.revm2.app.locking

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.provider.Settings
import android.text.TextUtils

data class LockPermissions(
    val accessibility: Boolean,
    val overlay: Boolean,
    val vpn: Boolean,
    val deviceAdmin: Boolean,
    val notificationAccess: Boolean = false,
    val usageAccess: Boolean = false,
    val batteryUnrestricted: Boolean = false,
    val postNotifications: Boolean = true,
) {
    /** The four permissions blocking itself needs. */
    val allGranted get() = accessibility && overlay && vpn && deviceAdmin
    /** Extras that make enforcement harder to bypass or kill. */
    val allHardening get() = notificationAccess && batteryUnrestricted && postNotifications
}

data class InstalledApp(val packageName: String, val label: String)

/**
 * Direct (no JS bridge) entry point to Tier 2+3 locking. Replaces the
 * Capacitor RevM2LockingPlugin; same behavior, called from Compose screens.
 */
object LockingController {

    fun listInstalledApps(ctx: Context): List<InstalledApp> {
        val pm = ctx.packageManager
        val launchable = pm.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0
        )
        val seen = HashSet<String>()
        return launchable.mapNotNull { info ->
            val pkg = info.activityInfo.packageName
            if (pkg == ctx.packageName || !seen.add(pkg)) null
            else InstalledApp(pkg, info.loadLabel(pm).toString())
        }.sortedBy { it.label.lowercase() }
    }

    fun permissions(ctx: Context): LockPermissions {
        val dpm = ctx.getSystemService(DevicePolicyManager::class.java)
        return LockPermissions(
            accessibility = isAccessibilityServiceEnabled(ctx),
            overlay = Settings.canDrawOverlays(ctx),
            vpn = VpnService.prepare(ctx) == null,
            deviceAdmin = dpm?.isAdminActive(adminComponent(ctx)) == true,
            notificationAccess = isNotificationListenerEnabled(ctx),
            usageAccess = UsageStats.hasAccess(ctx),
            batteryUnrestricted = ctx.getSystemService(android.os.PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true,
            postNotifications = android.os.Build.VERSION.SDK_INT < 33 ||
                ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED,
        )
    }

    // Each request opens the relevant system screen; none can be granted silently.

    fun requestAccessibility(ctx: Context) =
        ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    fun requestOverlay(ctx: Context) =
        ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.packageName))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )

    fun requestNotificationAccess(ctx: Context) =
        ctx.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    fun requestUsageAccess(ctx: Context) =
        ctx.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    /** Opens the battery-optimisation list (no restricted permission needed) so the user can set Wynko to "Unrestricted". */
    fun requestBatteryUnrestricted(ctx: Context) =
        ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    /** Intent for the one-tap VPN consent dialog, or null if already granted. Launch with an ActivityResult launcher. */
    fun vpnConsentIntent(ctx: Context): Intent? = VpnService.prepare(ctx)

    fun requestDeviceAdmin(ctx: Context) {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent(ctx))
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Lets RevM2 require deactivating admin here before the app can " +
                    "be uninstalled — this is what makes leaving mid-session a " +
                    "deliberate extra step instead of one tap. Revocable anytime " +
                    "from Settings."
            )
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }

    fun startSession(
        ctx: Context,
        sessionId: String,
        apps: List<String>,
        domains: List<String>,
        appsMode: String = "blacklist",
        noEarlyUnlock: Boolean = false,
        unlockPhrase: String? = null,
        endsAtMs: Long = 0L,
        lockSettings: Boolean = noEarlyUnlock,
    ) {
        BlockStore.startSession(
            ctx = ctx,
            sessionId = sessionId,
            noEarlyUnlock = noEarlyUnlock,
            appsMode = appsMode,
            appList = apps,
            domainList = domains,
            unlockPhrase = unlockPhrase,
            endsAtMs = endsAtMs,
            lockSettings = lockSettings,
        )
        // Foreground guard: keeps enforcement alive, ends a timed session on schedule, reopens the tunnel after a reboot.
        GuardService.start(ctx)
        // Only start the tunnel if consent was already granted; never prompt mid-session.
        if (VpnService.prepare(ctx) == null) {
            ctx.startService(Intent(ctx, RevM2VpnService::class.java).setAction(RevM2VpnService.ACTION_START))
        }
    }

    /** Returns false (and keeps the session) if a strict session's unlock phrase doesn't match. */
    fun endSession(ctx: Context, enteredPhrase: String? = null): Boolean {
        val s = BlockStore.current(ctx)
        if (s.noEarlyUnlock && s.unlockPhrase != null && !TextUtils.equals(enteredPhrase, s.unlockPhrase)) {
            return false
        }
        BlockStore.endSession(ctx)
        GuardService.stop(ctx)
        ctx.stopService(Intent(ctx, RevM2VpnService::class.java))
        return true
    }

    fun sessionState(ctx: Context) = BlockStore.current(ctx)

    // ── Reels & Shorts blocking ──
    fun shortFormMode(ctx: Context) = BlockStore.shortFormMode(ctx)
    fun setShortFormMode(ctx: Context, mode: Int) = BlockStore.setShortFormMode(ctx, mode)
    fun shortFormPlatformOn(ctx: Context, platform: String) = BlockStore.shortFormPlatformOn(ctx, platform)
    fun setShortFormPlatform(ctx: Context, platform: String, on: Boolean) = BlockStore.setShortFormPlatform(ctx, platform, on)
    fun shortFormBlockedToday(ctx: Context) = BlockStore.shortFormBlockedToday(ctx)

    /** Why enforcement was interrupted during the last session (accessibility/VPN/admin turned off), if it was. Clears it. */
    fun consumeTamper(ctx: Context): String? = BlockStore.consumeTamper(ctx)

    private fun isNotificationListenerEnabled(ctx: Context): Boolean =
        androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)

    private fun adminComponent(ctx: Context) = ComponentName(ctx, RevM2DeviceAdminReceiver::class.java)

    private fun isAccessibilityServiceEnabled(ctx: Context): Boolean {
        val expected = ctx.packageName + "/" + RevM2AccessibilityService::class.java.name
        val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        return enabled.split(":").any { it.equals(expected, ignoreCase = true) }
    }
}
