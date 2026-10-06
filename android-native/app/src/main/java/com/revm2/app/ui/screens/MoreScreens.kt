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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.revm2.app.ui.components.*
import com.revm2.app.ui.sample.*
import com.revm2.app.ui.shell.*
import com.revm2.app.ui.theme.Wk

// ───────────────────────── Profile ("More") ─────────────────────────
@Composable
fun MoreScreen(vm: AppViewModel) = ScreenColumn {
    Row(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        val me = vm.profile
        val shown = me?.displayName?.ifBlank { null } ?: me?.username?.ifBlank { null } ?: me?.email ?: ""
        Avatar(shown.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "W" }, Wk.Orange300, 56)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            WkText(shown, 17, FontWeight.Bold, Wk.Ink100)
            WkText(listOfNotNull(me?.username?.takeIf { it.isNotBlank() }?.let { "@$it" }, me?.exam?.takeIf { it.isNotBlank() }).joinToString(" · "), 12, color = Wk.Ink500)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Pill(vm.hub?.title ?: "Rookie", Wk.Violet); if ((me?.streak ?: 0) > 0) Pill("🔥 ${me?.streak} days", Wk.Orange300) }
        }
    }
    Row(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.4f)).tap { vm.go(Dest.Coins) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        IconChip(Icons.Filled.MonetizationOn, 48)
        Column(Modifier.weight(1f)) { Eyebrow("WYNKOINS", Wk.Orange300); WkText("%,d".format(vm.coins), 26, FontWeight.ExtraBold, Wk.Cream50) }
        WkText("Top up →", 12, FontWeight.SemiBold, Wk.Orange300)
    }
    Row(Modifier.fillMaxWidth().wkCard().tap { vm.go(Dest.Settings) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        IconChip(Icons.Filled.Settings, 40, Wk.Ink400)
        Column(Modifier.weight(1f)) { WkText("Settings", 15, FontWeight.SemiBold, Wk.Ink100); WkText("Notifications, focus, privacy", 11, color = Wk.Ink500) }
        Icon(Icons.Filled.ChevronRight, null, tint = Wk.Ink500)
    }
    WkText("FOCUS · STUDY · TOGETHER", 10, color = Wk.Ink600, letterSpacingEm = 0.3f, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), align = TextAlign.Center)
}

