package com.revm2.app.ui.shell

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.revm2.app.schedule.*
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.theme.Jakarta
import com.revm2.app.ui.theme.Wk

@Composable
fun wkFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Wk.Ink100, unfocusedTextColor = Wk.Ink100, focusedBorderColor = Wk.Orange500, unfocusedBorderColor = Wk.Black600,
    cursorColor = Wk.Orange500, focusedContainerColor = Wk.Black850, unfocusedContainerColor = Wk.Black850,
    focusedPlaceholderColor = Wk.Ink600, unfocusedPlaceholderColor = Wk.Ink600,
)

@Composable
fun WkField(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, singleLine: Boolean = true, number: Boolean = false, minLines: Int = 1) {
    OutlinedTextField(
        value, onChange, modifier = modifier.fillMaxWidth(), singleLine = singleLine, minLines = minLines,
        placeholder = { WkText(placeholder, 13, color = Wk.Ink600) },
        textStyle = TextStyle(fontFamily = Jakarta, fontSize = 14.sp, color = Wk.Ink100),
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else KeyboardType.Text),
        colors = wkFieldColors(), shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    )
}

@Composable
fun SheetHost(vm: AppViewModel) {
    when (vm.sheet) {
        null -> Unit
        SheetKind.Pause -> PauseSheet(vm)
        SheetKind.FreePause -> FreePauseSheet(vm)
        SheetKind.Gate -> GateSheet(vm)
        SheetKind.AddTask -> AddTaskSheet(vm)
        SheetKind.Pomodoro -> PomodoroSheet(vm)
        SheetKind.Notifications -> WkSheet({ vm.sheet = null }) {
            WkText("Notifications", 16, FontWeight.Bold, Wk.Ink100)
            if (vm.notifs.isEmpty()) WkText("You're all caught up.", 12, color = Wk.Ink500)
            vm.notifs.forEach { n ->
                ListRow {
                    Column(Modifier.weight(1f)) { WkText(n.title, 13, FontWeight.SemiBold, Wk.Ink100); WkText(n.body, 11, color = Wk.Ink500) }
                    WkText(n.whenText, 10, color = Wk.Ink600)
                }
            }
        }
        SheetKind.Password -> PasswordSheet(vm)
        SheetKind.DeleteAccount -> DeleteSheet(vm)
        SheetKind.AiAssistant -> AiSheet(vm)
        SheetKind.Routine -> RoutineSheet(vm)
        SheetKind.Challenge -> ChallengeSheet(vm)
        SheetKind.CreateRoom -> CreateRoomSheet(vm)
        SheetKind.NewAnnouncement -> AnnouncementSheet(vm)
        SheetKind.CreateCommunity -> CreateCommunitySheet(vm)
    }
}

@Composable
private fun PauseSheet(vm: AppViewModel) {
    var text by remember { mutableStateOf("") }
    val chars = countReflectionChars(text)
    WkSheet({ vm.sheet = null }) {
        Icon3(); WkText("Before you pause…", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Take a moment before breaking your focus. Type at least $PAUSE_REFLECTION_MIN_CHARS characters — anything on your mind. Gibberish counts; spaces don't. This isn't an essay.", 12, color = Wk.Ink400, lineHeight = 1.5f)
        WkField(text, { text = it }, "Start typing…", singleLine = false, minLines = 5)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            WkText("$chars / $PAUSE_REFLECTION_MIN_CHARS characters", 12, FontWeight.SemiBold, if (chars >= PAUSE_REFLECTION_MIN_CHARS) Wk.Green else Wk.Ink500, Modifier.weight(1f))
        }
        PrimaryButton("Unlock Pause", { vm.confirmPause() }, Modifier.fillMaxWidth(), enabled = isPauseUnlocked(text), color = Wk.Cream50)
        GhostButton("Keep Studying", { vm.sheet = null }, Modifier.fillMaxWidth(), height = 46)
    }
}

