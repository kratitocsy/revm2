package com.revm2.app.locking

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.provider.Settings
import org.json.JSONArray

/**
 * Single source of truth for "what's currently being enforced", shared by
 * the accessibility service (app blocklist), the VPN service (domain
 * blocklist), the notification listener, the foreground guard service and
 * the boot receiver. Plain SharedPreferences, like the desktop guards'
 * simple synced list.
 *
 * A timed session carries its own end time (`endsAtMs`) so enforcement
 * expires by itself even if the UI process is dead, and survives reboots.
 */
object BlockStore {
    private const val PREFS = "revm2_locking_state"
    private const val KEY_SESSION_ACTIVE = "session_active"
    private const val KEY_SESSION_ID = "session_id"
    private const val KEY_NO_EARLY_UNLOCK = "no_early_unlock"
    private const val KEY_APPS_MODE = "apps_mode" // "blacklist" | "whitelist"
    private const val KEY_APP_LIST = "app_list"   // JSON array of package names
    private const val KEY_DOMAIN_LIST = "domain_list" // JSON array of domains
    private const val KEY_UNLOCK_PHRASE = "unlock_phrase"
    private const val KEY_ENDS_AT = "ends_at_ms"  // 0 = no time limit
    private const val KEY_LOCK_SETTINGS = "lock_settings"
    private const val KEY_TAMPERED = "tampered"
    private const val KEY_TAMPER_REASON = "tamper_reason"

    /** DNS-over-HTTPS / DNS-over-TLS resolvers. Blocked while a session has a domain list so a browser's
     * "secure DNS" can't route around the local DNS filter. */
    private val DOH_DOMAINS = setOf(
        "dns.google", "dns.google.com", "cloudflare-dns.com", "mozilla.cloudflare-dns.com", "one.one.one.one",
        "dns.quad9.net", "dns.adguard.com", "dns.nextdns.io", "doh.opendns.com", "doh.cleanbrowsing.org",
    )

    /** Package installer UIs that show the uninstall confirmation. Blocked in a locked-settings (strict) session. */
    private val INSTALLER_PACKAGES = setOf(
        "com.android.packageinstaller", "com.google.android.packageinstaller", "com.samsung.android.packageinstaller",
    )

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Session(
        val active: Boolean,
        val sessionId: String?,
        val noEarlyUnlock: Boolean,
        val appsMode: String,
        val appList: Set<String>,
        val domainList: Set<String>,
        val unlockPhrase: String?,
        val endsAtMs: Long = 0L,
        val lockSettings: Boolean = false,
        val tampered: Boolean = false,
        val tamperReason: String? = null,
    ) {
        /** Seconds left, or null for an unlimited session. */
        fun remainingSeconds(nowMs: Long = System.currentTimeMillis()): Long? =
            if (endsAtMs <= 0L) null else ((endsAtMs - nowMs) / 1000).coerceAtLeast(0)
    }

    fun current(ctx: Context): Session {
        val p = prefs(ctx)
        val ends = p.getLong(KEY_ENDS_AT, 0L)
        var active = p.getBoolean(KEY_SESSION_ACTIVE, false)
        if (active && ends > 0L && System.currentTimeMillis() >= ends) {
            // Timed session ran out while nothing was watching: stop enforcing.
            p.edit().putBoolean(KEY_SESSION_ACTIVE, false).apply()
            active = false
        }
        return Session(
            active = active,
            sessionId = p.getString(KEY_SESSION_ID, null),
            noEarlyUnlock = p.getBoolean(KEY_NO_EARLY_UNLOCK, false),
            appsMode = p.getString(KEY_APPS_MODE, "blacklist") ?: "blacklist",
            appList = jsonArrayToSet(p.getString(KEY_APP_LIST, "[]")),
            domainList = jsonArrayToSet(p.getString(KEY_DOMAIN_LIST, "[]")),
            unlockPhrase = p.getString(KEY_UNLOCK_PHRASE, null),
            endsAtMs = ends,
            lockSettings = p.getBoolean(KEY_LOCK_SETTINGS, false),
            tampered = p.getBoolean(KEY_TAMPERED, false),
            tamperReason = p.getString(KEY_TAMPER_REASON, null),
        )
    }

    fun startSession(
        ctx: Context,
        sessionId: String,
        noEarlyUnlock: Boolean,
        appsMode: String,
        appList: List<String>,
        domainList: List<String>,
        unlockPhrase: String?,
        endsAtMs: Long = 0L,
        lockSettings: Boolean = noEarlyUnlock,
    ) {
        prefs(ctx).edit()
            .putBoolean(KEY_SESSION_ACTIVE, true)
            .putString(KEY_SESSION_ID, sessionId)
            .putBoolean(KEY_NO_EARLY_UNLOCK, noEarlyUnlock)
            .putString(KEY_APPS_MODE, appsMode)
            .putString(KEY_APP_LIST, JSONArray(appList).toString())
            .putString(KEY_DOMAIN_LIST, JSONArray(domainList).toString())
            .putString(KEY_UNLOCK_PHRASE, unlockPhrase)
            .putLong(KEY_ENDS_AT, endsAtMs)
            .putBoolean(KEY_LOCK_SETTINGS, lockSettings)
            .putBoolean(KEY_TAMPERED, false)
            .putString(KEY_TAMPER_REASON, null)
            .apply()
    }

