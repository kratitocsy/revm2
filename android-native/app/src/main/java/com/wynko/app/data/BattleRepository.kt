package com.wynko.app.data

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class BattleMe(val xp: Int = 0, val title: String = "Rookie")

@Serializable
data class ActiveBattle(
    val id: String,
    val status: String = "pending", // "pending" (ready-up) | "active"
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("opponent_id") val opponentId: String = "",
    @SerialName("opponent_username") val opponentUsername: String? = null,
    @SerialName("i_am_ready") val iAmReady: Boolean = false,
    @SerialName("opponent_ready") val opponentReady: Boolean = false,
)

@Serializable
data class BattleInvite(
    val id: String,
    @SerialName("expires_at") val expiresAt: String? = null,
    val username: String? = null,
    val title: String? = null,
)

@Serializable
data class BattleStats(
    val total: Int = 0,
    val wins: Int = 0,
    val losses: Int = 0,
    @SerialName("total_focus_seconds") val totalFocusSeconds: Int = 0,
)

@Serializable
data class BattlegroundState(
    val me: BattleMe = BattleMe(),
    val active: ActiveBattle? = null,
    @SerialName("outgoing_invite") val outgoingInvite: BattleInvite? = null,
    @SerialName("incoming_invites") val incomingInvites: List<BattleInvite> = emptyList(),
    val stats: BattleStats = BattleStats(),
)

@Serializable
data class BattleOpponent(
    val id: String,
    val username: String? = null,
    @SerialName("battle_xp") val battleXp: Int = 0,
    val title: String = "Rookie",
)

@Serializable
data class BattleHistoryRow(
    val id: String,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("opponent_username") val opponentUsername: String? = null,
    val result: String = "lost", // "won" | "lost"
    @SerialName("focus_seconds") val focusSeconds: Int = 0,
    @SerialName("xp_earned") val xpEarned: Int = 0,
)

/**
 * 1v1 focus duels, the same security-definer RPCs the web dashboard calls (src/apps/desktop-dashboard/lib/battleground.ts,
 * migrations 0062/0072/0073). Challenge, accept, ready and pause are all validated server-side; nothing here decides a result.
 */
object BattleRepository {
    private val pg get() = Supabase.client.postgrest
    internal val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    private suspend fun call(fn: String, args: JsonObject? = null): String =
        (if (args == null) pg.rpc(fn) else pg.rpc(fn, args)).data

    suspend fun state(): BattlegroundState = json.decodeFromString(call("get_battleground_state"))

    suspend fun searchOpponents(query: String, limit: Int = 20): List<BattleOpponent> =
        json.decodeFromString(call("search_battle_opponents", buildJsonObject { put("p_query", query); put("p_limit", limit) }))

    suspend fun topBattlers(limit: Int = 10): List<BattleOpponent> =
        json.decodeFromString(call("get_top_battlers", buildJsonObject { put("p_limit", limit) }))

    suspend fun history(limit: Int = 30): List<BattleHistoryRow> =
        json.decodeFromString(call("get_battle_history", buildJsonObject { put("p_limit", limit) }))

    suspend fun challenge(toUserId: String) { call("send_battle_challenge", buildJsonObject { put("p_to_user", toUserId) }) }

    suspend fun cancelChallenge(invitationId: String) { call("cancel_battle_challenge", buildJsonObject { put("p_invitation_id", invitationId) }) }

    suspend fun respond(invitationId: String, accept: Boolean) {
        call("respond_battle_challenge", buildJsonObject { put("p_invitation_id", invitationId); put("p_accept", accept) })
    }

    suspend fun ready(battleId: String) { call("ready_battle", buildJsonObject { put("p_battle_id", battleId) }) }

    suspend fun cancelPending(battleId: String) { call("cancel_pending_battle", buildJsonObject { put("p_battle_id", battleId) }) }

    /** The caller loses: "whoever pauses first loses" is the whole rule. */
    suspend fun pause(battleId: String) { call("pause_battle", buildJsonObject { put("p_battle_id", battleId) }) }
}

/** First line of a Supabase error (the server's `raise exception` text), or [fallback]. */
fun errorText(e: Throwable, fallback: String): String {
    val m = e.message?.lineSequence()?.firstOrNull()?.trim().orEmpty()
    return when {
        m.isEmpty() -> fallback
        m.contains("rate limit", ignoreCase = true) -> "Too many attempts. Please wait a bit and try again."
        m.length > 140 -> fallback
        else -> m.replaceFirstChar { it.uppercase() }
    }
}

/** Epoch millis of a Postgres timestamptz as JSON ("2026-10-25T12:34:56.123456+00:00"), or null. */
fun parseTimestampMs(s: String?): Long? =
    s?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
