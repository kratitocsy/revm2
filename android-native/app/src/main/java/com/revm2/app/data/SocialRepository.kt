package com.revm2.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Row shapes of the web's lib/studyRooms.ts and lib/communities.ts (same RPCs, migrations 0070/0071).

@Serializable
data class RoomRow(
    val id: String, val name: String, val description: String? = null, val subject: String? = null,
    val visibility: String = "public", @SerialName("has_password") val hasPassword: Boolean = false,
    @SerialName("is_official") val isOfficial: Boolean = false,
    @SerialName("member_count") val memberCount: Int = 0, @SerialName("member_limit") val memberLimit: Int = 0,
    @SerialName("live_count") val liveCount: Int = 0, @SerialName("is_member") val isMember: Boolean = false,
    @SerialName("my_role") val myRole: String? = null,
    @SerialName("preview_initials") val previewInitials: List<String>? = null,
)

@Serializable
data class RoomMemberRow(
    @SerialName("user_id") val userId: String, val name: String = "", val role: String = "member",
    @SerialName("is_me") val isMe: Boolean = false, @SerialName("is_live") val isLive: Boolean = false,
    @SerialName("is_paused") val isPaused: Boolean = false, @SerialName("started_at") val startedAt: String? = null,
    val subject: String? = null, @SerialName("today_seconds") val todaySeconds: Int = 0,
)

@Serializable
data class RoomMessageRow(val id: String, @SerialName("sender_id") val senderId: String, val body: String, @SerialName("created_at") val createdAt: String)

@Serializable
data class MyCommunityRow(
    val id: String, val name: String, val description: String? = null, val emoji: String? = null,
    @SerialName("member_count") val memberCount: Int = 0, @SerialName("live_count") val liveCount: Int = 0,
    @SerialName("my_role") val myRole: String = "member", @SerialName("is_home") val isHome: Boolean? = null,
    @SerialName("home_locked_until") val homeLockedUntil: String? = null, @SerialName("head_name") val headName: String = "",
    @SerialName("join_requires_approval") val joinRequiresApproval: Boolean = false,
    @SerialName("invite_token") val inviteToken: String? = null,
    @SerialName("preview_initials") val previewInitials: List<String>? = null,
)

@Serializable
data class DiscoverRow(
    val id: String, val name: String, val description: String? = null, val emoji: String? = null,
    @SerialName("member_count") val memberCount: Int = 0, @SerialName("head_name") val headName: String = "",
    @SerialName("join_requires_approval") val joinRequiresApproval: Boolean = false,
    val requested: Boolean = false, @SerialName("is_private") val isPrivate: Boolean = false,
)

@Serializable data class DetailHead(val name: String = "")
@Serializable
data class DetailMy(
    @SerialName("today_minutes") val todayMinutes: Int = 0, @SerialName("today_sessions") val todaySessions: Int = 0,
    @SerialName("total_minutes") val totalMinutes: Int = 0, @SerialName("total_sessions") val totalSessions: Int = 0,
    @SerialName("weekly_minutes") val weeklyMinutes: List<Int> = emptyList(), val adherence: Double? = null,
)
@Serializable
data class CommunityDetail(
    val head: DetailHead = DetailHead(), @SerialName("member_count") val memberCount: Int = 0,
    @SerialName("studying_now") val studyingNow: Int = 0, val my: DetailMy = DetailMy(),
)

@Serializable
data class AnnouncementRow(val id: String, val title: String, val message: String, val pinned: Boolean = false, val important: Boolean = false, @SerialName("created_at") val createdAt: String)

@Serializable
data class CommunityScheduleRow(
    @SerialName("group_id") val groupId: String, val name: String = "", val week: JsonElement? = null,
    @SerialName("published_at") val publishedAt: String? = null, @SerialName("published_by_name") val publishedByName: String? = null,
    val choice: String? = null, @SerialName("is_admin") val isAdmin: Boolean = false,
)

@Serializable
data class HeadOverview(
    val members: Int = 0, @SerialName("active_today") val activeToday: Int = 0,
    @SerialName("avg_daily_minutes") val avgDailyMinutes: Int = 0, @SerialName("avg_adherence") val avgAdherence: Double? = null,
    @SerialName("studying_now") val studyingNow: Int = 0, @SerialName("current_subject") val currentSubject: String? = null,
)

@Serializable
data class StudentRow(
    @SerialName("user_id") val userId: String, val name: String = "", @SerialName("study_minutes") val studyMinutes: Int = 0,
    @SerialName("streak_days") val streakDays: Int = 0, val adherence: Double? = null,
)

@Serializable data class JoinRequestRow(val id: String, val name: String = "", val note: String? = null)
@Serializable private data class JoinResultRow(val status: String = "invalid", @SerialName("group_id") val groupId: String? = null)

object SocialRepository {
    private val sb get() = Supabase.client
    private val rpc get() = sb.postgrest
    val myId: String? get() = sb.auth.currentUserOrNull()?.id

    // ── study rooms ──
    suspend fun rooms(): List<RoomRow> = rpc.rpc("list_study_rooms").decodeList()

    /** "joined" | "already_member" | "wrong_password" | "full" | "invite_only" */
    suspend fun joinRoom(id: String, password: String?): String =
        rpc.rpc("rpc_join_study_room", buildJsonObject { put("p_group_id", id); put("p_password", password?.let { JsonPrimitive(it) } ?: JsonNull) }).decodeAs()

