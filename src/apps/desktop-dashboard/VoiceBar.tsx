import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceRoom } from './lib/voiceRoom'
import { nudgeToTalk } from './lib/voiceRoom'
import type { RoomMember } from './lib/studyRooms'
import { VIcon, MIC, HEADPHONES, MOON, HAND, GEAR, BELL, LEAVE } from './VoiceIcons'

/* The voice controls for a study room, as one floating bar over the whole page,
   like the toolbar in a video call: it appears when the cursor moves or a finger
   touches anywhere on the page, and fades a few seconds after the last movement.
   It stays up while its settings or "ask to talk" list is open. While it is
   hidden it does not catch clicks, so a first tap only reveals it. The call
   itself is lib/voiceRoom.ts. */

const ORANGE = '#FF8A3D'
const VISIBLE_MS = 3500

function BarBtn({ label, text, active, danger, disabled, onClick, children }: {
  label: string; text: string; active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} title={label}
      className="flex flex-col items-center justify-center gap-1 w-[68px] py-2 rounded-xl transition-colors disabled:opacity-40"
      style={{
        color: danger ? '#F87171' : active ? ORANGE : '#E4DFD5',
        background: active ? 'rgba(255,138,61,0.14)' : 'transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(255,138,61,0.14)' : 'transparent' }}>
      {children}
      <span className="text-[10px] leading-none whitespace-nowrap">{text}</span>
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5 cursor-pointer">
      <span>
        <span className="block text-[12px] text-wk-ink-200">{label}</span>
        {hint && <span className="block text-[10px] text-wk-ink-500 leading-snug">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 flex-shrink-0" style={{ accentColor: ORANGE }} />
    </label>
  )
}

