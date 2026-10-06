import type { VoiceRoom } from './lib/voiceRoom'
import { VIcon, MIC, HEADPHONES } from './VoiceIcons'

/* Wraps a member's card in the room grid: a live mic badge in the corner and a
   green ring while that person is speaking. The controls are not here - they are
   in the page-wide VoiceBar. Nothing is drawn for people who are not in the call. */
export default function VoiceTile({ voice, userId, isMe, children }: {
  voice: VoiceRoom
  userId?: string
  isMe: boolean
  children: React.ReactNode
}) {
  const peer = userId ? voice.peers.find(p => p.userId === userId) : undefined
  const inCall = voice.status === 'on' && !!peer
  const speaking = !!userId && voice.speaking.has(userId)
  const off = isMe ? !voice.micLive : !!peer && (peer.muted || peer.deafened)
  return (
    <div className="relative rounded-2xl transition-shadow"
      style={{ boxShadow: speaking ? '0 0 0 2px #34D399, 0 0 18px rgba(52,211,153,0.35)' : 'none' }}>
      {children}
      {inCall && (
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center z-10"
          title={peer?.deafened ? 'Deafened' : off ? 'Muted' : speaking ? 'Speaking' : 'Mic on'}
          style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${speaking ? '#34D399' : 'rgba(255,255,255,0.1)'}`, color: off ? '#9A958B' : '#34D399' }}>
          <VIcon d={peer?.deafened ? HEADPHONES : MIC} off={off} cls="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  )
}
