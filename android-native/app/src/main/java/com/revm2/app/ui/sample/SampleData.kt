package com.revm2.app.ui.sample

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Prototype sample data from the Claude Design export. Replaced by Supabase data screen by screen. */
fun hex(v: Long) = Color(0xFF000000 or v)

val SubjectColor = mapOf("Physics" to hex(0x3B82F6), "Chemistry" to hex(0x8B5CF6), "Mathematics" to hex(0x10B981), "Biology" to hex(0x34D399))
val SubjectEmoji = mapOf("Physics" to "📘", "Chemistry" to "🧪", "Mathematics" to "📐", "Biology" to "📗")
val WeekMinutes = listOf(95, 140, 60, 185, 150, 210, 125) // Wed..Tue
val WeekLabels = listOf("Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue")

data class Room(
    val id: Int, val name: String, val classes: String, val subject: String, val desc: String, val members: Int,
    val live: Int, val iconA: Color, val iconB: Color, val iconLabel: String, val hot: Boolean = false,
    val isPublic: Boolean = true, val password: String? = null, val people: List<Pair<String, Color>> = emptyList(),
)

val Rooms = listOf(
    Room(1, "Physics Warriors", "Class 11 · 12", "Physics", "Concepts, PYQs, doubts — all in one place.", 48, 4, hex(0x1E40AF), hex(0x3B82F6), "📘", true, true, null,
        listOf("RS" to hex(0xFF8A3D), "PK" to hex(0xFFA94D), "AM" to hex(0xEC4899), "DJ" to hex(0xF59E0B))),
    Room(2, "Chemistry Crew", "Class 11 · 12", "Chemistry", "Study. Discuss. Score.", 32, 3, hex(0xFF8A3D), hex(0xA855F7), "🧪", true, true, null,
        listOf("SK" to hex(0xFF8A3D), "DL" to hex(0xE9772E), "MK" to hex(0xEC4899), "RV" to hex(0xF87171))),
    Room(3, "Maths Mavericks", "Class 10 · 11 · 12", "Mathematics", "Tricks, practice, progress.", 67, 5, hex(0xC9622A), hex(0xFFA94D), "√x", true, true, null,
        listOf("AK" to hex(0x10B981), "KV" to hex(0x3B82F6), "PN" to hex(0xF59E0B), "SR" to hex(0xF97316))),
    Room(4, "Biology Buddies", "Class 11 · 12", "Biology", "Learn, revise, ace.", 41, 2, hex(0x059669), hex(0x34D399), "📗", false, false, "bio123",
        listOf("VM" to hex(0x059669), "PR" to hex(0xFF8A3D), "SC" to hex(0xF59E0B), "AT" to hex(0xEC4899))),
    Room(5, "JEE 2026", "JEE Aspirants", "All Subjects", "Discipline. Consistency. Results.", 89, 6, hex(0xBE185D), hex(0xF43F5E), "🎯", true, false, "jee2026",
        listOf("RK" to hex(0xDC2626), "AS" to hex(0xFF8A3D), "PG" to hex(0xE9772E), "NM" to hex(0xF59E0B))),
    Room(6, "Night Owls", "All Classes", "All Subjects", "Late night study sessions. No distractions.", 27, 3, hex(0x1E3A8A), hex(0x3B82F6), "💻", false, true, null,
        listOf("LD" to hex(0x1D4ED8), "VR" to hex(0xFF8A3D), "AM" to hex(0xFFA94D), "TR" to hex(0xE9772E))),
)

data class OtherCommunity(val id: String, val name: String, val emoji: String, val members: Int, val live: Int, val role: String)
val OtherCommunities = listOf(
    OtherCommunity("c2", "Physics Galaxy", "⚡", 540, 37, "Member"),
    OtherCommunity("c3", "Organic Chem Club", "🧪", 212, 11, "Owner"),
)
data class DiscoverCommunity(val id: String, val name: String, val emoji: String, val members: Int, val head: String, val approval: Boolean)
val Discover = listOf(
    DiscoverCommunity("d1", "Maths Olympiad Circle", "📐", 318, "Rahul M.", false),
    DiscoverCommunity("d2", "JEE Advanced 2026", "🎯", 860, "Meena I.", true),
)