@Composable
private fun FreePauseSheet(vm: AppViewModel) {
    var reflect by remember { mutableStateOf(false) }
    if (reflect) { PauseSheet(vm); return }
    WkSheet({ vm.sheet = null }) {
        Icon3(); WkText("Take a free pause?", 18, FontWeight.Bold, Wk.Ink100)
        WkText("You're inside a scheduled block. You have ${vm.freePausesLeft} free pause${if (vm.freePausesLeft == 1) "" else "s"} left today for this schedule. It lasts $FREE_PAUSE_MINUTES minutes, then your timer resumes by itself. Blocking stays on.", 12, color = Wk.Ink400, lineHeight = 1.5f)
        PrimaryButton("Use a free pause", { vm.beginFreePause() }, Modifier.fillMaxWidth(), color = Wk.Cream50)
        GhostButton("Pause with a reflection instead", { reflect = true }, Modifier.fillMaxWidth(), height = 46)
        GhostButton("Keep Studying", { vm.sheet = null }, Modifier.fillMaxWidth(), height = 46)
    }
}

private const val GATE_LENGTH = 500
private const val GATE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>/?~"

/** The desktop's edit-lock gate: changing a schedule (pause / remove) needs a random 500-character code typed exactly. */
@Composable
private fun GateSheet(vm: AppViewModel) {
    val code = remember { val r = java.security.SecureRandom(); String(CharArray(GATE_LENGTH) { GATE_CHARSET[r.nextInt(GATE_CHARSET.length)] }) }
    var typed by remember { mutableStateOf("") }
    val ok = typed == code
    // Show the window of the code around what has been typed so far, like the desktop's scrolling code strip.
    val from = (typed.length - 12).coerceAtLeast(0)
    WkSheet({ vm.sheet = null; vm.gateAction = null }) {
        Icon3(); WkText("Type the code to change this schedule", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Your schedule is locked against casual changes. Type the $GATE_LENGTH-character string below exactly. Copy and paste won't work.", 12, color = Wk.Ink400, lineHeight = 1.5f)
        Box(Modifier.fillMaxWidth().wkSurface(Wk.Black850, Wk.Black600, 12.dp).padding(12.dp)) {
            WkText(code.substring(from, (from + 40).coerceAtMost(code.length)), 16, FontWeight.SemiBold, Wk.Orange200, letterSpacingEm = 0.08f)
        }
        WkField(typed, { if (it.length <= GATE_LENGTH && code.startsWith(it)) typed = it }, "Type here")
        WkText("${typed.length} / $GATE_LENGTH", 12, FontWeight.SemiBold, if (ok) Wk.Green else Wk.Ink500)
        PrimaryButton("Unlock", { val a = vm.gateAction; vm.sheet = null; vm.gateAction = null; a?.invoke() }, Modifier.fillMaxWidth(), enabled = ok)
    }
}

@Composable
private fun Icon3() = IconChip(Icons.Filled.Lock, 40, Wk.Orange300)

@Composable
private fun AddTaskSheet(vm: AppViewModel) {
    var subject by remember { mutableStateOf("Physics") }
    var topic by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("ADD TASK", Wk.Orange300); WkText("New study task", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Subject", 12, color = Wk.Ink400)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubjectsForAdd.forEach { s ->
                val on = s == subject
                Box(Modifier.weight(1f).height(38.dp).wkSurface(if (on) Color(0x24FF8A3D) else Wk.Black800, if (on) Wk.Orange600 else Wk.Black600, 12.dp).tap { subject = s }, contentAlignment = Alignment.Center) {
                    WkText(s.take(5), 12, FontWeight.SemiBold, if (on) Wk.Cream50 else Wk.Ink400, maxLines = 1)
                }
            }
        }
        WkText("Topic", 12, color = Wk.Ink400)
        WkField(topic, { topic = it }, "e.g. Electrostatics")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Add Task", { vm.addTask(subject, topic) }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun Stepper(label: String, value: Int, presets: List<Int>, onChange: (Int) -> Unit) {
    WkText(label, 13, FontWeight.SemiBold, Wk.Ink100)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        RoundIconButton(Icons.Filled.Remove, { onChange((value - 1).coerceAtLeast(1)) }, 40, Wk.Black600, Wk.Ink250)
        WkText("$value min", 16, FontWeight.Bold, Wk.Cream50, Modifier.weight(1f), align = androidx.compose.ui.text.style.TextAlign.Center)
        RoundIconButton(Icons.Filled.Add, { onChange((value + 1).coerceAtMost(180)) }, 40, Wk.Black600, Wk.Ink250)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        presets.forEach { p -> Pill("$p", if (p == value) Wk.Orange500 else Wk.Ink400, Modifier.tap { onChange(p) }, size = 11) }
    }
}

