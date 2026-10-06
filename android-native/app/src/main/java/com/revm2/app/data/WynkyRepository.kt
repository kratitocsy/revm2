package com.revm2.app.data

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

data class WynkyMsg(val fromBot: Boolean, val text: String, val past: Boolean = false)

/** What one AI chat turn returned (edge function ai-generate-schedule, mode "chat"). */
data class WynkyAnswer(val reply: String, val days: Map<String, List<PlanSlot>>, val activeDays: List<Int>)

/**
 * Wynky on the phone: the same chat history (wynky_chat_messages), the same AI chat mode
 * the web's WynkyChat uses, and the same memory (wynky_memory) and agreed settings
 * (wynky_profiles.chat_settings), so a conversation carries on across web, desktop and phone.
 */
object WynkyRepository {
    private val sb get() = Supabase.client
    private val uid get() = sb.auth.currentUserOrNull()?.id ?: error("Not signed in")
    private val json = Json { ignoreUnknownKeys = true }
    private val DAY_NAMES = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

    @Serializable private data class MsgRow(val sender: String, val body: String)
    @Serializable private data class SettingsRow(@SerialName("chat_settings") val settings: JsonElement? = null)
    @Serializable private data class MemRow(val fact: String)
    @Serializable
    private data class KnownRow(
        val subjects: List<String>? = null, val exam: String? = null,
        @SerialName("quiz_answers") val quiz: JsonElement? = null, val archetype: String? = null,
    )

    suspend fun history(limit: Long = 40): List<WynkyMsg> =
        sb.from("wynky_chat_messages").select(Columns.list("sender", "body")) { order("id", Order.DESCENDING); limit(limit) }
            .decodeList<MsgRow>().reversed().map { WynkyMsg(it.sender == "bot", it.body, past = true) }

    suspend fun remember(fromBot: Boolean, text: String) {
        if (text.isBlank()) return
        sb.from("wynky_chat_messages").insert(buildJsonObject { put("sender", if (fromBot) "bot" else "user"); put("body", text.take(8000)) })
    }

    suspend fun clearHistory() { sb.from("wynky_chat_messages").delete { filter { eq("user_id", uid) } } }

    private suspend fun known(): KnownRow =
        sb.from("user_profiles").select(Columns.list("subjects", "exam", "quiz_answers", "archetype")) { filter { eq("id", uid) } }.decodeSingleOrNull() ?: KnownRow()