export default function VoiceBar({ voice, members, groupId, lift = false }: {
  voice: VoiceRoom; members: RoomMember[]; groupId: string
  /** Sit higher on the page so the bar never covers the chat box (it is at the bottom of the Chat tab). */
  lift?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [panel, setPanel] = useState<null | 'settings' | 'ask'>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef(panel)
  panelRef.current = panel

  const arm = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (!panelRef.current) setVisible(false) }, VISIBLE_MS)
  }, [])
  const reveal = useCallback(() => { setVisible(true); arm() }, [arm])

  // Any cursor movement, click or touch on the page brings the bar back.
  useEffect(() => {
    const evs: (keyof WindowEventMap)[] = ['pointermove', 'pointerdown', 'touchstart']
    evs.forEach(e => window.addEventListener(e, reveal, { passive: true }))
    reveal()
    return () => {
      evs.forEach(e => window.removeEventListener(e, reveal))
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (msgTimer.current) clearTimeout(msgTimer.current)
    }
  }, [reveal])
  // Closing a panel starts the countdown again.
  useEffect(() => { if (!panel && visible) arm() }, [panel, visible, arm])

  function flash(text: string) {
    setMsg(text)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(null), 3000)
    reveal()
  }
  async function ask(m: RoomMember) {
    const r = await nudgeToTalk(groupId, m.user_id)
    flash(r === 'sent' ? `Asked ${m.name} to talk` : r === 'cooldown' ? `${m.name} was just asked, try again in a minute` : r === 'unavailable' ? 'Ask to talk is not available yet' : 'Could not send')
  }

  const { status, prefs } = voice
  const others = members.filter(m => !m.is_me)
  const show = visible || !!panel
  const note = msg || voice.error || (status === 'on' ? voice.notice : null)

  return (
    <div className="fixed left-1/2 z-40 flex flex-col items-center gap-2 w-max max-w-[calc(100vw-24px)]"
      style={{ bottom: lift ? '7.5rem' : '1.5rem', transform: 'translateX(-50%)', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none', transition: 'opacity 200ms' }}
      aria-hidden={!show}>
      {panel === 'settings' && (
        <div className="w-80 max-w-full rounded-2xl border px-4 py-2 shadow-2xl bg-[#121214] border-[#2E2E33]">
          <label className="flex items-center gap-3 py-1.5">
            <span className="text-[12px] text-wk-ink-200 w-14 flex-shrink-0">Volume</span>
            <input type="range" min={0} max={100} value={prefs.volume} onChange={e => voice.updatePrefs({ volume: Number(e.target.value) })}
              className="flex-1" style={{ accentColor: ORANGE }} aria-label="Volume" />
            <span className="text-[11px] font-mono text-wk-ink-400 w-8 text-right">{prefs.volume}</span>
          </label>
          <Toggle label="Quiet mode" hint="Hear nobody; no join/leave chimes." checked={prefs.quiet} onChange={voice.setQuiet} />
          <Toggle label="Push to talk" hint="Hold Space to speak. Ignored while typing." checked={prefs.pushToTalk} onChange={v => voice.updatePrefs({ pushToTalk: v })} />
          <Toggle label="Noise suppression" hint="Cuts keyboard and background noise." checked={prefs.noiseSuppression} onChange={v => voice.updatePrefs({ noiseSuppression: v })} />
          <Toggle label="Echo cancellation" hint="On for speakers; off can sound clearer on headphones." checked={prefs.echoCancellation} onChange={v => voice.updatePrefs({ echoCancellation: v })} />
          <Toggle label="Auto volume (gain)" hint="Evens out how loud your mic is." checked={prefs.autoGain} onChange={v => voice.updatePrefs({ autoGain: v })} />
        </div>
      )}
      {panel === 'ask' && (
        <div className="w-72 max-w-full rounded-2xl border p-2 shadow-2xl bg-[#121214] border-[#2E2E33]">
          <div className="px-2 py-1.5 text-[11px] text-wk-ink-500">Ask someone to talk (sends them a notification)</div>
          {others.length === 0 && <div className="px-2 py-3 text-[12px] text-wk-ink-400">No one else is in this room yet.</div>}
          <div className="max-h-56 overflow-y-auto">
            {others.map(m => (
              <button key={m.user_id} type="button" onClick={() => void ask(m)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white/5">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  : <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-[#0B0B0D]" style={{ background: ORANGE }}>{m.name.slice(0, 1).toUpperCase()}</span>}
                <span className="flex-1 text-[13px] text-wk-ink-200 truncate">{m.name}</span>
                <span className="text-wk-ink-400"><VIcon d={BELL} cls="w-4 h-4" /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {note && (
        <div className="px-3 py-1.5 rounded-full text-[11px] border"
          style={{ background: 'rgba(18,18,20,0.92)', borderColor: voice.error && !msg ? 'rgba(248,113,113,0.4)' : '#2E2E33', color: voice.error && !msg ? '#F87171' : '#C9C4BA' }}>
          {note}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1 px-2 py-1.5 rounded-2xl border shadow-2xl backdrop-blur"
        style={{ background: 'rgba(18,18,20,0.94)', borderColor: '#2E2E33' }}>
        {status === 'off' && (
          <>
            <BarBtn label="Join voice" text="Join voice" onClick={() => void voice.join()}><VIcon d={MIC} cls="w-5 h-5" /></BarBtn>
            <BarBtn label="Quiet mode: hear nobody" text="Quiet" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}><VIcon d={MOON} cls="w-5 h-5" /></BarBtn>
          </>
        )}
        {status === 'joining' && <span className="px-5 py-3 text-[12px] text-wk-ink-300">Connecting…</span>}
        {status === 'on' && (
          <>
            <BarBtn label={voice.muted ? 'Unmute' : 'Mute'} text={voice.muted ? 'Unmute' : prefs.pushToTalk ? (voice.pttHeld ? 'Talking' : 'Hold Space') : 'Mute'}
              active={voice.micLive} disabled={voice.deafened} onClick={voice.toggleMute}>
              <VIcon d={MIC} off={!voice.micLive} cls="w-5 h-5" />
            </BarBtn>
            <BarBtn label="Push to talk: hold Space to speak" text="Push to talk" active={prefs.pushToTalk} onClick={() => voice.updatePrefs({ pushToTalk: !prefs.pushToTalk })}>
              <VIcon d={HAND} cls="w-5 h-5" />
            </BarBtn>
            <BarBtn label="Quiet mode: hear nobody" text="Quiet" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}><VIcon d={MOON} cls="w-5 h-5" /></BarBtn>
            <BarBtn label={voice.deafened ? 'Hear everyone again' : 'Deafen: hear nobody and mute'} text={voice.deafened ? 'Undeafen' : 'Deafen'} active={voice.deafened} onClick={voice.toggleDeafen}>
              <VIcon d={HEADPHONES} off={voice.deafened} cls="w-5 h-5" />
            </BarBtn>
          </>
        )}
        <BarBtn label="Ask someone to talk" text="Ask to talk" active={panel === 'ask'} onClick={() => setPanel(p => p === 'ask' ? null : 'ask')}><VIcon d={BELL} cls="w-5 h-5" /></BarBtn>
        <BarBtn label="Voice settings" text="Settings" active={panel === 'settings'} onClick={() => setPanel(p => p === 'settings' ? null : 'settings')}><VIcon d={GEAR} cls="w-5 h-5" /></BarBtn>
        {status === 'on' && <BarBtn label="Leave voice" text="Leave" danger onClick={() => void voice.leave()}><VIcon d={LEAVE} cls="w-5 h-5" /></BarBtn>}
      </div>
    </div>
  )
}
