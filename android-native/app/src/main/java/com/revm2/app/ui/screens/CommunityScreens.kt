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
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Wk

private val PurpleOrange = Brush.linearGradient(listOf(Color(0xFFA855F7), Wk.Orange500))

@Composable
private fun CommAvatar(emoji: String, size: Int = 56) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(16.dp)).background(PurpleOrange), contentAlignment = Alignment.Center) { WkText(emoji, size / 2) }
}

@Composable
fun CommunitiesScreen(vm: AppViewModel) = ScreenColumn {
    var showDiscover by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    Column { Eyebrow("COMMUNITIES"); WkText("Find your people. Focus better.", 17, FontWeight.Bold, Wk.Ink100) }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).wkSurface(Wk.Black850, Wk.Orange600.copy(alpha = 0.4f), 20.dp)) {
        Image(painterResource(R.drawable.community_banner), null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
        Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Color(0xE60B0B0D), Color(0x660B0B0D)))))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { WkText("👑", 18); WkText("Home Community", 20, FontWeight.Bold, Wk.Cream50) }
            Pill("🔒 Locked for 30 days", Wk.Amber, size = 11)
            WkText("You can change it once every 30 days.", 12, color = Wk.Ink250)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CommAvatar("👥", 64)
                Column {
                    WkText("JEE Night Grind", 20, FontWeight.Bold, Wk.Cream50)
                    WkText("128 members", 12, color = Wk.Ink250)
                    WkText("Study together. Grow together.", 11, color = Wk.Ink300)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Manage", { vm.go(Dest.CommManage) }, Modifier.weight(1f), Icons.Filled.Settings, height = 46, textColor = Wk.Cream50)
                PrimaryButton("View Community", { vm.currentCommunityId = "home"; vm.go(Dest.CommStudent) }, Modifier.weight(1.4f), color = Wk.Cream50, height = 46)
            }
        }
    }
    Column { WkText("Your Communities", 18, FontWeight.Bold, Wk.Ink100); WkText("You are part of ${OtherCommunities.size} communities besides your home", 12, color = Wk.Ink500) }
    OtherCommunities.forEach { c ->
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { CommAvatar(c.emoji, 48); Pill(c.role, Wk.Orange300) }
            WkText(c.name, 18, FontWeight.Bold, Wk.Ink100)
            WkText("${c.members} members", 12, color = Wk.Ink500)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { StatDot(); WkText("${c.live} studying now", 12, color = Wk.Green) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarStack(listOf("AS" to Wk.Pink, "RK" to Wk.Blue, "MV" to Wk.Green), 28)
                Spacer(Modifier.weight(1f))
                PrimaryButton("Open", { if (c.role == "Owner") vm.go(Dest.CommManage) else { vm.currentCommunityId = c.id; vm.go(Dest.CommStudent) } }, height = 40)
            }
        }
    }
    Row(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).tap { showDiscover = !showDiscover }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        WkText("🧭", 22)
        Column(Modifier.weight(1f)) { WkText("Discover More Communities", 14, FontWeight.Bold, Wk.Ink100); WkText("Find communities that match your goals or interests.", 11, color = Wk.Ink500) }
        WkText(if (showDiscover) "Hide" else "Browse", 12, FontWeight.SemiBold, Wk.Orange300)
    }
    if (showDiscover) Discover.forEach { d ->
        ListRow {
            CommAvatar(d.emoji, 40)
            Column(Modifier.weight(1f)) { WkText(d.name, 14, FontWeight.SemiBold, Wk.Ink100, maxLines = 1); WkText("${d.head} · ${d.members} members", 11, color = Wk.Ink500) }
            GhostButton(if (d.approval) "Request" else "Join", { vm.flash(if (d.approval) "Request sent to ${d.head}" else "Joined ${d.name}") }, height = 36, textColor = Wk.Orange200, border = Wk.Orange600)
        }
    }
    Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        WkText("🔗 Join with Invite Link", 14, FontWeight.Bold, Wk.Ink100); WkText("Have an invite link or code? Join a community directly.", 11, color = Wk.Ink500)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { WkField(code, { code = it }, "Invite link or code") }
            PrimaryButton("Join", { vm.flash("Invite codes arrive with the Supabase wiring") }, height = 48, enabled = code.isNotBlank())
        }
    }
    PrimaryButton("+ Create Community", { vm.flash("Community creation arrives with the Supabase wiring") }, Modifier.fillMaxWidth())
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

@Composable
private fun AnnouncementCard(a: Announcement) {
    Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, if (a.important) Wk.Orange600.copy(alpha = 0.4f) else Wk.Black600, 16.dp).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (a.pinned) Pill("📌 PINNED", Wk.Orange300, size = 9); if (a.important) Pill("IMPORTANT", Wk.Red, size = 9)
            Spacer(Modifier.weight(1f)); WkText(a.whenText, 11, color = Wk.Ink500)
        }
        WkText(a.title, 14, FontWeight.SemiBold, Wk.Ink100); WkText(a.message, 12, color = Wk.Ink400, lineHeight = 1.5f)
    }
}

