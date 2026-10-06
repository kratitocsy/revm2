package com.revm2.app.locking

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Android ceiling for "block a distracting app": we cannot kill the process (that's what app_guard.rs does on
 * desktop), so we detect the foreground app via window-state events, send the user Home, and keep a full-screen
 * overlay over it for the moment it takes. Same ceiling Opal/AppBlock document.
 *
 * Only the *package of the foreground window* is read (canRetrieveWindowContent = false): no screen text, no
 * keystrokes. That is what the Play accessibility disclosure promises.
 */
class RevM2AccessibilityService : AccessibilityService() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private val goHome = Runnable { performGlobalAction(GLOBAL_ACTION_HOME); removeOverlay() }

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        // Keep the capabilities declared in accessibility_service_config.xml; only the event mask changes at runtime.
        serviceInfo = (serviceInfo ?: AccessibilityServiceInfo()).apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 50
        }
    }

    private var watchingContent = false
    private var lastShortCheck = 0L
    private var shortHits = ArrayDeque<Long>()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkg = event.packageName?.toString() ?: return
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                // A new foreground window means the previous block is stale; re-evaluate every time.
                if (BlockStore.isAppBlocked(this, pkg)) showOverlay() else { removeOverlay(); updateContentWatch(pkg) }
                if (watchingContent) checkShortForm(pkg)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> if (watchingContent) checkShortForm(pkg)
        }
    }

    /**
     * Screen structure is only looked at while Instagram or YouTube is in front AND Reels/Shorts blocking is on.
     * Everywhere else the service listens to window changes only (no content events at all).
     */
    private fun updateContentWatch(pkg: String) {
        val target = ShortFormHints.targetFor(pkg)
        val want = target != null && BlockStore.shortFormActive(this, target.platform)
        if (want == watchingContent) return
        watchingContent = want
        serviceInfo = serviceInfo?.apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or (if (want) AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED else 0)
        }
    }

    private fun checkShortForm(pkg: String) {
        val target = ShortFormHints.targetFor(pkg) ?: return
        if (!BlockStore.shortFormActive(this, target.platform)) return
        val now = System.currentTimeMillis()
        if (now - lastShortCheck < 350) return
        lastShortCheck = now
        val root = rootInActiveWindow ?: return
        // Looks up specific view ids only; never reads text, messages or anything the user typed.
        val onShortScreen = ShortFormHints.qualifiedIds(target).any { id ->
            root.findAccessibilityNodeInfosByViewId(id)?.any { it.isVisibleToUser } == true
        }
        if (!onShortScreen) return
        BlockStore.recordShortFormBlock(this)
        shortHits.addLast(now)
        while (shortHits.isNotEmpty() && now - shortHits.first() > 4000) shortHits.removeFirst()
        // Back normally leaves the Reels/Shorts screen; if it keeps coming back (e.g. the Shorts tab), go Home instead.
        performGlobalAction(if (shortHits.size >= 3) GLOBAL_ACTION_HOME else GLOBAL_ACTION_BACK)
        android.widget.Toast.makeText(this, if (target.platform == ShortFormHints.YOUTUBE) "Shorts blocked by Wynko" else "Reels blocked by Wynko", android.widget.Toast.LENGTH_SHORT).show()
    }

    override fun onInterrupt() { removeOverlay() }

    /** Switched off while a session runs: record it so the session is reported as unverified. */
    override fun onUnbind(intent: android.content.Intent?): Boolean {
        BlockStore.markTampered(this, "Accessibility access was turned off")
        removeOverlay()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(goHome)
        removeOverlay()
        super.onDestroy()
    }

    private fun showOverlay() {
        if (overlayView != null) { rearm(); return }
        val session = BlockStore.current(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F70B0B0D"))
            setPadding(64, 64, 64, 64)
        }
        root.addView(TextView(this).apply {
            text = "Blocked during your focus session"
            setTextColor(Color.parseColor("#FFA94D"))
            textSize = 22f
            gravity = Gravity.CENTER
        })
        val left = session.remainingSeconds()
        root.addView(TextView(this).apply {
            text = when {
                left != null -> "${left / 60} min left. Stay with it."
                session.noEarlyUnlock -> "This session is locked until it ends."
                else -> "Open Wynko if you need to end the session."
            }
            setTextColor(Color.parseColor("#9C968C"))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 32)
        })
        root.addView(Button(this).apply {
            text = "Go home"
            setOnClickListener { handler.removeCallbacks(goHome); goHome.run() }
        })
        if (!session.noEarlyUnlock) {
            root.addView(Button(this).apply {
                text = "Open Wynko"
                setOnClickListener {
                    removeOverlay()
                    packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
                }
            })
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type, 0, PixelFormat.TRANSLUCENT,
        )
        try {
            windowManager?.addView(root, params)
            overlayView = root
            rearm()
        } catch (e: Exception) {
            // Overlay permission missing: still send the user home so the block holds.
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
    }

    /** Overlay shows briefly, then the user is sent to the launcher so the blocked app isn't left running on top. */
    private fun rearm() { handler.removeCallbacks(goHome); handler.postDelayed(goHome, 1500) }

    private fun removeOverlay() {
        handler.removeCallbacks(goHome)
        overlayView?.let { try { windowManager?.removeView(it) } catch (e: Exception) { /* already gone */ } }
        overlayView = null
    }
}
