package com.revm2.app.ui.sample

import androidx.compose.ui.graphics.Color

/** Fixed UI constants from the Claude Design export (colours, app tiles, settings labels). All user data comes from Supabase. */
fun hex(v: Long) = Color(0xFF000000 or v)

val SubjectColor = mapOf("Physics" to hex(0x3B82F6), "Chemistry" to hex(0x8B5CF6), "Mathematics" to hex(0x10B981), "Biology" to hex(0x34D399))
val SubjectEmoji = mapOf("Physics" to "📘", "Chemistry" to "🧪", "Mathematics" to "📐", "Biology" to "📗")
val BattleTiers = listOf("Rookie" to 0, "Challenger" to 100, "Focused" to 300, "Warrior" to 700, "Elite" to 1500, "Unstoppable" to 3000)

data class PrefRow(val key: String, val label: String)
val PrefGroups = listOf(
    "NOTIFICATIONS" to listOf(PrefRow("notif_focus_alerts", "Focus alerts"), PrefRow("notif_streak", "Streak reminders"), PrefRow("notif_battle", "Battle invites"), PrefRow("notif_rooms", "Room activity"), PrefRow("notif_achievements", "Achievements")),
    "FOCUS" to listOf(PrefRow("focus_block_distractions", "Block distracting apps"), PrefRow("focus_auto_start_breaks", "Auto-start breaks"), PrefRow("focus_ambient_sound", "Ambient sound"), PrefRow("sound_effects", "Sound effects"), PrefRow("focus_strict_lock", "Strict mode: also lock Settings during focus")),
    "PRIVACY" to listOf(PrefRow("privacy_public_profile", "Public profile"), PrefRow("privacy_show_streak", "Show my streak"), PrefRow("privacy_show_stats", "Show my stats"), PrefRow("privacy_allow_room_invites", "Allow room invites")),
)

/** App name, tile letter, tile colour, letter colour. */
data class AppTile(val name: String, val label: String, val bg: Color, val fg: Color)
val AllApps = listOf(
    AppTile("Instagram", "IG", hex(0xDD2A7B), hex(0xFFF7E6)), AppTile("YouTube", "▶", hex(0xFF0000), hex(0xFFF7E6)),
    AppTile("Snapchat", "👻", hex(0xFFFC00), hex(0x000000)), AppTile("BGMI", "B", hex(0xF59E0B), hex(0x000000)),
    AppTile("Netflix", "N", hex(0xE50914), hex(0xFFF7E6)), AppTile("X", "𝕏", hex(0x000000), hex(0xFFF7E6)),
    AppTile("WhatsApp", "W", hex(0x25D366), hex(0xFFF7E6)), AppTile("Reddit", "r/", hex(0xFF4500), hex(0xFFF7E6)),
    AppTile("Discord", "D", hex(0x5865F2), hex(0xFFF7E6)), AppTile("Spotify", "S", hex(0x1DB954), hex(0x000000)),
    AppTile("Telegram", "T", hex(0x229ED9), hex(0xFFF7E6)), AppTile("Facebook", "f", hex(0x1877F2), hex(0xFFF7E6)),
)

val SubjectsForAdd = listOf("Physics", "Chemistry", "Mathematics", "Biology")

