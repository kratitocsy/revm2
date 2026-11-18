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
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wynko.app.R
import com.wynko.app.ui.components.WkText
import com.wynko.app.ui.theme.Wk
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
    /** False until the dashboard has drawn its first page; the app shows its own loading screen meanwhile. */
    var ready by mutableStateOf(false); internal set
    /** Unread notifications reported by the page, for the app bar badge. */
    var unread by mutableIntStateOf(0); internal set
    /** Set when loading failed (offline, say); [reload] retries. */
    var failed by mutableStateOf(false); internal set
    /** Called when the page itself moves to another page (dashboard id, Study Rooms tab or ""). */
    var onPageChanged: (page: String, tab: String) -> Unit = { _, _ -> }
    /** The page the dashboard last said it is showing. */
    internal var shown: Pair<String, String>? = null

    /** Shows the dashboard page [page] ("schedules", "studyrooms", "battleground", "settings"...). */
    fun navigate(page: String, tab: String? = null) {
        // Already there (the page moved itself and the app bar followed): don't reset it.
        shown?.let { (p, t0) -> if (p == page && (tab == null || tab == t0)) return }
        val t = if (tab == null) "undefined" else "'$tab'"
        view.evaluateJavascript(
            "(function go(n){if(window.__wkNavigate){window.__wkNavigate('$page',$t)}else if(n<60){setTimeout(function(){go(n+1)},200)}})(0)",
            null,
        )
    }

    /** Lets the page close its open panel (Wynky, a room, a sheet). [handled] gets false when nothing was open. */
    fun back(handled: (Boolean) -> Unit) {
        if (!ready) { handled(false); return }
        view.evaluateJavascript("(function(){try{return !!(window.__wkBack&&window.__wkBack())}catch(e){return false}})()") { handled(it == "true") }
    }

    /** Opens the dashboard's real notifications as a bottom sheet. */
    fun openNotifications() { view.evaluateJavascript("window.__wkOpenNotifications&&window.__wkOpenNotifications()", null) }

    fun reload() { failed = false; view.reload() }

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
    val controller = remember { arrayOfNulls<WebController>(1) }

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
            pageChanged = { page, tab ->
                controller[0]?.let { c -> c.ready = true; c.shown = page to tab; c.onPageChanged(page, tab) }
            },
            unreadChanged = { n -> controller[0]?.unread = n },
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
                    controller[0]?.shown = null  // a fresh load forgets which page it was on
                    if (!docStart && trusted[0]) v.evaluateJavascript(boot, null)
                }
                // Older pages (or the sign-in page) never report a page; drop the loading screen once loaded anyway.
                override fun onPageFinished(v: WebView, url: String?) {
                    v.postDelayed({ controller[0]?.ready = true }, 1500)
                }
                override fun onReceivedError(v: WebView, r: WebResourceRequest, e: android.webkit.WebResourceError) {
                    if (r.isForMainFrame) controller[0]?.failed = true
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
        WebController(w).also { controller[0] = it }
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
        // App-style loading / offline screen instead of a blank or browser error page.
        AnimatedVisibility(visible = !controller.ready || controller.failed, enter = fadeIn(), exit = fadeOut()) {
            Column(Modifier.fillMaxSize().background(Bg), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Image(painterResource(R.drawable.wynko_logo), "Wynko", Modifier.size(64.dp))
                Spacer(Modifier.height(18.dp))
                if (controller.failed) {
                    WkText("You're offline", 15, FontWeight.SemiBold, Wk.Ink100)
                    Spacer(Modifier.height(4.dp))
                    WkText("Check your connection and try again.", 12, color = Wk.Ink500)
                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(Wk.Orange300).clickable { controller.reload() }
                            .padding(horizontal = 20.dp, vertical = 10.dp),
                    ) { WkText("Try again", 13, FontWeight.Bold, Wk.Black950) }
                } else {
                    CircularProgressIndicator(color = Wk.Orange300, strokeWidth = 2.5.dp, modifier = Modifier.size(26.dp))
                }
            }
        }
    }
}
