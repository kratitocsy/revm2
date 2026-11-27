package com.wynko.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.wynko.app.data.ActiveBattle
import com.wynko.app.data.BattlegroundState
import com.wynko.app.data.parseTimestampMs
import com.wynko.app.ui.components.*
import com.wynko.app.ui.shell.*
import com.wynko.app.ui.theme.Wk

/** Title thresholds, the same as battle_title_for_xp() on the server (migration 0062). */
private val Tiers = listOf("Rookie" to 0, "Challenger" to 100, "Focused" to 300, "Warrior" to 700, "Elite" to 1500, "Unstoppable" to 3000)

private fun initialsOf(name: String?) = name.orEmpty().filter { it.isLetterOrDigit() }.take(2).uppercase().ifEmpty { "?" }

private fun hoursLabel(seconds: Int): String = when {
    seconds >= 3600 -> "${seconds / 3600}h"
    else -> "${seconds / 60}m"
}

private fun expiresLabel(expiresAt: String?, nowMs: Long): String {
    val left = ((parseTimestampMs(expiresAt) ?: return "") - nowMs) / 1000
    return if (left <= 0) "expiring" else "expires in ${left / 60}:${"%02d".format(left % 60)}"
}

/**
 * Battleground on live data: the hub snapshot, invites, ready-up, the arena and history all come from the
 * server (data/BattleRepository.kt), refreshed by AppViewModel every few seconds while a duel is in play.
 */
@Composable
fun BattlegroundScreen(vm: AppViewModel) = ScreenColumn {
    val s = vm.bg
    var profile by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.refreshBattle(full = true) }

    Column { Eyebrow("BATTLEGROUND"); WkText("1v1 focus duels", 17, FontWeight.Bold, Wk.Ink100) }
    if (s == null) {
        Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            WkText(vm.bgError ?: "Loading Battleground…", 13, color = if (vm.bgError != null) Wk.Red else Wk.Ink400, align = TextAlign.Center)
            if (vm.bgError != null) GhostButton("Try again", { vm.refreshBattle(full = true) })
        }
        return@ScreenColumn
    }
    val active = s.active
    when {
        active != null && active.status == "active" -> Arena(vm, active)
        active != null -> ReadyUp(vm, active)
        profile -> BattleProfile(vm, s) { profile = false }
        else -> Hub(vm, s) { profile = true }
    }
}

