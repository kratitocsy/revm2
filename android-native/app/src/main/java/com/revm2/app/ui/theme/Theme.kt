package com.revm2.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Wynko brand tokens, mirrored from src/styles/colors.css. Orange is for the one primary action only. */
object Wk {
    val Black950 = Color(0xFF0B0B0D) // app canvas
    val Black800 = Color(0xFF161618) // cards, inputs
    val Black700 = Color(0xFF1C1C1F) // raised / active nav
    val Black600 = Color(0xFF26262A) // borders, tracks
    val Black500 = Color(0xFF3A3A3A)
    val Orange500 = Color(0xFFFF8A3D)
    val Orange300 = Color(0xFFFFA94D)
    val Cream50 = Color(0xFFFFF7E6)
    val Ink100 = Color(0xFFF5EFE3)
    val Ink400 = Color(0xFF9C968C)
    val Ink600 = Color(0xFF5A5650)
    val Green400 = Color(0xFF7FBF8E)
    val Red400 = Color(0xFFE07A6B)
}

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
    error = Wk.Red400,
)

@Composable
fun WynkoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
