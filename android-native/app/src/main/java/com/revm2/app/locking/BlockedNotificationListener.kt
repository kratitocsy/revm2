package com.revm2.app.locking

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Silences notifications from blocked apps while a session runs, so a banner can't pull the user back to a
 * blocked app. Needs the user to grant Notification access in Settings; reads only the posting package.
 */
class BlockedNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName || sbn.isOngoing) return
        if (BlockStore.isAppBlocked(this, sbn.packageName)) cancelNotification(sbn.key)
    }

    override fun onListenerConnected() {
        // Clear anything already sitting in the shade from blocked apps when a session starts.
        if (!BlockStore.current(this).active) return
        activeNotifications?.forEach { if (it.packageName != packageName && !it.isOngoing && BlockStore.isAppBlocked(this, it.packageName)) cancelNotification(it.key) }
    }
}
