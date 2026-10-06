package com.revm2.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.AppViewModel
import com.revm2.app.ui.shell.Dest
import com.revm2.app.ui.shell.SheetKind
import com.revm2.app.ui.theme.Wk
import androidx.compose.material3.Icon
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem

@Composable
fun HomeScreen(vm: AppViewModel) = ScreenColumn {
    ProgressCard(vm)
    TimerCard(vm)
    PlanCard(vm)
    LiveRoomsCard(vm)
}

@Composable
private fun ProgressCard(vm: AppViewModel) {
    var selected by remember { mutableIntStateOf(WeekMinutes.lastIndex) }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp)) {
        CardHeader(Icons.Filled.BarChart, "Your Study Progress", "Study time · Last 7 days")
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(Triple(Icons.Filled.Schedule, "16h 5m", "Total Studied"), Triple(Icons.Filled.BarChart, "2h 18m", "Daily Average"), Triple(Icons.Filled.TrackChanges, "${vm.profile?.streak ?: 0} days", "Current Streak")).forEach { (ic, v, l) ->
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    IconChip(ic, 28, round = true)
                    Column { WkText(v, 13, FontWeight.Bold, Wk.Ink100, maxLines = 1); WkText(l, 9, color = Wk.Ink500, maxLines = 1) }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(150.dp)) {
            Canvas(Modifier.fillMaxSize().padding(start = 22.dp, bottom = 20.dp, top = 6.dp)) {
                val w = size.width; val h = size.height
                for (g in 0..4) drawLine(Color(0x149C968C), Offset(0f, h - h * g / 4f), Offset(w, h - h * g / 4f), 1f)
                val pts = WeekMinutes.mapIndexed { i, m -> Offset(w * i / (WeekMinutes.size - 1), h - h * (m / 240f)) }
                val line = Path().apply {
                    moveTo(pts[0].x, pts[0].y)
                    for (i in 1 until pts.size) {
                        val mx = (pts[i - 1].x + pts[i].x) / 2
                        cubicTo(mx, pts[i - 1].y, mx, pts[i].y, pts[i].x, pts[i].y)
                    }
                }
                val area = Path().apply { addPath(line); lineTo(w, h); lineTo(0f, h); close() }
                drawPath(area, Brush.verticalGradient(listOf(Color(0x38FFB057), Color.Transparent)))
                drawPath(line, Brush.horizontalGradient(listOf(Wk.Orange500, Wk.Orange400, Wk.Orange500)), style = Stroke(width = 7f, cap = StrokeCap.Round))
                pts.forEachIndexed { i, p ->
                    if (i == selected) { drawCircle(Color(0x33FF8A3D), 22f, p); drawCircle(Wk.Orange500, 11f, p); drawCircle(Wk.Cream50, 4f, p) }
                    else drawCircle(Color(0xFFFFB57A), 6f, p)
                }
            }
            Column(Modifier.fillMaxHeight().padding(bottom = 20.dp, top = 6.dp), verticalArrangement = Arrangement.SpaceBetween) {
                listOf("4h", "3h", "2h", "1h", "0h").forEach { WkText(it, 9, color = Wk.Ink400.copy(alpha = 0.4f)) }
            }
            Row(Modifier.fillMaxSize().padding(start = 22.dp), verticalAlignment = Alignment.Bottom) {
                WeekLabels.forEachIndexed { i, l ->
                    Box(Modifier.weight(1f).tap { selected = i }, contentAlignment = Alignment.BottomCenter) {
                        WkText(l, 10, if (i == selected) FontWeight.Bold else FontWeight.Normal, if (i == selected) Wk.Orange500 else Wk.Ink500, align = TextAlign.Center)
                    }
                }
            }
        }
        WkText("${WeekLabels[selected]} · ${WeekMinutes[selected] / 60}h ${WeekMinutes[selected] % 60}m", 11, FontWeight.SemiBold, Wk.Ink100, Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun TimerCard(vm: AppViewModel) {
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp)) {
        CardHeader(Icons.Filled.TrackChanges, "Focus Timer") {
            Box {
                Row(Modifier.height(30.dp).clip(CircleShape).background(Wk.Black600).border(1.dp, Wk.Black500, CircleShape).tap { menu = true }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    WkText(if (vm.mode == "pomodoro") "Pomodoro" else "Regular", 11, FontWeight.Medium, Wk.Ink250)
                    Icon(Icons.Filled.KeyboardArrowDown, null, tint = Wk.Ink250, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { WkText("🍅 Pomodoro Timer", 13, color = Wk.Ink100) }, onClick = { vm.selectMode("pomodoro"); menu = false })
                    DropdownMenuItem(text = { WkText("⏱ Regular Timer", 13, color = Wk.Ink100) }, onClick = { vm.selectMode("regular"); menu = false })
                }
            }
        }
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TimerRing(vm.timerText, if (vm.mode == "pomodoro") "Focus Time" else "Count Up • No Limit", 190, if (vm.mode == "pomodoro") 34 else 28)
            PrimaryButton("Focus Lock", { vm.go(Dest.Focus) }, icon = Icons.Filled.Lock)
            WkText("Quick timer →", 12, FontWeight.SemiBold, Wk.Orange300, Modifier.tap { vm.go(Dest.Quick) })
        }
    }
}

