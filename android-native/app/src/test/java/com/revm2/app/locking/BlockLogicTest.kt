package com.revm2.app.locking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockLogicTest {
    private val self = "com.revm2.app"
    private val exempt = setOf("com.launcher", "com.android.systemui")
    private val tamper = setOf("com.android.settings", "com.google.android.packageinstaller")

    private fun session(
        active: Boolean = true, mode: String = "blacklist", apps: Set<String> = setOf("com.insta"),
        domains: Set<String> = setOf("reddit.com"), lockSettings: Boolean = false, endsAtMs: Long = 0L,
    ) = BlockStore.Session(active, "s1", false, mode, apps, domains, null, endsAtMs, lockSettings)

    private fun blocked(s: BlockStore.Session, pkg: String) = BlockStore.isAppBlockedForSession(s, pkg, self, exempt, tamper)

    @Test fun inactiveSessionBlocksNothing() = assertFalse(blocked(session(active = false), "com.insta"))

    @Test fun blacklistBlocksListedAppsOnly() {
        assertTrue(blocked(session(), "com.insta"))
        assertFalse(blocked(session(), "com.calc"))
    }

    @Test fun neverBlocksSelfOrLauncherOrSystemUi() {
        val s = session(mode = "whitelist", apps = emptySet(), lockSettings = true)
        assertFalse(blocked(s, self)); assertFalse(blocked(s, "com.launcher")); assertFalse(blocked(s, "com.android.systemui"))
    }

    @Test fun settingsReachableInNormalSessionButClosedInLockedOne() {
        assertFalse(blocked(session(), "com.android.settings"))
        assertFalse(blocked(session(mode = "whitelist", apps = emptySet()), "com.android.settings"))
        assertTrue(blocked(session(lockSettings = true), "com.android.settings"))
        assertTrue(blocked(session(lockSettings = true), "com.google.android.packageinstaller"))
    }

    @Test fun whitelistBlocksEverythingElse() {
        val s = session(mode = "whitelist", apps = setOf("com.notes"))
        assertFalse(blocked(s, "com.notes")); assertTrue(blocked(s, "com.insta"))
    }

    @Test fun domainsMatchSubdomainsAndDnsOverHttpsIsClosed() {
        val s = session()
        assertTrue(BlockStore.isDomainBlockedForSession(s, "reddit.com"))
        assertTrue(BlockStore.isDomainBlockedForSession(s, "old.reddit.com."))
        assertFalse(BlockStore.isDomainBlockedForSession(s, "notreddit.com"))
        assertTrue(BlockStore.isDomainBlockedForSession(s, "dns.google"))
        assertFalse(BlockStore.isDomainBlockedForSession(session(domains = emptySet()), "dns.google"))
        assertFalse(BlockStore.isDomainBlockedForSession(session(active = false), "reddit.com"))
    }

    @Test fun allowOnlySessionRefusesEverythingExceptTheListAndOurOwnHosts() {
        val s = BlockStore.Session(true, "s", true, "whitelist", emptySet(), setOf("khanacademy.org"), null, domainsAllowOnly = true)
        assertFalse(BlockStore.isDomainBlockedForSession(s, "www.khanacademy.org"))
        assertFalse(BlockStore.isDomainBlockedForSession(s, "abc.supabase.co"))
        assertTrue(BlockStore.isDomainBlockedForSession(s, "reddit.com"))
        // Sleep block: nothing allowed except the app's own hosts.
        val sleep = BlockStore.Session(true, "s", true, "whitelist", emptySet(), emptySet(), null, domainsAllowOnly = true)
        assertTrue(BlockStore.isDomainBlockedForSession(sleep, "youtube.com"))
        assertFalse(BlockStore.isDomainBlockedForSession(sleep, "xyz.supabase.co"))
    }

    @Test fun remainingSecondsForTimedAndUnlimitedSessions() {
        assertNull(session().remainingSeconds())
        assertEquals(60L, session(endsAtMs = 160_000L).remainingSeconds(nowMs = 100_000L))
        assertEquals(0L, session(endsAtMs = 100_000L).remainingSeconds(nowMs = 200_000L))
    }

    @Test fun uninstallGuardOnlyDuringSession() {
        assertFalse(BlockStore.isUninstallGuardedForSession(session(active = false), "com.google.android.packageinstaller", null))
        assertTrue(BlockStore.isUninstallGuardedForSession(session(active = true), "com.google.android.packageinstaller", null))
        assertTrue(BlockStore.isUninstallGuardedForSession(session(active = true), "com.android.settings", "com.android.settings.DeviceAdminAdd"))
        assertFalse(BlockStore.isUninstallGuardedForSession(session(active = true), "com.android.settings", "com.android.settings.Settings"))
    }
}
