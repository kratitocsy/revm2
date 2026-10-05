package com.revm2.app.ui.blocks

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.revm2.app.locking.LockingController

/**
 * Phase 1 blocks screen: the four lock permissions plus a start/stop test
 * session, proving the native locking code works without any JS bridge.
 * Phase 2 replaces this with schedules/presets/slots from Supabase.
 */
@Composable
fun BlocksScreen() {
    val ctx: Context = LocalContext.current
    var perms by remember { mutableStateOf(LockingController.permissions(ctx)) }
    var active by remember { mutableStateOf(LockingController.sessionState(ctx).active) }

    // Permissions are granted in system screens; re-check when we come back.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        perms = LockingController.permissions(ctx)
        active = LockingController.sessionState(ctx).active
    }
    val vpnLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        perms = LockingController.permissions(ctx)
    }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Focus lock", style = MaterialTheme.typography.headlineSmall)
        PermRow("Accessibility (detect blocked apps)", perms.accessibility) { LockingController.requestAccessibility(ctx) }
        PermRow("Overlay (block screen)", perms.overlay) { LockingController.requestOverlay(ctx) }
        PermRow("VPN (block websites)", perms.vpn) {
            LockingController.vpnConsentIntent(ctx)?.let(vpnLauncher::launch)
        }
        PermRow("Device admin (uninstall friction)", perms.deviceAdmin) { LockingController.requestDeviceAdmin(ctx) }

        Spacer(Modifier.height(8.dp))
        if (active) {
            Button(onClick = {
                LockingController.endSession(ctx)
                active = false
            }) { Text("End test session") }
        } else {
            Button(
                enabled = perms.accessibility && perms.overlay,
                onClick = {
                    // Placeholder block list; Phase 2 feeds this from the user's presets.
                    LockingController.startSession(ctx, "test-session", apps = emptyList(), domains = listOf("example.com"))
                    active = true
                },
            ) { Text("Start test session") }
        }
    }
}

@Composable
private fun PermRow(label: String, granted: Boolean, onGrant: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        if (granted) Text("Granted", color = MaterialTheme.colorScheme.primary)
        else OutlinedButton(onClick = onGrant) { Text("Grant") }
    }
}
