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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.wynko.app.R
import com.wynko.app.ui.components.PrimaryButton
import com.wynko.app.ui.components.WkText
import com.wynko.app.ui.theme.Wk
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
class WebController internal constructor() {
    lateinit var view: WebView
        internal set

    /** True once the dashboard has signed in and drawn; until then a native loading screen covers the WebView. */
    var ready by mutableStateOf(false)
        internal set
    /** True when the page could not be loaded at all (offline, DNS); the cover then offers Try again. */
    var failed by mutableStateOf(false)
        internal set

    /** Shows the dashboard page [page] ("schedules", "studyrooms", "battleground", "settings"...). */
    fun navigate(page: String, tab: String? = null) {
        val t = if (tab == null) "undefined" else "'$tab'"
        view.evaluateJavascript(
            "(function go(n){if(window.__wkNavigate){window.__wkNavigate('$page',$t)}else if(n<60){setTimeout(function(){go(n+1)},200)}})(0)",
            null,
        )
    }

    fun retry() { failed = false; ready = false; view.reload() }

    fun destroy() { view.removeJavascriptInterface("WynkoNative"); view.destroy() }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun rememberWebController(): WebController {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    // The site redirects wynko.in to www.wynko.in, so both count as the app's own pages.
    val hosts = remember { Uri.parse(BuildConfig.WEB_BASE_URL).host.orEmpty().removePrefix("www.").let { setOf(it, "www.$it") } }
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
        val controller = WebController()
        val bridge = WynkoBridge(
            ctx = ctx, scope = scope,
            eval = { js -> holder[0]?.evaluateJavascript(js, null) },
            isTrusted = { trusted[0] },
            requestVpn = { VpnService.prepare(ctx)?.let { vpnLauncher.launch(it) } },
            signOutNative = { scope.launch { runCatching { AuthRepository.signOut() } } },
            markReady = { controller.ready = true },
        )
        val w = WebView(ctx).also { w ->
            holder[0] = w
            controller.view = w
            w.isVerticalScrollBarEnabled = false
            w.isHorizontalScrollBarEnabled = false
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
            if (docStart) WebViewCompat.addDocumentStartJavaScript(w, boot, hosts.map { "https://$it" }.toSet())

            w.webViewClient = object : WebViewClient() {
                private fun inApp(u: Uri?) = u?.scheme == "https" && u.host in hosts
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                    if (inApp(r.url)) return false
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, r.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    return true
                }
                override fun onPageFinished(v: WebView, url: String?) {
                    // The page normally says it is ready itself; if it never does, drop the cover after a few seconds.
                    v.postDelayed({ if (!controller.failed) controller.ready = true }, 5000)
                }
                override fun onReceivedError(v: WebView, r: WebResourceRequest, e: android.webkit.WebResourceError) {
                    if (r.isForMainFrame) controller.failed = true
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
        controller
    }
}

/** Puts the shared WebView on screen and points it at [page]; a native cover hides it until the page is ready. */
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
        AnimatedVisibility(visible = !controller.ready || controller.failed, enter = fadeIn(), exit = fadeOut()) {
            Column(
                Modifier.fillMaxSize().background(Bg).pointerInput(Unit) { }, // swallow touches while covered
                verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(painterResource(R.drawable.wynko_logo), "Wynko", Modifier.size(72.dp))
                if (controller.failed) {
                    WkText("Couldn't connect", 15, FontWeight.SemiBold, Wk.Ink100, Modifier.padding(top = 18.dp))
                    WkText("Check your internet and try again.", 12, color = Wk.Ink500, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp), align = TextAlign.Center)
                    PrimaryButton("Try again", { controller.retry() }, Modifier.width(180.dp), height = 44)
                } else {
                    CircularProgressIndicator(Modifier.padding(top = 22.dp).size(26.dp), color = Wk.Orange500, strokeWidth = 3.dp)
                }
            }
        }
    }
}
