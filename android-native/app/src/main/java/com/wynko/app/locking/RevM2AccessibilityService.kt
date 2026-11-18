package com.wynko.app.locking

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

/**
 * Android ceiling for "block a distracting app": we cannot kill the process (that's what app_guard.rs does on
 * desktop), so we detect the foreground app via window-state events, send the user Home, and keep a full-screen
 * overlay over it for the moment it takes. Same ceiling Opal/AppBlock document.
 *
 * Normally only the *package of the foreground window* is read: no screen text, no keystrokes. Two narrow
 * exceptions, both described in the Play accessibility disclosure: Reels/Shorts screen ids (ShortFormHints), and,
 * while a block with YouTube channel rules runs, the address bar of known browsers (YoutubeChannels).
 */
class RevM2AccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private val overlay by lazy { BlockOverlay(this) { performGlobalAction(GLOBAL_ACTION_HOME) } }

    override fun onServiceConnected() {
        super.onServiceConnected()
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
                if (BlockStore.isAppBlocked(this, pkg)) showOverlay()
                else if (pkg == YoutubeChannels.YOUTUBE_APP && BlockStore.youtubeRules(this)?.allowOnly == true) {
                    // The app can't show reliably which channel is playing, so with "only these channels" it pauses
                    // and offers the browser, where every page's channel is checked.
                    showOverlay(
                        "Only your chosen YouTube channels are allowed right now",
                        "The YouTube app is paused during this block. Watch your channels in the browser.",
                        openYoutubeInBrowser = true,
                    )
                }
                else { removeOverlay(); updateContentWatch(pkg) }
                if (watchingContent) { checkShortForm(pkg); checkBrowserYoutube(pkg) }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> if (watchingContent) { checkShortForm(pkg); checkBrowserYoutube(pkg) }
        }
    }

    // ── YouTube channel rules in browsers (see YoutubeChannels) ──
    private var lastYtCheck = 0L
    private var lastYtUrl: String? = null
    private val ytHits = ArrayDeque<Long>()
    private val ytLookups = java.util.concurrent.Executors.newSingleThreadExecutor()

    /**
     * Reads only the address bar of a known browser, only while the running block has YouTube channel rules, and
     * only acts on youtube.com pages: a channel page is matched directly; a video's channel is looked up via oEmbed.
     */
    private fun checkBrowserYoutube(pkg: String) {
        val ids = YoutubeChannels.BROWSER_URL_BARS[pkg] ?: return
        val rules = BlockStore.youtubeRules(this) ?: return
        val now = System.currentTimeMillis()
        if (now - lastYtCheck < 400) return
        lastYtCheck = now
        val root = rootInActiveWindow ?: return
        val bar = ids.asSequence().flatMap { root.findAccessibilityNodeInfosByViewId("$pkg:id/$it").orEmpty().asSequence() }
            .firstOrNull { it.isVisibleToUser } ?: return
        if (bar.isFocused) return // the person is typing an address: wait until they open it
        val url = bar.text?.toString() ?: return
        if (url == lastYtUrl) return
        lastYtUrl = url
        when (val target = YoutubeChannels.targetOf(url)) {
            null -> return
            is YoutubeChannels.Target.ChannelPage -> if (!YoutubeChannels.allowed(rules, target.ref, null)) leaveYoutubePage()
            is YoutubeChannels.Target.Video -> ytLookups.execute {
                val owner = YoutubeChannels.lookupVideo(target.videoId)
                handler.post {
                    if (owner == null) { if (lastYtUrl == url) lastYtUrl = null; return@post } // offline: retry on the next change
                    if (lastYtUrl == url && !YoutubeChannels.allowed(rules, owner.first, owner.second)) leaveYoutubePage()
                }
            }
        }
    }

    private fun leaveYoutubePage() {
        val now = System.currentTimeMillis()
        ytHits.addLast(now)
        while (ytHits.isNotEmpty() && now - ytHits.first() > 6000) ytHits.removeFirst()
        lastYtUrl = null // re-check whatever page Back lands on
        performGlobalAction(if (ytHits.size >= 3) GLOBAL_ACTION_HOME else GLOBAL_ACTION_BACK)
        android.widget.Toast.makeText(this, "That YouTube channel isn't allowed during this block", android.widget.Toast.LENGTH_SHORT).show()
    }

    /**
     * Screen structure is only looked at while Instagram or YouTube is in front AND Reels/Shorts blocking is on.
     * Everywhere else the service listens to window changes only (no content events at all).
     */
    private fun updateContentWatch(pkg: String) {
        val target = ShortFormHints.targetFor(pkg)
        val want = (target != null && BlockStore.shortFormActive(this, target.platform))
            || (pkg in YoutubeChannels.BROWSER_URL_BARS && BlockStore.youtubeRules(this) != null)
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
        ytLookups.shutdownNow()
        removeOverlay()
        super.onDestroy()
    }

    private fun showOverlay(title: String? = null, detail: String? = null, openYoutubeInBrowser: Boolean = false) =
        overlay.show(title, detail, openYoutubeInBrowser)

    private fun removeOverlay() = overlay.remove()
}
