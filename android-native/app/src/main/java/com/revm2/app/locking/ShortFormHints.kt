package com.revm2.app.locking

/**
 * What the Reels / Shorts screens look like to the accessibility service: the view ids that only exist while
 * the short-video pager is on screen. These are internal to Instagram and YouTube and change with their app
 * updates, so they live in this one list (best effort - verify with `adb shell uiautomator dump` on the Reels /
 * Shorts screen and update here). Only these two apps are ever inspected.
 */
object ShortFormHints {
    data class Target(val platform: String, val packageName: String, val viewIds: List<String>)

    const val INSTAGRAM = "instagram"
    const val YOUTUBE = "youtube"

    val targets = listOf(
        Target(INSTAGRAM, "com.instagram.android", listOf("clips_viewer_view_pager", "clips_swipe_refresh_container", "root_clips_layout")),
        Target(YOUTUBE, "com.google.android.youtube", listOf("reel_recycler", "reel_player_page_container", "shorts_container")),
    )

    fun targetFor(packageName: String): Target? = targets.firstOrNull { it.packageName == packageName }

    /** Fully-qualified view ids to look up for [packageName], e.g. "com.instagram.android:id/clips_viewer_view_pager". */
    fun qualifiedIds(t: Target): List<String> = t.viewIds.map { "${t.packageName}:id/$it" }
}
