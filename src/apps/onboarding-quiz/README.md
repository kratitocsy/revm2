# Onboarding Quiz (React island)

Wynky's 7-question "study identity" game, shown after `onboarding.html`
finishes (see that file's `finish()` — it now redirects here instead of
straight to `home.html`). Built from the design handoff in
`design_handoff_onboarding_quiz/` (Wynky video mascot, speech bubble,
Hinglish/English voice, archetype reveal).

Same build model as `src/apps/mobile-home` and `src/apps/desktop-dashboard`
— see those READMEs / `vite.mobile-home.config.js`'s header comment for why
(static deploy, no Node server).

## Files

- `OnboardingQuiz.tsx` — the flow: start → intro → questions → saving → result.
- `wynky.tsx` — `WynkyStage` (looping video clips), `SpeechBubble` (typewriter),
  `speak()` (Web Speech, recorded voice-over is a future swap — see below),
  `sfx()` (WebAudio beeps, no files).
- `quizCopy.ts` — Wynky's lines (draft copy per question) and the verbatim
  intro lines. Question branching/scoring itself lives in
  `../_shared/quizEngine.ts` — this file only supplies prompt text.
- `imports/wynky-dance.mp4` — the mascot clip, cut into expression segments
  by timestamp in `wynky.tsx` (`WYNKY_CLIPS`).
- `main.tsx` / `onboarding-quiz.html` / `onboarding-quiz.css` — same shape
  as `mobile-home`'s.

## Real logic, not the prototype's demo copy

The design handoff's `prototype/Quiz.jsx` (kept in `design_handoff_onboarding_quiz/`
at the repo root, not shipped) reimplements branching/scoring locally for a
standalone demo. This app does **not** do that — it calls the real,
unit-tested `../_shared/quizEngine.ts` (`getNextQuestion`, `scoreArchetype`
via `completeQuiz`, `calculateQuizReward` server-side, `generateUsername`)
and persists through `../_shared/quizPersistence.ts` (`rpc_complete_quiz`,
migration `0066_rpc_complete_quiz.sql`). Coins and the stored username are
authoritative from the server response, not computed client-side.

## Commands

```
npm run dev:onboarding-quiz     # local dev server with HMR
npm run build:onboarding-quiz   # builds Tailwind CSS, then the bundle —
                                 # outputs onboarding-quiz.html + assets/onboarding-quiz-*
                                 # to the repo root, same as every other page
```

## Voice

Prototype uses `speechSynthesis` (browser TTS) with a fallback timer when
speech synthesis is unavailable or muted. Production should replace this
with recorded voice-over files per the handoff doc
(`/audio/wynky/{lang}/{lineId}.mp3`), driven by `audio.onplay`/`onended`
instead of the utterance's `onstart`/`onend` — `speak()` in `wynky.tsx` is
the single place to swap.

## Status

Wired into `onboarding.html`'s finish step. Not yet using recorded voice
lines (Web Speech only) or the after-session channel-learning features from
later build-plan steps — those are separate, unbuilt pieces of the wider
quiz-bot spec (`Wynko_Quiz_Bot_Schedule_Plan.pdf`, steps 6–9).
