import { useEffect, useMemo, useState } from 'react'
import { sb } from '../../_shared/supabaseClient'
import { REVM2_CONFIG } from '../../../lib/supabase.js'
import {
  loadKnownProfile, loadRemembered, defaultDailyMinutes, distractionSites, distractionApps,
  recommend, confirmPlan, confirmAiPlan, rememberAnswers, recordOutcome, ensurePresets,
  STUDY_MODE_OPTIONS,
  type WynkyKnownProfile, type WynkyRemembered, type AiSlot,
} from './wynkyPlanner'
import type { GeneratorResult } from '../../_shared/scheduleGenerator'

/* ============================================================
   WynkyPage.tsx

   Wynky, the scheduler bot: reads what the quiz + onboarding already
   know about the student, asks only what's still missing (once —
   remembered after), recommends a full day, and writes nothing until
   the student taps Confirm. A free-text box lets a custom ask jump
   straight to the AI edge function instead of the rule-based
   recommender, same presets either way.
   ============================================================ */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BLOCK_LENGTHS = [30, 45, 60, 90]

type Step = 'loading' | 'setup' | 'preview' | 'custom_preview' | 'saved'

interface SubjectForm { sites: string; apps: string }

export default function WynkyPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [step, setStep] = useState<Step>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [known, setKnown] = useState<WynkyKnownProfile | null>(null)
  const [remembered, setRemembered] = useState<WynkyRemembered | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Setup inputs
  const [wakeTime, setWakeTime] = useState('06:30')
  const [sleepTime, setSleepTime] = useState('23:00')
  const [dailyMinutes, setDailyMinutes] = useState(240)
  const [blockLength, setBlockLength] = useState(60)
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [subjectForms, setSubjectForms] = useState<Record<string, SubjectForm>>({})
  const [extraFreeSites, setExtraFreeSites] = useState('')
  const [editedSinceGenerate, setEditedSinceGenerate] = useState(false)

  // Preview
  const [result, setResult] = useState<GeneratorResult | null>(null)
  const [saving, setSaving] = useState(false)

  // Custom AI ask
  const [showCustom, setShowCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const [customBusy, setCustomBusy] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [aiSchedule, setAiSchedule] = useState<{ name: string; days_of_week: number[]; slots: AiSlot[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || cancelled) return
      const uid = session.user.id
      setUserId(uid)
      try {
        const [k, r] = await Promise.all([loadKnownProfile(sb as any, uid), loadRemembered(sb as any, uid)])
        if (cancelled) return
        setKnown(k)
        setRemembered(r)
        if (r.wakeTime) setWakeTime(r.wakeTime)
        if (r.sleepTime) setSleepTime(r.sleepTime)
        setDailyMinutes(defaultDailyMinutes(k, r))
        const subjects = k.subjects.length ? k.subjects : ['Study']
        const forms: Record<string, SubjectForm> = {}
        for (const s of subjects) {
          const remembered_ = r.subjectAllowlists[s]
          forms[s] = { sites: (remembered_?.sites || []).join(', '), apps: (remembered_?.apps || []).join(', ') }
        }
        setSubjectForms(forms)
        setStep('setup')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your profile.')
      }
    })
    return () => { cancelled = true }
  }, [])

  const freeSitesFromQuiz = useMemo(() => known ? distractionSites(known.distractionTags) : [], [known])
  const freeAppsFromQuiz = useMemo(() => known ? distractionApps(known.distractionTags) : [], [known])
  const freeSites = useMemo(() => {
    const extra = extraFreeSites.split(',').map(s => s.trim()).filter(Boolean)
    return [...new Set([...freeSitesFromQuiz, ...extra])]
  }, [freeSitesFromQuiz, extraFreeSites])

  const subjectAllowlists = useMemo(() => {
    const out: Record<string, { sites: string[]; apps: string[] }> = {}
    for (const [name, form] of Object.entries(subjectForms)) {
      out[name] = {
        sites: form.sites.split(',').map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean),
        apps: form.apps.split(',').map(s => s.trim()).filter(Boolean),
      }
    }
    return out
  }, [subjectForms])

  function toggleDay(d: number) {
    setEditedSinceGenerate(true)
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  function generatePreview() {
    const subjects = Object.keys(subjectAllowlists).filter(name => subjectAllowlists[name].sites.length || subjectAllowlists[name].apps.length)
    const r = recommend({ wakeTime, sleepTime, dailyMinutes, blockLengthMinutes: blockLength, subjects: subjects.length ? subjects : Object.keys(subjectAllowlists) })
    setResult(r)
    setStep('preview')
  }

  async function handleConfirm() {
    if (!userId || !result) return
    setSaving(true); setError(null)
    try {
      await confirmPlan(sb as any, {
        userId, planName: 'Wynky Plan', result, subjectAllowlists,
        freeTimeSites: freeSites, freeTimeApps: freeAppsFromQuiz, daysOfWeek: days,
      })
      await rememberAnswers(sb as any, userId, { wakeTime, sleepTime, subjectAllowlists })
      await recordOutcome(sb as any, {
        source: 'rule_based', requestedMinutes: dailyMinutes, confirmedMinutes: result.scheduledStudyMinutes,
        outcome: editedSinceGenerate ? 'accepted_edited' : 'accepted_as_is',
      })
      setStep('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCustomAsk() {
    if (!userId || !customText.trim()) return
    setCustomBusy(true); setCustomError(null)
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw new Error('Not signed in.')
      const { presetNames } = await ensurePresets(sb as any, userId, {
        subjectAllowlists, freeTimeSites: freeSites, freeTimeApps: freeAppsFromQuiz,
      })
      const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ mode: 'text', goal_text: customText.trim(), presets: presetNames.map(n => ({ name: n })), subjects: Object.keys(subjectAllowlists) }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Wynky could not generate that.')
      setAiSchedule(data.schedule)
      setStep('custom_preview')
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setCustomBusy(false)
    }
  }

  async function handleConfirmCustom() {
    if (!userId || !aiSchedule) return
    setSaving(true); setError(null)
    try {
      await confirmAiPlan(sb as any, {
        userId, planName: aiSchedule.name || 'Wynky Plan', daysOfWeek: aiSchedule.days_of_week?.length ? aiSchedule.days_of_week : days,
        aiSlots: aiSchedule.slots, subjectAllowlists, freeTimeSites: freeSites, freeTimeApps: freeAppsFromQuiz,
      })
      await rememberAnswers(sb as any, userId, { wakeTime, sleepTime, subjectAllowlists })
      const totalMin = (aiSchedule.slots || []).filter(s => !s.is_sleep).reduce((sum, s) => {
        const [sh, sm] = s.start_time.split(':').map(Number); const [eh, em] = s.end_time.split(':').map(Number)
        return sum + ((eh * 60 + em) - (sh * 60 + sm))
      }, 0)
      await recordOutcome(sb as any, { source: 'ai_custom', requestedMinutes: dailyMinutes, confirmedMinutes: totalMin, outcome: 'accepted_edited' })
      setStep('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'loading') {
    return <div className="p-8 text-slate-400 text-sm">Wynky is looking at what it already knows about you…</div>
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Wynky</h1>
        <p className="text-slate-400 text-sm mt-0.5">Tell Wynky your day once — it'll recommend a routine, and lock in the sites, apps and YouTube channels for each part of it.</p>
      </div>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm p-3">{error}</div>}

      {step === 'setup' && known && (
        <div className="space-y-5">
          <div className="rounded-2xl border p-5" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            <div className="text-sm text-slate-400 mb-3">
              Wynky already knows {known.exam ? <>you're prepping for <b className="text-white">{known.exam}</b></> : 'a bit about you'}
              {known.subjects.length ? <> in <b className="text-white">{known.subjects.join(', ')}</b></> : null}
              {known.distractionTags.length ? <> — and that {known.distractionTags.join(', ')} eats into your day.</> : '.'}
              {remembered && remembered.acceptedCount + remembered.adjustedCount > 0 && (
                <> It's tuned this suggestion from {remembered.acceptedCount + remembered.adjustedCount} earlier plan{remembered.acceptedCount + remembered.adjustedCount === 1 ? '' : 's'} you confirmed.</>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs text-slate-400">Wake time
                <input type="time" value={wakeTime} onChange={e => { setWakeTime(e.target.value); setEditedSinceGenerate(true) }}
                  className="mt-1 w-full bg-[#0B1530] border border-[#1A2845] rounded-lg px-3 py-2 text-white text-sm" />
              </label>
              <label className="text-xs text-slate-400">Sleep time
                <input type="time" value={sleepTime} onChange={e => { setSleepTime(e.target.value); setEditedSinceGenerate(true) }}
                  className="mt-1 w-full bg-[#0B1530] border border-[#1A2845] rounded-lg px-3 py-2 text-white text-sm" />
              </label>
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-400 mb-1">Study time today: <b className="text-white">{(dailyMinutes / 60).toFixed(1)}h</b></div>
              <input type="range" min={30} max={600} step={15} value={dailyMinutes}
                onChange={e => { setDailyMinutes(parseInt(e.target.value, 10)); setEditedSinceGenerate(true) }} className="w-full" />
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">Block length</span>
              {BLOCK_LENGTHS.map(len => (
                <button key={len} onClick={() => { setBlockLength(len); setEditedSinceGenerate(true) }}
                  className={`px-3 py-1 rounded-full text-xs border ${blockLength === len ? 'bg-violet-600 border-violet-500 text-white' : 'border-[#1A2845] text-slate-400'}`}>
                  {len}m
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-400 mr-1">Repeats on</span>
              {DAY_LABELS.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-xs border ${days.includes(i) ? 'bg-violet-600 border-violet-500 text-white' : 'border-[#1A2845] text-slate-400'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-5 space-y-4" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            <div className="text-sm font-semibold text-white">How do you study each subject?</div>
            <div className="text-xs text-slate-500 -mt-2">Tap what you use, like picking from a support bot's quick replies — or type your own. Wynky never guesses a site you didn't pick or type. Add specific YouTube channels from the Focus Lock page's per-channel rules once this plan is live.</div>
            {Object.entries(subjectForms).map(([name, form]) => {
              const currentSites = form.sites.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
              return (
                <div key={name} className="space-y-1.5">
                  <div className="text-sm text-white font-medium">{name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {STUDY_MODE_OPTIONS.map(opt => {
                      const picked = opt.site ? currentSites.includes(opt.site) : false
                      return (
                        <button key={opt.id} type="button"
                          onClick={() => {
                            if (!opt.site) return // "Offline coaching" is just informational — nothing to allow-list
                            setSubjectForms(prev => {
                              const sites = prev[name].sites.split(',').map(s => s.trim()).filter(Boolean)
                              const has = sites.map(s => s.toLowerCase()).includes(opt.site!)
                              const next = has ? sites.filter(s => s.toLowerCase() !== opt.site) : [...sites, opt.site!]
                              return { ...prev, [name]: { ...prev[name], sites: next.join(', ') } }
                            })
                            setEditedSinceGenerate(true)
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${picked ? 'bg-violet-600 border-violet-500 text-white' : 'border-[#1A2845] text-slate-400 hover:text-slate-200'}`}>
                          {opt.label}{picked ? ' ✓' : ''}
                        </button>
                      )
                    })}
                  </div>
                  <input placeholder="or type your own sites, comma separated (e.g. khanacademy.org)" value={form.sites}
                    onChange={e => { setSubjectForms(prev => ({ ...prev, [name]: { ...prev[name], sites: e.target.value } })); setEditedSinceGenerate(true) }}
                    className="w-full bg-[#0B1530] border border-[#1A2845] rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              )
            })}
          </div>

          <div className="rounded-2xl border p-5 space-y-2" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            <div className="text-sm font-semibold text-white">Outside study blocks, Wynky will block</div>
            <div className="flex flex-wrap gap-1.5">
              {freeSites.map(s => <span key={s} className="px-2 py-1 rounded-full text-xs bg-[#1A2845] text-slate-300">{s}</span>)}
              {!freeSites.length && <span className="text-xs text-slate-500">Nothing from your quiz yet — add some below.</span>}
            </div>
            <input placeholder="add more sites to keep off during free time, comma separated" value={extraFreeSites}
              onChange={e => setExtraFreeSites(e.target.value)}
              className="w-full bg-[#0B1530] border border-[#1A2845] rounded-lg px-3 py-2 text-white text-sm mt-2" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={generatePreview} className="px-5 py-2.5 rounded-full font-semibold text-white text-sm bg-violet-600 hover:bg-violet-500">
              Show my recommended day
            </button>
            <button onClick={() => setShowCustom(s => !s)} className="text-sm text-violet-400 hover:text-violet-300">
              None of this fits — ask Wynky directly
            </button>
          </div>

          {showCustom && (
            <div className="rounded-2xl border p-4 space-y-2" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
              <div className="text-xs text-slate-500">Wynky hands this straight to AI (Gemini Flash) instead of guessing.</div>
              <textarea value={customText} onChange={e => setCustomText(e.target.value)} rows={3}
                placeholder="e.g. I have coaching 4-7pm on weekdays, keep mornings light, exam is in 3 months"
                className="w-full bg-[#0B1530] border border-[#1A2845] rounded-lg px-3 py-2 text-white text-sm" />
              {customError && <div className="text-xs text-red-400">{customError}</div>}
              <button onClick={handleCustomAsk} disabled={customBusy || !customText.trim()}
                className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50">
                {customBusy ? 'Asking Wynky…' : 'Generate with AI'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'preview' && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            <div className="text-sm font-semibold text-white mb-1">Here's your day — confirm to make it live</div>
            <div className="text-xs text-slate-500 mb-3">
              {(result.scheduledStudyMinutes / 60).toFixed(1)}h of study across {result.blocks.filter(b => b.kind === 'study').length} blocks
              {result.wasCut ? ' (trimmed to fit between your wake and sleep times)' : ''}.
            </div>
            <div className="space-y-1.5">
              {result.blocks.map((b, i) => (
                <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${b.kind === 'sleep' ? 'bg-[#141B40] text-slate-500' : b.kind === 'break' ? 'bg-transparent text-slate-600 text-xs' : 'bg-[#141B40] text-white'}`}>
                  <span>{b.kind === 'sleep' ? '😴 Sleep' : b.kind === 'break' ? '· break ·' : b.subjectName}</span>
                  <span className="font-mono text-xs">{b.startTime}–{b.endTime}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleConfirm} disabled={saving} className="px-5 py-2.5 rounded-full font-semibold text-white text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Confirm this plan'}
            </button>
            <button onClick={() => setStep('setup')} className="px-5 py-2.5 rounded-full text-sm text-slate-400 border border-[#1A2845]">
              Adjust
            </button>
          </div>
        </div>
      )}

      {step === 'custom_preview' && aiSchedule && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            <div className="text-sm font-semibold text-white mb-1">{aiSchedule.name || 'Custom plan'} — confirm to make it live</div>
            <div className="space-y-1.5 mt-3">
              {(aiSchedule.slots || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-[#141B40] text-white">
                  <span>{s.is_sleep ? '😴 Sleep' : (s.subject || s.preset_name)}</span>
                  <span className="font-mono text-xs">{s.start_time}–{s.end_time}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleConfirmCustom} disabled={saving} className="px-5 py-2.5 rounded-full font-semibold text-white text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Confirm this plan'}
            </button>
            <button onClick={() => setStep('setup')} className="px-5 py-2.5 rounded-full text-sm text-slate-400 border border-[#1A2845]">
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'saved' && (
        <div className="rounded-2xl border p-6 text-center space-y-3" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
          <div className="text-lg font-semibold text-white">Your plan is live</div>
          <div className="text-sm text-slate-400">Focus Lock will follow it automatically from your next scheduled block. Ask Wynky again anytime — it'll remember your answers and need less setup.</div>
          <button onClick={() => onNavigate('focus')} className="px-5 py-2.5 rounded-full font-semibold text-white text-sm bg-violet-600 hover:bg-violet-500">
            Go to Focus Lock
          </button>
        </div>
      )}
    </div>
  )
}
