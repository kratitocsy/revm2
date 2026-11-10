package com.wynko.app.sync

import android.content.Context
import com.wynko.app.data.FocusRepository
import com.wynko.app.data.FocusSession
import com.wynko.app.data.ScheduleRepository
import com.wynko.app.data.Supabase
import com.wynko.app.locking.LockingController
import com.wynko.app.locking.ScheduleAlarms
import com.wynko.app.locking.ScheduleEnforcer
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * One account, every device: pulls what was set up anywhere else (the PC app, the website, Wynky) onto this phone.
 *  - Schedules: downloaded and cached, then enforced on the phone by [ScheduleEnforcer] and its alarms, so they keep
 *    working offline and with the app closed.
 *  - A block running right now (started on the PC or the web, or by the server's schedule tick): mirrored as an
 *    on-device session, and ended here when it ends there.
 * Runs every minute while the app is open (AppViewModel) and about every 15 minutes in the background (SyncJobService).
 */
object RemoteSync {
    /** True while the app's screens are showing. The web pane then owns token refresh, so this must not refresh too. */
    @Volatile var uiActive = false
    private val mutex = Mutex()

    /** Returns true when the server was reached and the phone now matches it. Never throws (except cancellation). */
    suspend fun run(ctx: Context, fromBackground: Boolean): Boolean = mutex.withLock {
        val app = ctx.applicationContext
        val auth = Supabase.client.auth
        try {
            auth.awaitInitialization()
            if (auth.currentSessionOrNull() == null) return@withLock false
            try {
                pull(app)
                true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Most likely an expired access token with nobody around to refresh it. Two clients refreshing one
                // rotating token would sign both out, so only do it when the web pane is not running.
                if (!fromBackground || uiActive) return@withLock false
                auth.refreshCurrentSession()
                pull(app)
                true
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    private suspend fun pull(ctx: Context) {
        ScheduleRepository.refresh(ctx)
        val remote = FocusRepository.activeSession()
        withContext(Dispatchers.Default) {
            ScheduleEnforcer.evaluate(ctx)
            ScheduleAlarms.rearm(ctx)
            mirror(ctx, remote)
        }
    }

    /** Keeps on-device blocking in step with the account's live block row (focus_lock_sessions). */
    private fun mirror(ctx: Context, remote: FocusSession?, nowMs: Long = System.currentTimeMillis()) {
        val local = LockingController.sessionState(ctx)
        val localId = local.sessionId.orEmpty()
        val endsAtMs = remote?.endsAt?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
        val live = remote != null && remote.active && (endsAtMs == null || endsAtMs > nowMs)

        if (!live) {
            // The block ended elsewhere. Leave alone what this phone runs by itself: a scheduled slot ("sched-"),
            // a Focus timer session ("focus-") or one the web pane started here ("web-").
            val mirrored = local.active && localId.isNotEmpty() && !localId.startsWith(ScheduleEnforcer.PREFIX) &&
                !localId.startsWith("focus-") && !localId.startsWith("web-")
            if (mirrored) LockingController.endSession(ctx)
            return
        }
        if (local.active) return // already blocking (this block, or the scheduled slot that produced it)

        // Blocks made on a PC name apps by process or label ("steam.exe"); Android matches package ids.
        val packages = LockingController.resolvePackages(ctx, remote!!.apps)
        // An allow-list that resolves to nothing would lock every app, so it blocks no apps instead.
        val whitelist = remote.appsMode == "whitelist" && packages.isNotEmpty()
        LockingController.startSession(
            ctx = ctx,
            sessionId = remote.id,
            apps = packages,
            domains = remote.sites,
            appsMode = if (whitelist) "whitelist" else "blacklist",
            noEarlyUnlock = remote.noEarlyUnlock,
            endsAtMs = endsAtMs ?: 0L,
            domainsAllowOnly = remote.mode == "whitelist",
        )
    }
}
