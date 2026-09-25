# Onboarding Quiz (React island)

First-run onboarding, shown once per account (login.html sends anyone
without `onboarding_completed_at` here): "Select Your Language" (Hindi /
English) -> Wynky says hello with "Find Your Study DNA" / "Skip for Now" ->
the 5-question Study DNA quiz (each question skippable, +10 Wynkoins per
answer, 50 max) -> name / exam / username -> Home. "Skip for Now" goes
straight to the name / exam / username step. Server side: migration
`0088_study_dna_onboarding.sql`.

Same build model as `src/apps/mobile-home` and `src/apps/desktop-dashboard`
— see those READMEs / `vite.mobile-home.config.js`'s header comment for why
(static deploy, no Node server).

## Files

- `OnboardingQuiz.tsx` — the flow: start → intro → questions → saving → result.
- `wynky.tsx` — `WynkyStage` (looping video clips), `WynkyHero` + `playHero()`
  (the hello clip, played in step with her voice), `SpeechBubble` (typewriter),
  `speak()` (recorded voice-over file, else Web Speech — see below),
  `sfx()` (WebAudio beeps, no files).
- `quizCopy.ts` — Wynky's lines: the hello, each question (English text and
  Wynky's Hindi line, verbatim) and Hindi labels for every option. The
  questions, options, scoring and Study DNA rules live in
  `../_shared/quizEngine.ts`.
- `imports/wynky-dance.mp4` — the mascot clip, cut into expression segments
  by timestamp in `wynky.tsx` (`WYNKY_CLIPS`).
- `main.tsx` / `onboarding-quiz.html` / `onboarding-quiz.css` — same shape
  as `mobile-home`'s.

## Real logic, not the prototype's demo copy

The design handoff's `prototype/Quiz.jsx` (kept in `design_handoff_onboarding_quiz/`
at the repo root, not shipped) reimplements branching/scoring locally for a
standalone demo. This app does **not** do that — it calls the real,
unit-tested `../_shared/quizEngine.ts` (`getNextQuestion`, `scoreArchetype`,
`generateUsername`) and saves through `../_shared/quizPersistence.ts`
(`rpc_submit_study_dna`, `rpc_check_username`, `rpc_finish_onboarding` —
migration `0088_study_dna_onboarding.sql`). Coins are counted by the server,
never trusted from the page.

## Commands

```
npm run dev:onboarding-quiz     # local dev server with HMR
npm run build:onboarding-quiz   # builds Tailwind CSS, then the bundle —
                                 # outputs onboarding-quiz.html + assets/onboarding-quiz-*
                                 # to the repo root, same as every other page
```

## Voice

**The hello (language → "Meet Wynky" screens)** is tied to
`imports/wynky-hello.mp4`, which has Wynky's Hindi hello baked into its own
soundtrack, lip-synced (`/audio/wynky/hi/intro.mp3` is that same recording,
cut from 1.05s into the clip). The clip holds a still on the language
screen; tapping "Let's go" plays it once (`playHero()` in `wynky.tsx`) from
0.7s and holds it at 9.5s, just before its fade to black:

- Hindi: the clip plays **with its own sound**, so voice and lips come
  from one media element and can't drift apart (even if it's still
  buffering, both wait together).
- English: the clip plays muted, started the moment the English voice
  starts (a recorded `/audio/wynky/en/intro.mp3` if one is added, else
  browser TTS). Lips won't match English words — that needs an English
  version of the clip.
- Mute/unmute mid-hello just toggles the clip's sound; "Hear Wynky again"
  replays it.

**Every other line**: `speak()` in `wynky.tsx` tries a recorded voice-over
file first — `/audio/wynky/{lang}/{lineId}.mp3` (line ids: `reaction_1..4`,
each question id `q1..q5`, `saving`, `save_failed`,
`result_{archetype-slug}`, e.g. `result_dawn-warrior`) — and falls back to
`speechSynthesis` (browser TTS) on a 404/load error or if it doesn't start
within ~2.5s. When it falls back, the file is stopped for good first, so a
slow recording can never play on top of the TTS voice. No recordings exist
for these yet, so they all use the fallback; **dropping real files into
that path is a content-only change, no code edit needed.** A failed URL is
remembered for the session so repeat lines skip straight to the fallback.
Muted skips both and just times the (silent) bubble reveal off text length.

## Status

Wired into `onboarding.html`'s finish step. Only the Hindi hello has a real
voice (the hello clip's soundtrack); everything else runs on the Web Speech
fallback (see Voice above). The
after-session channel-learning features from later build-plan steps are
separate, unbuilt pieces of the wider quiz-bot spec
(`Wynko_Quiz_Bot_Schedule_Plan.pdf`, steps 6–9).
