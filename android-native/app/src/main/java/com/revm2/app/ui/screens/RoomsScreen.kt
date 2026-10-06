package com.revm2.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Jakarta
import com.revm2.app.ui.theme.Wk

@Composable
fun RoomsScreen(vm: AppViewModel) = ScreenColumn {
    var tab by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    Column {
        Eyebrow("STUDY TOGETHER · GROW TOGETHER")
        androidx.compose.material3.Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Wk.Ink100)) { append("Study ") }
                withStyle(SpanStyle(color = Wk.Orange500)) { append("Rooms") }
            }, fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp,
        )
        WkText("Find your people. Focus better.", 13, color = Wk.Ink400)
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(Color(0x33FF8A3D), Wk.Black800)))
            .tap { vm.flash("Room creation arrives with the Supabase wiring") }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(Wk.Orange500), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Add, null, tint = Wk.Black950) }
        Column(Modifier.weight(1f)) { WkText("Create Your Study Room", 15, FontWeight.Bold, Wk.Ink100); WkText("Set your rules, invite friends, or go public.", 11, color = Wk.Ink400) }
        Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink400)
    }
    WkField(query, { query = it }, "Search study rooms…")
    SegmentTabs(listOf("All Rooms", "My Rooms", "Popular"), tab, { tab = it })
    val list = Rooms.filter { r ->
        (query.isBlank() || r.name.contains(query, true)) && when (tab) { 1 -> r.id in vm.joinedRooms; 2 -> r.hot; else -> true }
    }
    if (list.isEmpty()) {
        Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            WkText(if (query.isNotBlank()) "🔍 No rooms match" else "🏠 No rooms yet", 14, FontWeight.SemiBold, Wk.Ink300)
            WkText("Create one and invite your friends.", 12, color = Wk.Ink500)
        }
    }
    list.forEach { r ->
        val joined = r.id in vm.joinedRooms
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RoomIcon(r, 52)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    WkText(r.name, 15, FontWeight.Bold, Wk.Ink100, maxLines = 1)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (r.isPublic) Pill("Public", Wk.Green) else Pill("🔒 Private", Wk.Ink400)
                        if (r.hot) Pill("HOT", Wk.Amber)
                    }
                }
            }
            WkText(r.desc, 13, color = Wk.Ink300)
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarStack(r.people, 24)
                WkText("  +${r.members}", 11, color = Wk.Ink500, modifier = Modifier.weight(1f))
                PrimaryButton(if (joined) "Open" else "Join", {
                    if (joined) vm.openRoom(r.id, Dest.Rooms)
                    else if (!r.isPublic) { vm.pendingRoomId = r.id; vm.sheet = SheetKind.Password }
                    else { vm.joinedRooms.add(r.id); vm.openRoom(r.id, Dest.Rooms) }
                }, height = 38)
            }
        }
    }
}

@Composable
fun RoomScreen(vm: AppViewModel) {
    val room = Rooms.firstOrNull { it.id == vm.currentRoomId } ?: Rooms.first()
    var tab by remember { mutableIntStateOf(0) }
    var chatIn by remember { mutableStateOf("") }
    val chat = remember { mutableStateListOf<Triple<String, String, String>>() }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.tap { vm.back() }, verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.ChevronLeft, null, tint = Wk.Ink300); WkText(if (vm.roomFrom == Dest.Rooms) "Rooms" else "Community", 13, color = Wk.Ink300)
            }
            Spacer(Modifier.weight(1f)); StatDot(); Pill("Live Now", Wk.Green)
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RoomIcon(room, 48)
                Column(Modifier.weight(1f)) { WkText(room.name, 18, FontWeight.Bold, Wk.Ink100); WkText("Study Room", 12, color = Wk.Ink500) }
                Icon(Icons.Filled.Groups, null, tint = Wk.Orange300); WkText("${room.live}", 13, FontWeight.Bold, Wk.Ink100)
            }
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                WkText(vm.timerText, 40, FontWeight.Bold, Wk.Cream50)
                WkText(vm.activeTask?.let { "${it.subject} — ${it.topic}" } ?: "Pick a task to focus on", 12, color = Wk.Ink400)
                PrimaryButton(if (vm.running) "Pause" else "Start focus", { if (vm.running) vm.askPause() else vm.startFocus() }, icon = if (vm.running) Icons.Filled.Pause else Icons.Filled.PlayArrow, color = if (vm.running) Wk.Black600 else Wk.Green, textColor = if (vm.running) Wk.Ink250 else Wk.Black950)
            }
            SegmentTabs(listOf("Active Studying", "Chat"), tab, { tab = it })
            if (tab == 0) {
                RoomMembers.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { m ->
                            Column(Modifier.weight(1f).wkCard().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Avatar(m.init, m.color, 44)
                                WkText(m.name, 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
                                WkText(m.status, 10, color = Wk.Ink500, maxLines = 1)
                                WkText(m.time, 12, FontWeight.Bold, if (m.state == "focus") Wk.Green else Wk.Ink400)
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                Column(Modifier.fillMaxWidth().wkSurface(Wk.Black850, Wk.Black600, 16.dp).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.Add, null, tint = Wk.Ink500); WkText("Seat Available", 13, FontWeight.SemiBold, Wk.Ink300); WkText("Invite a friend to study", 11, color = Wk.Ink500)
                }
            } else if (vm.running) {
                Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("🔒 Chat is locked during focus study", 14, FontWeight.SemiBold, Wk.Ink100)
                    WkText("Finish your focus time to unlock chat. Chat opens during breaks only.", 12, color = Wk.Ink500)
                    GhostButton("Pause & Open Chat", { vm.askPause() })
                }
            } else {
                if (chat.isEmpty()) WkText("No messages yet. Say hi 👋", 13, color = Wk.Ink500)
                chat.forEach { (n, t, txt) -> ListRow { Avatar("JS", Wk.Orange300, 28); Column { WkText("$n · $t", 11, color = Wk.Ink500); WkText(txt, 13, color = Wk.Ink100) } } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { WkField(chatIn, { chatIn = it }, "Message…") }
                    RoundIconButton(Icons.Filled.Send, { if (chatIn.isNotBlank()) { chat.add(Triple("You", "now", chatIn)); chatIn = "" } }, 44, Wk.Orange500, Wk.Black950)
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
