package com.revm2.app.locking

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.revm2.app.schedule.ScheduleStore
import com.revm2.app.schedule.computeGate

/** Wakes the phone at the next slot boundary (a block ending or the next one starting) to run [ScheduleEnforcer]. */
object ScheduleAlarms {
    const val ACTION = "com.revm2.app.SCHEDULE_TICK"

    fun rearm(ctx: Context, nowMs: Long = System.currentTimeMillis()) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = pending(ctx)
        val gate = computeGate(ScheduleStore.enforceSchedules(ScheduleStore.load(ctx)), nowMs)
        val minuteStart = nowMs - nowMs % 60_000L
        val at = when {
            gate.inside != null -> minuteStart + gate.inside.endsInMin * 60_000L
            gate.next != null -> minuteStart + gate.next.startsInMin * 60_000L
            else -> { am.cancel(pi); return }
        } + 1_000L // land just after the boundary so the clock has ticked over
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    private fun pending(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 7731, Intent(ctx, ScheduleReceiver::class.java).setAction(ACTION), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
