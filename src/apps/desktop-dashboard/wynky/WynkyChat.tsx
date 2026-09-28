import { useEffect, useRef, useState } from 'react'
import wynkoMascot from '../imports/wynko-mascot.png'
import { sb } from '../../_shared/supabaseClient'
import { REVM2_CONFIG } from '../../../lib/supabase.js'
import {
  loadKnownProfile, loadRemembered, loadEvents, recordEvents, fetchPeerStats, fetchChannelSignals,
  defaultDailyMinutes, bucketMinutes, distractionSites, distractionApps,
  recommend, confirmPlan, removeStaleWynkyPlans, rememberAnswers, rememberAllowlists, recordOutcome, loadStudyMinutes, weakSubjects,
  NoEnforceableBlocksError, STUDY_MODE_OPTIONS, examFamilyKey, subjectKey, seedQueriesFor,
  resolveChannelSeed, fetchPopularChannels, setChannelPick, channelPickId, appPickerAvailable, listPickableApps,
  type WynkyKnownProfile, type WynkyRemembered, type SubjectAllowlist, type AiSlot, type ChannelPick,
  type PickableApp, type PlanSlotInput, type NewEvent,
} from './wynkyPlanner'
import {
  subjectChoices, examSubjects, uniqueCaseless, isEnforceable, hoursOptions, minutesFromOptionId,
  parseStudyMinutes, clockOptions, parseClock, fmtClock, fmtHours, siteFromText, filterOptions, clearMatch,
  blockOptions, parseBusyText, fmtBusy, formatWeekPlan, type ChatOption,
} from './wynkyChatFlow'
import {
  rank, best, preselect, isSettled, latestOwn, sourceLabel, blockMinutesPriors, sitePriors, busyPriors, needsBusyQuestion,
  parseBusy, parseLocalRequest, BUSY_OPTIONS, NOTHING_FIXED,
  type WynkyEvent, type PeerStats, type Candidate, type Prior,
} from './wynkyRecommender'
import { draftSlots, standingRequests, checkRefined, toResult } from './wynkyRefine'
import {
  dayGroups, restDays, fillSubjectDays, planNameFor, isWynkyPlanName, daysLabel, daysValue, parseDaysValue, isDayStructure,
  DAY_STRUCTURE_OPTIONS, DAY_SHORT, WEEK_ORDER, type DayStructure, type DayGroup,
} from './wynkyDays'
import type { GeneratorResult } from '../../_shared/scheduleGenerator'

/* ============================================================
   WynkyChat.tsx

   "Generate with AI" on the Schedules page opens this: Wynky as a
   support-bot style chat that asks as little as possible.

   It opens with what it already knows (Study DNA, onboarding, earlier
   plans) and a ready plan, pre-filled by wynkyRecommender.ts from the
   student's own history, students in the same exam and their Study DNA.
   It only asks what it can't work out yet (usually busy hours and
   wake/sleep, the first time), each with the best guess pre-selected.
   Everything the student keeps, changes or asks for is logged to
   wynky_events so the next plan needs even fewer taps.

   Every plan is built by the rule-based generator and then improved by
   Gemini (ai-generate-schedule "refine" mode, see wynkyRefine.ts); if
   Gemini is busy or its answer fails the checks, the rule plan is shown.
   Typed requests Wynky understands ("5 hours", "I wake at 6",
   "pw.live for Physics") are applied and remembered straight away;
   anything else goes to Gemini as the top-priority instruction for the
   same plan, and is remembered so every later plan follows it too.
   The full set-up (subjects, sites, channels, apps) is still one tap
   away under "Change my set-up". Nothing is saved until the student
   taps Confirm.
   ============================================================ */

type Step = 'loading' | 'signed_out' | 'subjects' | 'sites' | 'channels' | 'apps' | 'apps_mode'
  | 'busy' | 'days' | 'subject_days' | 'hours' | 'block' | 'wake' | 'sleep' | 'preview' | 'done'

type Gap = 'subjects' | 'busy' | 'days' | 'wake' | 'sleep' | 'hours'

const MULTI_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps', 'busy', 'subject_days']
// Steps where typing narrows the options, like "Start typing to see options…".
const FILTER_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps', 'hours', 'wake', 'sleep']

interface Msg { id: number; from: 'bot' | 'user'; text: string }
interface Profile {
  uid: string
  known: WynkyKnownProfile
  remembered: WynkyRemembered
  events: WynkyEvent[]
  peers: PeerStats
  /** Minutes per subject over the last 30 days, for weak subjects. */
  study: { bySubject: Record<string, number>; sessions: number }
}
interface Draft {
  subjects: string[]
  allow: Record<string, SubjectAllowlist>
  dailyMinutes: number
  blockMinutes: number
  /** Busy windows as "HH:MM-HH:MM", or [NOTHING_FIXED]. */
  busy: string[]
  wakeTime: string | null
  sleepTime: string | null
  /** Same plan every day, weekdays vs weekend, or subjects on set days. */
  dayStructure: DayStructure
  /** Days the student chose (or kept) for a subject; the rest are filled in. */
  subjectDays: Record<string, number[]>
}
/** What Wynky recommended when the chat opened, to tell kept from changed. */
interface Recs {
  dailyMinutes: Candidate | null
  blockMinutes: Candidate | null
  busy: Candidate | null
  wake: Candidate | null
  sleep: Candidate | null
  sites: Record<string, string[]>
  dayStructure: Candidate | null
  /** Each subject's days as first shown ("1,3,5"), to tell kept from changed. */
  subjectDays: Record<string, string>
}
/** One day type's plan, and the plan before Gemini's changes when the shown one is Gemini's. */
interface DayPlan { group: DayGroup; result: GeneratorResult; plain: GeneratorResult | null }
interface ChannelSuggestion extends ChannelPick { pickCount: number; note?: string; score: number }

const MAX_SHOWN_OPTIONS = 40
// Longest Wynky waits for Gemini before showing the rule-based plan.
const REFINE_TIMEOUT_MS = 20_000
const TIME_RE = /^\d{2}:\d{2}$/

const EMPTY_KNOWN: WynkyKnownProfile = {
  subjects: [], exam: null, dailyHoursBucket: null, customDailyHoursText: null, distractionTags: [], customDistractionText: null,
  dna: { dayType: null, studyStyle: [], challenges: [], archetype: null },
}
const EMPTY_REMEMBERED: WynkyRemembered = {
  wakeTime: null, sleepTime: null, subjectAllowlists: {}, lastDailyMinutes: null, acceptedCount: 0, adjustedCount: 0,
}

const emptyAllow = (): SubjectAllowlist => ({ sites: [], apps: [], channels: [] })
const isYoutubeSite = (s: string) => s === 'youtube.com' || s.endsWith('.youtube.com')
const uniq = <T,>(xs: T[]) => [...new Set(xs)]
const sitesField = (subject: string) => `sites:${subjectKey(subject)}`
const daysField = (subject: string) => `days:${subjectKey(subject)}`

/** School, coaching and work are usually weekdays only; self-study days
 *  tend to look alike. Only a starting guess: the student's own answer and
 *  same-exam students outweigh it. */
function dayStructurePriors(dayType: string | null): Prior[] {
  if (dayType === 'school_coaching' || dayType === 'school_college' || dayType === 'working') return [{ value: 'weekend', weight: 1, source: 'study_dna' }]
  return [{ value: 'same', weight: 1, source: 'study_dna' }]
}

function normalizeAllow(saved: Record<string, SubjectAllowlist>): Record<string, SubjectAllowlist> {
  const out: Record<string, SubjectAllowlist> = {}
  for (const [name, a] of Object.entries(saved || {})) {
    out[name] = { ...a, sites: a?.sites || [], apps: a?.apps || [], channels: a?.channels || [] }
  }
  return out
}

function withAllow(d: Draft, subject: string, patch: Partial<SubjectAllowlist>): Draft {
  return { ...d, allow: { ...d.allow, [subject]: { ...(d.allow[subject] || emptyAllow()), ...patch } } }
}

/** The set-up to save: exactly the subjects the student picked. */
function allowFor(d: Draft): Record<string, SubjectAllowlist> {
  const out: Record<string, SubjectAllowlist> = {}
  for (const s of d.subjects) out[s] = { ...emptyAllow(), ...d.allow[s] }
  return out
}

function toAiSlots(slots: PlanSlotInput[]): AiSlot[] {
  return slots.map(s => ({ start_time: s.startTime, end_time: s.endTime, preset_name: '', subject: s.subject ?? undefined, is_sleep: s.isSleep }))
}

// fetch() rejects with a bare TypeError ("Failed to fetch") when offline.
function chatErrorText(e: unknown, fallback: string): string {
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return "I couldn't reach the server. Check your connection and try again."
  return e instanceof Error ? e.message : fallback
}

