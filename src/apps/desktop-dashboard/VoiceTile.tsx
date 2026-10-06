import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceRoom } from './lib/voiceRoom'
import { nudgeToTalk } from './lib/voiceRoom'

/* Voice controls that live on a study-room tile. Wrap a member's card in
   <VoiceTile>: it shows that person's mic / speaking state, and a small tray
   that appears when the cursor moves over the tile or a finger touches it,
   then fades a few seconds after the last interaction.

   Your own tile's tray: join / leave, mute, push-to-talk, quiet mode (hear
   nobody), deafen and a settings drawer. Someone else's tile: ask them to talk
   (a notification). The call itself is lib/voiceRoom.ts. */

const ORANGE = '#FF8A3D'
/** How long the tray stays up after the last move / click / touch. */
const TRAY_VISIBLE_MS = 3500

function Icon({ d, off, cls = 'w-4 h-4' }: { d: React.ReactNode; off?: boolean; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}
const MIC = <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></>
const HEADPHONES = <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>
const MOON = <path d="M21 13.5A8.5 8.5 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z" />
const HAND = <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4a1.5 1.5 0 0 1 3 0v6" /><path d="M14 10V5.5a1.5 1.5 0 0 1 3 0V13" /><path d="M8 13l-1.6-2.2a1.5 1.5 0 0 0-2.4 1.8L7 18a6 6 0 0 0 5 3h1a6 6 0 0 0 6-6v-2" /></>
const GEAR = <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>
const BELL = <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>
const LEAVE = <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>

function TrayBtn({ label, active, danger, onClick, disabled, children }: {
  label: string; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} title={label}
      className="h-8 min-w-8 px-2 rounded-full flex items-center justify-center gap-1.5 text-[11px] font-semibold border transition-all hover:brightness-125 disabled:opacity-40"
      style={{
        color: danger ? '#F87171' : active ? '#0B0B0D' : '#E4DFD5',
        background: active ? ORANGE : danger ? 'rgba(248,113,113,0.12)' : 'rgba(20,20,22,0.88)',
        borderColor: danger ? 'rgba(248,113,113,0.4)' : active ? ORANGE : 'rgba(255,255,255,0.12)',
      }}>
      {children}
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

export default function VoiceTile({ voice, userId, isMe, groupId, children }: {
  voice: VoiceRoom
  /** The member this tile shows (undefined for placeholder tiles). */
  userId?: string
  isMe: boolean
  groupId: string
  children: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(false)
  settingsRef.current = settingsOpen

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (!settingsRef.current) setVisible(false) }, TRAY_VISIBLE_MS)
  }, [])
  // Cursor move / click / touch: show the tray and restart the countdown.
  const reveal = useCallback(() => { setVisible(true); arm() }, [arm])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
  }, [])
  // Closing the settings drawer starts the fade-out countdown.
  useEffect(() => { if (!settingsOpen && visible) arm() }, [settingsOpen, visible, arm])

  const { status, prefs } = voice
  const peer = userId ? voice.peers.find(p => p.userId === userId) : undefined
  const inCall = status === 'on' && !!peer
  const speaking = !!userId && voice.speaking.has(userId)
  const micOff = isMe ? !voice.micLive : !!peer && (peer.muted || peer.deafened)
  const showTray = visible || settingsOpen

  function flash(msg: string) {
    setNudge(msg)
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
    nudgeTimer.current = setTimeout(() => setNudge(null), 2500)
  }
  async function sendNudge() {
    if (!userId) return
    const r = await nudgeToTalk(groupId, userId)
    flash(r === 'sent' ? 'Asked them to talk' : r === 'cooldown' ? 'Just asked, try again in a minute' : r === 'unavailable' ? 'Not available yet' : 'Could not send')
  }

  return (
    <div className="relative rounded-2xl transition-shadow"
      style={{ boxShadow: speaking ? '0 0 0 2px #34D399, 0 0 18px rgba(52,211,153,0.35)' : 'none' }}
      onPointerEnter={reveal} onPointerMove={reveal} onPointerDown={reveal} onFocus={reveal}>
      {children}

      {/* Mic state on every tile that is in the call. */}
      {inCall && (
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center z-10"
          title={peer?.deafened ? 'Deafened' : micOff ? 'Muted' : speaking ? 'Speaking' : 'Mic on'}
          style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${speaking ? '#34D399' : 'rgba(255,255,255,0.1)'}`, color: micOff ? '#9A958B' : '#34D399' }}>
          <Icon d={peer?.deafened ? HEADPHONES : MIC} off={micOff} cls="w-3.5 h-3.5" />
        </div>
      )}

      {/* The tray: hidden (and not clickable) until the tile is touched or hovered. */}
      <div className="absolute left-2 right-2 z-20 flex flex-wrap items-center justify-center gap-1.5 transition-opacity duration-200"
        style={{ top: '6.6rem', opacity: showTray ? 1 : 0, pointerEvents: showTray ? 'auto' : 'none' }}
        aria-hidden={!showTray}>
        {isMe ? (
          status === 'off' ? (
            <>
              <TrayBtn label="Quiet mode: hear nobody" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}><Icon d={MOON} /></TrayBtn>
              <TrayBtn label="Join voice" onClick={() => void voice.join()}>
                <Icon d={MIC} /> Join voice
              </TrayBtn>
              <TrayBtn label="Voice settings" active={settingsOpen} onClick={() => setSettingsOpen(o => !o)}><Icon d={GEAR} /></TrayBtn>
            </>
          ) : status === 'joining' ? (
            <span className="text-[11px] px-3 py-1.5 rounded-full text-wk-ink-300" style={{ background: 'rgba(20,20,22,0.88)' }}>Connecting…</span>
          ) : (
            <>
              <TrayBtn label={voice.muted ? 'Unmute' : 'Mute'} active={voice.micLive} onClick={voice.toggleMute} disabled={voice.deafened}>
                <Icon d={MIC} off={!voice.micLive} />
              </TrayBtn>
              <TrayBtn label="Push to talk: hold Space to speak" active={prefs.pushToTalk} onClick={() => voice.updatePrefs({ pushToTalk: !prefs.pushToTalk })}>
                <Icon d={HAND} />{prefs.pushToTalk && <span>{voice.pttHeld ? 'Talking' : 'Hold Space'}</span>}
              </TrayBtn>
              <TrayBtn label="Quiet mode: hear nobody" active={prefs.quiet} onClick={() => voice.setQuiet(!prefs.quiet)}><Icon d={MOON} /></TrayBtn>
              <TrayBtn label={voice.deafened ? 'Hear everyone again' : 'Deafen (hear nobody, and mute)'} active={voice.deafened} onClick={voice.toggleDeafen}>
                <Icon d={HEADPHONES} off={voice.deafened} />
              </TrayBtn>
              <TrayBtn label="Voice settings" active={settingsOpen} onClick={() => setSettingsOpen(o => !o)}><Icon d={GEAR} /></TrayBtn>
              <TrayBtn label="Leave voice" danger onClick={() => void voice.leave()}><Icon d={LEAVE} /></TrayBtn>
            </>
          )
        ) : (
          <TrayBtn label="Ask them to talk (sends a notification)" onClick={() => void sendNudge()} disabled={!userId}>
            <Icon d={BELL} /> Ask to talk
          </TrayBtn>
        )}
        {nudge && <span className="basis-full text-center text-[10px] text-wk-ink-200">{nudge}</span>}
        {isMe && (voice.error || (voice.notice && status === 'on')) && (
          <span className="basis-full text-center text-[10px]" style={{ color: voice.error ? '#F87171' : '#9A958B' }}>
            {voice.error || voice.notice}
          </span>
        )}
      </div>

      {isMe && settingsOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 rounded-xl border px-4 py-2 shadow-2xl bg-[#121214] border-[#2E2E33]">
          <label className="flex items-center gap-3 py-1.5">
            <span className="text-[12px] text-wk-ink-200 w-14 flex-shrink-0">Volume</span>
            <input type="range" min={0} max={100} value={prefs.volume} onChange={e => voice.updatePrefs({ volume: Number(e.target.value) })}
              className="flex-1" style={{ accentColor: ORANGE }} aria-label="Volume" />
            <span className="text-[11px] font-mono text-wk-ink-400 w-8 text-right">{prefs.volume}</span>
          </label>
          <Toggle label="Quiet mode" hint="Hear nobody; no join/leave chimes."
            checked={prefs.quiet} onChange={voice.setQuiet} />
          <Toggle label="Push to talk" hint="Hold Space to speak. Ignored while typing."
            checked={prefs.pushToTalk} onChange={v => voice.updatePrefs({ pushToTalk: v })} />
          <Toggle label="Noise suppression" hint="Cuts keyboard and background noise."
            checked={prefs.noiseSuppression} onChange={v => voice.updatePrefs({ noiseSuppression: v })} />
          <Toggle label="Echo cancellation" hint="On for speakers; off can sound clearer on headphones."
            checked={prefs.echoCancellation} onChange={v => voice.updatePrefs({ echoCancellation: v })} />
          <Toggle label="Auto volume (gain)" hint="Evens out how loud your mic is."
            checked={prefs.autoGain} onChange={v => voice.updatePrefs({ autoGain: v })} />
        </div>
      )}
    </div>
  )
}
