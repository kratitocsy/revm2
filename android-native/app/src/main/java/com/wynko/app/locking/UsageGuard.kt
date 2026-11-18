package com.wynko.app.locking

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent

/**
 * App blocking without the accessibility service. UPI and bank apps refuse to open while any app has
 * Accessibility switched on (it is what screen-reading malware uses), so Wynko also works with Usage Access:
 * while a block runs, [GuardService] calls [check] every second, reads which app came to the front from the
 * system's usage events, and shows the block screen + sends the person home if that app is blocked.
 * Slower to react than the accessibility service (about a second) and it can't see Reels/Shorts screens or a
 * browser's address bar. Only used while Accessibility is off.
 */
class UsageGuard(private val ctx: Context) {
    private val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private val overlay = BlockOverlay(ctx) {
        runCatching {
            ctx.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
    private var foreground: String? = null
    private var lastQuery = System.currentTimeMillis() - 10_000

    /** Should this guard run? Only during a session, with Accessibility off and Usage Access granted. */
    fun wanted(): Boolean =
        BlockStore.current(ctx).active && !LockingController.permissions(ctx).accessibility && UsageStats.hasAccess(ctx)

    fun check() {
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(lastQuery - 1_000, now)
        lastQuery = now
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            @Suppress("DEPRECATION")
            if (e.eventType == UsageEvents.Event.ACTIVITY_RESUMED || e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                foreground = e.packageName
            }
        }
        val pkg = foreground ?: return
        if (BlockStore.isAppBlocked(ctx, pkg)) {
            overlay.show()
            foreground = null // the home screen comes next; don't fire again until another app opens
        }
    }

    fun stop() = overlay.remove()
}
