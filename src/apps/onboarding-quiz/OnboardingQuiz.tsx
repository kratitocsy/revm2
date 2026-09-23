import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { sb } from '../_shared/supabaseClient';
import {
  CUSTOM_ANSWER_MAX_LENGTH,
  CUSTOM_VALUE,
  getNextQuestion,
  q3AutoDefault,
  validateCustomAnswer,
  type QuizAnswers,
  type QuizQuestion,
  type StudentType,
} from '../_shared/quizEngine';
import { completeQuiz, type CompleteQuizResult, type QuizSupabaseClient } from '../_shared/quizPersistence';
import { SpeechBubble, WynkyStage, sfx, speak, type Expression, type Lang, type Line } from './wynky';
import { INTRO, QUESTION_COPY, REACTIONS, SAVE_FAILED, SAVING, resultLine } from './quizCopy';
import wynkyVideo from './imports/wynky-dance.mp4';
import wynkoLogo from '../desktop-dashboard/imports/wynko-logo.png';

type Phase = 'start' | 'intro' | 'q' | 'saving' | 'result' | 'error';

const LANG_KEY = 'wynko_quiz_lang_v1';
const MUTED_KEY = 'wynko_quiz_muted_v1';
const MONO = "'JetBrains Mono', monospace";

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the preference just won't persist.
  }
}

function applyAnswer(answers: QuizAnswers, q: QuizQuestion, pick: string[], customText: string): QuizAnswers {
  const next: Record<string, unknown> = { ...answers };
  if (q.field === 'block_social_anyway') {
    next.block_social_anyway = pick[0] === CUSTOM_VALUE ? CUSTOM_VALUE : pick[0] === 'true';
  } else {
    next[q.field] = q.multiSelect ? pick : pick[0];
  }
  if (pick.includes(CUSTOM_VALUE)) next[q.customField] = customText.trim();
  else delete next[q.customField];
  if (q.field === 'student_type') {
    // Q3 is never shown to droppers/appeared; store its default so the generator has it.
    const auto = q3AutoDefault(pick[0] as StudentType);
    if (auto) next.fixed_commitment_type = auto;
  }
  return next as QuizAnswers;
}

function totalQuestions(a: QuizAnswers): number {
  let n = 7;
  if (q3AutoDefault(a.student_type)) n -= 1;
  if (a.distractions?.length === 1 && a.distractions[0] === 'nothing') n += 1;
  return n;
}

function MountainBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 65% 45% at 50% 28%, rgba(56,189,248,0.05), rgba(56,189,248,0) 70%)' }} />
      <svg viewBox="0 0 1200 520" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full" style={{ height: '58%' }}>
        <polygon opacity="0.55" fill="#0E1B36"
          points="0,330 90,260 190,300 300,225 400,280 500,205 600,270 700,215 800,275 900,220 1000,285 1100,235 1200,290 1200,520 0,520" />
        <polygon opacity="0.78" fill="#0A1428"
          points="0,390 110,320 230,365 340,290 460,350 580,275 700,345 820,290 940,355 1060,300 1200,350 1200,520 0,520" />
        <polygon opacity="0.96" fill="#050C1A"
          points="0,450 140,385 270,425 410,355 540,420 660,360 800,425 930,365 1060,420 1200,395 1200,520 0,520" />
      </svg>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#F59E0B" stroke="#FBBF24" strokeWidth="1" />
      <circle cx="8" cy="8" r="4.5" fill="none" stroke="#FDE68A" strokeWidth="1" opacity="0.8" />
      <text x="8" y="10.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#78350F" fontFamily="Poppins, sans-serif">W</text>
    </svg>
  );
}

function OptionChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', padding: '14px 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
        fontSize: 14, fontWeight: 500, transition: 'all 150ms', transform: on ? 'scale(1.01)' : 'none',
        background: on ? 'linear-gradient(135deg, rgba(124,77,255,0.28), rgba(41,98,255,0.16))' : 'rgba(14,21,40,0.55)',
        color: on ? '#fff' : '#CBD5E1',
        border: `1px solid ${on ? '#6B44EE' : hover ? 'rgba(56,132,255,0.35)' : 'rgba(26,40,69,0.6)'}`,
        boxShadow: on ? '0 0 22px rgba(124,77,255,0.35)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: '#A78BFA' };

const panel: CSSProperties = {
  maxWidth: 440, padding: 28, borderRadius: 20, background: 'linear-gradient(160deg, #0F1240 0%, #0A0E28 100%)',
  border: '1px solid rgba(124,77,255,0.4)', boxShadow: '0 0 60px rgba(124,77,255,0.2)',
};

