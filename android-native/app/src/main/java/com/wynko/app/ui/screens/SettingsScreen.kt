package com.wynko.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wynko.app.BuildConfig
import com.wynko.app.data.SettingsProfile
import com.wynko.app.ui.components.*
import com.wynko.app.ui.sample.PrefGroups
import com.wynko.app.ui.sample.PrefRow
import com.wynko.app.ui.shell.*
import com.wynko.app.ui.theme.Jakarta
import com.wynko.app.ui.theme.Wk

/** The six avatar colours; the chosen index is stored as `preferences.avatar_preset`, like the web app. */
val AvatarColors = listOf(Wk.Orange300, Wk.Pink, Wk.Blue, Wk.Green, Wk.Violet, Wk.Amber)

private val SettingsTabs = listOf("👤" to "Profile", "🔑" to "Account", "🔔" to "Notifications", "🎯" to "Study", "🔒" to "Privacy", "ℹ️" to "About")
// Same choices as the web Settings page, so both write the same values.
private val ClassYears = listOf("9th Grade", "10th Grade", "11th Grade", "12th Grade", "Dropper", "1st Year", "2nd Year", "3rd Year", "4th Year")
private val Courses = listOf("Engineering", "Medical", "Commerce", "Arts", "Science", "Law", "Other")

/**
 * Settings on the signed-in user's real profile (data/SettingsRepository.kt): the same user_profiles row,
 * preferences object and Supabase Auth calls as the web dashboard, so a change here shows up there.
 */
@Composable
fun SettingsScreen(vm: AppViewModel) {
    var tab by remember { mutableIntStateOf(0) }
    val p = vm.profile
    LaunchedEffect(Unit) { vm.loadProfile() }
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
        if (tab == 5) AboutTab()
        else if (p == null) {
            Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                WkText(vm.profileError ?: "Loading your settings…", 13, color = if (vm.profileError != null) Wk.Red else Wk.Ink400, align = TextAlign.Center)
                if (vm.profileError != null) GhostButton("Try again", { vm.loadProfile() })
            }
        } else when (tab) {
            0 -> ProfileTab(vm, p)
            1 -> AccountTab(vm, p)
            2 -> {
                Section("REMINDERS") { ToggleRow("Study reminders", "Nudges to keep your daily goal on track", p.remindersEnabled) { vm.setReminders(it) } }
                PrefSection(vm, "NOTIFICATIONS")
            }
            3 -> StudyTab(vm, p)
            else -> {
                Section("BATTLEGROUND") { ToggleRow("Allow battle invites", "When off, nobody can challenge you", p.allowBattleInvites) { vm.setAllowBattleInvites(it) } }
                PrefSection(vm, "PRIVACY")
            }
        }
    }
}

