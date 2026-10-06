package com.revm2.app.data

import android.content.Context
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.TextStyle
import java.util.Locale

data class StudyDay(val label: String, val minutes: Int, val isToday: Boolean)
data class StudyProgress(val week: List<StudyDay>, val streak: Int, val todayMinutes: Int)

/** Running state of the study plan shared with web/desktop (study_plans, migration 0067). */
data class PlanState(val activeTaskId: String?, val running: Boolean, val anchorMs: Long?, val updatedBy: String?, val updatedAtMs: Long)

/** Timer progress of one task as the web stores it (seconds). */
data class TaskProgress(val mode: String, val phase: String?, val total: Int?, val remaining: Int, val elapsed: Int)

/**
 * Study time and the shared study plan, written the way the web app writes them:
 * study_sessions via rpc_start_study_session / rpc_stop_study_session_logged (so rooms,
 * leaderboards and Home everywhere see it), Quick Timer time via rpc_log_study_time, and
 * the running task via study_plans (anchor_at = when the stored task values were taken).
 */
object StudyRepository {
    private val sb get() = Supabase.client
    private val uid get() = sb.auth.currentUserOrNull()?.id ?: error("Not signed in")
    /** This install's id in study_plans.updated_by, so our own writes can be told apart. */
    val clientId: String by lazy { "android-" + java.util.UUID.randomUUID().toString().take(8) }

    @Serializable private data class LogRow(@SerialName("study_log") val log: JsonElement? = null)
    @Serializable
    private data class OpenSessionRow(
        val id: String, val subject: String? = null, @SerialName("started_at") val startedAt: String,
        @SerialName("paused_at") val pausedAt: String? = null, @SerialName("accumulated_paused_seconds") val pausedSecs: Int? = null,
    )
    @Serializable
    private data class PlanRow(
        @SerialName("active_task_id") val activeTaskId: String? = null, val running: Boolean = false,
        @SerialName("anchor_at") val anchorAt: String? = null, @SerialName("updated_by") val updatedBy: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null,
    )
    @Serializable
    private data class ProgressRow(
        val id: String, val mode: String = "pomodoro", @SerialName("pomodoro_phase") val phase: String? = null,
        @SerialName("pomodoro_total") val total: Int? = null, @SerialName("pomodoro_remaining") val remaining: Int = 0,
        @SerialName("regular_elapsed") val elapsed: Int = 0,
    )

    private fun ms(iso: String?): Long? = try { iso?.let { OffsetDateTime.parse(it).toInstant().toEpochMilli() } } catch (_: Exception) { null }
    /** UTC date key, the same one every study_log writer uses. */
    private fun dayKey(d: LocalDate) = d.toString()

    // ── Home's progress card (web useHomeData: study_log + the open session) ──

