package com.revm2.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.revm2.app.locking.LockingController
import com.revm2.app.locking.UsageStats
import com.revm2.app.ui.components.Disclosure
import com.revm2.app.locking.BlockStore
import com.revm2.app.locking.ShortFormHints
import com.revm2.app.ui.components.DisclosureDialog
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.AllApps
import com.revm2.app.ui.shell.AppViewModel
import com.revm2.app.ui.shell.Dest
import com.revm2.app.ui.shell.SheetKind
import com.revm2.app.ui.shell.WkField
import com.revm2.app.ui.shell.ToggleRow
import com.revm2.app.ui.theme.Wk

@Composable
fun FocusScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    var perms by remember { mutableStateOf(LockingController.permissions(ctx)) }
    var disclosure by remember { mutableStateOf<Disclosure?>(null) }
    var usage by remember { mutableStateOf(UsageStats.today(ctx)) }
    var shortMode by remember { mutableIntStateOf(LockingController.shortFormMode(ctx)) }
    var pendingShortMode by remember { mutableStateOf<Int?>(null) }
    var shortCount by remember { mutableIntStateOf(LockingController.shortFormBlockedToday(ctx)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        perms = LockingController.permissions(ctx)
        usage = UsageStats.today(ctx)
        shortCount = LockingController.shortFormBlockedToday(ctx)
        // If accessibility/VPN/admin was switched off during the last session, say so (the session counts as unverified).
        LockingController.consumeTamper(ctx)?.let { vm.flash("Session unverified: $it") }
    }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { perms = LockingController.permissions(ctx) }
    val vpn = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { perms = LockingController.permissions(ctx) }
    var menu by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    val live = vm.running
    val full = vm.focusFull
    val active = vm.activeTask
    val statusLine = when {
        active != null && live -> "● ${active.subject} — ${active.topic}"
        active != null -> "⏸ Paused · ${active.subject}"
        else -> "Smarter focus. Bigger dreams."
    }
    val caption = when {
        active != null -> if (vm.mode == "pomodoro") (if (vm.phase == "break") "Break Time" else "Study Time") else "Studying"
        vm.mode == "pomodoro" -> "Focus • ${vm.pomoFocus}/${vm.pomoBreak} • ${if (vm.pomoRepeat) "Repeat" else "Once"}"
        else -> "Count Up • No Limit"
    }
    val startLabel = when {
        vm.waitingBreak -> "Start Break"
        active != null && !live && (vm.remaining < vm.phaseTotal || vm.elapsed > 0) -> "Resume"
        else -> "Start"
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Eyebrow("FOCUS LOCK")
                WkText(statusLine, if (full) 14 else 17, FontWeight.SemiBold, Wk.Ink100, maxLines = 2)
                if (live) Pill("Locked", Wk.Green, Modifier.padding(top = 6.dp))
            }
            RoundIconButton(if (full) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen, { vm.focusFull = !full }, 40, Wk.Black800, Wk.Ink400)
        }
        if (!full) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            RoundIconButton(Icons.Filled.Settings, { vm.sheet = SheetKind.Pomodoro }, 40, Wk.Black800, Wk.Ink400)
            Box {
                Row(Modifier.height(36.dp).wkSurface(Color(0x1FFF8A3D), Wk.Orange600, 99.dp).tap { if (!live) menu = true }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    WkText(if (vm.mode == "pomodoro") "Pomodoro" else "Regular", 13, FontWeight.Medium, Wk.Orange200)
                    Icon(Icons.Filled.KeyboardArrowDown, null, tint = Wk.Orange200, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Column { WkText("🍅 Pomodoro Timer", 13, FontWeight.SemiBold, Wk.Ink100); WkText("Focus • ${vm.pomoFocus}/${vm.pomoBreak} • ${if (vm.pomoRepeat) "Repeat" else "Once"}", 11, color = Wk.Ink500) } }, onClick = { vm.setMode("pomodoro"); menu = false })
                    DropdownMenuItem(text = { Column { WkText("⏱ Regular Timer", 13, FontWeight.SemiBold, Wk.Ink100); WkText("Count Up • No Limit", 11, color = Wk.Ink500) } }, onClick = { vm.setMode("regular"); menu = false })
                }
            }
        }

        Column(Modifier.fillMaxWidth().padding(top = if (full) 56.dp else 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val progress = if (vm.mode == "pomodoro") 1f - vm.remaining.toFloat() / vm.phaseTotal else null
            TimerRing(vm.timerText, caption, if (full) 312 else 264, if (vm.mode == "pomodoro") 56 else 44, progress)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryButton(startLabel, { if (vm.waitingBreak) { vm.waitingBreak = false; vm.running = true } else vm.startFocus() }, Modifier.width(140.dp), icon = Icons.Filled.PlayArrow, enabled = !live, color = Wk.Green, height = 52)
                PrimaryButton("Pause", { vm.askPause() }, Modifier.width(140.dp), icon = Icons.Filled.Pause, enabled = live, color = Wk.Black600, textColor = Wk.Ink250, height = 52)
            }
            if (live) WkText("Tabs and blocked apps stay locked until you pause. Pausing asks for a 150-word reflection.", 11, color = Wk.Ink500, align = TextAlign.Center)
        }

        if (!full) {
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp)) {
                CardHeader(Icons.Filled.BarChart, "My Study Plan") {
                    GhostButton("+ Add Task", { vm.sheet = SheetKind.AddTask }, height = 34, textColor = Wk.Orange200, border = Wk.Orange600)
                }
                if (vm.tasks.isEmpty()) {
                    WkText("📋 No study tasks yet. Add your first subject + topic to start a timer.", 12, color = Wk.Ink500)
                } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { vm.tasks.forEach { TaskRow(vm, it) } }
            }
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                WkText("📝 Quick Notes", 14, FontWeight.SemiBold, Wk.Ink100)
                WkField(note, { note = it }, "Jot something down…", singleLine = false, minLines = 3)
            }
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CardHeader(Icons.Filled.Lock, "Blocked on this phone", "${vm.blockedApps.size} apps") {
                    WkText("Manage →", 12, FontWeight.SemiBold, Wk.Orange300, Modifier.tap { vm.go(Dest.BlockLists) })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AllApps.filter { it.name in vm.blockedApps }.take(4).forEach { Pill(it.name, Wk.Orange300, size = 10) }
                }
                PermLine("Overlay", perms.overlay) { LockingController.requestOverlay(ctx) }
                PermLine("Accessibility", perms.accessibility) { disclosure = Disclosure.Accessibility }
                PermLine("DNS block · Local VPN", perms.vpn) { disclosure = Disclosure.Vpn }
                PermLine("Device Admin", perms.deviceAdmin) { disclosure = Disclosure.DeviceAdmin }
                WkText("EXTRA PROTECTION", 10, FontWeight.SemiBold, Wk.Ink500, Modifier.padding(top = 6.dp), letterSpacingEm = 0.12f)
                PermLine("Silence blocked-app notifications", perms.notificationAccess) { disclosure = Disclosure.NotificationAccess }
                PermLine("Keep running (battery: Unrestricted)", perms.batteryUnrestricted) { LockingController.requestBatteryUnrestricted(ctx) }
                if (android.os.Build.VERSION.SDK_INT >= 33) PermLine("Session notification", perms.postNotifications) { notifPerm.launch(android.Manifest.permission.POST_NOTIFICATIONS) }
                PermLine("Screen-time stats", perms.usageAccess) { disclosure = Disclosure.UsageAccess }
                WkText("Strict (locked) sessions also close Settings until they end, so protection can't be switched off from inside the phone.", 11, color = Wk.Ink500, modifier = Modifier.padding(top = 4.dp), lineHeight = 1.4f)
            }
        }
        if (!full) {
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CardHeader(Icons.Filled.Block, "Reels & Shorts", "Closes the short-video feed, not the whole app")
                SegmentTabs(listOf("Off", "In sessions", "Always"), shortMode, { m ->
                    if (m == BlockStore.SHORT_OFF) { shortMode = m; LockingController.setShortFormMode(ctx, m) } else pendingShortMode = m
                })
                if (shortMode != BlockStore.SHORT_OFF) {
                    var ig by remember { mutableStateOf(LockingController.shortFormPlatformOn(ctx, ShortFormHints.INSTAGRAM)) }
                    var yt by remember { mutableStateOf(LockingController.shortFormPlatformOn(ctx, ShortFormHints.YOUTUBE)) }
                    ToggleRow("Instagram Reels", null, ig) { ig = it; LockingController.setShortFormPlatform(ctx, ShortFormHints.INSTAGRAM, it) }
                    ToggleRow("YouTube Shorts", null, yt) { yt = it; LockingController.setShortFormPlatform(ctx, ShortFormHints.YOUTUBE, it) }
                    if (!perms.accessibility) WkText("Needs the Accessibility permission above.", 11, color = Wk.Orange300)
                    WkText("Closed $shortCount today", 12, FontWeight.SemiBold, Wk.Ink400)
                }
            }
        }
        if (!full && perms.usageAccess && usage.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CardHeader(Icons.Filled.BarChart, "Screen time today", "Your biggest distractions")
                usage.forEach { u ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        WkText(u.label, 13, color = Wk.Ink100, modifier = Modifier.weight(1f), maxLines = 1)
                        WkText(if (u.minutes >= 60) "${u.minutes / 60}h ${u.minutes % 60}m" else "${u.minutes}m", 12, FontWeight.SemiBold, Wk.Orange300)
                    }
                }
            }
        }
    }
    pendingShortMode?.let { m ->
        DisclosureDialog(Disclosure.ShortForm, onDismiss = { pendingShortMode = null }, onAgree = {
            shortMode = m; LockingController.setShortFormMode(ctx, m); pendingShortMode = null
            if (!perms.accessibility) disclosure = Disclosure.Accessibility
        })
    }
    disclosure?.let { d ->
        DisclosureDialog(d, onDismiss = { disclosure = null }, onAgree = {
            disclosure = null
            when (d) {
                Disclosure.Accessibility -> LockingController.requestAccessibility(ctx)
                Disclosure.ShortForm -> Unit
                Disclosure.Vpn -> LockingController.vpnConsentIntent(ctx)?.let { vpn.launch(it) }
                Disclosure.DeviceAdmin -> LockingController.requestDeviceAdmin(ctx)
                Disclosure.NotificationAccess -> LockingController.requestNotificationAccess(ctx)
                Disclosure.UsageAccess -> LockingController.requestUsageAccess(ctx)
            }
        })
    }
}

@Composable
private fun PermLine(label: String, ok: Boolean, grant: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        WkText(label, 13, color = Wk.Ink300, modifier = Modifier.weight(1f))
        if (ok) WkText("✓", 13, FontWeight.Bold, Wk.Green) else WkText("Grant →", 12, FontWeight.SemiBold, Wk.Orange300, Modifier.tap(grant))
    }
}
