package com.revm2.app.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.revm2.app.R
import com.revm2.app.ui.components.*
import com.revm2.app.data.AnnouncementRow
import com.revm2.app.data.CommunityScheduleRow
import com.revm2.app.data.PlanWriter
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Wk

private val PurpleOrange = Brush.linearGradient(listOf(Color(0xFFA855F7), Wk.Orange500))

@Composable
private fun CommAvatar(emoji: String, size: Int = 56) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(16.dp)).background(PurpleOrange), contentAlignment = Alignment.Center) { WkText(emoji, size / 2) }
}

private fun daysUntil(iso: String?): Long? = try {
    iso?.let { java.time.Duration.between(java.time.Instant.now(), java.time.OffsetDateTime.parse(it).toInstant()).toDays().coerceAtLeast(0) }
} catch (_: Exception) { null }

@Composable
fun CommunitiesScreen(vm: AppViewModel) = ScreenColumn {
    var showDiscover by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.refreshCommunities() }
    val home = vm.homeCommunity
    Column { Eyebrow("COMMUNITIES"); WkText("Find your people. Focus better.", 17, FontWeight.Bold, Wk.Ink100) }
    if (home != null) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).wkSurface(Wk.Black850, Wk.Orange600.copy(alpha = 0.4f), 20.dp)) {
        Image(painterResource(R.drawable.community_banner), null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
        Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Color(0xE60B0B0D), Color(0x660B0B0D)))))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { WkText("👑", 18); WkText("Home Community", 20, FontWeight.Bold, Wk.Cream50) }
            daysUntil(home.homeLockedUntil)?.takeIf { it > 0 }?.let { Pill("🔒 Locked for $it more days", Wk.Amber, size = 11) }
            WkText("You can change it once every 30 days.", 12, color = Wk.Ink250)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CommAvatar(home.emoji ?: "👥", 64)
                Column {
                    WkText(home.name, 20, FontWeight.Bold, Wk.Cream50)
                    WkText("${home.memberCount} members · ${home.liveCount} studying now", 12, color = Wk.Ink250)
                    home.description?.let { WkText(it, 11, color = Wk.Ink300, maxLines = 2) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (home.myRole == "admin") GhostButton("Manage", { vm.openCommunity(home.id, manage = true) }, Modifier.weight(1f), Icons.Filled.Settings, height = 46, textColor = Wk.Cream50)
                PrimaryButton("View Community", { vm.openCommunity(home.id, manage = false) }, Modifier.weight(1.4f), color = Wk.Cream50, height = 46)
            }
        }
    }
    val others = vm.communities.filter { it.id != home?.id }
    Column { WkText("Your Communities", 18, FontWeight.Bold, Wk.Ink100); WkText(if (home != null) "You are part of ${others.size} communities besides your home" else "Join a community to pick your Home Community", 12, color = Wk.Ink500) }
    others.forEach { c ->
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { CommAvatar(c.emoji ?: "👥", 48); Pill(if (c.myRole == "admin") "Owner" else "Member", Wk.Orange300) }
            WkText(c.name, 18, FontWeight.Bold, Wk.Ink100)
            WkText("${c.memberCount} members · by ${c.headName}", 12, color = Wk.Ink500)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { StatDot(); WkText("${c.liveCount} studying now", 12, color = Wk.Green) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AvatarStack(initialsAvatars(c.previewInitials), 28)
                Spacer(Modifier.weight(1f))
                GhostButton("Make Home", { vm.setHomeCommunity(c.id) }, height = 40)
                PrimaryButton("Open", { vm.openCommunity(c.id, manage = c.myRole == "admin") }, height = 40)
            }
        }
    }
    Row(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).tap { showDiscover = !showDiscover }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        WkText("🧭", 22)
        Column(Modifier.weight(1f)) { WkText("Discover More Communities", 14, FontWeight.Bold, Wk.Ink100); WkText("Find communities that match your goals or interests.", 11, color = Wk.Ink500) }
        WkText(if (showDiscover) "Hide" else "Browse", 12, FontWeight.SemiBold, Wk.Orange300)
    }
    if (showDiscover) {
        if (vm.discover.isEmpty()) WkText("Nothing new to discover right now.", 12, color = Wk.Ink500)
        vm.discover.forEach { d ->
            ListRow {
                CommAvatar(d.emoji ?: "👥", 40)
                Column(Modifier.weight(1f)) { WkText(d.name, 14, FontWeight.SemiBold, Wk.Ink100, maxLines = 1); WkText("${d.headName} · ${d.memberCount} members${if (d.isPrivate) " · 🔒" else ""}", 11, color = Wk.Ink500) }
                if (d.requested) Pill("Requested", Wk.Ink400)
                else GhostButton(if (d.joinRequiresApproval) "Request" else "Join", { vm.joinCommunity(d.id) }, height = 36, textColor = Wk.Orange200, border = Wk.Orange600)
            }
        }
    }
    Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        WkText("🔗 Join with Invite Link", 14, FontWeight.Bold, Wk.Ink100); WkText("Have an invite link or code? Join a community directly.", 11, color = Wk.Ink500)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { WkField(code, { code = it }, "Invite link or code") }
            PrimaryButton("Join", { vm.joinCommunityByCode(code); code = "" }, height = 48, enabled = code.isNotBlank())
        }
    }
    PrimaryButton("+ Create Community", { vm.sheet = SheetKind.CreateCommunity }, Modifier.fillMaxWidth())
}

