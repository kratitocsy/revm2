import { useEffect, useRef, useState } from 'react';

export type Lang = 'hi' | 'en';
export type Expression = 'idle' | 'wink' | 'talk' | 'curious' | 'happy' | 'wave';

/**
 * A line Wynky says: `text` is shown in the bubble, `say` is what the voice
 * speaks, and `id` names the recorded audio file (see speak() below) —
 * `/audio/wynky/{lang}/{id}.mp3`.
 */
export type Line = Record<Lang, { text: string; say: string }> & { id: string };

export const line = (id: string, en: string, hi: string, hiSay?: string): Line => ({
  id,
  en: { text: en, say: en },
  hi: { text: hi, say: hiSay ?? hi },
});

// [start, end] seconds into wynky-dance.mp4 for each looping expression.
const WYNKY_CLIPS: Record<Expression, [number, number]> = {
  idle: [1.5, 3.0],
  wink: [0.2, 1.3],
  talk: [3.0, 4.6],
  curious: [6.2, 7.4],
  happy: [8.1, 8.9],
  wave: [8.9, 10.0],
};

export function WynkyStage({ src, expression, speaking }: { src: string; expression: Expression; speaking: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [start, end] = WYNKY_CLIPS[speaking ? 'talk' : expression];

  useEffect(() => {
    const v = ref.current;
    if (!v || !ready) return;
    v.currentTime = start;
    v.play().catch(() => {});
    let raf = 0;
    const loop = () => {
      if (v.currentTime >= end - 0.05 || v.currentTime < start - 0.3) v.currentTime = start;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [start, end, ready]);

  const label = speaking ? 'TALKING' : expression.toUpperCase();

  return (
    <div className="wq-stage-size" style={{ position: 'relative', width: 'var(--wq-stage)', height: 'var(--wq-stage)', flexShrink: 0 }}>
      <div
        style={{
          position: 'absolute', inset: -28, borderRadius: 999, filter: 'blur(6px)',
          background: 'radial-gradient(circle, rgba(124,77,255,0.35) 0%, rgba(41,98,255,0.12) 45%, transparent 70%)',
          animation: speaking ? 'wkGlow 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 999,
          border: '2px solid rgba(148,197,255,0.55)', background: '#A9CCE8',
          boxShadow: '0 0 40px rgba(124,77,255,0.45), 0 0 90px rgba(41,98,255,0.25), inset 0 0 40px rgba(124,77,255,0.15)',
        }}
      >
        <video
          ref={ref}
          src={src}
          muted
          playsInline
          autoPlay
          preload="auto"
          aria-hidden="true"
          onLoadedMetadata={() => setReady(true)}
          style={{ position: 'absolute', left: '50%', top: '50%', height: '118%', transform: 'translate(-50%,-47%)' }}
        />
      </div>
      <div
        style={{
          position: 'absolute', left: '50%', bottom: -14, transform: 'translateX(-50%)', padding: '4px 12px',
          borderRadius: 999, background: '#0B1530', border: '1px solid rgba(124,77,255,0.45)',
          boxShadow: '0 0 14px rgba(124,77,255,0.35)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          letterSpacing: '0.2em', color: '#C4AAFF', whiteSpace: 'nowrap',
        }}
      >
        WYNKY · {label}
      </div>
    </div>
  );
}

export function SpeechBubble({ text, lang }: { text: string; lang: Lang }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => {
      setN((x) => {
        if (x >= text.length) {
          clearInterval(id);
          return x;
        }
        return x + 1;
      });
    }, 28);
    return () => clearInterval(id);
  }, [text]);

  return (
    <div
      aria-live="polite"
      style={{
        position: 'relative', maxWidth: 420, width: '100%', boxSizing: 'border-box', padding: '16px 20px', borderRadius: 20,
        background: 'linear-gradient(160deg,#131A45 0%,#0B1530 100%)', border: '1px solid rgba(124,77,255,0.45)',
        boxShadow: '0 0 30px rgba(124,77,255,0.25)',
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: '#A78BFA', marginBottom: 6 }}>
        WYNKY · {lang === 'hi' ? 'HINGLISH' : 'ENGLISH'}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: '#EEF2FF', minHeight: 46 }}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {text.slice(0, n)}
          <span style={{ opacity: n < text.length ? 1 : 0, color: '#A78BFA' }}>▍</span>
        </span>
      </div>
      <div
        style={{
          position: 'absolute', left: '50%', bottom: -9, width: 16, height: 16, transform: 'translateX(-50%) rotate(45deg)',
          background: '#0B1530', borderRight: '1px solid rgba(124,77,255,0.45)', borderBottom: '1px solid rgba(124,77,255,0.45)',
        }}
      />
    </div>
  );
}

