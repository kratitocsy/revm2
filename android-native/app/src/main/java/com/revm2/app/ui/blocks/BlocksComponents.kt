package com.revm2.app.ui.blocks

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.revm2.app.data.FocusPreset
import com.revm2.app.data.NewFocusPreset
import com.revm2.app.locking.LockingController
import io.github.jan.supabase.auth.auth
import com.revm2.app.data.Supabase

@Composable
fun PermRow(label: String, granted: Boolean, onGrant: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        if (granted) Text("Granted", color = MaterialTheme.colorScheme.primary)
        else OutlinedButton(onClick = onGrant) { Text("Grant") }
    }
}

@Composable
fun ActiveCard(name: String, remainingSeconds: Long?, strict: Boolean, onStop: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Block running", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(name, style = MaterialTheme.typography.titleLarge)
            Text(
                remainingSeconds?.let { formatClock(it) } ?: "No time limit",
                style = MaterialTheme.typography.headlineMedium,
            )
            if (strict) Text("Locked until time is up", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else OutlinedButton(onClick = onStop) { Text("Stop (marks session unverified)") }
        }
    }
}

@Composable
fun PresetCard(p: FocusPreset, canStart: Boolean, onStart: () -> Unit, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(p.name, style = MaterialTheme.typography.titleMedium)
            val bits = buildList {
                add((if (p.mode == "whitelist") "Allow only: " else "Block: ") + p.sites.joinToString(", ").ifBlank { "no sites" })
                add(p.durationMinutes?.let { "${it}m" } ?: "unlimited")
                if (p.apps.isNotEmpty()) add("${p.apps.size} app${if (p.apps.size == 1) "" else "s"} ${if (p.appsMode == "whitelist") "allowed" else "blocked"}")
                if (p.noEarlyUnlock) add("locked")
            }
            Text(bits.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onStart, enabled = canStart) { Text("Start") }
                OutlinedButton(onClick = onDelete) { Text("Remove") }
            }
        }
    }
}

@Composable
fun CreatePresetDialog(ctx: Context, onDismiss: () -> Unit, onSave: (NewFocusPreset) -> Unit) {
    var name by remember { mutableStateOf("") }
    var sites by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("25") }
    var strict by remember { mutableStateOf(false) }
    var allowOnlyApps by remember { mutableStateOf(false) }
    var picked by remember { mutableStateOf(setOf<String>()) }
    var picking by remember { mutableStateOf(false) }
    val apps = remember { LockingController.listInstalledApps(ctx) }

    val mins = minutes.toIntOrNull()?.takeIf { it > 0 }
    val siteList = sites.split(",", " ", "\n").map { it.trim().lowercase().removePrefix("https://").removePrefix("www.") }.filter { it.isNotEmpty() }
    val problem = when {
        name.isBlank() -> "Give it a name"
        siteList.isEmpty() && picked.isEmpty() -> "Add at least one site or app"
        allowOnlyApps && picked.isEmpty() -> "Pick the apps to allow, or switch to blocking apps"
        strict && mins == null -> "Locking needs a duration"
        else -> null
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (picking) "Pick apps" else "New block") },
        text = {
            if (picking) {
                LazyColumn(Modifier.heightIn(max = 400.dp)) {
                    items(apps, key = { it.packageName }) { a ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(a.packageName in picked, { on -> picked = if (on) picked + a.packageName else picked - a.packageName })
                            Text(a.label)
                        }
                    }
                }
            } else {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true)
                    OutlinedTextField(sites, { sites = it }, label = { Text("Sites to block (comma separated)") })
                    OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit) }, label = { Text("Minutes (empty = unlimited)") }, singleLine = true)
                    OutlinedButton(onClick = { picking = true }) { Text("Apps (${picked.size} selected)") }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(allowOnlyApps, { allowOnlyApps = it }); Spacer(Modifier.width(8.dp)); Text("Allow only selected apps")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(strict, { strict = it }); Spacer(Modifier.width(8.dp)); Text("Lock until time is up")
                    }
                    problem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            if (picking) TextButton(onClick = { picking = false }) { Text("Done") }
            else TextButton(enabled = problem == null, onClick = {
                onSave(
                    NewFocusPreset(
                        userId = Supabase.client.auth.currentUserOrNull()!!.id, name = name.trim(), sites = siteList,
                        apps = picked.toList(), appsMode = if (allowOnlyApps) "whitelist" else "blacklist",
                        noEarlyUnlock = strict, durationMinutes = mins,
                    )
                )
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = { if (picking) picking = false else onDismiss() }) { Text(if (picking) "Back" else "Cancel") } },
    )
}

fun formatClock(totalSeconds: Long): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}
