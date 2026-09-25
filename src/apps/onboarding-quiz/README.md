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
- `wynky.tsx` — `WynkyStage` (looping video clips), `SpeechBubble` (typewriter),
  `speak()` (Web Speech, recorded voice-over is a future swap — see below),
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

`speak()` in `wynky.tsx` tries a recorded voice-over file first —
`/audio/wynky/{lang}/{lineId}.mp3` (line ids: `intro`, `reaction_1..4`,
each question id `q1..q5`, `saving`, `save_failed`,
`result_{archetype-slug}`, e.g. `result_dawn-warrior`) — and falls back to
`speechSynthesis` (browser TTS) transparently on a 404/load error or if it
doesn't start within ~1.2s. No recordings exist yet, so every line
currently falls back; **dropping real files into that path is a
content-only change, no code edit needed.** A failed URL is remembered for
the session so repeat lines skip straight to the fallback instead of
re-requesting a file that's already 404'd. Muted skips both and just times
the (silent) bubble reveal off text length.

## Status

Wired into `onboarding.html`'s finish step. No recorded voice-over files
exist yet, so it runs on the Web Speech fallback (see Voice above). The
after-session channel-learning features from later build-plan steps are
separate, unbuilt pieces of the wider quiz-bot spec
(`Wynko_Quiz_Bot_Schedule_Plan.pdf`, steps 6–9).
