package com.revm2.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.OffsetDateTime

// ── UI-facing models ──

data class Profile(
    val id: String, val email: String, val displayName: String, val username: String, val bio: String,
    val school: String, val classYear: String, val course: String, val exam: String,
    val dailyGoalMinutes: Int, val streak: Int, val battleXp: Int, val allowBattleInvites: Boolean,
    val preferences: JsonObject,
)

data class Notif(val id: String, val title: String, val body: String, val whenText: String, val read: Boolean)
data class Battler(val id: String, val name: String, val title: String, val xp: Int, val medal: String?)
data class BattleStats(val total: Int = 0, val wins: Int = 0, val losses: Int = 0, val focusSeconds: Int = 0)
data class BattleInvite(val id: String, val fromName: String, val title: String)
data class BattleHub(val xp: Int, val title: String, val stats: BattleStats, val incoming: List<BattleInvite>, val outgoingId: String?, val outgoingName: String?)
data class BattleResult(val won: Boolean, val opponent: String, val whenText: String)
data class CoinPack(val id: String, val name: String, val coins: Int, val price: Int, val popular: Boolean = false)
data class PlanTask(val id: String, val subject: String, val topic: String, val minutes: Int, val done: Boolean)

// ── wire rows (only the columns we read) ──

@Serializable
private data class ProfileRow(
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val username: String? = null, val bio: String? = null, val school: String? = null,
    @SerialName("class_year") val classYear: String? = null, val course: String? = null, val exam: String? = null,
    @SerialName("daily_focus_goal_minutes") val goal: Int? = null,
    @SerialName("current_streak") val streak: Int? = null,
    @SerialName("battle_xp") val battleXp: Int? = null,
    @SerialName("allow_battle_invites") val allowBattleInvites: Boolean? = null,
    val preferences: JsonElement? = null,
)

@Serializable private data class WalletRow(val coins: Int = 0)

@Serializable
private data class TaskRow(
    val id: String, val subject: String = "General", val topic: String = "",
    @SerialName("pomodoro_total") val total: Int? = null,
    val completed: Boolean = false, val position: Int = 0,
    @SerialName("plan_date") val planDate: String? = null,
)

@Serializable
private data class TaskInsert(
    @SerialName("user_id") val userId: String, val id: String, val subject: String, val topic: String,
    val mode: String, @SerialName("pomodoro_total") val total: Int, @SerialName("pomodoro_remaining") val remaining: Int,
    @SerialName("regular_elapsed") val elapsed: Int, val completed: Boolean, val position: Int,
    @SerialName("plan_date") val planDate: String,
)

@Serializable
private data class NotifRow(val id: String, val title: String, val body: String? = null, val read: Boolean = false, @SerialName("created_at") val createdAt: String)

@Serializable private data class BattlerRow(val id: String, val username: String? = null, @SerialName("battle_xp") val xp: Int? = 0, val title: String? = null)

@Serializable private data class HubMe(val xp: Int = 0, val title: String = "Rookie")
@Serializable private data class HubStats(val total: Int = 0, val wins: Int = 0, val losses: Int = 0, @SerialName("total_focus_seconds") val focus: Int = 0)
@Serializable private data class HubIncoming(val id: String, val username: String? = null, val title: String? = null)
@Serializable private data class HubOutgoing(val id: String, val username: String? = null)
@Serializable
private data class HubRow(
    val me: HubMe = HubMe(), val stats: HubStats = HubStats(),
    @SerialName("incoming_invites") val incoming: List<HubIncoming> = emptyList(),
    @SerialName("outgoing_invite") val outgoing: HubOutgoing? = null,
)

@Serializable
private data class HistoryRow(
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("opponent_username") val opponent: String? = null,
    val result: String = "lost", @SerialName("focus_seconds") val focusSeconds: Int? = 0,
)

@Serializable
private data class PackRow(val id: String, val name: String, val coins: Int, @SerialName("bonus_pct") val bonus: Int? = null, @SerialName("price_inr") val price: Double = 0.0, val popular: Boolean = false)

/** Reads/writes the same tables and RPCs the web app uses. Money and XP are server-owned: nothing here writes them. */
object AppRepository {
    private val sb get() = Supabase.client
    private val user get() = sb.auth.currentUserOrNull() ?: error("Not signed in")

    // ── profile + preferences ──

    suspend fun profile(): Profile {
        val u = user
        val r = sb.from("user_profiles").select {
            filter { eq("id", u.id) }
        }.decodeSingleOrNull<ProfileRow>() ?: ProfileRow()
        return Profile(
            id = u.id, email = u.email ?: "", displayName = r.displayName ?: r.fullName ?: "", username = r.username ?: "",
            bio = r.bio ?: "", school = r.school ?: "", classYear = r.classYear ?: "", course = r.course ?: "", exam = r.exam ?: "",
            dailyGoalMinutes = r.goal ?: 180, streak = r.streak ?: 0, battleXp = r.battleXp ?: 0,
            allowBattleInvites = r.allowBattleInvites ?: true, preferences = r.preferences as? JsonObject ?: JsonObject(emptyMap()),
        )
    }

    /** Writes the whole preferences object back, keeping keys this app doesn't know about (as the web app does). */
    suspend fun savePreferences(existing: JsonObject, changed: Map<String, Boolean>) {
        val merged = JsonObject(existing + changed.mapValues { JsonPrimitive(it.value) })
        sb.from("user_profiles").update({ set("preferences", merged) }) { filter { eq("id", user.id) } }
    }