function PrimaryButton({ children, onClick, disabled, background, color = '#fff', glow, style }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; background: string; color?: string; glow: string; style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 48, borderRadius: 16, border: 0, cursor: disabled ? 'default' : 'pointer', color, fontWeight: 600,
        fontSize: 15, fontFamily: 'Poppins, sans-serif', background, boxShadow: glow, opacity: disabled ? 0.4 : 1,
        transition: 'opacity 150ms', ...style,
      }}
    >
      {children}
    </button>
  );
}

interface SpeechEntry {
  line: Line;
  after?: () => void;
  cancel: () => void;
}

export default function OnboardingQuiz() {
  const [lang, setLang] = useState<Lang>(() => (readPref(LANG_KEY) === 'en' ? 'en' : 'hi'));
  const [muted, setMuted] = useState(() => readPref(MUTED_KEY) === '1');
  const [phase, setPhase] = useState<Phase>('start');
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [answered, setAnswered] = useState(0);
  const [reacting, setReacting] = useState(false);
  const [bubble, setBubble] = useState<Line>(INTRO);
  const [expr, setExpr] = useState<Expression>('wave');
  const [speaking, setSpeaking] = useState(false);
  const [coins, setCoins] = useState(0);
  const [coinPop, setCoinPop] = useState<number | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [result, setResult] = useState<CompleteQuizResult | null>(null);
  const [error, setError] = useState<{ message: string; signedOut: boolean } | null>(null);

  const langRef = useRef(lang);
  const mutedRef = useRef(muted);
  const speech = useRef<SpeechEntry | null>(null);

  // `after` runs once, when the line finishes. Re-speaking the same line
  // (language switch, mute) carries over an `after` that hasn't run yet.
  const say = useCallback((ln: Line, after?: () => void) => {
    speech.current?.cancel();
    const entry: SpeechEntry = { line: ln, after, cancel: () => {} };
    speech.current = entry;
    const l = langRef.current;
    entry.cancel = speak(ln[l].say, l, mutedRef.current, () => setSpeaking(true), () => {
      setSpeaking(false);
      const cb = entry.after;
      entry.after = undefined;
      cb?.();
    });
  }, []);

  const resay = useCallback(() => {
    const cur = speech.current;
    if (cur) say(cur.line, cur.after);
  }, [say]);

  useEffect(() => () => speech.current?.cancel(), []);

  useEffect(() => {
    let live = true;
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await sb.from('user_profiles').select('quiz_completed_at').eq('id', session.user.id).maybeSingle();
      if (live && data?.quiz_completed_at) setAlreadyCompleted(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const changeLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    langRef.current = l;
    writePref(LANG_KEY, l);
    if (phase !== 'start') resay();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    writePref(MUTED_KEY, m ? '1' : '0');
    if (m && speech.current && (speaking || speech.current.after)) resay();
  };

  const fail = (message: string, signedOut: boolean) => {
    setError({ message, signedOut });
    setPhase('error');
    setExpr('idle');
    setBubble(SAVE_FAILED);
    say(SAVE_FAILED);
  };

  const finish = async (a: QuizAnswers) => {
    setPhase('saving');
    setQuestion(null);
    setExpr('curious');
    setBubble(SAVING);
    say(SAVING);

    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      fail('Your sign-in expired. Log in again to save your result.', true);
      return;
    }
    let r: CompleteQuizResult;
    try {
      r = await completeQuiz(sb as unknown as QuizSupabaseClient, a);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Something went wrong.', false);
      return;
    }
    setResult(r);
    if (r.coinsAwarded > 0) setCoins(r.coinsAwarded);
    setPhase('result');
    setExpr('wave');
    sfx('tada', mutedRef.current);
    const ln = resultLine(r.archetype);
    setBubble(ln);
    say(ln, () => setExpr('happy'));
  };

  const showQuestion = (a: QuizAnswers) => {
    const q = getNextQuestion(a);
    if (!q) {
      void finish(a);
      return;
    }
    const copy = QUESTION_COPY[q.id];
    setQuestion(q);
    setPick([]);
    setCustomText('');
    setReacting(false);
    setExpr(copy.expr);
    setBubble(copy.ask);
    say(copy.ask);
  };

  const begin = () => {
    sfx('whoosh', mutedRef.current);
    setPhase('intro');
    setExpr('wave');
    setBubble(INTRO);
    say(INTRO, () => setExpr('happy'));
  };

  const play = () => {
    sfx('pop', mutedRef.current);
    setPhase('q');
    showQuestion(answers);
  };

  const customPicked = pick.includes(CUSTOM_VALUE);
  const canSubmit = !!question && !reacting && pick.length > 0 && (!customPicked || validateCustomAnswer(customText).valid);

  const submit = () => {
    if (!question || !canSubmit) return;
    const a = applyAnswer(answers, question, pick, customText);
    setAnswers(a);
    setAnswered((n) => n + 1);
    setReacting(true);
    sfx('coin', mutedRef.current);
    if (!alreadyCompleted) {
      setCoins((c) => c + 5);
      setCoinPop(Date.now());
    }
    const r = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    setExpr(r.expr);
    setBubble(r.line);
    say(r.line, () => showQuestion(a));
  };

  const toggle = (v: string) => {
    if (!question || reacting) return;
    sfx('pop', mutedRef.current);
    const wasOn = pick.includes(v);
    if (!question.multiSelect) setPick([v]);
    else if (v === 'nothing') setPick(wasOn ? [] : ['nothing']);
    else setPick(wasOn ? pick.filter((x) => x !== v) : [...pick.filter((x) => x !== 'nothing'), v]);
    if (!speaking) setExpr(wasOn ? QUESTION_COPY[question.id].expr : 'wink');
  };

  const hi = lang === 'hi';
  const total = totalQuestions(answers);
  const progress = phase === 'q' ? Math.min(answered / total, 1) : 1;
  const segBtn = (on: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
        background: on ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'transparent', color: on ? '#fff' : '#8B9AC7', border: 0,
        boxShadow: on ? '0 0 14px rgba(124,77,255,0.45)' : 'none',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'relative', minHeight: '100%', overflowX: 'hidden', background: '#020615', display: 'flex', flexDirection: 'column' }}>
      <MountainBackdrop />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: -120, top: -120, width: 520, height: 520, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(124,77,255,0.16) 0%, transparent 70%)',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="wq-header" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 32px' }}>
          <img
            src={wynkoLogo}
            alt="Wynko"
            style={{ width: 32, height: 32, objectFit: 'contain', mixBlendMode: 'screen', filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.8)) brightness(1.1)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="wq-header-eyebrow" style={{ fontSize: 10, letterSpacing: '0.18em', color: '#68728A' }}>ONBOARDING · STUDY IDENTITY QUIZ</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F3F4F6' }}>Play with Wynky</div>
          </div>
          <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#0B1530', border: '1px solid #1A2845' }}>
            {segBtn(hi, 'Hinglish', () => changeLang('hi'))}
            {segBtn(!hi, 'English', () => changeLang('en'))}
          </div>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute Wynky' : 'Mute Wynky'}
            title={muted ? 'Unmute' : 'Mute'}
            style={{ width: 38, height: 38, borderRadius: 999, background: '#0B1530', border: '1px solid #1A2845', color: muted ? '#4E5E84' : '#C4AAFF', cursor: 'pointer', fontSize: 16 }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div
            aria-label={`${coins} Wynkoins`}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24',
              fontFamily: MONO, fontSize: 13, fontWeight: 600,
            }}
          >
            <CoinIcon />
            {coins}
            {coinPop && (
              <span key={coinPop} aria-hidden="true" style={{ position: 'absolute', right: 6, top: -4, fontSize: 11, animation: 'wkCoin 900ms ease-out forwards' }}>
                +5
              </span>
            )}
          </div>
        </header>

        {phase !== 'start' && phase !== 'intro' && (
          <div className="wq-progress" style={{ padding: '0 32px' }}>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              style={{ height: 4, borderRadius: 99, background: '#1A2845', overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg,#7C4DFF,#2979FF,#22D3EE)', transition: 'width 500ms' }} />
            </div>
          </div>
        )}

        <main className="wq-main">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            {phase !== 'start' && <SpeechBubble text={bubble[lang].text} lang={lang} />}
            <WynkyStage src={wynkyVideo} expression={expr} speaking={speaking} />
          </div>

          <div>
            {phase === 'start' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
                <div style={{ ...eyebrow, letterSpacing: '0.22em' }}>FINAL STEP · ABOUT YOU</div>
                <h1 className="wq-h1" style={{ margin: 0, fontSize: 40, fontWeight: 700, lineHeight: 1.15, color: '#fff' }}>
                  Meet{' '}
                  <span style={{ background: 'linear-gradient(90deg,#7C4DFF,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Wynky
                  </span>
                  , your study buddy
                </h1>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#94A3B8' }}>
                  A quick 7-question game to find your study identity. Sound on for the full experience.
                </p>
                <PrimaryButton
                  onClick={begin}
                  background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                  glow="0 0 22px rgba(124,77,255,0.6), 0 0 44px rgba(41,98,255,0.3)"
                  style={{ alignSelf: 'flex-start', marginTop: 8, padding: '0 28px' }}
                >
                  🔊 Tap to say hi
                </PrimaryButton>
              </div>
            )}

            {phase === 'intro' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9' }}>{hi ? 'Game khelein?' : 'Wanna play?'}</div>
                <PrimaryButton onClick={play} background="#19D3A2" color="#04140F" glow="0 0 24px rgba(25,211,162,0.4)" style={{ fontWeight: 700 }}>
                  {hi ? 'Haan, chalo khelte hain! 🎮' : "Yes, let's play! 🎮"}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => say(INTRO, speech.current?.after)}
                  style={{ height: 40, borderRadius: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontSize: 13, background: 'transparent', color: '#8B9AC7', border: '1px solid #1A2845' }}
                >
                  ↻ {hi ? 'Phir se suno' : 'Hear it again'}
                </button>
              </div>
            )}

            {phase === 'q' && question && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                <div style={eyebrow}>
                  QUESTION {Math.min(answered + 1, total)} OF {total}
                  {question.multiSelect ? ' · PICK ALL THAT APPLY' : ''}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 }}>{QUESTION_COPY[question.id].ask[lang].text}</div>
                <div className="wq-options" style={{ display: 'grid', gridTemplateColumns: question.options.length > 4 ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {question.options.map((o) => (
                    <OptionChip key={o.value} label={o.label} on={pick.includes(o.value)} onClick={() => toggle(o.value)} />
                  ))}
                </div>
                {customPicked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      autoFocus
                      value={customText}
                      maxLength={CUSTOM_ANSWER_MAX_LENGTH}
                      onChange={(e) => setCustomText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submit();
                      }}
                      placeholder={hi ? 'Apna answer likho…' : 'Type your answer…'}
                      aria-label="Your own answer"
                      style={{
                        height: 46, padding: '0 16px', borderRadius: 14, fontFamily: 'Poppins, sans-serif', fontSize: 14,
                        color: '#F1F5F9', background: 'rgba(14,21,40,0.75)', border: '1px solid #6B44EE', outline: 'none',
                        boxShadow: '0 0 18px rgba(124,77,255,0.25)',
                      }}
                    />
                    <div style={{ alignSelf: 'flex-end', fontFamily: MONO, fontSize: 10, color: '#64748B' }}>
                      {customText.trim().length}/{CUSTOM_ANSWER_MAX_LENGTH}
                    </div>
                  </div>
                )}
                <PrimaryButton
                  onClick={submit}
                  disabled={!canSubmit}
                  background="linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)"
                  glow="0 0 24px rgba(41,98,255,0.5)"
                  style={{ marginTop: 6, height: 46, fontSize: 14 }}
                >
                  {hi ? 'Aage badho →' : 'Next →'}{' '}
                  {!alreadyCompleted && <span style={{ opacity: 0.7, fontSize: 12 }}>+5</span>}
                </PrimaryButton>
              </div>
            )}

            {phase === 'saving' && (
              <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={eyebrow}>YOUR STUDY IDENTITY</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#CBD5E1' }}>{hi ? 'Result ban raha hai…' : 'Working out your result…'}</div>
              </div>
            )}

            {phase === 'error' && error && (
              <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={eyebrow}>COULDN'T SAVE</div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: '#CBD5E1' }}>{error.message}</div>
                {error.signedOut ? (
                  <PrimaryButton
                    onClick={() => { window.location.href = '/login.html'; }}
                    background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                    glow="0 0 22px rgba(124,77,255,0.6)"
                    style={{ height: 46, fontSize: 14 }}
                  >
                    {hi ? 'Login karo →' : 'Log in →'}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    onClick={() => void finish(answers)}
                    background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                    glow="0 0 22px rgba(124,77,255,0.6)"
                    style={{ height: 46, fontSize: 14 }}
                  >
                    {hi ? 'Phir se try karo' : 'Try again'}
                  </PrimaryButton>
                )}
              </div>
            )}

            {phase === 'result' && result && (
              <div style={panel}>
                <div style={eyebrow}>YOUR STUDY IDENTITY</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginTop: 8, textShadow: '0 0 40px #563FA0' }}>{result.archetype}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <div style={{ flex: 1, minWidth: 0, padding: 14, borderRadius: 14, background: 'rgba(14,21,40,0.55)', border: '1px solid rgba(26,40,69,0.6)' }}>
                    <div style={{ fontSize: 10, color: '#64748B' }}>Username</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, color: '#C4AAFF', marginTop: 4, overflowWrap: 'anywhere' }}>
                      {result.displayUsername ? `@${result.displayUsername}` : '—'}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: 14, borderRadius: 14, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    <div style={{ fontSize: 10, color: '#64748B' }}>Wynkoins earned</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, color: '#FBBF24', marginTop: 4 }}>+{result.coinsAwarded}</div>
                    {!result.isFirstTime && <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>{hi ? 'Pehli baar mein mil chuke' : 'Already claimed first time'}</div>}
                  </div>
                </div>
                <PrimaryButton
                  onClick={() => { window.location.href = '/home.html'; }}
                  background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                  glow="0 0 22px rgba(124,77,255,0.6)"
                  style={{ marginTop: 20, width: '100%', height: 46, fontSize: 14 }}
                >
                  {hi ? 'Dashboard pe chalo →' : 'Go to my dashboard →'}
                </PrimaryButton>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
