package com.wynko.app.data

import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
private data class StartedSession(val id: String)

/**
 * The same two server calls the desktop Focus Lock page makes: start opens the user's one live `study_sessions` row
 * (the desktop sees it straight away), stop closes it and adds its time to `user_profiles.study_log` exactly once.
 */
object StudySessionRepository {
    /** Returns the new session's id, or null if one could not be opened (for example another device already has one running). */
    suspend fun start(subject: String): String? = runCatching {
        Supabase.client.postgrest.rpc("rpc_start_study_session", buildJsonObject {
            put("p_group_id", JsonNull)
            put("p_subject", subject)
        }).decodeAs<StartedSession>().id
    }.getOrNull()

    suspend fun stop(sessionId: String) {
        Supabase.client.postgrest.rpc("rpc_stop_study_session_logged", buildJsonObject { put("p_session_id", sessionId) })
    }
}
