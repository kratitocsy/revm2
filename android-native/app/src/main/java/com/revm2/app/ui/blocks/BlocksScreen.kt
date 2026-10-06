package com.revm2.app.ui.blocks

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.revm2.app.data.FocusPreset
import com.revm2.app.locking.LockingController

@Composable
fun BlocksScreen(vm: BlocksViewModel = viewModel()) {
    val ctx: Context = LocalContext.current
    val state by vm.state.collectAsStateWithLifecycle()
    var perms by remember { mutableStateOf(LockingController.permissions(ctx)) }
    var showCreate by remember { mutableStateOf(false) }

    // Permissions are granted in system screens; re-check (and re-sync the session) when we come back.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        perms = LockingController.permissions(ctx)
        vm.refresh(ctx)
    }
    val vpnLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        perms = LockingController.permissions(ctx)
    }
    LaunchedEffect(state.remainingSeconds) { if (state.remainingSeconds == 0L) vm.finishIfExpired(ctx) }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Focus lock", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp)) }

        state.error?.let { msg ->
            item { Text(msg, color = MaterialTheme.colorScheme.error, modifier = Modifier.clickable { vm.clearError() }) }
        }

        state.active?.let { a ->
            item { ActiveCard(a.blockName, state.remainingSeconds, a.noEarlyUnlock) { vm.stop(ctx) } }
        }

        if (!perms.allGranted) {
            item { Text("Permissions", style = MaterialTheme.typography.titleMedium) }
            item { PermRow("Accessibility (detect blocked apps)", perms.accessibility) { LockingController.requestAccessibility(ctx) } }
            item { PermRow("Overlay (block screen)", perms.overlay) { LockingController.requestOverlay(ctx) } }
            item { PermRow("VPN (block websites)", perms.vpn) { LockingController.vpnConsentIntent(ctx)?.let { vpnLauncher.launch(it) } } }
            item { PermRow("Device admin (uninstall friction)", perms.deviceAdmin) { LockingController.requestDeviceAdmin(ctx) } }
        }

        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Saved blocks", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Button(onClick = { showCreate = true }) { Text("New") }
            }
        }
        if (!state.loading && state.presets.isEmpty()) {
            item { Text("No saved blocks yet. Create one to reuse it without retyping sites and durations.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(state.presets, key = { it.id }) { p ->
            PresetCard(
                p, canStart = state.active == null && perms.accessibility && perms.overlay,
                onStart = { vm.start(ctx, p) }, onDelete = { vm.deletePreset(ctx, p.id) },
            )
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showCreate) CreatePresetDialog(ctx, onDismiss = { showCreate = false }) { preset ->
        vm.createPreset(ctx, preset); showCreate = false
    }
}
