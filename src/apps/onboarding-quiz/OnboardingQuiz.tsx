import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { sb } from '../_shared/supabaseClient';
import {
  CUSTOM_ANSWER_MAX_LENGTH,
  CUSTOM_VALUE,
  COINS_PER_ANSWER,
  MAX_QUIZ_COINS,
  QUESTION_COUNT,
  answeredQuestionCount,
  answeredQuestions,
  cleanUsernameInput,
  getNextQuestion,
  questionNumber,
  usernameProblem,
  validateCustomAnswer,
  type Archetype,
  type QuestionId,
  type QuizAnswers,
  type QuizQuestion,
} from '../_shared/quizEngine';
import {
  checkUsername,
  finishOnboarding,
  submitStudyDna,
  suggestUsername,
  type QuizSupabaseClient,
  type StudyDnaResult,
} from '../_shared/quizPersistence';
import { HELLO_CLIP_EN, HELLO_CLIP_HI, SpeechBubble, WynkyHero, WynkyStage, playHero, sfx, speak, type Expression, type Lang, type Line } from './wynky';
import {
  INTRO,
  OPTION_LABELS_HI,
  PROFILE_AFTER_SKIP,
  QUESTION_COPY,
  REACTIONS,
  SAVE_FAILED,
  SAVING,
  SKIPPED_QUESTION,
  resultLine,
} from './quizCopy';
import wynkyVideo from './imports/wynky-dance.mp4';
import wynkyHelloVideo from './imports/wynky-hello.mp4';
import wynkyHelloEnVideo from './imports/wynky-hello-en.mp4';
import wynkoLogo from '../desktop-dashboard/imports/wynko-logo.png';

/*
  First-run flow (shown once per account — see migration 0088):
    lang   "Select Your Language" (Hindi / English) -> Let's go
    intro  Meet Wynky: she says hello right away (the Let's go tap lets the
           browser play her voice) -> "Find Your Study DNA" | "Skip for Now"
    q      5 questions, each skippable; +10 Wynkoins per answer (50 max)
    saving -> profile (Study DNA + Wynkoins + name / exam / username) -> Home
  "Skip for Now" goes straight to the profile step (no Study DNA, no coins).
*/
type Phase = 'loading' | 'lang' | 'intro' | 'q' | 'saving' | 'profile' | 'error';
type ProfileMode = 'dna' | 'skipped';

const LANG_KEY = 'wynko_quiz_lang_v1';
const MUTED_KEY = 'wynko_quiz_muted_v1';
const MONO = "'JetBrains Mono', monospace";
const client = sb as unknown as QuizSupabaseClient;

