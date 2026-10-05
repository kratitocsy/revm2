package com.revm2.app.locking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper

/**
 * Foreground service that runs for as long as a focus session does. It is what keeps OEM battery managers from
 * silently killing enforcement (the "don't kill my app" problem) and what ends a timed session on schedule even
 * if the UI process is gone. Shows the standard ongoing notification Android requires for foreground services.
 */
class GuardService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            val s = BlockStore.current(this@GuardService)
            if (!s.active) { stopSelf(); return }
            notify(s)
            handler.postDelayed(this, 30_000)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val s = BlockStore.current(this)
        if (!s.active) { stopSelf(); return START_NOT_STICKY }
        createChannel()
        val n = build(s)
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIF_ID, n)
        // Re-open the DNS tunnel after a reboot / process restart (consent was granted earlier, never prompt here).
        if (android.net.VpnService.prepare(this) == null && s.domainList.isNotEmpty()) {
            startService(Intent(this, RevM2VpnService::class.java).setAction(RevM2VpnService.ACTION_START))
        }
        handler.removeCallbacks(tick); handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        // Session over (or ended): stop the DNS tunnel with it.
        stopService(Intent(this, RevM2VpnService::class.java))
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun build(s: BlockStore.Session): Notification {
        val left = s.remainingSeconds()
        val open = PendingIntent.getActivity(
            this, 0, packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("Focus Lock is on")
            .setContentText(left?.let { "${(it + 59) / 60} min left" } ?: "Session running")
            .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open).build()
    }

    private fun notify(s: BlockStore.Session) =
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, build(s))

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Focus Lock session", NotificationManager.IMPORTANCE_LOW))
        }
    }

    companion object {
        private const val CHANNEL = "focus_lock_session"
        private const val NOTIF_ID = 4201
        fun start(ctx: Context) {
            val i = Intent(ctx, GuardService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
        }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, GuardService::class.java)) }
    }
}