const busyWindows = (busy: string[]) => busy.map(parseBusy).filter((b): b is { start: string; end: string } => !!b)
const busyValue = (busy: string[]) => (busy.length ? [...busy].sort().join(',') : NOTHING_FIXED)
const busyList = (value: string | undefined) => (!value || value === NOTHING_FIXED ? [] : value.split(',').filter(v => !!parseBusy(v)))
const busyLabel = (value: string) => BUSY_OPTIONS.find(o => o.value === value)?.label ?? fmtBusy(value)
const siteLabel = (site: string) => (STUDY_MODE_OPTIONS.find(o => o.site === site)?.label ?? site).replace(/\s*\(.*\)$/, '')

/** What Gemini should know about the student besides the plan itself. */
function studentFacts(known: WynkyKnownProfile): string[] {
  const facts: string[] = []
  if (known.exam) facts.push(`preparing for ${known.exam}`)
  if (known.dna.dayType) facts.push(`day type: ${known.dna.dayType.replace(/_/g, ' ')}`)
  if (known.dna.archetype) facts.push(`Study DNA archetype: ${known.dna.archetype}`)
  if (known.dna.studyStyle.length) facts.push(`learns best with ${known.dna.studyStyle.join(' and ')}`)
  if (known.dna.challenges.length) facts.push(`struggles with ${known.dna.challenges.join(' and ')}`)
  if (known.distractionTags.length) facts.push(`distracted by ${known.distractionTags.join(', ')}`)
  return facts
}

// The Wynko mascot as a round avatar (header, every bot message, typing indicator).
function MascotAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: 'rgba(255,138,61,0.14)', border: '1px solid rgba(255,138,61,0.4)', boxShadow: 'none' }}>
      <img src={wynkoMascot} alt="" className="w-auto object-contain" style={{ height: '78%' }} />
    </div>
  )
}

