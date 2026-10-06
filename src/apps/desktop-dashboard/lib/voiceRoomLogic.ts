// Pure rules for voice in study rooms (no Agora, no React, no network), kept
// apart from voiceRoom.ts so they can be unit-tested with plain vitest.

export interface VoicePrefs {
  /** Quiet mode: you hear nobody (everyone else is silenced for you) and the
   *  join/leave chimes are off. Your own microphone is unaffected. */
  quiet: boolean
  /** Playback volume for everyone else, 0-100. */
  volume: number
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGain: boolean
  /** Hold Space to talk instead of an open mic. */
  pushToTalk: boolean
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  quiet: false,
  volume: 100,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  pushToTalk: false,
}

/** Anything above this on Agora's 0-100 volume indicator counts as speaking. */
export const SPEAKING_LEVEL = 8

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Whether the microphone should be live right now. */
export function micShouldBeOn(s: { muted: boolean; deafened: boolean; pushToTalk: boolean; pttHeld: boolean }): boolean {
  if (s.muted || s.deafened) return false
  if (s.pushToTalk && !s.pttHeld) return false
  return true
}

/** Playback volume (0-100) to apply to every remote voice. */
export function remoteVolume(s: { volume: number; quiet: boolean; deafened: boolean }): number {
  if (s.deafened || s.quiet) return 0
  return clamp(Math.round(s.volume), 0, 100)
}

/** Fills in anything missing or malformed from stored preferences. */
export function sanitizePrefs(raw: unknown): VoicePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: keyof VoicePrefs) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_VOICE_PREFS[k] as boolean))
  return {
    quiet: bool('quiet'),
    volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? clamp(Math.round(r.volume), 0, 100) : DEFAULT_VOICE_PREFS.volume,
    noiseSuppression: bool('noiseSuppression'),
    echoCancellation: bool('echoCancellation'),
    autoGain: bool('autoGain'),
    pushToTalk: bool('pushToTalk'),
  }
}

export interface PresencePayload { agora_uid: number | string; muted: boolean; deafened: boolean; joined_at?: number }
export interface VoicePeer { userId: string; agoraUid: string; muted: boolean; deafened: boolean; joinedAt: number }

/** Most people allowed in one room's voice call. Every person in a call is billed
 *  by the minute, and a community room can hold thousands of members. */
export const MAX_VOICE_PARTICIPANTS = 12

/** Turns a Supabase presence state ({ [userId]: payload[] }) into one peer per user. */
export function peersFromPresence(state: Record<string, unknown[]>): VoicePeer[] {
  const out: VoicePeer[] = []
  for (const [userId, metas] of Object.entries(state || {})) {
    const m = (Array.isArray(metas) ? metas[metas.length - 1] : null) as Partial<PresencePayload> | null
    if (!m || m.agora_uid === undefined || m.agora_uid === null) continue
    out.push({ userId, agoraUid: String(m.agora_uid), muted: !!m.muted, deafened: !!m.deafened, joinedAt: Number(m.joined_at) || 0 })
  }
  return out
}

/** Who is speaking, as user ids, from Agora's volume-indicator readings. */
export function speakingUserIds(
  readings: { uid: number | string; level: number }[],
  peers: VoicePeer[],
): Set<string> {
  const byUid = new Map(peers.map(p => [p.agoraUid, p]))
  const ids = new Set<string>()
  for (const r of readings) {
    if (r.level < SPEAKING_LEVEL) continue
    const p = byUid.get(String(r.uid))
    if (p && !p.muted && !p.deafened) ids.add(p.userId)
  }
  return ids
}

export function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/**
 * Whether this person is past the call's size limit. Everyone applies the same
 * rule to the same presence list - earliest joiners first, user id as the
 * tie-break - so the people who arrived last are the ones who step out.
 */
export function overVoiceCap(myUserId: string, peers: VoicePeer[], max = MAX_VOICE_PARTICIPANTS): boolean {
  const order = [...peers].sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : 1))
  const i = order.findIndex(p => p.userId === myUserId)
  return i >= max
}