@Composable
private fun PomodoroSheet(vm: AppViewModel) {
    var focus by remember { mutableIntStateOf(vm.pomoFocus) }
    var brk by remember { mutableIntStateOf(vm.pomoBreak) }
    var repeat by remember { mutableStateOf(vm.pomoRepeat) }
    var auto by remember { mutableStateOf(vm.pomoAuto) }
    WkSheet({ vm.sheet = null }) {
        WkText("🍅 Customize Pomodoro", 18, FontWeight.Bold, Wk.Ink100)
        Stepper("Focus Duration", focus, listOf(15, 25, 45, 60)) { focus = it }
        Stepper("Break Duration", brk, listOf(5, 10, 15)) { brk = it }
        ToggleRow("Auto-start breaks", "Automatically start break after focus ends", auto) { auto = it }
        ToggleRow("Repeat", "Keep repeating for next session", repeat) { repeat = it }
        WkText("$focus / $brk • ${if (repeat) "Repeat" else "Once"}", 12, FontWeight.SemiBold, Wk.Orange300)
        if (vm.running) WkText("A Pomodoro already under way finishes at the length it started with — these apply to every new one.", 11, color = Wk.Ink500)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Save Settings", { vm.savePomodoro(focus, brk, repeat, auto) }, Modifier.weight(1f))
        }
    }
}

@Composable
fun ToggleRow(label: String, sub: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            WkText(label, 13, FontWeight.SemiBold, Wk.Ink100)
            if (sub != null) WkText(sub, 11, color = Wk.Ink500)
        }
        androidx.compose.material3.Switch(
            checked, onChange,
            colors = androidx.compose.material3.SwitchDefaults.colors(checkedTrackColor = Wk.Orange500, checkedThumbColor = Wk.Cream50, uncheckedTrackColor = Wk.Black600, uncheckedThumbColor = Wk.Ink400, uncheckedBorderColor = Wk.Black500),
        )
    }
}

@Composable
private fun PasswordSheet(vm: AppViewModel) {
    val room = vm.rooms.firstOrNull { it.id == vm.pendingRoomId }
    var pw by remember { mutableStateOf("") }
    var err by remember { mutableStateOf(false) }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("PRIVATE ROOM", Wk.Orange300); WkText(room?.name ?: "Room", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Enter the room password to join", 12, color = Wk.Ink400)
        WkField(pw, { pw = it; err = false }, "Password")
        if (err) WkText("Wrong password. Try again.", 12, color = Wk.Red)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Enter Room", { room?.let { vm.joinRoom(it.id, pw) { err = true } } }, Modifier.weight(1f), enabled = pw.isNotBlank())
        }
    }
}

@Composable
private fun DeleteSheet(vm: AppViewModel) {
    var txt by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        WkText("⚠️ Delete your account?", 18, FontWeight.Bold, Wk.Ink100)
        WkText("This permanently removes your profile, study history, plan, coins and battles. Type DELETE to confirm.", 12, color = Wk.Ink400, lineHeight = 1.5f)
        WkField(txt, { txt = it }, "DELETE")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Delete Account", { vm.deleteAccount() }, Modifier.weight(1f), enabled = txt == "DELETE", color = Wk.Red)
        }
    }
}

