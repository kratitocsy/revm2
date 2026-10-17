package com.wynko.app.ui.web

import android.content.Context
import android.webkit.JavascriptInterface
import com.wynko.app.data.Supabase
import com.wynko.app.locking.LockingController
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/** Supabase JS keeps the session in localStorage under this key for the project in BuildConfig.SUPABASE_URL. */
private const val SB_KEY = "sb-dhzjtjekbvxxsauzhadl-auth-token"

/**
 * What the web app (the same dashboard desktop runs) can ask the phone to do. The pages already speak
 * the Capacitor dialect (`Capacitor.Plugins.RevM2Locking.*`, see blocks.html and useFocusSession.ts),
 * so [SHIM] defines a tiny `window.Capacitor` whose calls land here and drive [LockingController].
 */
class WynkoBridge(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val eval: (String) -> Unit,
    private val isTrusted: () -> Boolean,
    private val requestVpn: () -> Unit,
    private val signOutNative: () -> Unit,
) {
    @JavascriptInterface
    fun call(id: Int, method: String, argsJson: String) {
        if (!isTrusted()) { settle(id, false, JsonPrimitive("untrusted origin")); return }
        scope.launch {
            try {
                val args = runCatching { Json.parseToJsonElement(argsJson).jsonObject }.getOrDefault(JsonObject(emptyMap()))
                settle(id, true, handle(method, args))
            } catch (e: Exception) {
                settle(id, false, JsonPrimitive(e.message ?: "native error"))
            }
        }
    }

    /** The page refreshed or changed its Supabase session; keep the native client on the same tokens. */
    @JavascriptInterface
    fun onSession(json: String) {
        if (!isTrusted()) return
        scope.launch {
            runCatching {
                val o = Json.parseToJsonElement(json).jsonObject
                val access = o["access_token"]?.jsonPrimitive?.content ?: return@launch
                val refresh = o["refresh_token"]?.jsonPrimitive?.content ?: return@launch
                val auth = Supabase.client.auth
                if (auth.currentSessionOrNull()?.refreshToken == refresh) return@launch
                // The page owns refreshing; two clients refreshing one rotating token would sign both out.
                auth.importAuthToken(access, refresh, retrieveUser = false, autoRefresh = false)
            }
        }
    }

    /** The page removed its session (it signed out, or its tokens were revoked). */
    @JavascriptInterface
    fun onSignedOut() {
        if (!isTrusted()) return
        scope.launch { signOutNative() }
    }

    private suspend fun handle(method: String, a: JsonObject): JsonElement = when (method) {
        "checkLockPermissions" -> {
            val p = LockingController.permissions(ctx)
            buildJsonObject {
                put("accessibility", p.accessibility); put("overlay", p.overlay); put("vpn", p.vpn)
                put("deviceAdmin", p.deviceAdmin); put("notificationAccess", p.notificationAccess)
                put("usageAccess", p.usageAccess); put("batteryUnrestricted", p.batteryUnrestricted)
                put("postNotifications", p.postNotifications)
            }
        }
        "requestAccessibility" -> done { LockingController.requestAccessibility(ctx) }
        "requestOverlay" -> done { LockingController.requestOverlay(ctx) }
        "requestVpn" -> done { requestVpn() }
        "requestDeviceAdmin" -> done { LockingController.requestDeviceAdmin(ctx) }
        "requestUsageAccess" -> done { LockingController.requestUsageAccess(ctx) }
        "requestNotificationAccess" -> done { LockingController.requestNotificationAccess(ctx) }
        "requestBatteryUnrestricted" -> done { LockingController.requestBatteryUnrestricted(ctx) }
        "listInstalledApps" -> {
            val apps = withContext(Dispatchers.Default) { LockingController.listInstalledApps(ctx) }
            buildJsonObject {
                put("apps", JsonArray(apps.map { buildJsonObject { put("packageName", it.packageName); put("label", it.label) } }))
            }
        }
        "setBlockListAndStart" -> done {
            fun list(key: String) = a[key]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
            val strict = a["noEarlyUnlock"]?.jsonPrimitive?.booleanOrNull == true
            LockingController.startSession(
                ctx = ctx,
                sessionId = a["sessionId"]?.jsonPrimitive?.content ?: ("web-" + System.currentTimeMillis()),
                apps = list("apps"),
                domains = list("domains"),
                appsMode = if (a["appsMode"]?.jsonPrimitive?.content == "whitelist") "whitelist" else "blacklist",
                noEarlyUnlock = strict,
                endsAtMs = a["endsAt"]?.jsonPrimitive?.longOrNull ?: 0L,
            )
        }
        "endSession" -> buildJsonObject { put("ended", LockingController.endSession(ctx, a["phrase"]?.jsonPrimitive?.content)) }
        "getSessionState" -> {
            val s = LockingController.sessionState(ctx)
            buildJsonObject { put("active", s.active); put("sessionId", s.sessionId ?: "") }
        }
        else -> throw IllegalArgumentException("unknown method $method")
    }

    private inline fun done(block: () -> Unit): JsonElement { block(); return JsonObject(emptyMap()) }

    private fun settle(id: Int, ok: Boolean, payload: JsonElement) {
        scope.launch { eval("window.__wkResolve&&window.__wkResolve($id,$ok,$payload)") }
    }

    companion object {
        /** The current native session as a doc-start script that seeds the page's localStorage, or "" if signed out. */
        @OptIn(kotlin.time.ExperimentalTime::class)
        fun sessionScript(): String {
            val s = Supabase.client.auth.currentSessionOrNull() ?: return ""
            val u = s.user
            val user = buildJsonObject {
                put("id", u?.id ?: ""); put("aud", u?.aud ?: "authenticated"); put("role", u?.role ?: "authenticated")
                put("email", u?.email ?: "")
                put("app_metadata", u?.appMetadata ?: JsonObject(emptyMap()))
                put("user_metadata", u?.userMetadata ?: JsonObject(emptyMap()))
            }
            val session = buildJsonObject {
                put("access_token", s.accessToken); put("refresh_token", s.refreshToken)
                put("token_type", s.tokenType); put("expires_in", s.expiresIn)
                put("expires_at", s.expiresAt.epochSeconds); put("user", user)
            }
            return "try{localStorage.setItem('$SB_KEY',${JsonPrimitive(session.toString())})}catch(e){}"
        }

        /** Defines window.Capacitor (isNative, RevM2Locking, no-op UI plugins) and mirrors the page's session back to native. */
        val SHIM = """
(function(){
  if (window.__wkShim) return; window.__wkShim = true; window.__wkEmbedded = true;
  var pending = {}, seq = 0;
  window.__wkResolve = function(id, ok, payload){ var p = pending[id]; if(!p) return; delete pending[id]; ok ? p.res(payload) : p.rej(new Error(String(payload))); };
  function call(m, a){ return new Promise(function(res, rej){ var id = ++seq; pending[id] = {res:res, rej:rej}; WynkoNative.call(id, m, JSON.stringify(a||{})); }); }
  var lock = {};
  ['checkLockPermissions','requestAccessibility','requestOverlay','requestVpn','requestDeviceAdmin','requestUsageAccess','requestNotificationAccess','requestBatteryUnrestricted','setBlockListAndStart','endSession','listInstalledApps','getSessionState']
    .forEach(function(m){ lock[m] = function(a){ return call(m, a); }; });
  var noop = function(){ return Promise.resolve(); };
  window.Capacitor = { isNativePlatform: function(){ return true; }, getPlatform: function(){ return 'android'; },
    Plugins: { RevM2Locking: lock, Haptics: {impact: noop}, StatusBar: {setBackgroundColor: noop, setStyle: noop}, SplashScreen: {hide: noop}, Keyboard: {addListener: noop} } };
  var KEY = '$SB_KEY', setI = Storage.prototype.setItem, remI = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(k, v){ setI.apply(this, arguments); if (k === KEY && this === window.localStorage) { try { WynkoNative.onSession(String(v)); } catch(e) {} } };
  Storage.prototype.removeItem = function(k){ remI.apply(this, arguments); if (k === KEY && this === window.localStorage) { try { WynkoNative.onSignedOut(); } catch(e) {} } };
})();
"""
    }
}
