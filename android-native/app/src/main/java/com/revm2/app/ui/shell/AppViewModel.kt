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
import io.github.jan.supabase.auth.auth
import kotlinx.serialization.json.JsonObject
import com.revm2.app.locking.ScheduleAlarms
import com.revm2.app.locking.ScheduleEnforcer
import com.revm2.app.schedule.*
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class Dest { Home, Focus, Schedules, Rooms, Room, Comms, CommStudent, CommManage, Battle, Coins, Earn, Settings, More, Quick, BlockLists }

enum class SheetKind { FreePause, Gate, Pause, AddTask, Pomodoro, Notifications, Password, DeleteAccount, AiAssistant, Routine, Challenge, CreateRoom, NewAnnouncement, CreateCommunity }

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
                ScheduleEnforcer.evaluate(ctx); ScheduleAlarms.rearm(ctx); ScheduleAlarms.armSync(ctx)
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
                syncTimerState()
                if (n % 30 == 0) pullPlan()
                if (n % 60 == 0) { refreshNotifs(); refreshProgress() }
                if (dest == Dest.Room && n % 10 == 0) refreshRoom()
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
        // Same user_profiles.pomodoro_settings the web and desktop read.
        viewModelScope.launch { runCatching { AppRepository.savePomodoro(AppRepository.Pomodoro(focus, brk, repeat, auto)) } }
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
    /** Quick Timer seconds already sent to study_log (as "Quick Timer", like the web). */
    private var qtLogged = 0
    private fun qtLog() {
        val secs = (qtTotal - qtRemaining) - qtLogged
        if (secs <= 0) return
        qtLogged += secs
        viewModelScope.launch { StudyRepository.logTime(ctx, "Quick Timer", secs); refreshProgress() }
    }
    private fun qtTick() { if (qtRemaining > 0) qtRemaining-- else { qtRunning = false; qtLog() } }
    fun qtToggle() {
        if (qtRemaining == 0) { qtRemaining = qtTotal; qtLogged = 0 }
        qtRunning = !qtRunning
        if (!qtRunning) qtLog()
    }
    fun qtSet(minutes: Int) { if (qtRunning) qtLog(); qtTotal = minutes * 60; qtRemaining = qtTotal; qtRunning = false; qtLogged = 0 }

    // ── blocking (design shows names; the real list comes from the locking plugin) ──
    val blockedApps = mutableStateListOf("Instagram", "YouTube", "Snapchat", "BGMI")
    val blockedSites = mutableStateListOf("reddit.com")
    fun toggleApp(name: String) { if (!blockedApps.remove(name)) blockedApps.add(name) }

    // ── study rooms (same RPCs as the web's lib/studyRooms.ts) ──
    var rooms by mutableStateOf<List<RoomRow>>(emptyList()); private set
    var currentRoomId by mutableStateOf<String?>(null)
    var roomFrom by mutableStateOf(Dest.Rooms)
    var pendingRoomId by mutableStateOf<String?>(null)
    var roomMembers by mutableStateOf<List<RoomMemberRow>>(emptyList()); private set
    var roomMessages by mutableStateOf<List<RoomMessageRow>>(emptyList()); private set
    val currentRoom: RoomRow? get() = rooms.firstOrNull { it.id == currentRoomId }

    fun refreshRooms() { viewModelScope.launch { try { rooms = SocialRepository.rooms() } catch (_: Exception) {} } }
    fun openRoom(id: String, from: Dest) {
        currentRoomId = id; roomFrom = from; roomMembers = emptyList(); roomMessages = emptyList()
        go(Dest.Room); refreshRoom()
    }
    fun refreshRoom() {
        val id = currentRoomId ?: return
        viewModelScope.launch {
            try { roomMembers = SocialRepository.roomMembers(id) } catch (_: Exception) {}
            try { roomMessages = SocialRepository.roomMessages(id) } catch (_: Exception) {}
        }
    }
    /** Join (password for private rooms), then open it. */
    fun joinRoom(id: String, password: String? = null, onWrongPassword: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                when (SocialRepository.joinRoom(id, password)) {
                    "joined", "already_member" -> { sheet = null; refreshRooms(); openRoom(id, Dest.Rooms) }
                    "wrong_password" -> onWrongPassword()
                    "full" -> flash("This room is full")
                    else -> flash("This room is invite-only")
                }
            } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't join the room") }
        }
    }
    fun leaveRoom(id: String) {
        viewModelScope.launch { try { SocialRepository.leaveRoom(id); refreshRooms(); back() } catch (e: Exception) { flash("Couldn't leave the room") } }
    }
    fun createRoom(name: String, subject: String, desc: String, isPublic: Boolean, password: String) {
        viewModelScope.launch {
            try { val id = SocialRepository.createRoom(name, subject, desc, isPublic, password); sheet = null; refreshRooms(); openRoom(id, Dest.Rooms) }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't create the room") }
        }
    }
    fun sendRoomMessage(text: String) {
        val id = currentRoomId ?: return
        viewModelScope.launch { try { SocialRepository.sendRoomMessage(id, text.trim()); refreshRoom() } catch (e: Exception) { flash("Message not sent") } }
    }

    // ── communities (same RPCs as the web's lib/communities.ts) ──
    var communities by mutableStateOf<List<MyCommunityRow>>(emptyList()); private set
    var discover by mutableStateOf<List<DiscoverRow>>(emptyList()); private set
    var communitySchedules by mutableStateOf<List<CommunityScheduleRow>>(emptyList()); private set
    var currentCommunityId by mutableStateOf("")
    var communityDetail by mutableStateOf<CommunityDetail?>(null); private set
    var announcements by mutableStateOf<List<AnnouncementRow>>(emptyList()); private set
    var headOverview by mutableStateOf<HeadOverview?>(null); private set
    var students by mutableStateOf<List<StudentRow>>(emptyList()); private set
    var joinRequests by mutableStateOf<List<JoinRequestRow>>(emptyList()); private set
    val homeCommunity: MyCommunityRow? get() = communities.firstOrNull { it.isHome == true }
    val currentCommunity: MyCommunityRow? get() = communities.firstOrNull { it.id == currentCommunityId }

    fun refreshCommunities() {
        viewModelScope.launch {
            try { communities = SocialRepository.myCommunities() } catch (_: Exception) {}
            try { discover = SocialRepository.discover() } catch (_: Exception) {}
            try { communitySchedules = SocialRepository.mySchedules() } catch (_: Exception) {}
        }
    }
    fun openCommunity(id: String, manage: Boolean) {
        currentCommunityId = id; communityDetail = null; announcements = emptyList(); headOverview = null; students = emptyList(); joinRequests = emptyList()
        go(if (manage) Dest.CommManage else Dest.CommStudent)
        viewModelScope.launch {
            try { communityDetail = SocialRepository.detail(id) } catch (_: Exception) {}
            try { announcements = SocialRepository.announcements(id) } catch (_: Exception) {}
            if (manage) {
                try { headOverview = SocialRepository.headOverview(id) } catch (_: Exception) {}
                try { students = SocialRepository.studentAnalytics(id) } catch (_: Exception) {}
                try { joinRequests = SocialRepository.joinRequests(id) } catch (_: Exception) {}
            }
        }
    }
    private fun joinMessage(status: String) = when (status) {
        "joined" -> "You joined the community"; "requested" -> "Request sent — you'll join once the WynkoHead approves it"
        "already_member" -> "You're already a member"; "full" -> "This community is full"
        "password_required" -> "This community needs its password (join it on the web)"; "wrong_password" -> "Wrong password"
        else -> "That invite isn't valid"
    }
    fun joinCommunity(id: String) {
        viewModelScope.launch { try { flash(joinMessage(SocialRepository.joinCommunity(groupId = id))); refreshCommunities() } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't join") } }
    }
    fun joinCommunityByCode(input: String) {
        viewModelScope.launch { try { flash(joinMessage(SocialRepository.joinCommunity(token = SocialRepository.parseInvite(input)))); refreshCommunities() } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't join") } }
    }
    fun leaveCommunity(id: String) {
        val name = communities.firstOrNull { it.id == id }?.name
        viewModelScope.launch {
            try {
                SocialRepository.leaveCommunity(id)
                if (name != null) PlanWriter.releaseCommunitySchedule(ctx, name)
                refreshCommunities(); refreshSchedules(); go(Dest.Comms)
            } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't leave") }
        }
    }
    fun setHomeCommunity(id: String) {
        viewModelScope.launch { try { SocialRepository.setHomeCommunity(id); flash("Home Community changed"); refreshCommunities() } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't change your Home Community") } }
    }
    fun createCommunity(name: String, description: String) {
        viewModelScope.launch {
            try { val id = SocialRepository.createCommunity(name, description, null); refreshCommunities(); openCommunity(id, manage = true) }
            catch (e: Exception) { flash(e.message?.take(100) ?: "Only verified WynkoHeads can create a community") }
        }
    }
    /** Accept: the week becomes real Focus Lock schedules (own schedules paused). Reject: back to your own. */
    fun decideCommunitySchedule(row: CommunityScheduleRow, accept: Boolean) {
        viewModelScope.launch {
            try {
                SocialRepository.setScheduleChoice(row.groupId, if (accept) "accepted" else "rejected")
                if (accept) PlanWriter.enforceCommunitySchedule(ctx, row.name, row.week) else PlanWriter.releaseCommunitySchedule(ctx, row.name)
                flash(if (accept) "Schedule synced to your Focus Lock" else "You're back on your own schedule")
                communitySchedules = SocialRepository.mySchedules(); refreshSchedules()
            } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't save your choice") }
        }
    }
    fun postAnnouncement(title: String, message: String, pinned: Boolean, important: Boolean) {
        val id = currentCommunityId
        viewModelScope.launch {
            try { SocialRepository.postAnnouncement(id, title, message, pinned, important); sheet = null; announcements = SocialRepository.announcements(id) }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't post") }
        }
    }
    fun deleteAnnouncement(annId: String) {
        viewModelScope.launch { try { SocialRepository.deleteAnnouncement(annId); announcements = announcements.filter { it.id != annId } } catch (e: Exception) { flash("Couldn't delete") } }
    }
    fun decideJoinRequest(reqId: String, approve: Boolean) {
        viewModelScope.launch {
            try { SocialRepository.decideJoinRequest(reqId, approve); joinRequests = joinRequests.filter { it.id != reqId }; refreshCommunities() }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't update that request") }
        }
    }
    fun setRequiresApproval(value: Boolean) {
        val id = currentCommunityId
        viewModelScope.launch { try { SocialRepository.setRequiresApproval(id, value); refreshCommunities() } catch (e: Exception) { flash("Couldn't change that setting") } }
    }

    // ── study time + shared plan (web/desktop see the same session and running task) ──
    var progress by mutableStateOf<StudyProgress?>(null); private set
    fun refreshProgress() { viewModelScope.launch { try { progress = StudyRepository.progress() } catch (_: Exception) {} } }

    private var sessionId: String? = null
    private var lastRunning = false
    private var lastActiveId: String? = null
    /** Set when a change came from another device, so it isn't written back. */
    private var remoteDriven = false
    private var lastRemotePlanMs = 0L

    private fun currentProgress() = TaskProgress(mode, phase, phaseTotal, remaining, elapsed)

    /** Called every second: reacts to the timer starting, pausing or switching task. */
    private fun syncTimerState() {
        if (running == lastRunning && activeId == lastActiveId) return
        val wasRunning = lastRunning
        lastRunning = running; lastActiveId = activeId
        val fromRemote = remoteDriven; remoteDriven = false
        val task = activeTask
        viewModelScope.launch {
            // Study session: stop the old one on pause / task switch, start one while running here.
            sessionId?.let { id -> sessionId = null; runCatching { StudyRepository.stopSession(id) } }
            if (running && task != null && !fromRemote) {
                sessionId = StudyRepository.startSession(task.subject, if (dest == Dest.Room) currentRoomId else null)
            }
            if (!fromRemote) runCatching { StudyRepository.savePlan(activeId, running, currentProgress()) }
            if (wasRunning && !running) refreshProgress()
        }
    }

    /** Follows a start / pause made on the web or desktop. */
    private fun pullPlan() {
        viewModelScope.launch {
            try {
                val remote = AppRepository.tasks()
                if (remote.map { it.id }.toSet() != tasks.map { it.id }.toSet() || remote.zip(tasks).any { (a, b) -> a.done != b.done }) {
                    tasks.clear(); tasks.addAll(remote)
                }
                val ps = StudyRepository.planState() ?: return@launch
                if (ps.updatedBy == StudyRepository.clientId || ps.updatedAtMs <= lastRemotePlanMs) return@launch
                lastRemotePlanMs = ps.updatedAtMs
                if (ps.running && ps.activeTaskId != null && tasks.any { it.id == ps.activeTaskId }) {
                    val tp = StudyRepository.taskProgress(ps.activeTaskId) ?: return@launch
                    val since = ps.anchorMs?.let { ((System.currentTimeMillis() - it) / 1000).toInt() } ?: 0
                    remoteDriven = true
                    activeId = ps.activeTaskId; mode = if (tp.mode == "regular") "regular" else "pomodoro"; phase = tp.phase ?: "focus"
                    if (mode == "regular") elapsed = tp.elapsed + since else remaining = (tp.remaining - since).coerceAtLeast(1)
                    running = true
                } else if (!ps.running && running) {
                    remoteDriven = true; running = false
                }
            } catch (_: Exception) {}
        }
    }

    // ── Wynky (same chat history, AI chat mode, memory and plan tables as the web) ──
    val wynkyMsgs = mutableStateListOf<WynkyMsg>()
    var wynkyBusy by mutableStateOf(false); private set
    var wynkyPlan by mutableStateOf<WynkyAnswer?>(null); private set
    fun openWynky() {
        sheet = SheetKind.AiAssistant
        viewModelScope.launch {
            try { val h = WynkyRepository.history(); wynkyMsgs.clear(); wynkyMsgs.addAll(h) } catch (_: Exception) {}
            if (wynkyMsgs.isEmpty()) wynkyMsgs.add(WynkyMsg(true, "Hi! I'm Wynky 🐧 Tell me how you want your study week to look, and I'll plan it with you."))
        }
    }
    fun sendWynky(text: String) {
        val t = text.trim(); if (t.isEmpty() || wynkyBusy) return
        val history = wynkyMsgs.toList()
        wynkyMsgs.add(WynkyMsg(false, t)); wynkyBusy = true
        viewModelScope.launch {
            runCatching { WynkyRepository.remember(false, t) }
            try {
                val a = WynkyRepository.chat(t, history, schedules)
                wynkyMsgs.add(WynkyMsg(true, a.reply)); runCatching { WynkyRepository.remember(true, a.reply) }
                wynkyPlan = a.takeIf { it.days.values.any { d -> d.isNotEmpty() } }
            } catch (e: Exception) {
                wynkyMsgs.add(WynkyMsg(true, "I couldn't do that just now (${e.message?.take(120) ?: "the AI is not available"}). Please try again in a moment."))
            }
            wynkyBusy = false
        }
    }
    fun saveWynkyPlan() {
        val plan = wynkyPlan ?: return
        wynkyBusy = true
        viewModelScope.launch {
            try {
                PlanWriter.saveWynkyPlan(plan.days, plan.activeDays)
                wynkyPlan = null
                val msg = "✅ Saved. Focus Lock follows this plan on every device."
                wynkyMsgs.add(WynkyMsg(true, msg)); runCatching { WynkyRepository.remember(true, msg) }
                refreshSchedules()
            } catch (e: Exception) { wynkyMsgs.add(WynkyMsg(true, e.message ?: "Couldn't save the plan.")) }
            wynkyBusy = false
        }
    }
    fun clearWynky() {
        viewModelScope.launch { try { WynkyRepository.clearHistory(); wynkyMsgs.clear(); wynkyPlan = null } catch (_: Exception) { flash("Couldn't clear your history") } }
    }

    // ── shop (coins are spent server-side; buying coins is web-only) ──
    var shopItems by mutableStateOf<List<ShopItemRow>>(emptyList()); private set
    fun redeem(item: ShopItemRow) {
        viewModelScope.launch {
            try { PaymentsRepository.redeem(item.id); coins = AppRepository.coins(); flash("${item.name} redeemed") }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't redeem that") }
        }
    }

    // ── routines = Focus Lock presets (same table as blocks.html / desktop) ──
    var routines by mutableStateOf<List<FocusPreset>>(emptyList()); private set
    fun refreshRoutines() { viewModelScope.launch { try { routines = FocusRepository.presets() } catch (_: Exception) {} } }
    fun createRoutine(name: String, apps: List<String>, sites: List<String>) {
        val uid = profile?.id ?: return
        viewModelScope.launch {
            try { FocusRepository.createPreset(NewFocusPreset(uid, name.trim(), sites, "blacklist", apps, "blacklist", false, null)); sheet = null; refreshRoutines(); flash("Routine saved") }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't save the routine") }
        }
    }

    // ── account data (Supabase) ──
    var profile by mutableStateOf<Profile?>(null); private set
    var coins by mutableStateOf(0); private set
    val xp: Int get() = hub?.xp ?: profile?.battleXp ?: 0
    var hub by mutableStateOf<BattleHub?>(null); private set
    var leaderboard by mutableStateOf<List<Battler>>(emptyList()); private set
    var battleHistory by mutableStateOf<List<BattleResult>>(emptyList()); private set
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
                avatarPreset = (p.preferences["avatar_preset"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()?.takeIf { it in 0..5 } ?: 0
                AppRepository.pomodoro()?.takeIf { it.updatedAt > 0 }?.let { pm ->
                    pomoFocus = pm.focusMinutes; pomoBreak = pm.breakMinutes; pomoRepeat = pm.repeat; pomoAuto = pm.autoStartBreaks
                    if (!running && mode == "pomodoro" && phase == "focus") remaining = pm.focusMinutes * 60
                }
                val remote = AppRepository.tasks()
                tasks.clear(); tasks.addAll(remote)
                accountError = null
            } catch (e: Exception) { accountError = "Couldn't load your account; showing what we have." }
            refreshNotifs(); refreshBattle(); refreshProgress(); refreshRooms(); refreshCommunities(); refreshRoutines()
            try { shopItems = PaymentsRepository.shopItems() } catch (_: Exception) {}
            runCatching { StudyRepository.flushTime(ctx) }
            pullPlan()
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

    /** Same server-side delete as web Settings (delete_my_account), then sign out. */
    fun deleteAccount() {
        viewModelScope.launch {
            try { AppRepository.deleteAccount(); sheet = null; AuthRepository.signOut() }
            catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't delete your account") }
        }
    }

    // ── account extras (same calls as web Settings / Earn) ──
    var avatarPreset by mutableStateOf(0); private set
    /** Sign-in methods on this account ("email", "google", "discord"...). Linking new ones is done on the web. */
    val linkedProviders: List<String> get() = runCatching {
        Supabase.client.auth.currentUserOrNull()?.identities?.map { it.provider }.orEmpty()
    }.getOrDefault(emptyList())
    fun setAvatar(i: Int) {
        val old = avatarPreset; avatarPreset = i
        viewModelScope.launch {
            try { AppRepository.saveAvatarPreset(profile?.preferences ?: JsonObject(emptyMap()), i); profile = AppRepository.profile(); flash("Avatar saved") }
            catch (e: Exception) { avatarPreset = old; flash("Couldn't save your avatar") }
        }
    }
    fun changeEmail(email: String) {
        viewModelScope.launch { try { AppRepository.changeEmail(email); flash("Check both inboxes to confirm the change") } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't change your email") } }
    }
    fun changePassword(current: String, next: String) {
        viewModelScope.launch { try { AppRepository.changePassword(current, next); flash("Password updated") } catch (e: Exception) { flash(e.message?.take(80) ?: "Couldn't change your password") } }
    }
    var referrals by mutableStateOf<AppRepository.Referrals?>(null); private set
    var wynkoHead by mutableStateOf("none"); private set
    fun refreshEarn() {
        viewModelScope.launch {
            try { referrals = AppRepository.referrals() } catch (_: Exception) {}
            try { wynkoHead = AppRepository.wynkoHeadStatus() } catch (_: Exception) {}
        }
    }
    fun applyWynkoHead() {
        viewModelScope.launch { try { AppRepository.applyWynkoHead(); wynkoHead = AppRepository.wynkoHeadStatus(); flash("Application submitted") } catch (e: Exception) { flash(e.message?.take(100) ?: "Couldn't submit your application") } }
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
