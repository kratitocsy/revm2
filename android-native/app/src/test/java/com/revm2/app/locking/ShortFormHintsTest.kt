package com.revm2.app.locking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShortFormHintsTest {
    @Test fun onlyInstagramAndYouTubeAreInspected() {
        assertNotNull(ShortFormHints.targetFor("com.instagram.android"))
        assertNotNull(ShortFormHints.targetFor("com.google.android.youtube"))
        assertNull(ShortFormHints.targetFor("com.whatsapp"))
        assertNull(ShortFormHints.targetFor("com.android.settings"))
    }

    @Test fun idsAreQualifiedWithThePackage() {
        val t = ShortFormHints.targetFor("com.instagram.android")!!
        assertTrue(ShortFormHints.qualifiedIds(t).all { it.startsWith("com.instagram.android:id/") })
        assertEquals(t.viewIds.size, ShortFormHints.qualifiedIds(t).size)
    }

    @Test fun instagramStoriesIdsAreNotUsedAsReelsHints() {
        // Stories use "reel_viewer_*" ids inside Instagram; matching them would close Stories by mistake.
        val ids = ShortFormHints.targets.flatMap { it.viewIds }
        assertTrue(ids.none { it.startsWith("reel_viewer") })
    }
}
