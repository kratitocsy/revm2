package com.revm2.app.locking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a reboot (or an app update) pick a still-running session back up: restart the guard service, which also
 * re-opens the DNS tunnel. A timed session that ended while the phone was off is simply dropped by BlockStore. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val a = intent.action
        if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (BlockStore.current(context).active) GuardService.start(context)
    }
}