@Composable
private fun Back(title: String, vm: AppViewModel, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        RoundIconButton(Icons.Filled.ChevronLeft, { vm.back() }, 40, Wk.Black800, Wk.Ink300)
        WkText(title, 17, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f), maxLines = 1)
        trailing()
    }
}

@Composable
private fun TabRow2(labels: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Orange600.copy(alpha = 0.2f), 16.dp).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        labels.forEachIndexed { i, l ->
            val on = i == selected
            Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp)).background(if (on) Color(0x33FF8A3D) else Color.Transparent).tap { onSelect(i) }, contentAlignment = Alignment.Center) {
                WkText(l, 11, FontWeight.SemiBold, if (on) Wk.Orange200 else Wk.Ink400, maxLines = 1)
            }
        }
    }
}

@Composable
private fun StatTile(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String, label: String, modifier: Modifier = Modifier) {
    Row(modifier.wkCard().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        IconChip(icon, 32)
        Column { WkText(value, 18, FontWeight.Bold, Wk.Cream50, maxLines = 1); WkText(label, 11, color = Wk.Ink500, maxLines = 1) }
    }
}

private fun hm(m: Int) = if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
private fun pct(v: Double?) = v?.let { "${(if (it <= 1.0) it * 100 else it).toInt()}%" } ?: "—"

@Composable
private fun AnnouncementCard(a: AnnouncementRow, onDelete: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, if (a.important) Wk.Orange600.copy(alpha = 0.4f) else Wk.Black600, 16.dp).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (a.pinned) Pill("📌 PINNED", Wk.Orange300, size = 9); if (a.important) Pill("IMPORTANT", Wk.Red, size = 9)
            Spacer(Modifier.weight(1f)); WkText(a.createdAt.take(10), 11, color = Wk.Ink500)
            if (onDelete != null) WkText("Delete", 11, color = Wk.Red, modifier = Modifier.tap(onDelete))
        }
        WkText(a.title, 14, FontWeight.SemiBold, Wk.Ink100); WkText(a.message, 12, color = Wk.Ink400, lineHeight = 1.5f)
    }
}

@Composable
private fun ScheduleCard(row: CommunityScheduleRow?, title: String, footer: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                WkText(title, 14, FontWeight.Bold, Wk.Ink100)
                WkText(row?.publishedAt?.let { "Published ${it.take(10)}${row.publishedByName?.let { n -> " by $n" } ?: ""}" } ?: "Nothing published yet", 11, color = Wk.Ink500)
            }
            row?.let { Pill(when (it.choice) { "accepted" -> "SYNCED"; "rejected" -> "REJECTED"; else -> "NEW" }, Wk.Orange300) }
        }
        val byDay = PlanWriter.communityWeekSlots(row?.week)
        val dayNames = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
        listOf(1, 2, 3, 4, 5, 6, 0).filter { byDay[it] != null }.forEach { d ->
            WkText(dayNames[d], 11, FontWeight.Bold, Wk.Orange300)
            byDay[d]!!.forEach { r ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.width(3.dp).height(28.dp).clip(CircleShape).background(r.subject?.let { SubjectColor[it] } ?: Wk.Orange500))
                    WkText("${r.start}–${r.end}", 11, color = Wk.Ink500, modifier = Modifier.width(90.dp)); WkText(r.subject ?: "Study", 13, FontWeight.Medium, Wk.Ink100, Modifier.weight(1f), maxLines = 1)
                }
            }
        }
        footer()
    }
}

