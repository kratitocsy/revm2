package com.revm2.app.ui.shell

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
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
            Notifications.forEach { n ->
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
            WkText("demo: fill sample", 11, color = Wk.Orange300, modifier = Modifier.tap { text = "reading electrostatics notes again feeling a bit tired need water then back to ".repeat(3) })
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
        RoundIconButton(androidx.compose.material.icons.Icons.Filled.Remove, { onChange((value - 1).coerceAtLeast(1)) }, 40, Wk.Black600, Wk.Ink250)
        WkText("$value min", 16, FontWeight.Bold, Wk.Cream50, Modifier.weight(1f), align = androidx.compose.ui.text.style.TextAlign.Center)
        RoundIconButton(androidx.compose.material.icons.Icons.Filled.Add, { onChange((value + 1).coerceAtMost(180)) }, 40, Wk.Black600, Wk.Ink250)
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
    val room = Rooms.firstOrNull { it.id == vm.pendingRoomId }
    var pw by remember { mutableStateOf("") }
    var err by remember { mutableStateOf(false) }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("PRIVATE ROOM", Wk.Orange300); WkText(room?.name ?: "Room", 18, FontWeight.Bold, Wk.Ink100)
        WkText("Enter the room password to join", 12, color = Wk.Ink400)
        WkField(pw, { pw = it; err = false }, "Password")
        if (err) WkText("Wrong password. Try again.", 12, color = Wk.Red)
        WkText("demo: bio123 / jee2026", 11, color = Wk.Ink600)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Enter Room", {
                if (room != null && pw == room.password) { vm.joinedRooms.add(room.id); vm.sheet = null; vm.openRoom(room.id, Dest.Rooms) } else err = true
            }, Modifier.weight(1f))
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
            PrimaryButton("Delete Account", { vm.sheet = null; vm.flash("Demo only — nothing was deleted") }, Modifier.weight(1f), enabled = txt == "DELETE", color = Wk.Red)
        }
    }
}

@Composable
private fun AiSheet(vm: AppViewModel) {
    var input by remember { mutableStateOf("") }
    val msgs = remember { mutableStateListOf("bot" to "Hi! I’m Wynky 🐧 Tell me your exam, subjects and how many hours you can study each day — I’ll build your week.") }
    var ready by remember { mutableStateOf(false) }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("AI ASSISTANT", Wk.Orange300); WkText("Create Your Study Schedule", 18, FontWeight.Bold, Wk.Ink100); Pill("Online", Wk.Green)
        msgs.forEach { (from, text) ->
            Box(Modifier.fillMaxWidth(), contentAlignment = if (from == "bot") Alignment.CenterStart else Alignment.CenterEnd) {
                Box(Modifier.widthIn(max = 280.dp).wkSurface(if (from == "bot") Wk.Black700 else Color(0x24FF8A3D), Wk.Black600, 14.dp).padding(10.dp)) { WkText(text, 13, color = Wk.Ink100, lineHeight = 1.4f) }
            }
        }
        WkField(input, { input = it }, "Type here…")
        if (ready) PrimaryButton("Apply to My Week", { vm.sheet = null; vm.flash("Schedule applied (demo)") }, Modifier.fillMaxWidth())
        else PrimaryButton("Send", {
            if (input.isNotBlank()) { msgs.add("me" to input); msgs.add("bot" to "Got it! I've drafted a balanced week with revision slots. Apply it when you're ready."); input = ""; ready = true }
        }, Modifier.fillMaxWidth())
    }
}

@Composable
private fun RoutineSheet(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    val apps = remember { mutableStateListOf("Instagram", "YouTube") }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("NEW ROUTINE", Wk.Orange300); WkText("Create Focus Routine", 18, FontWeight.Bold, Wk.Ink100)
        WkField(name, { name = it }, "Routine name")
        WkText("Apps to block", 12, color = Wk.Ink400)
        AppGrid(AllApps.take(8), apps) { n -> if (!apps.remove(n)) apps.add(n) }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Cancel", { vm.sheet = null }, Modifier.weight(1f), height = 46)
            PrimaryButton("Create Routine", { vm.sheet = null; vm.flash("Routine created (demo)") }, Modifier.weight(1f), enabled = name.isNotBlank())
        }
    }
}

@Composable
private fun ChallengeSheet(vm: AppViewModel) {
    var q by remember { mutableStateOf("") }
    WkSheet({ vm.sheet = null }) {
        Eyebrow("CHALLENGE SOMEONE", Wk.Orange300); WkText("Search by username.", 12, color = Wk.Ink400)
        WkField(q, { q = it }, "username")
        Battlers.filter { q.isBlank() || it.name.contains(q.trim(), true) }.forEach { b ->
            ListRow(onClick = { vm.sheet = null; vm.battle = "waiting"; vm.flash("Challenge sent to ${b.name}") }) {
                Avatar(b.name.take(2).uppercase(), Wk.Orange300, 36)
                Column(Modifier.weight(1f)) { WkText(b.name, 13, FontWeight.SemiBold, Wk.Ink100); WkText("${b.title} · ${b.xp} XP", 11, color = Wk.Ink500) }
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