    suspend fun saveProfile(displayName: String, bio: String, school: String, classYear: String, course: String, exam: String, goalMinutes: Int) {
        sb.from("user_profiles").update({
            set("display_name", displayName.trim().ifBlank { null })
            set("bio", bio.trim().ifBlank { null })
            set("school", school.trim().ifBlank { null })
            set("class_year", classYear.ifBlank { null })
            set("course", course.ifBlank { null })
            set("exam", exam.ifBlank { null })
            set("daily_focus_goal_minutes", goalMinutes)
        }) { filter { eq("id", user.id) } }
    }

    /** Server checks format and uniqueness; returns the saved username. */
    suspend fun setUsername(username: String): String =
        sb.postgrest.rpc("set_my_username", buildJsonObject { put("p_username", username) }).decodeAs<String>()

    suspend fun coins(): Int =
        sb.from("user_wallets").select { filter { eq("user_id", user.id) } }.decodeSingleOrNull<WalletRow>()?.coins ?: 0

    // ── study plan tasks (study_plan_tasks, shared with the web/desktop plan) ──

    /** Today's tasks: undated ones plus those planned for today. */
    suspend fun tasks(): List<PlanTask> {
        val today = LocalDate.now().toString()
        return sb.from("study_plan_tasks").select {
            filter { eq("user_id", user.id) }
            order("position", Order.ASCENDING)
        }.decodeList<TaskRow>()
            .filter { it.planDate == null || it.planDate.take(10) == today }
            .map { PlanTask(it.id, it.subject, it.topic, (it.total ?: 0).let { s -> if (s > 0) s / 60 else 45 }, it.completed) }
    }

    suspend fun addTask(t: PlanTask, position: Int) {
        val secs = t.minutes * 60
        sb.from("study_plan_tasks").insert(
            TaskInsert(user.id, t.id, t.subject, t.topic, "pomodoro", secs, secs, 0, false, position, LocalDate.now().toString())
        )
    }

    suspend fun setTaskDone(id: String, done: Boolean) {
        sb.from("study_plan_tasks").update({ set("completed", done) }) { filter { eq("user_id", user.id); eq("id", id) } }
    }

    suspend fun deleteTask(id: String) {
        sb.from("study_plan_tasks").delete { filter { eq("user_id", user.id); eq("id", id) } }
    }

    // ── notifications ──

    suspend fun notifications(limit: Long = 30): List<Notif> =
        sb.from("notifications").select {
            order("created_at", Order.DESCENDING); limit(limit)
        }.decodeList<NotifRow>().map { Notif(it.id, it.title, it.body ?: "", ago(it.createdAt), it.read) }

    suspend fun markNotificationsRead() { sb.postgrest.rpc("mark_my_notifications_read") }

    // ── battleground (all through the same security-definer RPCs as web) ──

    suspend fun battleHub(): BattleHub {
        val h = sb.postgrest.rpc("get_battleground_state").decodeAs<HubRow>()
        return BattleHub(
            xp = h.me.xp, title = h.me.title, stats = BattleStats(h.stats.total, h.stats.wins, h.stats.losses, h.stats.focus),
            incoming = h.incoming.map { BattleInvite(it.id, it.username ?: "someone", it.title ?: "") },
            outgoingId = h.outgoing?.id, outgoingName = h.outgoing?.username ?: "opponent",
        )
    }

    suspend fun topBattlers(limit: Int = 10): List<Battler> =
        sb.postgrest.rpc("get_top_battlers", buildJsonObject { put("p_limit", limit) }).decodeList<BattlerRow>()
            .mapIndexed { i, b -> Battler(b.id, b.username ?: "player", b.title ?: "", b.xp ?: 0, listOf("🥇", "🥈", "🥉").getOrNull(i)) }

    suspend fun searchOpponents(query: String): List<Battler> =
        sb.postgrest.rpc("search_battle_opponents", buildJsonObject { put("p_query", query); put("p_limit", 20) }).decodeList<BattlerRow>()
            .map { Battler(it.id, it.username ?: "player", it.title ?: "", it.xp ?: 0, null) }

    suspend fun battleHistory(limit: Int = 20): List<BattleResult> =
        sb.postgrest.rpc("get_battle_history", buildJsonObject { put("p_limit", limit) }).decodeList<HistoryRow>()
            .map { BattleResult(it.result == "won", it.opponent ?: "player", "${ago(it.endedAt)} ago · ${(it.focusSeconds ?: 0) / 60}m focused") }

    suspend fun sendChallenge(toUserId: String) { sb.postgrest.rpc("send_battle_challenge", buildJsonObject { put("p_to_user", toUserId) }) }
    suspend fun cancelChallenge(invitationId: String) { sb.postgrest.rpc("cancel_battle_challenge", buildJsonObject { put("p_invitation_id", invitationId) }) }
    suspend fun respondChallenge(invitationId: String, accept: Boolean) {
        sb.postgrest.rpc("respond_battle_challenge", buildJsonObject { put("p_invitation_id", invitationId); put("p_accept", accept) })
    }

    // ── coin packs (display only; purchase is Razorpay + server-side grant) ──

    suspend fun coinPacks(): List<CoinPack> =
        sb.from("coin_packages").select { order("price_inr", Order.ASCENDING) }.decodeList<PackRow>()
            .map { CoinPack(it.id, it.name, it.coins + it.coins * (it.bonus ?: 0) / 100, it.price.toInt(), it.popular) }

    private fun ago(iso: String?): String {
        val t = try { OffsetDateTime.parse(iso ?: return "").toInstant().toEpochMilli() } catch (e: Exception) { return "" }
        val mins = ((System.currentTimeMillis() - t) / 60_000).coerceAtLeast(0)
        return when {
            mins < 1 -> "now"; mins < 60 -> "${mins}m"; mins < 60 * 24 -> "${mins / 60}h"
            mins < 60 * 24 * 7 -> "${mins / (60 * 24)}d"; else -> "${mins / (60 * 24 * 7)}w"
        }
    }
}
