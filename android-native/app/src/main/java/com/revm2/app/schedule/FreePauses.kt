package com.revm2.app.schedule

import android.content.Context

/** 2 free pauses per schedule per India-time day, each lasting 20 minutes, then the timer resumes by itself. */
object FreePauses {
    private const val PREFS = "revm2_free_pauses"
    private const val UNTIL = "until"

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun key(scheduleId: String, nowMs: Long) = "used.$scheduleId.${istDateKey(nowMs)}"

    fun left(ctx: Context, scheduleId: String, nowMs: Long = System.currentTimeMillis()): Int =
        (FREE_PAUSES_PER_SCHEDULE - prefs(ctx).getInt(key(scheduleId, nowMs), 0)).coerceAtLeast(0)

    /** Uses one free pause and starts its clock. Returns when it ends (ms). */
    fun begin(ctx: Context, scheduleId: String, nowMs: Long = System.currentTimeMillis()): Long {
        val used = prefs(ctx).getInt(key(scheduleId, nowMs), 0)
        val until = nowMs + FREE_PAUSE_MINUTES * 60_000L
        prefs(ctx).edit().putInt(key(scheduleId, nowMs), used + 1).putLong(UNTIL, until).apply()
        return until
    }

    fun until(ctx: Context): Long? = prefs(ctx).getLong(UNTIL, 0L).takeIf { it > 0L }
    fun clear(ctx: Context) { prefs(ctx).edit().remove(UNTIL).apply() }
}
