package com.revm2.app.data

import com.revm2.app.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

/** Single Supabase client, same project as the web app. Session is persisted by supabase-kt and auto-refreshed. */
object Supabase {
    lateinit var client: SupabaseClient
        private set

    fun init() {
        client = createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
            install(Functions)
        }
    }
}
