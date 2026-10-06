package com.revm2.app.locking

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import java.util.Calendar

data class AppUsage(val packageName: String, val label: String, val minutes: Int)

/** Screen-time stats from Usage Access (reporting only; blocking uses the accessibility service). */
object UsageStats {
    fun hasAccess(ctx: Context): Boolean {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Today's foreground minutes per launchable app, biggest first. */
    fun today(ctx: Context, limit: Int = 5): List<AppUsage> {
        if (!hasAccess(ctx)) return emptyList()
        val start = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = ctx.packageManager
        val launchable = LockingController.listInstalledApps(ctx).associate { it.packageName to it.label }
        return usm.queryAndAggregateUsageStats(start, System.currentTimeMillis()).values
            .filter { it.totalTimeInForeground > 60_000 && it.packageName in launchable && it.packageName != ctx.packageName }
            .sortedByDescending { it.totalTimeInForeground }.take(limit)
            .map { AppUsage(it.packageName, launchable[it.packageName] ?: it.packageName, (it.totalTimeInForeground / 60_000).toInt()) }
    }
}
