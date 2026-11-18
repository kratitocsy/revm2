package com.wynko.app.locking

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The full-screen "Blocked during your focus session" cover, shared by both app blockers: the accessibility
 * service and the Usage Access fallback in [GuardService]. Shows briefly, then [goHomeAction] sends the person to
 * the home screen so the blocked app isn't left running on top. Needs the overlay permission.
 */
class BlockOverlay(private val ctx: Context, private val goHomeAction: () -> Unit) {
    private val windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var overlayView: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private val goHome = Runnable { goHomeAction(); remove() }

    val showing get() = overlayView != null

    fun show(title: String? = null, detail: String? = null, openYoutubeInBrowser: Boolean = false) {
        if (overlayView != null) { rearm(if (openYoutubeInBrowser) 5000 else 1500); return }
        val session = BlockStore.current(ctx)
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F70B0B0D"))
            setPadding(64, 64, 64, 64)
        }
        root.addView(TextView(ctx).apply {
            text = title ?: "Blocked during your focus session"
            setTextColor(Color.parseColor("#FFA94D"))
            textSize = 22f
            gravity = Gravity.CENTER
        })
        val left = session.remainingSeconds()
        root.addView(TextView(ctx).apply {
            text = when {
                detail != null -> detail
                left != null -> "${left / 60} min left. Stay with it."
                session.noEarlyUnlock -> "This session is locked until it ends."
                else -> "Open Wynko if you need to end the session."
            }
            setTextColor(Color.parseColor("#9C968C"))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 32)
        })
        if (openYoutubeInBrowser) root.addView(Button(ctx).apply {
            text = "Open YouTube in browser"
            setOnClickListener {
                remove()
                val i = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://m.youtube.com"))
                    .addCategory(android.content.Intent.CATEGORY_BROWSABLE).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                // Keep it out of the YouTube app, which would claim the link and land back here.
                val browser = YoutubeChannels.BROWSER_URL_BARS.keys.firstOrNull { p ->
                    runCatching { ctx.packageManager.getPackageInfo(p, 0) }.isSuccess
                }
                if (browser != null) i.setPackage(browser)
                runCatching { ctx.startActivity(i) }.onFailure { goHomeAction() }
            }
        })
        root.addView(Button(ctx).apply {
            text = "Go home"
            setOnClickListener { handler.removeCallbacks(goHome); goHome.run() }
        })
        if (!session.noEarlyUnlock) {
            root.addView(Button(ctx).apply {
                text = "Open Wynko"
                setOnClickListener {
                    remove()
                    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)?.let { ctx.startActivity(it) }
                }
            })
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type, 0, PixelFormat.TRANSLUCENT,
        )
        try {
            windowManager.addView(root, params)
            overlayView = root
            rearm(if (openYoutubeInBrowser) 5000 else 1500)
        } catch (e: Exception) {
            // Overlay permission missing: still send the user home so the block holds.
            goHomeAction()
        }
    }

    /** Overlay shows briefly, then the user is sent to the launcher so the blocked app isn't left running on top. */
    private fun rearm(delayMs: Long = 1500) { handler.removeCallbacks(goHome); handler.postDelayed(goHome, delayMs) }

    fun remove() {
        handler.removeCallbacks(goHome)
        overlayView?.let { try { windowManager.removeView(it) } catch (e: Exception) { /* already gone */ } }
        overlayView = null
    }
}
