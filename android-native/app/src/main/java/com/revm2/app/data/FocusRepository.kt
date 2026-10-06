package com.revm2.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import java.time.Instant

object FocusRepository {
    private val sb get() = Supabase.client
    private val userId get() = sb.auth.currentUserOrNull()?.id ?: error("Not signed in")

    suspend fun presets(): List<FocusPreset> =
        sb.from("focus_lock_presets").select {
            filter { eq("user_id", userId) }
            order("created_at", Order.DESCENDING)
        }.decodeList()

    suspend fun createPreset(p: NewFocusPreset) {
        sb.from("focus_lock_presets").insert(p)
    }

    suspend fun deletePreset(id: String) {
        sb.from("focus_lock_presets").delete { filter { eq("id", id) } }
    }

    suspend fun activeSession(): FocusSession? =
        sb.from("focus_lock_sessions").select {
            filter {
                eq("user_id", userId)
                eq("active", true)
            }
        }.decodeList<FocusSession>().firstOrNull()

    /** Inserts the session row (a unique index rejects a second active block). Returns the created row. */
    suspend fun startSession(
        name: String, sites: List<String>, mode: String, apps: List<String>, appsMode: String,
        minutes: Int?, noEarlyUnlock: Boolean,
    ): FocusSession {
        val endsAt = minutes?.let { Instant.now().plusSeconds(it * 60L).toString() }
        return sb.from("focus_lock_sessions").insert(
            NewFocusSession(
                userId = userId, blockName = name, sites = sites, mode = mode,
                apps = apps, appsMode = appsMode,
                noEarlyUnlock = noEarlyUnlock && minutes != null, // same rule as blocks.html
                endsAt = endsAt, unlimited = minutes == null,
            )
        ) { select() }.decodeSingle()
    }

    /** Stopping early is recorded as unverified, same as the web/mobile path in blocks.html. */
    suspend fun stopSession(verified: Boolean) {
        sb.from("focus_lock_sessions").update({
            set("active", false)
            set("verified", verified)
        }) {
            filter {
                eq("user_id", userId)
                eq("active", true)
            }
        }
    }
}