@Composable
private fun AiSheet(vm: AppViewModel) {
    var input by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Eyebrow("WYNKY", Wk.Orange300); WkText("Plan your study week", 18, FontWeight.Bold, Wk.Ink100) }
            if (vm.wynkyMsgs.any { it.past }) WkText("Clear history", 11, color = Wk.Ink500, modifier = Modifier.tap { vm.clearWynky() })
        }
        WkText("Same chat as Wynky on the web and desktop.", 11, color = Wk.Ink500)
        vm.wynkyMsgs.takeLast(30).forEach { m ->
            Box(Modifier.fillMaxWidth(), contentAlignment = if (m.fromBot) Alignment.CenterStart else Alignment.CenterEnd) {
                Box(Modifier.widthIn(max = 280.dp).wkSurface(if (m.fromBot) Wk.Black700 else Color(0x24FF8A3D), Wk.Black600, 14.dp).padding(10.dp)) { WkText(m.text, 13, color = if (m.past) Wk.Ink300 else Wk.Ink100, lineHeight = 1.4f) }
            }
        }
        if (vm.wynkyBusy) WkText("Wynky is thinking…", 12, color = Wk.Ink500)
        vm.wynkyPlan?.let { plan ->
            Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Orange600.copy(alpha = 0.4f), 14.dp).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Eyebrow("PROPOSED PLAN", Wk.Orange300)
                val names = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
                plan.days.toSortedMap(compareBy { it.toIntOrNull() ?: -1 }).forEach { (day, slots) ->
                    val label = if (day == "all") "Every day" else day.toIntOrNull()?.let { (if (it >= 7) "B " else "") + names[it % 7] } ?: day
                    WkText("$label: " + (slots.joinToString("; ") { "${it.start}-${it.end} ${it.subject ?: ""}" }.ifBlank { "day off" }), 12, color = Wk.Ink250)
                }
                PrimaryButton("Save to Focus Lock", { vm.saveWynkyPlan() }, Modifier.fillMaxWidth(), enabled = !vm.wynkyBusy)
            }
        }
        WkField(input, { input = it }, "e.g. 6 hours a day, mornings free on Sunday…", singleLine = false, minLines = 2)
        PrimaryButton("Send", { vm.sendWynky(input); input = "" }, Modifier.fillMaxWidth(), enabled = input.isNotBlank() && !vm.wynkyBusy)
    }
}

@Composable
private fun RoutineSheet(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    var site by remember { mutableStateOf("") }
    val apps = remember { mutableStateListOf("Instagram", "YouTube") }
    val sites = remember { mutableStateListOf<String>() }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("NEW ROUTINE", Wk.Orange300); WkText("Create Focus Routine", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Saved as a Focus Lock preset, so it shows up on the web and desktop too.", 11, color = Wk.Ink500)
        WkField(name, { name = it }, "Routine name")
        WkText("Apps to block", 12, color = Wk.Ink400)
        AppGrid(AllApps.take(8), apps) { n -> if (!apps.remove(n)) apps.add(n) }
        WkText("Websites to block", 12, color = Wk.Ink400)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { WkField(site, { site = it }, "reddit.com") }
            GhostButton("Add", { val v = site.trim().lowercase().removePrefix("https://").removePrefix("http://").removePrefix("www.").trimEnd('/'); if (v.isNotEmpty() && v !in sites) sites.add(v); site = "" }, height = 44)
        }
        if (sites.isNotEmpty()) WkText(sites.joinToString(", "), 12, color = Wk.Ink300)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Create Routine", { vm.createRoutine(name, apps.toList(), sites.toList()) }, Modifier.weight(1f), enabled = name.isNotBlank() && (apps.isNotEmpty() || sites.isNotEmpty()))
        }
    }
}