@Composable
private fun ColumnScope.Hub(vm: AppViewModel, s: BattlegroundState, onProfile: () -> Unit) {
    vm.lastBattle?.let { r ->
        val won = r.result == "won"
        Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, (if (won) Wk.Green else Wk.Red).copy(alpha = 0.5f), 16.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            WkText(if (won) "You won against ${r.opponentUsername ?: "your opponent"}" else "${r.opponentUsername ?: "Your opponent"} won this one", 14, FontWeight.Bold, Wk.Ink100)
            WkText("${r.focusSeconds / 60} min focused · +${r.xpEarned} XP", 12, color = Wk.Ink400)
            WkText("Dismiss", 12, FontWeight.SemiBold, Wk.Orange300, Modifier.tap { vm.lastBattle = null })
        }
    }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        WkText("⚔️ Battleground", 17, FontWeight.Bold, Wk.Ink100); WkText("Challenge someone. Stay focused. Don't pause.", 12, color = Wk.Ink400)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Pill(s.me.title, Wk.Violet); WkText("%,d XP".format(s.me.xp), 13, FontWeight.Bold, Wk.Orange300) }
        WkText("Both of you start focusing together. Whoever pauses first loses.", 12, color = Wk.Ink500)
        PrimaryButton("⚔️ Challenge someone", { vm.sheet = SheetKind.Challenge }, Modifier.fillMaxWidth(), enabled = s.outgoingInvite == null && !vm.battleBusy)
    }
    s.outgoingInvite?.let { o ->
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WkText("VS", 22, FontWeight.ExtraBold, Wk.Orange500); WkText("Waiting for ${o.username ?: "your opponent"} to accept", 14, FontWeight.SemiBold, Wk.Ink100)
            WkText("Once they accept, you'll both ready up and the battle begins. ${expiresLabel(o.expiresAt, vm.nowMs).replaceFirstChar { it.uppercase() }}.", 12, color = Wk.Ink400, align = TextAlign.Center)
            GhostButton("Cancel challenge", { vm.cancelChallenge(o.id) })
        }
    }
    s.incomingInvites.forEach { inv ->
        Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Orange600.copy(alpha = 0.5f), 16.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WkText("${inv.username ?: "Someone"} challenged you", 14, FontWeight.Bold, Wk.Ink100)
            WkText(listOfNotNull(inv.title, expiresLabel(inv.expiresAt, vm.nowMs).takeIf { it.isNotEmpty() }).joinToString(" · "), 11, color = Wk.Ink500)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Decline", { vm.respondChallenge(inv.id, false) }, Modifier.weight(1f), height = 42)
                PrimaryButton("Accept", { vm.respondChallenge(inv.id, true) }, Modifier.weight(1f), height = 42, enabled = !vm.battleBusy)
            }
        }
    }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        WkText("Your battle stats", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); WkText("Titles & history", 12, color = Wk.Orange300, modifier = Modifier.tap(onProfile))
    }
    listOf(
        listOf("${s.stats.total}" to "Battles", "${s.stats.wins}" to "Won", "${s.stats.losses}" to "Lost"),
        listOf(hoursLabel(s.stats.totalFocusSeconds) to "Focused", "%,d".format(s.me.xp) to "XP", (if (s.stats.total > 0) "${s.stats.wins * 100 / s.stats.total}%" else "–") to "Win rate"),
    ).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { (v, l) -> Column(Modifier.weight(1f).wkCard().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) { WkText(v, 17, FontWeight.Bold, Wk.Cream50); WkText(l, 10, color = Wk.Ink500) } }
        }
    }
    Column { WkText("🏆 Leaderboard", 14, FontWeight.Bold, Wk.Ink100); WkText("Ranked by Battle XP", 11, color = Wk.Ink500) }
    if (vm.topBattlers.isEmpty()) WkText("No one else has battled yet. Send the first challenge.", 12, color = Wk.Ink500)
    vm.topBattlers.forEachIndexed { i, b ->
        ListRow {
            WkText(listOf("🥇", "🥈", "🥉").getOrNull(i) ?: "#${i + 1}", 16, modifier = Modifier.width(30.dp), align = TextAlign.Center)
            Column(Modifier.weight(1f)) { WkText(b.username ?: "player", 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1); WkText("${b.title} · ${"%,d".format(b.battleXp)} XP", 11, color = Wk.Ink500) }
            if (s.outgoingInvite == null) GhostButton("Challenge", { vm.challenge(b) }, height = 34, textColor = Wk.Orange200, border = Wk.Orange600)
        }
    }
}

/** Both players accepted; the battle starts when both have tapped ready. */
@Composable
private fun ReadyUp(vm: AppViewModel, b: ActiveBattle) {
    Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Versus(b)
        WkText("Ready up", 18, FontWeight.Bold, Wk.Ink100)
        WkText("The timer starts the moment you are both ready. Whoever pauses first loses.", 12, color = Wk.Ink400, align = TextAlign.Center)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill(if (b.iAmReady) "You: ready" else "You: not ready", if (b.iAmReady) Wk.Green else Wk.Ink400)
            Pill(if (b.opponentReady) "Opponent: ready" else "Opponent: not ready", if (b.opponentReady) Wk.Green else Wk.Ink400)
        }
        if (b.iAmReady) WkText("Waiting for ${b.opponentUsername ?: "your opponent"}…", 13, FontWeight.SemiBold, Wk.Orange300)
        else PrimaryButton("I'm ready", { vm.readyBattle(b.id) }, Modifier.fillMaxWidth(), enabled = !vm.battleBusy)
        GhostButton("Cancel battle", { vm.cancelPendingBattle(b.id) })
    }
}

