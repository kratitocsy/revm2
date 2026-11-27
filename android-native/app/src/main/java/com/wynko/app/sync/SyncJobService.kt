package com.wynko.app.sync

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Background half of [RemoteSync]: Android runs this roughly every 15 minutes (its minimum for periodic jobs) when
 * there is a network, even with the app closed and after a reboot, so a schedule or block set up on the PC reaches
 * the phone without opening Wynko. Uses the platform JobScheduler: no extra permission and nothing Play restricts.
 */
class SyncJobService : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var running: Job? = null

    override fun onStartJob(params: JobParameters): Boolean {
        running = scope.launch {
            withTimeoutOrNull(45_000) { RemoteSync.run(applicationContext, fromBackground = true) }
            jobFinished(params, false)
        }
        return true // still working on another thread
    }

    override fun onStopJob(params: JobParameters): Boolean {
        running?.cancel()
        return false // the next period will try again
    }

    companion object {
        private const val JOB_ID = 7732
        private const val PERIOD_MS = 15 * 60 * 1000L

        /** Safe to call on every app start and boot: an already-scheduled job is left as it is. */
        fun schedule(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java) ?: return
            if (js.getPendingJob(JOB_ID) != null) return
            val info = JobInfo.Builder(JOB_ID, ComponentName(ctx, SyncJobService::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(PERIOD_MS)
                .setPersisted(true) // survives a reboot (RECEIVE_BOOT_COMPLETED is already declared)
                .build()
            runCatching { js.schedule(info) }
        }
    }
}
