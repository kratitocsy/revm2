package com.wynko.app.data

import com.wynko.app.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

/** Single Supabase client, same project as the web app. Session is persisted by supabase-kt and auto-refreshed. */
object Supabase {
    lateinit var client: SupabaseClient
        private set

    /**
     * The signed-in user's id. A session handed over by the web pane has no user record attached
     * (`currentUserOrNull()` is null), so fall back to the `sub` claim of the access token.
     */
    fun userIdOrNull(): String? = client.auth.currentUserOrNull()?.id ?: claim("sub")

    fun emailOrNull(): String? = client.auth.currentUserOrNull()?.email ?: claim("email")

    private fun claim(name: String): String? = runCatching {
        val token = client.auth.currentSessionOrNull()?.accessToken ?: return null
        val payload = String(android.util.Base64.decode(token.split('.')[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP))
        (Json.parseToJsonElement(payload).jsonObject[name] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
    }.getOrNull()

    fun init() {
        client = createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
            install(Functions)
        }
    }
}
