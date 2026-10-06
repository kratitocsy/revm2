package com.revm2.app.data

import android.content.Context
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** One subject's allow-list, as stored in wynky_profiles.subject_allowlists (web: SubjectAllowlist). */
data class SubjectAllowlist(val sites: List<String>, val apps: List<String>, val channels: List<JsonElement>, val appsMode: String?) {
    val enforceable get() = sites.isNotEmpty() || apps.isNotEmpty() || channels.isNotEmpty()
}

data class PlanSlot(val subject: String?, val start: String, val end: String, val isSleep: Boolean = false, val presetId: String? = null)

/**
 * Writes Focus Lock schedules exactly the way the web app does (wynky/wynkyPlanner.ts
 * ensurePresets + writeSchedule, lib/communityEnforce.ts), so a plan saved on the phone
 * is the same rows schedule-tick, the desktop app and the web enforce.
 */
object PlanWriter {
    private val sb get() = Supabase.client
    private val uid get() = sb.auth.currentUserOrNull()?.id ?: error("Not signed in")

    const val WYNKY_PLAN_NAME = "Wynky Plan"
    const val FREE_TIME_PRESET_NAME = "Wynky — Free time"
    const val COMMUNITY_PLAN_PREFIX = "Community — "
    const val COMMUNITY_STUDY_PRESET_NAME = "Community — Study"
    private val COMMUNITY_BLOCKED_SITES = listOf("instagram.com", "facebook.com", "twitter.com", "x.com", "reddit.com", "netflix.com", "twitch.tv", "tiktok.com", "pinterest.com", "web.whatsapp.com")
    private val COMMUNITY_BLOCKED_APPS = listOf("Instagram", "WhatsApp", "Netflix")
    private val WEEKDAY = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    fun subjectPresetName(subject: String) = "Wynky — $subject"

    @Serializable private data class IdRow(val id: String)
    @Serializable private data class NamedRow(val id: String, val name: String, val active: Boolean = true)
    @Serializable private data class RememberedRow(@SerialName("subject_allowlists") val allow: JsonElement? = null)

    // ── allow-lists (wynky_profiles.subject_allowlists) ──