@Composable
private fun Arena(vm: AppViewModel, b: ActiveBattle) {
    var confirm by remember { mutableStateOf(false) }
    val started = parseTimestampMs(b.startedAt) ?: vm.nowMs
    val secs = ((vm.nowMs - started) / 1000).coerceAtLeast(0).toInt()
    Column(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.4f)).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Versus(b)
        WkText(AppViewModel.fmt(secs, hours = secs >= 3600), 40, FontWeight.ExtraBold, Wk.Cream50)
        WkText("Hold focus. Don't pause.", 12, color = Wk.Ink400)
        if (vm.running) WkText("Your focus timer is running. Pausing it forfeits the battle.", 12, color = Wk.Green, align = TextAlign.Center)
        else PrimaryButton("Start focus timer", { vm.startFocus() }, Modifier.fillMaxWidth())
        if (confirm) {
            WkText("Give up? ${b.opponentUsername ?: "Your opponent"} wins.", 13, FontWeight.SemiBold, Wk.Ink100)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Keep going", { confirm = false }, Modifier.weight(1f), height = 42)
                PrimaryButton("Give up", { confirm = false; vm.running = false; vm.forfeitBattle() }, Modifier.weight(1f), height = 42, color = Wk.Red, enabled = !vm.battleBusy)
            }
        } else GhostButton("Give up (you lose)", { confirm = true }, textColor = Wk.Red, border = Wk.Red.copy(alpha = 0.4f))
    }
    WkText("Winner: +20 XP and 1 per minute focused (up to 60). The other player: 1 per minute (up to 20).", 11, color = Wk.Ink500, lineHeight = 1.4f)
}

@Composable
private fun Versus(b: ActiveBattle) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) { Avatar("ME", Wk.Orange300, 52); WkText("You", 12, color = Wk.Ink300) }
        WkText("VS", 18, FontWeight.ExtraBold, Wk.Orange500)
        Column(horizontalAlignment = Alignment.CenterHorizontally) { Avatar(initialsOf(b.opponentUsername), Wk.Pink, 52); WkText(b.opponentUsername ?: "Opponent", 12, color = Wk.Ink300, maxLines = 1) }
    }
}

@Composable
private fun BattleProfile(vm: AppViewModel, s: BattlegroundState, onBack: () -> Unit) {
    val xp = s.me.xp
    val ri = Tiers.indexOfLast { xp >= it.second }.coerceAtLeast(0)
    val next = Tiers.getOrNull(ri + 1)
    Row(Modifier.tap(onBack), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.ChevronLeft, null, tint = Wk.Ink300); WkText("Battleground", 13, color = Wk.Ink300) }
    Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Pill(s.me.title, Wk.Violet)
        WkText("%,d Battle XP".format(xp), 20, FontWeight.ExtraBold, Wk.Cream50)
        WkText(if (next != null) "%,d XP to ${next.first}".format(next.second - xp) else "Top title reached", 12, color = Wk.Ink400)
    }
    WkText("Battle titles", 14, FontWeight.Bold, Wk.Ink100)
    Tiers.forEachIndexed { i, (n, min) ->
        ListRow {
            Box(Modifier.size(22.dp).clip(CircleShape).background(if (i < ri) Color(0xFF4ADE80) else if (i == ri) Wk.Orange500 else Wk.Black600), contentAlignment = Alignment.Center) { if (i < ri) WkText("✓", 11, FontWeight.Bold, Wk.Black950) }
            WkText(n, 13, FontWeight.SemiBold, if (i == ri) Wk.Cream50 else Wk.Ink400, Modifier.weight(1f)); WkText("%,d XP".format(min), 11, color = Wk.Ink500)
        }
    }
    WkText("Battle history", 14, FontWeight.Bold, Wk.Ink100)
    if (vm.battleHistory.isEmpty()) WkText("No finished battles yet.", 12, color = Wk.Ink500)
    vm.battleHistory.forEach { r ->
        val won = r.result == "won"
        val day = parseTimestampMs(r.endedAt)?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate().let { d -> "${d.dayOfMonth} ${d.month.name.take(3).lowercase().replaceFirstChar { c -> c.uppercase() }}" } }
        ListRow {
            Box(Modifier.size(28.dp).clip(CircleShape).background(if (won) Wk.Green else Wk.Red), contentAlignment = Alignment.Center) { WkText(if (won) "W" else "L", 12, FontWeight.Bold, Wk.Black950) }
            Column(Modifier.weight(1f)) {
                WkText("vs ${r.opponentUsername ?: "player"}", 13, FontWeight.SemiBold, Wk.Ink100, maxLines = 1)
                WkText(listOfNotNull(day, "${r.focusSeconds / 60}m focused", "+${r.xpEarned} XP").joinToString(" · "), 11, color = Wk.Ink500)
            }
        }
    }
}