@Composable
fun CommunityStudentScreen(vm: AppViewModel) {
    val comm = vm.currentCommunity
    val d = vm.communityDetail
    val sched = vm.communitySchedules.firstOrNull { it.groupId == vm.currentCommunityId }
    var tab by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Back("${comm?.emoji ?: "👥"} ${comm?.name ?: "Community"}", vm)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Groups, null, tint = Wk.Orange300, modifier = Modifier.size(16.dp)); WkText("${d?.memberCount ?: comm?.memberCount ?: 0} members · head ${d?.head?.name ?: comm?.headName ?: ""}", 12, color = Wk.Ink400)
        }
        TabRow2(listOf("Home", "Schedule", "Progress", "News"), tab, { tab = it })
        when (tab) {
            0 -> {
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { WkText("Announcements", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); WkText("View All", 12, color = Wk.Orange300, modifier = Modifier.tap { tab = 3 }) }
                    vm.announcements.firstOrNull { it.pinned }?.let { AnnouncementCard(it) } ?: vm.announcements.firstOrNull()?.let { AnnouncementCard(it) } ?: WkText("No announcements yet.", 12, color = Wk.Ink500)
                }
                Column(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.3f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { WkText("Community Study Room", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); if ((d?.studyingNow ?: 0) > 0) Pill("Live", Wk.Green) }
                    WkText("${d?.studyingNow ?: 0} students studying", 12, FontWeight.SemiBold, Wk.Green)
                    WkText("Join the common study room and stay focused together with your community.", 12, color = Wk.Ink400)
                    PrimaryButton("Join Room", { vm.openRoom(vm.currentCommunityId, Dest.Comms) }, Modifier.fillMaxWidth())
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Icons.Filled.Schedule, hm(d?.my?.todayMinutes ?: 0), "Study Time Today", Modifier.weight(1f))
                    StatTile(Icons.Filled.TrackChanges, "${d?.my?.todaySessions ?: 0}", "Focus Sessions", Modifier.weight(1f))
                }
                if (comm != null && comm.myRole != "admin") GhostButton("Leave community", { vm.leaveCommunity(comm.id) }, Modifier.fillMaxWidth(), height = 40, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.4f))
            }
            1 -> ScheduleCard(sched, "${sched?.publishedByName ?: "Community"}'s week") {
                if (sched != null) {
                    if (sched.choice != "accepted") Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (sched.choice != "rejected") GhostButton("Reject", { vm.decideCommunitySchedule(sched, false) }, Modifier.weight(1f), height = 44)
                        PrimaryButton("Accept & Sync", { vm.decideCommunitySchedule(sched, true) }, Modifier.weight(1.4f), height = 44)
                    } else Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        WkText("Focus Lock follows this week on all your devices.", 12, color = Wk.Ink400, modifier = Modifier.weight(1f))
                        GhostButton("Stop", { vm.decideCommunitySchedule(sched, false) }, height = 38)
                    }
                    WkText("Accepting pauses your own schedules while you follow this one, and its blocks are strict on every device: no early unlock; on Android, Settings and Reels/Shorts are closed too. Subjects you've set up with Wynky keep their allow-lists; others use a standard blocklist.", 11, color = Wk.Ink500, lineHeight = 1.4f)
                }
            }
            2 -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Icons.Filled.Schedule, hm(d?.my?.totalMinutes ?: 0), "Total Study Time", Modifier.weight(1f)); StatTile(Icons.Filled.TrackChanges, "${d?.my?.totalSessions ?: 0}", "Focus Sessions", Modifier.weight(1f))
                }
                StatTile(Icons.Filled.CheckCircle, pct(d?.my?.adherence), "Schedule Adherence", Modifier.fillMaxWidth())
                val weekly = d?.my?.weeklyMinutes?.takeLast(7).orEmpty().let { if (it.size < 7) List(7 - it.size) { 0 } + it else it }
                val top = maxOf(60, weekly.maxOrNull() ?: 0).toFloat()
                val labels = (6 downTo 0).map { java.time.LocalDate.now().minusDays(it.toLong()).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.US) }
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("Weekly Study Activity", 14, FontWeight.Bold, Wk.Ink100); WkText("Last 7 days · this community", 11, color = Wk.Ink500)
                    Row(Modifier.fillMaxWidth().height(90.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                        weekly.forEachIndexed { i, m ->
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(Modifier.fillMaxWidth().height((m / top * 70).dp).clip(RoundedCornerShape(6.dp)).background(Brush.verticalGradient(listOf(Wk.Orange400, Wk.Orange600))))
                                WkText(labels[i], 9, color = Wk.Ink500)
                            }
                        }
                    }
                }
            }
            else -> { if (vm.announcements.isEmpty()) WkText("No announcements yet.", 12, color = Wk.Ink500); vm.announcements.forEach { AnnouncementCard(it) } }
        }
    }
}