function Icon({ d, cls }: { d: string; cls: string }) {
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

/** Earlier plans saved before wynky_events existed still count as the
 *  student's own answers, so nobody is asked again after this update. */
function withRememberedEvents(events: WynkyEvent[], r: WynkyRemembered, now: number): WynkyEvent[] {
  const out = [...events]
  const seed = (field: string, value: string | null, times: number) => {
    const real = events.filter(e => e.field === field)
    if (!value || real.length >= times) return
    // Older than anything real, so a newer change still wins.
    const oldest = Math.min(now - 86_400_000, ...real.map(e => Date.parse(e.at) - 86_400_000))
    const at = new Date(oldest).toISOString()
    for (let i = real.length; i < times; i++) out.push({ field, value, multi: false, action: 'accepted', at })
  }
  seed('wake', r.wakeTime, 2)
  seed('sleep', r.sleepTime, 2)
  // The remembered daily figure is already an average of every plan they confirmed.
  seed('daily_minutes', r.lastDailyMinutes != null ? String(r.lastDailyMinutes) : null, Math.max(2, Math.min(4, r.acceptedCount + r.adjustedCount)))
  return out
}

/** The sites Wynky would pre-tick for a subject that has no set-up yet. */
function recommendSites(p: Profile, subject: string, now: number): string[] {
  return preselect({ field: sitesField(subject), events: p.events, peers: p.peers[sitesField(subject)], priors: sitePriors(p.known.dna), now })
    .map(c => c.value).filter(v => v !== 'offline' && !!siteFromText(v))
}

/** The student's own settled answer, used as-is: once they have kept it,
 *  fading evidence must not let the crowd swap it out behind their back. */
function settledOr(events: WynkyEvent[], field: string, fallback: Candidate | null): Candidate | null {
  if (!isSettled(events, field)) return fallback
  const value = latestOwn(events, field)
  if (value == null) return fallback
  const last = events.filter(e => e.field === field && !e.multi).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return { value, score: 1, source: last?.action === 'requested' ? 'request' : 'you' }
}

const restLabel = (plans: DayPlan[]) => {
  const rest = restDays(plans.map(x => x.group))
  return rest.length ? daysLabel(rest) : ''
}

/** Whether the day-type question is worth a tap: with busy times the
 *  weekend differs, and with 3+ subjects splitting them across days helps. */
function asksDays(dna: WynkyKnownProfile['dna'], d: Draft): boolean {
  return d.subjects.length >= 3 || (needsBusyQuestion(dna) && busyWindows(d.busy).length > 0)
}

/** The plan Wynky would build right now, and which questions are still open. */
function recommendDraft(p: Profile, now: number): { draft: Draft; recs: Recs; gaps: Gap[] } {
  const { known, remembered, events, peers } = p
  const dna = known.dna
  const saved = Object.keys(remembered.subjectAllowlists || {})
  const subjects = saved.length ? saved : known.subjects.length ? known.subjects : examSubjects(known.exam)
  const allow = normalizeAllow(remembered.subjectAllowlists)
  const sites: Record<string, string[]> = {}
  for (const s of subjects) {
    if (isEnforceable(allow[s])) continue
    const picks = recommendSites(p, s, now)
    if (picks.length) {
      sites[s] = picks
      allow[s] = { ...(allow[s] || emptyAllow()), sites: picks }
    }
  }

  const minutesPriors: Prior[] = known.dailyHoursBucket ? [{ value: String(bucketMinutes(known)), weight: 1, source: 'study_dna' }] : []
  const dailyMinutes = best({ field: 'daily_minutes', events, peers: peers.daily_minutes, priors: minutesPriors, now })
  const blockMinutes = best({ field: 'block_minutes', events, peers: peers.block_minutes, priors: blockMinutesPriors(dna), now })
  const busyPrior = busyPriors(dna)
  const busy = needsBusyQuestion(dna)
    ? settledOr(events, 'busy', best({ field: 'busy', events, peers: peers.busy, now, priors: busyPrior.length ? [{ value: busyValue(busyPrior.map(b => b.value).filter(v => v !== NOTHING_FIXED)), weight: 1, source: 'study_dna' }] : [] }))
    : null
  const wake = settledOr(events, 'wake', best({ field: 'wake', events, peers: peers.wake, now }))
  const sleep = settledOr(events, 'sleep', best({ field: 'sleep', events, peers: peers.sleep, now }))
  const dayStructure = settledOr(events, 'day_structure',
    best({ field: 'day_structure', events, peers: peers.day_structure, priors: dayStructurePriors(dna.dayType), now }))
  // Days the student set for each subject, used only when they cover
  // every current subject: after a subject is added or dropped the week is
  // rebalanced rather than leaving the dropped subject's days empty.
  let subjectDays: Record<string, number[]> = {}
  for (const s of subjects) {
    const days = parseDaysValue(latestOwn(events, daysField(s)))
    if (days) subjectDays[s] = days
  }
  if (Object.keys(subjectDays).length !== subjects.length) subjectDays = {}

  const num = (c: Candidate | null, lo: number, hi: number) => {
    const n = c ? parseInt(c.value, 10) : NaN
    return n >= lo && n <= hi ? n : null
  }
  const draft: Draft = {
    subjects,
    allow,
    dailyMinutes: num(dailyMinutes, 30, 720) ?? defaultDailyMinutes(known, remembered),
    blockMinutes: num(blockMinutes, 20, 180) ?? 60,
    busy: busy ? busyList(busy.value) : [],
    wakeTime: wake && TIME_RE.test(wake.value) ? wake.value : null,
    sleepTime: sleep && TIME_RE.test(sleep.value) ? sleep.value : null,
    dayStructure: dayStructure && isDayStructure(dayStructure.value) ? dayStructure.value : 'same',
    subjectDays,
  }
  const filledDays = fillSubjectDays(subjects, subjectDays)

  const gaps: Gap[] = []
  // Never plan made-up subjects: with none saved anywhere, ask (exam subjects pre-ticked).
  if (!saved.length && !known.subjects.length) gaps.push('subjects')
  if (needsBusyQuestion(dna) && !isSettled(events, 'busy')) gaps.push('busy')
  // Asked once, only when it matters (see asksDays); after that it is
  // pre-set and "Change day types" on the plan still changes it.
  const ownStructure = latestOwn(events, 'day_structure')
  if (ownStructure == null) {
    // Nobody asked yet: the crowd's or Study DNA's guess is only the
    // pre-selected answer to the question, never applied unasked.
    if (gaps.includes('subjects') || asksDays(dna, draft)) gaps.push('days')
    else draft.dayStructure = 'same'
  }
  if (!isSettled(events, 'wake')) gaps.push('wake')
  if (!isSettled(events, 'sleep')) gaps.push('sleep')
  if (!dailyMinutes && remembered.lastDailyMinutes == null) gaps.push('hours')
  const recDays = Object.fromEntries(Object.entries(filledDays).map(([s, d]) => [s, daysValue(d)]))
  return { draft, recs: { dailyMinutes, blockMinutes, busy, wake, sleep, sites, dayStructure, subjectDays: recDays }, gaps }
}

export default function WynkyChat({ onClose, onPlanConfirmed }: {
  onClose: () => void
  /** One entry per day type, each with the days it runs on. */
  onPlanConfirmed: (plans: { days_of_week: number[]; slots: AiSlot[] }[]) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(true) // Wynky is working: loading, asking the AI, searching YouTube
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<Step>('loading')
  const [subjIdx, setSubjIdx] = useState(0)
  const [picked, setPicked] = useState<string[]>([]) // selected option ids on a pick-several question
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Draft>({ subjects: [], allow: {}, dailyMinutes: 240, blockMinutes: 60, busy: [], wakeTime: null, sleepTime: null, dayStructure: 'same', subjectDays: {} })
  const [channelSugs, setChannelSugs] = useState<Record<string, ChannelSuggestion[]>>({})
  const [channelsLoadingFor, setChannelsLoadingFor] = useState<string | null>(null)
  const [deviceApps, setDeviceApps] = useState<PickableApp[] | null>(null)
  const [appsLoading, setAppsLoading] = useState(false)
  // The shown plan, one entry per day type.
  const [plans, setPlans] = useState<DayPlan[] | null>(null)
  const hasPlain = !!plans?.some(p => p.plain)
  const profileRef = useRef<Profile | null>(null)
  const recsRef = useRef<Recs | null>(null)
  const gapsRef = useRef<Gap[]>([])
  const openedAt = useRef(Date.now())
  // Learning waits for Confirm: what the student asked for is used in this
  // chat straight away but only saved with a confirmed plan, and only if the
  // plan still has it.
  const pendingRef = useRef<NewEvent[]>([])
  // What this chat already saved, so confirming again doesn't count twice.
  const loggedRef = useRef<Set<string>>(new Set())
  const subjectsGapRef = useRef(false)
  // The day-type answer is learned only once the student has seen the question.
  const daysAskedRef = useRef(false)
  // Only the latest plan request may show its answer.
  const refineSeq = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  const busy = typing || saving || step === 'loading'
  const subject = draft.subjects[subjIdx] ?? ''
  const exam = profile?.known.exam ?? null

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, typing])
  useEffect(() => { if (!busy) inputRef.current?.focus() }, [step, busy])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function say(text: string) {
    const id = nextId.current++
    setMessages(m => [...m, { id, from: 'bot', text }])
  }
  function echo(text: string) {
    const id = nextId.current++
    setMessages(m => [...m, { id, from: 'user', text }])
  }
  function ask(next: Step, text: string, initialPicked: string[] = []) {
    setStep(next)
    setPicked(initialPicked)
    setInput('')
    say(text)
  }
  /** The subjects that get blocks. A subject with nothing of its own to
   *  allow still gets blocks when the free-time blocklist can cover them;
   *  otherwise those blocks would be dropped on save, so it is left out. */
  function planSubjects(d: Draft): string[] {
    const { freeSites, freeApps } = freeTimeLists()
    return freeSites.length || freeApps.length ? d.subjects : d.subjects.filter(s => isEnforceable(d.allow[s]))
  }
  function freeTimeLists() {
    const tags = profileRef.current?.known.distractionTags || []
    return { freeSites: distractionSites(tags), freeApps: distractionApps(tags) }
  }
  function cohort() {
    const k = profileRef.current?.known
    return { examKey: examFamilyKey(k?.exam ?? null), dayType: k?.dna.dayType ?? null }
  }
  /** Uses a request in this chat straight away (it shapes the rest of the
   *  chat) and queues it to be saved with the confirmed plan. */
  function learn(events: NewEvent[]) {
    const p = profileRef.current
    if (!p || !events.length) return
    const at = new Date().toISOString()
    p.events = [...events.map(e => ({ field: e.field, value: e.value, multi: !!e.multi, action: e.action, at })), ...p.events]
    pendingRef.current.push(...events)
  }

  /** Saves what a confirmed plan taught Wynky: queued requests the plan
   *  still has, plus each answer kept or changed, never the same one twice. */
  function saveLearning(d: Draft, confirmed: NewEvent[], opts: { planFields: boolean }) {
    const p = profileRef.current
    if (!p) return
    const inPlan = (e: NewEvent) => {
      if (e.field === 'note') return true
      if (e.field.startsWith('sites:')) return d.subjects.some(s => sitesField(s) === e.field && (d.allow[s]?.sites || []).includes(e.value))
      if (!opts.planFields) return false
      if (e.field === 'daily_minutes') return e.value === String(d.dailyMinutes)
      if (e.field === 'block_minutes') return e.value === String(d.blockMinutes)
      if (e.field === 'wake') return e.value === d.wakeTime
      if (e.field === 'sleep') return e.value === d.sleepTime
      return false
    }
    const events = [...pendingRef.current.filter(inPlan), ...confirmed].filter(e => {
      const key = e.field === 'setup_seconds' ? e.field : `${e.field}|${e.value}|${e.action}`
      if (loggedRef.current.has(key)) return false
      loggedRef.current.add(key)
      return true
    })
    pendingRef.current = []
    if (events.length) void recordEvents(sb as any, p.uid, cohort(), events).catch(() => { /* learning is best-effort */ })
  }
  function why(c: Candidate | null | undefined): string | null {
    return c ? sourceLabel(c.source, exam) : null
  }

  // Load what Wynky already knows, then show a ready plan or ask the few
  // things it can't work out. Nothing to type until this is ready.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let uid: string | null = null
      try { uid = (await sb.auth.getSession()).data.session?.user.id ?? null } catch { /* treated as signed out */ }
      if (cancelled) return
      if (!uid) {
        setTyping(false)
        ask('signed_out', 'Please sign in first. I need your profile to build a schedule.')
        return
      }
      let known = EMPTY_KNOWN
      let remembered = EMPTY_REMEMBERED
      let events: WynkyEvent[] = []
      try {
        [known, remembered] = await Promise.all([loadKnownProfile(sb as any, uid), loadRemembered(sb as any, uid)])
      } catch {
        // Start from scratch rather than fail: every answer can be picked again.
      }
      try { events = await loadEvents(sb as any, uid) } catch { /* no history yet */ }
      let study: Profile['study'] = { bySubject: {}, sessions: 0 }
      try { study = await loadStudyMinutes(sb as any, uid) } catch { /* no weak subjects then */ }
      const now = Date.now()
      events = withRememberedEvents(events, remembered, now)
      const subjectsForPeers = Object.keys(remembered.subjectAllowlists || {}).length
        ? Object.keys(remembered.subjectAllowlists) : known.subjects.length ? known.subjects : examSubjects(known.exam)
      let peers: PeerStats = {}
      try {
        peers = await fetchPeerStats(sb as any, examFamilyKey(known.exam),
          ['wake', 'sleep', 'daily_minutes', 'block_minutes', 'busy', 'day_structure', ...uniq(subjectsForPeers.map(sitesField))])
      } catch { /* Study DNA and defaults still work */ }
      if (cancelled) return
      const p: Profile = { uid, known, remembered, events, peers, study }
      profileRef.current = p
      setProfile(p)
      const { draft: d, recs, gaps } = recommendDraft(p, now)
      recsRef.current = recs
      gapsRef.current = gaps
      setTyping(false)
      say(summaryText(p, d, gaps))
      nextGap(d)
    })()
    return () => { cancelled = true }
  }, [])

  function summaryText(p: Profile, d: Draft, gaps: Gap[]): string {
    const gapCount = gaps.length
    const returning = p.events.length > 0 || Object.keys(p.remembered.subjectAllowlists || {}).length > 0
    const pickSubjects = gaps.includes('subjects')
    const lines: string[] = []
    if (!pickSubjects) lines.push(`• ${p.known.exam ? `${p.known.exam}: ` : ''}${d.subjects.join(', ')}`)
    else if (p.known.exam) lines.push(`• Preparing for ${p.known.exam}`)
    lines.push(`• About ${fmtHours(d.dailyMinutes)} of study a day, in ${d.blockMinutes}-minute blocks`)
    const busy = busyWindows(d.busy)
    if (busy.length) lines.push(`• Busy: ${d.busy.map(busyLabel).join(', ')}${d.dayStructure === 'weekend' ? ' on weekdays' : ''}`)
    if (!pickSubjects && !gaps.includes('days') && d.dayStructure !== 'same') {
      lines.push(d.dayStructure === 'split' ? '• Different subjects on different days' : '• Weekdays and weekends planned separately')
    }
    for (const s of pickSubjects ? [] : d.subjects) {
      const a = d.allow[s]
      if (!isEnforceable(a)) continue
      const bits = (a.sites || []).map(siteLabel)
      if ((a.channels || []).length) bits.push(`${a.channels!.length} YouTube channel${a.channels!.length === 1 ? '' : 's'}`)
      if (a.apps.length) bits.push(`${a.apps.length} app${a.apps.length === 1 ? '' : 's'}`)
      lines.push(`• During ${s}: ${bits.join(', ')} open`)
    }
    const { freeSites } = freeTimeLists()
    if (freeSites.length) lines.push(`• Free time: ${freeSites.join(', ')} locked`)
    const head = returning
      ? "Welcome back! Here's your usual set-up:"
      : `Hi, I'm Wynky! Here's what I know from your Study DNA${p.known.exam ? ` and your ${p.known.exam} prep` : ''}:`
    const tail = gapCount === 0 ? "Here's today's plan." : gapCount === 1 ? 'One quick question and your plan is ready.' : `${gapCount} quick questions and your plan is ready.`
    return `${head}\n${lines.join('\n')}\n\n${tail}`
  }

  // ── Questions ──────────────────────────────────────────────────────────

  /** Asks the next open question, or shows the plan when none is left. */
  function nextGap(d: Draft) {
    const gap = gapsRef.current.shift()
    if (gap === 'subjects') { subjectsGapRef.current = true; enterSubjects(d) }
    else if (gap === 'busy') enterBusy(d)
    else if (gap === 'days') {
      const p = profileRef.current
      if (p && asksDays(p.known.dna, d)) enterDays(d); else nextGap({ ...d, dayStructure: 'same' })
    }
    else if (gap === 'wake') enterWake(d)
    else if (gap === 'sleep') enterSleep(d)
    else if (gap === 'hours') enterHours(d)
    else buildPreview(d)
  }

  function enterSubjects(d: Draft) {
    setDraft(d)
    ask('subjects', 'Which subjects are you studying? Pick all that apply, or type one, then tap Done.', d.subjects.map(s => `subj:${s}`))
  }

  function enterSites(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    const sites = d.allow[name]?.sites || []
    const pre = [
      ...STUDY_MODE_OPTIONS.filter(o => o.site && sites.includes(o.site)).map(o => o.id),
      ...sites.filter(s => !STUDY_MODE_OPTIONS.some(o => o.site === s)).map(s => `site:${s}`),
    ]
    const count = d.subjects.length > 1 ? ` (${idx + 1} of ${d.subjects.length})` : ''
    ask('sites', `How do you study ${name}${count}? Pick everything you use, or type a website. During ${name} I'll keep these open and lock the rest.`, pre)
  }

  function enterChannels(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    ask('channels',
      `Which YouTube channels do you watch for ${name}? These are real channels${exam ? `, ranked by what ${exam} students pick` : ''}. Type a name to search for another, or skip to allow all of YouTube.`,
      (d.allow[name]?.channels || []).map(c => c.id))
    if (!channelSugs[name]) void loadChannels(name, (d.allow[name]?.channels || []).map(c => c.id))
  }

  // Same-exam popularity, the same subject in other exams and "students who
  // watch your channels also watch", then real YouTube search for seeds.
  async function loadChannels(name: string, mine: string[]) {
    const examKey = examFamilyKey(exam)
    setChannelsLoadingFor(name)
    try {
      const [popular, signals] = await Promise.all([
        fetchPopularChannels(sb as any, examKey, subjectKey(name), 10).catch(() => []),
        fetchChannelSignals(sb as any, examKey, subjectKey(name), mine).catch(() => []),
      ])
      const byId = new Map<string, ChannelSuggestion>()
      for (const c of popular) byId.set(c.channel_id, { id: c.channel_id, label: c.channel_label, pickCount: Number(c.pick_count), score: Number(c.pick_count) })
      for (const s of signals) {
        const cur = byId.get(s.channelId) ?? { id: s.channelId, label: s.label, pickCount: s.sameExam, score: s.sameExam }
        cur.score = Math.max(cur.pickCount, s.sameExam) + 0.5 * s.alsoPicked + 0.3 * s.otherExams
        if (s.alsoPicked > 0) cur.note = 'watched by students with your channels'
        else if (!cur.pickCount && s.otherExams > 0) cur.note = 'popular in other exams'
        byId.set(s.channelId, cur)
      }
      if (byId.size < 8) {
        const seeds = seedQueriesFor(exam, name).slice(0, 5)
        const found = await Promise.all(seeds.map(q => resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, q).catch(() => null)))
        for (const m of found) {
          if (!m) continue
          const id = channelPickId(m)
          if (!byId.has(id)) byId.set(id, { id, label: m.title, pickCount: 0, score: 0 })
        }
      }
      setChannelSugs(prev => ({ ...prev, [name]: [...byId.values()].sort((a, b) => b.score - a.score) }))
    } catch {
      setChannelSugs(prev => ({ ...prev, [name]: prev[name] || [] })) // typing a channel name still works
    } finally {
      setChannelsLoadingFor(cur => (cur === name ? null : cur))
    }
  }

  function enterApps(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    ask('apps', `Do you use any apps for ${name}? Pick them, or tap No apps.`, (d.allow[name]?.apps || []).map(a => `app:${a}`))
    if (!deviceApps && !appsLoading) void loadApps()
  }

  async function loadApps() {
    setAppsLoading(true)
    try { setDeviceApps(await listPickableApps()) } catch { setDeviceApps([]) } finally { setAppsLoading(false) }
  }

  function enterAppsMode(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    ask('apps_mode', `During ${name}, should I keep only these apps open, or close them? Keeping only these open closes every other app on your phone and your computer, so choose it only if these are all you need.`)
  }

  function afterSubject(d: Draft, idx: number) {
    if (idx + 1 < d.subjects.length) enterSites(d, idx + 1)
    else finishSetup(d)
  }

  function finishSetup(d: Draft) {
    const p = profileRef.current
    if (!p) return
    const { freeSites, freeApps } = freeTimeLists()
    if (!d.subjects.some(s => isEnforceable(d.allow[s])) && !freeSites.length && !freeApps.length) {
      say("I don't have anything to lock during study blocks yet: none of your subjects has a site, YouTube channel or app. Pick at least one for a subject.")
      enterSites(d, 0)
      return
    }
    void rememberAllowlists(sb as any, p.uid, allowFor(d)).catch(() => { /* saved again on Confirm */ })
    nextGap(d)
  }

  function enterBusy(d: Draft) {
    setDraft(d)
    const pre = d.busy.length ? d.busy : [NOTHING_FIXED]
    const note = why(recsRef.current?.busy)
    ask('busy', `When are you busy with school, coaching or work?${note ? ` I've ticked what's ${note === 'your usual' ? 'usual for you' : note}.` : ''} Change anything, or type a time like 4-7 pm, then tap Done.`, pre)
  }

  function enterDays(d: Draft) {
    setDraft(d)
    daysAskedRef.current = true
    const note = why(recsRef.current?.dayStructure)
    const hint = note && recsRef.current?.dayStructure?.value === d.dayStructure ? ` I've marked what's ${note === 'your usual' ? 'usual for you' : note}.` : ''
    ask('days', `Should every day look the same, or do weekends or subjects change?${hint}`)
  }

  /** Day chips for the idx-th subject of the plan (not of every subject). */
  function enterSubjectDays(d: Draft, idx: number) {
    const list = planSubjects(d)
    const name = list[idx]
    if (!name) { buildPreview(d); return }
    setDraft(d); setSubjIdx(d.subjects.indexOf(name))
    const days = fillSubjectDays(list, d.subjectDays)[name] || []
    const count = list.length > 1 ? ` (${idx + 1} of ${list.length})` : ''
    ask('subject_days', `Which days are for ${name}${count}? I've ticked a balanced week. Change any, then tap Done.`, days.map(n => `day:${n}`))
  }

  function enterHours(d: Draft) {
    setDraft(d)
    ask('hours', 'How many hours do you want to study today?')
  }

  function enterBlock(d: Draft) {
    setDraft(d)
    ask('block', 'How long should each study block be?')
  }

  function enterWake(d: Draft) {
    setDraft(d)
    ask('wake', 'What time do you usually wake up?')
  }

  function enterSleep(d: Draft) {
    setDraft(d)
    ask('sleep', 'And when do you usually go to sleep?')
  }

  function buildPreview(d: Draft, requestNow: string | null = null) {
    setDraft(d)
    if (!d.wakeTime) { enterWake(d); return }
    if (!d.sleepTime) { enterSleep(d); return }
    const { freeSites, freeApps } = freeTimeLists()
    const enforceable = d.subjects.filter(s => isEnforceable(d.allow[s]))
    if (!enforceable.length && !freeSites.length && !freeApps.length) {
      say("To lock anything during study time I need to know how you study. Let's pick that for each subject, it's quick.")
      enterSites(d, 0)
      return
    }
    const subjects = planSubjects(d)
    const p = profileRef.current
    const groups = dayGroups({ structure: d.dayStructure, subjects, busy: d.busy, subjectDays: d.subjectDays })
    const drafts = groups.map(group => {
      const weak = p ? weakSubjects(group.subjects, p.study) : []
      const result = recommend({
        wakeTime: d.wakeTime!, sleepTime: d.sleepTime!, dailyMinutes: d.dailyMinutes, subjects: group.subjects, weak,
        blockLengthMinutes: d.blockMinutes, fixedCommitments: busyWindows(group.busy),
      })
      return { group, result, weak }
    })
    if (drafts.some(x => !x.result.blocks.some(b => b.kind === 'study'))) {
      const askBusy = !!p && needsBusyQuestion(p.known.dna) && busyWindows(d.busy).length > 0
      say(`Those times don't leave any room for study. Let's go over your ${askBusy ? 'busy times and ' : ''}wake and sleep times again.`)
      gapsRef.current = ['wake', 'sleep']
      if (askBusy) enterBusy(d); else nextGap(d)
      return
    }
    void refineAndShow(d, drafts, requestNow)
  }

  /** Asks Gemini to improve one day type's rule-based plan. Returns its
   *  version when it passed the checks, else the reason it didn't. */
  async function refineOne(d: Draft, x: { group: DayGroup; result: GeneratorResult; weak: string[] }, token: string,
    requestNow: string | null, standing: string[], groupCount: number): Promise<{ shown: GeneratorResult; note: string; failed: string }> {
    const p = profileRef.current
    const busy = busyWindows(x.group.busy)
    const facts = p ? studentFacts(p.known) : []
    if (groupCount > 1) facts.push(`this plan is only for ${x.group.label}${!busy.length && busyWindows(d.busy).length ? ', when they have no school, coaching or work' : ''}`)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REFINE_TIMEOUT_MS)
    try {
      const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'refine', subjects: x.group.subjects, weak: x.weak, draft: draftSlots(x.result),
          wake: d.wakeTime, sleep: d.sleepTime, busy,
          target_minutes: x.result.placedStudyMinutes, block_minutes: x.result.blockLengthMinutes,
          facts, request_now: requestNow, standing_requests: standing,
        }),
      })
      const data = await res.json()
      // An older deployed function ignores "refine" and answers in another shape.
      if (!res.ok || !data.success || data.mode !== 'refine') throw new Error(data.error || 'Gemini is not available right now.')
      const check = checkRefined(data.slots, x.result, {
        subjects: x.group.subjects, wakeTime: d.wakeTime!, sleepTime: d.sleepTime!, busy,
        requestNow: !!requestNow, standingRequests: standing,
      })
      if (!check.ok) throw new Error(`Gemini's plan didn't fit (${check.reason}).`)
      return { shown: toResult(check.slots, x.result), note: typeof data.note === 'string' ? data.note.trim() : '', failed: '' }
    } catch (e) {
      const failed = e instanceof DOMException && e.name === 'AbortError' ? 'Gemini took too long.' : chatErrorText(e, 'Gemini is not available right now.')
      return { shown: x.result, note: '', failed }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Lets Gemini improve each day type's rule-based plan, then shows
   *  whichever passed the checks. The student's request (if any) is
   *  Gemini's top priority. */
  async function refineAndShow(d: Draft, drafts: { group: DayGroup; result: GeneratorResult; weak: string[] }[], requestNow: string | null) {
    const p = profileRef.current
    const seq = ++refineSeq.current
    const standing = p ? standingRequests(p.events.filter(e => !requestNow || e.value !== requestNow.slice(0, 300))) : []
    setTyping(true)
    let outs: { shown: GeneratorResult; note: string; failed: string }[]
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw new Error('Not signed in.')
      outs = await Promise.all(drafts.map(x => refineOne(d, x, session.access_token, requestNow, standing, drafts.length)))
    } catch (e) {
      const failed = chatErrorText(e, 'Gemini is not available right now.')
      outs = drafts.map(x => ({ shown: x.result, note: '', failed }))
    }
    if (seq !== refineSeq.current) return
    setTyping(false)
    const next: DayPlan[] = drafts.map((x, i) => ({ group: x.group, result: outs[i].shown, plain: outs[i].shown === x.result ? null : x.result }))
    setPlans(next)
    const failed = outs.find(o => o.failed)?.failed
    const notes = uniq(outs.map(o => o.note).filter(Boolean))
    const head = requestNow && failed
      ? `I couldn't apply that just now (${failed.replace(/\.$/, '')}). Here's your plan without it; try asking again in a moment.\n\n`
      : notes.length ? `✨ ${notes.join(' ')}\n\n` : ''
    ask('preview', head + formatWeekPlan(next.map(x => ({ label: x.group.label, result: x.result })), restLabel(next)))
  }

  // ── Options for the current question ──────────────────────────────────

  let options: ChatOption[] = []
  let doneLabel = 'Done'
  const multi = MULTI_STEPS.includes(step)
  const recs = recsRef.current
  if (step === 'subjects') {
    const names = profile ? subjectChoices(profile.known, profile.remembered) : []
    options = uniqueCaseless([...names, ...draft.subjects, ...picked.map(id => id.slice(5))]).map(n => ({ id: `subj:${n}`, label: n }))
  } else if (step === 'sites') {
    // Ranked by the student's own history, students in the same exam and
    // their Study DNA; the platforms themselves are the fixed real list.
    const ranked = profile ? rank({ field: sitesField(subject), events: profile.events, peers: profile.peers[sitesField(subject)], priors: sitePriors(profile.known.dna), now: Date.now() }) : []
    const scoreOf = (site: string | null) => ranked.find(c => c.value === (site ?? 'offline'))
    const custom = uniq([...(draft.allow[subject]?.sites || []), ...picked.filter(id => id.startsWith('site:')).map(id => id.slice(5)),
      ...ranked.map(c => c.value).filter(v => v !== 'offline' && !!siteFromText(v))])
      .filter(s => !STUDY_MODE_OPTIONS.some(o => o.site === s))
    const noteFor = (c: Candidate | undefined) => (c && (c.source === 'peers' || c.source === 'request') ? ` · ${sourceLabel(c.source, exam)}` : '')
    options = [
      ...STUDY_MODE_OPTIONS.map(o => ({ id: o.id, label: o.label + noteFor(scoreOf(o.site)), score: scoreOf(o.site)?.score ?? 0 })),
      ...custom.map(s => ({ id: `site:${s}`, label: s + noteFor(scoreOf(s)), score: scoreOf(s)?.score ?? 0 })),
    ].sort((a, b) => b.score - a.score).map(({ id, label }) => ({ id, label }))
    doneLabel = picked.length ? 'Done' : 'Skip'
  } else if (step === 'channels') {
    const seen = new Set<string>()
    options = [
      ...(draft.allow[subject]?.channels || []).map(c => ({ id: c.id, label: c.label })),
      ...(channelSugs[subject] || []).map(c => ({
        id: c.id,
        label: c.pickCount > 0 ? `${c.label} · ${c.pickCount} ${exam ? `${exam} ` : ''}students` : c.note ? `${c.label} · ${c.note}` : c.label,
      })),
    ].filter(o => !seen.has(o.id) && !!seen.add(o.id))
    doneLabel = picked.length ? 'Done' : 'Skip'
  } else if (step === 'apps') {
    const dev = deviceApps || []
    const ids = uniq([...dev.map(a => a.id), ...(draft.allow[subject]?.apps || []), ...picked.map(id => id.slice(4))])
    options = ids.map(id => ({ id: `app:${id}`, label: dev.find(a => a.id === id)?.label || id }))
    doneLabel = picked.length ? 'Done' : 'No apps'
  } else if (step === 'apps_mode') {
    options = [{ id: 'whitelist', label: 'Keep only these open' }, { id: 'blacklist', label: 'Close these apps' }]
  } else if (step === 'busy') {
    const custom = uniq([...draft.busy, ...picked]).filter(v => v !== NOTHING_FIXED && !BUSY_OPTIONS.some(o => o.value === v))
    options = [
      ...BUSY_OPTIONS.map(o => ({ id: o.value, label: o.label })),
      ...custom.map(v => ({ id: v, label: fmtBusy(v) })),
      { id: NOTHING_FIXED, label: 'Nothing fixed' },
    ]
  } else if (step === 'days') {
    const rec = recs?.dayStructure
    const note = rec && rec.value === draft.dayStructure ? why(rec) : 'current'
    options = DAY_STRUCTURE_OPTIONS
      .filter(o => o.id !== 'split' || draft.subjects.length >= 2)
      .map(o => ({ id: o.id, label: o.id === draft.dayStructure && note ? `${o.label} (${note})` : o.label }))
  } else if (step === 'subject_days') {
    options = WEEK_ORDER.map(n => ({ id: `day:${n}`, label: DAY_SHORT[n] }))
  } else if (step === 'hours') {
    const rec = recs?.dailyMinutes
    options = profile ? hoursOptions(profile.known, profile.remembered, { minutes: draft.dailyMinutes, why: rec?.value === String(draft.dailyMinutes) ? why(rec) : 'current' }) : []
  } else if (step === 'block') {
    const rec = recs?.blockMinutes
    options = blockOptions(draft.blockMinutes, rec?.value === String(draft.blockMinutes) ? why(rec) : 'current')
  } else if (step === 'wake' || step === 'sleep') {
    const rec = step === 'wake' ? recs?.wake : recs?.sleep
    const current = step === 'wake' ? draft.wakeTime : draft.sleepTime
    const note = current && rec?.value === current ? why(rec) : current ? 'current' : null
    options = clockOptions(step, current, note)
  } else if (step === 'preview') {
    options = [
      { id: 'confirm', label: 'Confirm this plan' }, { id: 'hours', label: 'Change study hours' },
      ...(profile && needsBusyQuestion(profile.known.dna) ? [{ id: 'busy', label: 'Change busy times' }] : []),
      { id: 'times', label: 'Change wake/sleep times' }, { id: 'block', label: 'Change block length' },
      ...(profile && (draft.subjects.length >= 2 || needsBusyQuestion(profile.known.dna)) ? [{ id: 'days', label: 'Change day types' }] : []),
      ...(draft.dayStructure === 'split' ? [{ id: 'subject_days', label: 'Change subject days' }] : []),
      { id: 'setup', label: 'Change subjects & sites' },
      ...(hasPlain ? [{ id: 'plain', label: 'Use the plan without AI changes' }] : []),
    ]
  } else if (step === 'done') {
    options = [{ id: 'again', label: 'Plan again' }, { id: 'setup', label: 'Change subjects & sites' }]
  }
  const filtering = FILTER_STEPS.includes(step)
  const shown = filtering ? filterOptions(options, input) : options

  // ── Answers ────────────────────────────────────────────────────────────

  function togglePick(id: string, forceOn = false) {
    if (busy) return
    const on = forceOn || !picked.includes(id)
    if (on && picked.includes(id)) return
    if (step === 'busy') {
      // "Nothing fixed" and actual busy times rule each other out.
      setPicked(p => (on ? (id === NOTHING_FIXED ? [NOTHING_FIXED] : [...p.filter(x => x !== NOTHING_FIXED), id]) : p.filter(x => x !== id)))
      return
    }
    setPicked(p => (on ? [...p, id] : p.filter(x => x !== id)))
    if (step === 'channels') {
      const ch = options.find(o => o.id === id)
      const label = (channelSugs[subject] || []).find(c => c.id === id)?.label || ch?.label || id
      void setChannelPick(sb as any, {
        examKey: examFamilyKey(exam), subjectKey: subjectKey(subject),
        channelId: id, channelLabel: label, picked: on,
      }).catch(() => {})
    }
  }

  function commitMulti() {
    if (busy) return
    let d = draft
    const labelOf = (id: string) => options.find(o => o.id === id)?.label || id
    if (step === 'subjects') {
      const subjects = uniqueCaseless(picked.map(id => id.slice(5)))
      if (!subjects.length) { say('Pick at least one subject, or type one.'); return }
      echo(subjects.join(', '))
      // A new subject list gets a freshly balanced week.
      if (subjects.join('\u0000') !== d.subjects.join('\u0000')) d = { ...d, subjectDays: {} }
      const allow: Record<string, SubjectAllowlist> = {}
      for (const s of subjects) allow[s] = d.allow[s] || emptyAllow()
      const p = profileRef.current
      if (subjectsGapRef.current && p) {
        // First visit: pre-fill how each subject is studied and keep going;
        // "Change subjects & sites" on the plan still opens the full set-up.
        subjectsGapRef.current = false
        const now = Date.now()
        for (const s of subjects) {
          if (isEnforceable(allow[s])) continue
          const picks = recommendSites(p, s, now)
          if (picks.length) {
            allow[s] = { ...allow[s], sites: picks }
            if (recsRef.current) recsRef.current.sites[s] = picks
          }
        }
        nextGap({ ...d, subjects, allow })
        return
      }
      enterSites({ ...d, subjects, allow }, 0)
      return
    }
    if (step === 'subject_days') {
      const days = WEEK_ORDER.filter(n => picked.includes(`day:${n}`))
      if (!days.length) { say(`Pick at least one day for ${subject}.`); return }
      echo(`${subject}: ${daysLabel(days)}`)
      const next = { ...d, subjectDays: { ...d.subjectDays, [subject]: days } }
      enterSubjectDays(next, planSubjects(d).indexOf(subject) + 1)
      return
    }
    if (step === 'busy') {
      const windows = picked.filter(v => v !== NOTHING_FIXED)
      echo(windows.length ? windows.map(labelOf).join(', ') : 'Nothing fixed')
      nextGap({ ...d, busy: windows })
      return
    }
    const cur = d.allow[subject] || emptyAllow()
    if (step === 'sites') {
      const sites = uniq(picked.flatMap(id => {
        if (id.startsWith('site:')) return [id.slice(5)]
        const site = STUDY_MODE_OPTIONS.find(o => o.id === id)?.site
        return site ? [site] : []
      }))
      echo(picked.length ? picked.map(id => labelOf(id).split(' · ')[0]).join(', ') : 'Nothing for this one')
      const hasYoutube = sites.some(isYoutubeSite)
      const next = withAllow(d, subject, { sites, channels: hasYoutube ? cur.channels || [] : [] })
      if (hasYoutube) enterChannels(next, subjIdx)
      else if (appPickerAvailable()) enterApps(next, subjIdx)
      else afterSubject(next, subjIdx)
      return
    }
    if (step === 'channels') {
      const pool = [...(channelSugs[subject] || []), ...(cur.channels || [])]
      const channels = uniq(picked).map(id => pool.find(c => c.id === id)).filter((c): c is ChannelPick => !!c)
        .map(c => ({ id: c.id, label: c.label }))
      echo(channels.length ? channels.map(c => c.label).join(', ') : 'Skip, allow all of YouTube')
      const next = withAllow(d, subject, { channels })
      if (appPickerAvailable()) enterApps(next, subjIdx)
      else afterSubject(next, subjIdx)
      return
    }
    if (step === 'apps') {
      const apps = uniq(picked.map(id => id.slice(4)))
      echo(apps.length ? picked.map(labelOf).join(', ') : 'No apps')
      const next = withAllow(d, subject, { apps, appsMode: apps.length ? cur.appsMode : undefined })
      if (apps.length) enterAppsMode(next, subjIdx)
      else afterSubject(next, subjIdx)
    }
  }

  function pickSingle(opt: ChatOption) {
    if (busy) return
    const d = draft
    if (step === 'preview' && opt.id === 'confirm') { void confirmRecommended(d); return }
    echo(opt.label)
    if (step === 'apps_mode') {
      afterSubject(withAllow(d, subject, { appsMode: opt.id === 'whitelist' ? 'whitelist' : 'blacklist' }), subjIdx)
    } else if (step === 'days') {
      if (isDayStructure(opt.id)) nextGap({ ...d, dayStructure: opt.id })
    } else if (step === 'hours') {
      const minutes = minutesFromOptionId(opt.id)
      if (minutes) nextGap({ ...d, dailyMinutes: minutes })
    } else if (step === 'block') {
      const m = /^b(\d+)$/.exec(opt.id)
      if (m) nextGap({ ...d, blockMinutes: parseInt(m[1], 10) })
    } else if (step === 'wake') {
      afterWake({ ...d, wakeTime: opt.id })
    } else if (step === 'sleep') {
      nextGap({ ...d, sleepTime: opt.id })
    } else if (step === 'preview') {
      if (opt.id === 'hours') enterHours(d)
      else if (opt.id === 'busy') enterBusy(d)
      else if (opt.id === 'times') { gapsRef.current = ['sleep']; enterWake(d) }
      else if (opt.id === 'block') enterBlock(d)
      else if (opt.id === 'days') enterDays(d)
      else if (opt.id === 'subject_days') enterSubjectDays(d, 0)
      else if (opt.id === 'plain' && plans && hasPlain) {
        const plainPlans = plans.map(x => ({ group: x.group, result: x.plain ?? x.result, plain: null }))
        setPlans(plainPlans)
        ask('preview', formatWeekPlan(plainPlans.map(x => ({ label: x.group.label, result: x.result })), restLabel(plainPlans)))
      }
      else enterSubjects(d)
    } else if (step === 'done') {
      if (opt.id === 'again') buildPreview(d); else enterSubjects(d)
    }
  }

  // Sleep follows wake only when it is still open too.
  function afterWake(d: Draft) {
    if (gapsRef.current[0] === 'sleep') { gapsRef.current.shift(); enterSleep(d) } else nextGap(d)
  }

  async function searchChannel(name: string, query: string) {
    setTyping(true)
    try {
      const m = await resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, query)
      if (!m) { say(`I couldn't find a YouTube channel called "${query}". Try another name.`); return }
      const found: ChannelSuggestion = { id: channelPickId(m), label: m.title, pickCount: 0, score: 0 }
      setChannelSugs(prev => ({ ...prev, [name]: [found, ...(prev[name] || []).filter(c => c.id !== found.id)] }))
      setPicked(p => (p.includes(found.id) ? p : [...p, found.id]))
      // Counts toward this exam's ranking straight away, and toward other
      // exams' "popular for this subject" list too.
      void setChannelPick(sb as any, {
        examKey: examFamilyKey(exam), subjectKey: subjectKey(name),
        channelId: found.id, channelLabel: found.label, picked: true,
      }).catch(() => {})
      say(`Found ${m.title} and ticked it. I'll remember it for ${name}.`)
    } catch (e) {
      say(chatErrorText(e, "I couldn't search YouTube just now."))
    } finally {
      setTyping(false)
    }
  }

  /** Applies a request Wynky understood on its own and remembers it as the
   *  student's preference. Returns false when it isn't one. */
  function applyLocalRequest(text: string, d: Draft): Draft | false {
    const req = parseLocalRequest(text, d.subjects, { parseClock, siteFromText })
    if (!req) return false
    if (req.kind === 'hours') {
      learn([{ field: 'daily_minutes', value: String(req.minutes), action: 'requested' }])
      say(`Got it, ${fmtHours(req.minutes)}. I'll remember that.`)
      return { ...d, dailyMinutes: req.minutes }
    }
    if (req.kind === 'block') {
      learn([{ field: 'block_minutes', value: String(req.minutes), action: 'requested' }])
      say(`Got it, ${req.minutes}-minute blocks from now on.`)
      return { ...d, blockMinutes: req.minutes }
    }
    if (req.kind === 'wake' || req.kind === 'sleep') {
      learn([{ field: req.kind, value: req.time, action: 'requested' }])
      say(`Got it, ${req.kind === 'wake' ? 'up at' : 'asleep by'} ${fmtClock(req.time)}. I'll remember that.`)
      return req.kind === 'wake' ? { ...d, wakeTime: req.time } : { ...d, sleepTime: req.time }
    }
    if (req.kind !== 'site') return d
    const target = req.subject ?? (d.subjects.length === 1 ? d.subjects[0] : null)
    if (!target) {
      say(`Which subject is ${req.site} for? Say it like "${req.site} for ${d.subjects[0] || 'Physics'}".`)
      return d
    }
    const cur = d.allow[target] || emptyAllow()
    learn([{ field: sitesField(target), value: req.site, multi: true, action: 'requested' }])
    say(`Got it, ${req.site} stays open during ${target}. I'll remember that.`)
    return withAllow(d, target, { sites: uniq([...cur.sites, req.site]) })
  }

  async function submit() {
    const text = input.trim()
    if (!text || busy || step === 'signed_out') return
    const match = clearMatch(options, text)
    // "phy" with Physics and Physical Education both showing: let them tap
    // one rather than adding "phy" as its own subject, site or app.
    if (!match && (step === 'subjects' || step === 'sites' || step === 'apps') && filterOptions(options, text).length > 1) return
    setInput('')
    if (step === 'subjects') {
      if (match) togglePick(match.id, true)
      else setPicked(p => (p.some(id => id.toLowerCase() === `subj:${text}`.toLowerCase()) ? p : [...p, `subj:${text}`]))
    } else if (step === 'sites') {
      if (match) { togglePick(match.id, true); return }
      const site = siteFromText(text)
      // A typed khanacademy.org is the Khan Academy option, not a second copy of it.
      if (site) {
        togglePick(STUDY_MODE_OPTIONS.find(o => o.site === site)?.id ?? `site:${site}`, true)
        learn([{ field: sitesField(subject), value: site, multi: true, action: 'requested' }])
        return
      }
      echo(text)
      say('Type a website like allen.ac.in, or pick one of the options.')
    } else if (step === 'channels') {
      if (match) { togglePick(match.id, true); return }
      echo(text)
      await searchChannel(subject, text)
    } else if (step === 'apps') {
      togglePick(match ? match.id : `app:${text}`, true)
    } else if (step === 'busy') {
      const value = parseBusyText(text)
      if (value) { togglePick(value, true); return }
      if (/^(none|nothing|no|free)\b/i.test(text)) { togglePick(NOTHING_FIXED, true); return }
      echo(text)
      say('Type a time like 4-7 pm, or tap the options.')
    } else if (step === 'apps_mode' || step === 'days') {
      if (match) { pickSingle(match); return }
      echo(text)
      say(step === 'days' ? 'Tap one of the options.' : 'Tap one of the two options.')
    } else if (step === 'subject_days') {
      if (match) { togglePick(match.id, true); return }
      echo(text)
      say('Tap the days, like Mon or Thu, then Done.')
    } else if (step === 'hours') {
      if (match) { pickSingle(match); return }
      echo(text)
      const minutes = parseStudyMinutes(text)
      if (minutes) nextGap({ ...draft, dailyMinutes: minutes })
      else say("I didn't catch that. Pick an option, or type the hours, like 5.")
    } else if (step === 'block') {
      if (match) { pickSingle(match); return }
      echo(text)
      const minutes = parseStudyMinutes(/\d\s*$/.test(text) ? `${text} min` : text)
      if (minutes && minutes <= 180) nextGap({ ...draft, blockMinutes: minutes })
      else say('Pick an option, or type the minutes, like 50.')
    } else if (step === 'wake' || step === 'sleep') {
      if (match) { pickSingle(match); return }
      echo(text)
      const t = parseClock(text, step)
      if (!t) say('Type a time like 6:30 am, or pick one of the options.')
      else if (step === 'wake') afterWake({ ...draft, wakeTime: t })
      else nextGap({ ...draft, sleepTime: t })
    } else {
      // preview / done: simple requests are handled here and
      // remembered; anything else goes to the AI.
      const exact = options.find(o => o.label.toLowerCase() === text.toLowerCase())
      if (exact) { pickSingle(exact); return }
      echo(text)
      const updated = applyLocalRequest(text, draft)
      if (updated) { if (updated !== draft) buildPreview(updated); return }
      askAi(draft, text)
    }
  }

  /** A request Wynky can't apply by itself: Gemini rebuilds the plan with
   *  it as the top priority, and it is remembered (with the confirmed plan)
   *  so every later plan follows it too. */
  function askAi(d: Draft, text: string) {
    learn([{ field: 'note', value: text.slice(0, 300), action: 'requested' }])
    say("Got it. I'll build your plan around that and remember it for next time.")
    buildPreview(d, text)
  }

  // ── Saving ─────────────────────────────────────────────────────────────

  /** What to learn from a confirmed plan: each answer kept or changed,
   *  sites added or dropped per subject, and how long the set-up took. */
  function confirmedEvents(d: Draft): NewEvent[] {
    const r = recsRef.current
    const kept = (c: Candidate | null | undefined, value: string) => (c && c.value === value ? 'accepted' : 'changed') as NewEvent['action']
    const out: NewEvent[] = [
      { field: 'daily_minutes', value: String(d.dailyMinutes), action: kept(r?.dailyMinutes, String(d.dailyMinutes)) },
      { field: 'block_minutes', value: String(d.blockMinutes), action: kept(r?.blockMinutes, String(d.blockMinutes)) },
      { field: 'setup_seconds', value: String(Math.round((Date.now() - openedAt.current) / 1000)), action: 'accepted' },
    ]
    if (d.wakeTime) out.push({ field: 'wake', value: d.wakeTime, action: kept(r?.wake, d.wakeTime) })
    if (d.sleepTime) out.push({ field: 'sleep', value: d.sleepTime, action: kept(r?.sleep, d.sleepTime) })
    if (profileRef.current && needsBusyQuestion(profileRef.current.known.dna)) {
      out.push({ field: 'busy', value: busyValue(d.busy), action: kept(r?.busy, busyValue(d.busy)) })
    }
    // Never asked (one subject, no busy times): the default isn't an answer.
    if (daysAskedRef.current) out.push({ field: 'day_structure', value: d.dayStructure, action: kept(r?.dayStructure, d.dayStructure) })
    if (d.dayStructure === 'split') {
      // Only days the student set on the day chips; Wynky's own fill is
      // recomputed every time so the week can rebalance.
      for (const s of planSubjects(d)) {
        const value = d.subjectDays[s] ? daysValue(d.subjectDays[s]) : ''
        if (value) out.push({ field: daysField(s), value, action: r?.subjectDays[s] === value ? 'accepted' : 'changed' })
      }
    }
    for (const s of d.subjects) {
      const sites = d.allow[s]?.sites || []
      for (const site of sites) out.push({ field: sitesField(s), value: site, multi: true, action: 'accepted' })
      if (!sites.length && isEnforceable(d.allow[s])) out.push({ field: sitesField(s), value: 'offline', multi: true, action: 'accepted' })
      for (const site of r?.sites[s] || []) if (!sites.includes(site)) out.push({ field: sitesField(s), value: site, multi: true, action: 'removed' })
    }
    return out
  }

  function finishConfirmed(skipped: number, dayTypes: number) {
    const note = skipped > 0 ? ` I left out ${skipped} block${skipped === 1 ? '' : 's'} with nothing to lock.` : ''
    const saved = dayTypes > 1 ? ` I saved it as ${dayTypes} schedules, one for each day type.` : ''
    ask('done', `Done, it's live.${saved} Focus Lock will follow it from the next scheduled block, and it's in Your Schedule too.${note} Next time I'll have it ready even faster.`)
  }

  function saveFailed(e: unknown, d: Draft) {
    if (e instanceof NoEnforceableBlocksError) {
      say(e.message)
      if (d.subjects.length) enterSites(d, 0); else enterSubjects(d)
    } else {
      // The question stays open, so Confirm is still there to retry.
      say(chatErrorText(e, 'Could not save that plan.'))
    }
  }

  async function confirmRecommended(d: Draft) {
    const p = profileRef.current
    if (!p || !plans?.length || !d.wakeTime || !d.sleepTime) return
    echo('Confirm this plan')
    setSaving(true)
    try {
      const { freeSites, freeApps } = freeTimeLists()
      const allow = allowFor(d)
      const written: { days_of_week: number[]; slots: AiSlot[] }[] = []
      let skipped = 0
      // One schedule per day type, each only on its own days.
      for (const x of plans) {
        const planName = planNameFor(x.group, plans.length)
        const { writtenSlots } = await confirmPlan(sb as any, {
          userId: p.uid, planName, result: x.result, subjectAllowlists: allow,
          freeTimeSites: freeSites, freeTimeApps: freeApps, daysOfWeek: x.group.days,
        })
        const slots = toAiSlots(writtenSlots)
        written.push({ days_of_week: x.group.days, slots })
        skipped += x.result.blocks.filter(b => b.kind === 'study').length - slots.filter(s => !s.is_sleep).length
      }
      // The plan is saved at this point; remembering and learning are best-effort.
      await rememberAnswers(sb as any, p.uid, { wakeTime: d.wakeTime, sleepTime: d.sleepTime, subjectAllowlists: allow }).catch(() => {})
      saveLearning(d, confirmedEvents(d), { planFields: true })
      const days = plans.reduce((n, x) => n + x.group.days.length, 0)
      const weekMinutes = plans.reduce((n, x) => n + x.result.placedStudyMinutes * x.group.days.length, 0)
      await recordOutcome(sb as any, {
        source: hasPlain ? 'ai_custom' : 'rule_based', requestedMinutes: d.dailyMinutes, confirmedMinutes: Math.round(weekMinutes / Math.max(1, days)),
        outcome: String(d.dailyMinutes) === recsRef.current?.dailyMinutes?.value ? 'accepted_as_is' : 'accepted_edited',
      }).catch(() => {})
      // Every day type saved: they replace all older Wynky schedules, so two
      // plans never run on the same day. After a failure part-way nothing is
      // removed, and tapping Confirm again overwrites the same names.
      await removeStaleWynkyPlans(sb as any, p.uid, plans.map(x => planNameFor(x.group, plans.length)), isWynkyPlanName).catch(() => {})
      onPlanConfirmed(written)
      finishConfirmed(skipped, plans.length)
    } catch (e) {
      saveFailed(e, d)
    } finally {
      setSaving(false)
    }
  }

  // ── View ───────────────────────────────────────────────────────────────

  let hint: string | null = null
  if (step === 'channels' && channelsLoadingFor === subject) hint = 'Looking up channels on YouTube…'
  else if (step === 'apps' && appsLoading) hint = 'Loading your apps…'
  else if (filtering && input.trim() && !shown.length) {
    const typed = input.trim()
    if (step === 'channels') hint = `Press Enter to search YouTube for "${typed}"`
    else if (step === 'sites') hint = siteFromText(typed) ? `Press Enter to add ${siteFromText(typed)}` : 'Type a full website, like allen.ac.in'
    else if (multi) hint = `Press Enter to add "${typed}"`
    else hint = 'Press Enter to use what you typed'
  } else if (shown.length > MAX_SHOWN_OPTIONS) hint = `Showing ${MAX_SHOWN_OPTIONS} of ${shown.length}. Keep typing to narrow it down.`

  const placeholder = step === 'loading' ? 'Wynky is getting ready…'
    : step === 'signed_out' ? 'Sign in to use Wynky'
    : step === 'channels' ? 'Type a channel name to search YouTube…'
    : step === 'sites' ? 'Start typing to see options, or type a website…'
    : step === 'busy' ? 'Type a time like 4-7 pm…'
    : filtering || step === 'apps_mode' || step === 'block' ? 'Start typing to see options…'
    : 'Or tell me what to change, like "5 hours" or "pw.live for Physics"…'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Wynko AI assistant"
        className="rounded-2xl border w-[520px] max-w-full h-[640px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: '#161618', borderColor: '#3A3A3A', boxShadow: 'none' }}>

        {/* Header */}
        <div className="flex items-center gap-3.5 px-5 py-4 border-b flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1C1C1F,#1C1C1F)', borderColor: '#26262A' }}>
          <MascotAvatar size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-wk-orange-300 font-mono tracking-[0.15em] mb-0.5">AI ASSISTANT</div>
            <div className="text-base font-bold text-white leading-tight">Create Your Study Schedule</div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: 'none' }} /> Online
            </div>
          </div>
          <button onClick={onClose} aria-label="Close chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-wk-ink-400 hover:text-wk-ink-100 hover:bg-white/5 transition-colors flex-shrink-0">
            <Icon d="M6 18L18 6M6 6l12 12" cls="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {messages.map(m => m.from === 'bot' ? (
            <div key={m.id} className="flex items-end gap-2.5">
              <MascotAvatar size={34} />
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-md text-[13px] text-wk-ink-200 leading-relaxed whitespace-pre-wrap break-words border"
                style={{ background: 'rgba(22,22,24,0.85)', borderColor: '#26262A' }}>
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-[13px] text-wk-black-950 leading-relaxed whitespace-pre-wrap break-words"
                style={{ background: 'linear-gradient(135deg,#FF8A3D,#E9772E)', boxShadow: 'none' }}>{m.text}</div>
            </div>
          ))}
          {typing && (
            <div className="flex items-end gap-2.5">
              <MascotAvatar size={34} />
              <div className="px-4 py-3.5 rounded-2xl rounded-bl-md border flex items-center gap-1.5" aria-label="Assistant is typing"
                style={{ background: 'rgba(22,22,24,0.85)', borderColor: '#26262A' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-wk-orange-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick replies for the current question */}
        {(options.length > 0 || multi || hint) && step !== 'loading' && (
          <div className="px-4 pt-3 border-t flex-shrink-0" style={{ borderColor: '#26262A' }}>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto" role="group" aria-label="Options">
              {shown.slice(0, MAX_SHOWN_OPTIONS).map(o => {
                const on = multi && picked.includes(o.id)
                const primary = !multi && o.id === 'confirm'
                return (
                  <button key={o.id} type="button" disabled={busy} aria-pressed={multi ? on : undefined}
                    onClick={() => (multi ? togglePick(o.id) : pickSingle(o))}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors disabled:opacity-50 ${
                      primary ? 'bg-emerald-600 border-emerald-500 text-white font-semibold hover:bg-emerald-500'
                      : on ? 'bg-wk-orange-500/15 border-wk-orange-500 text-wk-orange-300'
                      : 'border-[#26262A] text-wk-ink-300 hover:text-wk-ink-100 hover:border-wk-orange-500/50'}`}>
                    {primary && saving ? 'Saving…' : o.label}{on ? ' ✓' : ''}
                  </button>
                )
              })}
              {multi && (
                <button type="button" disabled={busy} onClick={commitMulti}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold text-wk-black-950 bg-wk-orange-500 hover:bg-wk-orange-300 disabled:opacity-50">
                  {doneLabel}
                </button>
              )}
            </div>
            {hint && <div className="text-[11px] text-wk-ink-500 mt-2">{hint}</div>}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 flex-shrink-0">
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
            disabled={busy || step === 'signed_out'} placeholder={placeholder} aria-label="Message Wynky"
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-wk-ink-200 outline-none placeholder-wk-ink-600 focus:border-wk-orange-500/50 transition-colors border-[#26262A] disabled:opacity-60" />
          <button onClick={() => void submit()} disabled={!input.trim() || busy || step === 'signed_out'} aria-label="Send message"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-wk-black-950 flex-shrink-0 transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#FF8A3D', boxShadow: 'none' }}>
            <Icon d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" cls="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
