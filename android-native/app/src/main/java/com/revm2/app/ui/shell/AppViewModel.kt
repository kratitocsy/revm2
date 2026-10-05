package com.revm2.app.ui.shell

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.revm2.app.data.ScheduleRepository
import com.revm2.app.locking.ScheduleAlarms
import com.revm2.app.locking.ScheduleEnforcer
import com.revm2.app.schedule.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class Dest { Home, Focus, Schedules, Rooms, Room, Comms, CommStudent, CommManage, Battle, Coins, Earn, Settings, More, Quick, BlockLists }

enum class SheetKind { FreePause, Gate, Pause, AddTask, Pomodoro, Notifications, Password, DeleteAccount, AiAssistant, Routine, Challenge }

data class StudyTask(val id: String, val subject: String, val topic: String, val minutes: Int, val done: Boolean = false)

/** Cross-screen state for the native app. Data is prototype sample data until wired to Supabase. */
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
    val tasks = mutableStateListOf(
        StudyTask("t1", "Physics", "Electrostatics", 60),
        StudyTask("t2", "Chemistry", "Chemical Bonding", 45),
        StudyTask("t3", "Mathematics", "Integration", 50),
    )
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

    fun setMode(m: String) {
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
        tasks.add(StudyTask("t${System.nanoTime()}", subject, topic.ifBlank { "General" }, minutes)); sheet = null
    }
    fun removeTask(id: String) { tasks.removeAll { it.id == id }; if (activeId == id) { activeId = null; running = false } }
    fun toggleDone(id: String) { val i = tasks.indexOfFirst { it.id == id }; if (i >= 0) tasks[i] = tasks[i].copy(done = !tasks[i].done) }

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

    // ── economy / battleground ──
    var coins by mutableStateOf(1250)
    var xp by mutableStateOf(1240)
    var battle by mutableStateOf("invite")            // home | invite | waiting | arena
    var battleSecs by mutableStateOf(0)
    var unreadNotifs by mutableStateOf(true)
    val prefs = mutableStateMapOf(
        "notif_focus_alerts" to true, "notif_streak" to true, "notif_battle" to true, "notif_rooms" to true, "notif_achievements" to true,
        "sound_effects" to true, "privacy_public_profile" to true, "privacy_show_streak" to true, "privacy_show_stats" to true,
        "privacy_allow_room_invites" to true, "focus_auto_start_breaks" to false, "focus_block_distractions" to true, "focus_ambient_sound" to false, "focus_strict_lock" to false,
    )

    companion object {
        val TopLevel = setOf(Dest.Home, Dest.Focus, Dest.Rooms, Dest.Battle, Dest.Comms, Dest.Schedules, Dest.Coins, Dest.Earn, Dest.Settings, Dest.More)
        fun fmt(totalSeconds: Int, hours: Boolean = false): String {
            val h = totalSeconds / 3600; val m = (totalSeconds % 3600) / 60; val s = totalSeconds % 60
            return if (hours || h > 0) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
        }
    }
}
