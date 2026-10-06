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
import com.revm2.app.data.RoomRow
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Jakarta
import com.revm2.app.ui.theme.Wk

@Composable
fun RoomsScreen(vm: AppViewModel) = ScreenColumn {
    var tab by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.refreshRooms() }
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
            .tap { vm.sheet = SheetKind.CreateRoom }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(Wk.Orange500), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Add, null, tint = Wk.Black950) }
        Column(Modifier.weight(1f)) { WkText("Create Your Study Room", 15, FontWeight.Bold, Wk.Ink100); WkText("Set your rules, invite friends, or go public.", 11, color = Wk.Ink400) }
        Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink400)
    }
    WkField(query, { query = it }, "Search study rooms…")
    SegmentTabs(listOf("All Rooms", "My Rooms", "Popular"), tab, { tab = it })
    val list = vm.rooms.filter { r ->
        (query.isBlank() || r.name.contains(query, true)) && when (tab) { 1 -> r.isMember; 2 -> r.liveCount > 0; else -> true }
    }.let { if (tab == 2) it.sortedByDescending { r -> r.liveCount } else it }
    if (list.isEmpty()) {
        Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            WkText(if (query.isNotBlank()) "🔍 No rooms match" else "🏠 No rooms yet", 14, FontWeight.SemiBold, Wk.Ink300)
            WkText("Create one and invite your friends.", 12, color = Wk.Ink500)
        }
    }
    list.forEach { r ->
        val isPublic = r.visibility == "public"
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RoomIcon(r, 52)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    WkText(r.name, 15, FontWeight.Bold, Wk.Ink100, maxLines = 1)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (isPublic) Pill("Public", Wk.Green) else Pill("🔒 Private", Wk.Ink400)
                        if (r.liveCount > 0) Pill("${r.liveCount} LIVE", Wk.Amber)
                        if (r.isOfficial) Pill("OFFICIAL", Wk.Violet)
                    }
                }
            }
            r.description?.takeIf { it.isNotBlank() }?.let { WkText(it, 13, color = Wk.Ink300) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarStack(initialsAvatars(r.previewInitials), 24)
                WkText("  ${r.memberCount}/${r.memberLimit} members", 11, color = Wk.Ink500, modifier = Modifier.weight(1f))
                PrimaryButton(if (r.isMember) "Open" else "Join", {
                    when {
                        r.isMember -> vm.openRoom(r.id, Dest.Rooms)
                        r.hasPassword -> { vm.pendingRoomId = r.id; vm.sheet = SheetKind.Password }
                        else -> vm.joinRoom(r.id)
                    }
                }, height = 38)
            }
        }
    }
}

private val AvatarColors = listOf(Wk.Orange300, Wk.Pink, Wk.Blue, Wk.Green, Wk.Violet, Wk.Amber)
fun initialsAvatars(list: List<String>?): List<Pair<String, Color>> =
    list.orEmpty().take(4).mapIndexed { i, s -> s.take(2).uppercase() to AvatarColors[i % AvatarColors.size] }
fun nameColor(name: String): Color = AvatarColors[Math.floorMod(name.hashCode(), AvatarColors.size)]
fun initials(name: String) = name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }

@Composable
fun RoomIcon(r: RoomRow, size: Int) {
    val c = r.subject?.let { SubjectColor[it] } ?: Wk.Orange500
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(c.copy(alpha = 0.7f), c))), contentAlignment = Alignment.Center) {
        WkText(r.subject?.let { SubjectEmoji[it] } ?: "📚", if (size > 44) 22 else 16, FontWeight.Bold, Wk.Cream50)
    }
}