const TEXT = {
  en: {
    meetTitle: 'Meet', meetTitleEnd: ', your study buddy',
    meetSub: 'A quick 5-question game to find your Study DNA. Sound on for the full experience.',
    findDna: 'Find Your Study DNA', skipForNow: 'Skip for Now', hearAgain: '↻ Hear it again',
    question: (n: number) => `QUESTION ${n} OF ${QUESTION_COUNT}`,
    pickAll: ' · PICK ALL THAT APPLY', pickUpTo: (n: number) => ` · PICK UP TO ${n}`,
    skip: 'Skip', next: 'Next →', typeAnswer: 'Type your answer…',
    coinRule: `+${COINS_PER_ANSWER} Wynkoins for every answer`,
    working: 'Working out your Study DNA…',
    yourDna: 'YOUR STUDY DNA', earned: 'Wynkoins earned', balance: 'Your Wynkoins',
    alreadyClaimed: 'Already claimed before',
    setupEyebrow: 'SET UP YOUR PROFILE', setupTitle: 'Tell us a bit about you',
    formTitle: 'Almost there — tell us about you',
    name: 'Your name', namePh: 'e.g. Aarav Sharma', exam: 'Your exam', examPh: 'e.g. JEE Main 2027',
    username: 'Username', checking: 'Checking…', available: '✓ Available — it’s yours', taken: '✗ Already taken',
    letsGo: "Let's go →", saving: 'Saving…',
    tryAgain: 'Try again', logIn: 'Log in →', couldntSave: "COULDN'T SAVE",
  },
  hi: {
    meetTitle: 'Milo', meetTitleEnd: ' se, aapki study buddy',
    meetSub: '5 sawaalon ka chhota sa game — aapka Study DNA pata karne ke liye. Sound on rakhna!',
    findDna: 'Find Your Study DNA', skipForNow: 'Skip for Now', hearAgain: '↻ Phir se suno',
    question: (n: number) => `SAWAAL ${n} / ${QUESTION_COUNT}`,
    pickAll: ' · JITNE CHAHO CHUNO', pickUpTo: (n: number) => ` · ZYADA SE ZYADA ${n} CHUNO`,
    skip: 'Skip', next: 'Aage badho →', typeAnswer: 'Apna answer likho…',
    coinRule: `Har jawaab pe +${COINS_PER_ANSWER} Wynkoins`,
    working: 'Aapka Study DNA ban raha hai…',
    yourDna: 'AAPKA STUDY DNA', earned: 'Wynkoins mile', balance: 'Aapke Wynkoins',
    alreadyClaimed: 'Pehle hi mil chuke hain',
    setupEyebrow: 'APNI PROFILE BANAO', setupTitle: 'Apne baare mein thoda batao',
    formTitle: 'Bas ek step aur — apne baare mein batao',
    name: 'Aapka naam', namePh: 'jaise Aarav Sharma', exam: 'Aapka exam', examPh: 'jaise JEE Main 2027',
    username: 'Username', checking: 'Check ho raha hai…', available: '✓ Available — ye aapka hai', taken: '✗ Ye pehle se liya hua hai',
    letsGo: "Let's go →", saving: 'Save ho raha hai…',
    tryAgain: 'Phir se try karo', logIn: 'Login karo →', couldntSave: 'SAVE NAHI HUA',
  },
} as const;

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
  next[q.field] = q.multiSelect ? pick : pick[0];
  if (pick.includes(CUSTOM_VALUE)) next[q.customField] = customText.trim();
  else delete next[q.customField];
  return next as QuizAnswers;
}

function optionLabel(lang: Lang, q: QuizQuestion, value: string, fallback: string): string {
  if (lang !== 'hi') return fallback;
  return OPTION_LABELS_HI[`${q.id}:${value}`] ?? fallback;
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

function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#F59E0B" stroke="#FBBF24" strokeWidth="1" />
      <circle cx="8" cy="8" r="4.5" fill="none" stroke="#FDE68A" strokeWidth="1" opacity="0.8" />
      <text x="8" y="10.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#78350F" fontFamily="Poppins, sans-serif">W</text>
    </svg>
  );
}