    suspend fun leaveRoom(id: String) { rpc.rpc("rpc_leave_study_room", buildJsonObject { put("p_group_id", id) }) }

    suspend fun createRoom(name: String, subject: String, desc: String, isPublic: Boolean, password: String): String =
        rpc.rpc("rpc_create_study_room", buildJsonObject {
            put("p_name", name); put("p_description", desc); put("p_subject", subject); put("p_is_public", isPublic)
            put("p_password", if (isPublic) JsonNull else JsonPrimitive(password))
        }).decodeAs()

    suspend fun roomMembers(id: String): List<RoomMemberRow> = rpc.rpc("room_members", buildJsonObject { put("p_group_id", id) }).decodeList()

    suspend fun roomMessages(id: String): List<RoomMessageRow> =
        sb.from("group_messages").select(io.github.jan.supabase.postgrest.query.Columns.list("id", "sender_id", "body", "created_at")) {
            filter { eq("group_id", id); exact("deleted_at", null) }
            order("created_at", Order.DESCENDING); limit(50)
        }.decodeList<RoomMessageRow>().reversed()

    suspend fun sendRoomMessage(id: String, body: String) {
        sb.from("group_messages").insert(buildJsonObject { put("group_id", id); put("sender_id", myId ?: error("Not signed in")); put("body", body) })
    }

    // ── communities ──
    suspend fun myCommunities(): List<MyCommunityRow> = rpc.rpc("my_communities").decodeList()
    suspend fun discover(): List<DiscoverRow> = rpc.rpc("discover_communities").decodeList()

    /** Returns the join status ("joined", "requested", "already_member", "full", "invalid", "password_required", "wrong_password"). */
    suspend fun joinCommunity(groupId: String? = null, token: String? = null, password: String? = null): String {
        val rows = rpc.rpc("rpc_join_community", buildJsonObject {
            put("p_group_id", groupId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("p_token", token?.let { JsonPrimitive(it) } ?: JsonNull)
            put("p_note", JsonNull)
            if (!password.isNullOrBlank()) put("p_password", password)
        }).decodeList<JoinResultRow>()
        return rows.firstOrNull()?.status ?: "invalid"
    }

    /** Pulls the token out of a pasted invite link (…?community=<token>) or takes a bare code. */
    fun parseInvite(input: String): String {
        val s = input.trim()
        return try {
            val q = java.net.URI(s).rawQuery ?: return s
            q.split("&").map { it.split("=", limit = 2) }.firstOrNull { it[0] == "community" || it[0] == "invite" }
                ?.getOrNull(1)?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: s
        } catch (_: Exception) { s }
    }

    suspend fun leaveCommunity(id: String) { rpc.rpc("rpc_leave_community", buildJsonObject { put("p_group_id", id) }) }
    suspend fun setHomeCommunity(id: String) { rpc.rpc("rpc_set_home_community", buildJsonObject { put("p_group_id", id) }) }
    suspend fun detail(id: String): CommunityDetail = rpc.rpc("community_detail", buildJsonObject { put("p_group_id", id) }).decodeAs()

    suspend fun announcements(id: String): List<AnnouncementRow> =
        sb.from("community_announcements").select(io.github.jan.supabase.postgrest.query.Columns.list("id", "title", "message", "pinned", "important", "created_at")) {
            filter { eq("group_id", id) }; order("created_at", Order.DESCENDING); limit(100)
        }.decodeList()

    suspend fun postAnnouncement(id: String, title: String, message: String, pinned: Boolean, important: Boolean) {
        sb.from("community_announcements").insert(buildJsonObject { put("group_id", id); put("title", title); put("message", message); put("pinned", pinned); put("important", important) })
    }
    suspend fun deleteAnnouncement(id: String) { sb.from("community_announcements").delete { filter { eq("id", id) } } }

    suspend fun mySchedules(): List<CommunityScheduleRow> = rpc.rpc("my_community_schedules").decodeList()

    /** "accepted" | "rejected" | null (just mark as seen). */
    suspend fun setScheduleChoice(groupId: String, choice: String?) {
        rpc.rpc("rpc_set_schedule_choice", buildJsonObject { put("p_group_id", groupId); put("p_choice", choice?.let { JsonPrimitive(it) } ?: JsonNull) })
    }

    suspend fun createCommunity(name: String, description: String, emoji: String?): String =
        rpc.rpc("rpc_create_community", buildJsonObject {
            put("p_name", name); put("p_description", description.ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
            put("p_emoji", emoji?.let { JsonPrimitive(it) } ?: JsonNull)
        }).decodeAs()

    // ── WynkoHead (community admin) ──
    suspend fun headOverview(id: String): HeadOverview = rpc.rpc("community_head_overview", buildJsonObject { put("p_group_id", id) }).decodeAs()
    suspend fun studentAnalytics(id: String): List<StudentRow> = rpc.rpc("community_student_analytics", buildJsonObject { put("p_group_id", id) }).decodeList()
    suspend fun joinRequests(id: String): List<JoinRequestRow> = rpc.rpc("community_join_request_list", buildJsonObject { put("p_group_id", id) }).decodeList()
    suspend fun decideJoinRequest(requestId: String, approve: Boolean) {
        rpc.rpc("rpc_decide_join_request", buildJsonObject { put("p_request_id", requestId); put("p_approve", approve) })
    }
    suspend fun setRequiresApproval(id: String, value: Boolean) {
        sb.from("study_groups").update({ set("join_requires_approval", value) }) { filter { eq("id", id) } }
    }
}

