package com.revm2.app.schedule

import java.time.LocalDate

/*
 * Kotlin port of the desktop app's schedule windows
 * (src/apps/desktop-dashboard/lib/scheduleWindow.ts), so the phone follows exactly the same rules:
 *
 *  - On a day one of the member's active Focus Lock schedules runs, the focus timer can only be started inside
 *    one of that schedule's blocks. On a day no schedule runs (or with no schedule) nothing is restricted.
 *  - Times are India time, the clock `schedule-tick` runs schedules on.
 *  - Blocks that cross midnight are cut at 24:00 and their tail counts on the next day.
 *  - A schedule can run only on alternating weeks (week parity 0 or 1).
 *  - Pausing inside a block: 2 free pauses per schedule per day (20 minutes each), then the reflection gate.
 */

const val FREE_PAUSES_PER_SCHEDULE = 2
const val FREE_PAUSE_MINUTES = 20
const val PAUSE_REFLECTION_MIN_CHARS = 150

private const val IST_OFFSET_MS = (5 * 60 + 30) * 60_000L
private const val DAY_MS = 86_400_000L
private val WEEK_PARITY_EPOCH_DAYS = LocalDate.of(2026, 8, 2).toEpochDay() // Sunday of "week 0", same as wynkyPlanner.ts

data class WindowSlot(val start: String, val end: String, val subject: String?, val id: String? = null, val isSleep: Boolean = false)

data class WindowSchedule(
    val id: String,
    val name: String,
    /** 0 (Sun) to 6 (Sat) */
    val days: List<Int>,
    /** 0/1: only in weeks of that parity; null: every week */
    val parity: Int?,
    val slots: List<WindowSlot>,
)

data class WindowMatch(val schedule: WindowSchedule, val slot: WindowSlot, val endsInMin: Int)
data class NextWindow(val schedule: WindowSchedule, val slot: WindowSlot, val startsInMin: Int, val dayOffset: Int)
data class WindowGate(
    /** A schedule runs today, so starting the timer is limited to its blocks. */
    val restricted: Boolean,
    val inside: WindowMatch?,
    val next: NextWindow?,
)

private data class Span(val slot: WindowSlot, val from: Int, val to: Int)

fun toMin(t: String): Int {
    val p = t.split(":")
    return (p.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (p.getOrNull(1)?.toIntOrNull() ?: 0)
}

private fun istDays(nowMs: Long) = Math.floorDiv(nowMs + IST_OFFSET_MS, DAY_MS)

/** India-time weekday (0 = Sunday) and minute of day. */
fun istDayAndMinute(nowMs: Long): Pair<Int, Int> {
    val ist = nowMs + IST_OFFSET_MS
    val days = Math.floorDiv(ist, DAY_MS)
    val day = Math.floorMod(days + 4, 7L).toInt() // 1970-01-01 was a Thursday
    val min = (Math.floorMod(ist, DAY_MS) / 60_000L).toInt()
    return day to min
}

/** The India-time calendar date, e.g. "2026-10-01". */
fun istDateKey(nowMs: Long): String = LocalDate.ofEpochDay(istDays(nowMs)).toString()

/** 0 or 1, alternating every India-time week (Sunday-based). */
fun istWeekParity(nowMs: Long): Int {
    val days = istDays(nowMs)
    val sunday = days - Math.floorMod(days + 4, 7L)
    val weeks = Math.floorDiv(sunday - WEEK_PARITY_EPOCH_DAYS, 7L)
    return Math.floorMod(weeks, 2L).toInt()
}

private fun runsOn(s: WindowSchedule, day: Int, nowMs: Long, dayOffset: Int): Boolean {
    if (day !in s.days) return false
    if (s.parity == null) return true
    return istWeekParity(nowMs + dayOffset * DAY_MS) == s.parity
}

/** The day's [start, end) minute spans of a schedule's blocks, midnight-crossing blocks cut at 24:00. */
private fun spansForDay(s: WindowSchedule, day: Int, nowMs: Long, dayOffset: Int): List<Span> {
    val out = mutableListOf<Span>()
    if (runsOn(s, day, nowMs, dayOffset)) {
        for (slot in s.slots) {
            val a = toMin(slot.start); val b = toMin(slot.end)
            out.add(Span(slot, a, if (b > a) b else 1440))
        }
    }
    // The tail of last night's midnight-crossing blocks.
    val prev = (day + 6) % 7
    if (runsOn(s, prev, nowMs, dayOffset - 1)) {
        for (slot in s.slots) {
            val a = toMin(slot.start); val b = toMin(slot.end)
            if (b <= a && b > 0) out.add(Span(slot, 0, b))
        }
    }
    return out
}

/** A block on a given weekday: [from, to) in minutes of that day (midnight-crossing blocks cut at 24:00). */
data class DayBlock(val schedule: WindowSchedule, val slot: WindowSlot, val from: Int, val to: Int)

/** All blocks that fall on India-time weekday [day], [dayOffset] days from today, earliest first. */
fun blocksOn(schedules: List<WindowSchedule>, day: Int, nowMs: Long, dayOffset: Int): List<DayBlock> =
    schedules.flatMap { s -> spansForDay(s, day, nowMs, dayOffset).map { DayBlock(s, it.slot, it.from, it.to) } }.sortedBy { it.from }

fun computeGate(schedules: List<WindowSchedule>, nowMs: Long = System.currentTimeMillis()): WindowGate {
    val (day, min) = istDayAndMinute(nowMs)
    var restricted = false
    var inside: WindowMatch? = null
    for (s in schedules) {
        val today = spansForDay(s, day, nowMs, 0)
        if (today.isNotEmpty()) restricted = true
        for (sp in today) {
            if (min >= sp.from && min < sp.to && (inside == null || sp.to - min < inside.endsInMin)) {
                inside = WindowMatch(s, sp.slot, sp.to - min)
            }
        }
    }
    var next: NextWindow? = null
    if (inside == null) {
        var off = 0
        while (off <= 14 && next == null) {
            val d = (day + off) % 7
            for (s in schedules) {
                for (sp in spansForDay(s, d, nowMs, off)) {
                    val startsIn = off * 1440 + sp.from - min
                    if (startsIn > 0 && (next == null || startsIn < next.startsInMin)) next = NextWindow(s, sp.slot, startsIn, off)
                }
            }
            off++
        }
    }
    return WindowGate(restricted, inside, next)
}

/** "4:00 PM" from "16:00". */
fun clockLabel(hhmm: String): String {
    val m = toMin(hhmm)
    val h = m / 60; val mm = m % 60
    return "${(h + 11) % 12 + 1}:${mm.toString().padStart(2, '0')} ${if (h < 12) "AM" else "PM"}"
}

/** The one-line reason shown when the timer can't be started right now. */
fun blockedMessage(gate: WindowGate): String {
    val n = gate.next ?: return "Your schedule is on, so the timer starts only inside its blocks."
    val what = if (n.slot.subject != null) "${n.slot.subject} at ${clockLabel(n.slot.start)}" else clockLabel(n.slot.start)
    val whenText = when (n.dayOffset) { 0 -> "today"; 1 -> "tomorrow"; else -> "later this week" }
    return "Your schedule is on, so the timer starts only inside its blocks. Next block: $what $whenText."
}

/** Characters typed, not counting spaces, tabs or line breaks (so holding the space bar gets you nowhere). */
fun countReflectionChars(text: String): Int = text.filterNot { it.isWhitespace() }.codePointCount(0, text.filterNot { it.isWhitespace() }.length)

fun isPauseUnlocked(text: String): Boolean = countReflectionChars(text) >= PAUSE_REFLECTION_MIN_CHARS
