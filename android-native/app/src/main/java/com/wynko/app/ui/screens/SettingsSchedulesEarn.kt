package com.wynko.app.ui.screens

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
import com.wynko.app.ui.components.*
import com.wynko.app.ui.sample.*
import com.wynko.app.ui.shell.*
import com.wynko.app.ui.theme.Wk

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
