/* ============================================================
   This mirrors tracker.html's data model exactly, on purpose:
   `user_profiles.tracker_data` is a JSON array of these rows,
   ALREADY read/written by tracker.html, timer.html and home.html
   (see src/features/tracker/tracker-sync.js). Every React app in
   src/apps/ that needs real topic/retention data reads and writes
   the same rows through this file, rather than each app inventing
   its own copy of the retention math.

   IMPORTANT — this is a day-indexed model, not a topic list:
   tracker.html's buildRows() creates exactly one row per calendar
   day from the user's exam start_date to end_date (see tracker.html
   ~line 782), each with an empty `topic` until the user fills it
   in for that day. There is currently no "add another topic for
   today" — one row per day is a real constraint of the existing
   schema, not something invented here.

   That matters for how `applyAddTopic` behaves: it fills in
   *today's* row rather than pushing a new one, to avoid breaking
   that invariant (things like the 30-day heatmap and
   computeAvgStrengthOnDate in tracker.html assume rows.length
   matches the day range). If a UI collects more than one topic at
   once (desktop-dashboard's QuickAddUnit does), they're joined into
   one string for today's row rather than silently dropped — see
   applyAddTopic's `topics: string[]` parameter.
   ============================================================ */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TopicStatus = 'NOT DUE YET' | 'DUE TODAY' | 'OVERDUE';

export interface Topic {
  id: number;
  name: string;
  subject: string;
  retention: number;
  priority: Priority;
  status: TopicStatus;
  nextReview: string;
  addedAt: number; // timestamp
}

// index-aligned with doneCount (0..7) — same order as INTERVAL_DAYS below
export const NEXT_REVIEW_LABELS = [
  '5 min from now', '+12h review', '+1D review', '+2D review',
  '+4D review', '+7D review', '+15D review', '+30D review',
];

export function calcPriority(retention: number): Priority {
  return retention < 40 ? 'HIGH' : retention < 70 ? 'MEDIUM' : 'LOW';
}

export interface TrackerRow {
  no: number;
  date: string; // 'YYYY-MM-DD'
  topic: string;
  subject: string;
  r0: boolean; r1: boolean; r2: boolean; r3: boolean;
  r4: boolean; r5: boolean; r6: boolean; r7: boolean;
}

const INTERVAL_KEYS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'] as const;
type IntervalKey = (typeof INTERVAL_KEYS)[number];
// Same days-offsets as tracker.html's INTERVALS (src/lib/utils.js).
const INTERVAL_DAYS = [0, 0.5, 1, 2, 4, 7, 15, 30];

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/** Ebbinghaus-style strength estimate — ported verbatim from
 *  tracker.html's computeTopicStrength() so retention numbers match
 *  what the rest of the app already shows for the same row. */
function computeStrength(row: TrackerRow, asOf: Date): { strength: number; overdueDays: number; nextDue: Date | null } {
  const doneCount = INTERVAL_KEYS.filter((k) => row[k]).length;
  const baseline = (doneCount / INTERVAL_KEYS.length) * 100;
  if (doneCount >= INTERVAL_KEYS.length) return { strength: 100, overdueDays: 0, nextDue: null };
  const rd = new Date(row.date + 'T00:00:00');
  const nextDue = new Date(rd.getTime() + INTERVAL_DAYS[doneCount] * 86400000);
  const overdueDays = Math.max(0, (asOf.getTime() - nextDue.getTime()) / 86400000);
  const strength = overdueDays > 0 ? baseline * Math.exp(-overdueDays / 6) : baseline;
  return { strength, overdueDays, nextDue };
}

function statusFor(overdueDays: number, nextDue: Date | null, asOf: Date): TopicStatus {
  if (nextDue === null) return 'NOT DUE YET'; // fully reviewed
  if (overdueDays > 0) return 'OVERDUE';
  const dueStr = nextDue.toISOString().split('T')[0];
  const asOfStr = asOf.toISOString().split('T')[0];
  return dueStr <= asOfStr ? 'DUE TODAY' : 'NOT DUE YET';
}

/** Converts one tracker_data row into the Topic shape MobileHome.tsx
 *  renders. Returns null for template rows with no topic filled in
 *  yet (nothing to show for those). */