    /** Same facts the web sends (WynkyChat studentFacts). */
    private fun facts(k: KnownRow): List<String> {
        val qa = k.quiz as? JsonObject
        fun str(key: String) = (qa?.get(key) as? JsonPrimitive)?.contentOrNull
        fun strs(key: String) = (qa?.get(key) as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        return buildList {
            k.exam?.let { add("preparing for $it") }
            str("day_type")?.let { add("day type: ${it.replace('_', ' ')}") }
            k.archetype?.let { add("Study DNA archetype: $it") }
            strs("study_style").takeIf { it.isNotEmpty() }?.let { add("learns best with ${it.joinToString(" and ")}") }
            strs("challenges").takeIf { it.isNotEmpty() }?.let { add("struggles with ${it.joinToString(" and ")}") }
            strs("distractions").takeIf { it.isNotEmpty() }?.let { add("distracted by ${it.joinToString(", ")}") }
        }
    }

    private suspend fun chatSettings(): JsonObject =
        sb.from("wynky_profiles").select(Columns.list("chat_settings")) { filter { eq("user_id", uid) } }.decodeSingleOrNull<SettingsRow>()?.settings as? JsonObject
            ?: JsonObject(emptyMap())

    private suspend fun memory(): List<String> =
        try { sb.from("wynky_memory").select(Columns.list("fact")) { filter { eq("user_id", uid) }; order("id", Order.DESCENDING); limit(60) }.decodeList<MemRow>().map { it.fact } }
        catch (_: Exception) { emptyList() }

    /** The saved "Wynky Plan" schedules as the plan the AI is looking at. */
    private fun currentPlan(schedules: List<com.revm2.app.schedule.StoredSchedule>): JsonObject = buildJsonObject {
        putJsonArray("days") {
            schedules.filter { it.name == PlanWriter.WYNKY_PLAN_NAME || it.name.startsWith("${PlanWriter.WYNKY_PLAN_NAME} - ") }.forEach { s ->
                s.days.forEach { d ->
                    addJsonObject {
                        put("day", d)
                        putJsonArray("slots") { s.slots.filter { !it.isSleep }.forEach { sl -> addJsonObject { put("start_time", sl.start); put("end_time", sl.end); put("subject", sl.subject ?: "Study") } } }
                    }
                }
            }
        }
    }

    /** Sends one message to the AI chat with the same context the web sends; saves agreed settings and memory. */
    suspend fun chat(message: String, history: List<WynkyMsg>, schedules: List<com.revm2.app.schedule.StoredSchedule>): WynkyAnswer {
        val k = known()
        val subjects = k.subjects.orEmpty().filter { it.isNotBlank() }.ifEmpty { PlanWriter.savedAllowlists().keys.toList() }
        if (subjects.isEmpty()) throw IllegalStateException("Add your subjects first (Settings on the web, or the onboarding quiz) so Wynky can plan them.")
        val settings = chatSettings()
        val mem = memory()
        val body = buildJsonObject {
            put("mode", "chat"); put("message", message.take(1500))
            putJsonArray("subjects") { subjects.forEach { add(JsonPrimitive(it)) } }
            putJsonArray("weak") {}
            put("settings", settings)
            put("plan", currentPlan(schedules))
            putJsonArray("history") { history.takeLast(26).forEach { m -> addJsonObject { put("sender", if (m.fromBot) "bot" else "user"); put("text", m.text) } } }
            putJsonArray("facts") { facts(k).forEach { add(JsonPrimitive(it)) } }
            putJsonArray("learned") {}
            putJsonArray("standing_requests") { mem.take(40).forEach { add(JsonPrimitive(it)) } }
            put("today", DAY_NAMES[java.time.LocalDate.now().dayOfWeek.value % 7])
            putJsonArray("device_apps") {}
        }
        val res = json.parseToJsonElement(sb.functions.invoke("ai-generate-schedule", body).bodyAsText()) as? JsonObject
            ?: throw IllegalStateException("The AI is not available right now.")
        if ((res["success"] as? JsonPrimitive)?.contentOrNull != "true") throw IllegalStateException((res["error"] as? JsonPrimitive)?.contentOrNull ?: "The AI is not available right now.")

        // Keep what was agreed, so the next chat on any device starts from it.
        val agreed = JsonObject(settings + ((res["settings"] as? JsonObject) ?: JsonObject(emptyMap())))
        runCatching {
            sb.from("wynky_profiles").upsert(buildJsonObject { put("user_id", uid); put("chat_settings", agreed); put("updated_at", java.time.Instant.now().toString()) }) { onConflict = "user_id" }
        }
        fun list(e: JsonElement?) = (e as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { s -> s.isNotEmpty() } } ?: emptyList()
        val rules = list(agreed["rules"]).map { it to "rule" }
        val remember = list(res["remember"]).map { it to "fact" }
        runCatching {
            if (rules.isNotEmpty() || remember.isNotEmpty()) sb.from("wynky_memory").upsert(
                (rules + remember).map { (fact, kind) -> buildJsonObject { put("user_id", uid); put("fact", fact.take(200)); put("kind", kind) } }
            ) { onConflict = "user_id,fact_key"; ignoreDuplicates = true }
            val oldRules = list(settings["rules"]).toSet(); val newRules = list(agreed["rules"]).toSet()
            val forget = (list(res["forget"]) + (oldRules - newRules)).map { it.trim().lowercase() }.distinct()
            if (forget.isNotEmpty()) sb.from("wynky_memory").delete { filter { eq("user_id", uid); isIn("fact_key", forget) } }
        }
        val activeDays = (agreed["active_days"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull }?.takeIf { it.isNotEmpty() } ?: (0..6).toList()
        return WynkyAnswer((res["reply"] as? JsonPrimitive)?.contentOrNull ?: "", parseChatDays(res["days"]), activeDays)
    }

}