@Composable
private fun ScheduleCard(title: String, subtitle: String, badge: String?, footer: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { WkText(title, 14, FontWeight.Bold, Wk.Ink100); WkText(subtitle, 11, color = Wk.Ink500) }
            if (badge != null) Pill(badge, Wk.Orange300)
        }
        CommunitySchedule.forEach { r ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.width(3.dp).height(32.dp).clip(CircleShape).background(r.color))
                WkText(r.time, 11, color = Wk.Ink500, modifier = Modifier.width(60.dp)); WkText(r.what, 13, FontWeight.Medium, Wk.Ink100, Modifier.weight(1f), maxLines = 1); WkText(r.dur, 11, color = Wk.Ink500)
            }
        }
        footer()
    }
}

@Composable
fun CommunityStudentScreen(vm: AppViewModel) {
    val isHome = vm.currentCommunityId == "home"
    val comm = OtherCommunities.firstOrNull { it.id == vm.currentCommunityId }
    val name = if (isHome) "JEE Night Grind" else comm?.name ?: "Community"
    val emoji = if (isHome) "👥" else comm?.emoji ?: "👥"
    var tab by remember { mutableIntStateOf(0) }
    var accepted by remember { mutableStateOf<Boolean?>(null) }
    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Back("$emoji $name", vm)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Groups, null, tint = Wk.Orange300, modifier = Modifier.size(16.dp)); WkText("${if (isHome) 128 else comm?.members ?: 0} members", 12, color = Wk.Ink400)
        }
        TabRow2(listOf("Home", "Schedule", "Progress", "News"), tab, { tab = it })
        when (tab) {
            0 -> {
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { WkText("Announcements", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); WkText("View All", 12, color = Wk.Orange300, modifier = Modifier.tap { tab = 3 }) }
                    AnnouncementCard(Announcements.first())
                }
                Column(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.3f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { WkText("Community Study Room", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); Pill("Live", Wk.Green) }
                    WkText("${comm?.live ?: 12} students studying", 12, FontWeight.SemiBold, Wk.Green)
                    WkText("Join the common study room and stay focused together with your community.", 12, color = Wk.Ink400)
                    PrimaryButton("Join Room", { vm.openRoom(1, Dest.Comms) }, Modifier.fillMaxWidth())
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Icons.Filled.Schedule, "1h 20m", "Study Time Today", Modifier.weight(1f))
                    StatTile(Icons.Filled.TrackChanges, "3", "Focus Sessions", Modifier.weight(1f))
                }
            }
            1 -> ScheduleCard("Rahul's Week 39 schedule", "Accept to replace your own weekly schedule", when (accepted) { true -> "SYNCED"; false -> "REJECTED"; null -> "NEW" }) {
                if (accepted == null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GhostButton("Reject", { accepted = false }, Modifier.weight(1f), height = 44)
                    PrimaryButton("Accept & Sync", { accepted = true; vm.flash("Schedule synced to your Focus Lock") }, Modifier.weight(1.4f), height = 44)
                } else WkText("Create my own schedule", 12, FontWeight.SemiBold, Wk.Orange300, Modifier.tap { accepted = null; vm.go(Dest.Schedules) })
            }
            2 -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Icons.Filled.Schedule, "14h 30m", "Total Study Time", Modifier.weight(1f)); StatTile(Icons.Filled.TrackChanges, "38", "Focus Sessions", Modifier.weight(1f))
                }
                StatTile(Icons.Filled.CheckCircle, "82%", "Schedule Adherence", Modifier.fillMaxWidth())
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("Weekly Study Activity", 14, FontWeight.Bold, Wk.Ink100); WkText("Last 7 days · this community", 11, color = Wk.Ink500)
                    Row(Modifier.fillMaxWidth().height(90.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                        WeekMinutes.forEachIndexed { i, m ->
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(Modifier.fillMaxWidth().height((m / 240f * 70).dp).clip(RoundedCornerShape(6.dp)).background(Brush.verticalGradient(listOf(Wk.Orange400, Wk.Orange600))))
                                WkText(WeekLabels[i], 9, color = Wk.Ink500)
                            }
                        }
                    }
                }
            }
            else -> Announcements.forEach { AnnouncementCard(it) }
        }
    }
}