export function rowToTopic(row: TrackerRow, asOf: Date = new Date()): Topic | null {
  if (!row.topic) return null;
  const { strength, overdueDays, nextDue } = computeStrength(row, asOf);
  const doneCount = INTERVAL_KEYS.filter((k) => row[k]).length;
  return {
    id: row.no,
    name: row.topic,
    subject: row.subject,
    retention: Math.round(strength),
    priority: calcPriority(strength),
    status: statusFor(overdueDays, nextDue, asOf),
    nextReview: doneCount >= INTERVAL_KEYS.length ? 'Fully reviewed' : NEXT_REVIEW_LABELS[doneCount],
    addedAt: new Date(row.date + 'T00:00:00').getTime(),
  };
}

export function rowsToTopics(rows: TrackerRow[], asOf: Date = new Date()): Topic[] {
  return rows
    .map((r) => rowToTopic(r, asOf))
    .filter((t): t is Topic => t !== null)
    .sort((a, b) => b.addedAt - a.addedAt);
}

// ── desktop-dashboard's ReviewItem shape ──────────────────────────
// Same underlying data as Topic above, different field names/levels
// to match DesktopDashboard.tsx's existing ReviewQueue component
// (urgency has 3 levels — high/medium/low — mapped from retention,
// same thresholds as calcPriority but inverted naming).
export interface ReviewItem {
  key: string; // `${row.no}` — stable id for React keys / dismiss-tracking
  subject: string;
  topic: string;
  retention: number;
  daysAgo: number;
  urgency: 'high' | 'medium' | 'low';
}

function urgencyFor(retention: number): 'high' | 'medium' | 'low' {
  return retention < 40 ? 'high' : retention < 70 ? 'medium' : 'low';
}

export function rowToReviewItem(row: TrackerRow, asOf: Date = new Date()): ReviewItem | null {
  if (!row.topic) return null;
  const { strength, overdueDays } = computeStrength(row, asOf);
  const rd = new Date(row.date + 'T00:00:00');
  const daysAgo = Math.max(0, Math.round((asOf.getTime() - rd.getTime()) / 86400000));
  return {
    key: `${row.no}`,
    subject: row.subject,
    topic: row.topic,
    retention: Math.round(strength),
    daysAgo,
    urgency: urgencyFor(strength),
  };
}

export function rowsToReviewItems(rows: TrackerRow[], asOf: Date = new Date()): ReviewItem[] {
  return rows
    .map((r) => rowToReviewItem(r, asOf))
    .filter((i): i is ReviewItem => i !== null)
    .sort((a, b) => a.retention - b.retention);
}

/** Fill in today's row with a new topic/subject. If today's row
 *  already has a topic, this overwrites it — see the note at the
 *  top of this file about the one-row-per-day constraint.
 *  `topics` may have more than one entry (desktop-dashboard's
 *  QuickAddUnit collects several) — they're joined into one string
 *  since a row only has a single `topic` field. */
export function applyAddTopic(rows: TrackerRow[], subject: string, topics: string | string[]): TrackerRow[] {
  const topicName = Array.isArray(topics) ? topics.join(', ') : topics;
  const today = todayStr();
  const idx = rows.findIndex((r) => r.date === today);
  if (idx === -1) {
    // No row for today — the user's exam date range (start_date/end_date)
    // doesn't cover today. Nothing to safely write to.
    return rows;
  }
  const next = [...rows];
  next[idx] = { ...next[idx], topic: topicName, subject };
  return next;
}

/** Clears a row's topic (id === row.no) rather than deleting the row,
 *  preserving the one-row-per-day invariant tracker.html relies on. */
export function applyRemoveTopic(rows: TrackerRow[], id: number): TrackerRow[] {
  return rows.map((r) =>
    r.no === id ? { ...r, topic: '', r0: false, r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false } : r
  );
}

/** Removes the most recent row whose topic/subject match — used by
 *  desktop-dashboard's QuickAddUnit "remove by subject" UI, which
 *  doesn't track a row id, only the subject name. */
export function applyRemoveTopicBySubject(rows: TrackerRow[], subject: string): TrackerRow[] {
  const idx = [...rows].reverse().findIndex((r) => r.subject.toLowerCase() === subject.toLowerCase() && r.topic);
  if (idx === -1) return rows;
  const realIdx = rows.length - 1 - idx;
  const next = [...rows];
  next[realIdx] = { ...next[realIdx], topic: '', r0: false, r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false };
  return next;
}

/** Marks the next not-yet-done interval complete for a row, same
 *  effect as checking the next box in tracker.html's table. */
export function applyMarkReviewed(rows: TrackerRow[], id: number): TrackerRow[] {
  return rows.map((r) => {
    if (r.no !== id) return r;
    const nextKey = INTERVAL_KEYS.find((k) => !r[k]);
    if (!nextKey) return r; // already fully reviewed
    return { ...r, [nextKey]: true };
  });
}
