package com.revm2.app.ui.shell

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.revm2.app.data.*
import kotlinx.serialization.json.JsonObject
import com.revm2.app.locking.ScheduleAlarms
import com.revm2.app.locking.ScheduleEnforcer
import com.revm2.app.schedule.*
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class Dest { Home, Focus, Schedules, Rooms, Room, Comms, CommStudent, CommManage, Battle, Coins, Earn, Settings, More, Quick, BlockLists }

enum class SheetKind { FreePause, Gate, Pause, AddTask, Pomodoro, Notifications, Password, DeleteAccount, AiAssistant, Routine, Challenge }

typealias StudyTask = PlanTask

/** Cross-screen state for the native app. Account data comes from Supabase (see data/AppRepository.kt); rooms and communities are still prototype sample data. */
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val ctx get() = getApplication<Application>()

    // ── navigation ──
    var dest by mutableStateOf(Dest.Home); private set
    var drawerOpen by mutableStateOf(false)
    var sheet by mutableStateOf<SheetKind?>(null)
    var toast by mutableStateOf<String?>(null)
    private val stack = ArrayDeque<Dest>()

    fun go(d: Dest) {
        if (d == dest) { drawerOpen = false; return }
        val isTop = d in TopLevel
        if (isTop) stack.clear() else stack.addLast(dest)
        dest = d; drawerOpen = false
    }

    /** Back inside a flow; returns false when already at the top level. */
    fun back(): Boolean {
        if (stack.isEmpty()) return if (dest != Dest.Home) { dest = Dest.Home; true } else false
        dest = stack.removeLast(); return true
    }

    fun flash(msg: String) {
        toast = msg
        viewModelScope.launch { delay(2200); if (toast == msg) toast = null }
    }

    // ── focus timer ──
    var mode by mutableStateOf("pomodoro")            // "pomodoro" | "regular"
    var running by mutableStateOf(false)
    var phase by mutableStateOf("focus")              // "focus" | "break"
    var pomoFocus by mutableStateOf(25)
    var pomoBreak by mutableStateOf(5)
    var pomoRepeat by mutableStateOf(true)
    var pomoAuto by mutableStateOf(true)
    var remaining by mutableStateOf(25 * 60)
    var elapsed by mutableStateOf(0)
    var sessionSecs by mutableStateOf(0)
    var activeId by mutableStateOf<String?>(null)
    var waitingBreak by mutableStateOf(false)
    var focusFull by mutableStateOf(false)
    val tasks = mutableStateListOf<StudyTask>()
    val activeTask get() = tasks.firstOrNull { it.id == activeId }
    val phaseTotal get() = if (phase == "focus") pomoFocus * 60 else pomoBreak * 60
    val timerText: String get() = fmt(if (mode == "pomodoro") remaining else elapsed, hours = mode != "pomodoro")

    // ── schedules (same rules as the desktop app; see schedule/ScheduleGate.kt) ──
    var schedules by mutableStateOf<List<StoredSchedule>>(ScheduleStore.load(getApplication()))
        private set
    var schedulesError by mutableStateOf<String?>(null)
    var gate by mutableStateOf(computeGate(ScheduleStore.gateSchedules(ScheduleStore.load(getApplication()))))
        private set
    var freePauseUntilMs by mutableStateOf<Long?>(FreePauses.until(getApplication()))
        private set
    /** Pending action for the 500-character edit-lock gate (pause / remove a schedule). */
    var gateAction by mutableStateOf<(() -> Unit)?>(null)

    fun refreshSchedules() {
        viewModelScope.launch {
            try {
                schedules = ScheduleRepository.refresh(ctx); schedulesError = null
                recomputeGate()
                ScheduleEnforcer.evaluate(ctx); ScheduleAlarms.rearm(ctx)
            } catch (e: Exception) { schedulesError = "Couldn't refresh schedules; using the saved copy." }
        }
    }

    private fun recomputeGate() { gate = computeGate(ScheduleStore.gateSchedules(schedules)) }

    private fun endFreePauseIfDue() {
        val until = freePauseUntilMs ?: return
        if (System.currentTimeMillis() >= until) { FreePauses.clear(ctx); freePauseUntilMs = null; if (!running) { running = true } }
    }

    init {
        refreshSchedules()
        viewModelScope.launch {
            var n = 0
            while (true) {
                delay(1000)
                n++
                if (running) tick()
                if (qtRunning) qtTick()
                endFreePauseIfDue()
                if (n % 30 == 0) recomputeGate()
                if (n % 300 == 0) refreshSchedules() // every 5 minutes, like the desktop app
            }
        }
    }

    /** Edit-lock gate for changing a schedule (pause / remove): type the 500-character code exactly. */
    fun requireGate(action: () -> Unit) { gateAction = action; sheet = SheetKind.Gate }

    fun setScheduleActive(id: String, active: Boolean) = viewModelScope.launch {
        try { ScheduleRepository.setActive(id, active); refreshSchedules() } catch (e: Exception) { flash("Couldn't update the schedule") }
    }
    fun removeSchedule(id: String) = viewModelScope.launch {
        try { ScheduleRepository.delete(id); refreshSchedules() } catch (e: Exception) { flash("Couldn't remove the schedule") }
    }

    private fun tick() {
        sessionSecs++
        if (mode == "regular") { elapsed++; return }
        remaining--
        if (remaining > 0) return
        if (phase == "focus") {
            phase = "break"; remaining = pomoBreak * 60
            if (!pomoAuto) { running = false; waitingBreak = true }
        } else {
            phase = "focus"; remaining = pomoFocus * 60
            if (!pomoRepeat) running = false
        }
    }

    /** Start (or resume) the active task, or ask for a task first. */
    fun startFocus() {
        if (running) return
        // On a day a schedule runs, the timer only starts inside one of its blocks (desktop rule).
        recomputeGate()
        if (gate.restricted && gate.inside == null) { flash(blockedMessage(gate)); return }
        val id = activeId ?: tasks.firstOrNull { !it.done }?.id
        if (id == null) { sheet = SheetKind.AddTask; return }
        activeId = id; running = true; waitingBreak = false
    }

    fun startTask(id: String) {
        recomputeGate()
        if (gate.restricted && gate.inside == null) { flash(blockedMessage(gate)); go(Dest.Focus); return }
        activeId = id; running = true; waitingBreak = false; go(Dest.Focus)
    }

    /** Pausing a live session goes through the 150-word reflection sheet, as on desktop. */
    fun askPause() {
        if (!running) return
        // Inside a schedule block: 2 free 20-minute pauses per schedule per day, then the reflection gate.
        val sid = gate.inside?.schedule?.id
        sheet = if (sid != null && FreePauses.left(ctx, sid) > 0) SheetKind.FreePause else SheetKind.Pause
    }
    val freePausesLeft: Int get() = gate.inside?.schedule?.id?.let { FreePauses.left(ctx, it) } ?: 0
    fun beginFreePause() {
        val sid = gate.inside?.schedule?.id ?: return
        freePauseUntilMs = FreePauses.begin(ctx, sid)
        running = false; sheet = null
    }
    fun confirmPause() { running = false; sheet = null }

    fun selectMode(m: String) {
        if (running) return
        mode = m
        remaining = pomoFocus * 60; elapsed = 0; phase = "focus"
    }

    fun savePomodoro(focus: Int, brk: Int, repeat: Boolean, auto: Boolean) {
        pomoFocus = focus; pomoBreak = brk; pomoRepeat = repeat; pomoAuto = auto
        if (!running && mode == "pomodoro" && phase == "focus") remaining = focus * 60
        sheet = null; flash("Pomodoro saved · $focus/$brk")
    }

    fun addTask(subject: String, topic: String, minutes: Int = 45) {
        val t = StudyTask(java.util.UUID.randomUUID().toString(), subject, topic.ifBlank { "General" }, minutes, false)
        tasks.add(t); sheet = null
        viewModelScope.launch {
            try { AppRepository.addTask(t, tasks.size) } catch (e: Exception) { tasks.remove(t); flash("Couldn't save the task") }
        }
    }
    fun removeTask(id: String) {
        val i = tasks.indexOfFirst { it.id == id }; if (i < 0) return
        val t = tasks.removeAt(i)
        if (activeId == id) { activeId = null; running = false }
        viewModelScope.launch {
            try { AppRepository.deleteTask(id) } catch (e: Exception) { tasks.add(i.coerceAtMost(tasks.size), t); flash("Couldn't remove the task") }
        }
    }
    fun toggleDone(id: String) {
        val i = tasks.indexOfFirst { it.id == id }; if (i < 0) return
        val was = tasks[i]; tasks[i] = was.copy(done = !was.done)
        viewModelScope.launch {
            try { AppRepository.setTaskDone(id, !was.done) } catch (e: Exception) {
                val j = tasks.indexOfFirst { it.id == id }; if (j >= 0) tasks[j] = was; flash("Couldn't update the task")
            }
        }
    }

    // ── quick timer ──
    var qtTotal by mutableStateOf(25 * 60)
    var qtRemaining by mutableStateOf(25 * 60)
    var qtRunning by mutableStateOf(false)
    private fun qtTick() { if (qtRemaining > 0) qtRemaining-- else qtRunning = false }
    fun qtToggle() { if (qtRemaining == 0) qtRemaining = qtTotal; qtRunning = !qtRunning }
    fun qtSet(minutes: Int) { qtTotal = minutes * 60; qtRemaining = qtTotal; qtRunning = false }

    // ── blocking (design shows names; the real list comes from the locking plugin) ──
    val blockedApps = mutableStateListOf("Instagram", "YouTube", "Snapchat", "BGMI")
    val blockedSites = mutableStateListOf("reddit.com")
    fun toggleApp(name: String) { if (!blockedApps.remove(name)) blockedApps.add(name) }

    // ── rooms / communities ──
    var currentRoomId by mutableStateOf(1)
    var roomFrom by mutableStateOf(Dest.Rooms)
    val joinedRooms = mutableStateListOf<Int>()
    var pendingRoomId by mutableStateOf<Int?>(null)
    var currentCommunityId by mutableStateOf("c2")
    fun openRoom(id: Int, from: Dest) { currentRoomId = id; roomFrom = from; go(Dest.Room) }

    // ── account data (Supabase) ──
    var profile by mutableStateOf<Profile?>(null); private set
    var coins by mutableStateOf(0); private set
    val xp: Int get() = hub?.xp ?: profile?.battleXp ?: 0
    var hub by mutableStateOf<BattleHub?>(null); private set
    var leaderboard by mutableStateOf<List<Battler>>(emptyList()); private set
    var battleHistory by mutableStateOf<List<BattleResult>>(emptyList()); private set
    var coinPacks by mutableStateOf<List<CoinPack>>(emptyList()); private set
    var notifs by mutableStateOf<List<Notif>>(emptyList()); private set
    var accountError by mutableStateOf<String?>(null); private set
    val unreadNotifs: Boolean get() = notifs.any { !it.read }
    // 1v1 arena states ("waiting"/"arena") are driven by the server hub; the live-duel timer itself is not wired yet.
    var battle by mutableStateOf("home")              // home | waiting | arena
    var battleSecs by mutableStateOf(0)

    fun refreshAccount() {
        viewModelScope.launch {
            try {
                val p = AppRepository.profile()
                profile = p
                p.preferences.forEach { (k, v) -> (v as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull?.let { prefs[k] = it } }
                if (p.dailyGoalMinutes > 0) dailyGoalHours = (p.dailyGoalMinutes / 60).coerceAtLeast(1)
                coins = AppRepository.coins()
                val remote = AppRepository.tasks()
                tasks.clear(); tasks.addAll(remote)
                accountError = null
            } catch (e: Exception) { accountError = "Couldn't load your account; showing what we have." }
            refreshNotifs(); refreshBattle(); refreshCoinPacks()
        }
    }

    var dailyGoalHours by mutableStateOf(3)

    fun refreshNotifs() { viewModelScope.launch { try { notifs = AppRepository.notifications() } catch (_: Exception) {} } }
    fun openNotifications() {
        sheet = SheetKind.Notifications
        if (unreadNotifs) viewModelScope.launch {
            try { AppRepository.markNotificationsRead() } catch (_: Exception) {}
            notifs = notifs.map { it.copy(read = true) }
        }
    }

    fun refreshBattle() {
        viewModelScope.launch {
            try {
                hub = AppRepository.battleHub()
                leaderboard = AppRepository.topBattlers()
                battleHistory = AppRepository.battleHistory()
                battle = if (hub?.outgoingId != null) "waiting" else "home"
            } catch (_: Exception) { flash("Couldn't load Battleground") }
        }
    }
    fun refreshCoinPacks() { viewModelScope.launch { try { coinPacks = AppRepository.coinPacks() } catch (_: Exception) {} } }

    fun challenge(userId: String, name: String) {
        viewModelScope.launch {
            try { AppRepository.sendChallenge(userId); sheet = null; flash("Challenge sent to $name"); refreshBattle() }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't send the challenge") }
        }
    }
    fun cancelChallenge() {
        val id = hub?.outgoingId ?: return
        viewModelScope.launch { try { AppRepository.cancelChallenge(id); refreshBattle() } catch (e: Exception) { flash("Couldn't cancel the challenge") } }
    }
    fun respondChallenge(id: String, accept: Boolean) {
        viewModelScope.launch {
            try { AppRepository.respondChallenge(id, accept); refreshBattle(); if (accept) flash("Challenge accepted") }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't respond") }
        }
    }

    /** Persists the preference toggles, merged into the profile's preferences JSON. */
    fun setPref(key: String, value: Boolean) {
        val old = prefs[key]
        prefs[key] = value
        viewModelScope.launch {
            try { AppRepository.savePreferences(profile?.preferences ?: JsonObject(emptyMap()), prefs.toMap()) }
            catch (e: Exception) { if (old != null) prefs[key] = old; flash("Couldn't save that setting") }
        }
    }

    fun saveProfile(display: String, bio: String, school: String, classYear: String, course: String, exam: String, goalHours: Int, username: String) {
        viewModelScope.launch {
            try {
                AppRepository.saveProfile(display, bio, school, classYear, course, exam, goalHours * 60)
                if (username.isNotBlank() && username != profile?.username) AppRepository.setUsername(username)
                dailyGoalHours = goalHours
                profile = AppRepository.profile(); flash("Profile saved")
            } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't save your profile") }
        }
    }

    fun signOut() { viewModelScope.launch { try { AuthRepository.signOut() } catch (e: Exception) { flash("Couldn't sign out") } } }

    val prefs = mutableStateMapOf(
        "notif_focus_alerts" to true, "notif_streak" to true, "notif_battle" to true, "notif_rooms" to true, "notif_achievements" to true,
        "sound_effects" to true, "privacy_public_profile" to true, "privacy_show_streak" to true, "privacy_show_stats" to true,
        "privacy_allow_room_invites" to true, "focus_auto_start_breaks" to false, "focus_block_distractions" to true, "focus_ambient_sound" to false, "focus_strict_lock" to false,
    )

    // Last, so every property above is initialised before the first load starts.
    init { refreshAccount() }

    companion object {
        val TopLevel = setOf(Dest.Home, Dest.Focus, Dest.Rooms, Dest.Battle, Dest.Comms, Dest.Schedules, Dest.Coins, Dest.Earn, Dest.Settings, Dest.More)
        fun fmt(totalSeconds: Int, hours: Boolean = false): String {
            val h = totalSeconds / 3600; val m = (totalSeconds % 3600) / 60; val s = totalSeconds % 60
            return if (hours || h > 0) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
        }
    }
}
