package com.wynko.app.ui.screens

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
import com.wynko.app.ui.components.*
import com.wynko.app.ui.sample.*
import com.wynko.app.ui.shell.*
import com.wynko.app.ui.theme.Wk

// ───────────────────────── Profile ("More") ─────────────────────────
@Composable
fun MoreScreen(vm: AppViewModel) = ScreenColumn {
    Row(Modifier.fillMaxWidth().wkCard().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        val p = vm.profile
        val name = p?.let { it.displayName.ifBlank { it.username }.ifBlank { it.email.substringBefore('@') } }?.ifBlank { null } ?: "Your profile"
        Avatar(name.filter { it.isLetterOrDigit() }.take(2).uppercase().ifEmpty { "W" }, AvatarColors[p?.avatarPreset ?: 0], 56)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            WkText(name, 17, FontWeight.Bold, Wk.Ink100, maxLines = 1)
            WkText(listOfNotNull(p?.username?.takeIf { it.isNotBlank() }?.let { "@$it" }, p?.exam?.takeIf { it.isNotBlank() }).joinToString(" · ").ifEmpty { p?.email ?: "" }, 12, color = Wk.Ink500, maxLines = 1)
            vm.bg?.let { Pill("${it.me.title} · ${"%,d".format(it.me.xp)} XP", Wk.Violet) }
        }
    }
    if (com.wynko.app.BuildConfig.PAYMENTS_ENABLED) Row(Modifier.fillMaxWidth().wkCard(borderColor = Wk.Orange600.copy(alpha = 0.4f)).tap { vm.go(Dest.Coins) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
            CoinPacks.forEach { p ->
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
                    GhostButton("${s.fourth} coins", { if (vm.coins >= s.fourth) { vm.coins -= s.fourth; vm.flash("${s.second} redeemed") } else vm.flash("Not enough WYNKOINS") }, height = 36, textColor = Wk.Orange200, border = Wk.Orange600)
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
