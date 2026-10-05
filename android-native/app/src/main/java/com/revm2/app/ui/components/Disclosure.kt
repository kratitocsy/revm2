package com.revm2.app.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import com.revm2.app.ui.theme.Wk

/** What each protected permission is used for. Shown *before* sending the user to Settings (Google Play
 * "prominent disclosure" requirement for Accessibility, VPN, Device Admin and Notification access). */
enum class Disclosure(val title: String, val body: String) {
    Accessibility(
        "Allow Wynko to see which app is open?",
        "Wynko uses Android's Accessibility service only to detect which app is in the foreground during a focus session, " +
            "so it can cover apps you chose to block and send you back to your home screen. It does not read what is on your screen, " +
            "your messages, passwords or anything you type, and nothing it sees leaves your phone. It only works while a session is running " +
            "and you can switch it off any time in Settings.",
    ),
    Vpn(
        "Allow a local VPN for website blocking?",
        "Wynko sets up a VPN that stays entirely on your phone. It only looks at the website names (DNS lookups) your phone asks for, " +
            "to refuse the sites you chose to block during a session. It has no remote server, doesn't read page content and doesn't send your browsing anywhere.",
    ),
    DeviceAdmin(
        "Make Wynko harder to remove mid-session?",
        "Device admin means Android asks you to deactivate it before Wynko can be uninstalled. That one extra step is the only thing it does here, " +
            "so quitting a committed session isn't a single tap. It doesn't give Wynko access to your data. You can deactivate it any time in Settings.",
    ),
    NotificationAccess(
        "Silence notifications from blocked apps?",
        "With notification access Wynko dismisses notifications from the apps you blocked while a session is running, so a banner can't pull you back in. " +
            "It only looks at which app posted a notification and never reads or stores their content.",
    ),
    UsageAccess(
        "Show your screen time?",
        "Usage access lets Wynko read how long each app was open today so it can show your biggest distractions. The numbers stay on your phone.",
    ),
}

@Composable
fun DisclosureDialog(d: Disclosure, onAgree: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Wk.Black800,
        title = { WkText(d.title, 17, FontWeight.Bold, Wk.Ink100) },
        text = { WkText(d.body, 13, color = Wk.Ink300, lineHeight = 1.5f) },
        confirmButton = { TextButton(onClick = onAgree) { WkText("Agree and continue", 13, FontWeight.SemiBold, Wk.Orange500) } },
        dismissButton = { TextButton(onClick = onDismiss) { WkText("Not now", 13, color = Wk.Ink400) } },
    )
}
