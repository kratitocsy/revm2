package com.revm2.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.revm2.app.R

/** Wynko mobile design tokens (from the Claude Design export; same palette as src/styles/colors.css). */
object Wk {
    val Black950 = Color(0xFF0B0B0D) // app canvas
    val Black900 = Color(0xFF0F0F11)
    val Black850 = Color(0xFF101012)
    val Black800 = Color(0xFF161618) // cards, inputs
    val Black700 = Color(0xFF1C1C1F)
    val Black600 = Color(0xFF26262A) // borders, tracks
    val Black500 = Color(0xFF3A3A3A) // strong borders
    val Orange600 = Color(0xFFE9772E)
    val Orange500 = Color(0xFFFF8A3D) // the one primary action
    val Orange400 = Color(0xFFFFB057)
    val Orange300 = Color(0xFFFFA94D)
    val Orange200 = Color(0xFFFFC08A)
    val Cream50 = Color(0xFFFFF7E6)
    val Ink100 = Color(0xFFF5EFE3)
    val Ink200 = Color(0xFFE8E2D6)
    val Ink250 = Color(0xFFD6D0C4)
    val Ink300 = Color(0xFFCFC8BB)
    val Ink400 = Color(0xFF9C968C)
    val Ink500 = Color(0xFF7A756D)
    val Ink600 = Color(0xFF5A5650)
    val Green = Color(0xFF34D399)
    val Red = Color(0xFFF87171)
    val Amber = Color(0xFFFBBF24)
    val Blue = Color(0xFF3B82F6)
    val Violet = Color(0xFF8B5CF6)
    val Pink = Color(0xFFEC4899)

    val Hairline = Color(0x14FFF7E6)          // rgba(255,247,230,0.08)
    val OrangeTint = Color(0x1AFF8A3D)        // 0.10
    val OrangeTintBorder = Color(0x2EFF8A3D)  // 0.18
}

val Jakarta = FontFamily(
    Font(R.font.plus_jakarta_sans_regular, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans_medium, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans_semibold, FontWeight.SemiBold),
    Font(R.font.plus_jakarta_sans_bold, FontWeight.Bold),
    Font(R.font.plus_jakarta_sans_extrabold, FontWeight.ExtraBold),
)

private val Scheme = darkColorScheme(
    primary = Wk.Orange500,
    onPrimary = Wk.Black950,
    secondary = Wk.Orange300,
    background = Wk.Black950,
    onBackground = Wk.Ink100,
    surface = Wk.Black800,
    onSurface = Wk.Ink100,
    surfaceVariant = Wk.Black700,
    onSurfaceVariant = Wk.Ink400,
    outline = Wk.Black600,
    error = Wk.Red,
)

private fun Typography.withFont(f: FontFamily) = copy(
    displayLarge = displayLarge.copy(fontFamily = f), displayMedium = displayMedium.copy(fontFamily = f),
    displaySmall = displaySmall.copy(fontFamily = f), headlineLarge = headlineLarge.copy(fontFamily = f),
    headlineMedium = headlineMedium.copy(fontFamily = f), headlineSmall = headlineSmall.copy(fontFamily = f),
    titleLarge = titleLarge.copy(fontFamily = f), titleMedium = titleMedium.copy(fontFamily = f),
    titleSmall = titleSmall.copy(fontFamily = f), bodyLarge = bodyLarge.copy(fontFamily = f),
    bodyMedium = bodyMedium.copy(fontFamily = f), bodySmall = bodySmall.copy(fontFamily = f),
    labelLarge = labelLarge.copy(fontFamily = f), labelMedium = labelMedium.copy(fontFamily = f),
    labelSmall = labelSmall.copy(fontFamily = f),
)

@Composable
fun WynkoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, typography = Typography().withFont(Jakarta), content = content)
}
