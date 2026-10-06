import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VOICE_PREFS, micShouldBeOn, remoteVolume, sanitizePrefs,
  peersFromPresence, speakingUserIds, sameSet, overVoiceCap, MAX_VOICE_PARTICIPANTS,
} from './voiceRoomLogic'

describe('micShouldBeOn', () => {
  const base = { muted: false, deafened: false, pushToTalk: false, pttHeld: false }
  it('is live when nothing mutes it', () => expect(micShouldBeOn(base)).toBe(true))
  it('is off when muted', () => expect(micShouldBeOn({ ...base, muted: true })).toBe(false))
  it('is off when deafened, like most voice apps', () => expect(micShouldBeOn({ ...base, deafened: true })).toBe(false))
  it('needs the key held in push-to-talk', () => {
    expect(micShouldBeOn({ ...base, pushToTalk: true })).toBe(false)
    expect(micShouldBeOn({ ...base, pushToTalk: true, pttHeld: true })).toBe(true)
  })
  it('stays off while muted even if the key is held', () => {
    expect(micShouldBeOn({ ...base, muted: true, pushToTalk: true, pttHeld: true })).toBe(false)
  })
})

describe('remoteVolume', () => {
  it('passes the slider through normally', () => expect(remoteVolume({ volume: 80, quiet: false, deafened: false })).toBe(80))
  it('hears nobody in quiet mode, whatever the slider says', () => {
    expect(remoteVolume({ volume: 100, quiet: true, deafened: false })).toBe(0)
  })
  it('is silent when deafened, whatever the slider says', () => {
    expect(remoteVolume({ volume: 100, quiet: false, deafened: true })).toBe(0)
  })
  it('clamps a bad slider value', () => {
    expect(remoteVolume({ volume: 250, quiet: false, deafened: false })).toBe(100)
    expect(remoteVolume({ volume: -5, quiet: false, deafened: false })).toBe(0)
  })
})

describe('sanitizePrefs', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_VOICE_PREFS)
    expect(sanitizePrefs('x')).toEqual(DEFAULT_VOICE_PREFS)
    expect(sanitizePrefs({ volume: 'loud', quiet: 'yes' })).toEqual(DEFAULT_VOICE_PREFS)
  })
  it('keeps valid stored values and clamps the volume', () => {
    expect(sanitizePrefs({ quiet: true, volume: 40, pushToTalk: true, noiseSuppression: false }))
      .toEqual({ ...DEFAULT_VOICE_PREFS, quiet: true, volume: 40, pushToTalk: true, noiseSuppression: false })
    expect(sanitizePrefs({ volume: 900 }).volume).toBe(100)
  })
})

describe('presence and speaking', () => {
  const state = {
    u1: [{ agora_uid: 111, muted: false, deafened: false }],
    u2: [{ agora_uid: 222, muted: true, deafened: false }],
    u3: [{ agora_uid: 333, muted: false, deafened: true }],
    u4: [{ muted: false }],
  }
  it('builds one peer per user and skips entries without an Agora uid', () => {
    const peers = peersFromPresence(state as never)
    expect(peers.map(p => p.userId).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(peers.find(p => p.userId === 'u2')?.muted).toBe(true)
  })
  it('uses the latest presence entry when a user has several', () => {
    const peers = peersFromPresence({ u1: [{ agora_uid: 1, muted: true, deafened: false }, { agora_uid: 2, muted: false, deafened: false }] } as never)
    expect(peers[0].agoraUid).toBe('2')
  })
  it('marks only loud, unmuted, undeafened peers as speaking', () => {
    const peers = peersFromPresence(state as never)
    const s = speakingUserIds([
      { uid: 111, level: 50 }, { uid: 222, level: 90 }, { uid: 333, level: 90 }, { uid: 999, level: 90 },
    ], peers)
    expect([...s]).toEqual(['u1'])
  })
  it('ignores quiet background noise', () => {
    expect(speakingUserIds([{ uid: 111, level: 3 }], peersFromPresence(state as never)).size).toBe(0)
  })
  it('compares sets', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameSet(new Set(['a']), new Set(['b']))).toBe(false)
  })
})

describe('overVoiceCap', () => {
  const peer = (userId: string, joinedAt: number) => ({ userId, agoraUid: userId, muted: false, deafened: false, joinedAt })
  const many = (n: number) => Array.from({ length: n }, (_, i) => peer(`u${String(i).padStart(2, '0')}`, 1000 + i))

  it('lets everyone in up to the limit', () => {
    const peers = many(MAX_VOICE_PARTICIPANTS)
    expect(peers.some(p => overVoiceCap(p.userId, peers))).toBe(false)
  })
  it('asks the latest arrival to step out once the call is over the limit', () => {
    const peers = many(MAX_VOICE_PARTICIPANTS + 1)
    expect(overVoiceCap(peers[MAX_VOICE_PARTICIPANTS].userId, peers)).toBe(true)
    expect(overVoiceCap(peers[0].userId, peers)).toBe(false)
    expect(peers.filter(p => overVoiceCap(p.userId, peers)).length).toBe(1)
  })
  it('breaks ties on the same instant the same way for everyone', () => {
    const peers = [peer('b', 5), peer('a', 5), peer('c', 5)]
    expect(overVoiceCap('c', peers, 2)).toBe(true)
    expect(overVoiceCap('a', peers, 2)).toBe(false)
    expect(overVoiceCap('b', peers, 2)).toBe(false)
  })
  it('does nothing for someone not in the list yet', () => {
    expect(overVoiceCap('nobody', many(20))).toBe(false)
  })
  it('reads joined_at from presence', () => {
    const peers = peersFromPresence({ u1: [{ agora_uid: 1, muted: false, deafened: false, joined_at: 1234 }] } as never)
    expect(peers[0].joinedAt).toBe(1234)
  })
})