@Composable
fun CommunityManageScreen(vm: AppViewModel) {
    var tab by remember { mutableIntStateOf(0) }
    var monetised by remember { mutableStateOf(false) }
    var approval by remember { mutableStateOf(true) }
    var published by remember { mutableStateOf(false) }
    val reqs = remember { mutableStateListOf("Neha S." to "JEE 2026, need a night study group", "Arjun P." to "Friend of Karan V.", "Sana R." to "Preparing for NEET") }
    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Back("Manage community", vm)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CommAvatar("👥", 56)
            Column { WkText("JEE Night Grind", 20, FontWeight.Bold, Wk.Cream50); WkText("128 Members · 62 active students", 12, color = Wk.Ink400) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GhostButton("View Community", { vm.currentCommunityId = "home"; vm.go(Dest.CommStudent) }, Modifier.weight(1f), height = 40)
        }
        TabRow2(listOf("Overview", "News", "Schedule", "Analytics", "Earnings", "Manage"), tab, { tab = it })
        when (tab) {
            0 -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatTile(Icons.Filled.Groups, "128", "Total Students", Modifier.weight(1f)); StatTile(Icons.Filled.TrackChanges, "62", "Active Today", Modifier.weight(1f)) }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatTile(Icons.Filled.Schedule, "2h 40m", "Avg / Day", Modifier.weight(1f)); StatTile(Icons.Filled.CheckCircle, "78%", "Adherence", Modifier.weight(1f)) }
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("Community Study Room", 14, FontWeight.Bold, Wk.Ink100); WkText("37 students online", 12, color = Wk.Green); WkText("Currently studying Physics · Electrostatics", 12, color = Wk.Ink400)
                    PrimaryButton("Enter Study Room", { vm.openRoom(1, Dest.Comms) }, Modifier.fillMaxWidth(), icon = Icons.Filled.PlayArrow)
                }
            }
            1 -> { PrimaryButton("+ New Announcement", { vm.flash("Announcements arrive with the Supabase wiring") }, Modifier.fillMaxWidth()); Announcements.forEach { AnnouncementCard(it) } }
            2 -> ScheduleCard("Week 39 · Tonight", "Published to 128 members", if (published) "PUBLISHED" else "DRAFT") {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GhostButton("Edit Draft", { vm.flash("Schedule editing coming soon") }, Modifier.weight(1f), height = 44)
                    PrimaryButton("Publish", { published = true; vm.flash("Published to 128 members") }, Modifier.weight(1f), height = 44)
                }
            }
            3 -> Column(Modifier.fillMaxWidth().wkCard().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row { Eyebrow("STUDENT", modifier = Modifier.weight(1f)); Eyebrow("TODAY", modifier = Modifier.width(56.dp)); Eyebrow("STREAK", modifier = Modifier.width(48.dp)); Eyebrow("ADH.", modifier = Modifier.width(40.dp)) }
                listOf(Triple("Rohan S.", "1h 32m", "12d"), Triple("Priya K.", "58m", "9d"), Triple("Aman M.", "40m", "3d"), Triple("Divya J.", "1h 05m", "6d")).forEachIndexed { i, (n, t, s) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Avatar(n.take(2).uppercase(), RoomMembers[i].color, 28); WkText(n, 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1) }
                        WkText(t, 12, color = Wk.Ink300, modifier = Modifier.width(56.dp)); WkText(s, 12, color = Wk.Amber, modifier = Modifier.width(48.dp)); WkText("${90 - i * 7}%", 12, color = Wk.Green, modifier = Modifier.width(40.dp))
                    }
                }
            }
            4 -> {
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { WkText("Monetisation Program", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); Pill(if (monetised) "ON" else "OFF", if (monetised) Wk.Green else Wk.Ink400) }
                    WkText("Earn 50% of your community's revenue once monetisation is switched on. Requires WynkoHead approval.", 12, color = Wk.Ink400)
                    PrimaryButton(if (monetised) "Turn off" else "Apply for monetisation", { monetised = !monetised }, Modifier.fillMaxWidth())
                }
                if (monetised) Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eyebrow("WALLET BALANCE"); WkText("₹860", 30, FontWeight.ExtraBold, Wk.Cream50)
                    WkText("You earn 50% of this community's revenue · min payout ₹500", 11, color = Wk.Ink500)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatTile(Icons.Filled.MonetizationOn, "₹1,240", "Community · 30d", Modifier.weight(1f)); StatTile(Icons.Filled.Groups, "₹180", "Referrals · 30d", Modifier.weight(1f)) }
                    PrimaryButton("Request payout", { vm.flash("Payouts arrive with the Supabase wiring") }, Modifier.fillMaxWidth())
                }
            }
            else -> {
                Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    WkText("Community name", 12, color = Wk.Ink400); WkText("JEE Night Grind", 15, FontWeight.SemiBold, Wk.Ink100)
                    ToggleRow("Require approval to join", "New members send a request first", approval) { approval = it }
                    WkText("wynko.app/home.html?community=jng-7fk2", 11, color = Wk.Ink500)
                }
                WkText("Join Requests", 14, FontWeight.Bold, Wk.Ink100)
                if (reqs.isEmpty()) WkText("No pending requests.", 12, color = Wk.Ink500)
                reqs.toList().forEach { r ->
                    Column(Modifier.fillMaxWidth().wkCard().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { Avatar(r.first.take(2).uppercase(), Wk.Orange600, 36); Column { WkText(r.first, 13, FontWeight.SemiBold, Wk.Ink100); WkText("\"${r.second}\"", 11, color = Wk.Ink500) } }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            GhostButton("Decline", { reqs.remove(r) }, Modifier.weight(1f), height = 38); PrimaryButton("Approve", { reqs.remove(r); vm.flash("${r.first} approved") }, Modifier.weight(1f), height = 38)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