@Composable
private fun ProfileTab(vm: AppViewModel, p: SettingsProfile) {
    var display by remember(p.displayName) { mutableStateOf(p.displayName) }
    var username by remember(p.username) { mutableStateOf(p.username) }
    var bio by remember(p.bio) { mutableStateOf(p.bio) }
    var school by remember(p.school) { mutableStateOf(p.school) }
    var classYear by remember(p.classYear) { mutableStateOf(p.classYear) }
    var course by remember(p.course) { mutableStateOf(p.course) }
    var exam by remember(p.exam) { mutableStateOf(p.exam) }
    val dirty = display.trim() != p.displayName || username != p.username || bio.trim() != p.bio || school.trim() != p.school ||
        classYear != p.classYear || course != p.course || exam.trim() != p.exam

    Section("PROFILE PICTURE") {
        WkText("Choose avatar · saves instantly", 11, color = Wk.Ink500)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AvatarColors.forEachIndexed { i, c ->
                Box(Modifier.size(52.dp).clip(CircleShape).background(c).tap { if (i != p.avatarPreset) vm.setAvatar(i) }, contentAlignment = Alignment.Center) {
                    if (i == p.avatarPreset) Icon(Icons.Filled.Check, "Selected", tint = Wk.Black950)
                }
            }
        }
    }
    Section("PERSONAL INFORMATION") {
        Label("DISPLAY NAME"); WkField(display, { if (it.length <= 50) display = it }, "Your name")
        Label("USERNAME"); WkField(username, { v -> username = v.lowercase().filter { !it.isWhitespace() }.take(20) }, "username")
        WkText("3-20 characters: lowercase letters, numbers, underscore. Friends find and challenge you by this.", 10, color = Wk.Ink600)
        Label("BIO"); WkField(bio, { if (it.length <= 160) bio = it }, "Tell others about yourself…", singleLine = false, minLines = 3); WkText("${bio.length}/160", 10, color = Wk.Ink600)
    }
    Section("ACADEMIC INFORMATION") {
        Label("SCHOOL / INSTITUTION"); WkField(school, { if (it.length <= 100) school = it }, "Your school or college")
        Label("CLASS / YEAR"); Chips(ClassYears, classYear) { classYear = it }
        Label("COURSE / STREAM"); Chips(Courses, course) { course = it }
        Label("TARGET EXAM"); WkField(exam, { if (it.length <= 60) exam = it }, "e.g. JEE Advanced, NEET, UPSC")
    }
    PrimaryButton(if (vm.settingsBusy) "Saving…" else "Save profile", { vm.saveProfile(display, username, bio, school, classYear, course, exam) }, Modifier.fillMaxWidth(), enabled = dirty && !vm.settingsBusy)
}

@Composable
private fun AccountTab(vm: AppViewModel, p: SettingsProfile) {
    // No identity list means we couldn't read it; assume a password exists so the current one is still asked for.
    val hasPassword = p.providers.isEmpty() || "email" in p.providers
    Section("EMAIL ADDRESS") {
        var e by remember { mutableStateOf("") }
        val valid = e.trim().let { it.contains('@') && it.substringAfter('@').contains('.') && !it.equals(p.email, ignoreCase = true) }
        Label("CURRENT EMAIL"); WkText(p.email.ifEmpty { "—" }, 14, color = Wk.Ink100)
        Label("CHANGE EMAIL"); WkField(e, { e = it }, "new@email.com")
        PrimaryButton("Update email", { vm.changeEmail(e); e = "" }, height = 40, enabled = valid && !vm.settingsBusy)
        WkText("We'll email a confirmation link. Your address changes once you confirm it.", 11, color = Wk.Ink500)
    }
    Section(if (hasPassword) "CHANGE PASSWORD" else "SET A PASSWORD") {
        var current by remember { mutableStateOf("") }
        var next by remember { mutableStateOf("") }
        var again by remember { mutableStateOf("") }
        val ok = next.length >= 6 && next == again && (!hasPassword || current.isNotEmpty())
        if (hasPassword) { Label("CURRENT PASSWORD"); SecretField(current, { current = it }, "Current password") }
        Label("NEW PASSWORD"); SecretField(next, { next = it }, "At least 6 characters")
        Label("CONFIRM NEW PASSWORD"); SecretField(again, { again = it }, "Type it again")
        if (again.isNotEmpty() && next != again) WkText("The two passwords don't match.", 11, color = Wk.Red)
        PrimaryButton(if (hasPassword) "Change password" else "Set password", {
            vm.changePassword(if (hasPassword) current else null, next); current = ""; next = ""; again = ""
        }, height = 40, enabled = ok && !vm.settingsBusy)
    }
    Section("SIGN-IN METHODS") {
        listOf("email" to "Email & password", "google" to "Google").forEach { (id, label) ->
            ListRow { WkText(label, 13, FontWeight.SemiBold, Wk.Ink100, Modifier.weight(1f)); if (id in p.providers) Pill("Connected", Wk.Green) else Pill("Not connected", Wk.Ink400) }
        }
        WkText("Connect or disconnect sign-in methods from Settings on the Wynko website.", 11, color = Wk.Ink500)
    }
    Section("DANGER ZONE") {
        WkText("Delete Account", 14, FontWeight.SemiBold, Wk.Red); WkText("Permanently delete your Wynko account and all data. This can't be undone.", 11, color = Wk.Ink500)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Delete", { vm.sheet = SheetKind.DeleteAccount }, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.5f))
            GhostButton("Sign Out", { vm.signOut() })
        }
    }
}

