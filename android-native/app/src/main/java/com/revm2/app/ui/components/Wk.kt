package com.revm2.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.revm2.app.ui.theme.Jakarta
import com.revm2.app.ui.theme.Wk

/** Text sized in design px (1px = 1sp), Plus Jakarta Sans. */
@Composable
fun WkText(
    text: String, size: Int = 14, weight: FontWeight = FontWeight.Normal, color: Color = Wk.Ink300,
    modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, align: TextAlign? = null,
    letterSpacingEm: Float = 0f, lineHeight: Float = 0f,
) = Text(
    text, modifier = modifier, color = color, fontSize = size.sp, fontWeight = weight, fontFamily = Jakarta,
    maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align,
    letterSpacing = (letterSpacingEm * size).sp,
    lineHeight = if (lineHeight > 0f) (lineHeight * size).sp else androidx.compose.ui.unit.TextUnit.Unspecified,
)

/** Small uppercase eyebrow label ("WYNKO", "COMMUNITIES"). */
@Composable
fun Eyebrow(text: String, color: Color = Wk.Ink500, modifier: Modifier = Modifier) =
    WkText(text, 10, FontWeight.Normal, color, modifier, letterSpacingEm = 0.18f)

private val CardBrush = Brush.linearGradient(listOf(Wk.Black800, Wk.Black850))

/** The design's standard card: 160deg #161618→#101012, hairline border, 16 radius. */
fun Modifier.wkCard(radius: Dp = 16.dp, borderColor: Color = Wk.Hairline): Modifier =
    this.clip(RoundedCornerShape(radius)).background(CardBrush).border(BorderStroke(1.dp, borderColor), RoundedCornerShape(radius))

fun Modifier.wkSurface(color: Color = Wk.Black800, border: Color = Wk.Black600, radius: Dp = 12.dp): Modifier =
    this.clip(RoundedCornerShape(radius)).background(color).border(BorderStroke(1.dp, border), RoundedCornerShape(radius))

fun Modifier.tap(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)

@Composable
fun IconChip(icon: ImageVector, size: Int = 32, tint: Color = Wk.Orange300, round: Boolean = false) {
    Box(
        Modifier.size(size.dp)
            .clip(if (round) CircleShape else RoundedCornerShape(12.dp))
            .background(Wk.OrangeTint)
            .border(BorderStroke(1.dp, Wk.OrangeTintBorder), if (round) CircleShape else RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size((size / 2).dp)) }
}

/** Card heading: icon chip + title (+ optional subtitle) + trailing slot. */
@Composable
fun CardHeader(icon: ImageVector, title: String, sub: String? = null, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        IconChip(icon)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            WkText(title, 16, FontWeight.Bold, Wk.Ink100)
            if (sub != null) WkText(sub, 11, color = Wk.Ink500)
        }
        trailing()
    }
}

@Composable
fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null,
    height: Int = 46, enabled: Boolean = true, color: Color = Wk.Orange500, textColor: Color = Wk.Black950,
) {
    Row(
        modifier.height(height.dp).clip(RoundedCornerShape(16.dp))
            .background(if (enabled) color else color.copy(alpha = 0.35f))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { Icon(icon, null, tint = textColor, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp)) }
        WkText(text, 14, FontWeight.SemiBold, textColor)
    }
}

@Composable
fun GhostButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null,
    height: Int = 44, textColor: Color = Wk.Ink300, border: Color = Wk.Black500,
) {
    Row(
        modifier.height(height.dp).clip(RoundedCornerShape(12.dp))
            .border(BorderStroke(1.dp, border), RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { Icon(icon, null, tint = textColor, modifier = Modifier.size(15.dp)); Spacer(Modifier.width(6.dp)) }
        WkText(text, 12, FontWeight.SemiBold, textColor)
    }
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier, size: Int = 10) {
    Box(
        modifier.clip(RoundedCornerShape(99.dp)).background(color.copy(alpha = 0.10f))
            .border(BorderStroke(1.dp, color.copy(alpha = 0.35f)), RoundedCornerShape(99.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) { WkText(text, size, FontWeight.SemiBold, color) }
}

@Composable
fun Avatar(initials: String, color: Color, size: Int = 32) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
        WkText(initials, (size * 0.34f).toInt().coerceAtLeast(9), FontWeight.Bold, Wk.Black950)
    }
}

@Composable
fun AvatarStack(people: List<Pair<String, Color>>, size: Int = 24) {
    val step = size * 2 / 3
    Box(Modifier.width((step * (people.size - 1) + size + 2).dp).height((size + 2).dp)) {
        people.forEachIndexed { i, (init, c) ->
            Box(Modifier.offset(x = (i * step).dp).size((size + 2).dp).clip(CircleShape).background(Color(0xFF141416)), contentAlignment = Alignment.Center) {
                Avatar(init, c, size)
            }
        }
    }
}

@Composable
fun StatDot(color: Color = Wk.Green, size: Int = 6) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(color))
}

/** Rounded chip row used for tabs/filters. */
@Composable
fun SegmentTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().wkSurface(Wk.Black800, Wk.Black600, 16.dp).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        labels.forEachIndexed { i, l ->
            val on = i == selected
            Box(
                Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp))
                    .background(if (on) Brush.linearGradient(listOf(Wk.Orange500, Wk.Orange600)) else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent)))
                    .clickable { onSelect(i) },
                contentAlignment = Alignment.Center,
            ) { WkText(l, 12, FontWeight.SemiBold, if (on) Wk.Cream50 else Wk.Ink400, maxLines = 1) }
        }
    }
}

@Composable
fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
}

@Composable
fun ListRow(
    modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier.fillMaxWidth().wkSurface(Color(0x8C161618), Color(0x9926262A), 12.dp)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), content = content,
    )
}

@Composable
fun RoundIconButton(icon: ImageVector, onClick: () -> Unit, size: Int = 36, bg: Color = Color(0x149C968C), tint: Color = Wk.Ink500) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(bg).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size((size * 0.45f).dp))
    }
}
