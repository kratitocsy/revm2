package com.wynko.app.locking

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * YouTube channel rules on Android: the phone's twin of the extension's youtube-guard.js.
 *
 * A session's `youtube_rules` is `{ mode: "allow" | "block", channels: [{ id, label }] }` where `id` is a
 * normalised channel ref (`@handle`, a `UC...` channel id, or a legacy /c/ or /user/ slug, lowercase).
 *  - "allow": only the listed channels' videos and channel pages open; YouTube's home, search and other pages stay reachable.
 *  - "block": the listed channels are off-limits; everything else stays reachable.
 *
 * The DNS filter can only allow or block all of youtube.com, so this check runs on the browser's address bar
 * (see RevM2AccessibilityService). A watch URL carries only a video id; its channel comes from YouTube's public
 * oEmbed endpoint (no API key), cached per video.
 */
object YoutubeChannels {
    data class Channel(val id: String, val label: String)
    data class Rules(val mode: String, val channels: List<Channel>) {
        val allowOnly get() = mode != "block"
    }

    /** What a YouTube URL points at. */
    sealed class Target {
        data class ChannelPage(val ref: String) : Target()
        data class Video(val videoId: String) : Target()
    }

    fun parse(json: String?): Rules? {
        if (json.isNullOrBlank() || json == "null") return null
        return try {
            val o = JSONObject(json)
            val arr = o.optJSONArray("channels") ?: JSONArray()
            val channels = (0 until arr.length()).mapNotNull { i ->
                val c = arr.optJSONObject(i) ?: return@mapNotNull null
                val id = normalizeRef(c.optString("id"))
                if (id.isEmpty()) null else Channel(id, c.optString("label"))
            }
            if (channels.isEmpty()) null else Rules(if (o.optString("mode") == "block") "block" else "allow", channels)
        } catch (e: Exception) { null }
    }

    /** Same normalisation as youtube-guard.js normalizeChannelRef(). */
    fun normalizeRef(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        var v = raw.trim().lowercase()
        v = v.replace(Regex("^(https?://)?(www\\.|m\\.)?youtube\\.com/"), "")
        v = v.removePrefix("/").substringBefore('?').substringBefore('#').removeSuffix("/")
        for (p in listOf("channel/", "c/", "user/")) if (v.startsWith(p)) { v = v.removePrefix(p); break }
        return v.substringBefore('/')
    }

    /** Is [text] (an address bar's contents) a YouTube page that a channel rule has to look at? null = not one. */
    fun targetOf(text: String?): Target? {
        if (text.isNullOrBlank()) return null
        val t = text.trim().lowercase().replace(Regex("^https?://"), "")
        val host = t.substringBefore('/').removePrefix("www.").removePrefix("m.")
        if (host != "youtube.com" && host != "youtu.be" && host != "music.youtube.com") return null
        val path = t.substringAfter('/', "")
        val query = text.substringAfter('?', "")
        fun param(name: String) = query.split('&').firstOrNull { it.startsWith("$name=") }?.substringAfter('=')?.substringBefore('#')
        if (host == "youtu.be") return path.substringBefore('?').substringBefore('/').takeIf { it.isNotEmpty() }?.let { Target.Video(videoIdCase(text, it)) }
        val first = path.substringBefore('?').substringBefore('#').substringBefore('/')
        return when {
            first == "watch" -> param("v")?.takeIf { it.isNotEmpty() }?.let { Target.Video(it) }
            first == "shorts" || first == "live" || first == "embed" ->
                path.substringBefore('?').split('/').getOrNull(1)?.takeIf { it.isNotEmpty() }?.let { Target.Video(videoIdCase(text, it)) }
            first.startsWith("@") || first == "channel" || first == "c" || first == "user" -> normalizeRef(path).takeIf { it.isNotEmpty() }?.let { Target.ChannelPage(it) }
            else -> null // home, search, feeds, settings: always reachable, like on desktop
        }
    }

    /** Video ids are case-sensitive; take the id's original spelling from [original]. */
    private fun videoIdCase(original: String, lowered: String): String {
        val i = original.lowercase().indexOf(lowered)
        return if (i >= 0) original.substring(i, i + lowered.length) else lowered
    }

    private fun normName(s: String) = s.lowercase().replace(Regex("[^\\p{L}\\p{N}]"), "")

    /** Does the page (channel [ref] and/or channel [name]) pass [rules]? A null/unknown channel is let through. */
    fun allowed(rules: Rules, ref: String?, name: String?): Boolean {
        val r = normalizeRef(ref)
        val n = name?.let(::normName).orEmpty()
        if (r.isEmpty() && n.isEmpty()) return true
        val listed = rules.channels.any { c ->
            (r.isNotEmpty() && c.id == r) || (n.isNotEmpty() && normName(c.label) == n) || (n.isNotEmpty() && c.id.removePrefix("@") == n)
        }
        return if (rules.allowOnly) listed else !listed
    }

    private val cache = object : LinkedHashMap<String, Pair<String?, String?>>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<String?, String?>>?) = size > 200
    }

    /** The channel (ref, name) a video belongs to, via oEmbed. Blocking network call: run off the main thread. */
    fun lookupVideo(videoId: String): Pair<String?, String?>? {
        synchronized(cache) { cache[videoId]?.let { return it } }
        return try {
            val watch = URLEncoder.encode("https://www.youtube.com/watch?v=$videoId", "UTF-8")
            val conn = URL("https://www.youtube.com/oembed?format=json&url=$watch").openConnection() as HttpURLConnection
            conn.connectTimeout = 5000; conn.readTimeout = 5000
            val result = if (conn.responseCode == 200) {
                val o = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                normalizeRef(o.optString("author_url")).ifEmpty { null } to o.optString("author_name").ifEmpty { null }
            } else null to null  // private/removed video: nothing to match, treated as an unknown channel
            conn.disconnect()
            synchronized(cache) { cache[videoId] = result }
            result
        } catch (e: Exception) { null } // offline: decided again on the next address-bar change
    }

    /** Address-bar view ids of common Android browsers (best effort: browsers rename these; verify with uiautomator dump). */
    val BROWSER_URL_BARS: Map<String, List<String>> = mapOf(
        "com.android.chrome" to listOf("url_bar"),
        "com.chrome.beta" to listOf("url_bar"),
        "com.brave.browser" to listOf("url_bar"),
        "com.microsoft.emmx" to listOf("url_bar"),
        "com.opera.browser" to listOf("url_field"),
        "com.vivaldi.browser" to listOf("url_bar"),
        "com.kiwibrowser.browser" to listOf("url_bar"),
        "com.sec.android.app.sbrowser" to listOf("location_bar_edit_text"),
        "org.mozilla.firefox" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "com.duckduckgo.mobile.android" to listOf("omnibarTextInput"),
        "com.mi.globalbrowser" to listOf("url"),
    )

    const val YOUTUBE_APP = "com.google.android.youtube"
}
