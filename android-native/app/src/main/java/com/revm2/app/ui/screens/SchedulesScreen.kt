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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.revm2.app.schedule.*
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Wk

private val DayNames = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
private val DayShort = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

private fun fmtMinutes(from: Int, to: Int): String = "${clockLabel("%02d:%02d".format(from / 60, from % 60))} – ${clockLabel("%02d:%02d".format((to % 1440) / 60, to % 60))}"
private fun durLabel(from: Int, to: Int): String { val m = to - from; return if (m >= 60) "${m / 60}h${if (m % 60 != 0) " ${m % 60}m" else ""}" else "${m}m" }

/**
 * Schedules, wired to the same Supabase tables the desktop app and `schedule-tick` use. Timing rules (India time,
 * alternate-week parity, midnight-crossing blocks, "timer only starts inside a block") are shared with desktop
 * via schedule/ScheduleGate.kt. Changing a schedule goes through the 500-character edit gate, like desktop.
 */
@Composable
fun SchedulesScreen(vm: AppViewModel) = ScreenColumn {
    val now = System.currentTimeMillis()
    val (todayDow, _) = remember(now / 60_000) { istDayAndMinute(now) }
    var day by remember { mutableIntStateOf(todayDow) }
    val active = remember(vm.schedules) { ScheduleStore_enforce(vm) }
    val offset = (day - todayDow + 7) % 7
    val blocks = remember(vm.schedules, day) { blocksOn(active, day, now, offset) }
    val blocked = vm.blockedApps
    var showAll by remember { mutableStateOf(false) }
    var site by remember { mutableStateOf("") }

    Column { Eyebrow("WEEKLY TIMETABLE"); WkText("Schedules", 28, FontWeight.ExtraBold, Wk.Cream50); WkText("Plan your week. Focus Lock follows it.", 13, color = Wk.Ink400) }
    vm.schedulesError?.let { WkText(it, 11, color = Wk.Orange300) }

    // Where we are right now, from the same gate that limits the focus timer.
    val g = vm.gate
    Row(Modifier.fillMaxWidth().wkSurface(Wk.Black800, if (g.inside != null) Wk.Green.copy(alpha = 0.4f) else Wk.Black600, 16.dp).padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(Icons.Filled.Schedule, null, tint = Wk.Orange300)
        WkText(
            when {
                g.inside != null -> "In a block now${g.inside.slot.subject?.let { ": $it" } ?: ""} · ends in ${g.inside.endsInMin} min"
                g.restricted -> blockedMessage(g)
                g.next != null -> "Next block: ${g.next.slot.subject?.let { "$it at " } ?: ""}${clockLabel(g.next.slot.start)}"
                vm.schedules.isEmpty() -> "No schedules yet. Build one with Wynky on the desktop app or the web, and it shows up here."
                else -> "Nothing scheduled."
            }, 12, color = Wk.Ink100, modifier = Modifier.weight(1f), lineHeight = 1.4f,
        )
    }

    Column(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.3f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Eyebrow("AI ASSISTANT", Wk.Orange300); WkText("Create Your Study Schedule", 16, FontWeight.Bold, Wk.Ink100)
        WkText("Tell us your subjects, goals and available time. Our AI will build a personalized plan for you.", 12, color = Wk.Ink400)
        PrimaryButton("✦ Plan with Wynky", { vm.openWynky() }, Modifier.fillMaxWidth())
    }

    // Week strip: today first, Sun-based weekday index like the database.
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (0..6).forEach { i ->
            val d = (todayDow + i) % 7
            val on = d == day
            val has = blocksOn(active, d, now, i).isNotEmpty()
            Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (on) Brush.linearGradient(listOf(Color(0x47FF8A3D), Color(0x24FFA94D))) else Brush.linearGradient(listOf(Wk.Black800, Wk.Black800))).tap { day = d }.padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                WkText(DayShort[d], 11, FontWeight.SemiBold, if (on) Wk.Cream50 else Wk.Ink300)
                Box(Modifier.padding(top = 4.dp).size(5.dp).clip(CircleShape).background(if (has) (if (on) Wk.Orange500 else Wk.Ink600) else Color.Transparent))
            }
        }
    }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        CardHeader(Icons.Filled.Schedule, DayNames[day] + if (offset == 0) " · today" else "", "${blocks.size} block${if (blocks.size == 1) "" else "s"}")
        if (blocks.isEmpty()) { WkText("No blocks this day", 14, FontWeight.SemiBold, Wk.Ink300); WkText("Schedules you create on the web or desktop appear here.", 12, color = Wk.Ink500) }
        blocks.forEach { b ->
            val c = SubjectColor[b.slot.subject] ?: Wk.Orange500
            ListRow {
                Column(Modifier.width(78.dp)) { WkText(fmtMinutes(b.from, b.to), 10, FontWeight.SemiBold, Wk.Ink100); WkText(durLabel(b.from, b.to), 10, color = Wk.Ink500) }
                Box(Modifier.width(3.dp).height(34.dp).clip(CircleShape).background(c))
                val stored = vm.schedules.flatMap { it.slots }.firstOrNull { it.id == b.slot.id }
                Column(Modifier.weight(1f)) {
                    WkText(if (b.slot.isSleep) "😴 Sleep" else "${SubjectEmoji[b.slot.subject] ?: "📘"} ${b.slot.subject ?: stored?.preset?.name ?: "Focus block"}", 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
                    WkText(if (b.slot.isSleep) "Everything blocked · can't be unlocked" else "${b.schedule.name}${if (stored?.preset?.noEarlyUnlock == true) " · locked" else ""}", 11, color = Wk.Ink500, maxLines = 1)
                }
            }
        }
    }

    WkText("My schedules", 14, FontWeight.Bold, Wk.Ink100)
    if (vm.schedules.isEmpty()) WkText("None yet.", 12, color = Wk.Ink500)
    vm.schedules.forEach { s ->
        Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                WkText(s.name, 14, FontWeight.SemiBold, Wk.Ink100, Modifier.weight(1f), maxLines = 1)
                Pill(if (s.active) "ACTIVE" else "PAUSED", if (s.active) Wk.Green else Wk.Ink400)
            }
            WkText(s.days.sorted().joinToString(" ") { DayShort[it] } + (s.parity?.let { " · alternate weeks" } ?: "") + " · ${s.slots.size} block${if (s.slots.size == 1) "" else "s"}", 11, color = Wk.Ink500)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton(if (s.active) "Pause" else "Resume", { vm.requireGate { vm.setScheduleActive(s.id, !s.active) } }, height = 36)
                GhostButton("Remove", { vm.requireGate { vm.removeSchedule(s.id) } }, height = 36, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.4f))
            }
        }
    }
    WkText("Pausing or removing a schedule needs the same typed code as on desktop. Editing blocks is done there for now.", 11, color = Wk.Ink500, lineHeight = 1.4f)

    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        CardHeader(Icons.Filled.Block, "Block Distracting Apps & Websites", "Select what to block during your study time.") {}
        Row(Modifier.fillMaxWidth()) { Eyebrow("APPS", modifier = Modifier.weight(1f)); WkText(if (showAll) "Show less" else "All apps →", 12, color = Wk.Orange300, modifier = Modifier.tap { showAll = !showAll }) }
        AppGrid(if (showAll) AllApps else AllApps.take(8), blocked) { vm.toggleApp(it) }
        Eyebrow("WEBSITES")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { WkField(site, { site = it }, "reddit.com") }
            PrimaryButton("Block", { val v = site.trim().lowercase().removePrefix("https://").removePrefix("www."); if (v.isNotEmpty() && v !in vm.blockedSites) vm.blockedSites.add(v); site = "" }, height = 48)
        }
        if (vm.blockedSites.isEmpty()) WkText("No websites blocked yet. Add URLs above.", 12, color = Wk.Ink500)
        vm.blockedSites.toList().forEach { w -> ListRow { WkText("🌐 $w", 13, color = Wk.Ink100, modifier = Modifier.weight(1f)); WkText("×", 18, color = Wk.Ink500, modifier = Modifier.tap { vm.blockedSites.remove(w) }) } }
    }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        WkText("⏰ Create Focus Routine", 15, FontWeight.Bold, Wk.Ink100); WkText("Set blocking rules once, activate like an alarm when needed.", 11, color = Wk.Ink500)
        if (vm.routines.isEmpty()) WkText("No routines yet. They're the same Focus Lock presets as on the web and desktop.", 11, color = Wk.Ink500)
        vm.routines.forEach { r ->
            Column(Modifier.fillMaxWidth().wkSurface(Wk.Black850, Wk.Black600, 12.dp).tap { vm.go(Dest.BlockLists) }.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { WkText(r.name, 14, FontWeight.SemiBold, Wk.Ink100, Modifier.weight(1f)); WkText("Start →", 12, FontWeight.SemiBold, Wk.Orange300) }
                val what = (r.apps + r.sites).take(6).joinToString(", ")
                WkText((if (r.mode == "whitelist") "Allows only " else "Blocks ") + what.ifBlank { "nothing yet" }, 11, color = Wk.Ink400, maxLines = 2)
                r.durationMinutes?.let { WkText("$it min", 11, color = Wk.Ink500) }
            }
        }
        GhostButton("+ New Routine", { vm.sheet = SheetKind.Routine }, Modifier.fillMaxWidth())
    }
}

private fun ScheduleStore_enforce(vm: AppViewModel) = ScheduleStore.enforceSchedules(vm.schedules)
