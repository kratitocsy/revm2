/* ============================================================
   wynkyRecommender.ts

   How Wynky picks the pre-selected answer for every question, so a
   student mostly just taps Confirm. Pure functions, no network.

   Several signals are scored and blended per value:
     1. The student's own history (wynky_events), recency-weighted with a
        14-day half-life. Something they typed as a request counts 3x and
        decays slowly, so "keep pw.live open for Physics" sticks.
     2. Students in the same exam (and, when that group is big enough,
        the same Study DNA day type) - counts from rpc_wynky_peer_stats.
     3. "Students who picked X also picked Y" and the same subject in other
        exams (channels only; rpc_wynky_channel_signals).
     4. Study DNA rules (video learner -> YouTube, Sprinter -> short blocks).
     5. A plain default when nothing else is known.

   The blend moves weight from the priors to the student as they answer:
   own weight = n / (n + 1.5), where n is their decayed evidence, so one
   kept answer already outweighs the crowd and two make it the default.
   Peer weight grows with the cohort size (up to 80% at 20 students), so
   Study DNA and the defaults always keep some say.

   A field is not asked again once the student kept the same answer twice
   in a row, or asked for it themselves last time.
   ============================================================ */

export type WynkyAction = 'accepted' | 'changed' | 'requested' | 'removed'

export interface WynkyEvent {
  field: string
  value: string
  multi: boolean
  action: WynkyAction
  /** ISO timestamp */
  at: string
}

export interface PeerCount { value: string; users: number }
export interface PeerField { cohort: 'exam_daytype' | 'exam'; cohortUsers: number; counts: PeerCount[] }
export type PeerStats = Record<string, PeerField>

export type Source = 'request' | 'you' | 'peers' | 'also_picked' | 'other_exams' | 'study_dna' | 'default'

export interface Candidate {
  value: string
  score: number
  source: Source
}

export interface Prior { value: string; weight: number; source: 'study_dna' | 'default' }

export interface RankInput {
  field: string
  events: WynkyEvent[]
  peers?: PeerField
  priors?: Prior[]
  /** Extra per-value signals in [0, 1] (channels: also-picked, other exams). */
  extras?: { value: string; share: number; source: 'also_picked' | 'other_exams' }[]
  now: number
}

const DAY = 86_400_000
const HALF_LIFE_DAYS = 14
const REQUEST_HALF_LIFE_DAYS = 60
const ACTION_WEIGHT: Record<WynkyAction, number> = { accepted: 1, changed: 1.5, requested: 3, removed: -2 }
const FULL_COHORT = 20
const MAX_PEER_SHARE = 0.8
const EXTRA_WEIGHT: Record<'also_picked' | 'other_exams', number> = { also_picked: 0.15, other_exams: 0.08 }

function decay(ageMs: number, halfLifeDays: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY))
}

/** The student's own evidence per value, and the total positive evidence. */
export function personalEvidence(events: WynkyEvent[], field: string, now: number): { byValue: Map<string, number>; total: number; requested: Set<string> } {
  const byValue = new Map<string, number>()
  const requested = new Set<string>()
  for (const e of events) {
    if (e.field !== field) continue
    const age = now - Date.parse(e.at)
    const w = ACTION_WEIGHT[e.action] * decay(age, e.action === 'requested' ? REQUEST_HALF_LIFE_DAYS : HALF_LIFE_DAYS)
    byValue.set(e.value, (byValue.get(e.value) || 0) + w)
    if (e.action === 'requested') requested.add(e.value)
  }
  let total = 0
  for (const [v, w] of byValue) {
    if (w <= 0) byValue.delete(v)
    else total += w
  }
  return { byValue, total, requested }
}

function shares(entries: [string, number][]): Map<string, number> {
  const sum = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  const out = new Map<string, number>()
  if (sum <= 0) return out
  for (const [v, w] of entries) if (w > 0) out.set(v, (out.get(v) || 0) + w / sum)
  return out
}

/** How much the blend trusts the student, the peers and the priors. */
export function blendWeights(personalTotal: number, cohortUsers: number): { you: number; peers: number; prior: number } {
  const you = personalTotal / (personalTotal + 1.5)
  const peerConfidence = cohortUsers >= 5 ? MAX_PEER_SHARE * Math.min(1, cohortUsers / FULL_COHORT) : 0
  const peers = (1 - you) * peerConfidence
  return { you, peers, prior: 1 - you - peers }
}

