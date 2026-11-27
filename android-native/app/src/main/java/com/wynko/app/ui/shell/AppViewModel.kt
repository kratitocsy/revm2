package com.wynko.app.ui.shell

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.wynko.app.data.AuthRepository
import com.wynko.app.data.BattleHistoryRow
import com.wynko.app.data.BattleOpponent
import com.wynko.app.data.BattleRepository
import com.wynko.app.data.BattlegroundState
import com.wynko.app.data.ScheduleRepository
import com.wynko.app.data.SettingsProfile
import com.wynko.app.data.SettingsRepository
import com.wynko.app.data.errorText
import com.wynko.app.sync.RemoteSync
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.wynko.app.locking.ScheduleAlarms
import com.wynko.app.locking.ScheduleEnforcer
import com.wynko.app.schedule.*
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
        if (!com.wynko.app.BuildConfig.PAYMENTS_ENABLED && (d == Dest.Coins || d == Dest.Earn)) { drawerOpen = false; return }
        if (d == dest) { drawerOpen = false; return }
        // Leaving Schedules: a schedule just built with Wynky in the web pane should start enforcing now, not at the next 5-minute poll.
        if (dest == Dest.Schedules) refreshSchedules()
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
            // Schedules made anywhere (PC, web, Wynky) plus a block started on another device, mirrored onto this phone.
            val ok = RemoteSync.run(ctx, fromBackground = false)
            schedules = ScheduleStore.load(ctx)
            schedulesError = if (ok) null else "Couldn't refresh schedules; using the saved copy."
            recomputeGate()
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
                nowMs = System.currentTimeMillis()
                // Fast while a duel or invite is in play (or the page is open), slow otherwise (keeps the invite badge fresh).
                val battleHot = dest == Dest.Battle || bg?.active != null || bg?.outgoingInvite != null
                if (n % (if (battleHot) 4 else 60) == 0) refreshBattle()
                if (running) tick()
                if (qtRunning) qtTick()
                endFreePauseIfDue()
                if (n % 30 == 0) recomputeGate()
                if (n % 60 == 0) refreshSchedules() // every minute while open; a background job covers the rest
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
        forfeitBattle()
    }
    fun confirmPause() { running = false; sheet = null; forfeitBattle() }

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
        tasks.add(StudyTask("t${System.nanoTime()}", subject, topic.ifBlank { "General" }, minutes)); sheet = null
    }
    fun removeTask(id: String) {
        tasks.removeAll { it.id == id }
        // Removing the task being timed stops the timer, which counts as pausing: mid-battle that is a forfeit.
        if (activeId == id) { activeId = null; if (running) { running = false; forfeitBattle() } }
    }
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

    // ── economy ──
    var coins by mutableStateOf(1250)
    var unreadNotifs by mutableStateOf(true)

    // ── battleground: server-validated 1v1 duels (data/BattleRepository.kt) ──
    var bg by mutableStateOf<BattlegroundState?>(null); private set
    var bgError by mutableStateOf<String?>(null); private set
    var topBattlers by mutableStateOf<List<BattleOpponent>>(emptyList()); private set
    var battleHistory by mutableStateOf<List<BattleHistoryRow>>(emptyList()); private set
    var battleBusy by mutableStateOf(false); private set
    /** The battle that just ended, shown once on the hub. */
    var lastBattle by mutableStateOf<BattleHistoryRow?>(null)
    /** Wall clock, ticked every second, for countdowns and the arena timer. */
    var nowMs by mutableStateOf(System.currentTimeMillis()); private set
    private var liveBattleId: String? = null

    fun refreshBattle(full: Boolean = false) {
        viewModelScope.launch {
            try {
                val s = BattleRepository.state()
                val was = liveBattleId
                val live = s.active?.takeIf { it.status == "active" }?.id
                bg = s; bgError = null; liveBattleId = live
                if (full || topBattlers.isEmpty()) topBattlers = runCatching { BattleRepository.topBattlers() }.getOrDefault(topBattlers)
                if (full || (was != null && live == null)) {
                    battleHistory = runCatching { BattleRepository.history() }.getOrDefault(battleHistory)
                }
                if (was != null && live == null) {
                    battleHistory.firstOrNull { it.id == was }?.let { r ->
                        lastBattle = r
                        flash(if (r.result == "won") "You won! +${r.xpEarned} XP" else "Battle lost · +${r.xpEarned} XP")
                    }
                }
            } catch (e: Exception) { if (bg == null) bgError = errorText(e, "Couldn't load Battleground") }
        }
    }

    private fun battleAction(fallback: String, done: String? = null, block: suspend () -> Unit) {
        if (battleBusy) return
        battleBusy = true
        viewModelScope.launch {
            try { block(); if (done != null) flash(done) } catch (e: Exception) { flash(errorText(e, fallback)) }
            battleBusy = false
            refreshBattle()
        }
    }

    fun challenge(o: BattleOpponent) { battleAction("Couldn't send that challenge", "Challenge sent to ${o.username ?: "player"}") { BattleRepository.challenge(o.id) } }
    fun cancelChallenge(id: String) { battleAction("Couldn't cancel the challenge") { BattleRepository.cancelChallenge(id) } }
    fun respondChallenge(id: String, accept: Boolean) { battleAction("Couldn't respond to that challenge") { BattleRepository.respond(id, accept) } }
    fun readyBattle(id: String) { battleAction("Couldn't mark you ready") { BattleRepository.ready(id) } }
    fun cancelPendingBattle(id: String) { battleAction("Couldn't cancel the battle") { BattleRepository.cancelPending(id) } }
    /** Giving up, or pausing the focus timer mid-battle: the server records this player as the loser. */
    fun forfeitBattle() { val id = liveBattleId ?: return; battleAction("Couldn't update the battle") { BattleRepository.pause(id) } }

    // ── settings: the caller's own profile row and Supabase Auth (data/SettingsRepository.kt) ──
    private val localPrefs = app.getSharedPreferences("wynko_prefs", 0)
    var profile by mutableStateOf<SettingsProfile?>(null); private set
    var profileError by mutableStateOf<String?>(null); private set
    var settingsBusy by mutableStateOf(false); private set
    /** Boolean preferences. All sync with the web app except `focus_strict_lock`, which only exists on this phone. */
    val prefs = mutableStateMapOf<String, Boolean>().apply {
        putAll(SettingsRepository.PreferenceDefaults)
        put("focus_strict_lock", localPrefs.getBoolean("focus_strict_lock", false))
    }

    fun loadProfile() {
        viewModelScope.launch {
            try {
                val p = SettingsRepository.load()
                profile = p; profileError = null
                SettingsRepository.booleans(p.rawPreferences).forEach { (k, v) -> prefs[k] = v }
            } catch (e: Exception) { if (profile == null) profileError = errorText(e, "Couldn't load your settings") }
        }
    }

    private fun settingsAction(fallback: String, done: String? = null, onFail: () -> Unit = {}, block: suspend (SettingsProfile) -> Unit) {
        val p = profile
        if (p == null) { onFail(); flash("Settings are still loading"); return }
        if (settingsBusy) { onFail(); return }
        settingsBusy = true
        viewModelScope.launch {
            try { block(p); if (done != null) flash(done) } catch (e: Exception) { onFail(); flash(errorText(e, fallback)) }
            settingsBusy = false
        }
    }

    private fun mergedPreferences(p: SettingsProfile, avatar: Int? = null): JsonObject = buildJsonObject {
        p.rawPreferences.forEach { (k, v) -> put(k, v) }
        SettingsRepository.PreferenceDefaults.forEach { (k, d) -> put(k, prefs[k] ?: d) }
        if (avatar != null) put("avatar_preset", avatar)
    }

    fun setPref(key: String, value: Boolean) {
        val before = prefs[key] ?: false
        if (key == "focus_strict_lock") { prefs[key] = value; localPrefs.edit().putBoolean(key, value).apply(); return }
        settingsAction("Couldn't save that setting", onFail = { prefs[key] = before }) { p ->
            prefs[key] = value
            val next = mergedPreferences(p)
            SettingsRepository.savePreferences(p.userId, next)
            profile = p.copy(rawPreferences = next)
        }
    }

    fun setAvatar(index: Int) = settingsAction("Couldn't save your avatar", "Avatar saved") { p ->
        val next = mergedPreferences(p, index)
        SettingsRepository.savePreferences(p.userId, next)
        profile = p.copy(avatarPreset = index, rawPreferences = next)
    }

    fun saveProfile(displayName: String, username: String, bio: String, school: String, classYear: String, course: String, exam: String) {
        val wanted = username.trim().lowercase()
        if (wanted != profile?.username && !Regex("^[a-z0-9_]{3,20}$").matches(wanted)) { flash("Username: 3-20 lowercase letters, numbers or underscore"); return }
        settingsAction("Couldn't save your changes", "Profile saved") { p ->
            val stored = if (wanted != p.username) SettingsRepository.saveUsername(wanted) else p.username
            SettingsRepository.saveProfile(p.userId, displayName, bio, school, classYear, course, exam)
            profile = p.copy(displayName = displayName.trim(), username = stored, bio = bio.trim(), school = school.trim(), classYear = classYear, course = course, exam = exam.trim())
        }
    }

    fun setDailyGoal(minutes: Int) = settingsAction("Couldn't save your goal") { p ->
        SettingsRepository.saveDailyGoal(p.userId, minutes); profile = p.copy(dailyGoalMinutes = minutes)
    }
    fun setReminders(on: Boolean) = settingsAction("Couldn't save that setting") { p ->
        SettingsRepository.saveReminders(p.userId, on); profile = p.copy(remindersEnabled = on)
    }
    fun setAllowBattleInvites(on: Boolean) = settingsAction("Couldn't save that setting") { p ->
        SettingsRepository.saveAllowBattleInvites(p.userId, on); profile = p.copy(allowBattleInvites = on)
    }
    fun changeEmail(email: String) = settingsAction("Couldn't change your email", "Check your inbox for a confirmation link") {
        SettingsRepository.changeEmail(email.trim())
    }
    fun changePassword(current: String?, next: String) = settingsAction("Couldn't change your password", "Password changed") { p ->
        SettingsRepository.changePassword(p.email, current, next)
    }

    /** Blocked while a focus timer runs (here or on another device), so signing out can't be used to dodge a session. */
    fun signOut() {
        if (running) { flash("Your focus timer is running. Stop it first, then you can sign out."); return }
        viewModelScope.launch {
            val uid = profile?.userId ?: AuthRepository.currentUserId
            if (uid != null && SettingsRepository.timerRunningElsewhere(uid)) { flash("Your focus timer is running. Stop it first, then you can sign out."); return@launch }
            try { AuthRepository.signOut() } catch (e: Exception) { flash(errorText(e, "Couldn't sign out")) }
        }
    }

    fun deleteAccount() {
        sheet = null
        viewModelScope.launch {
            try { SettingsRepository.deleteAccount() } catch (e: Exception) { flash(errorText(e, "Couldn't delete your account")) }
        }
    }

    // After the state above exists: first load of the signed-in user's battles and profile.
    init { refreshBattle(full = true); loadProfile() }

    companion object {
        val TopLevel = setOf(Dest.Home, Dest.Focus, Dest.Rooms, Dest.Battle, Dest.Comms, Dest.Schedules, Dest.Coins, Dest.Earn, Dest.Settings, Dest.More)
        fun fmt(totalSeconds: Int, hours: Boolean = false): String {
            val h = totalSeconds / 3600; val m = (totalSeconds % 3600) / 60; val s = totalSeconds % 60
            return if (hours || h > 0) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
        }
    }
}
