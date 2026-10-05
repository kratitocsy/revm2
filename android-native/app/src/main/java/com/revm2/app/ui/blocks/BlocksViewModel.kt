package com.revm2.app.ui.blocks

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.revm2.app.data.*
import com.revm2.app.locking.LockingController
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

data class BlocksUiState(
    val loading: Boolean = true,
    val presets: List<FocusPreset> = emptyList(),
    val active: FocusSession? = null,
    val remainingSeconds: Long? = null, // null = unlimited
    val error: String? = null,
)

class BlocksViewModel : ViewModel() {
    private val _state = MutableStateFlow(BlocksUiState())
    val state: StateFlow<BlocksUiState> = _state

    init {
        viewModelScope.launch {
            while (true) { // 1s tick for the countdown + auto-finish at ends_at
                delay(1000)
                _state.update { s ->
                    val end = s.active?.endsAt?.let { Instant.parse(it) } ?: return@update s
                    s.copy(remainingSeconds = (end.epochSecond - Instant.now().epochSecond).coerceAtLeast(0))
                }
            }
        }
    }

    fun refresh(ctx: Context) = launchCatching {
        LockingController.consumeTamper(ctx)?.let { _state.update { st -> st.copy(error = "Last session unverified: $it") } }
        val presets = FocusRepository.presets()
        val active = FocusRepository.activeSession()
        // Keep on-device enforcement in step with the server row (covers a session started elsewhere or already ended).
        if (active != null && !LockingController.sessionState(ctx).active) enforce(ctx, active)
        if (active == null && LockingController.sessionState(ctx).let { it.active && it.sessionId?.startsWith("sched-") != true }) LockingController.endSession(ctx)
        _state.update { it.copy(loading = false, presets = presets, active = active, remainingSeconds = remaining(active), error = null) }
    }

    fun start(ctx: Context, p: FocusPreset) = startRaw(ctx, p.name, p.sites, p.mode, p.apps, p.appsMode, p.durationMinutes, p.noEarlyUnlock)

    fun startRaw(
        ctx: Context, name: String, sites: List<String>, mode: String, apps: List<String>, appsMode: String,
        minutes: Int?, strict: Boolean,
    ) = launchCatching {
        if (appsMode == "whitelist" && apps.isEmpty()) error("\"$name\" allows only specific apps but has none saved.")
        val s = FocusRepository.startSession(name, sites, mode, apps, appsMode, minutes, strict)
        enforce(ctx, s) // server row first so a rejected duplicate never starts local enforcement
        _state.update { it.copy(active = s, remainingSeconds = remaining(s), error = null) }
    }

    /** Returns via callback whether the stop was allowed. */
    fun stop(ctx: Context) = launchCatching {
        val a = _state.value.active ?: return@launchCatching
        if (a.noEarlyUnlock && (_state.value.remainingSeconds ?: 1) > 0) {
            error("This block was started with early unlock turned off. It can only be waited out.")
        }
        FocusRepository.stopSession(verified = false)
        LockingController.endSession(ctx)
        _state.update { it.copy(active = null, remainingSeconds = null) }
    }

    fun finishIfExpired(ctx: Context) = launchCatching {
        val a = _state.value.active ?: return@launchCatching
        if (a.endsAt != null && (_state.value.remainingSeconds ?: 1) <= 0) {
            FocusRepository.stopSession(verified = true)
            LockingController.endSession(ctx)
            _state.update { it.copy(active = null, remainingSeconds = null) }
        }
    }

    fun createPreset(ctx: Context, p: NewFocusPreset) = launchCatching {
        FocusRepository.createPreset(p)
        refresh(ctx)
    }

    fun deletePreset(ctx: Context, id: String) = launchCatching {
        FocusRepository.deletePreset(id)
        refresh(ctx)
    }

    fun clearError() = _state.update { it.copy(error = null) }

    private fun enforce(ctx: Context, s: FocusSession) = LockingController.startSession(
        ctx, s.id, apps = s.apps, domains = s.sites, appsMode = s.appsMode, noEarlyUnlock = s.noEarlyUnlock, domainsAllowOnly = s.mode == "whitelist",
        endsAtMs = s.endsAt?.let { Instant.parse(it).toEpochMilli() } ?: 0L,
    )

    private fun remaining(s: FocusSession?): Long? =
        s?.endsAt?.let { (Instant.parse(it).epochSecond - Instant.now().epochSecond).coerceAtLeast(0) }

    private fun launchCatching(block: suspend () -> Unit) {
        viewModelScope.launch {
            try { block() } catch (e: Exception) {
                val msg = e.message ?: "Something went wrong"
                _state.update {
                    it.copy(loading = false, error = if ("23505" in msg || "duplicate" in msg.lowercase()) "You already have a block running." else msg)
                }
            }
        }
    }
}
