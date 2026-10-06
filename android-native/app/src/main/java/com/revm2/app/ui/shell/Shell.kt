package com.revm2.app.ui.shell

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.revm2.app.R
import com.revm2.app.ui.components.*
import com.revm2.app.ui.screens.*
import com.revm2.app.ui.theme.Wk

private data class NavItem(val dest: Dest, val label: String, val icon: ImageVector)

private val DrawerItems = listOf(
    NavItem(Dest.Home, "Home", Icons.Filled.Home), NavItem(Dest.Focus, "Focus Lock", Icons.Filled.Lock),
    NavItem(Dest.Schedules, "Schedules", Icons.Filled.Schedule), NavItem(Dest.Rooms, "Study Rooms", Icons.Filled.Videocam),
    NavItem(Dest.Comms, "Communities", Icons.Filled.Groups), NavItem(Dest.Battle, "Battleground", Icons.Filled.Bolt),
    NavItem(Dest.Coins, "WYNKOINS", Icons.Filled.MonetizationOn), NavItem(Dest.Earn, "Earn with Wynko", Icons.Filled.LocalFireDepartment),
    NavItem(Dest.Settings, "Settings", Icons.Filled.Settings),
)

private fun barTitle(d: Dest) = when (d) {
    Dest.Schedules -> "Schedules"; Dest.Earn -> "Earn with Wynko"; Dest.Focus -> "Focus Lock"; Dest.Rooms -> "Study Rooms"
    Dest.Comms -> "Communities"; Dest.Battle -> "Battleground"; Dest.Coins -> "WYNKOINS"; Dest.Settings -> "Settings"
    Dest.More -> "Profile"; Dest.BlockLists -> "Block lists"; else -> "Wynko"
}

@Composable
fun AppShell(vm: AppViewModel = viewModel()) {
    val dest = vm.dest
    val focusLive = dest == Dest.Focus && (vm.running || vm.focusFull)
    val showBar = !focusLive && dest !in setOf(Dest.Room, Dest.CommStudent, Dest.CommManage, Dest.Quick)
    val showTabs = !focusLive && dest != Dest.Room
    val scroll = rememberScrollState()
    LaunchedEffect(dest) { scroll.scrollTo(0) }
    BackHandler(enabled = vm.drawerOpen || vm.sheet != null || vm.dest != Dest.Home) {
        when { vm.sheet != null -> vm.sheet = null; vm.drawerOpen -> vm.drawerOpen = false; else -> vm.back() }
    }

    val ctx = androidx.compose.ui.platform.LocalContext.current
    // A live Focus Lock session also turns on real on-device blocking (accessibility overlay + VPN DNS).
    LaunchedEffect(vm.running) {
        val perms = com.revm2.app.locking.LockingController.permissions(ctx)
        if (vm.running && perms.accessibility && perms.overlay && vm.prefs["focus_block_distractions"] != false) {
            val pkgs = com.revm2.app.locking.LockingController.listInstalledApps(ctx)
                .filter { a -> vm.blockedApps.any { it.equals(a.label, ignoreCase = true) } }.map { it.packageName }
            com.revm2.app.locking.LockingController.startSession(ctx, "focus-" + System.currentTimeMillis(), apps = pkgs, domains = vm.blockedSites.toList(), lockSettings = vm.prefs["focus_strict_lock"] == true)
        } else if (!vm.running && com.revm2.app.locking.LockingController.sessionState(ctx).let { it.active && it.sessionId?.startsWith("focus-") == true }) {
            com.revm2.app.locking.LockingController.endSession(ctx)
        }
    }

    Box(Modifier.fillMaxSize().background(Wk.Black950)) {
        Column(Modifier.fillMaxSize().systemBarsPadding()) {
            if (showBar) AppBar(vm)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (dest == Dest.BlockLists) Box(Modifier.fillMaxSize()) { ScreenHost(vm) }  // has its own LazyColumn
                else Column(Modifier.fillMaxSize().verticalScroll(scroll)) { ScreenHost(vm) }
                if (vm.running && dest != Dest.Focus) MiniPlayer(vm, Modifier.align(Alignment.BottomCenter))
            }
            if (showTabs) TabBar(vm)
        }
        AnimatedVisibility(vm.drawerOpen) { Drawer(vm) }
        SheetHost(vm)
        vm.toast?.let { msg ->
            Box(Modifier.fillMaxSize().systemBarsPadding().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
                Box(Modifier.wkSurface(Wk.Black800, Wk.Black500, 12.dp).padding(horizontal = 14.dp, vertical = 10.dp)) { WkText(msg, 12, FontWeight.SemiBold, Wk.Ink100) }
            }
        }
    }
}

