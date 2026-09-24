import { sb } from './supabaseClient';

/* ============================================================
   Saves study time that doesn't come from a study_sessions row
   (Quick Timer, Home's Quick Timer card, and a Focus Lock clock that
   had to run local-only because the session RPC was unreachable) into
   user_profiles.study_log - the column Home's "Your Study Progress",
   tracker.html's streak and timer.html all read.

   Every entry goes through a small localStorage queue first, so time
   studied offline or right before closing the tab is sent on the next
   chance instead of lost. rpc_log_study_time (migration 0067) does the
   merge server-side in one UPDATE, so two tabs logging at once can't
   overwrite each other the way a read-modify-write would.
   ============================================================ */

export const QUICK_TIMER_SUBJECT = 'Quick Timer';
/** Fired on window after study time lands in Supabase, so Home can refresh right away. */
export const STUDY_LOGGED_EVENT = 'wynko:study-logged';

const QUEUE_KEY = 'wynko_pending_study_log_v1';

interface PendingEntry { day: string; subject: string; seconds: number }

// UTC date, same key every other study_log writer uses (toISOString().split('T')[0]).
export function studyLogDayKey(d: Date = new Date()): string {
  return d.toISOString().split('T')[0];
}

function readQueue(): PendingEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.seconds === 'number' && e.seconds > 0) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: PendingEntry[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.filter((e) => e.seconds > 0))); } catch { /* best-effort */ }
}

/** Adds `seconds` of study under `subject` for today and syncs it as soon as possible. */
export function logStudyTime(subject: string, seconds: number) {
  const secs = Math.floor(seconds);
  if (!(secs >= 1)) return;
  const day = studyLogDayKey();
  const q = readQueue();
  const hit = q.find((e) => e.day === day && e.subject === subject);
  if (hit) hit.seconds += secs;
  else q.push({ day, subject, seconds: secs });
  writeQueue(q);
  void flushStudyTimeQueue();
}

let inflight: Promise<void> | null = null;
let again = false;

/** Sends everything queued. Awaiting it waits for the send already in progress, if any. */
export function flushStudyTimeQueue(): Promise<void> {
  if (inflight) { again = true; return inflight; }
  inflight = sendQueue().finally(() => {
    inflight = null;
    if (again) { again = false; void flushStudyTimeQueue(); }
  });
  return inflight;
}

async function sendQueue(): Promise<void> {
  let logged = false;
  // The queue is shared by every open tab: hold a cross-tab lock while sending
  // so two tabs never send the same entry.
  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : null;
  const withLock = (fn: () => Promise<void>) => (locks?.request ? locks.request('wynko-study-log', fn) : fn());
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return; // kept queued until someone signs in
    await withLock(async () => {
      for (const entry of readQueue()) {
        const { error } = await sb.rpc('rpc_log_study_time', {
          p_subject: entry.subject,
          p_seconds: entry.seconds,
          p_day: entry.day,
        });
        if (error) {
          console.warn('Study time not saved yet, will retry:', error.message);
          break;
        }
        // Subtract exactly what was sent: more may have been added to the same
        // entry while the request was in flight.
        const q = readQueue();
        const same = q.find((e) => e.day === entry.day && e.subject === entry.subject);
        if (same) same.seconds -= entry.seconds;
        writeQueue(q);
        logged = true;
      }
    });
  } catch (e) {
    console.warn('Study time not saved yet, will retry:', e);
  }
  if (logged && typeof window !== 'undefined') window.dispatchEvent(new Event(STUDY_LOGGED_EVENT));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushStudyTimeQueue());
}