/** Every known value for a field, best first, with where its score came from. */
export function rank(input: RankInput): Candidate[] {
  const own = personalEvidence(input.events, input.field, input.now)
  const youShare = shares([...own.byValue.entries()])
  const peerShare = shares((input.peers?.counts || []).map(c => [c.value, c.users]))
  const priorShare = shares((input.priors || []).map(p => [p.value, p.weight]))
  const priorSource = new Map((input.priors || []).map(p => [p.value, p.source]))
  const w = blendWeights(own.total, input.peers?.cohortUsers || 0)
  // With no peer data the priors take the peers' share too.
  const wPrior = peerShare.size ? w.prior : w.prior + w.peers
  const wPeers = peerShare.size ? w.peers : 0

  const values = new Set<string>([...youShare.keys(), ...peerShare.keys(), ...priorShare.keys(), ...(input.extras || []).map(x => x.value)])
  const out: Candidate[] = []
  for (const value of values) {
    const parts: [Source, number][] = [
      [own.requested.has(value) ? 'request' : 'you', w.you * (youShare.get(value) || 0)],
      ['peers', wPeers * (peerShare.get(value) || 0)],
      [priorSource.get(value) || 'default', wPrior * (priorShare.get(value) || 0)],
    ]
    for (const x of input.extras || []) if (x.value === value) parts.push([x.source, EXTRA_WEIGHT[x.source] * x.share])
    const score = parts.reduce((s, [, v]) => s + v, 0)
    if (score <= 0) continue
    const source = parts.reduce((best, p) => (p[1] > best[1] ? p : best))[0]
    out.push({ value, score, source })
  }
  return out.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
}

/** The single best value for a one-answer field, or null. */
export function best(input: RankInput): Candidate | null {
  return rank(input)[0] ?? null
}

/** The values to pre-tick for a several-answers field: everything the
 *  student has kept, plus strong crowd or Study DNA picks. */
export function preselect(input: RankInput, max = 3, threshold = 0.3): Candidate[] {
  return rank(input).filter(c => c.source === 'you' || c.source === 'request' || c.score >= threshold).slice(0, max)
}

/** True once Wynky should stop asking: the student kept the same answer
 *  the last two times, or asked for it themselves last time. */
export function isSettled(events: WynkyEvent[], field: string): boolean {
  const mine = events.filter(e => e.field === field && !e.multi).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  if (!mine.length) return false
  if (mine[0].action === 'requested') return true
  return mine.length >= 2 && mine[0].value === mine[1].value && mine[0].action !== 'removed' && mine[1].action !== 'removed'
}

/** Short label shown next to a pre-selected option. */
export function sourceLabel(source: Source, exam: string | null): string | null {
  switch (source) {
    case 'request': return 'you asked for this'
    case 'you': return 'your usual'
    case 'peers': return exam ? `popular with ${exam} students` : 'popular with students like you'
    case 'also_picked': return 'students who watch your channels also pick this'
    case 'other_exams': return 'popular in other exams for this subject'
    case 'study_dna': return 'from your Study DNA'
    default: return null
  }
}

// ── Study DNA priors ───────────────────────────────────────────────────

export interface StudyDna {
  dayType: string | null
  studyStyle: string[]
  challenges: string[]
  archetype: string | null
}

export function blockMinutesPriors(dna: StudyDna): Prior[] {
  if (dna.archetype === 'Sprinter') return [{ value: '45', weight: 1, source: 'study_dna' }]
  if (dna.archetype === 'Marathoner' || dna.archetype === 'Grind Machine') return [{ value: '90', weight: 1, source: 'study_dna' }]
  if (dna.challenges.includes('consistency') || dna.archetype === 'Focus Seeker') return [{ value: '45', weight: 1, source: 'study_dna' }]
  return [{ value: '60', weight: 1, source: 'default' }]
}