@Composable
private fun ScreenHost(vm: AppViewModel) {
    when (vm.dest) {
        Dest.Home -> HomeScreen(vm)
        Dest.Focus -> FocusScreen(vm)
        Dest.Schedules -> SchedulesScreen(vm)
        Dest.Rooms -> RoomsScreen(vm)
        Dest.Room -> RoomScreen(vm)
        Dest.Comms -> CommunitiesScreen(vm)
        Dest.CommStudent -> CommunityStudentScreen(vm)
        Dest.CommManage -> CommunityManageScreen(vm)
        Dest.Battle -> BattlegroundScreen(vm)
        Dest.Coins -> WynkoinsScreen(vm)
        Dest.Earn -> EarnScreen(vm)
        Dest.Settings -> SettingsScreen(vm)
        Dest.More -> MoreScreen(vm)
        Dest.Quick -> QuickTimerScreen(vm)
        Dest.BlockLists -> com.revm2.app.ui.blocks.BlocksScreen()
    }
}

@Composable
private fun AppBar(vm: AppViewModel) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xF70B0B0D)).padding(start = 10.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).clickable { vm.drawerOpen = true }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Menu, "Open menu", tint = Wk.Ink250, modifier = Modifier.size(22.dp))
        }
        Image(painterResource(R.drawable.wynko_logo), "Wynko", Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)))
        Column(Modifier.weight(1f)) {
            if (vm.dest == Dest.Home) {
                Eyebrow("TUE · 23 SEP")
                WkText("Good evening, Jatin", 15, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
            } else {
                Eyebrow("WYNKO")
                WkText(barTitle(vm.dest), 15, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
            }
        }
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(Wk.Black800).border(1.dp, Wk.Black600, CircleShape)
                .clickable { vm.sheet = SheetKind.Notifications; vm.unreadNotifs = false },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Notifications, "Notifications", tint = Wk.Ink400, modifier = Modifier.size(20.dp))
            if (vm.unreadNotifs) Box(Modifier.align(Alignment.TopEnd).padding(top = 9.dp, end = 10.dp).size(7.dp).clip(CircleShape).background(Wk.Red))
        }
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Wk.Black700).border(1.dp, Wk.Orange600.copy(alpha = 0.6f), CircleShape)
                .clickable { vm.go(Dest.More) },
            contentAlignment = Alignment.Center,
        ) { WkText("JS", 12, FontWeight.Bold, Wk.Orange200) }
    }
}