    /** Ends enforcement. Mirrors the DB-level `active = false` on focus_lock_sessions. The tamper flag is kept
     * until the app has read it (see [consumeTamper]) so the session can be reported as unverified. */
    fun endSession(ctx: Context) {
        prefs(ctx).edit()
            .putBoolean(KEY_SESSION_ACTIVE, false)
            .putString(KEY_SESSION_ID, null)
            .putLong(KEY_ENDS_AT, 0L)
            .apply()
    }

    /** Records that something undermined enforcement mid-session (service switched off, VPN revoked...). */
    fun markTampered(ctx: Context, reason: String) {
        if (!prefs(ctx).getBoolean(KEY_SESSION_ACTIVE, false)) return
        prefs(ctx).edit().putBoolean(KEY_TAMPERED, true).putString(KEY_TAMPER_REASON, reason).apply()
    }

    /** Returns the tamper reason (if any) and clears it. The app calls this when reconciling a session. */
    fun consumeTamper(ctx: Context): String? {
        val p = prefs(ctx)
        if (!p.getBoolean(KEY_TAMPERED, false)) return null
        val r = p.getString(KEY_TAMPER_REASON, "enforcement interrupted")
        p.edit().putBoolean(KEY_TAMPERED, false).putString(KEY_TAMPER_REASON, null).apply()
        return r
    }

    fun isAppBlocked(ctx: Context, packageName: String): Boolean {
        val s = current(ctx)
        return isAppBlockedForSession(s, packageName, ctx.packageName, launcherPackages(ctx), tamperPackages(ctx))
    }

    fun isDomainBlocked(ctx: Context, domain: String): Boolean =
        isDomainBlockedForSession(current(ctx), domain)

    /**
     * Pure decision logic (no Context) so it can be unit tested directly.
     *
     * [additionalExcluded] are never blocked (our own app, the launcher) so a bad list can't brick navigation.
     * [tamperPackages] (Settings, the package installer) are blocked in a locked-settings session: they are
     * where a user would switch off accessibility, deactivate device admin or uninstall the app.
     */
    fun isAppBlockedForSession(
        s: Session,
        packageName: String,
        selfPackageName: String,
        additionalExcluded: Set<String> = emptySet(),
        tamperPackages: Set<String> = emptySet(),
    ): Boolean {
        if (!s.active) return false
        if (packageName == selfPackageName) return false
        if (packageName in additionalExcluded) return false
        if (s.lockSettings && packageName in tamperPackages) return true
        // Settings stays reachable in a normal session (Wi-Fi, volume, emergencies) - only the locked mode closes it.
        return when (s.appsMode) {
            "whitelist" -> packageName !in s.appList && packageName !in tamperPackages
            else -> packageName in s.appList
        }
    }

    fun isDomainBlockedForSession(s: Session, domain: String): Boolean {
        if (!s.active) return false
        val d = domain.lowercase().removeSuffix(".")
        if (s.domainList.isNotEmpty() && DOH_DOMAINS.any { d == it || d.endsWith(".$it") }) return true
        return s.domainList.any { d == it || d.endsWith(".$it") }
    }

    /** Packages that must never be blocked: our own app's launcher, the system UI (shade, nav), the on-screen
     * keyboard and the dialer. Resolved at call time because OEMs differ. */
    private fun launcherPackages(ctx: Context): Set<String> {
        val out = mutableSetOf("com.android.systemui")
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        ctx.packageManager.resolveActivity(home, 0)?.activityInfo?.packageName?.let { out.add(it) }
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            ?.substringBefore('/')?.takeIf { it.isNotBlank() }?.let { out.add(it) }
        try {
            ctx.getSystemService(android.telecom.TelecomManager::class.java)?.defaultDialerPackage?.let { out.add(it) }
        } catch (e: SecurityException) { /* no permission to read it; skip */ }
        return out
    }

    /** Settings + package installer packages for locked-settings sessions. */
    private fun tamperPackages(ctx: Context): Set<String> {
        val settings = ctx.packageManager.resolveActivity(Intent(Settings.ACTION_SETTINGS), 0)?.activityInfo?.packageName
        return INSTALLER_PACKAGES + setOfNotNull(settings)
    }

    private fun jsonArrayToSet(raw: String?): Set<String> {
        if (raw.isNullOrBlank()) return emptySet()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.getString(it) }.toSet()
        } catch (e: Exception) {
            emptySet()
        }
    }
}