// Real platforms only (their own root domains), same list the chat offers.
export function sitePriors(dna: StudyDna): Prior[] {
  const out: Prior[] = []
  if (dna.studyStyle.includes('videos')) out.push({ value: 'youtube.com', weight: 1, source: 'study_dna' })
  if (dna.studyStyle.includes('books') || dna.studyStyle.includes('practice')) out.push({ value: 'offline', weight: 0.6, source: 'study_dna' })
  return out
}

/** Busy-time options ("HH:MM-HH:MM"), with the ones the day type suggests weighted. */
export const BUSY_OPTIONS: { value: string; label: string }[] = [
  { value: '08:00-14:00', label: 'School 8 AM–2 PM' },
  { value: '09:00-16:00', label: 'School/college 9 AM–4 PM' },
  { value: '16:00-19:00', label: 'Coaching 4–7 PM' },
  { value: '17:00-20:00', label: 'Coaching 5–8 PM' },
  { value: '06:00-09:00', label: 'Coaching 6–9 AM' },
  { value: '10:00-18:00', label: 'Work 10 AM–6 PM' },
]
export const NOTHING_FIXED = 'none'

export function needsBusyQuestion(dna: StudyDna): boolean {
  return dna.dayType !== 'self_study'
}

export function busyPriors(dna: StudyDna): Prior[] {
  switch (dna.dayType) {
    case 'school_coaching': return [{ value: '08:00-14:00', weight: 1, source: 'study_dna' }, { value: '16:00-19:00', weight: 1, source: 'study_dna' }]
    case 'school_college': return [{ value: '09:00-16:00', weight: 1, source: 'study_dna' }]
    case 'working': return [{ value: '10:00-18:00', weight: 1, source: 'study_dna' }]
    case 'self_study': return [{ value: NOTHING_FIXED, weight: 1, source: 'study_dna' }]
    default: return []
  }
}

export function parseBusy(value: string): { start: string; end: string } | null {
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(value)
  return m && m[1] < m[2] ? { start: m[1], end: m[2] } : null
}

// ── Typed requests Wynky can handle without the AI ─────────────────────

export type LocalRequest =
  | { kind: 'hours'; minutes: number }
  | { kind: 'wake' | 'sleep'; time: string }
  | { kind: 'block'; minutes: number }
  | { kind: 'site'; site: string; subject: string | null }

/** Reads the simple requests ("5 hours today", "I wake at 6",
 *  "pw.live for physics", "45 minute blocks"). Anything else is for the AI. */
export function parseLocalRequest(
  text: string,
  subjects: string[],
  helpers: {
    parseClock: (t: string, kind: 'wake' | 'sleep') => string | null
    siteFromText: (t: string) => string | null
  },
): LocalRequest | null {
  const t = text.trim().toLowerCase()
  if (t.length > 80) return null
  // Several instructions at once ("wake 6, 5 hours, maths first") are for the AI.
  if ((t.match(/,|\band\b|;/g) || []).length > 0) return null

  const domain = t.split(/\s+/).map(w => helpers.siteFromText(w)).find(Boolean)
  if (domain) {
    const subject = subjects.find(s => t.includes(s.toLowerCase())) ?? null
    return { kind: 'site', site: domain, subject }
  }
  const block = /(\d{2,3})\s*(?:min|mins|minute|minutes)?\s*(?:blocks?|sessions?)\b/.exec(t)
  if (block) {
    const minutes = parseInt(block[1], 10)
    if (minutes >= 20 && minutes <= 180) return { kind: 'block', minutes }
  }
  const clock = /(\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?)\s*$/.exec(t)
  if (clock && /\b(wake|get up|up at)\b/.test(t)) {
    const time = helpers.parseClock(clock[1].trim(), 'wake')
    if (time) return { kind: 'wake', time }
  }
  if (clock && /\b(sleep|bed|bedtime)\b/.test(t)) {
    const time = helpers.parseClock(clock[1].trim(), 'sleep')
    if (time) return { kind: 'sleep', time }
  }
  const hours = /^(?:(?:i want to |i'll |let me |study )?(?:study )?(?:for )?(?:about )?)(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b(?: today| a day| daily)?\.?$/.exec(t)
  if (hours) {
    const minutes = Math.round(parseFloat(hours[1]) * 60)
    if (minutes >= 30 && minutes <= 720) return { kind: 'hours', minutes }
  }
  return null
}
