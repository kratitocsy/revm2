package com.revm2.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Wk

// ───────────────────────── Settings ─────────────────────────
private val SettingsTabs = listOf("👤" to "Profile", "🔑" to "Account", "🔔" to "Notifications", "🎯" to "Study", "🔒" to "Privacy", "ℹ️" to "About")

@Composable
fun SettingsScreen(vm: AppViewModel) {
    var tab by remember { mutableIntStateOf(0) }
    val me = vm.profile
    // Re-seed the form whenever the profile (re)loads.
    var display by remember(me) { mutableStateOf(me?.displayName ?: "") }
    var username by remember(me) { mutableStateOf(me?.username ?: "") }
    var bio by remember(me) { mutableStateOf(me?.bio ?: "") }
    var school by remember(me) { mutableStateOf(me?.school ?: "") }
    var classYear by remember(me) { mutableStateOf(me?.classYear ?: "") }
    var course by remember(me) { mutableStateOf(me?.course ?: "") }
    var exam by remember(me) { mutableStateOf(me?.exam ?: "") }
    var goal by remember(me) { mutableIntStateOf(vm.dailyGoalHours) }
    var timer by remember { mutableStateOf("pomodoro") }
    var avatar by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column { Eyebrow("SETTINGS"); WkText("Manage your account & preferences.", 14, color = Wk.Ink300) }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SettingsTabs.forEachIndexed { i, (ic, l) ->
                val on = i == tab
                Row(
                    Modifier.height(38.dp).clip(RoundedCornerShape(12.dp))
                        .background(if (on) Brush.linearGradient(listOf(Wk.Orange500, Wk.Orange600)) else Brush.linearGradient(listOf(Wk.Black800, Wk.Black800)))
                        .tap { tab = i }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) { WkText(ic, 13); WkText(l, 12, FontWeight.SemiBold, if (on) Wk.Cream50 else Wk.Ink400, maxLines = 1) }
            }
        }
        when (tab) {
            0 -> {
                Section("PROFILE PICTURE") {
                    WkText("Choose avatar · saves instantly", 11, color = Wk.Ink500)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        listOf(Wk.Orange300, Wk.Pink, Wk.Blue, Wk.Green, Wk.Violet, Wk.Amber).forEachIndexed { i, c ->
                            Box(Modifier.size(52.dp).clip(CircleShape).background(c).tap { avatar = i; vm.flash("Avatar saved") }, contentAlignment = Alignment.Center) { if (i == avatar) Icon(Icons.Filled.Check, null, tint = Wk.Black950) }
                        }
                    }
                }
                Section("PERSONAL INFORMATION") {
                    Label("DISPLAY NAME"); WkField(display, { display = it }, "Name")
                    Label("USERNAME"); WkField(username, { username = it.lowercase().replace(" ", "") }, "username")
                    Label("BIO"); WkField(bio, { if (it.length <= 160) bio = it }, "Tell us about yourself", singleLine = false, minLines = 3); WkText("${bio.length}/160", 10, color = Wk.Ink600)
                }
                Section("ACADEMIC INFORMATION") {
                    Label("SCHOOL / INSTITUTION"); WkField(school, { school = it }, "School")
                    Label("CLASS / YEAR"); Chips(listOf("11th Grade", "12th Grade", "Dropper"), classYear) { classYear = it }
                    Label("COURSE / STREAM"); Chips(listOf("Engineering", "Medical", "Other"), course) { course = it }
                    Label("TARGET EXAM"); Chips(listOf("JEE Main", "JEE Advanced", "NEET"), exam) { exam = it }
                }
                PrimaryButton("Save profile", { vm.saveProfile(display, bio, school, classYear, course, exam, goal, username) }, Modifier.fillMaxWidth())
            }
            1 -> {
                Section("EMAIL ADDRESS") { Label("CURRENT EMAIL"); WkText(me?.email ?: "", 14, color = Wk.Ink100); Label("CHANGE EMAIL"); var e by remember { mutableStateOf("") }; WkField(e, { e = it }, "new@email.com"); GhostButton("Update", { vm.flash("Confirmation link sent (demo)") }); WkText("We’ll email a confirmation link to both addresses.", 11, color = Wk.Ink500) }
                Section("CHANGE PASSWORD") { var a by remember { mutableStateOf("") }; var b by remember { mutableStateOf("") }; Label("CURRENT PASSWORD"); WkField(a, { a = it }, "••••••••"); Label("NEW PASSWORD"); WkField(b, { b = it }, "••••••••"); GhostButton("Change password", { vm.flash("Password updated (demo)") }) }
                Section("CONNECTED ACCOUNTS") {
                    ListRow { WkText("Google", 13, FontWeight.SemiBold, Wk.Ink100, Modifier.weight(1f)); Pill("Connected", Wk.Green) }
                    ListRow { WkText("Discord", 13, FontWeight.SemiBold, Wk.Ink100, Modifier.weight(1f)); GhostButton("Connect", { vm.flash("Discord linking arrives later") }, height = 32) }
                }
                Section("DANGER ZONE") {
                    WkText("Delete Account", 14, FontWeight.SemiBold, Wk.Red); WkText("Permanently delete your Wynko account and all data. This can’t be undone.", 11, color = Wk.Ink500)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { GhostButton("Delete", { vm.sheet = SheetKind.DeleteAccount }, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.5f)); GhostButton("Sign Out", { vm.signOut() }) }
                }
            }
            2 -> PrefSection(vm, PrefGroups.filter { it.first == "NOTIFICATIONS" })
            3 -> {
                Section("DAILY GOALS") {
                    Label("DAILY STUDY GOAL (HOURS) · drives Home’s Today’s Focus")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(1, 2, 3, 4, 6).forEach { h -> Pill("${h}h", if (h == goal) Wk.Orange500 else Wk.Ink400, Modifier.tap { goal = h; vm.saveProfile(display, bio, school, classYear, course, exam, h, username) }, 12) } }
                    Label("DEFAULT TIMER")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("pomodoro" to "Pomodoro", "regular" to "Regular").forEach { (id, n) -> Box(Modifier.weight(1f).height(44.dp).wkSurface(if (timer == id) Color(0x24FF8A3D) else Wk.Black800, if (timer == id) Wk.Orange600 else Wk.Black600, 12.dp).tap { timer = id; vm.selectMode(id) }, contentAlignment = Alignment.Center) { WkText(n, 13, FontWeight.SemiBold, Wk.Ink100) } }
                    }
                    WkText("Pomodoro lengths are edited from the Pomodoro card in Focus Lock.", 11, color = Wk.Ink500)
                }
                PrefSection(vm, PrefGroups.filter { it.first == "FOCUS" })
            }
            4 -> PrefSection(vm, PrefGroups.filter { it.first == "PRIVACY" })
            else -> Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                WkText("Wynko", 20, FontWeight.ExtraBold, Wk.Cream50); Eyebrow("VERSION 1.0.0 (BETA)"); WkText("Better Focus. Better Results.", 13, FontWeight.SemiBold, Wk.Ink100); WkText("Study smarter with your community.", 12, color = Wk.Ink500)
                Spacer(Modifier.height(8.dp)); ListRow { WkText("📄 Terms of Service", 13, color = Wk.Ink100, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500) }
                ListRow { WkText("🔒 Privacy Policy", 13, color = Wk.Ink100, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500) }
            }
        }
    }
}