@Composable
private fun TabBar(vm: AppViewModel) {
    val d = vm.dest
    val active = when (d) {
        Dest.Room -> if (vm.roomFrom == Dest.Rooms) Dest.Rooms else Dest.Comms
        Dest.CommStudent, Dest.CommManage -> Dest.Comms
        Dest.Quick -> Dest.Home
        else -> d
    }
    @Composable
    fun Tab(dest: Dest, label: String, icon: ImageVector, modifier: Modifier) {
        val on = active == dest
        Column(
            modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.go(dest) }.padding(top = 8.dp, bottom = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, label, tint = if (on) Wk.Orange500 else Wk.Ink500, modifier = Modifier.size(24.dp))
            WkText(label, 11, if (on) FontWeight.SemiBold else FontWeight.Normal, if (on) Wk.Orange500 else Wk.Ink500, maxLines = 1)
        }
    }
    Box(Modifier.fillMaxWidth().background(Color(0xFA0F0F11)).border(1.dp, Wk.Black600.copy(alpha = 0.55f))) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
            Tab(Dest.Home, "Home", Icons.Filled.Home, Modifier.weight(1f))
            Tab(Dest.Rooms, "Rooms", Icons.Filled.Videocam, Modifier.weight(1f))
            Column(
                Modifier.weight(1f).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.go(Dest.Focus) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.offset(y = (-14).dp).size(56.dp).clip(CircleShape).background(Wk.Orange300).border(4.dp, Wk.Black950, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Lock, "Focus", tint = Wk.Black950, modifier = Modifier.size(24.dp)) }
                WkText("Focus", 11, FontWeight.SemiBold, if (active == Dest.Focus) Wk.Orange500 else Wk.Ink500, modifier = Modifier.offset(y = (-12).dp))
            }
            Tab(Dest.Battle, "Battleground", Icons.Filled.Bolt, Modifier.weight(1f))
            Tab(Dest.Comms, "Community", Icons.Filled.Groups, Modifier.weight(1f))
        }
    }
}

@Composable
private fun MiniPlayer(vm: AppViewModel, modifier: Modifier) {
    Row(
        modifier.padding(12.dp).fillMaxWidth().wkSurface(Wk.Black800, Wk.Orange600.copy(alpha = 0.4f), 16.dp)
            .clickable { vm.go(Dest.Focus) }.padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StatDot()
        Column(Modifier.weight(1f)) {
            WkText(vm.activeTask?.subject ?: "Focus session", 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
            WkText(vm.activeTask?.topic ?: "In progress", 11, color = Wk.Ink500, maxLines = 1)
        }
        WkText(vm.timerText, 14, FontWeight.Bold, Wk.Cream50)
        WkText("Resume →", 12, FontWeight.SemiBold, Wk.Orange300)
    }
}

@Composable
private fun Drawer(vm: AppViewModel) {
    Row(Modifier.fillMaxSize()) {
        Column(
            Modifier.width(300.dp).fillMaxHeight().background(Wk.Black900).systemBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(Modifier.padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Image(painterResource(R.drawable.wynko_logo), null, Modifier.size(38.dp))
                Column(Modifier.weight(1f)) { Eyebrow("WYNKO"); WkText("FOCUS · STUDY · TOGETHER", 9, color = Wk.Ink600, letterSpacingEm = 0.12f) }
                Icon(Icons.Filled.Close, "Close menu", tint = Wk.Ink400, modifier = Modifier.size(22.dp).clickable { vm.drawerOpen = false })
            }
            DrawerItems.forEach { n ->
                val on = vm.dest == n.dest
                val badge = when (n.dest) {
                    Dest.Focus -> if (vm.running) "LIVE" else null
                    Dest.Battle -> if (vm.battle == "invite") "1 INVITE" else null
                    Dest.Coins -> "%,d".format(vm.coins)
                    else -> null
                }
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) Color(0x1FFF8A3D) else Color.Transparent)
                        .clickable { vm.go(n.dest) }.padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(n.icon, null, tint = if (on) Wk.Orange300 else Wk.Ink400, modifier = Modifier.size(20.dp))
                    WkText(n.label, 14, if (on) FontWeight.SemiBold else FontWeight.Medium, if (on) Wk.Cream50 else Wk.Ink300, Modifier.weight(1f))
                    if (badge != null) Pill(badge, if (n.dest == Dest.Coins) Wk.Amber else Wk.Green, size = 9)
                }
            }
            Spacer(Modifier.weight(1f))
            Row(
                Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 14.dp).clickable { vm.go(Dest.More) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Avatar("JS", Wk.Orange300, 36)
                Column(Modifier.weight(1f)) { WkText("Jatin Sinsinwar", 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1); WkText("View profile", 11, color = Wk.Ink500) }
                Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500, modifier = Modifier.size(18.dp))
            }
        }
        Box(
            Modifier.weight(1f).fillMaxHeight().background(Color(0xA6000000))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.drawerOpen = false },
        )
    }
}
