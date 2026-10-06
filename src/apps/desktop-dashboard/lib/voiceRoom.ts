import { useCallback, useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { sb } from '../../_shared/supabaseClient';
import {
  DEFAULT_VOICE_PREFS, micShouldBeOn, remoteVolume, sanitizePrefs, peersFromPresence, speakingUserIds, sameSet, yieldsToOtherSession,
  type PresencePayload,
  type VoicePrefs, type VoicePeer,
} from './voiceRoomLogic';

/* ============================================================
   Voice in study rooms: audio only, over Agora (the same provider
   and the same `agora-token` Edge Function the old groups page
   used - it checks the caller is a member of the group before it
   hands out a token).

   Who is in the call, and whether they are muted or deafened, is
   shared through a Supabase presence channel (`voice:<groupId>`);
   that is also what turns Agora's numeric uids back into people.

   Cost control (same as the old groups page): every minute in a call
   counts toward the monthly Agora allowance, so call time is reported to
   record_feature_usage every minute (without a group id - passing one
   would also credit group_user_daily_seconds, which feeds community
   revenue), and a call is refused once the allowance has flipped to the
   fallback provider. There is no limit on how many people can be in a
   room's call.

   The microphone is only opened while it is actually live: muting
   closes it (so the browser's mic light goes off) and unmuting
   opens it again, and everyone joins muted, so the mic is never
   requested until you choose to talk. Quiet mode silences everyone
   else for you. The pure rules live in voiceRoomLogic.ts.
   ============================================================ */

const PREFS_KEY = 'wynko.voice.prefs.v1';

export type VoiceStatus = 'off' | 'joining' | 'on';

// Quiet mode is deliberately not remembered: a call that opens in silence would look broken.
function loadPrefs(): VoicePrefs {
  try { return { ...sanitizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')), quiet: false }; } catch { return { ...DEFAULT_VOICE_PREFS }; }
}
function savePrefs(p: VoicePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...p, quiet: false })); } catch { /* private mode: just don't remember */ }
}

function friendlyError(e: unknown): string {
  const msg = String((e as { message?: string } | null)?.message || e || '');
  if (/not a group member|403/i.test(msg)) return 'Join the room first to use voice.';
  if (/NotAllowed|Permission|denied/i.test(msg)) return 'Microphone access was blocked. Allow it in your browser or system settings.';
  if (/NotFound|DEVICE_NOT_FOUND/i.test(msg)) return 'No microphone found.';
  if (/Unauthorized|401/i.test(msg)) return 'Sign in again to use voice.';
  return msg || 'Could not start voice.';
}

// A short, soft two-note blip for someone joining/leaving. Skipped in quiet mode.
function chime(up: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [up ? 520 : 440, up ? 660 : 330].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.06, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.14);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.16);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 600);
  } catch { /* chimes are a nicety */ }
}