@Composable
fun CommunityManageScreen(vm: AppViewModel) {
    val comm = vm.currentCommunity
    val o = vm.headOverview
    val sched = vm.communitySchedules.firstOrNull { it.groupId == vm.currentCommunityId }
    var tab by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Back("Manage community", vm)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CommAvatar(comm?.emoji ?: "👥", 56)
            Column { WkText(comm?.name ?: "Community", 20, FontWeight.Bold, Wk.Cream50); WkText("${o?.members ?: comm?.memberCount ?: 0} Members · ${o?.activeToday ?: 0} active today", 12, color = Wk.Ink400) }
        }
        GhostButton("View Community", { vm.openCommunity(vm.currentCommunityId, manage = false) }, Modifier.fillMaxWidth(), height = 40)
        TabRow2(listOf("Overview", "News", "Schedule", "Analytics", "Manage"), tab, { tab = it })
        when (tab) {
            0 -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatTile(Icons.Filled.Groups, "${o?.members ?: 0}", "Total Students", Modifier.weight(1f)); StatTile(Icons.Filled.TrackChanges, "${o?.activeToday ?: 0}", "Active Today", Modifier.weight(1f)) }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatTile(Icons.Filled.Schedule, hm(o?.avgDailyMinutes ?: 0), "Avg / Day", Modifier.weight(1f)); StatTile(Icons.Filled.CheckCircle, pct(o?.avgAdherence), "Adherence", Modifier.weight(1f)) }
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("Community Study Room", 14, FontWeight.Bold, Wk.Ink100); WkText("${o?.studyingNow ?: 0} students online", 12, color = Wk.Green)
                    o?.currentSubject?.let { WkText("Currently studying $it", 12, color = Wk.Ink400) }
                    PrimaryButton("Enter Study Room", { vm.openRoom(vm.currentCommunityId, Dest.Comms) }, Modifier.fillMaxWidth(), icon = Icons.Filled.PlayArrow)
                }
                WkText("Earnings, payouts and monetisation are on the web dashboard.", 11, color = Wk.Ink500)
            }
            1 -> {
                PrimaryButton("+ New Announcement", { vm.sheet = SheetKind.NewAnnouncement }, Modifier.fillMaxWidth())
                if (vm.announcements.isEmpty()) WkText("No announcements yet.", 12, color = Wk.Ink500)
                vm.announcements.forEach { a -> AnnouncementCard(a) { vm.deleteAnnouncement(a.id) } }
            }
            2 -> ScheduleCard(sched, "Published week") {
                WkText("Editing and publishing the community week is done in the web/desktop schedule editor; members see it here and on every device.", 11, color = Wk.Ink500, lineHeight = 1.4f)
            }
            3 -> Column(Modifier.fillMaxWidth().wkCard().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row { Eyebrow("STUDENT", modifier = Modifier.weight(1f)); Eyebrow("STUDY", modifier = Modifier.width(56.dp)); Eyebrow("STREAK", modifier = Modifier.width(48.dp)); Eyebrow("ADH.", modifier = Modifier.width(40.dp)) }
                if (vm.students.isEmpty()) WkText("No student activity yet.", 12, color = Wk.Ink500)
                vm.students.forEach { st ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Avatar(initials(st.name), nameColor(st.name), 28); WkText(st.name, 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1) }
                        WkText(hm(st.studyMinutes), 12, color = Wk.Ink300, modifier = Modifier.width(56.dp)); WkText("${st.streakDays}d", 12, color = Wk.Amber, modifier = Modifier.width(48.dp)); WkText(pct(st.adherence), 12, color = Wk.Green, modifier = Modifier.width(40.dp))
                    }
                }
            }
            else -> {
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    WkText("Community name", 12, color = Wk.Ink400); WkText(comm?.name ?: "", 15, FontWeight.SemiBold, Wk.Ink100)
                    ToggleRow("Require approval to join", "New members send a request first", comm?.joinRequiresApproval == true) { vm.setRequiresApproval(it) }
                    comm?.inviteToken?.let { WkText("Invite code: $it", 11, color = Wk.Ink500) }
                }
                WkText("Join Requests", 14, FontWeight.Bold, Wk.Ink100)
                if (vm.joinRequests.isEmpty()) WkText("No pending requests.", 12, color = Wk.Ink500)
                vm.joinRequests.forEach { r ->
                    Column(Modifier.fillMaxWidth().wkCard().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { Avatar(initials(r.name), Wk.Orange600, 36); Column { WkText(r.name, 13, FontWeight.SemiBold, Wk.Ink100); r.note?.let { WkText("\"$it\"", 11, color = Wk.Ink500) } } }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            GhostButton("Decline", { vm.decideJoinRequest(r.id, false) }, Modifier.weight(1f), height = 38); PrimaryButton("Approve", { vm.decideJoinRequest(r.id, true) }, Modifier.weight(1f), height = 38)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
