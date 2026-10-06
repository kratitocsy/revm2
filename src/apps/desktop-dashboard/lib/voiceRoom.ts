import { useCallback, useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { sb } from '../../_shared/supabaseClient';
import {
  DEFAULT_VOICE_PREFS, micShouldBeOn, remoteVolume, sanitizePrefs, peersFromPresence, speakingUserIds, sameSet,
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

   The microphone is only opened while it is actually live: muting
   closes it (so the browser's mic light goes off) and unmuting
   opens it again. Joining in quiet mode never asks for the mic at
   all. The pure rules live in voiceRoomLogic.ts.
   ============================================================ */

const PREFS_KEY = 'wynko.voice.prefs.v1';

export type VoiceStatus = 'off' | 'joining' | 'on';

function loadPrefs(): VoicePrefs {
  try { return sanitizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')); } catch { return { ...DEFAULT_VOICE_PREFS }; }
}
function savePrefs(p: VoicePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode: just don't remember */ }
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
        encoderConfig: 'speech_standard', ANS: p.noiseSuppression, AEC: p.echoCancellation, AGC: p.autoGain,
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
    void ch.track({ agora_uid: agoraUidRef.current, muted: s.muted || s.deafened, deafened: s.deafened });
  }, []);

  const teardown = useCallback(async () => {
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
  }, [closeMic]);

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
      client.enableAudioVolumeIndicator();

      // Presence: who is here and who is muted (also maps Agora uids to people).
      const ch = sb.channel(`voice:${groupId}`, { config: { presence: { key: myUserId } } });
      channelRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => {
        const list = peersFromPresence(ch.presenceState() as Record<string, unknown[]>);
        peersRef.current = list;
        setPeers(list);
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
      if (!livePrefsRef.current.quiet) setNotice('You joined muted. Tap the mic to talk.');
    } catch (e) {
      await teardown();
      stateRef.current = { ...stateRef.current, status: 'off' };
      setStatus('off');
      setError(friendlyError(e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, myUserId, fetchToken, teardown, trackPresence, applyPlayback]);

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

  /** Quiet mode: mute the mic, play others quieter, and stop the join/leave chimes. */
  const setQuiet = useCallback((on: boolean) => {
    updatePrefs({ quiet: on });
    if (on) setMuted(true);
  }, [updatePrefs]);

  // Mic follows mute / deafen / push-to-talk; presence and playback follow the same state.
  useEffect(() => {
    if (status !== 'on') return;
    void syncMic();
    trackPresence();
    applyPlayback();
  }, [status, muted, deafened, pttHeld, prefs.pushToTalk, prefs.volume, prefs.quiet, syncMic, trackPresence, applyPlayback]);

  // Changing noise suppression / echo cancellation / gain rebuilds a live mic.
  useEffect(() => {
    if (status !== 'on' || !micRef.current) return;
    void serial(closeMic).then(() => syncMic());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.noiseSuppression, prefs.echoCancellation, prefs.autoGain]);

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