data class Announcement(val title: String, val message: String, val pinned: Boolean, val important: Boolean, val whenText: String)
val Announcements = listOf(
    Announcement("Mock Test Sunday 9 AM", "Full syllabus, JEE Main pattern. Join Silent Library 15 min early.", true, true, "Today"),
    Announcement("Week 39 schedule is live", "Accept it to sync the blocks with your Focus Lock.", false, false, "Yesterday"),
    Announcement("7-day streak challenge", "Top 10 streaks this week get 200 WYNKOINS.", false, false, "20 Sep"),
)

data class SchedRow(val time: String, val what: String, val dur: String, val color: Color)
val CommunitySchedule = listOf(
    SchedRow("6:00 PM", "Physics · Electrostatics", "90m", hex(0x3B82F6)),
    SchedRow("7:30 PM", "Break", "15m", hex(0x5A5650)),
    SchedRow("7:45 PM", "Maths · Integration PYQs", "60m", hex(0x10B981)),
    SchedRow("9:00 PM", "Chemistry · Revision", "45m", hex(0x8B5CF6)),
)

data class Member(val init: String, val color: Color, val name: String, val status: String, val time: String, val state: String)
val RoomMembers = listOf(
    Member("RS", hex(0xFF8A3D), "Rohan S.", "Physics · Electrostatics", "1:12:40", "focus"),
    Member("PK", hex(0xFFA94D), "Priya K.", "Physics · Mechanics", "48:05", "focus"),
    Member("AM", hex(0xEC4899), "Aman M.", "On break", "05:12", "break"),
    Member("DJ", hex(0xF59E0B), "Divya J.", "Physics · Optics", "22:31", "focus"),
    Member("KV", hex(0x3B82F6), "Karan V.", "PYQs · 2023 Shift 1", "35:50", "focus"),
    Member("JS", hex(0xFFA94D), "You", "Joined just now", "00:00", "idle"),
)

data class Battler(val name: String, val title: String, val xp: String, val medal: String?)
val Battlers = listOf(
    Battler("aarav_k", "Focus Titan", "4,820", "🥇"),
    Battler("meera.s", "Deep Worker", "4,310", "🥈"),
    Battler("rohan_21", "Grinder", "3,905", "🥉"),
    Battler("ishaan.p", "Rising Scholar", "3,120", null),
    Battler("tanya_g", "Rising Scholar", "2,980", null),
)
val BattleTiers = listOf("Rookie" to 0, "Challenger" to 100, "Focused" to 300, "Warrior" to 700, "Elite" to 1500, "Unstoppable" to 3000)

data class CoinPack(val id: String, val name: String, val coins: Int, val price: Int, val popular: Boolean = false)
val CoinPacks = listOf(CoinPack("a", "Starter", 200, 19), CoinPack("b", "Scholar", 500, 49, true), CoinPack("c", "Topper", 1000, 99))

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

data class Routine(val id: String, val name: String, val enabled: Boolean, val whenText: String, val blocks: String)
val Routines = listOf(
    Routine("r1", "Night Study", true, "Mon–Fri · 6:00 PM – 10:00 PM", "Instagram, YouTube, BGMI"),
    Routine("r2", "Weekend Mock", false, "Sat · 9:00 AM – 12:00 PM", "Instagram, Snapchat, Netflix, X"),
)

data class Notif(val title: String, val body: String, val whenText: String)
val Notifications = listOf(
    Notif("aarav_k challenged you", "Focus battle · expires in 4 min", "now"),
    Notif("Week 39 schedule is live", "JEE Night Grind published a schedule", "1h"),
    Notif("6-day streak 🔥", "Study today to keep it going", "3h"),
)

val BattleHistory = listOf(
    Triple("W", "meera.s", "Yesterday · 42m focused"), Triple("L", "rohan_21", "Mon · 25m focused"),
    Triple("W", "tanya_g", "Sun · 50m focused"), Triple("W", "aarav_k", "Sat · 35m focused"),
)
val SubjectsForAdd = listOf("Physics", "Chemistry", "Mathematics", "Biology")

val GradientBrush = { a: Color, b: Color -> Brush.linearGradient(listOf(a, b)) }
