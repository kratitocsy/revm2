package com.wynko.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.user.UserInfo
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

@Serializable
private data class ProfileRow(
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val username: String? = null,
    val bio: String? = null,
    val school: String? = null,
    @SerialName("class_year") val classYear: String? = null,
    val course: String? = null,
    val exam: String? = null,
    @SerialName("daily_focus_goal_minutes") val dailyGoalMinutes: Int? = null,
    @SerialName("reminders_enabled") val remindersEnabled: Boolean? = null,
    @SerialName("allow_battle_invites") val allowBattleInvites: Boolean? = null,
    val preferences: JsonObject? = null,
)

data class SettingsProfile(
    val userId: String,
    val email: String,
    val displayName: String,
    val username: String,
    val bio: String,
    val school: String,
    val classYear: String,
    val course: String,
    val exam: String,
    val dailyGoalMinutes: Int,
    val remindersEnabled: Boolean,
    val allowBattleInvites: Boolean,
    /** Index into the six avatar colours, as the web app stores it (`preferences.avatar_preset`). */
    val avatarPreset: Int,
    /** Sign-in providers on this account ("email", "google", ...). */
    val providers: List<String>,
    /** The preferences object exactly as stored, so saving a toggle never drops keys this app does not know. */
    val rawPreferences: JsonObject,
)

/**
 * Settings data, the same rows and functions as the web dashboard (src/apps/desktop-dashboard/lib/settings.ts,
 * migration 0073): profile fields on the caller's own user_profiles row, username through set_my_username(),
 * email and password through Supabase Auth.
 */
object SettingsRepository {
    private val sb get() = Supabase.client
    private val json get() = BattleRepository.json

    /** Boolean preference keys the web app stores, with its defaults (DEFAULT_PREFERENCES in settings.ts). */
    val PreferenceDefaults: Map<String, Boolean> = mapOf(
        "notif_focus_alerts" to true, "notif_streak" to true, "notif_battle" to true, "notif_rooms" to true,
        "notif_achievements" to true, "sound_effects" to true, "privacy_public_profile" to true,
        "privacy_show_streak" to true, "privacy_show_stats" to true, "privacy_allow_room_invites" to true,
        "focus_auto_start_breaks" to false, "focus_block_distractions" to true, "focus_ambient_sound" to false,
    )

    /** A session handed over by the web pane arrives without its user record, so fetch it when it is missing. */
    private suspend fun user(): UserInfo =
        sb.auth.currentUserOrNull() ?: sb.auth.retrieveUserForCurrentSession(updateSession = true)

    suspend fun load(): SettingsProfile {
        val u = user()
        val data = sb.from("user_profiles").select { filter { eq("id", u.id) } }.data
        val row = json.decodeFromString<List<ProfileRow>>(data).firstOrNull() ?: ProfileRow()
        val prefs = row.preferences ?: JsonObject(emptyMap())
        return SettingsProfile(
            userId = u.id,
            email = u.email.orEmpty(),
            displayName = row.displayName ?: row.fullName ?: "",
            username = row.username.orEmpty(),
            bio = row.bio.orEmpty(),
            school = row.school.orEmpty(),
            classYear = row.classYear.orEmpty(),
            course = row.course.orEmpty(),
            exam = row.exam.orEmpty(),
            dailyGoalMinutes = row.dailyGoalMinutes ?: 180,
            remindersEnabled = row.remindersEnabled ?: true,
            allowBattleInvites = row.allowBattleInvites ?: true,
            avatarPreset = (prefs["avatar_preset"] as? JsonPrimitive)?.intOrNull?.takeIf { it in 0..5 } ?: 0,
            providers = u.identities.orEmpty().map { it.provider },
            rawPreferences = prefs,
        )
    }

    /** The stored boolean preferences over the web app's defaults. */
    fun booleans(raw: JsonObject): Map<String, Boolean> =
        PreferenceDefaults.mapValues { (k, d) -> (raw[k] as? JsonPrimitive)?.booleanOrNull ?: d }

    private suspend fun update(userId: String, patch: JsonObject) {
        sb.from("user_profiles").update(patch) { filter { eq("id", userId) } }
    }

    private fun textOrNull(v: String) = v.trim().let { if (it.isEmpty()) JsonNull else JsonPrimitive(it) }

    suspend fun saveProfile(
        userId: String, displayName: String, bio: String, school: String, classYear: String, course: String, exam: String,
    ) = update(userId, buildJsonObject {
        put("display_name", textOrNull(displayName)); put("bio", textOrNull(bio)); put("school", textOrNull(school))
        put("class_year", textOrNull(classYear)); put("course", textOrNull(course)); put("exam", textOrNull(exam))
    })

    /** Format and uniqueness are checked by the server; returns the username as stored. */
    suspend fun saveUsername(username: String): String {
        val data = sb.postgrest.rpc("set_my_username", buildJsonObject { put("p_username", username) }).data
        return runCatching { json.decodeFromString<String>(data) }.getOrDefault(username)
    }

    suspend fun saveDailyGoal(userId: String, minutes: Int) = update(userId, buildJsonObject { put("daily_focus_goal_minutes", minutes) })

    suspend fun saveReminders(userId: String, on: Boolean) = update(userId, buildJsonObject { put("reminders_enabled", on) })

    suspend fun saveAllowBattleInvites(userId: String, on: Boolean) = update(userId, buildJsonObject { put("allow_battle_invites", on) })

    suspend fun savePreferences(userId: String, preferences: JsonObject) = update(userId, buildJsonObject { put("preferences", preferences) })

    /** Supabase emails a confirmation link; the address only changes once it is confirmed. */
    suspend fun changeEmail(email: String) { sb.auth.updateUser { this.email = email } }

    /** Re-checks the current password first (when the account has one), so an unlocked phone can't be used to take over the login. */
    suspend fun changePassword(email: String, current: String?, next: String) {
        if (current != null) {
            try {
                sb.auth.signInWith(Email) { this.email = email; this.password = current }
            } catch (e: Exception) {
                throw IllegalStateException("Your current password is incorrect.")
            }
        }
        sb.auth.updateUser { password = next }
    }

    /** Same rule as the site: signing out is blocked while a focus timer is running on any device. */
    suspend fun timerRunningElsewhere(userId: String): Boolean = runCatching {
        val data = sb.from("study_sessions").select {
            filter { eq("user_id", userId); exact("ended_at", null); exact("paused_at", null) }
            limit(1)
        }.data
        (json.parseToJsonElement(data) as? JsonArray)?.isNotEmpty() == true
    }.getOrDefault(false) // couldn't verify: don't trap someone whose timer isn't running

    suspend fun deleteAccount() {
        sb.postgrest.rpc("delete_my_account", buildJsonObject { put("p_confirm", "DELETE") })
        runCatching { sb.auth.signOut() }
    }
}
