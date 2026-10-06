import { useEffect, useRef, useState } from 'react'
import wynkoMascot from '../imports/wynko-mascot.png'
import { sb } from '../../_shared/supabaseClient'
import { REVM2_CONFIG } from '../../../lib/supabase.js'
import {
  loadKnownProfile, loadRemembered, loadEvents, recordEvents, fetchPeerStats, fetchChannelSignals,
  defaultDailyMinutes, bucketMinutes, distractionSites, distractionApps,
  recommend, confirmPlan, confirmWeekPlan, rememberAnswers, rememberAllowlists, saveChatSettings, loadChatSettings, recordOutcome, loadStudyMinutes, weakSubjects,
  NoEnforceableBlocksError, STUDY_MODE_OPTIONS, examFamilyKey, loadMemory, rememberFacts, forgetFacts, type MemoryItem, subjectKey, seedQueriesFor,
  resolveChannelSeed, fetchPopularChannels, setChannelPick, channelPickId, appPickerAvailable, listPickableApps,
  type WynkyKnownProfile, type WynkyRemembered, type SubjectAllowlist, type AiSlot, type ChannelPick,
  type PickableApp, type PlanSlotInput, type NewEvent, type DayOverrides,
} from './wynkyPlanner'
import {
  subjectChoices, examSubjects, uniqueCaseless, isEnforceable, hoursOptions, minutesFromOptionId,
  parseStudyMinutes, clockOptions, parseClock, fmtClock, fmtHours, siteFromText, filterOptions, clearMatch,
  blockOptions, parseBusyText, fmtBusy, formatRecommendedPlan, mentionsWeek, wantsWeeklyVariation, formatWeeklyPlan,
  formatDayOverrides, repeatWeek, WEEK_ORDER, DAY_NAMES, planDays, dayLabel, repeatFromText, mentionedDays,
  wantsDaysOff, mentionsWeekB, planTimelineDays, type ChatOption, type Repeat,
} from './wynkyChatFlow'
import {
  rank, best, preselect, isSettled, latestOwn, sourceLabel, blockMinutesPriors, sitePriors, busyPriors, needsBusyQuestion,
  parseBusy, parseLocalRequest, BUSY_OPTIONS, NOTHING_FIXED,
  type WynkyEvent, type PeerStats, type Candidate, type Prior,
} from './wynkyRecommender'
import PlanMessage from './PlanMessage'
import ScheduleTables from './ScheduleTables'
import type { Day as TimelineDay, TimelineSettings } from './scheduleTimeline'
import { draftSlots, standingRequests, checkRefined, checkRefinedWeek, toResult, recentChat, planForChat, chatPlan, memoryLines, droppedRules, type ChatSettings, type ChatDay } from './wynkyRefine'
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

   Once the first plan is shown, everything typed goes to the AI chat
   mode (chatAi): it reads the whole conversation, the plan on screen and
   the settings agreed so far (hours, session length, windows, rules),
   answers in its own words and returns the full updated plan. Those
   settings are kept for every later message, so nothing said once is
   dropped; the plan buttons (hours, times, block length) go through the
   same path once the chat has been used.
   ============================================================ */

type Step = 'loading' | 'signed_out' | 'subjects' | 'sites' | 'channels' | 'apps' | 'apps_mode'
  | 'busy' | 'hours' | 'block' | 'wake' | 'sleep' | 'preview' | 'done'
  | 'week_choice' | 'days' | 'repeat' | 'override_day' | 'override_subject' | 'override_slot'

type Gap = 'subjects' | 'busy' | 'wake' | 'sleep' | 'hours'

const MULTI_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps', 'busy', 'days']
// Steps where typing narrows the options, like "Start typing to see options…".
const FILTER_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps', 'hours', 'wake', 'sleep']

// 'divider' separates earlier chats (past: true) from this one.
/** `sched` is a plan shown as the day-wise timetable: `view` is the message's words without
 *  the plan lines (`text` keeps them, for the history and the AI). Not saved with the chat. */
interface Sched { view: string; days: TimelineDay[]; settings: TimelineSettings }
interface Msg { id: number; from: 'bot' | 'user' | 'divider'; text: string; past?: boolean; sched?: Sched }
// How many earlier messages the chat shows when it opens (the table keeps 300).
const HISTORY_SHOWN = 60
// Set-up questions a typed full request can skip straight past.
const SETUP_STEPS = ['busy', 'hours', 'block', 'wake', 'sleep', 'week_choice', 'days', 'repeat']
/** What the AI reads of the chat: the last 10 messages from earlier chats
 *  (without Wynky's set-up summaries, which say nothing new) followed by
 *  this chat, so a reopened chat carries on from where it stopped. */
function chatHistory(messages: Msg[], text: string) {
  const isSetupText = (m: Msg) => m.from === 'bot' && /^(Welcome back!|Hi, I'm Wynky!)/.test(m.text)
  const earlier = recentChat(messages.filter(m => m.past && !isSetupText(m)), null, 10, 5000)
  return [...earlier, ...recentChat(messages.filter(m => !m.past), text, 16, 9000)]
}
/** A sentence or more, not an answer like "4-7 pm" or "11 hrs". */
const isFullRequest = (text: string) => text.trim().split(/\s+/).length >= 6
interface Profile {
  uid: string
  known: WynkyKnownProfile
  remembered: WynkyRemembered
  events: WynkyEvent[]
  /** What Wynky remembers (Settings > Privacy lists and deletes these). */
  memory: MemoryItem[]
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
}
/** What Wynky recommended when the chat opened, to tell kept from changed. */
interface Recs {
  dailyMinutes: Candidate | null
  blockMinutes: Candidate | null
  busy: Candidate | null
  wake: Candidate | null
  sleep: Candidate | null
  sites: Record<string, string[]>
}
interface ChannelSuggestion extends ChannelPick { pickCount: number; note?: string; score: number }
/** Which days a plan runs on and how often it repeats. */
interface Shape { days: number[]; rep: Repeat }
/** A typed week request waiting on the same-or-different, days and repeat questions. */
interface PendingWeek { text: string | null; vary: boolean; rep: Repeat | null }

const isTwoWeeks = (week: Record<number, GeneratorResult> | null) => !!week && Object.keys(week).some(k => Number(k) >= 7)
const namesWeekA = (text: string) => /\b(week a|this week)\b/i.test(text)
const namesOneWeek = (text: string) => namesWeekA(text) || mentionsWeekB(text)

/** Drops block-only set-ups ("Physics@17:00") whose block the plan no longer has. */
function liveOverrides(overrides: DayOverrides, week: Record<number, GeneratorResult>): DayOverrides {
  const out: DayOverrides = {}
  for (const [dayStr, bySubject] of Object.entries(overrides)) {
    const blocks = week[Number(dayStr)]?.blocks || []
    const kept = Object.entries(bySubject).filter(([key]) => {
      const at = key.lastIndexOf('@')
      return at < 0 || blocks.some(b => b.kind === 'study' && b.startTime === key.slice(at + 1) && (b.subjectName || 'Study') === key.slice(0, at))
    })
    if (kept.length) out[Number(dayStr)] = Object.fromEntries(kept)
  }
  return out
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
// One name for every plan the chat saves, so confirming a new one replaces
// the last one instead of stacking a second active schedule on top.
const PLAN_NAME = 'Wynky Plan'
const MAX_SHOWN_OPTIONS = 40
// Longest Wynky waits for Gemini before showing the rule-based plan. Kept just
// above ai-generate-schedule's 15s budget (TOTAL_BUDGET_MS), where the main
// model, its fallback and Groq race and the first good answer wins.
const REFINE_TIMEOUT_MS = 18_000
// A Week A / Week B plan makes two calls in a row; both share this one wait.
const AB_REFINE_TIMEOUT_MS = 25_000
// The chat mode thinks harder; kept just above its 24s budget (CHAT_BUDGET_MS).
const CHAT_TIMEOUT_MS = 27_000
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

function normalizeAllow(saved: Record<string, SubjectAllowlist>): Record<string, SubjectAllowlist> {
  const out: Record<string, SubjectAllowlist> = {}
  for (const [name, a] of Object.entries(saved || {})) {
    out[name] = { ...a, sites: a?.sites || [], apps: a?.apps || [], channels: a?.channels || [] }
  }
  return out
}

/** Channels and apps the AI chat was asked to allow for a subject. */
interface AllowRequest { subject: string; channels: string[]; apps: string[] }

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
  const value = latestOwn(events, field)
  if (value == null) return fallback
  if (!isSettled(events, field) && !events.some(e => e.field === field && !e.multi && e.action !== 'removed')) return fallback
  const last = events.filter(e => e.field === field && !e.multi).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return { value, score: 1, source: last?.action === 'requested' ? 'request' : 'you' }
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
  // One answer of their own is enough: Wynky asks once, then remembers.
  const answered = (field: string) => isSettled(events, field)
    || events.some(e => e.field === field && !e.multi && e.action !== 'removed')
  const wake = settledOr(events, 'wake', best({ field: 'wake', events, peers: peers.wake, now }))
  const sleep = settledOr(events, 'sleep', best({ field: 'sleep', events, peers: peers.sleep, now }))

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
  }

  const gaps: Gap[] = []
  // Never plan made-up subjects: with none saved anywhere, ask (exam subjects pre-ticked).
  if (!saved.length && !known.subjects.length) gaps.push('subjects')
  if (needsBusyQuestion(dna) && !answered('busy')) gaps.push('busy')
  if (!answered('wake')) gaps.push('wake')
  if (!answered('sleep')) gaps.push('sleep')
  if (!dailyMinutes && remembered.lastDailyMinutes == null) gaps.push('hours')
  return { draft, recs: { dailyMinutes, blockMinutes, busy, wake, sleep, sites }, gaps }
}