    suspend fun savedAllowlists(): Map<String, SubjectAllowlist> {
        val row = sb.from("wynky_profiles").select { filter { eq("user_id", uid) } }.decodeSingleOrNull<RememberedRow>()
        val obj = row?.allow as? JsonObject ?: return emptyMap()
        return obj.mapNotNull { (subject, v) ->
            val o = v as? JsonObject ?: return@mapNotNull null
            fun strs(k: String) = (o[k] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
            subject to SubjectAllowlist(strs("sites"), strs("apps"), (o["channels"] as? JsonArray)?.toList() ?: emptyList(), (o["appsMode"] as? JsonPrimitive)?.contentOrNull)
        }.toMap()
    }

    // ── presets ──

    private suspend fun upsertPreset(name: String, fields: JsonObject): String {
        val existing = sb.from("focus_lock_presets").select { filter { eq("user_id", uid); eq("name", name) } }.decodeList<IdRow>().firstOrNull()
        if (existing != null) {
            sb.from("focus_lock_presets").update(fields) { filter { eq("id", existing.id) } }
            return existing.id
        }
        val row = JsonObject(fields + mapOf("user_id" to JsonPrimitive(uid), "name" to JsonPrimitive(name)))
        return sb.from("focus_lock_presets").insert(row) { select() }.decodeSingle<IdRow>().id
    }

    /** Web ensurePresets: one preset per enforceable subject. Returns subject -> preset id. */
    suspend fun ensurePresets(allow: Map<String, SubjectAllowlist>): Map<String, String> {
        val out = mutableMapOf<String, String>()
        for ((subject, a) in allow) {
            if (!a.enforceable) continue
            val hasYoutube = a.sites.any { it == "youtube.com" || it.endsWith(".youtube.com") }
            val fields = buildJsonObject {
                put("mode", if (a.sites.isNotEmpty()) "whitelist" else "blacklist")
                putJsonArray("sites") { a.sites.forEach { add(JsonPrimitive(it)) } }
                putJsonArray("apps") { a.apps.forEach { add(JsonPrimitive(it)) } }
                put("apps_mode", if (a.appsMode == "whitelist") "whitelist" else "blacklist")
                if (a.channels.isNotEmpty() && hasYoutube) putJsonObject("youtube_rules") { put("mode", "allow"); put("channels", JsonArray(a.channels)) }
                else put("youtube_rules", JsonNull)
            }
            out[subject] = upsertPreset(subjectPresetName(subject), fields)
        }
        return out
    }

    private suspend fun communityStudyPreset(): String = upsertPreset(COMMUNITY_STUDY_PRESET_NAME, buildJsonObject {
        put("mode", "blacklist"); put("apps_mode", "blacklist")
        putJsonArray("sites") { COMMUNITY_BLOCKED_SITES.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("apps") { COMMUNITY_BLOCKED_APPS.forEach { add(JsonPrimitive(it)) } }
    })

    // ── schedules ──

    /** Web writeSchedule: creates or replaces the named schedule and its slots. */
    suspend fun writeSchedule(name: String, days: List<Int>, slots: List<PlanSlot>, weekParity: Int? = null): String {
        val existing = sb.from("focus_lock_schedules").select { filter { eq("user_id", uid); eq("name", name) } }.decodeList<IdRow>().firstOrNull()
        val id = if (existing != null) {
            sb.from("focus_lock_schedules").update({ set("days_of_week", days); set("active", true); set("week_parity", weekParity) }) { filter { eq("id", existing.id) } }
            sb.from("focus_lock_schedule_slots").delete { filter { eq("schedule_id", existing.id) } }
            existing.id
        } else {
            sb.from("focus_lock_schedules").insert(buildJsonObject {
                put("user_id", uid); put("name", name); putJsonArray("days_of_week") { days.forEach { add(JsonPrimitive(it)) } }
                put("week_parity", weekParity?.let { JsonPrimitive(it) } ?: JsonNull)
            }) { select() }.decodeSingle<IdRow>().id
        }
        val rows = slots.filter { it.isSleep || it.presetId != null }.mapIndexed { i, s ->
            buildJsonObject {
                put("schedule_id", id); put("slot_order", i)
                put("preset_id", if (s.isSleep) JsonNull else JsonPrimitive(s.presetId))
                put("subject", if (s.isSleep) JsonNull else JsonPrimitive(s.subject))
                put("start_time", s.start); put("end_time", s.end); put("is_sleep", s.isSleep); put("break_after_minutes", 0)
            }
        }
        if (rows.isNotEmpty()) sb.from("focus_lock_schedule_slots").insert(rows)
        return id
    }

    private suspend fun deleteSchedules(match: (String) -> Boolean) {
        val rows = sb.from("focus_lock_schedules").select { filter { eq("user_id", uid) } }.decodeList<NamedRow>()
        for (r in rows.filter { match(it.name) }) {
            sb.from("focus_lock_schedule_slots").delete { filter { eq("schedule_id", r.id) } }
            sb.from("focus_lock_schedules").delete { filter { eq("id", r.id) } }
        }
    }

    /** Same week-parity clock as the web (IST weeks from 2 Aug 2026, Sunday-based). */
    fun istWeekParity(nowMs: Long = System.currentTimeMillis()): Int {
        val istDays = Math.floorDiv(nowMs + (5 * 60 + 30) * 60_000L, 86_400_000L)
        val dow = java.time.LocalDate.ofEpochDay(istDays).dayOfWeek.value % 7 // Sun = 0
        val sunday = istDays - dow
        val epoch = java.time.LocalDate.of(2026, 8, 2).toEpochDay()
        return Math.floorMod(Math.floorDiv(sunday - epoch, 7L), 2L).toInt()
    }

    class NoEnforceableBlocks : Exception("None of those study blocks match a subject you've set up, so there's nothing for Focus Lock to enforce yet. Pick the sites, apps or YouTube channels each subject needs first (Wynky on the web or desktop).")

    /**
     * Saves a Wynky chat plan (the `days` of an ai-generate-schedule chat answer) as
     * "Wynky Plan - <day>" schedules, like the web's confirmWeekPlan. Day keys 0-6 are
     * Sun-Sat, 7-13 a Week B; "all" means every active day.
     */
    suspend fun saveWynkyPlan(days: Map<String, List<PlanSlot>>, activeDays: List<Int>) {
        val allow = savedAllowlists()
        val presets = ensurePresets(allow)
        val byDay = mutableMapOf<Int, List<PlanSlot>>()
        days["all"]?.let { slots -> activeDays.forEach { byDay[it] = slots } }
        days.filterKeys { it != "all" }.forEach { (k, v) -> k.toIntOrNull()?.let { byDay[it] = v } }
        val twoWeeks = byDay.keys.any { it >= 7 }
        val parity = istWeekParity()
        val resolved = byDay.filterKeys { (it % 7) in activeDays }.mapValues { (_, slots) ->
            slots.map { s -> s.copy(presetId = if (s.isSleep) null else s.subject?.let { presets[it] }) }
        }
        val study = resolved.values.flatten().filter { !it.isSleep }
        if (study.isNotEmpty() && study.none { it.presetId != null }) throw NoEnforceableBlocks()

        deleteSchedules { it == WYNKY_PLAN_NAME || it.startsWith("$WYNKY_PLAN_NAME - ") }
        for ((day, slots) in resolved) {
            val label = if (twoWeeks) "${if (day >= 7) "B" else "A"} ${WEEKDAY[day % 7]}" else WEEKDAY[day]
            writeSchedule("$WYNKY_PLAN_NAME - $label", listOf(day % 7), slots, if (twoWeeks) (if (day >= 7) 1 - parity else parity) else null)
        }
    }

    // ── community schedules (web lib/communityEnforce.ts) ──

    private fun pausedPrefs(ctx: Context) = ctx.getSharedPreferences("community_paused", Context.MODE_PRIVATE)

    /** "9:00 AM" or "09:00" -> "09:00". */
    fun toHHMM(t: String): String? {
        val s = t.trim()
        Regex("^(\\d{1,2}):(\\d{2})\\s*(AM|PM)$", RegexOption.IGNORE_CASE).find(s)?.let { m ->
            val h = m.groupValues[1].toInt() % 12 + if (m.groupValues[3].equals("PM", true)) 12 else 0
            val min = m.groupValues[2].toInt()
            return if (h < 24 && min < 60) "%02d:%02d".format(h, min) else null
        }
        Regex("^(\\d{1,2}):(\\d{2})$").find(s)?.let { m ->
            val h = m.groupValues[1].toInt(); val min = m.groupValues[2].toInt()
            return if (h < 24 && min < 60) "%02d:%s".format(h, m.groupValues[2]) else null
        }
        return null
    }

    /** The community week (index 0 = Monday) as slots per Focus Lock weekday (0 = Sunday). */
    fun communityWeekSlots(week: JsonElement?): Map<Int, List<PlanSlot>> {
        val days = (week as? JsonArray) ?: return emptyMap()
        val out = mutableMapOf<Int, List<PlanSlot>>()
        days.take(7).forEachIndexed { mondayFirst, items ->
            val slots = ((items as? JsonArray) ?: JsonArray(emptyList())).mapNotNull { x ->
                val o = x as? JsonObject ?: return@mapNotNull null
                fun s(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull ?: ""
                val start = toHHMM(s("startTime")); val end = toHHMM(s("endTime"))
                if (start == null || end == null || start == end) null
                else PlanSlot(s("subject").trim().ifBlank { "Study" }, start, if (end < start) "23:59" else end)
            }.sortedBy { it.start }
            if (slots.isNotEmpty()) out[(mondayFirst + 1) % 7] = slots
        }
        return out
    }

    private fun planLabel(name: String) = name.trim().ifBlank { "Community" }.take(60)

    /** Accepting a community week: pause own schedules, write one schedule per weekday. */
    suspend fun enforceCommunitySchedule(ctx: Context, communityName: String, week: JsonElement?) {
        val byDay = communityWeekSlots(week)
        val subjects = byDay.values.flatten().mapNotNull { it.subject }.toSet()
        val saved = savedAllowlists()
        val presets = ensurePresets(saved.filterKeys { it in subjects })
        val fallback = if (subjects.any { it !in presets }) communityStudyPreset() else null

        val rows = sb.from("focus_lock_schedules").select { filter { eq("user_id", uid) } }.decodeList<NamedRow>()
        val toPause = rows.filter { it.active && !it.name.startsWith(COMMUNITY_PLAN_PREFIX) }.map { it.id }
        for (id in toPause) sb.from("focus_lock_schedules").update({ set("active", false) }) { filter { eq("id", id) } }
        val p = pausedPrefs(ctx)
        p.edit().putStringSet(uid, (p.getStringSet(uid, emptySet()).orEmpty() + toPause).toSet()).apply()

        deleteSchedules { it.startsWith(COMMUNITY_PLAN_PREFIX) }
        val label = planLabel(communityName)
        for ((day, slots) in byDay) {
            writeSchedule("$COMMUNITY_PLAN_PREFIX$label - ${WEEKDAY[day]}", listOf(day), slots.map { it.copy(presetId = presets[it.subject] ?: fallback) })
        }
    }

    /** Rejecting or leaving: drop the community schedules and switch the paused ones back on. */
    suspend fun releaseCommunitySchedule(ctx: Context, communityName: String? = null) {
        if (communityName != null) {
            val prefix = "$COMMUNITY_PLAN_PREFIX${planLabel(communityName)} - "
            val rows = sb.from("focus_lock_schedules").select { filter { eq("user_id", uid) } }.decodeList<NamedRow>()
            if (rows.none { it.name.startsWith(prefix) }) return
        }
        deleteSchedules { it.startsWith(COMMUNITY_PLAN_PREFIX) }
        val p = pausedPrefs(ctx)
        for (id in p.getStringSet(uid, emptySet()).orEmpty()) sb.from("focus_lock_schedules").update({ set("active", true) }) { filter { eq("id", id) } }
        p.edit().remove(uid).apply()
    }
}

/** Reads a plan-day list (web ChatDay[]) from an AI chat answer. */
internal fun parseChatDays(v: JsonElement?): Map<String, List<PlanSlot>> {
    val list: List<Pair<String, JsonElement?>> = when (v) {
        is JsonArray -> v.mapNotNull { (it as? JsonObject)?.let { o -> (o["day"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null) to o["slots"] } }
        is JsonObject -> v.entries.map { it.key to it.value }
        else -> emptyList()
    }
    return list.associate { (day, slots) ->
        day to ((slots as? JsonArray) ?: JsonArray(emptyList())).mapNotNull { s ->
            when (s) {
                is JsonArray -> if (s.size >= 3) PlanSlot(s[2].jsonPrimitive.contentOrNull, s[0].jsonPrimitive.content, s[1].jsonPrimitive.content.let { if (it == "24:00") "23:59" else it }) else null
                is JsonObject -> PlanSlot(s["subject"]?.jsonPrimitive?.contentOrNull, s["start_time"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    (s["end_time"]?.jsonPrimitive?.content ?: return@mapNotNull null).let { if (it == "24:00") "23:59" else it })
                else -> null
            }
        }
    }
}