    suspend fun progress(): StudyProgress {
        val row = sb.from("user_profiles").select(Columns.list("study_log")) { filter { eq("id", uid) } }.decodeSingleOrNull<LogRow>()
        val log = mutableMapOf<String, Int>()
        (row?.log as? JsonObject)?.forEach { (day, subjects) ->
            log[day] = (subjects as? JsonObject)?.values?.sumOf { ((it as? JsonPrimitive)?.doubleOrNull ?: 0.0).toInt() } ?: 0
        }
        // A still-open session only reaches study_log when it stops: add it on top, like the web.
        sb.from("study_sessions").select { filter { eq("user_id", uid); exact("ended_at", null) } }.decodeList<OpenSessionRow>().firstOrNull()?.let { s ->
            val end = ms(s.pausedAt) ?: System.currentTimeMillis()
            val secs = ((end - (ms(s.startedAt) ?: end)) / 1000 - (s.pausedSecs ?: 0)).toInt()
            if (secs > 0) { val k = dayKey(LocalDate.now(ZoneOffset.UTC)); log[k] = (log[k] ?: 0) + secs }
        }
        val today = LocalDate.now(ZoneOffset.UTC)
        val week = (6 downTo 0).map { i ->
            val d = today.minusDays(i.toLong())
            StudyDay(d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.US), (log[dayKey(d)] ?: 0) / 60, i == 0)
        }
        var streak = 0; var d = today
        while ((log[dayKey(d)] ?: 0) > 0) { streak++; d = d.minusDays(1) }
        return StudyProgress(week, streak, (log[dayKey(today)] ?: 0) / 60)
    }

    // ── live study session (one open row per user, server-enforced) ──

    /** Starts this user's study session (in a room when groupId is set). Adopts one already open elsewhere. Returns its id. */
    suspend fun startSession(subject: String, groupId: String?): String? = try {
        sb.postgrest.rpc("rpc_start_study_session", buildJsonObject {
            put("p_group_id", groupId?.let { JsonPrimitive(it) } ?: JsonNull); put("p_subject", subject)
        }).decodeAs<OpenSessionRow>().id
    } catch (e: Exception) {
        if (e.message?.contains("already running", true) == true)
            sb.from("study_sessions").select { filter { eq("user_id", uid); exact("ended_at", null) } }.decodeList<OpenSessionRow>().firstOrNull()?.id
        else null
    }

    /** Closes the session and adds its time to study_log, exactly once (migration 0067). */
    suspend fun stopSession(id: String) {
        sb.postgrest.rpc("rpc_stop_study_session_logged", buildJsonObject { put("p_session_id", id) })
    }

    // ── time without a session (Quick Timer, or a session the server never accepted) ──

    private fun queue(ctx: Context) = ctx.getSharedPreferences("study_log_queue", Context.MODE_PRIVATE)

    /** Queues seconds for today under subject, then sends the queue; kept until sent so offline time isn't lost. */
    suspend fun logTime(ctx: Context, subject: String, seconds: Int) {
        if (seconds < 1) return
        val key = "${dayKey(LocalDate.now(ZoneOffset.UTC))}|$subject"
        val q = queue(ctx)
        synchronized(this) { q.edit().putInt(key, q.getInt(key, 0) + seconds).apply() }
        flushTime(ctx)
    }

    suspend fun flushTime(ctx: Context) {
        val q = queue(ctx)
        for ((key, v) in q.all) {
            val secs = v as? Int ?: continue
            val (day, subject) = key.split("|", limit = 2).let { it[0] to it.getOrElse(1) { "General" } }
            try {
                sb.postgrest.rpc("rpc_log_study_time", buildJsonObject { put("p_subject", subject); put("p_seconds", secs); put("p_day", day) })
                synchronized(this) { val left = q.getInt(key, 0) - secs; q.edit().apply { if (left > 0) putInt(key, left) else remove(key) }.apply() }
            } catch (_: Exception) { return } // retried on the next flush
        }
    }

    // ── shared plan running state ──

    suspend fun planState(): PlanState? =
        sb.from("study_plans").select(Columns.list("active_task_id", "running", "anchor_at", "updated_by", "updated_at")) { filter { eq("user_id", uid) } }
            .decodeSingleOrNull<PlanRow>()?.let { PlanState(it.activeTaskId, it.running, ms(it.anchorAt), it.updatedBy, ms(it.updatedAt) ?: 0) }

    suspend fun taskProgress(id: String): TaskProgress? =
        sb.from("study_plan_tasks").select(Columns.list("id", "mode", "pomodoro_phase", "pomodoro_total", "pomodoro_remaining", "regular_elapsed")) {
            filter { eq("user_id", uid); eq("id", id) }
        }.decodeSingleOrNull<ProgressRow>()?.let { TaskProgress(it.mode, it.phase, it.total, it.remaining, it.elapsed) }

    /** Saves the active task's timer values, then the plan row (last, as the web does, so realtime readers see both). */
    suspend fun savePlan(activeTaskId: String?, running: Boolean, progress: TaskProgress?) {
        val now = Instant.now().toString()
        if (activeTaskId != null && progress != null) {
            sb.from("study_plan_tasks").update({
                set("mode", progress.mode); set("pomodoro_phase", progress.phase); set("pomodoro_total", progress.total)
                set("pomodoro_remaining", progress.remaining); set("regular_elapsed", progress.elapsed)
                set("updated_by", clientId); set("updated_at", now)
            }) { filter { eq("user_id", uid); eq("id", activeTaskId) } }
        }
        sb.from("study_plans").upsert(buildJsonObject {
            put("user_id", uid); put("active_task_id", activeTaskId?.let { JsonPrimitive(it) } ?: JsonNull); put("running", running && activeTaskId != null)
            put("anchor_at", if (running) JsonPrimitive(now) else JsonNull); put("updated_by", clientId); put("updated_at", now)
        }) { onConflict = "user_id" }
    }
}
