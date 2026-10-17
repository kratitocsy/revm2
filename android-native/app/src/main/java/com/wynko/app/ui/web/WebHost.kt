package com.wynko.app.ui.web

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.wynko.app.BuildConfig
import com.wynko.app.data.AuthRepository
import kotlinx.coroutines.launch

private val Bg = Color(0xFF0B0B0D)

/**
 * One long-lived WebView running the Wynko dashboard (the web app desktop runs, phone layout) with its own
 * header and tab bar hidden, so the native app bar and tab bar stay in charge. Switching screens calls
 * `window.__wkNavigate(id, tab)` instead of reloading, which keeps tab changes instant.
 */
class WebController internal constructor(val view: WebView) {
    private var lastKey: String? = null

    /** Shows the dashboard page [page] ("schedules", "studyrooms", "battleground", "settings"...). */
    fun navigate(page: String, tab: String? = null) {
        val key = "$page/${tab.orEmpty()}"
        if (key == lastKey) return
        lastKey = key
        val t = if (tab == null) "undefined" else "'$tab'"
        view.evaluateJavascript(
            "(function go(n){if(window.__wkNavigate){window.__wkNavigate('$page',$t)}else if(n<60){setTimeout(function(){go(n+1)},200)}})(0)",
            null,
        )
    }

    fun destroy() { view.removeJavascriptInterface("WynkoNative"); view.destroy() }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun rememberWebController(): WebController {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val host = remember { Uri.parse(BuildConfig.WEB_BASE_URL).host.orEmpty() }
    val trusted = remember { booleanArrayOf(false) }
    val holder = remember { arrayOfNulls<WebView>(1) }
    val fileCallback = remember { arrayOfNulls<ValueCallback<Array<Uri>>>(1) }

    val vpnLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
    val pendingMic = remember { arrayOfNulls<PermissionRequest>(1) }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingMic[0]?.let { req -> if (granted) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else req.deny() }
        pendingMic[0] = null
    }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback[0]?.onReceiveValue(uris.toTypedArray()); fileCallback[0] = null
    }

    return remember {
        val bridge = WynkoBridge(
            ctx = ctx, scope = scope,
            eval = { js -> holder[0]?.evaluateJavascript(js, null) },
            isTrusted = { trusted[0] },
            requestVpn = { VpnService.prepare(ctx)?.let { vpnLauncher.launch(it) } },
            signOutNative = { scope.launch { runCatching { AuthRepository.signOut() } } },
        )
        val w = WebView(ctx).also { w ->
            holder[0] = w
            w.setBackgroundColor(0xFF0B0B0D.toInt())
            w.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            w.overScrollMode = WebView.OVER_SCROLL_NEVER
            w.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportZoom(false)
                builtInZoomControls = false
                setSupportMultipleWindows(false)
                userAgentString = userAgentString + " WynkoAndroid/" + BuildConfig.VERSION_NAME
            }
            w.addJavascriptInterface(bridge, "WynkoNative")

            // Seed the page with the native session and the Capacitor-style bridge before any page script runs.
            val boot = WynkoBridge.sessionScript() + WynkoBridge.SHIM
            val docStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
            if (docStart) WebViewCompat.addDocumentStartJavaScript(w, boot, setOf("https://$host"))

            w.webViewClient = object : WebViewClient() {
                private fun inApp(u: Uri?) = u?.scheme == "https" && u.host == host
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                    if (inApp(r.url)) return false
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, r.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    return true
                }
                override fun onPageStarted(v: WebView, url: String?, f: android.graphics.Bitmap?) {
                    trusted[0] = inApp(Uri.parse(url ?: ""))
                    if (!docStart && trusted[0]) v.evaluateJavascript(boot, null)
                }
            }
            w.webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                    fileCallback[0]?.onReceiveValue(null)
                    fileCallback[0] = cb
                    pickFile.launch(p.acceptTypes.firstOrNull()?.takeIf { it.isNotBlank() } ?: "*/*")
                    return true
                }
                // Study-room voice needs the microphone only (asked when a call starts); camera is not offered.
                override fun onPermissionRequest(req: PermissionRequest) {
                    val wantsMic = req.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val wantsOther = req.resources.any { it != PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                    if (!trusted[0] || !wantsMic || wantsOther) { req.deny(); return }
                    if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingMic[0] = req
                        micPermission.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }
            w.loadUrl("${BuildConfig.WEB_BASE_URL}/home")
        }
        WebController(w)
    }
}

/** Puts the shared WebView on screen and points it at [page]. */
@Composable
fun WebPane(controller: WebController, page: String, tab: String? = null) {
    androidx.compose.runtime.LaunchedEffect(page, tab) { controller.navigate(page, tab) }
    Box(Modifier.fillMaxSize().background(Bg)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { _ ->
                // The view outlives this composable; detach it from its previous parent first.
                (controller.view.parent as? ViewGroup)?.removeView(controller.view)
                controller.view
            },
        )
    }
}
