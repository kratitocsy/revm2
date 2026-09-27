import { useEffect, useRef, useState } from 'react'
import wynkoMascot from '../imports/wynko-mascot.png'
import { sb } from '../../_shared/supabaseClient'
import { REVM2_CONFIG } from '../../../lib/supabase.js'
import {
  loadKnownProfile, loadRemembered, defaultDailyMinutes, distractionSites, distractionApps,
  recommend, confirmPlan, confirmAiPlan, ensurePresets, rememberAnswers, rememberAllowlists, recordOutcome,
  NoEnforceableBlocksError, STUDY_MODE_OPTIONS, examFamilyKey, subjectKey, seedQueriesFor,
  resolveChannelSeed, fetchPopularChannels, setChannelPick, channelPickId, appPickerAvailable, listPickableApps,
  type WynkyKnownProfile, type WynkyRemembered, type SubjectAllowlist, type AiSlot, type ChannelPick,
  type PickableApp, type PlanSlotInput,
} from './wynkyPlanner'
import {
  subjectChoices, uniqueCaseless, isEnforceable, hasSavedSetup, hoursOptions, minutesFromOptionId,
  parseStudyMinutes, clockOptions, parseClock, fmtClock, fmtHours, siteFromText, filterOptions, clearMatch,
  formatRecommendedPlan, type ChatOption,
} from './wynkyChatFlow'
import type { GeneratorResult } from '../../_shared/scheduleGenerator'

/* ============================================================
   WynkyChat.tsx

   "Generate with AI" on the Schedules page opens this: Wynky as a
   support-bot style chat. Every question comes with options to tap
   (subjects, the platforms each subject is studied on, real YouTube
   channels, apps, hours, wake/sleep times) and typing either filters
   them or answers in the student's own words, so the whole set-up
   happens here instead of on a separate form. A returning student
   skips straight to "plan my day". The recommended day comes from the
   rule-based generator; anything the options don't cover goes to the
   ai-generate-schedule function (Gemini Flash). Nothing is saved until
   the student taps Confirm.
   ============================================================ */

type Step = 'loading' | 'signed_out' | 'returning' | 'subjects' | 'sites' | 'channels' | 'apps' | 'apps_mode'
  | 'hours' | 'wake' | 'sleep' | 'preview' | 'ai_preview' | 'done'

const MULTI_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps']
// Steps where typing narrows the options, like "Start typing to see options…".
const FILTER_STEPS: Step[] = ['subjects', 'sites', 'channels', 'apps', 'hours', 'wake', 'sleep']

interface Msg { id: number; from: 'bot' | 'user'; text: string }
interface Profile { uid: string; known: WynkyKnownProfile; remembered: WynkyRemembered }
interface Draft {
  subjects: string[]
  allow: Record<string, SubjectAllowlist>
  dailyMinutes: number
  wakeTime: string | null
  sleepTime: string | null
}
interface ChannelSuggestion extends ChannelPick { pickCount: number }
interface AiSchedule { name: string; days_of_week: number[]; slots: AiSlot[] }

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
// One name for every plan the chat saves, so confirming a new one replaces
// the last one instead of stacking a second active schedule on top.
const PLAN_NAME = 'Wynky Plan'
const MAX_SHOWN_OPTIONS = 40

const EMPTY_KNOWN: WynkyKnownProfile = {
  subjects: [], exam: null, dailyHoursBucket: null, customDailyHoursText: null, distractionTags: [], customDistractionText: null,
}
const EMPTY_REMEMBERED: WynkyRemembered = {
  wakeTime: null, sleepTime: null, subjectAllowlists: {}, lastDailyMinutes: null, acceptedCount: 0, adjustedCount: 0,
}

const emptyAllow = (): SubjectAllowlist => ({ sites: [], apps: [], channels: [] })
const isYoutubeSite = (s: string) => s === 'youtube.com' || s.endsWith('.youtube.com')
const uniq = <T,>(xs: T[]) => [...new Set(xs)]

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

