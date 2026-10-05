package com.revm2.app.schedule

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** What a slot enforces: the saved block (preset) it points at. Sleep slots have no preset. */
@Serializable
data class StoredPreset(
    val name: String,
    val sites: List<String> = emptyList(),
    val mode: String = "blacklist",
    val apps: List<String> = emptyList(),
    val appsMode: String = "blacklist",
    val noEarlyUnlock: Boolean = false,
)

@Serializable
data class StoredSlot(
    val id: String,
    val start: String,
    val end: String,
    val subject: String? = null,
    val isSleep: Boolean = false,
    val breakAfterMinutes: Int = 0,
    val preset: StoredPreset? = null,
)

@Serializable
data class StoredSchedule(
    val id: String,
    val name: String,
    val active: Boolean = true,
    val days: List<Int> = emptyList(),
    val parity: Int? = null,
    val slots: List<StoredSlot> = emptyList(),
)

/**
 * The member's Focus Lock schedules as last downloaded from Supabase, kept on the phone so enforcement keeps
 * working with no network and after a reboot (the alarms read this, not the network). Also remembers which
 * slot/day pairs already ran - the on-device twin of `focus_lock_schedule_runs`, so ending a block early
 * does not relock the person for the rest of that same slot.
 */
object ScheduleStore {
    private const val PREFS = "revm2_schedules"
    private const val KEY = "schedules_json"
    private const val KEY_RUNS = "runs"
    private val json = Json { ignoreUnknownKeys = true }

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(ctx: Context, schedules: List<StoredSchedule>) {
        prefs(ctx).edit().putString(KEY, json.encodeToString(schedules)).apply()
    }

    fun load(ctx: Context): List<StoredSchedule> = try {
        json.decodeFromString(prefs(ctx).getString(KEY, "[]") ?: "[]")
    } catch (e: Exception) { emptyList() }

    /** Active schedules as the gate sees them. Sleep blocks don't count toward the timer gate (same as desktop). */
    fun gateSchedules(all: List<StoredSchedule>): List<WindowSchedule> = all.filter { it.active }.map { s ->
        WindowSchedule(s.id, s.name, s.days, s.parity, s.slots.filterNot { it.isSleep }.map { WindowSlot(it.start.take(5), it.end.take(5), it.subject, it.id) })
    }

    /** Active schedules including sleep blocks, for enforcement. */
    fun enforceSchedules(all: List<StoredSchedule>): List<WindowSchedule> = all.filter { it.active }.map { s ->
        WindowSchedule(s.id, s.name, s.days, s.parity, s.slots.map { WindowSlot(it.start.take(5), it.end.take(5), it.subject, it.id, it.isSleep) })
    }

    fun hasRun(ctx: Context, key: String): Boolean = prefs(ctx).getStringSet(KEY_RUNS, emptySet())?.contains(key) == true

    fun markRun(ctx: Context, key: String) {
        val cur = prefs(ctx).getStringSet(KEY_RUNS, emptySet()).orEmpty().toMutableSet()
        cur.add(key)
        // Keep only recent keys ("<slotId>:<yyyy-mm-dd>"); anything older than ~3 days can never match again.
        val keep = cur.sortedDescending().take(200).toSet()
        prefs(ctx).edit().putStringSet(KEY_RUNS, keep).apply()
    }
}
