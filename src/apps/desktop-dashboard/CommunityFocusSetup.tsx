import { useEffect, useState } from 'react'
import { REVM2_CONFIG } from '../../lib/supabase.js'
import {
  appPickerAvailable, channelPickId, listPickableApps, resolveChannelSeed,
  type PickableApp, type SubjectAllowlist,
} from './wynky/wynkyPlanner'
import { COMMUNITY_BLOCKED_SITES } from './lib/communityEnforce'

/* Asked once when a member accepts a community schedule: for each subject
   in the week, which sites, YouTube channels and apps Focus Lock allows
   during its blocks. Pre-filled with what the member already set up with
   Wynky; they confirm or change it, then the schedule is enforced. */

const emptyAllow = (): SubjectAllowlist => ({ sites: [], apps: [], channels: [], appsMode: 'whitelist' })

export function cleanDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}
const isYoutube = (s: string) => s === 'youtube.com' || s.endsWith('.youtube.com')

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] text-wk-ink-100"
      style={{ background: 'rgba(255,138,61,0.12)', border: '1px solid rgba(255,138,61,0.35)' }}>
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}
        className="w-4 h-4 rounded-full flex items-center justify-center text-wk-ink-400 hover:text-white leading-none">×</button>
    </span>
  )
}

function AddInput({ placeholder, busy, onAdd }: { placeholder: string; busy?: boolean; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const add = () => { if (v.trim()) { onAdd(v.trim()); setV('') } }
  return (
    <div className="flex gap-2 mt-2">
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        className="flex-1 min-w-0 px-3 py-2 rounded-lg text-[13px] text-wk-ink-100 outline-none border"
        style={{ background: 'rgba(38,38,42,0.5)', borderColor: '#3A3A3A' }} />
      <button type="button" onClick={add} disabled={busy || !v.trim()}
        className="px-3 py-2 rounded-lg text-[12px] font-semibold text-wk-ink-100 border disabled:opacity-40"
        style={{ borderColor: '#3A3A3A', background: 'rgba(38,38,42,0.8)' }}>{busy ? 'Finding…' : 'Add'}</button>
    </div>
  )
}

function SubjectCard({ subject, allow, apps, onChange }: {
  subject: string; allow: SubjectAllowlist; apps: PickableApp[]; onChange: (a: SubjectAllowlist) => void
}) {
  const [note, setNote] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const channels = allow.channels || []
  const nothing = !allow.sites.length && !allow.apps.length && !channels.length

  async function addChannel(q: string) {
    setFinding(true); setNote(null)
    const m = await resolveChannelSeed(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON, q).catch(() => null)
    setFinding(false)
    if (!m) { setNote(`Couldn't find a YouTube channel called "${q}".`); return }
    const id = channelPickId(m)
    if (channels.some(c => c.id === id)) return
    // A channel only works with YouTube itself allowed.
    onChange({ ...allow, channels: [...channels, { id, label: m.title }], sites: allow.sites.some(isYoutube) ? allow.sites : [...allow.sites, 'youtube.com'] })
  }
  function addSite(raw: string) {
    const d = cleanDomain(raw)
    if (!d) { setNote(`"${raw}" isn't a website address, like khanacademy.org.`); return }
    setNote(null)
    if (!allow.sites.includes(d)) onChange({ ...allow, sites: [...allow.sites, d] })
  }
  function addApp(id: string) {
    if (id && !allow.apps.includes(id)) onChange({ ...allow, apps: [...allow.apps, id] })
  }

  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(38,38,42,0.35)', borderColor: '#3A3A3A' }}>
      <div className="text-[14px] font-semibold text-wk-ink-100">{subject}</div>

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-wk-ink-500">Allowed websites</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {allow.sites.map(s => <Chip key={s} label={s} onRemove={() => onChange({ ...allow, sites: allow.sites.filter(x => x !== s), channels: isYoutube(s) ? [] : channels })} />)}
      </div>
      <AddInput placeholder="e.g. khanacademy.org" onAdd={addSite} />

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-wk-ink-500">Allowed YouTube channels</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {channels.map(c => <Chip key={c.id} label={c.label} onRemove={() => onChange({ ...allow, channels: channels.filter(x => x.id !== c.id) })} />)}
      </div>
      <AddInput placeholder="Channel name, e.g. Physics Wallah" busy={finding} onAdd={q => { void addChannel(q) }} />

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-wk-ink-500">Apps</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {allow.apps.map(a => <Chip key={a} label={apps.find(x => x.id === a)?.label ?? a} onRemove={() => onChange({ ...allow, apps: allow.apps.filter(x => x !== a) })} />)}
      </div>
      {appPickerAvailable() ? (
        <>
          <select value="" onChange={e => addApp(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg text-[13px] text-wk-ink-100 outline-none border"
            style={{ background: 'rgba(38,38,42,0.5)', borderColor: '#3A3A3A' }}>
            <option value="">Add an open app…</option>
            {apps.filter(a => !allow.apps.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {allow.apps.length > 0 && (
            <div className="flex gap-2 mt-2">
              {(['whitelist', 'blacklist'] as const).map(m => (
                <button key={m} type="button" onClick={() => onChange({ ...allow, appsMode: m })}
                  className="px-3 py-1.5 rounded-lg text-[12px] border"
                  style={(allow.appsMode ?? 'blacklist') === m
                    ? { borderColor: '#FF8A3D', color: '#FFB057', background: 'rgba(255,138,61,0.12)' }
                    : { borderColor: '#3A3A3A', color: '#9C968C' }}>
                  {m === 'whitelist' ? 'Only these apps stay open' : 'Close these apps'}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1.5 text-[12px] text-wk-ink-500">Apps can be picked in the Wynko desktop app.</div>
      )}

      {note && <div className="mt-2 text-[12px] text-[#FFA94D]">{note}</div>}
      {nothing && (
        <div className="mt-3 text-[12px] text-wk-ink-400 leading-relaxed">
          Nothing chosen: common distractions ({COMMUNITY_BLOCKED_SITES.slice(0, 4).join(', ')} and more) are blocked during {subject}.
        </div>
      )}
    </div>
  )
}

export default function CommunityFocusSetup({ communityName, subjects, initial, onConfirm, onCancel }: {
  communityName: string
  subjects: string[]
  initial: Record<string, SubjectAllowlist>
  onConfirm: (allow: Record<string, SubjectAllowlist>) => Promise<void> | void
  onCancel: () => void
}) {
  const [allow, setAllow] = useState<Record<string, SubjectAllowlist>>(() =>
    Object.fromEntries(subjects.map(s => [s, { ...emptyAllow(), ...(initial[s] || {}), channels: initial[s]?.channels || [] }])))
  const [apps, setApps] = useState<PickableApp[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (appPickerAvailable()) void listPickableApps().then(setApps).catch(() => {}) }, [])

  async function confirm() {
    setSaving(true)
    try { await onConfirm(allow) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)]"
      onClick={e => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="community-focus-title"
        className="w-[620px] max-w-full max-h-[94vh] overflow-y-auto rounded-2xl border p-6"
        style={{ background: '#161618', borderColor: '#3A3A3A' }}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div id="community-focus-title" className="text-lg font-semibold text-wk-ink-100">Set up Focus Lock for {communityName}</div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-wk-ink-400 hover:text-wk-ink-100 text-xl leading-none">×</button>
        </div>
        <div className="text-[13px] text-wk-ink-400 leading-relaxed mb-4">
          Focus Lock will enforce this schedule. Choose what stays allowed during each subject; everything else is blocked.
          Your own schedules pause while you follow it.
        </div>

        <div className="flex flex-col gap-3">
          {subjects.map(s => (
            <SubjectCard key={s} subject={s} allow={allow[s]} apps={apps} onChange={a => setAllow(prev => ({ ...prev, [s]: a }))} />
          ))}
        </div>

        <div className="flex gap-3 mt-5 justify-end">
          <button type="button" onClick={onCancel} disabled={saving}
            className="min-w-[110px] px-5 py-2.5 rounded-xl border text-sm text-wk-ink-300 hover:text-white transition-colors"
            style={{ borderColor: '#3A3A3A', background: 'rgba(38,38,42,0.5)' }}>
            Cancel
          </button>
          <button type="button" onClick={() => { void confirm() }} disabled={saving}
            className="min-w-[170px] px-6 py-2.5 rounded-xl text-wk-black-950 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(90deg, #FF8A3D 0%, #FFB057 100%)' }}>
            {saving ? 'Setting up…' : 'Accept and enforce'}
          </button>
        </div>
      </div>
    </div>
  )
}
