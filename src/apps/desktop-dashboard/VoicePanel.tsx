import { useState } from 'react'
import type { VoiceRoom } from './lib/voiceRoom'
import type { RoomMember } from './lib/studyRooms'

/* Voice controls for a study room (audio only). The call itself lives in
   lib/voiceRoom.ts; this is just the panel: join/leave, mute, deafen,
   quiet mode, a settings drawer, and who is in the call. */

const ORANGE = '#FF8A3D'

function Icon({ d, off, cls = 'w-4 h-4' }: { d: React.ReactNode; off?: boolean; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {d}
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}
const MIC = <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></>
const HEADPHONES = <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>
const MOON = <path d="M21 13.5A8.5 8.5 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z" />
const GEAR = <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>

function RoundBtn({ active, danger, label, onClick, children, disabled }: {
  active?: boolean; danger?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean
}) {
  const on = !!active
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} title={label} aria-label={label}
      className="flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-all hover:opacity-90 disabled:opacity-40"
      style={{
        color: danger ? '#F87171' : on ? '#0B0B0D' : '#C9C4BA',
        background: on ? ORANGE : danger ? 'rgba(248,113,113,0.1)' : '#1D1D20',
        borderColor: danger ? 'rgba(248,113,113,0.35)' : on ? ORANGE : '#2E2E33',
      }}>
      {children}
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span>
        <span className="block text-[13px] text-wk-ink-200">{label}</span>
        {hint && <span className="block text-[11px] text-wk-ink-500 leading-snug">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 flex-shrink-0" style={{ accentColor: ORANGE }} />
    </label>
  )
}

export default function VoicePanel({ voice, members }: { voice: VoiceRoom; members: RoomMember[] }) {
  const [open, setOpen] = useState(false)
  const { status, prefs } = voice
  const byId = new Map(members.map(m => [m.user_id, m]))
  const inCall = voice.peers
    .map(p => ({ p, m: byId.get(p.userId) }))
    .sort((a, b) => (b.m?.is_me ? 1 : 0) - (a.m?.is_me ? 1 : 0))

  return (
    <div className="mb-5 rounded-2xl border bg-[#161618] border-[#26262A]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: status === 'on' ? '#34D399' : '#4A4741' }} />
          <span className="text-sm font-semibold text-wk-ink-200">Voice</span>
          <span className="text-[12px] text-wk-ink-500 truncate">
            {status === 'on' ? `${voice.peers.length} in call${prefs.quiet ? ' · quiet mode' : ''}` : status === 'joining' ? 'Connecting…' : 'Talk with the room, audio only'}
          </span>
        </div>

        {status === 'off' && (
          <>
            <RoundBtn label="Join quietly: listen-only, lower volume, no chimes" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}>
              <Icon d={MOON} /> Quiet mode
            </RoundBtn>
            <button type="button" onClick={() => void voice.join()}
              className="px-5 py-2 rounded-full text-[13px] font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: ORANGE }}>
              Join voice
            </button>
          </>
        )}
        {status === 'joining' && <span className="text-[13px] text-wk-ink-400">Joining…</span>}
        {status === 'on' && (
          <>
            <RoundBtn label={voice.muted ? 'Unmute microphone' : 'Mute microphone'} active={!voice.muted && voice.micLive} onClick={voice.toggleMute} disabled={voice.deafened}>
              <Icon d={MIC} off={voice.muted || voice.deafened} /> {voice.muted ? 'Unmute' : prefs.pushToTalk ? 'Hold Space' : 'Mic on'}
            </RoundBtn>
            <RoundBtn label={voice.deafened ? 'Hear everyone again' : 'Stop hearing everyone (also mutes you)'} active={voice.deafened} onClick={voice.toggleDeafen}>
              <Icon d={HEADPHONES} off={voice.deafened} /> {voice.deafened ? 'Deafened' : 'Deafen'}
            </RoundBtn>
            <RoundBtn label="Quiet mode: mic off, others quieter, no chimes" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}>
              <Icon d={MOON} /> Quiet
            </RoundBtn>
            <RoundBtn label="Voice settings" active={open} onClick={() => setOpen(o => !o)}>
              <Icon d={GEAR} />
            </RoundBtn>
            <RoundBtn label="Leave voice" danger onClick={() => void voice.leave()}>Leave</RoundBtn>
          </>
        )}
        {status === 'off' && (
          <RoundBtn label="Voice settings" active={open} onClick={() => setOpen(o => !o)}><Icon d={GEAR} /></RoundBtn>
        )}
      </div>

      {voice.error && (
        <div className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-xl px-3 py-2 text-[12px]"
          style={{ background: 'rgba(248,113,113,0.08)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}>
          <span>{voice.error}</span>
          <button type="button" onClick={voice.clearError} className="opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}
      {voice.notice && status === 'on' && !voice.error && (
        <div className="mx-4 mb-3 text-[12px] text-wk-ink-500">{voice.notice}</div>
      )}

      {open && (
        <div className="mx-4 mb-3 rounded-xl border px-4 py-2 bg-[#121214] border-[#26262A]">
          <label className="flex items-center gap-3 py-2">
            <span className="text-[13px] text-wk-ink-200 w-28 flex-shrink-0">Volume</span>
            <input type="range" min={0} max={100} value={prefs.volume} onChange={e => voice.updatePrefs({ volume: Number(e.target.value) })}
              className="flex-1" style={{ accentColor: ORANGE }} aria-label="Volume" />
            <span className="text-[12px] font-mono text-wk-ink-400 w-9 text-right">{prefs.volume}</span>
          </label>
          <Toggle label="Quiet mode" hint="Listen-only, others play at about a third of the volume, no join/leave chimes."
            checked={prefs.quiet} onChange={voice.setQuiet} />
          <Toggle label="Push to talk" hint="Hold Space to talk. Space is ignored while you type in a box."
            checked={prefs.pushToTalk} onChange={v => voice.updatePrefs({ pushToTalk: v })} />
          <Toggle label="Noise suppression" hint="Cuts keyboard and background noise."
            checked={prefs.noiseSuppression} onChange={v => voice.updatePrefs({ noiseSuppression: v })} />
          <Toggle label="Echo cancellation" hint="Stops others hearing themselves back. Turn off if you use headphones and want clearer audio."
            checked={prefs.echoCancellation} onChange={v => voice.updatePrefs({ echoCancellation: v })} />
          <Toggle label="Auto volume (gain)" hint="Evens out how loud your mic is."
            checked={prefs.autoGain} onChange={v => voice.updatePrefs({ autoGain: v })} />
        </div>
      )}

      {status === 'on' && inCall.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {inCall.map(({ p, m }) => {
            const talking = voice.speaking.has(p.userId)
            const name = m ? (m.is_me ? 'You' : m.name) : 'Someone'
            return (
              <div key={p.userId} className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 border"
                style={{ background: '#1D1D20', borderColor: talking ? '#34D399' : '#2E2E33', boxShadow: talking ? '0 0 0 2px rgba(52,211,153,0.25)' : 'none', transition: 'all .15s' }}>
                {m?.avatar_url
                  ? <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  : <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-[#0B0B0D]" style={{ background: ORANGE }}>{name.slice(0, 1).toUpperCase()}</span>}
                <span className="text-[12px] text-wk-ink-200">{name}</span>
                {(p.muted || p.deafened) && (
                  <span className="text-wk-ink-500" title={p.deafened ? 'Deafened' : 'Muted'}>
                    <Icon d={p.deafened ? HEADPHONES : MIC} off cls="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