function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function useVoiceRoom(groupId: string | null, myUserId: string | null) {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(loadPrefs);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  const agoraUidRef = useRef<string>('');
  const peersRef = useRef<VoicePeer[]>([]);
  const speakingRef = useRef<Set<string>>(new Set());
  const mutexRef = useRef<Promise<void>>(Promise.resolve());
  const joinedAtRef = useRef(0);
  const usageSinceRef = useRef(0);
  const usageFirstRef = useRef(true);
  const usageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePrefsRef = useRef(prefs);
  livePrefsRef.current = prefs;
  const stateRef = useRef({ muted, deafened, pttHeld, status });
  stateRef.current = { muted, deafened, pttHeld, status };

  // Run mic open/close work one step at a time so a quick mute-unmute can't open two tracks.
  const serial = useCallback((fn: () => Promise<void>) => {
    mutexRef.current = mutexRef.current.then(fn, fn).catch(() => {});
    return mutexRef.current;
  }, []);

  const applyPlayback = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const vol = remoteVolume({ volume: livePrefsRef.current.volume, quiet: livePrefsRef.current.quiet, deafened: stateRef.current.deafened });
    client.remoteUsers.forEach(u => { try { u.audioTrack?.setVolume(vol); } catch { /* user left mid-call */ } });
  }, []);

  const closeMic = useCallback(async () => {
    const track = micRef.current;
    micRef.current = null;
    if (!track) return;
    try { await clientRef.current?.unpublish(track); } catch { /* not published */ }
    try { track.stop(); track.close(); } catch { /* already closed */ }
  }, []);

  const syncMic = useCallback(() => serial(async () => {
    const client = clientRef.current;
    const { muted: m, deafened: d, pttHeld: held, status: st } = stateRef.current;
    if (!client || st !== 'on') return;
    const want = micShouldBeOn({ muted: m, deafened: d, pushToTalk: livePrefsRef.current.pushToTalk, pttHeld: held });
    if (!want) { await closeMic(); return; }
    if (micRef.current) return;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const p = livePrefsRef.current;
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        // Echo cancellation is always on: without it people hear themselves a moment later.
        encoderConfig: 'speech_standard', ANS: p.noiseSuppression, AEC: true, AGC: p.autoGain,
      });
      // State may have changed while the browser was asking for the mic.
      const now = stateRef.current;
      if (!clientRef.current || now.status !== 'on' || !micShouldBeOn({ muted: now.muted, deafened: now.deafened, pushToTalk: livePrefsRef.current.pushToTalk, pttHeld: now.pttHeld })) {
        track.stop(); track.close(); return;
      }
      micRef.current = track;
      await client.publish(track);
      setNotice(null);
    } catch (e) {
      setMuted(true);
      setError(friendlyError(e));
    }
  }), [serial, closeMic]);

  const trackPresence = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !agoraUidRef.current) return;
    const s = stateRef.current;
    void ch.track({ agora_uid: agoraUidRef.current, muted: s.muted || s.deafened, deafened: s.deafened, joined_at: joinedAtRef.current });
  }, []);

  // Reports the time since the last report to the monthly allowance ledger. Never throws.
  const reportUsage = useCallback(async () => {
    const since = usageSinceRef.current;
    if (!since) return;
    const now = Date.now();
    const seconds = Math.min(120, Math.floor((now - since) / 1000));
    usageSinceRef.current = now;
    if (seconds < 1) return;
    const first = usageFirstRef.current;
    usageFirstRef.current = false;
    try {
      await sb.rpc('record_feature_usage', { p_feature_key: 'group_voice', p_seconds: seconds, p_group_id: null, p_new_session: first });
    } catch { /* usage logging must never break a call */ }
  }, []);

  const teardown = useCallback(async () => {
    if (usageTimerRef.current) { clearInterval(usageTimerRef.current); usageTimerRef.current = null; }
    await reportUsage();      // the last partial minute
    usageSinceRef.current = 0;
    await closeMic();
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      try { client.removeAllListeners(); await client.leave(); } catch { /* already left */ }
    }
    const ch = channelRef.current;
    channelRef.current = null;
    if (ch) { try { await ch.untrack(); } catch { /* ignore */ } try { await sb.removeChannel(ch); } catch { /* ignore */ } }
    agoraUidRef.current = '';
    peersRef.current = [];
    speakingRef.current = new Set();
    setPeers([]);
    setSpeaking(new Set());
  }, [closeMic, reportUsage]);

  const fetchToken = useCallback(async () => {
    const { data, error: err } = await sb.functions.invoke('agora-token', {
      body: { channel_name: `voice-${groupId}`, group_id: groupId },
    });
    if (err || !data?.token) {
      let detail = err?.message || 'Could not get a voice token.';
      try { const body = await (err as { context?: Response } | null)?.context?.json?.(); if (body?.error) detail = String(body.error); } catch { /* keep message */ }
      throw new Error(detail);
    }
    return data as { token: string; app_id: string };
  }, [groupId]);

  const join = useCallback(async () => {
    if (!groupId || !myUserId || stateRef.current.status !== 'off') return;
    setError(null); setNotice(null); setStatus('joining');
    stateRef.current = { ...stateRef.current, status: 'joining' };
    try {
      // Past the monthly allowance the app is meant to use the fallback provider; this build only
      // speaks Agora, so say so instead of running up charges.
      const { data: provider } = await sb.rpc('get_active_rtc_provider');
      if (typeof provider === 'string' && provider !== 'agora') {
        throw new Error('Voice is paused for now: this month\u2019s free voice minutes are used up. It comes back next month.');
      }
      const { token, app_id } = await fetchToken();
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(user, 'audio');
          user.audioTrack?.setVolume(remoteVolume({ volume: livePrefsRef.current.volume, quiet: livePrefsRef.current.quiet, deafened: stateRef.current.deafened }));
          user.audioTrack?.play();
        } catch { /* they left before we could subscribe */ }
      });
      client.on('volume-indicator', (vols) => {
        const next = speakingUserIds(vols.map(v => ({ uid: v.uid, level: v.level })), peersRef.current);
        if (!sameSet(next, speakingRef.current)) { speakingRef.current = next; setSpeaking(next); }
      });
      client.on('token-privilege-will-expire', async () => {
        try { const t = await fetchToken(); await client.renewToken(t.token); } catch { /* the call ends when the token does */ }
      });
      client.on('connection-state-change', (cur) => {
        if (cur === 'DISCONNECTED' && stateRef.current.status === 'on') { void leave(); }
      });

      const uid = await client.join(app_id, `voice-${groupId}`, token, null);
      agoraUidRef.current = String(uid);
      joinedAtRef.current = Date.now();
      client.enableAudioVolumeIndicator();

      // Presence: who is here and who is muted (also maps Agora uids to people).
      const ch = sb.channel(`voice:${groupId}`, { config: { presence: { key: myUserId } } });
      channelRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => {
        const list = peersFromPresence(ch.presenceState() as Record<string, unknown[]>);
        peersRef.current = list;
        setPeers(list);
        // The same account in this call from another tab or device would hear itself back
        // as an echo: the later session steps out.
        const mine = (ch.presenceState() as Record<string, PresencePayload[]>)[myUserId] ?? [];
        if (stateRef.current.status === 'on' && yieldsToOtherSession(agoraUidRef.current, mine)) {
          setError('You are already in this call on another tab or device, so this one was closed to avoid an echo.');
          void leave();
        }
      });
      ch.on('presence', { event: 'join' }, ({ key }) => { if (key !== myUserId && !livePrefsRef.current.quiet) chime(true); });
      ch.on('presence', { event: 'leave' }, ({ key }) => { if (key !== myUserId && !livePrefsRef.current.quiet) chime(false); });
      await new Promise<void>((resolve) => {
        ch.subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(); });
      });

      // Everyone joins muted, so the browser never asks for the microphone
      // until you choose to talk - and quiet mode never asks at all.
      setMuted(true);
      stateRef.current = { muted: true, deafened: false, pttHeld: false, status: 'on' };
      setDeafened(false); setPttHeld(false);
      setStatus('on');
      trackPresence();
      applyPlayback();
      setNotice('You joined muted. Tap the mic to talk.');
      usageSinceRef.current = Date.now();
      usageFirstRef.current = true;
      usageTimerRef.current = setInterval(() => { void reportUsage(); }, 60_000);
    } catch (e) {
      await teardown();
      stateRef.current = { ...stateRef.current, status: 'off' };
      setStatus('off');
      setError(friendlyError(e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, myUserId, fetchToken, teardown, trackPresence, applyPlayback, reportUsage]);

  const leave = useCallback(async () => {
    stateRef.current = { ...stateRef.current, status: 'off' };
    setStatus('off'); setNotice(null);
    await teardown();
  }, [teardown]);

  const toggleMute = useCallback(() => { setMuted(m => !m); setNotice(null); }, []);
  const toggleDeafen = useCallback(() => setDeafened(d => !d), []);

  const updatePrefs = useCallback((patch: Partial<VoicePrefs>) => {
    setPrefs(prev => { const next = sanitizePrefs({ ...prev, ...patch }); savePrefs(next); return next; });
  }, []);

  /** Quiet mode: hear nobody, and no join/leave chimes. Your mic is left as it is. */
  const setQuiet = useCallback((on: boolean) => { updatePrefs({ quiet: on }); }, [updatePrefs]);

  // The mic follows mute / deafen / push-to-talk.
  useEffect(() => {
    if (status !== 'on') return;
    void syncMic();
  }, [status, muted, deafened, pttHeld, prefs.pushToTalk, syncMic]);

  // Everyone else sees your mute / deafen state (not on every volume-slider tick or key press).
  useEffect(() => {
    if (status !== 'on') return;
    trackPresence();
  }, [status, muted, deafened, trackPresence]);

  // Playback level follows volume, quiet mode and deafen.
  useEffect(() => {
    if (status !== 'on') return;
    applyPlayback();
  }, [status, deafened, prefs.volume, prefs.quiet, applyPlayback]);

  // Changing noise suppression / gain rebuilds a live mic.
  useEffect(() => {
    if (status !== 'on' || !micRef.current) return;
    void serial(closeMic).then(() => syncMic());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.noiseSuppression, prefs.autoGain]);

  // Push-to-talk: hold Space (never while typing in a field).
  useEffect(() => {
    if (status !== 'on' || !prefs.pushToTalk) { setPttHeld(false); return; }
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && !typingInField()) { e.preventDefault(); setPttHeld(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setPttHeld(false); };
    const blur = () => setPttHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [status, prefs.pushToTalk]);

  // Leaving the room (or closing the page) leaves the call.
  useEffect(() => () => { void teardown(); }, [teardown]);
  useEffect(() => {
    const onUnload = () => { void teardown(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [teardown]);

  const micLive = status === 'on' && micShouldBeOn({ muted, deafened, pushToTalk: prefs.pushToTalk, pttHeld });

  return {
    status, error, notice, muted, deafened, micLive, pttHeld, prefs, peers, speaking,
    join, leave, toggleMute, toggleDeafen, setQuiet, updatePrefs,
    clearError: () => setError(null),
  };
}

export type VoiceRoom = ReturnType<typeof useVoiceRoom>;

export type NudgeResult = 'sent' | 'cooldown' | 'unavailable' | 'error';

/** Sends "asked you to talk" to another member (see migration 0106). */
export async function nudgeToTalk(groupId: string, userId: string): Promise<NudgeResult> {
  const { data, error } = await sb.rpc('rpc_nudge_to_talk', { p_group_id: groupId, p_user_id: userId });
  if (error) {
    // PGRST202 / "could not find the function": the migration isn't applied yet.
    if (/PGRST202|could not find the function|does not exist/i.test(`${error.code || ''} ${error.message || ''}`)) return 'unavailable';
    return 'error';
  }
  return data === 'cooldown' ? 'cooldown' : 'sent';
}