@Composable
private fun CreateRoomSheet(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("Physics") }
    var desc by remember { mutableStateOf("") }
    var isPublic by remember { mutableStateOf(true) }
    var pw by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("NEW STUDY ROOM", Wk.Orange300); WkText("Create a room", 18, FontWeight.Bold, Wk.Ink100)
        WkField(name, { name = it }, "Room name")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubjectsForAdd.forEach { sj ->
                val on = sj == subject
                Box(Modifier.weight(1f).height(38.dp).wkSurface(if (on) Color(0x24FF8A3D) else Wk.Black800, if (on) Wk.Orange600 else Wk.Black600, 12.dp).tap { subject = sj }, contentAlignment = Alignment.Center) {
                    WkText(sj.take(5), 12, FontWeight.SemiBold, if (on) Wk.Cream50 else Wk.Ink400, maxLines = 1)
                }
            }
        }
        WkField(desc, { desc = it }, "What's this room for?")
        ToggleRow("Public room", "Anyone can find and join", isPublic) { isPublic = it }
        if (!isPublic) WkField(pw, { pw = it }, "Room password")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Create", { vm.createRoom(name.trim(), subject, desc.trim(), isPublic, pw) }, Modifier.weight(1f), enabled = name.isNotBlank() && (isPublic || pw.length >= 4))
        }
    }
}

@Composable
private fun AnnouncementSheet(vm: AppViewModel) {
    var title by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf("") }
    var pinned by remember { mutableStateOf(false) }
    var important by remember { mutableStateOf(false) }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("NEW ANNOUNCEMENT", Wk.Orange300)
        WkField(title, { title = it }, "Title")
        WkField(msg, { msg = it }, "Message", singleLine = false, minLines = 4)
        ToggleRow("Pin to top", null, pinned) { pinned = it }
        ToggleRow("Mark important", null, important) { important = it }
        PrimaryButton("Post", { vm.postAnnouncement(title.trim(), msg.trim(), pinned, important) }, Modifier.fillMaxWidth(), enabled = title.isNotBlank() && msg.isNotBlank())
    }
}

@Composable
private fun CreateCommunitySheet(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("NEW COMMUNITY", Wk.Orange300); WkText("Create a community", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Communities are run by verified WynkoHeads. Apply on the web if you aren't one yet.", 11, color = Wk.Ink500)
        WkField(name, { name = it }, "Community name")
        WkField(desc, { desc = it }, "Description", singleLine = false, minLines = 3)
        PrimaryButton("Create", { vm.sheet = null; vm.createCommunity(name.trim(), desc.trim()) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank())
    }
}

@Composable
private fun ChallengeSheet(vm: AppViewModel) {
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(vm.leaderboard) }
    LaunchedEffect(q) {
        if (q.isBlank()) { results = vm.leaderboard; return@LaunchedEffect }
        kotlinx.coroutines.delay(300) // debounce
        try { results = com.revm2.app.data.AppRepository.searchOpponents(q.trim()) } catch (_: Exception) { results = emptyList() }
    }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("CHALLENGE SOMEONE", Wk.Orange300); WkText("Search by username.", 12, color = Wk.Ink400)
        WkField(q, { q = it }, "username")
        results.forEach { b ->
            ListRow(onClick = { vm.challenge(b.id, b.name) }) {
                Avatar(b.name.take(2).uppercase(), Wk.Orange300, 36)
                Column(Modifier.weight(1f)) { WkText(b.name, 13, FontWeight.SemiBold, Wk.Ink100); WkText("${b.title} · ${"%,d".format(b.xp)} XP", 11, color = Wk.Ink500) }
                WkText("Challenge", 12, FontWeight.SemiBold, Wk.Orange300)
            }
        }
    }
}

@Composable
fun AppGrid(apps: List<AppTile>, selected: List<String>, onToggle: (String) -> Unit) {
    apps.chunked(4).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { a ->
                val on = a.name in selected
                Column(
                    Modifier.weight(1f).wkSurface(if (on) Color(0x14FF8A3D) else Wk.Black800, if (on) Color(0xFFD96E2E) else Color(0x8C26262A), 12.dp).tap { onToggle(a.name) }.padding(vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(Modifier.size(34.dp).wkSurface(a.bg, Color.Transparent, 10.dp), contentAlignment = Alignment.Center) { WkText(a.label, 14, FontWeight.Bold, a.fg) }
                    WkText(a.name, 10, color = if (on) Wk.Orange200 else Wk.Ink400, maxLines = 1)
                }
            }
            repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}
