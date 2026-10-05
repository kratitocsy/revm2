package com.revm2.app.data

import android.content.Context
import com.revm2.app.schedule.StoredPreset
import com.revm2.app.schedule.StoredSchedule
import com.revm2.app.schedule.StoredSlot
import com.revm2.app.schedule.ScheduleStore
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
private data class ScheduleRow(
    val id: String,
    val name: String,
    @SerialName("days_of_week") val days: List<Int> = emptyList(),
    @SerialName("week_parity") val parity: Int? = null,
    val active: Boolean = true,
)

@Serializable
private data class SlotRow(
    val id: String,
    @SerialName("schedule_id") val scheduleId: String,
    @SerialName("slot_order") val order: Int = 0,
    @SerialName("preset_id") val presetId: String? = null,
    @SerialName("start_time") val start: String,
    @SerialName("end_time") val end: String,
    @SerialName("break_after_minutes") val breakAfter: Int = 0,
    val subject: String? = null,
    @SerialName("is_sleep") val isSleep: Boolean = false,
)

/** Reads the same tables the desktop app and `schedule-tick` use; writes only what the web/desktop edit gates allow. */
object ScheduleRepository {
    private val sb get() = Supabase.client
    private val userId get() = sb.auth.currentUserOrNull()?.id ?: error("Not signed in")

    /** Downloads every schedule (active or not) with its slots and the preset each slot enforces, and caches it for offline use. */
    suspend fun refresh(ctx: Context): List<StoredSchedule> {
        val rows = sb.from("focus_lock_schedules").select { filter { eq("user_id", userId) } }.decodeList<ScheduleRow>()
        val ids = rows.map { it.id }
        val slots = if (ids.isEmpty()) emptyList() else sb.from("focus_lock_schedule_slots").select {
            filter { isIn("schedule_id", ids) }
            order("slot_order", Order.ASCENDING)
        }.decodeList<SlotRow>()
        val presets = FocusRepository.presets().associateBy { it.id }
        val out = rows.map { r ->
            StoredSchedule(
                id = r.id, name = r.name, active = r.active, days = r.days, parity = r.parity,
                slots = slots.filter { it.scheduleId == r.id }.sortedBy { it.order }.map { s ->
                    val p = s.presetId?.let { presets[it] }
                    StoredSlot(
                        id = s.id, start = s.start.take(5), end = s.end.take(5), subject = s.subject?.takeIf { it.isNotBlank() },
                        isSleep = s.isSleep, breakAfterMinutes = s.breakAfter,
                        preset = p?.let { StoredPreset(it.name, it.sites, it.mode, it.apps, it.appsMode, it.noEarlyUnlock) },
                    )
                },
            )
        }
        ScheduleStore.save(ctx, out)
        return out
    }

    suspend fun setActive(id: String, active: Boolean) {
        sb.from("focus_lock_schedules").update({ set("active", active) }) { filter { eq("id", id) } }
    }

    suspend fun delete(id: String) {
        sb.from("focus_lock_schedules").delete { filter { eq("id", id) } }
    }
}