// ── Voice ──────────────────────────────────────────────────────────────
// Two voice paths: recorded voice-over files (production, per the design
// handoff: /audio/wynky/{lang}/{lineId}.mp3) and Web Speech (fallback, and
// the only path currently in use since no recordings exist yet). speak()
// always tries the recorded file first and falls back to Web Speech
// transparently on a 404/load error — so dropping real audio files into
// public/audio/wynky/{lang}/ later switches the voice over with zero code
// changes, exactly as the handoff's "Voice + sound" section asks for.

const AUDIO_BASE = '/audio/wynky';
// URLs that already failed to load this session: skip straight to Web
// Speech for them instead of re-issuing a network request (and a console
// error) every time the same line repeats.
const missingAudio = new Set<string>();

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const wanted = lang === 'hi' ? ['hi-in', 'hi'] : ['en-in', 'en-gb', 'en-us', 'en'];
  for (const w of wanted) {
    const matches = voices.filter((v) => v.lang?.toLowerCase().startsWith(w));
    const preferred = matches.find((v) => /female|google|swara|heera|kalpana|lekha|veena|samantha|zira/i.test(v.name));
    if (preferred) return preferred;
    if (matches[0]) return matches[0];
  }
  return null;
}

/**
 * Web Speech fallback. Calls onEnd exactly once; Chrome sometimes never
 * fires `onend` for long utterances, so a length-based timeout backs it up.
 * Returns a cancel function that suppresses onEnd.
 */
function speakSynth(text: string, lang: Lang, onStart: () => void, onEnd: () => void): () => void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd();
  };
  const synth = window.speechSynthesis;
  if (!synth) {
    onStart();
    const t = setTimeout(finish, Math.min(4000, 60 * text.length));
    return () => { done = true; clearTimeout(t); };
  }

  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.lang = v ? v.lang : lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.pitch = 1.7;
  u.rate = lang === 'hi' ? 1.02 : 1.06;
  u.onstart = onStart;
  u.onend = finish;
  u.onerror = finish;
  const safety = setTimeout(finish, Math.max(6000, 110 * text.length));
  synth.speak(u);
  return () => {
    done = true;
    clearTimeout(safety);
    synth.cancel();
  };
}

/**
 * Speaks a line: tries the recorded voice-over file at
 * `/audio/wynky/{lang}/{lineId}.mp3` first, falling back to Web Speech if
 * it 404s, fails to decode, or doesn't start within a beat. Muted skips
 * both and just times the (silent) reveal off text length, so the UI still
 * advances in sync with the speech bubble.
 *
 * Calls onStart/onEnd exactly once. Returns a cancel function.
 */
export function speak(lineId: string, text: string, lang: Lang, muted: boolean, onStart: () => void, onEnd: () => void): () => void {
  if (muted) {
    onStart();
    const t = setTimeout(onEnd, Math.min(4000, 60 * text.length));
    return () => clearTimeout(t);
  }

  const src = `${AUDIO_BASE}/${lang}/${lineId}.mp3`;
  if (missingAudio.has(src)) return speakSynth(text, lang, onStart, onEnd);

  let settled = false;
  let cancelSynth: (() => void) | null = null;
  const audio = new Audio(src);
  audio.preload = 'auto';

  const fallback = () => {
    if (settled) return;
    settled = true;
    missingAudio.add(src);
    cancelSynth = speakSynth(text, lang, onStart, onEnd);
  };
  const started = () => {
    if (settled) return;
    settled = true;
    onStart();
  };
  const ended = () => {
    if (settled && !cancelSynth) onEnd();
  };

  audio.addEventListener('error', fallback);
  audio.addEventListener('playing', started);
  audio.addEventListener('ended', ended);
  // A same-origin static file either 404s almost immediately or plays; if
  // neither happened within a beat (slow network, unexpected MIME error),
  // don't leave Wynky stuck mid-question — fall back and move on.
  const guard = setTimeout(fallback, 1200);
  audio.play().catch(fallback);

  return () => {
    settled = true;
    clearTimeout(guard);
    audio.pause();
    audio.removeEventListener('error', fallback);
    audio.removeEventListener('playing', started);
    audio.removeEventListener('ended', ended);
    cancelSynth?.();
  };
}

// ── SFX (WebAudio, no files) ───────────────────────────────────────────
type Sfx = 'pop' | 'coin' | 'whoosh' | 'tada';
const SFX_FREQ: Record<Sfx, [number, number]> = { pop: [660, 990], coin: [988, 1319], whoosh: [300, 180], tada: [523, 784] };
let audioCtx: AudioContext | null = null;

export function sfx(kind: Sfx, muted: boolean) {
  if (muted) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.connect(g);
    g.connect(audioCtx.destination);
    const [from, to] = SFX_FREQ[kind];
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tada' ? 0.45 : 0.2));
    o.start(t);
    o.stop(t + 0.5);
  } catch {
    // Audio is decorative; ignore browsers that refuse an AudioContext.
  }
}
