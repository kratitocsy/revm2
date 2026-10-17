package com.wynko.app.ui.web

import android.annotation.SuppressLint
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
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
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
 * The Wynko dashboard (the same web app desktop runs, in its phone layout) in a WebView, signed in with the
 * native session and wired to on-device blocking through [WynkoBridge]. Wynky, schedules, communities, rooms
 * and battles all come from the web app, so Android never drifts from desktop.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebAppScreen(page: String? = null) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val host = remember { Uri.parse(BuildConfig.WEB_BASE_URL).host.orEmpty() }
    val trusted = remember { booleanArrayOf(false) }
    val webView = remember { arrayOfNulls<WebView>(1) }
    val fileCallback = remember { arrayOfNulls<ValueCallback<Array<Uri>>>(1) }

    val vpnLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback[0]?.onReceiveValue(uris.toTypedArray()); fileCallback[0] = null
    }
    val bridge = remember {
        WynkoBridge(
            ctx = ctx, scope = scope,
            eval = { js -> webView[0]?.evaluateJavascript(js, null) },
            isTrusted = { trusted[0] },
            requestVpn = { VpnService.prepare(ctx)?.let { vpnLauncher.launch(it) } },
            signOutNative = { scope.launch { runCatching { AuthRepository.signOut() } } },
        )
    }

    BackHandler(enabled = true) {
        val w = webView[0]
        // Let the page close its own sheets/pages first; leave the app only from the root.
        if (w != null && w.canGoBack()) w.goBack() else (ctx as? android.app.Activity)?.moveTaskToBack(true)
    }

    Box(Modifier.fillMaxSize().background(Bg).systemBarsPadding().imePadding()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { c ->
                WebView(c).also { w ->
                    webView[0] = w
                    w.setBackgroundColor(0xFF0B0B0D.toInt())
                    w.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    w.settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        cacheMode = WebSettings.LOAD_DEFAULT
                        setSupportMultipleWindows(false)
                        userAgentString = userAgentString + " WynkoAndroid/" + BuildConfig.VERSION_NAME
                    }
                    w.addJavascriptInterface(bridge, "WynkoNative")

                    // Seed the page with the native session and the Capacitor-style bridge before any page script runs.
                    val boot = WynkoBridge.sessionScript() + WynkoBridge.SHIM
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                        WebViewCompat.addDocumentStartJavaScript(w, boot, setOf("https://$host"))
                    }

                    w.webViewClient = object : WebViewClient() {
                        private fun inApp(u: Uri?) = u?.scheme == "https" && u.host == host
                        override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                            if (inApp(r.url)) return false
                            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, r.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                            return true
                        }
                        override fun onPageStarted(v: WebView, url: String?, f: android.graphics.Bitmap?) {
                            trusted[0] = inApp(Uri.parse(url ?: ""))
                            // Fallback for WebViews without document-start scripts (rare).
                            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) && trusted[0]) v.evaluateJavascript(boot, null)
                        }
                    }
                    w.webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                            fileCallback[0]?.onReceiveValue(null)
                            fileCallback[0] = cb
                            pickFile.launch(p.acceptTypes.firstOrNull()?.takeIf { it.isNotBlank() } ?: "*/*")
                            return true
                        }
                        // Camera and microphone are not declared in this build, so room voice/video is not offered yet.
                        override fun onPermissionRequest(req: PermissionRequest) = req.deny()
                    }
                    val q = if (page.isNullOrBlank()) "" else "?page=$page"
                    w.loadUrl("${BuildConfig.WEB_BASE_URL}/home$q")
                }
            },
            onRelease = { it.removeJavascriptInterface("WynkoNative"); it.destroy(); webView[0] = null },
        )
    }
}
