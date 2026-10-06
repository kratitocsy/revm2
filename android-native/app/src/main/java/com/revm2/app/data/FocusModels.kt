package com.revm2.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Row of public.focus_lock_presets. */
@Serializable
data class FocusPreset(
    val id: String,
    val name: String,
    val sites: List<String> = emptyList(),
    val mode: String = "blacklist",
    val apps: List<String> = emptyList(),
    @SerialName("apps_mode") val appsMode: String = "blacklist",
    @SerialName("no_early_unlock") val noEarlyUnlock: Boolean = false,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    @SerialName("edit_count") val editCount: Int = 0,
)

@Serializable
data class NewFocusPreset(
    @SerialName("user_id") val userId: String,
    val name: String,
    val sites: List<String>,
    val mode: String = "blacklist",
    val apps: List<String>,
    @SerialName("apps_mode") val appsMode: String = "blacklist",
    @SerialName("no_early_unlock") val noEarlyUnlock: Boolean,
    @SerialName("duration_minutes") val durationMinutes: Int?,
)

/** Row of public.focus_lock_sessions. */
@Serializable
data class FocusSession(
    val id: String,
    @SerialName("block_name") val blockName: String = "Block",
    val sites: List<String> = emptyList(),
    val mode: String = "blacklist",
    val apps: List<String> = emptyList(),
    @SerialName("apps_mode") val appsMode: String = "blacklist",
    @SerialName("no_early_unlock") val noEarlyUnlock: Boolean = false,
    @SerialName("ends_at") val endsAt: String? = null,
    val unlimited: Boolean = false,
    val active: Boolean = true,
)

@Serializable
data class NewFocusSession(
    @SerialName("user_id") val userId: String,
    @SerialName("block_name") val blockName: String,
    val sites: List<String>,
    val mode: String,
    val apps: List<String>,
    @SerialName("apps_mode") val appsMode: String,
    @SerialName("no_early_unlock") val noEarlyUnlock: Boolean,
    @SerialName("ends_at") val endsAt: String?,
    val unlimited: Boolean,
    // The web app writes 'web' (also from inside the Capacitor shell); no DB check
    // constraint on this column is visible in supabase_migrations/, so keep that value.
    val source: String = "web",
)
