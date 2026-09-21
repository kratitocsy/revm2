// Mock data for the WynkoHead community-management dashboard (students,
// earnings, join requests). Typed and self-contained so it can be swapped for
// real queries later without touching the UI. Amounts are in ₹ and use the
// same revenue-share model as the Earn page: a flat 50% share on everything
// a WynkoHead's community spends on Wynko (no sub-WynkoHead tier).

// The community this WynkoHead runs (id in ALL_COMMUNITIES).
export const HEAD_COMMUNITY_ID = 1

export interface HeadStudent {
  id: string
  name: string
  initials: string
  color: string // avatar accent, any CSS colour
  studyMinutes: number // this month
  sessions: number
  streakDays: number
  revision: number
  tasks: number
  lastActiveMins: number // minutes since last seen
  adherencePct: number
}

const grad = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`
const S = (
  id: string, name: string, color: string,
  studyMinutes: number, sessions: number, streakDays: number, revision: number, tasks: number,
  lastActiveMins: number, adherencePct: number,
): HeadStudent => ({
  id, name, initials: name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  color, studyMinutes, sessions, streakDays, revision, tasks, lastActiveMins, adherencePct,
})

export const HEAD_STUDENTS: HeadStudent[] = [
  S('s1', 'Ananya Sharma', grad('#EC4899', '#BE185D'), 2550, 18, 6, 8, 12, 120, 78),
  S('s2', 'Rohit Kumar', grad('#3B82F6', '#1D4ED8'), 2172, 15, 4, 6, 10, 240, 65),
  S('s3', 'Sneha Patel', grad('#19D3A2', '#0A9673'), 1725, 12, 3, 5, 8, 360, 52),
  S('s4', 'Aman Verma', grad('#7C4DFF', '#4C2E9E'), 1520, 10, 2, 4, 7, 480, 46),
  S('s5', 'Priya Singh', grad('#F59E0B', '#B45309'), 1090, 8, 1, 3, 5, 720, 32),
  S('s6', 'Vikram Rathore', grad('#22D3EE', '#0E7490'), 2380, 17, 9, 9, 13, 45, 88),
  S('s7', 'Kavya Meena', grad('#A78BFA', '#6D28D9'), 1960, 14, 5, 7, 9, 190, 71),
  S('s8', 'Harsh Gupta', grad('#F472B6', '#9D174D'), 1310, 9, 2, 3, 6, 1500, 41),
  S('s9', 'Ishita Jain', grad('#34D399', '#047857'), 2260, 16, 7, 8, 11, 75, 83),
  S('s10', 'Devansh Yadav', grad('#60A5FA', '#1E40AF'), 640, 5, 0, 1, 3, 4320, 24),
  S('s11', 'Riya Choudhary', grad('#FBBF24', '#B45309'), 1840, 13, 4, 6, 9, 300, 68),
  S('s12', 'Mohit Saini', grad('#C084FC', '#7E22CE'), 980, 7, 1, 2, 4, 2880, 36),
]

export interface HeadJoinRequest {
  id: string
  name: string
  initials: string
  color: string
  note: string
  requestedAgo: string
}

export const HEAD_JOIN_REQUESTS: HeadJoinRequest[] = [
  { id: 'r1', name: 'Tanvi Agarwal', initials: 'TA', color: grad('#EC4899', '#BE185D'), note: 'JEE 2026 aspirant · Kota', requestedAgo: '2 hours ago' },
  { id: 'r2', name: 'Yash Solanki', initials: 'YS', color: grad('#3B82F6', '#1D4ED8'), note: 'JEE 2026 droppers batch', requestedAgo: '5 hours ago' },
  { id: 'r3', name: 'Muskan Khan', initials: 'MK', color: grad('#19D3A2', '#0A9673'), note: 'JEE 2026 · Class 12', requestedAgo: '1 day ago' },
]

// ── Earnings ──
export type EarningsRange = 7 | 30 | 90

export interface EarningsPoint { label: string; value: number }
export interface EarningsSource { id: string; emoji: string; label: string; note: string; amount: number }
export interface EarningsView {
  total: number
  changePct: number // vs the previous period of the same length
  points: EarningsPoint[] // cumulative earnings at each sampled day
  sources: EarningsSource[]
}

const TOTALS: Record<EarningsRange, number> = { 7: 570, 30: 2240, 90: 5880 }
const CHANGE: Record<EarningsRange, number> = { 7: 9, 30: 12, 90: 18 }
const POINTS: Record<EarningsRange, number> = { 7: 7, 30: 8, 90: 9 }
// Community purchases 1,650 + study packs 590 = 2,240 (30 days) — both at the flat 50% share.
const SPLIT = [1650, 590].map(v => v / 2240)

// Small seeded generator so the chart doesn't jump around between renders.
function rng(seed: number) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function buildEarnings(range: EarningsRange): EarningsView {
  const total = TOTALS[range]
  const n = POINTS[range]
  const rand = rng(range * 7919)
  const weights = Array.from({ length: n }, () => 0.6 + rand() * 0.8)
  const sum = weights.reduce((a, b) => a + b, 0)
  let acc = 0
  const DAY = 86400000
  const now = Date.now()
  const points: EarningsPoint[] = weights.map((w, i) => {
    acc += w
    const value = i === n - 1 ? total : Math.round((total * acc) / sum / 10) * 10
    const daysAgo = Math.round((range - 1) * (1 - i / (n - 1)))
    return { label: new Date(now - daysAgo * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value }
  })
  const a = Math.round(total * SPLIT[0])
  const sources: EarningsSource[] = [
    { id: 'community', emoji: '👥', label: 'Community purchases', note: '50% share', amount: a },
    { id: 'packs', emoji: '📚', label: 'Study pack purchases', note: '50% share', amount: total - a },
  ]
  return { total, changePct: CHANGE[range], points, sources }
}

// Payouts go out on the 1st of each month.
export function payoutInfo() {
  const now = new Date()
  const fmtD = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    status: 'Paid' as 'Paid' | 'Pending',
    lastAmount: 2400,
    lastDate: fmtD(new Date(now.getFullYear(), now.getMonth(), 1)),
    nextAmount: 440, // estimated
    nextDate: fmtD(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  }
}