@Composable
fun RoomScreen(vm: AppViewModel) {
    val room = vm.currentRoom
    var tab by remember { mutableIntStateOf(0) }
    var chatIn by remember { mutableStateOf("") }
    val names = vm.roomMembers.associate { it.userId to it.name }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.tap { vm.back() }, verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.ChevronLeft, null, tint = Wk.Ink300); WkText(if (vm.roomFrom == Dest.Rooms) "Rooms" else "Community", 13, color = Wk.Ink300)
            }
            Spacer(Modifier.weight(1f))
            if (vm.roomMembers.any { it.isLive }) { StatDot(); Pill("Live Now", Wk.Green) }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (room != null) RoomIcon(room, 48)
                Column(Modifier.weight(1f)) { WkText(room?.name ?: "Study Room", 18, FontWeight.Bold, Wk.Ink100); WkText(room?.subject ?: "Study Room", 12, color = Wk.Ink500) }
                Icon(Icons.Filled.Groups, null, tint = Wk.Orange300); WkText("${vm.roomMembers.count { it.isLive }}", 13, FontWeight.Bold, Wk.Ink100)
            }
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                WkText(vm.timerText, 40, FontWeight.Bold, Wk.Cream50)
                WkText(vm.activeTask?.let { "${it.subject} — ${it.topic}" } ?: "Pick a task to focus on", 12, color = Wk.Ink400)
                PrimaryButton(if (vm.running) "Pause" else "Start focus", { if (vm.running) vm.askPause() else vm.startFocus() }, icon = if (vm.running) Icons.Filled.Pause else Icons.Filled.PlayArrow, color = if (vm.running) Wk.Black600 else Wk.Green, textColor = if (vm.running) Wk.Ink250 else Wk.Black950)
                WkText("Time you study here counts for this room on every device.", 11, color = Wk.Ink500)
            }
            SegmentTabs(listOf("Active Studying", "Chat"), tab, { tab = it })
            if (tab == 0) {
                if (vm.roomMembers.isEmpty()) WkText("Loading members…", 12, color = Wk.Ink500)
                vm.roomMembers.sortedByDescending { it.isLive }.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { m ->
                            val liveSecs = if (m.isLive && !m.isPaused) m.startedAt?.let { runCatching { ((System.currentTimeMillis() - java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli()) / 1000).toInt() }.getOrNull() } else null
                            Column(Modifier.weight(1f).wkCard().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Avatar(initials(m.name), nameColor(m.name), 44)
                                WkText(if (m.isMe) "You" else m.name, 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
                                WkText(when { m.isLive && m.isPaused -> "On break"; m.isLive -> m.subject ?: "Studying"; else -> "Today ${m.todaySeconds / 60}m" }, 10, color = Wk.Ink500, maxLines = 1)
                                WkText(liveSecs?.let { AppViewModel.fmt(it) } ?: if (m.isLive) "paused" else "idle", 12, FontWeight.Bold, if (m.isLive && !m.isPaused) Wk.Green else Wk.Ink400)
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                if (room != null && room.isMember && room.myRole != "admin") GhostButton("Leave room", { vm.leaveRoom(room.id) }, Modifier.fillMaxWidth(), height = 40, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.4f))
            } else if (vm.running) {
                Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("🔒 Chat is locked during focus study", 14, FontWeight.SemiBold, Wk.Ink100)
                    WkText("Finish your focus time to unlock chat. Chat opens during breaks only.", 12, color = Wk.Ink500)
                    GhostButton("Pause & Open Chat", { vm.askPause() })
                }
            } else {
                if (vm.roomMessages.isEmpty()) WkText("No messages yet. Say hi 👋", 13, color = Wk.Ink500)
                vm.roomMessages.forEach { m ->
                    val n = if (m.senderId == com.revm2.app.data.SocialRepository.myId) "You" else names[m.senderId] ?: "Member"
                    ListRow { Avatar(initials(n), nameColor(n), 28); Column { WkText("$n · ${runCatching { java.time.OffsetDateTime.parse(m.createdAt).atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5) }.getOrDefault("")}", 11, color = Wk.Ink500); WkText(m.body, 13, color = Wk.Ink100) } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { WkField(chatIn, { chatIn = it }, "Message…") }
                    RoundIconButton(Icons.Filled.Send, { if (chatIn.isNotBlank()) { vm.sendRoomMessage(chatIn); chatIn = "" } }, 44, Wk.Orange500, Wk.Black950)
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