// ───────────────────────── Battleground ─────────────────────────
@Composable
fun BattlegroundScreen(vm: AppViewModel) = ScreenColumn {
    val ri = BattleTiers.indexOfLast { vm.xp >= it.second }
    val next = BattleTiers.getOrNull(ri + 1)
    val title = vm.hub?.title ?: BattleTiers[ri].first
    val stats = vm.hub?.stats ?: com.revm2.app.data.BattleStats()
    var profile by remember { mutableStateOf(false) }
    Column { Eyebrow("BATTLEGROUND"); WkText("1v1 focus duels", 17, FontWeight.Bold, Wk.Ink100) }
    if (profile) {
        Row(Modifier.tap { profile = false }, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.ChevronLeft, null, tint = Wk.Ink300); WkText("Battleground", 13, color = Wk.Ink300) }
        Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { Avatar("JS", Wk.Orange300, 48); Column { WkText("You", 15, FontWeight.Bold, Wk.Ink100); Pill(title, Wk.Violet) } }
            WkText("%,d Battle XP".format(vm.xp), 20, FontWeight.ExtraBold, Wk.Cream50)
            WkText(if (next != null) "%,d XP to ${next.first}".format(next.second - vm.xp) else "Top title reached", 12, color = Wk.Ink400)
        }
        WkText("Battle titles", 14, FontWeight.Bold, Wk.Ink100)
        BattleTiers.forEachIndexed { i, (n, min) ->
            ListRow {
                Box(Modifier.size(22.dp).clip(CircleShape).background(if (i < ri) Color(0xFF4ADE80) else if (i == ri) Wk.Orange500 else Wk.Black600), contentAlignment = Alignment.Center) { if (i < ri) WkText("✓", 11, FontWeight.Bold, Wk.Black950) }
                WkText(n, 13, FontWeight.SemiBold, if (i == ri) Wk.Cream50 else Wk.Ink400, Modifier.weight(1f)); WkText("%,d XP".format(min), 11, color = Wk.Ink500)
            }
        }
        WkText("Win a battle +20-60 XP · Lose a battle +0-20 XP", 11, color = Wk.Ink500)
        WkText("Battle history", 14, FontWeight.Bold, Wk.Ink100)
        if (vm.battleHistory.isEmpty()) WkText("No battles yet.", 12, color = Wk.Ink500)
        vm.battleHistory.forEach { h ->
            val (r, opp, whenText) = Triple(if (h.won) "W" else "L", h.opponent, h.whenText)
            ListRow { Box(Modifier.size(28.dp).clip(CircleShape).background(if (r == "W") Wk.Green else Wk.Red), contentAlignment = Alignment.Center) { WkText(r, 12, FontWeight.Bold, Wk.Black950) }
                Column(Modifier.weight(1f)) { WkText("vs $opp", 13, FontWeight.SemiBold, Wk.Ink100); WkText(whenText, 11, color = Wk.Ink500) } }
        }
        return@ScreenColumn
    }
    when (vm.battle) {
        "waiting" -> Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WkText("VS", 22, FontWeight.ExtraBold, Wk.Orange500); WkText("Waiting for ${vm.hub?.outgoingName ?: "opponent"} to accept", 14, FontWeight.SemiBold, Wk.Ink100)
            WkText("Once they accept, you'll both ready up and the battle begins.", 12, color = Wk.Ink400, align = TextAlign.Center)
            GhostButton("Cancel challenge", { vm.cancelChallenge() })
            WkText("Refresh", 11, color = Wk.Orange300, modifier = Modifier.tap { vm.refreshBattle() })
        }
        "arena" -> Column(Modifier.fillMaxWidth().wkCard().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Avatar("JS", Wk.Orange300, 52); WkText("You", 12, color = Wk.Ink300) }; Column(horizontalAlignment = Alignment.CenterHorizontally) { Avatar("AK", Wk.Pink, 52); WkText("aarav_k", 12, color = Wk.Ink300) } }
            WkText(AppViewModel.fmt(vm.battleSecs), 40, FontWeight.ExtraBold, Wk.Cream50)
            WkText("Hold focus. Don't pause.", 12, color = Wk.Ink400)
            PrimaryButton(if (vm.running) "Pause (forfeits)" else "Start focus", { if (vm.running) { vm.running = false; vm.battle = "home"; vm.flash("You forfeited") } else { vm.startFocus() } }, Modifier.fillMaxWidth())
            WkText("Live duels run on the web app for now.", 11, color = Wk.Ink500)
        }
        else -> {
            Column(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                WkText("⚔️ Battleground", 17, FontWeight.Bold, Wk.Ink100); WkText("Challenge someone. Stay focused. Don't pause.", 12, color = Wk.Ink400)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Pill(title, Wk.Violet); WkText("%,d XP".format(vm.xp), 13, FontWeight.Bold, Wk.Orange300) }
                WkText("Ready for a challenge? Challenge someone and see who can stay focused longer.", 12, color = Wk.Ink500)
                PrimaryButton("⚔️ Challenge someone", { vm.sheet = SheetKind.Challenge }, Modifier.fillMaxWidth())
            }
            vm.hub?.incoming?.forEach { inv ->
                Column(Modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Orange600.copy(alpha = 0.5f), 16.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    WkText("${inv.fromName} challenged you", 14, FontWeight.Bold, Wk.Ink100); if (inv.title.isNotBlank()) WkText(inv.title, 11, color = Wk.Ink500)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { GhostButton("Decline", { vm.respondChallenge(inv.id, false) }, Modifier.weight(1f), height = 42); PrimaryButton("Accept", { vm.respondChallenge(inv.id, true) }, Modifier.weight(1f), height = 42) }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { WkText("Your battle stats", 14, FontWeight.Bold, Wk.Ink100, Modifier.weight(1f)); WkText("View profile", 12, color = Wk.Orange300, modifier = Modifier.tap { profile = true }) }
            listOf(listOf("${stats.total}" to "Battles", "${stats.wins}" to "Won", "${stats.losses}" to "Lost"), listOf("${stats.focusSeconds / 3600}h" to "Focused", "%,d".format(vm.xp) to "XP")).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { row.forEach { (v, l) -> Column(Modifier.weight(1f).wkCard().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) { WkText(v, 17, FontWeight.Bold, Wk.Cream50); WkText(l, 10, color = Wk.Ink500) } }; repeat(4 - row.size) { Spacer(Modifier.weight(1f)) } }
            }
            Column { WkText("🏆 Leaderboard", 14, FontWeight.Bold, Wk.Ink100); WkText("Ranked by Battle XP", 11, color = Wk.Ink500) }
            vm.leaderboard.forEachIndexed { i, b ->
                ListRow {
                    WkText(b.medal ?: "#${i + 1}", 16, modifier = Modifier.width(30.dp), align = TextAlign.Center)
                    Column(Modifier.weight(1f)) { WkText(b.name, 13, FontWeight.SemiBold, Wk.Ink100); WkText("${b.title} · ${"%,d".format(b.xp)} XP", 11, color = Wk.Ink500) }
                    GhostButton("Challenge", { vm.challenge(b.id, b.name) }, height = 34, textColor = Wk.Orange200, border = Wk.Orange600)
                }
            }
        }
    }
}

