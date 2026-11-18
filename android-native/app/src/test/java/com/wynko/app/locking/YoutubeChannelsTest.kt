package com.wynko.app.locking

import com.wynko.app.locking.YoutubeChannels.Channel
import com.wynko.app.locking.YoutubeChannels.Rules
import com.wynko.app.locking.YoutubeChannels.Target
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YoutubeChannelsTest {
    private val allowPw = Rules("allow", listOf(Channel("@physicswallah", "Physics Wallah - Alakh Pandey"), Channel("uc123abc", "Eduniti")))
    private val blockMr = Rules("block", listOf(Channel("@mrbeast", "MrBeast")))

    @Test fun normalizesLikeTheExtension() {
        assertEquals("@physicswallah", YoutubeChannels.normalizeRef("https://www.youtube.com/@PhysicsWallah"))
        assertEquals("uc123abc", YoutubeChannels.normalizeRef("/channel/UC123abc/videos"))
        assertEquals("@eduniti", YoutubeChannels.normalizeRef("m.youtube.com/@Eduniti?feature=x"))
        assertEquals("", YoutubeChannels.normalizeRef(null))
    }

    @Test fun readsAddressBars() {
        assertEquals(Target.Video("dQw4w9WgXcQ"), YoutubeChannels.targetOf("m.youtube.com/watch?v=dQw4w9WgXcQ&t=10"))
        assertEquals(Target.Video("AbC_123"), YoutubeChannels.targetOf("https://youtu.be/AbC_123?si=x"))
        assertEquals(Target.Video("XyZ987"), YoutubeChannels.targetOf("youtube.com/shorts/XyZ987"))
        assertEquals(Target.ChannelPage("@physicswallah"), YoutubeChannels.targetOf("youtube.com/@PhysicsWallah/videos"))
        assertEquals(Target.ChannelPage("uc123abc"), YoutubeChannels.targetOf("www.youtube.com/channel/UC123abc"))
    }

    @Test fun leavesOtherPagesAlone() {
        assertNull(YoutubeChannels.targetOf("m.youtube.com"))
        assertNull(YoutubeChannels.targetOf("youtube.com/results?search_query=physics"))
        assertNull(YoutubeChannels.targetOf("google.com/search?q=youtube.com/watch?v=x"))
        assertNull(YoutubeChannels.targetOf("notyoutube.com/watch?v=abc"))
        assertNull(YoutubeChannels.targetOf(""))
    }

    @Test fun allowModeLetsOnlyListedChannelsThrough() {
        assertTrue(YoutubeChannels.allowed(allowPw, "https://www.youtube.com/@PhysicsWallah", "Physics Wallah - Alakh Pandey"))
        assertTrue(YoutubeChannels.allowed(allowPw, null, "eduniti"))           // matched by name (oEmbed with no handle)
        assertFalse(YoutubeChannels.allowed(allowPw, "@mrbeast", "MrBeast"))
        assertTrue(YoutubeChannels.allowed(allowPw, null, null))               // unknown channel: not acted on
    }

    @Test fun blockModeStopsOnlyListedChannels() {
        assertFalse(YoutubeChannels.allowed(blockMr, "@MrBeast", null))
        assertTrue(YoutubeChannels.allowed(blockMr, "@physicswallah", "Physics Wallah"))
        assertFalse(blockMr.allowOnly)
    }
}