@Composable
fun TimerRing(text: String, caption: String, size: Int, textSize: Int, progress: Float? = null) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Brush.radialGradient(listOf(Wk.Black700, Color(0xFF0F0F11)))),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 9f
            drawCircle(Color(0x73FFE59A), radius = (this.size.minDimension - stroke) / 2, style = Stroke(stroke))
            if (progress != null) drawArc(Wk.Orange500, -90f, 360f * progress, false, style = Stroke(stroke * 1.2f, cap = StrokeCap.Round),
                topLeft = Offset(stroke / 2, stroke / 2), size = androidx.compose.ui.geometry.Size(this.size.width - stroke, this.size.height - stroke))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            WkText(text, textSize, FontWeight.Bold, Wk.Cream50)
            WkText(caption, 11, color = Wk.Ink400, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun PlanCard(vm: AppViewModel) {
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp)) {
        CardHeader(Icons.Filled.Schedule, "Today's Study Plan") { WkText(java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM yyyy")), 11, color = Wk.Ink500) }
        if (vm.tasks.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                WkText("📭", 30); WkText("No tasks scheduled for today", 14, FontWeight.SemiBold, Wk.Ink300, Modifier.padding(top = 8.dp, bottom = 4.dp))
                WkText("Add a task to build today's study plan.", 12, color = Wk.Ink500, modifier = Modifier.padding(bottom = 16.dp), align = TextAlign.Center)
                PrimaryButton("+ Add Task", { vm.sheet = SheetKind.AddTask }, height = 38)
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                vm.tasks.forEach { t -> TaskRow(vm, t) }
            }
            Box(Modifier.padding(top = 10.dp).fillMaxWidth().height(44.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                .border(1.dp, Wk.Black500, androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).tap { vm.sheet = SheetKind.AddTask }, contentAlignment = Alignment.Center) {
                WkText("+ Add Task", 12, FontWeight.SemiBold, Wk.Ink300)
            }
        }
    }
}

@Composable
fun TaskRow(vm: AppViewModel, t: com.revm2.app.ui.shell.StudyTask) {
    val c = SubjectColor[t.subject] ?: Wk.Orange500
    ListRow {
        Box(Modifier.size(36.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp)).background(c.copy(alpha = 0.16f)).border(1.dp, c.copy(alpha = 0.35f), androidx.compose.foundation.shape.RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            WkText(SubjectEmoji[t.subject] ?: "📘", 16)
        }
        Column(Modifier.weight(1f)) {
            WkText(t.subject, 14, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
            WkText(if (t.topic.isNotBlank()) "${t.topic} · ${t.minutes} min" else "${t.minutes} min", 11, color = Wk.Ink500, maxLines = 1)
        }
        RoundIconButton(Icons.Filled.Close, { vm.removeTask(t.id) })
        Box(Modifier.size(36.dp).clip(CircleShape).background(Wk.Cream50).tap { vm.startTask(t.id) }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PlayArrow, "Start", tint = Wk.Black950, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun LiveRoomsCard(vm: AppViewModel) {
    val live = Rooms.filter { it.hot }.take(4)
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp)) {
        CardHeader(Icons.Filled.Videocam, "Live Study Rooms") {
            Column(horizontalAlignment = Alignment.End) {
                WkText("View All", 12, color = Wk.Ink300, modifier = Modifier.tap { vm.go(Dest.Rooms) })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { StatDot(Wk.Green); WkText("${live.sumOf { it.live }} studying", 11, color = Wk.Green) }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            live.forEach { r ->
                ListRow(onClick = { vm.openRoom(r.id, Dest.Rooms) }) {
                    RoomIcon(r, 40)
                    Column(Modifier.weight(1f)) { WkText(r.name, 14, FontWeight.SemiBold, Wk.Ink100, maxLines = 1); WkText("${r.live} / ${r.members} studying", 11, color = Wk.Ink500) }
                    AvatarStack(r.people.take(3), 24)
                    Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
fun RoomIcon(r: Room, size: Int) {
    Box(Modifier.size(size.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(r.iconA, r.iconB))), contentAlignment = Alignment.Center) {
        WkText(r.iconLabel, if (size > 44) 22 else 16, FontWeight.Bold, Wk.Cream50)
    }
}