export default function WynkyChat({ onClose, onPlanConfirmed }: {
  onClose: () => void
  onPlanConfirmed: (plan: { days_of_week: number[]; slots: AiSlot[] } | { week: Record<number, AiSlot[]> }) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  // The chat as last shown, for AI calls made after an await.
  const messagesRef = useRef<Msg[]>([])
  messagesRef.current = messages
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(true) // Wynky is working: loading, asking the AI, searching YouTube
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<Step>('loading')
  const [subjIdx, setSubjIdx] = useState(0)
  const [picked, setPicked] = useState<string[]>([]) // selected option ids on a pick-several question
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Draft>({ subjects: [], allow: {}, dailyMinutes: 240, blockMinutes: 60, busy: [], wakeTime: null, sleepTime: null })
  const [channelSugs, setChannelSugs] = useState<Record<string, ChannelSuggestion[]>>({})
  const [channelsLoadingFor, setChannelsLoadingFor] = useState<string | null>(null)
  const [deviceApps, setDeviceApps] = useState<PickableApp[] | null>(null)
  const [appsLoading, setAppsLoading] = useState(false)
  const [ruleResult, setRuleResult] = useState<GeneratorResult | null>(null)
  // The plan before Gemini's changes, while the shown plan is Gemini's.
  const [plainResult, setPlainResult] = useState<GeneratorResult | null>(null)
  // Set only when the student asked for a week that varies by day; the
  // preview and Confirm then show/save this instead of ruleResult alone.
  const [weekResult, setWeekResult] = useState<Record<number, GeneratorResult> | null>(null)
  // Days the plan runs on (the rest are days off) and how often it repeats.
  const [activeDays, setActiveDays] = useState<number[]>(ALL_DAYS)
  const [repeat, setRepeat] = useState<Repeat>('weekly')
  // Sites/channels/apps for a subject on one day only ("Tuesday's Physics"),
  // or for one of its blocks that day ("Tuesday's 5 pm Physics").
  const [dayOverrides, setDayOverrides] = useState<DayOverrides>({})
  const [overrideDay, setOverrideDay] = useState<number | null>(null)
  const [overrideSubject, setOverrideSubject] = useState<string | null>(null)
  // While one is being picked, the set-up questions run on a one-subject copy
  // of the draft; the real draft waits here and comes back when it's done.
  const overrideRef = useRef<{ day: number; subject: string; key: string; base: Draft } | null>(null)
  const pendingWeekRef = useRef<PendingWeek | null>(null)
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
  // Only the latest plan request may show its answer.
  const refineSeq = useRef(0)
  // What the AI chat and the student agreed (hours, session length, study
  // windows, rules...). Set once the student has typed to the chat; from
  // then on every change goes through the chat so none of it is lost.
  const chatSettingsRef = useRef<ChatSettings | null>(null)
  /** What was agreed in an earlier chat; the first plan of this chat follows it. */
  const savedChatRef = useRef<ChatSettings | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)
  // Set once signed in; every message after that is saved to the student's history.
  const uidRef = useRef<string | null>(null)
  const [hasHistory, setHasHistory] = useState(false)
  // History writes run one after another, so saved order matches chat order.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve())

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

  /** Saves one message to the student's chat history; best-effort, the
   *  chat works the same if it fails. */
  function remember(sender: 'bot' | 'user', text: string) {
    if (!uidRef.current || !text.trim()) return
    const row = { sender, body: text.slice(0, 8000) }
    writeChain.current = writeChain.current
      .then(() => (sb as any).from('wynky_chat_messages').insert(row))
      .then((res: { error?: unknown } | undefined) => { if (!res?.error) setHasHistory(true) }, () => {})
  }
  /** Shows the student's earlier chats above this one. */
  async function loadHistory() {
    try {
      const { data } = await (sb as any).from('wynky_chat_messages')
        .select('id, sender, body, created_at').order('id', { ascending: false }).limit(HISTORY_SHOWN)
      const rows = (data || []) as { sender: 'bot' | 'user'; body: string; created_at: string }[]
      if (!rows.length) return
      const past: Msg[] = rows.reverse().map(r => ({ id: nextId.current++, from: r.sender, text: r.body, past: true }))
      const last = new Date(rows[rows.length - 1].created_at)
      const when = last.toDateString() === new Date().toDateString() ? 'earlier today'
        : last.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      setMessages(m => [...past, { id: nextId.current++, from: 'divider', text: `Your last chat was ${when} · new chat below`, past: true }, ...m])
      setHasHistory(true)
    } catch { /* no history then */ }
  }
  async function clearHistory() {
    if (!uidRef.current || !window.confirm('Delete your chat history with Wynky? Your saved plans stay as they are.')) return
    try {
      // Wait for saves still on their way, so none lands after the delete.
      await writeChain.current
      const { error } = await (sb as any).from('wynky_chat_messages').delete().eq('user_id', uidRef.current)
      if (error) throw error
      setMessages(m => m.filter(msg => !msg.past))
      setHasHistory(false)
    } catch {
      window.alert("Couldn't clear your history just now. Please try again.")
    }
  }
  function say(text: string, sched?: Sched) {
    const id = nextId.current++
    setMessages(m => [...m, { id, from: 'bot', text, sched }])
    remember('bot', text)
  }
  function echo(text: string) {
    const id = nextId.current++
    setMessages(m => [...m, { id, from: 'user', text }])
    remember('user', text)
  }
  function ask(next: Step, text: string, initialPicked: string[] = [], sched?: Sched) {
    setStep(next)
    setPicked(initialPicked)
    setInput('')
    say(text, sched)
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
  function learnAgreed(d: Draft, hours = true) {
    const p = profileRef.current
    if (!p) return
    const mk = (field: string, value: string): NewEvent => ({ field, value, action: 'requested' })
    const events = [
      ...(d.wakeTime ? [mk('wake', d.wakeTime)] : []),
      ...(d.sleepTime ? [mk('sleep', d.sleepTime)] : []),
      ...(d.busy.length ? [mk('busy', busyValue(d.busy))] : []),
      ...(hours ? [mk('daily_minutes', String(d.dailyMinutes)), mk('block_minutes', String(d.blockMinutes))] : []),
    ].filter(e => {
      const key = `${e.field}|${e.value}|${e.action}`
      if (loggedRef.current.has(key)) return false
      loggedRef.current.add(key)
      return true
    })
    if (!events.length) return
    const at = new Date().toISOString()
    p.events = [...events.map(e => ({ field: e.field, value: e.value, multi: false, action: e.action, at })), ...p.events]
    void recordEvents(sb as any, p.uid, cohort(), events).catch(() => { /* learning is best-effort */ })
  }
  /** Saves facts and rules to what Wynky remembers straight away, and
   *  forgets the ones the student took back. If the memory table isn't
   *  there yet, they're kept as requests saved with a confirmed plan. */
  function saveMemory(add: { fact: string; kind: 'fact' | 'rule' }[], drop: string[]) {
    const p = profileRef.current
    if (!p) return
    const key = (v: string) => v.trim().toLowerCase()
    const gone = new Set(drop.map(key).filter(Boolean))
    const known = new Set(p.memory.map(m => key(m.fact)))
    const fresh = add.map(a => ({ fact: a.fact.trim().slice(0, 300), kind: a.kind }))
      .filter(a => a.fact && !gone.has(key(a.fact)) && !known.has(key(a.fact)))
    const dropped = drop.filter(v => known.has(key(v)) || p.events.some(e => e.field === 'note' && key(e.value) === key(v)))
    if (!fresh.length && !dropped.length) return
    const at = new Date().toISOString()
    p.memory = [
      ...fresh.map((a, i) => ({ id: -Date.now() - i, fact: a.fact, kind: a.kind, created_at: at })),
      ...p.memory.filter(m => !gone.has(key(m.fact))),
    ]
    // Older typed requests with the same words stop being sent too.
    p.events = [...dropped.map(v => ({ field: 'note', value: v.slice(0, 300), multi: false, action: 'removed' as const, at })), ...p.events]
    const c = cohort()
    void (async () => {
      try {
        if (dropped.length) await forgetFacts(sb as any, p.uid, c, dropped)
        if (fresh.length) await rememberFacts(sb as any, p.uid, c, fresh)
      } catch {
        pendingRef.current.push(
          ...fresh.map(a => ({ field: 'note', value: a.fact, action: 'requested' as const })),
          ...dropped.map(v => ({ field: 'note', value: v.slice(0, 300), action: 'removed' as const })),
        )
      }
    })()
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
      await loadHistory()
      if (cancelled) return
      uidRef.current = uid
      let known = EMPTY_KNOWN
      let remembered = EMPTY_REMEMBERED
      let events: WynkyEvent[] = []
      try {
        [known, remembered] = await Promise.all([loadKnownProfile(sb as any, uid), loadRemembered(sb as any, uid)])
      } catch {
        // Start from scratch rather than fail: every answer can be picked again.
      }
      try { events = await loadEvents(sb as any, uid) } catch { /* no history yet */ }
      const memory = await loadMemory(sb as any, uid)
      try { savedChatRef.current = (await loadChatSettings(sb as any, uid)) as ChatSettings | null } catch { /* starts fresh */ }
      let study: Profile['study'] = { bySubject: {}, sessions: 0 }
      try { study = await loadStudyMinutes(sb as any, uid) } catch { /* no weak subjects then */ }
      const now = Date.now()
      events = withRememberedEvents(events, remembered, now)
      const subjectsForPeers = Object.keys(remembered.subjectAllowlists || {}).length
        ? Object.keys(remembered.subjectAllowlists) : known.subjects.length ? known.subjects : examSubjects(known.exam)
      let peers: PeerStats = {}
      try {
        peers = await fetchPeerStats(sb as any, examFamilyKey(known.exam),
          ['wake', 'sleep', 'daily_minutes', 'block_minutes', 'busy', ...uniq(subjectsForPeers.map(sitesField))])
      } catch { /* Study DNA and defaults still work */ }
      if (cancelled) return
      const p: Profile = { uid, known, remembered, events, memory, peers, study }
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
    if (busy.length) lines.push(`• Busy: ${d.busy.map(busyLabel).join(', ')}`)
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
    ask('sites', `How do you study ${name}${onDay()}${count}? Pick everything you use, or type a website. During ${name}${onDay()} I'll keep these open and lock the rest.`, pre)
  }

  function enterChannels(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    ask('channels',
      `Which YouTube channels do you watch for ${name}${onDay()}? These are real channels${exam ? `, ranked by what ${exam} students pick` : ''}. Type a name to search for another, or skip to allow all of YouTube.`,
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
    ask('apps', `Do you use any apps for ${name}${onDay()}? Pick them, or tap No apps.`, (d.allow[name]?.apps || []).map(a => `app:${a}`))
    if (!deviceApps && !appsLoading) void loadApps()
  }

  async function loadApps() {
    setAppsLoading(true)
    try { setDeviceApps(await listPickableApps()) } catch { setDeviceApps([]) } finally { setAppsLoading(false) }
  }

  function enterAppsMode(d: Draft, idx: number) {
    setDraft(d); setSubjIdx(idx)
    const name = d.subjects[idx]
    ask('apps_mode', `During ${name}${onDay()}, should I keep only these apps open, or close them? Keeping only these open closes every other app on your phone and your computer, so choose it only if these are all you need.`)
  }

  function afterSubject(d: Draft, idx: number) {
    if (overrideRef.current) { finishOverride(d); return }
    if (idx + 1 < d.subjects.length) enterSites(d, idx + 1)
    else finishSetup(d)
  }

  // ── Plan shape: days, repeat, day-specific set-up ─────────────────────

  /** " on Tue" (or " on Tue at 17:00") while a day-specific set-up is being picked, else "". */
  function onDay(): string {
    const o = overrideRef.current
    if (!o) return ''
    const time = o.key !== o.subject ? o.key.slice(o.subject.length + 1) : null
    return ` on ${dayLabel(o.day)}${time ? ` at ${fmtClock(time)}` : ''}`
  }

  /** Shows the plan: one day, or the week when anything differs by day
   *  (a varied week, days off, repeat every 2 weeks, a day-specific set-up).
   *  Values not passed come from state; pass the ones just changed, since
   *  state set in the same handler isn't visible yet. */
  function showPlan(v: Partial<{ single: GeneratorResult | null; week: Record<number, GeneratorResult> | null; days: number[]; rep: Repeat; overrides: DayOverrides; busy: string[]; wake: string | null; sleep: string | null }> = {}, head = '') {
    const single = v.single !== undefined ? v.single : ruleResult
    const week = v.week !== undefined ? v.week : weekResult
    const days = v.days ?? activeDays
    const rep = v.rep ?? repeat
    const overrides = v.overrides ?? dayOverrides
    const busy = busyWindows(v.busy ?? draft.busy)
    if (!week && !single) return
    const byDay = week || rep !== 'weekly' || days.length < 7 || Object.keys(overrides).length > 0
    const shownWeek = byDay ? (week ?? repeatWeek(single!)) : null
    const extra = shownWeek ? formatDayOverrides(liveOverrides(overrides, shownWeek)) : ''
    const opts = { activeDays: days, repeat: rep, busy }
    const wordsAndPlan = (tables: boolean) => shownWeek
      ? head + formatWeeklyPlan(shownWeek, { ...opts, tables }) + (extra ? `\n\n${extra}` : '')
      : head + formatRecommendedPlan(single!, busy, { tables })
    // The plan is shown as the day-wise timetable; the message text keeps the
    // plan lines too, for the history and for what the AI reads back.
    const agreed = chatSettingsRef.current
    ask('preview', wordsAndPlan(true), [], {
      view: wordsAndPlan(false),
      days: planTimelineDays(shownWeek, shownWeek ? null : single, days),
      settings: {
        wake: (v.wake !== undefined ? v.wake : draft.wakeTime) ?? undefined,
        sleep: (v.sleep !== undefined ? v.sleep : draft.sleepTime) ?? undefined,
        busy: busy.map(b => `${b.start}-${b.end}`),
        active_days: days,
        lunch: agreed?.lunch,
        dinner: agreed?.dinner,
        named_blocks: agreed?.named_blocks,
      },
    })
  }

  /** The plan as one result per day, for anything that works day by day. */
  function planWeek(): Record<number, GeneratorResult> | null {
    return weekResult ?? (ruleResult ? repeatWeek(ruleResult) : null)
  }

  function enterDays(d: Draft, days: number[]) {
    setDraft(d)
    ask('days', 'Which days should this plan run? Untick any day off, then tap Done.', days.map(day => `wd:${day}`))
  }

  function enterRepeat(d: Draft) {
    setDraft(d)
    ask('repeat', 'How often should it repeat?')
  }

  /** Days or repeat changed from the plan: only a new Week B needs the AI. */
  function applyShape(d: Draft, shape: Shape) {
    setActiveDays(shape.days)
    setRepeat(shape.rep)
    if (shape.rep === 'ab' && !isTwoWeeks(weekResult)) { buildPreview(d, null, true, shape); return }
    let week = weekResult
    let overrides = dayOverrides
    if (shape.rep !== 'ab' && isTwoWeeks(week)) {
      week = Object.fromEntries(Object.entries(week!).filter(([k]) => Number(k) < 7))
      overrides = Object.fromEntries(Object.entries(overrides).filter(([k]) => Number(k) < 7))
      setWeekResult(week)
      setDayOverrides(overrides)
    }
    showPlan({ week, days: shape.days, rep: shape.rep, overrides }, 'Done.\n\n')
  }

  function enterOverrideDay(d: Draft) {
    setDraft(d)
    ask('override_day', 'Which day needs different sites, channels or apps for a subject?')
  }

  function backToPlan() {
    showPlan()
  }

  function enterOverrideSubject(day: number) {
    setOverrideDay(day)
    ask('override_subject', `Which subject on ${dayLabel(day)}?`)
  }

  /** Study blocks of one subject on one day of the plan. */
  function blocksOf(day: number, subject: string) {
    return (planWeek()?.[day]?.blocks || []).filter(b => b.kind === 'study' && (b.subjectName || 'Study') === subject)
  }

  function pickOverrideSubject(d: Draft, day: number, subject: string) {
    if (blocksOf(day, subject).length > 1) {
      setOverrideSubject(subject)
      ask('override_slot', `All ${subject} blocks on ${dayLabel(day)}, or just one?`)
    } else startOverride(d, day, subject, subject)
  }

  /** Runs the usual sites, channels and apps questions for one subject on
   *  one day (key "Physics") or one block of it (key "Physics@17:00"),
   *  starting from the earlier pick, then the day's, then the usual set-up. */
  function startOverride(d: Draft, day: number, subject: string, key: string) {
    overrideRef.current = { day, subject, key, base: d }
    const allow = dayOverrides[day]?.[key] ?? dayOverrides[day]?.[subject] ?? d.allow[subject] ?? emptyAllow()
    enterSites({ ...d, subjects: [subject], allow: { [subject]: allow } }, 0)
  }

  function finishOverride(tmp: Draft) {
    const o = overrideRef.current
    if (!o) return
    overrideRef.current = null
    const next: DayOverrides = { ...dayOverrides, [o.day]: { ...dayOverrides[o.day], [o.key]: tmp.allow[o.subject] || emptyAllow() } }
    setDayOverrides(next)
    setDraft(o.base); setSubjIdx(0)
    const what = o.key === o.subject ? `${o.subject} on ${dayLabel(o.day)}` : `${o.subject} at ${fmtClock(o.key.slice(o.subject.length + 1))} on ${dayLabel(o.day)}`
    showPlan({ overrides: next }, `Done. ${what} will use that; everything else keeps the usual set-up.\n\n`)
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

  /** Subjects the plan can lock anything for. A subject with nothing of
   *  its own to allow still gets blocks when the free-time blocklist can
   *  cover them; otherwise those blocks would be dropped on save. */
  function planSubjects(d: Draft): string[] {
    const { freeSites, freeApps } = freeTimeLists()
    return freeSites.length || freeApps.length ? d.subjects : d.subjects.filter(s => isEnforceable(d.allow[s]))
  }

  // A plan that already differs by day stays that way when it is rebuilt
  // (new hours, times or subjects).
  function buildPreview(d: Draft, requestNow: string | null = null, varyDays = weekResult !== null, shape: Shape = { days: activeDays, rep: repeat }) {
    setDraft(d)
    if (!d.wakeTime) { enterWake(d); return }
    if (!d.sleepTime) { enterSleep(d); return }
    learnAgreed(d, false)
    // A button change after chatting: the chat rebuilds the plan with every
    // rule agreed so far, instead of starting over from the simple rules.
    if (chatSettingsRef.current && ruleResult && !requestNow) {
      void chatAi(`I changed my settings with the buttons: ${fmtHours(d.dailyMinutes)} a day, ${d.blockMinutes}-minute sessions, up at ${fmtClock(d.wakeTime)}, asleep by ${fmtClock(d.sleepTime)}${busyWindows(d.busy).length ? `, busy ${d.busy.map(busyLabel).join(', ')}` : ', nothing fixed'}. Update the plan and keep everything else we agreed.`, d, shape)
      return
    }
    const subjects = planSubjects(d)
    if (!subjects.length) {
      say("To lock anything during study time I need to know how you study. Let's pick that for each subject, it's quick.")
      enterSites(d, 0)
      return
    }
    const p = profileRef.current
    const weak = p ? weakSubjects(subjects, p.study) : []
    const result = recommend({
      wakeTime: d.wakeTime, sleepTime: d.sleepTime, dailyMinutes: d.dailyMinutes, subjects, weak,
      blockLengthMinutes: d.blockMinutes, fixedCommitments: busyWindows(d.busy),
    })
    // A new chat starts from what was agreed last time (rules, named blocks,
    // lunch and dinner, week shape), not from the simple rules alone.
    const saved = savedChatRef.current
    if (saved && !chatSettingsRef.current && !requestNow && result.blocks.some(b => b.kind === 'study')) {
      savedChatRef.current = null
      chatSettingsRef.current = saved
      void chatAi('Show my usual plan again, with everything we agreed before.', d, { days: saved.active_days?.length ? saved.active_days : activeDays, rep: saved.repeat ?? repeat }, result)
      return
    }
    if (!result.blocks.some(b => b.kind === 'study')) {
      const askBusy = !!p && needsBusyQuestion(p.known.dna) && busyWindows(d.busy).length > 0
      say(`Those times don't leave any room for study. Let's go over your ${askBusy ? 'busy times and ' : ''}wake and sleep times again.`)
      gapsRef.current = ['wake', 'sleep']
      if (askBusy) enterBusy(d); else nextGap(d)
      return
    }
    void refineAndShow(d, result, subjects, weak, requestNow, varyDays, shape)
  }

  function standingFor(requestNow: string | null): string[] {
    const p = profileRef.current
    return p ? standingRequests(p.events.filter(e => !requestNow || e.value !== requestNow.slice(0, 300))) : []
  }

  /** One call to ai-generate-schedule; throws with a readable reason. */
  async function callRefine(mode: 'refine' | 'refine_week', d: Draft, base: GeneratorResult, subjects: string[], weak: string[], requestNow: string | null, standing: string[], deadline = Date.now() + REFINE_TIMEOUT_MS) {
    const p = profileRef.current
    const { data: { session } } = await sb.auth.getSession()
    if (!session) throw new Error('Not signed in.')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Math.max(0, Math.min(REFINE_TIMEOUT_MS, deadline - Date.now())))
    try {
      const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode, subjects, weak, draft: draftSlots(base),
          wake: d.wakeTime, sleep: d.sleepTime, busy: busyWindows(d.busy),
          target_minutes: base.placedStudyMinutes, block_minutes: base.blockLengthMinutes,
          facts: p ? studentFacts(p.known) : [], request_now: requestNow, standing_requests: standing,
          history: recentChat(messagesRef.current, requestNow),
        }),
      })
      const data = await res.json()
      // An older deployed function ignores the mode and answers in another shape.
      if (!res.ok || !data.success || data.mode !== mode) throw new Error(data.error || 'Gemini is not available right now.')
      return data
    } catch (e) {
      throw new Error(e instanceof DOMException && e.name === 'AbortError' ? 'Gemini took too long.' : chatErrorText(e, 'Gemini is not available right now.'))
    } finally {
      clearTimeout(timer)
    }
  }

  /** Lets Gemini improve the rule-based plan, then shows whichever passed
   *  the checks. The student's request (if any) is Gemini's top priority.
   *  A week where each day differs gets the whole week in one call; a
   *  Week A / Week B plan gets a second call for Week B, told what Week A
   *  has so it differs. If that fails or doesn't fit, the rule plan is shown. */
  async function refineAndShow(d: Draft, result: GeneratorResult, subjects: string[], weak: string[], requestNow: string | null, varyDays: boolean, shape: Shape) {
    const seq = ++refineSeq.current
    const standing = standingFor(requestNow)
    const kind = shape.rep === 'ab' ? 'ab' : varyDays || (!!requestNow && wantsWeeklyVariation(requestNow)) ? 'week' : 'day'
    const ctx = {
      subjects, wakeTime: d.wakeTime!, sleepTime: d.sleepTime!, busy: busyWindows(d.busy),
      requestNow: !!requestNow, standingRequests: standing,
    }
    let shown = result
    let week: Record<number, GeneratorResult> | null = null
    let note = ''
    let failed = ''
    setTyping(true)
    try {
      if (kind === 'day') {
        const data = await callRefine('refine', d, result, subjects, weak, requestNow, standing)
        const check = checkRefined(data.slots, result, ctx)
        if (!check.ok) throw new Error(`Gemini's plan didn't fit (${check.reason}).`)
        shown = toResult(check.slots, result)
        note = typeof data.note === 'string' ? data.note.trim() : ''
      } else {
        const deadline = Date.now() + (kind === 'ab' ? AB_REFINE_TIMEOUT_MS : REFINE_TIMEOUT_MS)
        const getWeek = async (req: string | null) => {
          const data = await callRefine('refine_week', d, result, subjects, weak, req, standing, deadline)
          const check = checkRefinedWeek(data.days, result, ctx)
          if (!check.ok) throw new Error(`Gemini's week didn't fit (${check.reason}).`)
          note ||= typeof data.note === 'string' ? data.note.trim() : ''
          return Object.fromEntries(Object.entries(check.days).map(([day, slots]) => [Number(day), toResult(slots, result)])) as Record<number, GeneratorResult>
        }
        const a = await getWeek(requestNow)
        week = a
        if (kind === 'ab') {
          const summary = WEEK_ORDER.map(day => `${DAY_NAMES[day]}: ${uniqueCaseless(a[day].blocks.filter(b => b.kind === 'study').map(b => b.subjectName || 'Study')).join(', ')}`).join('; ')
          const b = await getWeek(`${requestNow ? `${requestNow}\n` : ''}This is Week B of a two-week rotation that alternates with Week A. Give each day a different mix or order of subjects from Week A (${summary}).`)
          week = { ...a, ...Object.fromEntries(Object.entries(b).map(([day, r]) => [Number(day) + 7, r])) }
        }
        shown = week[new Date().getDay()] ?? result
      }
    } catch (e) {
      failed = e instanceof Error ? e.message : 'Gemini is not available right now.'
      // Two weeks still have to exist to be shown and saved; both start as the rule plan.
      if (kind === 'ab') week = Object.fromEntries(planDays(true).map(day => [day, result]))
    }
    if (seq !== refineSeq.current) return
    setTyping(false)
    const head = (requestNow || kind === 'ab') && failed
      ? `I couldn't ${requestNow ? 'apply that' : 'make Week B different'} just now (${failed.replace(/\.$/, '')}). Here's your plan${requestNow ? ' without it' : ''}; try asking again in a moment.\n\n`
      : note ? `✨ ${note}\n\n` : ''
    setRuleResult(shown)
    setWeekResult(week)
    setPlainResult(week || shown === result ? null : result)
    showPlan({ single: shown, week, days: shape.days, rep: shape.rep, busy: d.busy, wake: d.wakeTime, sleep: d.sleepTime }, head)
  }

  /** A typed change to named days only ("move Tuesday Physics to 5 pm",
   *  "Sunday off", "add Maths on Saturday"): the rest of the week stays. */
  async function editDays(d: Draft, text: string, days: number[]) {
    if (!ruleResult) return
    const twoWeeks = isTwoWeeks(weekResult)
    // In a Week A / Week B plan a day means both weeks' unless one is named.
    const keys = days.flatMap(day => (!twoWeeks ? [day] : mentionsWeekB(text) ? [day + 7] : namesWeekA(text) ? [day] : [day, day + 7]))
    if (wantsDaysOff(text) && twoWeeks && namesOneWeek(text)) {
      // Off in one week only: that week's day has no plan, the other week keeps its own.
      const week = Object.fromEntries(Object.entries(weekResult!).filter(([k]) => !keys.includes(Number(k))))
      setWeekResult(week)
      showPlan({ week }, `Done, ${keys.map(k => dayLabel(k, true)).join(', ')} ${keys.length === 1 ? 'is' : 'are'} off now.\n\n`)
      return
    }
    if (wantsDaysOff(text)) {
      const nextDays = activeDays.filter(day => !days.includes(day))
      if (!nextDays.length) { say("That would leave no study days at all. Tell me which days to keep."); return }
      setActiveDays(nextDays)
      showPlan({ days: nextDays }, `Done, ${days.map(day => DAY_NAMES[day]).join(', ')} ${days.length === 1 ? 'is' : 'are'} off now.\n\n`)
      return
    }
    learn([{ field: 'note', value: text.slice(0, 300), action: 'requested' }])
    const subjects = planSubjects(d)
    const p = profileRef.current
    const weak = p ? weakSubjects(subjects, p.study) : []
    const standing = standingFor(text)
    const ctx = { subjects, wakeTime: d.wakeTime!, sleepTime: d.sleepTime!, busy: busyWindows(d.busy), requestNow: true, standingRequests: standing }
    const week = { ...planWeek()! }
    const done: string[] = []
    const failed: string[] = []
    let note = ''
    const seq = ++refineSeq.current
    setTyping(true)
    for (const key of keys) {
      const base = week[key] ?? ruleResult
      try {
        const data = await callRefine('refine', d, base, subjects, weak, `${text}\n(This change is only for ${dayLabel(key, twoWeeks)}.)`, standing)
        const check = checkRefined(data.slots, base, ctx)
        if (!check.ok) throw new Error(check.reason)
        week[key] = toResult(check.slots, base)
        done.push(dayLabel(key, twoWeeks))
        note ||= typeof data.note === 'string' ? data.note.trim() : ''
      } catch {
        failed.push(dayLabel(key, twoWeeks))
      }
    }
    if (seq !== refineSeq.current) return
    setTyping(false)
    const nextDays = done.length ? uniq([...activeDays, ...days]).sort((a, b) => a - b) : activeDays
    if (done.length) { setWeekResult(week); setActiveDays(nextDays); setPlainResult(null) }
    const head = [
      done.length ? `Done, only ${done.join(', ')} changed.${note ? ` ✨ ${note}` : ''}` : '',
      failed.length ? `I couldn't change ${failed.join(', ')} just now; try again in a moment.` : '',
    ].filter(Boolean).join(' ')
    showPlan({ week: done.length ? week : weekResult, days: nextDays }, `${head}\n\n`)
  }

  // ── AI chat ────────────────────────────────────────────────────────────

  /** The agreed settings as the chat reads them: the last ones the AI
   *  returned, with the current answers (which buttons may just have
   *  changed) on top. */
  function chatSettings(d: Draft, shape: Shape): ChatSettings {
    return {
      ...chatSettingsRef.current,
      daily_hours: Math.round((d.dailyMinutes / 60) * 100) / 100,
      session_minutes: d.blockMinutes,
      ...(d.wakeTime ? { wake: d.wakeTime } : {}),
      ...(d.sleepTime ? { sleep: d.sleepTime } : {}),
      busy: busyWindows(d.busy).map(b => `${b.start}-${b.end}`),
      active_days: shape.days,
      repeat: shape.rep,
      week_shape: shape.rep === 'ab' ? 'ab' : weekResult ? 'vary' : 'same',
    }
  }

  /** What Wynky learned from the student's history and similar students,
   *  in words, for anything the student hasn't said in this chat. */
  function learnedLines(): string[] {
    const r = recsRef.current
    if (!r) return []
    const line = (label: string, c: Candidate | null, fmt: (v: string) => string) => {
      const src = c ? why(c) : null
      return c && src ? `${label}: ${fmt(c.value)} (${src})` : null
    }
    return [
      line('study a day', r.dailyMinutes, v => fmtHours(Number(v))),
      line('session length', r.blockMinutes, v => `${v} min`),
      line('wakes up', r.wake, fmtClock),
      line('sleeps', r.sleep, fmtClock),
      line('busy', r.busy, v => (v === NOTHING_FIXED ? 'nothing fixed' : busyLabel(v))),
    ].filter((x): x is string => !!x)
  }

  /** Looks up the channels and matches the apps the AI was asked to allow,
   *  and returns the draft with them added plus a line on what was not found. */
  async function applyAllow(d: Draft, reqs: AllowRequest[], apps: PickableApp[] | null): Promise<{ draft: Draft; notes: string[] }> {
    let out = d
    const notes: string[] = []
    const missingChannels: string[] = []
    const missingApps: string[] = []
    for (const r of reqs) {
      if (!planSubjects(d).includes(r.subject)) continue
      const cur = out.allow[r.subject] || emptyAllow()
      const found = await Promise.all((r.channels || []).map(q => resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, q).catch(() => null)))
      const channels = [...(cur.channels || [])]
      found.forEach((m, i) => {
        if (!m) { missingChannels.push(r.channels[i]); return }
        const id = channelPickId(m)
        if (!channels.some(c => c.id === id)) channels.push({ id, label: m.title })
        void setChannelPick(sb as any, {
          examKey: examFamilyKey(exam), subjectKey: subjectKey(r.subject),
          channelId: id, channelLabel: m.title, picked: true,
        }).catch(() => {})
      })
      const appIds = [...cur.apps]
      for (const a of r.apps || []) {
        const hit = (apps || []).find(x => x.label.toLowerCase() === a.toLowerCase())
        if (hit) { if (!appIds.includes(hit.id)) appIds.push(hit.id) } else missingApps.push(a)
      }
      const sites = channels.length && !cur.sites.some(isYoutubeSite) ? [...cur.sites, 'youtube.com'] : cur.sites
      out = withAllow(out, r.subject, { sites, channels, apps: appIds })
    }
    if (out !== d) {
      const p = profileRef.current
      if (p) void rememberAllowlists(sb as any, p.uid, allowFor(out)).catch(() => {})
    }
    if (missingChannels.length) notes.push(`I couldn't find a YouTube channel called ${missingChannels.join(', ')}.`)
    if (missingApps.length) notes.push(appPickerAvailable()
      ? `I couldn't find ${missingApps.join(', ')} among your open apps. Open it and ask again.`
      : `Apps can only be picked in the Wynko desktop app, so I left out ${missingApps.join(', ')}.`)
    return { draft: out, notes }
  }

  /** One message to the AI chat. It answers in its own words and, unless it
   *  only replies or asks something back, returns the whole updated plan and
   *  the settings it followed; both are kept for the next message.
   *  `start` is a first plan to talk about when the student types a full
   *  request during the set-up questions, before any plan is shown. */
  async function chatAi(text: string, d: Draft, shape: Shape = { days: activeDays, rep: repeat }, start?: GeneratorResult) {
    const p = profileRef.current
    const subjects = planSubjects(d)
    const current = start ?? ruleResult
    const currentWeek = start ? null : weekResult
    if (!p || !subjects.length || !current) { askAi(d, text); return }
    const seq = ++refineSeq.current
    const settings = chatSettings(d, shape)
    setTyping(true)
    let data: { reply: string; settings: ChatSettings; days: ChatDay[]; allow?: AllowRequest[]; remember: string[]; forget: string[] }
    // The apps the student could pick, so the AI names real ones (desktop app only).
    let apps = deviceApps
    if (!apps && appPickerAvailable()) { try { apps = await listPickableApps(); setDeviceApps(apps) } catch { apps = null } }
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw new Error('Not signed in.')
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS)
      try {
        const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            mode: 'chat', message: text, subjects, weak: weakSubjects(subjects, p.study), settings,
            plan: planForChat(currentWeek, current, shape.days),
            history: chatHistory(messagesRef.current, text),
            facts: studentFacts(p.known), learned: learnedLines(), standing_requests: memoryLines(p.memory.map(m => m.fact), standingRequests(p.events, 40)),
            today: DAY_NAMES[new Date().getDay()],
            device_apps: (apps || []).map(a => a.label).slice(0, 80),
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success || json.mode !== 'chat') throw new Error(json.error || 'The AI is not available right now.')
        data = json
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      if (seq !== refineSeq.current) return
      setTyping(false)
      const reason = e instanceof DOMException && e.name === 'AbortError' ? 'the AI took too long' : chatErrorText(e, 'the AI is not available right now').replace(/\.$/, '')
      if (start) {
        setDraft(d)
        setRuleResult(start)
        setWeekResult(null)
        setPlainResult(null)
        showPlan({ single: start, week: null, busy: d.busy, wake: d.wakeTime, sleep: d.sleepTime }, `I couldn't read that just now (${reason}). Here's a starting plan; please send your request again.\n\n`)
        return
      }
      ask('preview', `I couldn't do that just now (${reason}). Your plan is unchanged; please try again in a moment.`)
      return
    }
    if (seq !== refineSeq.current) return

    // Keep what was agreed, and put the answers the rest of the app uses
    // (and learns from on Confirm) in the draft.
    const s = { ...settings, ...data.settings }
    chatSettingsRef.current = s
    void saveChatSettings(sb as any, p.uid, s as Record<string, unknown>).catch(() => {})
    let next: Draft = {
      ...d,
      dailyMinutes: s.daily_hours ? Math.round(s.daily_hours * 60) : d.dailyMinutes,
      blockMinutes: s.session_minutes ?? d.blockMinutes,
      wakeTime: s.wake ?? d.wakeTime,
      sleepTime: s.sleep ?? d.sleepTime,
      busy: s.busy ? (s.busy.length ? s.busy : [NOTHING_FIXED]) : d.busy,
    }
    const days = s.active_days?.length ? s.active_days : shape.days
    const rep: Repeat = s.repeat ?? shape.rep
    // Wake, sleep, busy times and hours the student has given are learned now,
    // not only on Confirm, so Wynky doesn't ask them again next time.
    learnAgreed(next)
    // Channels and apps the student named: looked up for real, then kept
    // in the subject's allowlist like the ones picked in the set-up.
    let reply = data.reply
    if (data.allow?.length) {
      const r = await applyAllow(next, data.allow, apps)
      if (seq !== refineSeq.current) return
      next = r.draft
      if (r.notes.length) reply = `${reply}\n\n${r.notes.join(' ')}`
    }
    // Facts and rules the AI picked up go straight into what Wynky
    // remembers; ones the student took back, and rules the AI stopped
    // following, are forgotten.
    saveMemory(
      [...(s.rules || []).map(fact => ({ fact, kind: 'rule' as const })), ...(data.remember || []).map(fact => ({ fact, kind: 'fact' as const }))],
      [...(data.forget || []), ...droppedRules(settings.rules || [], s.rules || [])],
    )
    setDraft(next)
    setTyping(false)

    if (!data.days?.length && start) {
      setRuleResult(start)
      setWeekResult(null)
      setPlainResult(null)
      setActiveDays(days)
      setRepeat(rep)
      showPlan({ single: start, week: null, days, rep, busy: next.busy, wake: next.wakeTime, sleep: next.sleepTime }, `${reply}\n\n`)
      return
    }
    if (!data.days?.length) {
      setActiveDays(days)
      setRepeat(rep)
      ask('preview', reply)
      return
    }
    // Sleep blocks for the (possibly new) wake and sleep times.
    const base = recommend({
      wakeTime: next.wakeTime!, sleepTime: next.sleepTime!, dailyMinutes: next.dailyMinutes, subjects, weak: [],
      blockLengthMinutes: next.blockMinutes, fixedCommitments: busyWindows(next.busy),
    })
    const plan = chatPlan(data.days, currentWeek ?? repeatWeek(current), base, {
      subjects, wakeTime: next.wakeTime!, sleepTime: next.sleepTime!, busy: busyWindows(next.busy), requestNow: true, standingRequests: [],
    }, days)
    if (!plan.ok && start) {
      setRuleResult(start)
      setWeekResult(null)
      setPlainResult(null)
      showPlan({ single: start, week: null, busy: next.busy, wake: next.wakeTime, sleep: next.sleepTime }, `${reply}\n\nBut the plan I made didn't pass my checks (${plan.reason}), so here's a starting plan instead. Tell me what to change.\n\n`)
      return
    }
    if (!plan.ok) {
      ask('preview', `${reply}\n\nBut the plan I made didn't pass my checks (${plan.reason}), so I kept your current one. Try asking again.`)
      return
    }
    const today = new Date().getDay()
    const single = plan.single ?? plan.week?.[today] ?? plan.week?.[plan.activeDays[0]] ?? current
    setRuleResult(single)
    setWeekResult(plan.week)
    setPlainResult(null)
    setActiveDays(plan.activeDays)
    setRepeat(rep)
    showPlan({ single, week: plan.week, days: plan.activeDays, rep, busy: next.busy, wake: next.wakeTime, sleep: next.sleepTime }, `${reply}\n\n`)
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
      { id: 'setup', label: 'Change subjects & sites' },
      { id: 'day_sites', label: 'Different sites for a day' },
      { id: 'days_repeat', label: 'Change days or repeat' },
      ...(plainResult ? [{ id: 'plain', label: 'Use the plan without AI changes' }] : []),
    ]
  } else if (step === 'override_day' || step === 'override_subject' || step === 'override_slot') {
    const week = planWeek() ?? {}
    const twoWeeks = isTwoWeeks(week)
    const subjectsOn = (day: number) => uniqueCaseless((week[day]?.blocks || []).filter(b => b.kind === 'study').map(b => b.subjectName || 'Study'))
    const customised = (day: number, subject?: string) => Object.keys(dayOverrides[day] || {}).some(k => !subject || k === subject || k.startsWith(`${subject}@`))
    if (step === 'override_day') {
      options = planDays(twoWeeks).filter(day => activeDays.includes(day % 7) && subjectsOn(day).length).map(day => ({
        id: `day:${day}`,
        label: `${dayLabel(day, twoWeeks)} · ${subjectsOn(day).join(', ')}${customised(day) ? ' · customised' : ''}`,
      }))
    } else if (step === 'override_subject') {
      options = subjectsOn(overrideDay ?? 0).map(s => ({ id: `osub:${s}`, label: customised(overrideDay ?? 0, s) ? `${s} · customised` : s }))
    } else if (overrideDay !== null && overrideSubject) {
      options = [
        { id: 'all', label: `All ${overrideSubject} blocks` },
        ...blocksOf(overrideDay, overrideSubject).map(b => ({
          id: `slot:${b.startTime}`,
          label: `${fmtClock(b.startTime)}–${fmtClock(b.endTime)}${dayOverrides[overrideDay]?.[`${overrideSubject}@${b.startTime}`] ? ' · customised' : ''}`,
        })),
      ]
    }
    options.push({ id: 'back', label: 'Back to the plan' })
  } else if (step === 'week_choice') {
    options = [
      { id: 'same', label: 'Same plan every day' }, { id: 'vary', label: 'Different each day' },
      { id: 'ab', label: 'Different Week A and Week B' },
    ]
  } else if (step === 'days') {
    options = WEEK_ORDER.map(day => ({ id: `wd:${day}`, label: DAY_NAMES[day] }))
  } else if (step === 'repeat') {
    options = [{ id: 'weekly', label: 'Every week' }, { id: 'every2', label: 'Every 2 weeks' }]
    // Coming from "Change days or repeat": Week A / Week B is chosen here.
    if (!pendingWeekRef.current) options.push({ id: 'ab', label: 'Week A and Week B take turns' })
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
    const d = draft
    const labelOf = (id: string) => options.find(o => o.id === id)?.label || id
    if (step === 'subjects') {
      const subjects = uniqueCaseless(picked.map(id => id.slice(5)))
      if (!subjects.length) { say('Pick at least one subject, or type one.'); return }
      echo(subjects.join(', '))
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
    if (step === 'days') {
      const days = uniq(picked.map(id => Number(id.slice(3)))).sort((a, b) => a - b)
      if (!days.length) { say('Pick at least one day.'); return }
      echo(days.length === 7 ? 'Every day' : WEEK_ORDER.filter(day => days.includes(day)).map(day => DAY_NAMES[day]).join(', '))
      setActiveDays(days)
      const pw = pendingWeekRef.current
      if (pw?.rep) { pendingWeekRef.current = null; startWeek(d, pw, { days, rep: pw.rep }); return }
      enterRepeat(d)
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
      // "No apps" means no app may open during this block: saved as an
      // allow-only list with nothing on it, so every app gets closed, and no
      // question is asked. Picking some apps asks whether to keep only those
      // open or to close them.
      if (apps.length) enterAppsMode(withAllow(d, subject, { apps, appsMode: cur.appsMode }), subjIdx)
      else afterSubject(withAllow(d, subject, { apps: [], appsMode: 'whitelist' }), subjIdx)
    }
  }

  function pickSingle(opt: ChatOption) {
    if (busy) return
    const d = draft
    if (step === 'preview' && opt.id === 'confirm') {
      void (weekResult || repeat !== 'weekly' || Object.keys(dayOverrides).length ? confirmWeek(d) : confirmRecommended(d))
      return
    }
    echo(opt.label)
    if (step === 'apps_mode') {
      afterSubject(withAllow(d, subject, { appsMode: opt.id === 'whitelist' ? 'whitelist' : 'blacklist' }), subjIdx)
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
      else if (opt.id === 'day_sites') enterOverrideDay(d)
      else if (opt.id === 'days_repeat') { pendingWeekRef.current = null; enterDays(d, activeDays) }
      else if (opt.id === 'plain' && plainResult) {
        setRuleResult(plainResult)
        setPlainResult(null)
        setWeekResult(null)
        showPlan({ single: plainResult, week: null })
      }
      else enterSubjects(d)
    } else if (step === 'week_choice') {
      const pw = pendingWeekRef.current ?? { text: null, vary: false, rep: null }
      pendingWeekRef.current = { ...pw, vary: opt.id !== 'same', rep: opt.id === 'ab' ? 'ab' : pw.rep }
      enterDays(d, activeDays)
    } else if (step === 'repeat') {
      const rep = (['weekly', 'every2', 'ab'] as Repeat[]).find(r => r === opt.id)
      if (!rep) return
      const pw = pendingWeekRef.current
      if (pw) { pendingWeekRef.current = null; startWeek(d, pw, { days: activeDays, rep }) }
      else applyShape(d, { days: activeDays, rep })
    } else if (step === 'override_day') {
      if (opt.id === 'back') backToPlan()
      else if (opt.id.startsWith('day:')) enterOverrideSubject(Number(opt.id.slice(4)))
    } else if (step === 'override_subject') {
      if (opt.id === 'back') enterOverrideDay(d)
      else if (opt.id.startsWith('osub:') && overrideDay !== null) pickOverrideSubject(d, overrideDay, opt.id.slice(5))
    } else if (step === 'override_slot') {
      if (overrideDay === null || !overrideSubject) return
      if (opt.id === 'back') enterOverrideSubject(overrideDay)
      else if (opt.id === 'all') startOverride(d, overrideDay, overrideSubject, overrideSubject)
      else if (opt.id.startsWith('slot:')) startOverride(d, overrideDay, overrideSubject, `${overrideSubject}@${opt.id.slice(5)}`)
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
    // A full request typed during the set-up questions ("5:30 am to 1 pm is
    // my focus time, 90-minute sessions...") goes to the AI now, instead of
    // being asked to fit the question on screen.
    if (!match && SETUP_STEPS.includes(step) && isFullRequest(text) && planSubjects(draft).length) {
      echo(text)
      chatFromSetup(text)
      return
    }
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
    } else if (step === 'apps_mode') {
      if (match) { pickSingle(match); return }
      echo(text)
      say('Tap one of the two options.')
    } else if (step === 'override_day' || step === 'override_subject' || step === 'override_slot') {
      if (match) { pickSingle(match); return }
      echo(text)
      say(step === 'override_day' ? 'Tap the day, or Back to the plan.' : step === 'override_subject' ? 'Tap the subject, or Back to the plan.' : 'Tap a block, or Back to the plan.')
    } else if (step === 'days') {
      if (match) { togglePick(match.id, true); return }
      const days = mentionedDays(text, -1)
      if (days.length) { setPicked(p => uniq([...p, ...days.map(day => `wd:${day}`)])); return }
      echo(text)
      say('Tap the days, then Done.')
    } else if (step === 'repeat') {
      const guess = repeatFromText(text) ?? (/\b(every ?week|weekly)\b/i.test(text) ? 'weekly' : null)
      const pick = match ?? options.find(o => o.id === guess)
      if (pick) { pickSingle(pick); return }
      echo(text)
      say('Tap one of the options.')
    } else if (step === 'week_choice') {
      const pick = match ?? options.find(o => o.id === (repeatFromText(text) === 'ab' ? 'ab' : /\b(differ|vary|varied|each|mix)/i.test(text) ? 'vary' : /\bsame\b/i.test(text) ? 'same' : ''))
      if (pick) { pickSingle(pick); return }
      echo(text)
      say('Tap one of the three options.')
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
      // A change to named days only ("Tuesday Physics at 5 pm", "Sunday off").
      const named = step === 'preview' && ruleResult ? mentionedDays(text, -1) : []
      // "Week B Tuesday ..." on a two-week plan is still a change to one day.
      const weekScoped = isTwoWeeks(weekResult) && namesOneWeek(text)
      if (ruleResult) { void chatAi(text, draft); return }
      if (named.length && (weekScoped || (!mentionsWeek(text) && !repeatFromText(text)))) { void editDays(draft, text, named); return }
      const updated = applyLocalRequest(text, draft)
      if (updated) { if (updated !== draft) buildPreview(updated); return }
      askAi(draft, text)
    }
  }

  /** Skips the rest of the set-up questions: a first plan from what Wynky
   *  already knows, then the student's request goes to the AI chat. */
  function chatFromSetup(text: string) {
    const p = profileRef.current
    const d: Draft = {
      ...draft,
      wakeTime: draft.wakeTime ?? '06:30',
      sleepTime: draft.sleepTime ?? '23:00',
      busy: draft.busy.length ? draft.busy : [NOTHING_FIXED],
    }
    const subjects = planSubjects(d)
    const start = recommend({
      wakeTime: d.wakeTime!, sleepTime: d.sleepTime!, dailyMinutes: d.dailyMinutes, subjects,
      weak: p ? weakSubjects(subjects, p.study) : [], blockLengthMinutes: d.blockMinutes, fixedCommitments: busyWindows(d.busy),
    })
    gapsRef.current = []
    setDraft(d)
    void chatAi(text, d, { days: activeDays, rep: repeat }, start)
  }

  /** A request Wynky can't apply by itself: Gemini rebuilds the plan with
   *  it as the top priority, and it is remembered (with the confirmed plan)
   *  so every later plan follows it too. */
  function askAi(d: Draft, text: string) {
    learn([{ field: 'note', value: text.slice(0, 300), action: 'requested' }])
    const rep = repeatFromText(text)
    const off = wantsDaysOff(text) && !namesOneWeek(text) ? mentionedDays(text, -1) : []
    const days = off.length && off.length < activeDays.length ? activeDays.filter(day => !off.includes(day)) : activeDays
    if (days !== activeDays) setActiveDays(days)
    if (rep === 'ab') { startWeek(d, { text, vary: true, rep }, { days, rep }); return }
    // A week can mean the same day repeated or each day different, and
    // weeks can repeat or take turns, so ask rather than guess.
    if (mentionsWeek(text) || rep) {
      setDraft(d)
      pendingWeekRef.current = { text, vary: wantsWeeklyVariation(text), rep }
      if (wantsWeeklyVariation(text)) enterDays(d, days)
      else ask('week_choice', 'Should every day of the week have the same plan, different subjects on different days, or two different weeks that take turns?')
      return
    }
    say("Got it. I'll build your plan around that and remember it for next time.")
    buildPreview(d, text, weekResult !== null, { days, rep: repeat })
  }

  function startWeek(d: Draft, pw: PendingWeek, shape: Shape) {
    setActiveDays(shape.days)
    setRepeat(shape.rep)
    say(pw.text ? "Got it. I'll build your plan around that and remember it for next time." : 'Got it, building your plan.')
    buildPreview(d, pw.text, pw.vary, shape)
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
    for (const s of d.subjects) {
      const sites = d.allow[s]?.sites || []
      for (const site of sites) out.push({ field: sitesField(s), value: site, multi: true, action: 'accepted' })
      if (!sites.length && isEnforceable(d.allow[s])) out.push({ field: sitesField(s), value: 'offline', multi: true, action: 'accepted' })
      for (const site of r?.sites[s] || []) if (!sites.includes(site)) out.push({ field: sitesField(s), value: site, multi: true, action: 'removed' })
    }
    return out
  }

  function finishConfirmed(skipped: number) {
    const note = skipped > 0 ? ` I left out ${skipped} block${skipped === 1 ? '' : 's'} with nothing to lock.` : ''
    ask('done', `Done, it's live. Focus Lock will follow it from the next scheduled block, and it's in Your Schedule too.${note} Next time I'll have it ready even faster.`)
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
    if (!p || !ruleResult || !d.wakeTime || !d.sleepTime) return
    echo('Confirm this plan')
    setSaving(true)
    try {
      const { freeSites, freeApps } = freeTimeLists()
      const allow = allowFor(d)
      const { writtenSlots } = await confirmPlan(sb as any, {
        userId: p.uid, planName: PLAN_NAME, result: ruleResult, subjectAllowlists: allow,
        freeTimeSites: freeSites, freeTimeApps: freeApps, daysOfWeek: activeDays,
      })
      const slots = toAiSlots(writtenSlots)
      // The plan is saved at this point; remembering and learning are best-effort.
      await rememberAnswers(sb as any, p.uid, { wakeTime: d.wakeTime, sleepTime: d.sleepTime, subjectAllowlists: allow }).catch(() => {})
      saveLearning(d, confirmedEvents(d), { planFields: true })
      await recordOutcome(sb as any, {
        source: plainResult ? 'ai_custom' : 'rule_based', requestedMinutes: d.dailyMinutes, confirmedMinutes: ruleResult.placedStudyMinutes,
        outcome: String(d.dailyMinutes) === recsRef.current?.dailyMinutes?.value ? 'accepted_as_is' : 'accepted_edited',
      }).catch(() => {})
      onPlanConfirmed({ days_of_week: activeDays, slots })
      finishConfirmed(ruleResult.blocks.filter(b => b.kind === 'study').length - slots.filter(s => !s.is_sleep).length)
    } catch (e) {
      saveFailed(e, d)
    } finally {
      setSaving(false)
    }
  }

  /** Same as confirmRecommended, but for a plan saved day by day (a varied
   *  week, days off, every 2 weeks, Week A / Week B or a day-specific set-up):
   *  one schedule per weekday (confirmWeekPlan) instead of one shared one. */
  async function confirmWeek(d: Draft) {
    const p = profileRef.current
    const plan = planWeek()
    if (!p || !plan || !d.wakeTime || !d.sleepTime) return
    echo('Confirm this plan')
    setSaving(true)
    try {
      const { freeSites, freeApps } = freeTimeLists()
      const allow = allowFor(d)
      const { writtenSlots } = await confirmWeekPlan(sb as any, {
        userId: p.uid, planName: PLAN_NAME, week: plan, subjectAllowlists: allow, dayOverrides: liveOverrides(dayOverrides, plan),
        freeTimeSites: freeSites, freeTimeApps: freeApps, activeDays, repeatWeeks: repeat === 'every2' ? 2 : 1,
      })
      // Your Schedule shows this week, which is Week A of a two-week plan.
      const week = Object.fromEntries(Object.entries(writtenSlots).filter(([day]) => Number(day) < 7).map(([day, s]) => [Number(day), toAiSlots(s)]))
      await rememberAnswers(sb as any, p.uid, { wakeTime: d.wakeTime, sleepTime: d.sleepTime, subjectAllowlists: allow }).catch(() => {})
      saveLearning(d, confirmedEvents(d), { planFields: true })
      await recordOutcome(sb as any, {
        source: 'ai_custom', requestedMinutes: d.dailyMinutes,
        confirmedMinutes: Math.round(Object.values(plan).reduce((sum, r) => sum + r.placedStudyMinutes, 0) / Object.keys(plan).length),
        outcome: 'accepted_as_is',
      }).catch(() => {})
      onPlanConfirmed({ week })
      const skipped = Object.entries(plan).filter(([day]) => activeDays.includes(Number(day) % 7))
        .reduce((sum, [, r]) => sum + r.blocks.filter(b => b.kind === 'study').length, 0)
        - Object.values(writtenSlots).reduce((sum, s) => sum + s.filter(x => !x.isSleep).length, 0)
      finishConfirmed(skipped)
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
      <div role="dialog" aria-modal="true" aria-label="Wynky assistant"
        className="rounded-2xl border w-[520px] max-w-full h-[640px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: '#161618', borderColor: '#3A3A3A', boxShadow: 'none' }}>

        {/* Header */}
        <div className="flex items-center gap-3.5 px-5 py-4 border-b flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1C1C1F,#1C1C1F)', borderColor: '#26262A' }}>
          <MascotAvatar size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-wk-orange-300 font-mono tracking-[0.15em] mb-0.5">WYNKY ASSISTANT</div>
            <div className="text-base font-bold text-white leading-tight">Create Your Study Schedule</div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: 'none' }} /> Online
            </div>
          </div>
          {hasHistory && (
            <button onClick={() => void clearHistory()}
              className="text-[11px] text-wk-ink-400 hover:text-wk-ink-100 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
              Clear history
            </button>
          )}
          <button onClick={onClose} aria-label="Close chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-wk-ink-400 hover:text-wk-ink-100 hover:bg-white/5 transition-colors flex-shrink-0">
            <Icon d="M6 18L18 6M6 6l12 12" cls="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {messages.map(m => m.from === 'divider' ? (
            <div key={m.id} className="flex items-center gap-3 text-[11px] text-wk-ink-400">
              <span className="flex-1 h-px" style={{ background: '#26262A' }} />
              {m.text}
              <span className="flex-1 h-px" style={{ background: '#26262A' }} />
            </div>
          ) : m.from === 'bot' ? (
            <div key={m.id} className="flex items-end gap-2.5">
              <MascotAvatar size={34} />
              <div className={`${m.sched ? 'max-w-[92%] min-w-0' : 'max-w-[80%]'} px-4 py-2.5 rounded-2xl rounded-bl-md text-[13px] text-wk-ink-200 leading-relaxed whitespace-pre-wrap break-words border`}
                style={{ background: 'rgba(22,22,24,0.85)', borderColor: '#26262A' }}>
                {m.sched ? (
                  <>
                    <PlanMessage text={m.sched.view} />
                    <ScheduleTables key={m.id} days={m.sched.days} settings={m.sched.settings} />
                  </>
                ) : <PlanMessage text={m.text} />}
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
