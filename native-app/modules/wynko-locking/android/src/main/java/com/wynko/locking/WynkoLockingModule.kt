package com.wynko.locking

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Expo Modules port of mobile/android/.../RevM2LockingPlugin.kt.
 *
 * Same method names and return shapes as the Capacitor plugin, so the
 * session logic that drives it (focus_lock_sessions / focus_lock_schedules
 * in Supabase) can move over unchanged. BlockStore and the three services
 * next to this file are copies of the Capacitor app's versions with only
 * the package and user-facing name changed.
 */
class WynkoLockingModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val adminComponent: ComponentName
    get() = ComponentName(context, WynkoDeviceAdminReceiver::class.java)

  override fun definition() = ModuleDefinition {
    Name("WynkoLocking")

    // ── Installed-apps picker (Tier 2 app-blocking) ──────────────────
    AsyncFunction("listInstalledApps") {
      val pm = context.packageManager
      val launchable = pm.queryIntentActivities(
        Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0
      )
      val seen = HashSet<String>()
      val apps = mutableListOf<Map<String, String>>()
      for (info in launchable) {
        val pkg = info.activityInfo.packageName
        if (pkg == context.packageName) continue // never let Wynko block itself
        if (!seen.add(pkg)) continue
        apps.add(mapOf("packageName" to pkg, "label" to info.loadLabel(pm).toString()))
      }
      mapOf("apps" to apps)
    }

    // ── Permission checks ──────────────────────────────────────────
    AsyncFunction("checkLockPermissions") {
      val dpm = context.getSystemService(DevicePolicyManager::class.java)
      mapOf(
        "accessibility" to isAccessibilityServiceEnabled(),
        "overlay" to Settings.canDrawOverlays(context),
        "vpn" to (VpnService.prepare(context) == null), // null = already granted
        "deviceAdmin" to (dpm?.isAdminActive(adminComponent) == true)
      )
    }

    // ── Permission requests (each opens the relevant system screen) ──
    AsyncFunction("requestAccessibility") {
      startSettings(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    AsyncFunction("requestOverlay") {
      startSettings(
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          android.net.Uri.parse("package:" + context.packageName)
        )
      )
    }

    AsyncFunction("requestVpn") {
      val prepareIntent = VpnService.prepare(context)
      if (prepareIntent != null) {
        // Must go through the current Activity to get the one-tap
        // system VPN consent dialog.
        appContext.throwingActivity.startActivityForResult(prepareIntent, VPN_REQUEST_CODE)
      }
    }

    AsyncFunction("requestDeviceAdmin") {
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
      intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
      intent.putExtra(
        DevicePolicyManager.EXTRA_ADD_EXPLANATION,
        "Lets Wynko require deactivating admin here before the app can " +
          "be uninstalled, so leaving mid-session is a deliberate extra " +
          "step instead of one tap. Revocable anytime from Settings."
      )
      startSettings(intent)
    }

    // ── Block list + session control ───────────────────────────────
    AsyncFunction("setBlockListAndStart") { options: StartOptions ->
      BlockStore.startSession(
        ctx = context,
        sessionId = options.sessionId,
        noEarlyUnlock = options.noEarlyUnlock,
        appsMode = options.appsMode,
        appList = options.apps,
        domainList = options.domains,
        unlockPhrase = options.unlockPhrase
      )

      // Start the VPN tunnel for domain blocking only if it's already
      // been granted; we never prompt mid-session.
      if (VpnService.prepare(context) == null) {
        val vpnIntent = Intent(context, WynkoVpnService::class.java)
        vpnIntent.action = WynkoVpnService.ACTION_START
        context.startService(vpnIntent)
      }
    }

    AsyncFunction("endSession") { unlockPhrase: String? ->
      val session = BlockStore.current(context)
      if (session.noEarlyUnlock && session.unlockPhrase != null &&
        !TextUtils.equals(unlockPhrase, session.unlockPhrase)
      ) {
        throw CodedException("ERR_UNLOCK_PHRASE", "unlock phrase did not match", null)
      }

      BlockStore.endSession(context)
      val vpnIntent = Intent(context, WynkoVpnService::class.java)
      vpnIntent.action = WynkoVpnService.ACTION_STOP
      context.startService(vpnIntent)
    }

    AsyncFunction("getSessionState") {
      val s = BlockStore.current(context)
      mapOf(
        "active" to s.active,
        "sessionId" to s.sessionId,
        "noEarlyUnlock" to s.noEarlyUnlock
      )
    }
  }

  private fun startSettings(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  private fun isAccessibilityServiceEnabled(): Boolean {
    val expected = context.packageName + "/" + WynkoAccessibilityService::class.java.name
    val enabledServices = Settings.Secure.getString(
      context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabledServices.split(":").any { it.equals(expected, ignoreCase = true) }
  }

  companion object {
    const val VPN_REQUEST_CODE = 8842
  }
}

class StartOptions : Record {
  @Field val sessionId: String = ""
  @Field val noEarlyUnlock: Boolean = false
  @Field val appsMode: String = "blacklist"
  @Field val unlockPhrase: String? = null
  @Field val apps: List<String> = emptyList()
  @Field val domains: List<String> = emptyList()
}