@Composable
private fun Label(text: String) = WkText(text, 10, FontWeight.SemiBold, Wk.Ink500, letterSpacingEm = 0.1f)

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Eyebrow(title, Wk.Orange300); content() }
}

@Composable
private fun Chips(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { options.forEach { o -> Pill(o, if (o == selected) Wk.Orange500 else Wk.Ink400, Modifier.tap { onSelect(o) }, 12) } }
}

@Composable
private fun PrefSection(vm: AppViewModel, groups: List<Pair<String, List<PrefRow>>>) {
    groups.forEach { (title, rows) ->
        Section(title) { rows.forEach { r -> ToggleRow(r.label, null, vm.prefs[r.key] == true) { vm.setPref(r.key, it) } } }
    }
}

// ───────────────────────── Earn with Wynko ─────────────────────────
@Composable
fun EarnScreen(vm: AppViewModel) = ScreenColumn {
    var tab by remember { mutableIntStateOf(0) }
    var pending by remember { mutableStateOf(false) }
    Column { Eyebrow("WYNKOHEAD PROGRAM"); WkText("Earn with Wynko", 24, FontWeight.ExtraBold, Wk.Cream50); WkText("Guide students. Grow a community. Get paid.", 13, color = Wk.Ink400) }
    SegmentTabs(listOf("👑 WynkoHead", "🎁 Invite Friends"), tab, { tab = it })
    if (tab == 1) {
        Eyebrow("HOW FRIEND INVITES WORK", Wk.Orange300)
        listOf(Triple("🔗", "Share Your Link", "Copy your unique invite link and send it to a friend."), Triple("🎓", "Friend Joins", "Your friend signs up on Wynko using your link."), Triple("🔥", "3-Day Streak", "They study for 3 consecutive days on Wynko."), Triple("🪙", "Both Get WYNKOINS", "You and your friend each receive WYNKOINS instantly!")).forEach { (i, t, d) ->
            ListRow { WkText(i, 22); Column { WkText(t, 13, FontWeight.SemiBold, Wk.Ink100); WkText(d, 11, color = Wk.Ink500) } }
        }
        Column(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.3f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Eyebrow("YOUR INVITE LINK", Wk.Orange300); WkText("🔗 wynko.app/login?ref=JATIN26", 13, FontWeight.SemiBold, Wk.Ink100)
            PrimaryButton("Copy link", { vm.flash("Invite link copied") }, Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { listOf("3" to "Invited", "1" to "On streak", "100" to "WYNKOINS earned").forEach { (v, l) -> Column(horizontalAlignment = Alignment.CenterHorizontally) { WkText(v, 20, FontWeight.ExtraBold, Wk.Cream50); WkText(l, 10, color = Wk.Ink500) } } }
        }
    } else {
        Eyebrow("HOW WYNKOHEAD WORKS", Wk.Orange300)
        listOf(Triple("📣", "Invite Students", "Share your WynkoHead link. Students who join Wynko via your link become part of your community."), Triple("🛒", "They Purchase", "Any time a community student buys a plan, pack, or merch — you automatically get 50% of the revenue."), Triple("👑", "Create Your Community", "Give your community a name and description, then manage it, publish schedules, and track earnings.")).forEachIndexed { i, (e, t, d) ->
            Row(Modifier.fillMaxWidth().wkCard().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(28.dp).clip(CircleShape).background(Wk.OrangeTint), contentAlignment = Alignment.Center) { WkText("${i + 1}", 12, FontWeight.Bold, Wk.Orange200) }
                Column { WkText("$e $t", 14, FontWeight.Bold, Wk.Ink100); WkText(d, 12, color = Wk.Ink400, lineHeight = 1.5f) }
            }
        }
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { WkText("Become a WynkoHead", 15, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); Pill(if (pending) "PENDING" else "18+ ONLY", Wk.Orange300) }
            listOf("Confirm you’re 18 or older", "Apply to become a WynkoHead", "Create a community and switch on monetisation").forEachIndexed { i, t ->
                val done = pending && i < 2
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(if (done) Color(0x1A34D399) else Wk.OrangeTint), contentAlignment = Alignment.Center) { WkText(if (done) "✓" else "${i + 1}", 11, FontWeight.Bold, if (done) Wk.Green else Wk.Orange200) }
                    WkText(t, 13, color = Wk.Ink300)
                }
            }
            PrimaryButton(if (pending) "Application Pending" else "Apply Now", { pending = true; vm.flash("Application submitted (demo)") }, Modifier.fillMaxWidth(), enabled = !pending)
        }
    }
}
