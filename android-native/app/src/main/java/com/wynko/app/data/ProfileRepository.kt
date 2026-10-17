package com.wynko.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

@Serializable
private data class ProfileRow(
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val exam: String? = null,
    @SerialName("daily_focus_goal_minutes") val goalMinutes: Int? = null,
    @SerialName("study_log") val studyLog: JsonObject? = null,
)

/** What Home shows about the signed-in student. [dailySeconds] maps a UTC date key ("2026-10-17") to seconds studied that day. */
data class Profile(
    val displayName: String?,
    val exam: String?,
    val goalMinutes: Int,
    val dailySeconds: Map<String, Long>,
)

/** Reads `user_profiles` (the same row the desktop dashboard's Home reads) for name, goal and the per-day study log. */
object ProfileRepository {
    suspend fun load(): Profile? {
        val sb = Supabase.client
        val uid = sb.auth.currentUserOrNull()?.id ?: return null
        val row = sb.from("user_profiles")
            .select(Columns.list("display_name", "full_name", "exam", "daily_focus_goal_minutes", "study_log")) { filter { eq("id", uid) } }
            .decodeSingleOrNull<ProfileRow>() ?: return null
        // study_log: { "2026-10-17": { "Physics": 3600, "Chemistry": 1200 }, ... } in seconds, keyed by UTC date.
        val daily = row.studyLog.orEmpty().mapValues { (_, bySubject) ->
            (bySubject as? JsonObject).orEmpty().values.sumOf { ((it as? JsonPrimitive)?.doubleOrNull ?: 0.0).toLong() }
        }
        return Profile(
            displayName = (row.displayName ?: row.fullName)?.takeIf { it.isNotBlank() },
            exam = row.exam,
            goalMinutes = row.goalMinutes ?: 180,
            dailySeconds = daily,
        )
    }
}
