package com.revm2.app.locking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.revm2.app.data.ScheduleRepository
import com.revm2.app.data.Supabase
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * Background refresh of the member's schedules (armed by [ScheduleAlarms.armSync]): a community schedule accepted
 * on the desktop, or a plan saved there, starts being enforced on the phone within ~15 minutes even if Wynko isn't
 * opened. With no network it keeps enforcing the saved copy.
 */
class ScheduleSyncReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val done = goAsync()
        val ctx = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                withTimeout(9_000) {
                    Supabase.client.auth.awaitInitialization()
                    if (Supabase.client.auth.currentUserOrNull() != null) ScheduleRepository.refresh(ctx)
                }
            } catch (_: Exception) { /* offline or signed out: keep the saved schedules */ }
            try { ScheduleEnforcer.evaluate(ctx); ScheduleAlarms.rearm(ctx) } catch (_: Exception) {}
            done.finish()
        }
    }
}
