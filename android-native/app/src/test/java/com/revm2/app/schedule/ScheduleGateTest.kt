package com.revm2.app.schedule

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneOffset

class ScheduleGateTest {
    private val ist = ZoneOffset.ofHoursMinutes(5, 30)
    /** Epoch millis for an India-time wall clock. 2026-10-05 is a Monday. */
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int) = LocalDateTime.of(y, mo, d, h, mi).toInstant(ist).toEpochMilli()

    private val mon = at(2026, 10, 5, 0, 0)
    private fun sched(days: List<Int>, vararg slots: WindowSlot, parity: Int? = null) = WindowSchedule("s1", "Study", days, parity, slots.toList())

    @Test fun istPartsAreCorrect() {
        val (day, min) = istDayAndMinute(at(2026, 10, 5, 18, 30))
        assertEquals(1, day); assertEquals(18 * 60 + 30, min)
        assertEquals("2026-10-05", istDateKey(at(2026, 10, 5, 23, 59)))
    }

    @Test fun noScheduleMeansNoRestriction() {
        val g = computeGate(emptyList(), at(2026, 10, 5, 12, 0))
        assertFalse(g.restricted); assertNull(g.inside); assertNull(g.next)
    }

    @Test fun insideABlockOnAScheduledDay() {
        val s = sched(listOf(1), WindowSlot("18:00", "20:00", "Physics"))
        val g = computeGate(listOf(s), at(2026, 10, 5, 19, 30))
        assertTrue(g.restricted); assertNotNull(g.inside); assertEquals(30, g.inside!!.endsInMin)
    }

    @Test fun outsideABlockIsRestrictedAndPointsAtTheNextOne() {
        val s = sched(listOf(1), WindowSlot("18:00", "20:00", "Physics"))
        val g = computeGate(listOf(s), at(2026, 10, 5, 12, 0))
        assertTrue(g.restricted); assertNull(g.inside)
        assertEquals(360, g.next!!.startsInMin); assertEquals(0, g.next!!.dayOffset)
        assertEquals("Your schedule is on, so the timer starts only inside its blocks. Next block: Physics at 6:00 PM today.", blockedMessage(g))
    }

    @Test fun aDayWithNoScheduleIsNotRestrictedButHasANextBlock() {
        val s = sched(listOf(3), WindowSlot("09:00", "10:00", null)) // Wednesday only
        val g = computeGate(listOf(s), at(2026, 10, 5, 12, 0)) // Monday
        assertFalse(g.restricted); assertEquals(2, g.next!!.dayOffset)
    }

    @Test fun midnightCrossingBlockCountsAfterMidnight() {
        val s = sched(listOf(1), WindowSlot("22:00", "02:00", "Sleep-ish")) // Monday night into Tuesday
        assertNotNull(computeGate(listOf(s), at(2026, 10, 5, 23, 0)).inside)
        val tue = computeGate(listOf(s), at(2026, 10, 6, 1, 0))
        assertNotNull(tue.inside); assertEquals(60, tue.inside!!.endsInMin)
        assertNull(computeGate(listOf(s), at(2026, 10, 6, 3, 0)).inside)
    }

    @Test fun weekParityAlternates() {
        val a = istWeekParity(at(2026, 10, 5, 12, 0))
        val b = istWeekParity(at(2026, 10, 12, 12, 0))
        assertEquals(1, a xor b)
        assertEquals(a, istWeekParity(at(2026, 10, 6, 12, 0))) // same Sunday-based week
        val s = sched(listOf(1), WindowSlot("09:00", "10:00", null), parity = a)
        assertTrue(computeGate(listOf(s), at(2026, 10, 5, 9, 30)).restricted)
        assertFalse(computeGate(listOf(s), at(2026, 10, 12, 9, 30)).restricted)
    }

    @Test fun reflectionCountsOnlyNonWhitespaceCharacters() {
        assertEquals(3, countReflectionChars("a b\n c"))
        assertFalse(isPauseUnlocked(" ".repeat(500)))
        assertTrue(isPauseUnlocked("x".repeat(150)))
        assertFalse(isPauseUnlocked("x".repeat(149)))
    }

    @Test fun clockLabelFormats() {
        assertEquals("4:00 PM", clockLabel("16:00")); assertEquals("12:05 AM", clockLabel("00:05")); assertEquals("12:00 PM", clockLabel("12:00"))
    }
}