function OptionChip({ label, on, onClick, dimmed }: { label: string; on: boolean; onClick: () => void; dimmed?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={dimmed || undefined}
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
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: '#A78BFA' };

const panel: CSSProperties = {
  maxWidth: 460, padding: 28, borderRadius: 20, background: 'linear-gradient(160deg, #0F1240 0%, #0A0E28 100%)',
  border: '1px solid rgba(124,77,255,0.4)', boxShadow: '0 0 60px rgba(124,77,255,0.2)',
};

const inputStyle: CSSProperties = {
  width: '100%', height: 46, padding: '0 16px', borderRadius: 14, fontFamily: 'Poppins, sans-serif', fontSize: 14,
  color: '#F1F5F9', background: 'rgba(14,21,40,0.75)', border: '1px solid #1A2845', outline: 'none', boxSizing: 'border-box',
};

const fieldLabel: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#94A3B8', margin: '16px 0 6px' };

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

/** Segmented coin bar: one +10 segment per question. */
function CoinBar({ answers, current, label, coins }: {
  answers: QuizAnswers; current: number | null; label: string; coins: number;
}) {
  const done = answeredQuestions(answers);
  const skipped = new Set(answers.skipped ?? []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 11, color: '#8B9AC7' }}>
        <span>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, color: '#FBBF24', fontWeight: 600 }}>
          <CoinIcon size={13} /> {coins} / {MAX_QUIZ_COINS}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }} role="img" aria-label={`${coins} of ${MAX_QUIZ_COINS} Wynkoins`}>
        {done.map((isDone, i) => {
          const n = i + 1;
          const wasSkipped = !isDone && skipped.has(`q${n}` as QuestionId);
          const isCurrent = current === n && !isDone;
          return (
            <div key={n} title={isDone ? `+${COINS_PER_ANSWER}` : wasSkipped ? 'Skipped' : `+${COINS_PER_ANSWER}`}
              style={{
                flex: 1, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 10, fontWeight: 600, transition: 'all 300ms',
                background: isDone ? 'linear-gradient(135deg,#F59E0B,#FBBF24)' : 'rgba(14,21,40,0.7)',
                color: isDone ? '#3B2203' : wasSkipped ? '#3A4668' : isCurrent ? '#C4AAFF' : '#4E5E84',
                border: `1px solid ${isDone ? '#FBBF24' : isCurrent ? '#7C4DFF' : '#1A2845'}`,
                boxShadow: isDone ? '0 0 10px rgba(245,158,11,0.35)' : isCurrent ? '0 0 10px rgba(124,77,255,0.35)' : 'none',
                textDecoration: wasSkipped ? 'line-through' : 'none',
              }}>
              +{COINS_PER_ANSWER}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SpeechEntry {
  line: Line;
  after?: () => void;
  cancel: () => void;
  /** Set while the hello clip itself is the voice: mute/unmute it in place. */
  setVoice?: (on: boolean) => void;
}

type UsernameState = { state: 'idle' | 'checking' | 'ok' | 'bad'; message: string | null };

export default function OnboardingQuiz() {
  const [lang, setLang] = useState<Lang>(() => (readPref(LANG_KEY) === 'en' ? 'en' : 'hi'));
  const [muted, setMuted] = useState(() => readPref(MUTED_KEY) === '1');
  const [phase, setPhase] = useState<Phase>('loading');
  const [langPick, setLangPick] = useState<Lang | null>(() => (readPref(LANG_KEY) === 'en' ? 'en' : readPref(LANG_KEY) === 'hi' ? 'hi' : null));
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [reacting, setReacting] = useState(false);
  const [bubble, setBubble] = useState<Line>(INTRO);
  const [expr, setExpr] = useState<Expression>('wave');
  const [speaking, setSpeaking] = useState(false);
  const [coinPop, setCoinPop] = useState<number | null>(null);
  const [dna, setDna] = useState<StudyDnaResult | null>(null);
  const [error, setError] = useState<{ message: string; signedOut: boolean } | null>(null);

  // Profile step
  const [profileMode, setProfileMode] = useState<ProfileMode>('skipped');
  const [fullName, setFullName] = useState('');
  const [exam, setExam] = useState('');
  const [username, setUsername] = useState('');
  const [uname, setUname] = useState<UsernameState>({ state: 'idle', message: null });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const langRef = useRef(lang);
  const mutedRef = useRef(muted);
  const speech = useRef<SpeechEntry | null>(null);
  const heroHiRef = useRef<HTMLVideoElement>(null);
  const heroEnRef = useRef<HTMLVideoElement>(null);
  const checkSeq = useRef(0);
  const t = TEXT[lang];

  // `after` runs once, when the line finishes. Re-speaking the same line
  // (language switch, mute) carries over an `after` that hasn't run yet.
  //
  // The hello (INTRO) is tied to the hello clip on screen, one per language
  // (Hindi: wynky-hello.mp4, English: wynky-hello-en.mp4). Each clip's own
  // soundtrack is her voice (lip-synced), so it plays with sound.
  const say = useCallback((ln: Line, after?: () => void) => {
    speech.current?.cancel();
    const entry: SpeechEntry = { line: ln, after, cancel: () => {} };
    speech.current = entry;
    const l = langRef.current;
    const onStart = () => setSpeaking(true);
    const onEnd = () => {
      setSpeaking(false);
      const cb = entry.after;
      entry.after = undefined;
      cb?.();
    };
    const hero = ln === INTRO ? (l === 'en' ? heroEnRef : heroHiRef).current : null;
    if (hero) {
      const clip = playHero(hero, l === 'en' ? HELLO_CLIP_EN : HELLO_CLIP_HI, !mutedRef.current, onStart, onEnd);
      entry.cancel = clip.stop;
      entry.setVoice = clip.setVoice;
      return;
    }
    entry.cancel = speak(ln, l, mutedRef.current, onStart, onEnd);
  }, []);

  const resay = useCallback(() => {
    const cur = speech.current;
    if (cur) say(cur.line, cur.after);
  }, [say]);

  useEffect(() => () => speech.current?.cancel(), []);

  // Pre-fills the profile step and switches to it.
  const openProfile = useCallback(async (mode: ProfileMode, from: { name: string; exam?: string | null; archetype?: Archetype | null }) => {
    setProfileMode(mode);
    setFullName((cur) => cur || from.name);
    setExam((cur) => cur || (from.exam ?? ''));
    setPhase('profile');
    try {
      const suggested = await suggestUsername(client, { archetype: from.archetype, name: from.name });
      setUsername((cur) => cur || suggested);
    } catch {
      // Leave it empty; the student types one.
    }
  }, []);

  // Where does this account stand? Onboarded -> Home; quiz done but no
  // profile yet -> straight to the profile step; otherwise start.
  const defaults = useRef<{ name: string; exam: string | null }>({ name: '', exam: null });
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!live) return;
      if (!session) {
        window.location.replace('/login.html');
        return;
      }
      const { data: prof } = await sb
        .from('user_profiles')
        .select('full_name, display_name, exam, quiz_completed_at, onboarding_completed_at, archetype, quiz_answers')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!live) return;
      if (prof?.onboarding_completed_at) {
        window.location.replace('/home.html');
        return;
      }
      const md = (session.user.user_metadata ?? {}) as Record<string, string | undefined>;
      const name = (prof?.full_name || prof?.display_name || md.full_name || md.name || '').trim();
      defaults.current = { name, exam: prof?.exam ?? null };
      if (prof?.quiz_completed_at && prof.archetype) {
        const saved = (prof.quiz_answers ?? {}) as QuizAnswers;
        const { data: wallet } = await sb.from('user_wallets').select('coins').eq('user_id', session.user.id).maybeSingle();
        if (!live) return;
        setAnswers(saved);
        setBalance(wallet?.coins ?? null);
        setDna({ archetype: prof.archetype as Archetype, answered: answeredQuestionCount(saved), coinsAwarded: 0, isFirstTime: false, balance: wallet?.coins ?? null });
        setExpr('happy');
        setBubble(resultLine(prof.archetype as Archetype));
        void openProfile('dna', { name, exam: prof.exam, archetype: prof.archetype as Archetype });
        return;
      }
      setPhase('lang');
    })();
    return () => {
      live = false;
    };
  }, [openProfile]);

  // Username: check format here, availability on the server (debounced).
  useEffect(() => {
    if (phase !== 'profile') return;
    if (!username) {
      setUname({ state: 'idle', message: null });
      return;
    }
    const problem = usernameProblem(username);
    if (problem) {
      setUname({ state: 'bad', message: problem });
      return;
    }
    const seq = ++checkSeq.current;
    setUname({ state: 'checking', message: null });
    const timer = setTimeout(async () => {
      try {
        const r = await checkUsername(client, username);
        if (seq !== checkSeq.current) return;
        setUname(r.available ? { state: 'ok', message: null } : { state: 'bad', message: r.message });
      } catch (e) {
        if (seq !== checkSeq.current) return;
        setUname({ state: 'bad', message: e instanceof Error ? e.message : 'Could not check that username.' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [username, phase]);

  const changeLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    langRef.current = l;
    writePref(LANG_KEY, l);
    if (phase !== 'lang') resay();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    writePref(MUTED_KEY, m ? '1' : '0');
    if (speech.current?.setVoice) speech.current.setVoice(!m);
    else if (m && speech.current && (speaking || speech.current.after)) resay();
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
    let r: StudyDnaResult;
    try {
      r = await submitStudyDna(client, a);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Something went wrong.', false);
      return;
    }
    setDna(r);
    setBalance(r.balance);
    setExpr('wave');
    sfx('tada', mutedRef.current);
    const ln = resultLine(r.archetype);
    setBubble(ln);
    say(ln, () => setExpr('happy'));
    void openProfile('dna', { name: defaults.current.name, exam: defaults.current.exam, archetype: r.archetype });
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

  const submitLangPick = () => {
    if (!langPick) return;
    sfx('pop', mutedRef.current);
    setLang(langPick);
    langRef.current = langPick;
    writePref(LANG_KEY, langPick);
    // Straight into Wynky's hello - this tap is what lets the browser play her voice.
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

  const skipForNow = () => {
    sfx('pop', mutedRef.current);
    setDna(null);
    setExpr('wave');
    setBubble(PROFILE_AFTER_SKIP);
    say(PROFILE_AFTER_SKIP, () => setExpr('happy'));
    void openProfile('skipped', { name: defaults.current.name, exam: defaults.current.exam });
  };

  const customPicked = pick.includes(CUSTOM_VALUE);
  const canSubmit = !!question && !reacting && pick.length > 0 && (!customPicked || validateCustomAnswer(customText).valid);
  const coins = answeredQuestionCount(answers) * COINS_PER_ANSWER;

  const submit = () => {
    if (!question || !canSubmit) return;
    const a = applyAnswer(answers, question, pick, customText);
    const gained = answeredQuestionCount(a) > answeredQuestionCount(answers);
    setAnswers(a);
    setReacting(true);
    sfx('coin', mutedRef.current);
    if (gained) setCoinPop(Date.now());
    const r = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    setExpr(r.expr);
    setBubble(r.line);
    say(r.line, () => showQuestion(a));
  };

  const skipQuestion = () => {
    if (!question || reacting) return;
    const a: QuizAnswers = { ...answers, skipped: [...(answers.skipped ?? []), question.id] };
    setAnswers(a);
    setReacting(true);
    sfx('whoosh', mutedRef.current);
    setExpr('wink');
    setBubble(SKIPPED_QUESTION);
    say(SKIPPED_QUESTION, () => showQuestion(a));
  };

  const toggle = (v: string) => {
    if (!question || reacting) return;
    sfx('pop', mutedRef.current);
    const wasOn = pick.includes(v);
    if (!question.multiSelect) setPick([v]);
    else if (wasOn) setPick(pick.filter((x) => x !== v));
    else if (question.maxSelect !== undefined && pick.length >= question.maxSelect) return; // at the limit
    else setPick([...pick, v]);
    if (!speaking) setExpr(wasOn ? QUESTION_COPY[question.id].expr : 'wink');
  };

  const canFinish = !submitting && fullName.trim().length > 0 && exam.trim().length > 0 && uname.state === 'ok';

  const letsGo = async () => {
    if (!canFinish) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await finishOnboarding(client, { fullName: fullName.trim(), exam: exam.trim(), username });
      sfx('tada', mutedRef.current);
      window.location.href = '/home.html';
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      if (/username/i.test(msg)) setUname({ state: 'bad', message: msg });
      else setFormError(msg);
      setSubmitting(false);
    }
  };

  const hi = lang === 'hi';
  const isQPhase = phase === 'q';
  const showBar = phase === 'q' || phase === 'saving' || (phase === 'profile' && profileMode === 'dna');
  const headerCoins = phase === 'profile' && dna ? (dna.isFirstTime ? dna.coinsAwarded : balance ?? 0) : coins;
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

  if (phase === 'loading') {
    return <div style={{ minHeight: '100%', background: '#020615' }} />;
  }

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
            <div className="wq-header-eyebrow" style={{ fontSize: 10, letterSpacing: '0.18em', color: '#68728A' }}>WELCOME TO WYNKO</div>
            <div className="wq-header-title" style={{ fontSize: 14, fontWeight: 600, color: '#F3F4F6' }}>{phase === 'profile' ? (profileMode === 'dna' ? 'Your Study DNA' : 'Your profile') : 'Play with Wynky'}</div>
          </div>
          {phase !== 'lang' && (
            <div role="group" aria-label="Language" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#0B1530', border: '1px solid #1A2845' }}>
              {segBtn(hi, 'Hindi', () => changeLang('hi'))}
              {segBtn(!hi, 'English', () => changeLang('en'))}
            </div>
          )}
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
            aria-label={`${headerCoins} Wynkoins`}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24',
              fontFamily: MONO, fontSize: 13, fontWeight: 600,
            }}
          >
            <CoinIcon />
            {headerCoins}
            {coinPop && (
              <span key={coinPop} aria-hidden="true" style={{ position: 'absolute', right: 6, top: -4, fontSize: 11, animation: 'wkCoin 900ms ease-out forwards' }}>
                +{COINS_PER_ANSWER}
              </span>
            )}
          </div>
        </header>

        {showBar && (
          <div className="wq-progress" style={{ padding: '0 32px' }}>
            <CoinBar
              answers={answers}
              current={question ? questionNumber(question.id) : null}
              label={t.coinRule}
              coins={coins}
            />
          </div>
        )}

        <main className="wq-main">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isQPhase ? 14 : 28, transition: 'gap 220ms ease' }}>
            {phase !== 'lang' && <SpeechBubble text={bubble[lang].text} lang={lang} compact={isQPhase || phase === 'profile'} />}
            {phase === 'lang' || phase === 'intro' ? (
              // The language screen always shows the Hindi clip's still; the
              // English clip takes over only for the English hello.
              <WynkyHero
                clips={[
                  { src: wynkyHelloVideo, clip: HELLO_CLIP_HI, videoRef: heroHiRef, show: phase === 'lang' || lang === 'hi', preload: 'auto' },
                  {
                    src: wynkyHelloEnVideo, clip: HELLO_CLIP_EN, videoRef: heroEnRef, show: phase === 'intro' && lang === 'en',
                    preload: langPick === 'en' || lang === 'en' ? 'auto' : 'metadata',
                  },
                ]}
              />
            ) : (
              <WynkyStage src={wynkyVideo} expression={expr} speaking={speaking} size={isQPhase || phase === 'profile' ? 'small' : 'large'} />
            )}
          </div>

          <div>
            {phase === 'lang' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
                <div style={{ ...eyebrow, letterSpacing: '0.22em' }}>STEP 1 · LANGUAGE</div>
                <h1 className="wq-h1" style={{ margin: 0, fontSize: 36, fontWeight: 700, lineHeight: 1.15, color: '#fff' }}>Select Your Language</h1>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>
                  Apni bhasha chuno — Wynky usi mein baat karegi.
                  <br />
                  Choose the language Wynky talks to you in.
                </p>
                <div className="wq-options" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <OptionChip label="हिंदी · Hindi" on={langPick === 'hi'} onClick={() => { sfx('pop', mutedRef.current); setLangPick('hi'); }} />
                  <OptionChip label="English" on={langPick === 'en'} onClick={() => { sfx('pop', mutedRef.current); setLangPick('en'); }} />
                </div>
                <PrimaryButton
                  onClick={submitLangPick}
                  disabled={!langPick}
                  background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                  glow="0 0 22px rgba(124,77,255,0.6), 0 0 44px rgba(41,98,255,0.3)"
                  style={{ marginTop: 6, height: 48, fontSize: 15 }}
                >
                  Let's go →
                </PrimaryButton>
              </div>
            )}

            {phase === 'intro' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 440 }}>
                <div style={{ ...eyebrow, letterSpacing: '0.22em' }}>STEP 2 · MEET WYNKY</div>
                <h1 className="wq-h1" style={{ margin: 0, fontSize: 40, fontWeight: 700, lineHeight: 1.15, color: '#fff' }}>
                  {t.meetTitle}{' '}
                  <span style={{ background: 'linear-gradient(90deg,#7C4DFF,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Wynky
                  </span>
                  {t.meetTitleEnd}
                </h1>
                <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, color: '#94A3B8' }}>{t.meetSub}</p>
                <PrimaryButton onClick={play} background="linear-gradient(135deg,#19D3A2,#22D3EE)" color="#04140F" glow="0 0 26px rgba(25,211,162,0.45)" style={{ fontWeight: 700, height: 52, fontSize: 16 }}>
                  🧬 Find Your Study DNA
                </PrimaryButton>
                <button
                  type="button"
                  onClick={skipForNow}
                  style={{ height: 48, borderRadius: 16, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontSize: 15, fontWeight: 600, background: 'rgba(14,21,40,0.55)', color: '#CBD5E1', border: '1px solid #1A2845' }}
                >
                  Skip for Now
                </button>
                <button
                  type="button"
                  onClick={() => say(INTRO, speech.current?.after)}
                  style={{ alignSelf: 'center', marginTop: 2, background: 'none', border: 0, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontSize: 13, color: '#8B9AC7' }}
                >
                  {t.hearAgain}
                </button>
              </div>
            )}

            {phase === 'q' && question && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={eyebrow}>
                    {t.question(questionNumber(question.id))}
                    {question.maxSelect ? t.pickUpTo(question.maxSelect) : question.multiSelect ? t.pickAll : ''}
                  </div>
                  <button
                    type="button"
                    onClick={skipQuestion}
                    disabled={reacting}
                    aria-label="Skip this question"
                    style={{
                      padding: '6px 14px', borderRadius: 999, cursor: reacting ? 'default' : 'pointer', fontFamily: 'Poppins, sans-serif',
                      fontSize: 12, fontWeight: 600, background: 'rgba(14,21,40,0.7)', color: '#8B9AC7', border: '1px solid #1A2845',
                      opacity: reacting ? 0.5 : 1,
                    }}
                  >
                    {t.skip} ⏭
                  </button>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 }}>{QUESTION_COPY[question.id].ask[lang].text}</div>
                <div className="wq-options" style={{ display: 'grid', gridTemplateColumns: question.options.length > 4 ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {question.options.map((o) => (
                    <OptionChip
                      key={o.value}
                      label={optionLabel(lang, question, o.value, o.label)}
                      on={pick.includes(o.value)}
                      dimmed={!pick.includes(o.value) && question.maxSelect !== undefined && pick.length >= question.maxSelect}
                      onClick={() => toggle(o.value)}
                    />
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
                      placeholder={t.typeAnswer}
                      aria-label="Your own answer"
                      style={{ ...inputStyle, border: '1px solid #6B44EE', boxShadow: '0 0 18px rgba(124,77,255,0.25)' }}
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
                  {t.next}{' '}
                  <span style={{ opacity: 0.8, fontSize: 12 }}>+{COINS_PER_ANSWER} 🪙</span>
                </PrimaryButton>
              </div>
            )}

            {phase === 'saving' && (
              <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={eyebrow}>{t.yourDna}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#CBD5E1' }}>{t.working}</div>
              </div>
            )}

            {phase === 'error' && error && (
              <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={eyebrow}>{t.couldntSave}</div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: '#CBD5E1' }}>{error.message}</div>
                {error.signedOut ? (
                  <PrimaryButton
                    onClick={() => { window.location.href = '/login.html'; }}
                    background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                    glow="0 0 22px rgba(124,77,255,0.6)"
                    style={{ height: 46, fontSize: 14 }}
                  >
                    {t.logIn}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    onClick={() => void finish(answers)}
                    background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                    glow="0 0 22px rgba(124,77,255,0.6)"
                    style={{ height: 46, fontSize: 14 }}
                  >
                    {t.tryAgain}
                  </PrimaryButton>
                )}
              </div>
            )}

            {phase === 'profile' && (
              <div style={{ ...panel, padding: 26 }}>
                {profileMode === 'dna' && dna ? (
                  <>
                    <div style={eyebrow}>{t.yourDna}</div>
                    <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginTop: 6, textShadow: '0 0 40px #563FA0', lineHeight: 1.1 }}>🧬 {dna.archetype}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <div style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 14, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>{t.earned}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: '#FBBF24', marginTop: 4 }}>
                          <CoinIcon /> +{dna.coinsAwarded}
                        </div>
                        {!dna.isFirstTime && <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{t.alreadyClaimed}</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 14, background: 'rgba(14,21,40,0.55)', border: '1px solid rgba(26,40,69,0.6)' }}>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>{t.balance}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginTop: 4 }}>
                          <CoinIcon /> {balance ?? dna.coinsAwarded}
                        </div>
                      </div>
                    </div>
                    <div style={{ height: 1, background: 'rgba(124,77,255,0.25)', margin: '20px 0 4px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', marginTop: 12 }}>{t.formTitle}</div>
                  </>
                ) : (
                  <>
                    <div style={eyebrow}>{t.setupEyebrow}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginTop: 6, lineHeight: 1.2 }}>{t.setupTitle}</div>
                  </>
                )}

                <label style={fieldLabel} htmlFor="wq-name">{t.name}</label>
                <input id="wq-name" value={fullName} maxLength={60} onChange={(e) => setFullName(e.target.value)} placeholder={t.namePh} style={inputStyle} autoComplete="name" />

                <label style={fieldLabel} htmlFor="wq-exam">{t.exam}</label>
                <input id="wq-exam" value={exam} maxLength={40} onChange={(e) => setExam(e.target.value)} placeholder={t.examPh} style={inputStyle} />

                <label style={fieldLabel} htmlFor="wq-username">{t.username}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#7C4DFF', fontWeight: 600, fontSize: 14 }}>@</span>
                  <input
                    id="wq-username"
                    value={username}
                    onChange={(e) => setUsername(cleanUsernameInput(e.target.value))}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    style={{
                      ...inputStyle, paddingLeft: 34, fontFamily: MONO,
                      border: `1px solid ${uname.state === 'ok' ? 'rgba(25,211,162,0.6)' : uname.state === 'bad' ? 'rgba(248,113,113,0.6)' : '#1A2845'}`,
                    }}
                  />
                </div>
                <div style={{ minHeight: 18, marginTop: 6, fontSize: 12, color: uname.state === 'ok' ? '#19D3A2' : uname.state === 'bad' ? '#F87171' : '#64748B' }}>
                  {uname.state === 'checking' ? t.checking : uname.state === 'ok' ? t.available : uname.state === 'bad' ? (uname.message === 'That username is already taken.' ? t.taken : uname.message) : ''}
                </div>

                {formError && <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, fontSize: 13, color: '#FCA5A5', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}>{formError}</div>}

                <PrimaryButton
                  onClick={() => void letsGo()}
                  disabled={!canFinish}
                  background="linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)"
                  glow="0 0 22px rgba(124,77,255,0.6)"
                  style={{ marginTop: 14, width: '100%', height: 50, fontSize: 15 }}
                >
                  {submitting ? t.saving : t.letsGo}
                </PrimaryButton>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