function studyMinutes(slots: AiSlot[]): number {
  return slots.filter(s => !s.is_sleep).reduce((sum, s) => {
    const [sh, sm] = s.start_time.split(':').map(Number); const [eh, em] = s.end_time.split(':').map(Number)
    return sum + ((eh * 60 + em) - (sh * 60 + sm))
  }, 0)
}

// fetch() rejects with a bare TypeError ("Failed to fetch") when offline.
function chatErrorText(e: unknown, fallback: string): string {
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return "I couldn't reach the server. Check your connection and try again."
  return e instanceof Error ? e.message : fallback
}

function formatAiSchedule(schedule: AiSchedule): string {
  const lines = (schedule.slots || []).map(s => `${s.start_time}–${s.end_time}  ${s.is_sleep ? '😴 Sleep' : (s.subject || 'Study')}`)
  return `Here's "${schedule.name}":\n\n${lines.join('\n')}\n\nTap Confirm to make it live, or tell me what else to change.`
}

/** What the AI should assume unless the student's own words say otherwise. */
function aiGoalText(d: Draft, text: string): string {
  const facts: string[] = []
  if (d.wakeTime && d.sleepTime) facts.push(`I usually wake at ${fmtClock(d.wakeTime)} and sleep at ${fmtClock(d.sleepTime)}`)
  facts.push(`I'd like about ${fmtHours(d.dailyMinutes)} of study`)
  return `${text}\n\n(Unless I said otherwise above: ${facts.join('; ')}.)`
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

export default function WynkyChat({ onClose, onPlanConfirmed }: {
  onClose: () => void
  onPlanConfirmed: (plan: { days_of_week: number[]; slots: AiSlot[] }) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(true) // Wynky is working: loading, asking the AI, searching YouTube
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<Step>('loading')
  const [subjIdx, setSubjIdx] = useState(0)
  const [picked, setPicked] = useState<string[]>([]) // selected option ids on a pick-several question
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Draft>({ subjects: [], allow: {}, dailyMinutes: 240, wakeTime: null, sleepTime: null })
  const [channelSugs, setChannelSugs] = useState<Record<string, ChannelSuggestion[]>>({})
  const [channelsLoadingFor, setChannelsLoadingFor] = useState<string | null>(null)
  const [deviceApps, setDeviceApps] = useState<PickableApp[] | null>(null)
  const [appsLoading, setAppsLoading] = useState(false)
  const [ruleResult, setRuleResult] = useState<GeneratorResult | null>(null)
  const [aiSchedule, setAiSchedule] = useState<AiSchedule | null>(null)
  const profileRef = useRef<Profile | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  const busy = typing || saving || step === 'loading'
  const subject = draft.subjects[subjIdx] ?? ''

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
  function freeTimeLists() {
    const tags = profileRef.current?.known.distractionTags || []
    return { freeSites: distractionSites(tags), freeApps: distractionApps(tags) }
  }

  // Load what Wynky already knows, then either offer the saved set-up
  // or start asking. Nothing to type until this is ready.
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
      try {
        [known, remembered] = await Promise.all([loadKnownProfile(sb as any, uid), loadRemembered(sb as any, uid)])
      } catch {
        // Start the set-up from scratch rather than fail: every answer can be picked again.
      }
      if (cancelled) return
      const p: Profile = { uid, known, remembered }
      profileRef.current = p
      setProfile(p)
      const saved = Object.keys(remembered.subjectAllowlists || {})
      const d: Draft = {
        subjects: saved.length ? saved : known.subjects,
        allow: normalizeAllow(remembered.subjectAllowlists),
        dailyMinutes: defaultDailyMinutes(known, remembered),
        wakeTime: remembered.wakeTime,
        sleepTime: remembered.sleepTime,
      }
      setTyping(false)
      if (hasSavedSetup(remembered)) {
        setDraft(d)
        ask('returning', `Welcome back! Want me to plan today with your usual set-up for ${d.subjects.join(', ')}? You can also just tell me what today looks like.`)
      } else {
        say(`Hi, I'm Wynky!${known.exam ? ` I see you're prepping for ${known.exam}.` : ''} Let's set up your study plan together. It only takes a minute.`)
        enterSubjects(d)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Questions ──────────────────────────────────────────────────────────

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
    const exam = profileRef.current?.known.exam
    ask('channels',
      `Which YouTube channels do you watch for ${name}? These are real channels${exam ? `, ranked by what other ${exam} students pick` : ''}. Type a name to search for another, or skip to allow all of YouTube.`,
      (d.allow[name]?.channels || []).map(c => c.id))
    if (!channelSugs[name]) void loadChannels(name)
  }

  async function loadChannels(name: string) {
    const exam = profileRef.current?.known.exam ?? null
    setChannelsLoadingFor(name)
    try {
      const popular = await fetchPopularChannels(sb as any, examFamilyKey(exam), subjectKey(name), 10)
      const byId = new Map<string, ChannelSuggestion>()
      for (const c of popular) byId.set(c.channel_id, { id: c.channel_id, label: c.channel_label, pickCount: c.pick_count })
      if (byId.size < 8) {
        const seeds = seedQueriesFor(exam, name).slice(0, 5)
        const found = await Promise.all(seeds.map(q => resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, q).catch(() => null)))
        for (const m of found) {
          if (!m) continue
          const id = channelPickId(m)
          if (!byId.has(id)) byId.set(id, { id, label: m.title, pickCount: 0 })
        }
      }
      setChannelSugs(prev => ({ ...prev, [name]: [...byId.values()].sort((a, b) => b.pickCount - a.pickCount) }))
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
    enterHours(d)
  }

  function enterHours(d: Draft) {
    setDraft(d)
    ask('hours', 'How many hours do you want to study today?')
  }

  function afterHours(d: Draft) {
    if (d.wakeTime && d.sleepTime) buildPreview(d)
    else enterWake(d)
  }

  function enterWake(d: Draft) {
    setDraft(d)
    ask('wake', 'What time do you usually wake up?')
  }

  function enterSleep(d: Draft) {
    setDraft(d)
    ask('sleep', 'And when do you usually go to sleep?')
  }

  function buildPreview(d: Draft) {
    setDraft(d)
    if (!d.wakeTime || !d.sleepTime) { enterWake(d); return }
    const { freeSites, freeApps } = freeTimeLists()
    // A subject with nothing of its own to allow still gets blocks when the
    // free-time blocklist can cover them; otherwise those blocks would be
    // dropped on save, so leave the subject out of the plan.
    const enforceable = d.subjects.filter(s => isEnforceable(d.allow[s]))
    const subjects = freeSites.length || freeApps.length ? d.subjects : enforceable
    const result = recommend({ wakeTime: d.wakeTime, sleepTime: d.sleepTime, dailyMinutes: d.dailyMinutes, subjects, blockLengthMinutes: 60 })
    if (!result.blocks.some(b => b.kind === 'study')) {
      say("Those wake and sleep times don't leave any room for study. Let's pick them again.")
      enterWake(d)
      return
    }
    setRuleResult(result)
    setAiSchedule(null)
    ask('preview', formatRecommendedPlan(result))
  }

  // ── Options for the current question ──────────────────────────────────

  let options: ChatOption[] = []
  let doneLabel = 'Done'
  const multi = MULTI_STEPS.includes(step)
  if (step === 'returning') {
    options = [{ id: 'plan', label: 'Plan my day' }, { id: 'setup', label: 'Change my set-up' }]
  } else if (step === 'subjects') {
    const names = profile ? subjectChoices(profile.known, profile.remembered) : []
    options = uniqueCaseless([...names, ...draft.subjects, ...picked.map(id => id.slice(5))]).map(n => ({ id: `subj:${n}`, label: n }))
  } else if (step === 'sites') {
    const custom = uniq([...(draft.allow[subject]?.sites || []), ...picked.filter(id => id.startsWith('site:')).map(id => id.slice(5))])
      .filter(s => !STUDY_MODE_OPTIONS.some(o => o.site === s))
    options = [...STUDY_MODE_OPTIONS.map(o => ({ id: o.id, label: o.label })), ...custom.map(s => ({ id: `site:${s}`, label: s }))]
    doneLabel = picked.length ? 'Done' : 'Skip'
  } else if (step === 'channels') {
    const seen = new Set<string>()
    options = [
      ...(channelSugs[subject] || []).map(c => ({ id: c.id, label: c.pickCount > 0 ? `${c.label} · ${c.pickCount} students` : c.label })),
      ...(draft.allow[subject]?.channels || []).map(c => ({ id: c.id, label: c.label })),
    ].filter(o => !seen.has(o.id) && !!seen.add(o.id))
    doneLabel = picked.length ? 'Done' : 'Skip'
  } else if (step === 'apps') {
    const dev = deviceApps || []
    const ids = uniq([...dev.map(a => a.id), ...(draft.allow[subject]?.apps || []), ...picked.map(id => id.slice(4))])
    options = ids.map(id => ({ id: `app:${id}`, label: dev.find(a => a.id === id)?.label || id }))
    doneLabel = picked.length ? 'Done' : 'No apps'
  } else if (step === 'apps_mode') {
    options = [{ id: 'whitelist', label: 'Keep only these open' }, { id: 'blacklist', label: 'Close these apps' }]
  } else if (step === 'hours') {
    options = profile ? hoursOptions(profile.known, profile.remembered) : []
  } else if (step === 'wake' || step === 'sleep') {
    options = clockOptions(step, (step === 'wake' ? profile?.remembered.wakeTime : profile?.remembered.sleepTime) ?? null)
  } else if (step === 'preview') {
    options = [
      { id: 'confirm', label: 'Confirm this plan' }, { id: 'hours', label: 'Change study hours' },
      { id: 'times', label: 'Change wake/sleep times' }, { id: 'setup', label: 'Change my set-up' },
    ]
  } else if (step === 'ai_preview') {
    options = [
      { id: 'confirm', label: 'Confirm this plan' },
      ...(draft.wakeTime && draft.sleepTime ? [{ id: 'rule', label: 'Back to my recommended day' }] : []),
      { id: 'setup', label: 'Change my set-up' },
    ]
  } else if (step === 'done') {
    options = [{ id: 'again', label: 'Plan again' }, { id: 'setup', label: 'Change my set-up' }]
  }
  const filtering = FILTER_STEPS.includes(step)
  const shown = filtering ? filterOptions(options, input) : options

  // ── Answers ────────────────────────────────────────────────────────────

  function togglePick(id: string, forceOn = false) {
    if (busy) return
    const on = forceOn || !picked.includes(id)
    if (on && picked.includes(id)) return
    setPicked(p => (on ? [...p, id] : p.filter(x => x !== id)))
    if (step === 'channels') {
      const ch = options.find(o => o.id === id)
      const label = (channelSugs[subject] || []).find(c => c.id === id)?.label || ch?.label || id
      void setChannelPick(sb as any, {
        examKey: examFamilyKey(profileRef.current?.known.exam ?? null), subjectKey: subjectKey(subject),
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
      enterSites({ ...d, subjects, allow }, 0)
      return
    }
    const cur = d.allow[subject] || emptyAllow()
    if (step === 'sites') {
      const sites = uniq(picked.flatMap(id => {
        if (id.startsWith('site:')) return [id.slice(5)]
        const site = STUDY_MODE_OPTIONS.find(o => o.id === id)?.site
        return site ? [site] : []
      }))
      echo(picked.length ? picked.map(labelOf).join(', ') : 'Nothing for this one')
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
    if (step === 'ai_preview' && opt.id === 'confirm') { void confirmAi(d); return }
    echo(opt.label)
    if (step === 'returning') {
      if (opt.id === 'plan') enterHours(d); else enterSubjects(d)
    } else if (step === 'apps_mode') {
      afterSubject(withAllow(d, subject, { appsMode: opt.id === 'whitelist' ? 'whitelist' : 'blacklist' }), subjIdx)
    } else if (step === 'hours') {
      const minutes = minutesFromOptionId(opt.id)
      if (minutes) afterHours({ ...d, dailyMinutes: minutes })
    } else if (step === 'wake') {
      enterSleep({ ...d, wakeTime: opt.id })
    } else if (step === 'sleep') {
      buildPreview({ ...d, sleepTime: opt.id })
    } else if (step === 'preview') {
      if (opt.id === 'hours') enterHours(d)
      else if (opt.id === 'times') enterWake(d)
      else enterSubjects(d)
    } else if (step === 'ai_preview') {
      if (opt.id === 'rule') buildPreview(d); else enterSubjects(d)
    } else if (step === 'done') {
      if (opt.id === 'again') enterHours(d); else enterSubjects(d)
    }
  }

  async function searchChannel(name: string, query: string) {
    setTyping(true)
    try {
      const m = await resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, query)
      if (!m) { say(`I couldn't find a YouTube channel called "${query}". Try another name.`); return }
      const found: ChannelSuggestion = { id: channelPickId(m), label: m.title, pickCount: 0 }
      setChannelSugs(prev => ({ ...prev, [name]: [found, ...(prev[name] || []).filter(c => c.id !== found.id)] }))
      setPicked(p => (p.includes(found.id) ? p : [...p, found.id]))
      void setChannelPick(sb as any, {
        examKey: examFamilyKey(profileRef.current?.known.exam ?? null), subjectKey: subjectKey(name),
        channelId: found.id, channelLabel: found.label, picked: true,
      }).catch(() => {})
      say(`Found ${m.title} and ticked it.`)
    } catch (e) {
      say(chatErrorText(e, "I couldn't search YouTube just now."))
    } finally {
      setTyping(false)
    }
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
      if (site) { togglePick(STUDY_MODE_OPTIONS.find(o => o.site === site)?.id ?? `site:${site}`, true); return }
      echo(text)
      say('Type a website like allen.ac.in, or pick one of the options.')
    } else if (step === 'channels') {
      if (match) { togglePick(match.id, true); return }
      echo(text)
      await searchChannel(subject, text)
    } else if (step === 'apps') {
      togglePick(match ? match.id : `app:${text}`, true)
    } else if (step === 'apps_mode') {
      if (match) { pickSingle(match); return }
      echo(text)
      say('Tap one of the two options.')
    } else if (step === 'hours') {
      if (match) { pickSingle(match); return }
      echo(text)
      const minutes = parseStudyMinutes(text)
      if (minutes) afterHours({ ...draft, dailyMinutes: minutes })
      else say("I didn't catch that. Pick an option, or type the hours, like 5.")
    } else if (step === 'wake' || step === 'sleep') {
      if (match) { pickSingle(match); return }
      echo(text)
      const t = parseClock(text, step)
      if (!t) say('Type a time like 6:30 am, or pick one of the options.')
      else if (step === 'wake') enterSleep({ ...draft, wakeTime: t })
      else buildPreview({ ...draft, sleepTime: t })
    } else {
      // returning / preview / ai_preview / done: anything the options don't cover goes to the AI.
      const exact = options.find(o => o.label.toLowerCase() === text.toLowerCase())
      if (exact) { pickSingle(exact); return }
      echo(text)
      await askAi(draft, text)
    }
  }

  async function askAi(d: Draft, text: string) {
    const p = profileRef.current
    if (!p) return
    setTyping(true)
    try {
      const { freeSites, freeApps } = freeTimeLists()
      const { presetNames } = await ensurePresets(sb as any, p.uid, { subjectAllowlists: allowFor(d), freeTimeSites: freeSites, freeTimeApps: freeApps })
      // With no preset every study block would be dropped on save, so finish the set-up first.
      if (!presetNames.length) {
        say('Before I build that, I need at least one site, YouTube channel or app for a subject, so Focus Lock has something to enforce.')
        if (d.subjects.length) enterSites(d, 0); else enterSubjects(d)
        return
      }
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw new Error('Not signed in.')
      const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ mode: 'text', goal_text: aiGoalText(d, text), presets: presetNames.map(n => ({ name: n })), subjects: d.subjects }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Wynky couldn't build that.")
      const schedule = data.schedule as AiSchedule
      if (!(schedule.slots || []).some(s => !s.is_sleep)) {
        say('That came back without any study blocks. Tell me a bit more about your day and I\'ll try again.')
        return
      }
      setAiSchedule(schedule)
      ask('ai_preview', formatAiSchedule(schedule))
    } catch (e) {
      say(chatErrorText(e, 'Something went wrong building that schedule.'))
    } finally {
      setTyping(false)
    }
  }

  // ── Saving ─────────────────────────────────────────────────────────────

  function finishConfirmed(skipped: number) {
    const note = skipped > 0 ? ` I left out ${skipped} block${skipped === 1 ? '' : 's'} with nothing to lock.` : ''
    ask('done', `Done, it's live. Focus Lock will follow it from the next scheduled block, and it's in Your Schedule too.${note}`)
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
        freeTimeSites: freeSites, freeTimeApps: freeApps, daysOfWeek: ALL_DAYS,
      })
      const slots = toAiSlots(writtenSlots)
      // The plan is saved at this point; remembering answers is best-effort.
      await rememberAnswers(sb as any, p.uid, { wakeTime: d.wakeTime, sleepTime: d.sleepTime, subjectAllowlists: allow }).catch(() => {})
      await recordOutcome(sb as any, {
        source: 'rule_based', requestedMinutes: d.dailyMinutes, confirmedMinutes: ruleResult.scheduledStudyMinutes,
        outcome: d.dailyMinutes === defaultDailyMinutes(p.known, p.remembered) ? 'accepted_as_is' : 'accepted_edited',
      }).catch(() => {})
      onPlanConfirmed({ days_of_week: ALL_DAYS, slots })
      finishConfirmed(ruleResult.blocks.filter(b => b.kind === 'study').length - slots.filter(s => !s.is_sleep).length)
    } catch (e) {
      saveFailed(e, d)
    } finally {
      setSaving(false)
    }
  }

  async function confirmAi(d: Draft) {
    const p = profileRef.current
    if (!p || !aiSchedule) return
    echo('Confirm this plan')
    setSaving(true)
    try {
      const { freeSites, freeApps } = freeTimeLists()
      const allow = allowFor(d)
      const days = aiSchedule.days_of_week?.length ? aiSchedule.days_of_week : ALL_DAYS
      const { writtenSlots } = await confirmAiPlan(sb as any, {
        userId: p.uid, planName: PLAN_NAME, daysOfWeek: days, aiSlots: aiSchedule.slots,
        subjectAllowlists: allow, freeTimeSites: freeSites, freeTimeApps: freeApps,
      })
      const remember = d.wakeTime && d.sleepTime
        ? rememberAnswers(sb as any, p.uid, { wakeTime: d.wakeTime, sleepTime: d.sleepTime, subjectAllowlists: allow })
        : rememberAllowlists(sb as any, p.uid, allow)
      await remember.catch(() => {})
      await recordOutcome(sb as any, { source: 'ai_custom', requestedMinutes: null, confirmedMinutes: studyMinutes(writtenSlots), outcome: 'accepted_as_is' }).catch(() => {})
      onPlanConfirmed({ days_of_week: days, slots: writtenSlots })
      finishConfirmed(aiSchedule.slots.filter(s => !s.is_sleep).length - writtenSlots.filter(s => !s.is_sleep).length)
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
    : filtering || step === 'apps_mode' ? 'Start typing to see options…'
    : step === 'returning' ? 'Or tell me what today looks like…'
    : 'Or tell me what to change…'

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