// ───────────────────────── WYNKOINS ─────────────────────────
@Composable
fun WynkoinsScreen(vm: AppViewModel) {
    Column(Modifier.fillMaxWidth().padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Eyebrow("WYNKOINS"); WkText("Buy coins. Unlock perks.", 15, FontWeight.Bold, Wk.Ink100) }
            Row(Modifier.wkSurface(Color(0x1FF59E0B), Wk.Amber.copy(alpha = 0.4f), 99.dp).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.MonetizationOn, null, tint = Wk.Amber, modifier = Modifier.size(18.dp)); WkText("%,d".format(vm.coins), 14, FontWeight.Bold, Wk.Amber)
            }
        }
        Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0x33FF8A3D), Color.Transparent))).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(64.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Wk.Orange300, Wk.Orange600))), contentAlignment = Alignment.Center) { Icon(Icons.Filled.MonetizationOn, null, tint = Wk.Cream50, modifier = Modifier.size(36.dp)) }
                Column { Eyebrow("WYNKO VIRTUAL CURRENCY", Wk.Orange300); WkText("WYNKOINS", 28, FontWeight.ExtraBold, Wk.Cream50) }
            }
            WkText("Buy WYNKOINS to unlock exclusive perks inside Wynko — remove ads, unlock features, and more coming soon.", 13, color = Wk.Ink400, lineHeight = 1.5f)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) { WkText("YOUR BALANCE", 10, color = Wk.Ink500); WkText("%,d".format(vm.coins), 32, FontWeight.ExtraBold, Wk.Orange300); WkText("WYNKOINS", 11, color = Wk.Orange300) }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow("BUY WYNKOINS", Wk.Orange300)
            vm.coinPacks.forEach { p ->
                Column(Modifier.fillMaxWidth().wkCard(borderColor = if (p.popular) Wk.Orange500 else Wk.Hairline).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconChip(Icons.Filled.MonetizationOn, 52)
                        Column(Modifier.weight(1f)) { WkText("${p.coins}", 26, FontWeight.ExtraBold, Wk.Cream50); WkText("WYNKOINS · ${"%.1f".format(p.price * 100f / p.coins)}p/coin", 11, color = Wk.Ink500) }
                        if (p.popular) Pill("MOST POPULAR", Wk.Orange500, size = 9)
                    }
                    WkText("₹${p.price}", 22, FontWeight.ExtraBold, Wk.Orange500)
                    WkText("one-time purchase · UPI, cards, net banking via Razorpay", 11, color = Wk.Ink500)
                    PrimaryButton("Buy ${p.coins} WYNKOINS for ₹${p.price}", { vm.flash("Razorpay checkout arrives with the payments wiring") }, Modifier.fillMaxWidth())
                }
            }
            Eyebrow("SPEND WYNKOINS", Wk.Orange300)
            SHOP.forEach { s ->
                ListRow {
                    WkText(s.first, 22)
                    Column(Modifier.weight(1f)) { WkText(s.second, 14, FontWeight.SemiBold, Wk.Ink100); WkText(s.third, 11, color = Wk.Ink500) }
                    GhostButton("${s.fourth} coins", { vm.flash("Redeeming arrives with the payments wiring") }, height = 36, textColor = Wk.Orange200, border = Wk.Orange600)
                }
            }
            Eyebrow("EARN FREE WYNKOINS", Wk.Orange300)
            ListRow(onClick = { vm.go(Dest.Earn) }) { WkText("🎁", 20); Column(Modifier.weight(1f)) { WkText("Invite a friend", 13, FontWeight.SemiBold, Wk.Ink100); WkText("+50 coins after their 3-day streak", 11, color = Wk.Ink500) } }
            ListRow { WkText("🔥", 20); Column(Modifier.weight(1f)) { WkText("Daily study streak", 13, FontWeight.SemiBold, Wk.Ink100); WkText("Coming soon", 11, color = Wk.Ink500) } }
        }
    }
}

private data class ShopItem(val first: String, val second: String, val third: String, val fourth: Int)
private val SHOP = listOf(ShopItem("🚫", "Ad-free", "30 days", 199), ShopItem("🧊", "Streak Freeze", "Protects one missed day", 150), ShopItem("✦", "Room Theme", "Custom colours for your room", 300))

// ───────────────────────── Quick Timer ─────────────────────────
@Composable
fun QuickTimerScreen(vm: AppViewModel) {
    Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(Modifier.fillMaxWidth().tap { vm.back() }, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.ChevronLeft, null, tint = Wk.Ink300); WkText("Home", 13, color = Wk.Ink300) }
        Eyebrow("QUICK TIMER")
        TimerRing(AppViewModel.fmt(vm.qtRemaining), if (vm.qtRunning) "Counting down" else "Ready", 260, 52, if (vm.qtTotal > 0) 1f - vm.qtRemaining.toFloat() / vm.qtTotal else 0f)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(5, 10, 25, 45, 60).forEach { m -> Pill("$m", if (vm.qtTotal == m * 60) Wk.Orange500 else Wk.Ink400, Modifier.tap { vm.qtSet(m) }, 12) } }
        PrimaryButton(if (vm.qtRunning) "Pause" else "Start", { vm.qtToggle() }, icon = if (vm.qtRunning) Icons.Filled.Pause else Icons.Filled.PlayArrow, color = if (vm.qtRunning) Wk.Black600 else Wk.Orange500, textColor = if (vm.qtRunning) Wk.Ink250 else Wk.Black950)
    }
}
