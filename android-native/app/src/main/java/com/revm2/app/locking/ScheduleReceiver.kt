package com.revm2.app.locking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        try { ScheduleEnforcer.evaluate(context) } catch (e: Exception) { /* never crash from a background alarm */ }
        ScheduleAlarms.rearm(context)
    }
}