@Composable
private fun StudyTab(vm: AppViewModel, p: SettingsProfile) {
    Section("DAILY GOALS") {
        Label("DAILY STUDY GOAL (HOURS) · drives Home's Today's Focus")
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(1, 2, 3, 4, 6, 8, 10).forEach { h -> Pill("${h}h", if (h * 60 == p.dailyGoalMinutes) Wk.Orange500 else Wk.Ink400, Modifier.tap { vm.setDailyGoal(h * 60) }, 12) }
        }
        if (p.dailyGoalMinutes % 60 != 0 || p.dailyGoalMinutes / 60 !in listOf(1, 2, 3, 4, 6, 8, 10)) WkText("Current goal: ${p.dailyGoalMinutes / 60}h ${p.dailyGoalMinutes % 60}m", 11, color = Wk.Ink500)
        Label("DEFAULT TIMER")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("pomodoro" to "Pomodoro", "regular" to "Regular").forEach { (id, n) ->
                val on = vm.mode == id
                Box(Modifier.weight(1f).height(44.dp).wkSurface(if (on) Color(0x24FF8A3D) else Wk.Black800, if (on) Wk.Orange600 else Wk.Black600, 12.dp).tap { vm.selectMode(id) }, contentAlignment = Alignment.Center) { WkText(n, 13, FontWeight.SemiBold, Wk.Ink100) }
            }
        }
        WkText("Pomodoro lengths are edited from the Pomodoro card in Focus Lock.", 11, color = Wk.Ink500)
    }
    PrefSection(vm, "FOCUS")
}

@Composable
private fun AboutTab() {
    val ctx = LocalContext.current
    fun open(path: String) { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.WEB_BASE_URL + path)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        WkText("Wynko", 20, FontWeight.ExtraBold, Wk.Cream50); Eyebrow("VERSION ${BuildConfig.VERSION_NAME}"); WkText("Better Focus. Better Results.", 13, FontWeight.SemiBold, Wk.Ink100); WkText("Study smarter with your community.", 12, color = Wk.Ink500)
        Spacer(Modifier.height(8.dp))
        ListRow(onClick = { open("/terms") }) { WkText("📄 Terms of Service", 13, color = Wk.Ink100, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500) }
        ListRow(onClick = { open("/privacy") }) { WkText("🔒 Privacy Policy", 13, color = Wk.Ink100, modifier = Modifier.weight(1f)); Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500) }
    }
}

@Composable
private fun Label(text: String) = WkText(text, 10, FontWeight.SemiBold, Wk.Ink500, letterSpacingEm = 0.1f)

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Eyebrow(title, Wk.Orange300); content() }
}

/** Single choice; tapping the selected chip clears it. */
@Composable
private fun Chips(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o -> Pill(o, if (o == selected) Wk.Orange500 else Wk.Ink400, Modifier.tap { onSelect(if (o == selected) "" else o) }, 12) }
    }
}

@Composable
private fun PrefSection(vm: AppViewModel, group: String) {
    val rows: List<PrefRow> = PrefGroups.firstOrNull { it.first == group }?.second.orEmpty()
    Section(group) { rows.forEach { r -> ToggleRow(r.label, null, vm.prefs[r.key] == true) { vm.setPref(r.key, it) } } }
}

@Composable
private fun SecretField(value: String, onChange: (String) -> Unit, placeholder: String) {
    OutlinedTextField(
        value, onChange, modifier = Modifier.fillMaxWidth(), singleLine = true,
        placeholder = { WkText(placeholder, 13, color = Wk.Ink600) },
        textStyle = TextStyle(fontFamily = Jakarta, fontSize = 14.sp, color = Wk.Ink100),
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        colors = wkFieldColors(), shape = RoundedCornerShape(12.dp),
    )
}
