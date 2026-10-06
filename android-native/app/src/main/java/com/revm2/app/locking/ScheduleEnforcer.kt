package com.revm2.app.locking

import android.content.Context
import com.revm2.app.schedule.ScheduleStore
import com.revm2.app.schedule.computeGate
import com.revm2.app.schedule.istDateKey

/**
 * Starts and ends blocking from the member's schedules on the phone itself, so a scheduled block holds even when
 * the app is closed or offline - the on-device twin of the `schedule-tick` edge function, with the same rules:
 *  - inside a slot, start that slot's saved block once per slot per day; the schedule wins over anything running
 *  - a Sleep slot blocks everything (allow-only with an empty list) and cannot be unlocked early
 *  - when the slot ends, the block ends
 *  - ending a block early does not relock the same slot that day
 * The server tick and this enforcer agree because both derive from the same rows; this one never writes to them.
 */
object ScheduleEnforcer {
    const val PREFIX = "sched-"

    fun evaluate(ctx: Context, nowMs: Long = System.currentTimeMillis()) {
        val schedules = ScheduleStore.enforceSchedules(ScheduleStore.load(ctx))
        val gate = computeGate(schedules, nowMs)
        val cur = BlockStore.current(ctx)
        val inside = gate.inside

        if (inside == null) {
            if (cur.active && cur.sessionId?.startsWith(PREFIX) == true) LockingController.endSession(ctx)
            return
        }
        val slotId = inside.slot.id ?: return
        val key = "$slotId:${istDateKey(nowMs)}"
        if (cur.active && cur.sessionId == PREFIX + key) return // already enforcing this slot
        if (ScheduleStore.hasRun(ctx, key)) return              // ended early today: don't relock

        val stored = ScheduleStore.load(ctx).flatMap { it.slots }.firstOrNull { it.id == slotId } ?: return
        val minuteStart = nowMs - nowMs % 60_000L
        val endsAt = minuteStart + inside.endsInMin * 60_000L

        if (stored.isSleep) {
            // Block everything: allow-only with nothing allowed, locked until the slot ends.
            LockingController.startSession(ctx, PREFIX + key, apps = emptyList(), domains = emptyList(), appsMode = "whitelist",
                noEarlyUnlock = true, endsAtMs = endsAt, lockSettings = true, domainsAllowOnly = true)
        } else {
            val p = stored.preset ?: return
            val strict = p.noEarlyUnlock
            LockingController.startSession(ctx, PREFIX + key,
                apps = LockingController.resolvePackages(ctx, p.apps), domains = p.sites,
                appsMode = if (p.appsMode == "whitelist") "whitelist" else "blacklist",
                noEarlyUnlock = strict, endsAtMs = endsAt, lockSettings = strict, domainsAllowOnly = p.mode == "whitelist")
        }
        ScheduleStore.markRun(ctx, key)
    }
}
