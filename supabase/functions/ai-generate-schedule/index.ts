// ===== ai-generate-schedule =====
// Server-side proxy to Google Gemini for AI-powered schedule generation.
// Keeps the Gemini API key secret (never exposed to the client).
//
// Three modes:
//   "text"   — user describes goals in natural language → AI builds a schedule
//   "stats"  — AI analyses the user's study_sessions, subjects, exam date
//              and generates an optimal schedule from their patterns
//   "refine" — Wynky sends its rule-based draft day plus what it knows
//              (Study DNA, busy times, weak subjects, the student's
//              requests) and the AI returns an improved version of the
//              same day. The student's own requests rank above everything.
//   "chat"   — Wynky's chat after set-up: the AI reads the whole
//              conversation, the current plan and the settings it agreed
//              with the student, answers in its own words and returns the
//              full updated plan plus those settings (see CHAT_PROMPT).
//
// Google is sometimes busy or slow, so each call races the Gemini model
// against — if GROQ_API_KEY is set — several models on Groq's free API (a
// different provider entirely); see generate().
//
// The generated schedule is returned as JSON for the client to preview in
// the normal schedule builder — the user always reviews before saving.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const SYSTEM_PROMPT = `You are a study-schedule expert. You create realistic, balanced weekly study schedules for students.

Generate a schedule as JSON with this exact shape — no markdown, no commentary, raw JSON only:
{
  "name": "short catchy schedule name (max 40 chars)",
  "days_of_week": [1,2,3,4,5],
  "slots": [
    {
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "preset_name": "MUST be copied exactly (same case) from the AVAILABLE BLOCK PRESETS list given to you",
      "subject": "Subject or topic being studied in this slot, e.g. Physics, Chemistry, Revision",
      "is_sleep": false,
      "break_after_minutes": 15
    }
  ]
}

Rules:
- days_of_week: 0=Sun 1=Mon … 6=Sat. Pick sensible days.
- Times: 24-hour "HH:MM" format. Slots ordered chronologically. No overlaps.
- CRITICAL: every slot, including the sleep slot, must fit inside a single
  calendar day — end_time must always be strictly LATER than start_time
  (e.g. "07:30" > "06:00"). Times can NEVER wrap past midnight: a sleep
  slot written as "23:00"-"07:00" is INVALID and will be rejected. If you
  want to represent overnight sleep, pick a same-day window instead, e.g.
  "00:00"-"08:00" (midnight to 8am) — never a start_time later in the
  clock than end_time.
- Include 10-20 min breaks between study slots.
- Include exactly ONE sleep slot (is_sleep:true, subject:"Sleep", preset_name:"") for 7-9
  hours, respecting the same-day rule above.
- Total study time (non-sleep) between 2-8 hours depending on goals.
- preset_name: for every non-sleep slot, this MUST be one of the exact strings given in AVAILABLE BLOCK PRESETS — do not invent new preset names, do not rephrase them. If only one preset is available, use it for every slot.
- subject: short topic label (Physics, Chemistry, Math, Revision, Practice, etc.) — independent of preset_name, describes WHAT is being studied, not WHICH block/mode is active.
- Distribute harder subjects during likely peak hours, lighter ones otherwise.
- Return ONLY valid JSON. No markdown fences. No explanation.`;

const REFINE_PROMPT = `You are Wynky, a study planner for Indian exam students (JEE, NEET, boards and others).
You get a DRAFT plan for one day, built by simple rules, and return an improved plan for the same day.

Priority, highest first — a higher item always wins over a lower one:
1. STUDENT'S REQUEST NOW (if given), read together with RECENT CHAT.
2. STANDING REQUESTS the student made in earlier chats.
3. Hard limits: never study inside BUSY times, never before WAKE + 30 min or after SLEEP - 30 min.
4. What is known about the student: Study DNA, weak subjects, exam.
5. The draft.

How to improve the draft:
- Put WEAK subjects and the hardest ones (Maths, Physics, Chemistry, Organic, Accounts) in fresh, high-energy
  time: early in a sitting and in the morning when there is free morning time.
- Don't put the same subject twice in a row; alternate heavy and lighter subjects.
- Keep blocks close to BLOCK LENGTH (shorter if the Study DNA says the student struggles with consistency).
- Leave 10-15 minutes between blocks, and 30 minutes after about 3 hours of study in one sitting.
- Keep total study time close to TARGET STUDY MINUTES unless a request says otherwise.
- If the draft is already good, return it unchanged.

RECENT CHAT is the conversation so far. The request now is often a follow-up to it: words like "it", "that",
"this", "shorter", "more", "instead", "again" or "undo" refer to the plan Wynky showed last and the requests
before it. When the request changes that last plan, start from the last plan in RECENT CHAT (keep what the
student didn't ask to change) rather than from the DRAFT, and keep earlier requests from the chat unless the
student takes them back.

Return ONLY raw JSON, no markdown:
{"slots":[{"start_time":"HH:MM","end_time":"HH:MM","subject":"one of SUBJECTS, copied exactly"}],"note":"one short friendly sentence (max 120 chars) saying what you changed and why, or empty"}

Rules for slots: study blocks only (no sleep, no breaks), 24-hour HH:MM, end_time later than start_time
on the same day, chronological, no overlaps, subject copied exactly from SUBJECTS.`;

const REFINE_WEEK_PROMPT = `You are Wynky, a study planner for Indian exam students (JEE, NEET, boards and others).
You get a DRAFT plan for one day (its block times and lengths) and return a full WEEK of plans, one for
each day 0-6 (0=Sun 1=Mon ... 6=Sat), that rotates subjects across the week instead of repeating the
same subjects every day.

Priority, highest first — a higher item always wins over a lower one:
1. STUDENT'S REQUEST NOW (if given), read together with RECENT CHAT.
2. STANDING REQUESTS the student made in earlier chats.
3. Hard limits: never study inside BUSY times, never before WAKE + 30 min or after SLEEP - 30 min.
4. What is known about the student: Study DNA, weak subjects, exam.
5. The draft's block times and lengths.

How to build the week:
- Keep the same start/end times and block lengths as the draft on every day, unless a request says otherwise.
- Rotate which subjects fill those blocks so different days cover different subjects (e.g. Mon: A+B, Tue: C+D).
- Give WEAK subjects more days across the week than the others.
- Every subject in SUBJECTS should appear on at least one day across the week.
- Don't put the same subject twice in a row within a single day.

RECENT CHAT is the conversation so far. The request now is often a follow-up to it: words like "it", "that",
"this", "shorter", "more", "instead", "again" or "undo" refer to the plan Wynky showed last and the requests
before it. When the request changes that last plan, start from the last plan in RECENT CHAT (keep what the
student didn't ask to change) rather than from the DRAFT, and keep earlier requests from the chat unless the
student takes them back.

Return ONLY raw JSON, no markdown:
{"days":[{"day":0,"slots":[{"start_time":"HH:MM","end_time":"HH:MM","subject":"one of SUBJECTS, copied exactly"}]}],"note":"one short friendly sentence (max 120 chars), or empty"}

"days" must have exactly 7 entries, one per day number 0-6 with no repeats, each with at least one slot.
Rules for each day's slots: study blocks only (no sleep, no breaks), 24-hour HH:MM, end_time later than
start_time on the same day, chronological, no overlaps, subject copied exactly from SUBJECTS.`;

const CHAT_PROMPT = `You are Wynky, the study-planning assistant inside Wynko, an app for Indian exam students (JEE, NEET,
boards and others). You chat with ONE student and keep their study timetable up to date. Talk like a helpful,
smart friend: short, warm, clear, in the student's language style. Never robotic.

You get:
- SETTINGS: what you and the student have agreed so far (hours a day, session length, break length, wake, sleep,
  busy times, preferred study windows, week shape, rules in the student's own words). These stay true until the
  student changes them. Never silently drop or change one.
- CURRENT PLAN: the timetable the student is looking at now.
- RECENT CHAT and the STUDENT'S MESSAGE NOW.
- WHAT WYNKY HAS LEARNED: the student's usual choices, facts remembered from earlier chats, what similar students
  pick, Study DNA. Use these for anything the student hasn't said; the student's own words always win.

What to do with each message:
1. Work out what the student wants, reading it together with the chat (words like "it", "that", "again", "same"
   refer to earlier messages and the current plan).
2. Update SETTINGS with everything the student said or clearly implied (e.g. "11 hrs" -> daily_hours 11,
   "every session 90 minutes" -> session_minutes 90, "9 am to 1 pm is my prime focus" -> a study window,
   "Chemistry every day, 2 subjects a day" -> rules). Keep all earlier settings unless the student changed them.
3. Build the COMPLETE plan that follows ALL settings at once. Change only what the student asked; keep the rest of
   the current plan. Check before answering:
   - Every active day's study total is within 15 minutes of daily_hours (unless a rule says otherwise for a day).
     If the free time really can't fit daily_hours, lower daily_hours to what fits and say so in reply.
   - Sessions are session_minutes long (the last one in a window may be shorter).
   - Breaks between sessions follow break_minutes; nothing inside busy times; nothing before wake or after sleep.
   - Every rule is followed on every day (e.g. "2 subjects a day" means exactly 2 different subjects each day).
   - Use only subject names from SUBJECTS, copied exactly.
4. If the message is only a question or chat, answer it and leave the plan out. If something is truly unclear
   and guessing would likely be wrong, ask ONE short question and leave the plan out. Otherwise don't ask; decide
   and say what you assumed.
5. "reply": 1-3 short sentences saying what you changed and any assumption or problem. Don't list the timetable;
   the app shows it.
6. "remember": new lasting facts about the student worth keeping for future chats ("works on Wynko 1:30-5 pm",
   "exam in April"), short, in plain words. "forget": earlier facts or rules the student says are no longer true.

Week shape: "same" = one plan every active day; "vary" = each day can differ (give every active day);
"ab" = Week A (days 0-6) and Week B (days 7-13) alternate. repeat: "weekly", "every2" (every other week) or "ab".
Days: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat. active_days = days with study (others are days off).

Return ONLY raw JSON, no markdown:
{"reply":"...","settings":{"daily_hours":number,"session_minutes":number,"break_minutes":number,"wake":"HH:MM","sleep":"HH:MM",
"busy":["HH:MM-HH:MM"],"study_windows":["HH:MM-HH:MM"],"week_shape":"same|vary|ab","repeat":"weekly|every2|ab",
"active_days":[0,1,2,3,4,5,6],"rules":["..."]},
"days":[{"day":"all" or 0-13,"slots":[["HH:MM","HH:MM","Subject"]]}],
"remember":["..."],"forget":["..."]}

"days" is left out (or []) when the plan doesn't change. With week_shape "same" give one entry with day "all".
Slots: study sessions only (no breaks, no sleep), 24-hour HH:MM, chronological, no overlaps, end later than start
on the same day; use "24:00" for midnight as an end time.`;

// Statuses that mean "busy or briefly broken, try again", not "bad request".
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Speed matters more than which model answers. Every call shares one 15s
// budget (Wynky's chat stops waiting at 18s, REFINE_TIMEOUT_MS in
// WynkyChat.tsx). The main model starts first; if it fails, or hasn't
// answered within HEDGE_AFTER_MS, the next provider starts alongside it and
// the first good answer wins. A busy Gemini can take 15s just to answer
// "503", so waiting for it in turn used to use up the whole wait. With a
// 6s hedge Groq only started at 12s and timed out too, so providers now
// start 2s apart: Gemini 0s, then each Groq model in turn (2s, 4s, 6s).
// A second Gemini model was dropped: when Google is busy both usually are,
// and each Groq model has its own free-tier limit, so a rate-limited one
// doesn't block the next.
const TOTAL_BUDGET_MS = 15_000;
const HEDGE_AFTER_MS = 2_000;
// Wynky's chat thinks harder (the whole conversation and a full week at
// once), so it gets a longer budget. Gemini Flash answers it alone: Groq
// starts only when Gemini fails, or if Gemini still hasn't answered after
// CHAT_HEDGE_MS, so a stuck Google doesn't leave the student waiting.
// WynkyChat.tsx waits CHAT_TIMEOUT_MS, just above the budget.
const CHAT_BUDGET_MS = 24_000;
const CHAT_HEDGE_MS = 6_000;
// Checked 2026-09-29: qwen/qwen3-32b shut down 2026-07-17 and
// qwen/qwen3.6-27b 2026-09-14. Groq marks Qwen models "preview", so they
// can go at short notice. groqModels() swaps a retired one for another
// live model on its own, logs RETIRED_TAG and puts a red banner in Owner
// Control saying which name to update here.
const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const RETIRED_TAG = "AI MODEL RETIRED";
// Groq's /models list also has speech, safety and tool-router models that
// can't write a plan; never pick those as a stand-in.
const NOT_CHAT = /whisper|tts|guard|playai|orpheus|distil|compound|allam|vision/i;
// Stand-ins are picked in this order of family, then Groq's own order.
const FAMILY_ORDER = [/gpt-oss/, /qwen/, /llama/, /kimi/];

let groqLive: { at: number; ids: string[] } | null = null;
// Models Groq refused for good on a request (retired, or no longer on the
// free tier), skipped by this function instance for a day and replaced by
// groqModels() like a retired one.
const groqBlocked = new Map<string, number>();
const BLOCK_MS = 86_400_000;
const isBlocked = (m: string) => (groqBlocked.get(m) ?? 0) > Date.now();

/** Adds a red banner to Owner Control (migration 0100). An open alert with
 *  the same key isn't added twice, so this is safe to call per request. */
function alertOwner(key: string, title: string, body: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return;
  const done = createClient(url, service)
    .rpc("record_owner_alert", { p_key: key, p_title: title, p_body: body })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn(`ai-generate-schedule: owner alert failed (${error.message})`);
    });
  // Let the write finish even after the response has gone out.
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(done);
}

function alertRetiredGroq(model: string, standIn?: string, why: "retired" | "paid" = "retired") {
  alertOwner(
    `ai-${why}:groq:${model}`,
    why === "paid" ? `Groq no longer offers ${model} on the free tier` : `Groq retired the AI model ${model}`,
    `${standIn ? `Wynky switched to ${standIn} on its own, so students aren't affected. ` : "Wynky moves to another free Groq model on its own from the next request. "}` +
      `Update DEFAULT_GROQ_MODELS in supabase/functions/ai-generate-schedule/index.ts to a current Groq model so this stays fixed.`,
  );
}

/** Groq's live model ids, cached for an hour per function instance.
 *  Null if Groq doesn't answer quickly, so the configured list is used. */
async function liveGroqModels(apiKey: string): Promise<string[] | null> {
  if (groqLive && Date.now() - groqLive.at < 3_600_000) return groqLive.ids;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HEDGE_AFTER_MS - 200),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (Array.isArray(data?.data) ? data.data : [])
      .filter((m: Record<string, unknown>) => m?.active !== false && typeof m?.id === "string")
      .map((m: Record<string, unknown>) => m.id as string);
    if (!ids.length) return null;
    groqLive = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

/** The configured Groq models, with any Groq has retired (gone from its
 *  model list) or refused (retired or no longer free, see callGroq)
 *  swapped for other live chat models the account can use, so the race
 *  keeps the same number of tries. */
async function groqModels(apiKey: string, wanted: string[]): Promise<string[]> {
  const live = await liveGroqModels(apiKey);
  const usable = (m: string) => !isBlocked(m) && (!live || live.includes(m));
  const kept = wanted.filter(usable);
  const retired = wanted.filter((m) => !usable(m));
  if (!retired.length) return wanted;
  if (!live) return kept;
  const family = (id: string) => {
    const i = FAMILY_ORDER.findIndex((re) => re.test(id));
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  const standIns = live
    .filter((id) => !kept.includes(id) && !NOT_CHAT.test(id) && !isBlocked(id))
    .sort((a, b) => family(a) - family(b))
    .slice(0, retired.length);
  console.warn(
    `ai-generate-schedule: ${RETIRED_TAG}: groq ${retired.join(", ")}; using ${standIns.join(", ") || "nothing"} instead`,
  );
  // Refused models were alerted when refused; only newly missing ones here.
  retired.forEach((m, i) => { if (!isBlocked(m)) alertRetiredGroq(m, standIns[i]); });
  return [...kept, ...standIns];
}

class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Provider = { name: string; run: (signal: AbortSignal) => Promise<string> };

/** Per-call tuning. Wynky's chat thinks harder and may take longer than a
 *  one-shot plan polish. */
type GenOpts = { budgetMs?: number; hedgeMs?: number; effort?: "low" | "medium"; maxTokens?: number };
// A check result starting with this is a usable-but-imperfect answer (e.g.
// a day a little short of the agreed hours): the race goes on for a better
// one, but if none comes the best of these is used instead of an error.
const SOFT = "soft:";

/** Races the Gemini model and — only if GROQ_API_KEY is set — several
 *  Groq models (GROQ_MODELS, comma-separated, or the defaults above). Each
 *  one starts when the one before it fails or is slow (HEDGE_AFTER_MS); the
 *  first answer that passes `check` wins and the rest are cancelled. An
 *  answer that fails `check` counts as that model failing, so the race
 *  goes on instead of the student getting an error. */
async function generate(
  userPrompt: string,
  apiKey: string,
  model: string,
  systemPrompt = SYSTEM_PROMPT,
  check: (text: string) => string | null = () => null,
  opts: GenOpts = {},
): Promise<string> {
  const budgetMs = opts.budgetMs ?? TOTAL_BUDGET_MS;
  const hedgeMs = opts.hedgeMs ?? HEDGE_AFTER_MS;
  const effort = opts.effort ?? "low";
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const configured = (Deno.env.get("GROQ_MODELS") ?? Deno.env.get("GROQ_MODEL") ?? "")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const wanted = configured.length ? configured : DEFAULT_GROQ_MODELS;
  // Checked while Gemini runs; the first Groq try starts after the hedge.
  const groqList = groqKey ? groqModels(groqKey, wanted) : Promise.resolve([]);
  const providers: Provider[] = [
    { name: model, run: (sig) => callGemini(userPrompt, apiKey, model, systemPrompt, sig, effort) },
    ...(groqKey
      ? wanted.map((_, i) => ({
        name: `groq #${i + 1}`,
        run: async (sig: AbortSignal) => {
          const m = (await groqList)[i];
          if (!m) throw new Error("Groq API: no live model for this slot");
          return callGroq(userPrompt, groqKey, m, systemPrompt, sig, effort, opts.maxTokens);
        },
      }))
      : []),
  ];

  const stop = new AbortController();
  const budget = AbortSignal.timeout(budgetMs);
  const signal = AbortSignal.any([stop.signal, budget]);
  return await new Promise<string>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let lastErr: unknown = null;
    let soft: string | null = null;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedge);
      stop.abort();
      settle();
    };
    const launch = () => {
      clearTimeout(hedge);
      if (done || budget.aborted || next >= providers.length) return;
      const p = providers[next++];
      running++;
      p.run(signal).then((text) => {
        const bad = check(text);
        if (bad?.startsWith(SOFT)) soft = text;
        if (bad) throw new Error(`unusable answer: ${bad}`);
        return text;
      }).then(
        (text) => finish(() => resolve(text)),
        (e) => {
          running--;
          if (done) return;
          lastErr = e;
          console.warn(`ai-generate-schedule: ${p.name} failed (${e instanceof Error ? e.message.slice(0, 120) : e})`);
          if (next < providers.length && !budget.aborted) launch();
          else if (running === 0) {
            const best = soft;
            finish(() => (best ? resolve(best) : reject(lastErr instanceof Error ? lastErr : new Error("Gemini failed"))));
          }
        },
      );
      if (next < providers.length) hedge = setTimeout(launch, hedgeMs);
    };
    launch();
  });
}

/** A different provider (OpenAI-compatible chat API), used only when
 *  GROQ_API_KEY is set. Free tier at console.groq.com. Groq retires models
 *  now and then (llama-3.3-70b-versatile went on 2026-08-16); see
 *  groqModels() for how a retired one is replaced. */
async function callGroq(
  userPrompt: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  signal: AbortSignal,
  effort: "low" | "medium" = "low",
  maxTokens = 4096,
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      // Groq's free tier allows 8,000 tokens a minute per model; a week's
      // plan is well under 4096, and a smaller cap keeps each request
      // inside that allowance.
      max_tokens: maxTokens,
      // gpt-oss and Qwen 3.8 reason at "medium" by default, which is most
      // of their wait. Wynky's chat asks gpt-oss for "medium"; Qwen stays
      // at "low", the setting it has been run with.
      ...(model.startsWith("openai/gpt-oss") || model.startsWith("qwen/") ? { reasoning_effort: model.startsWith("qwen/") ? "low" : effort } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    // Retired, or taken off the free tier (Groq answers 402/403 or names
    // billing or the plan): stop using it and let groqModels() pick a free,
    // live stand-in from the next request on. A 429 is only the per-minute
    // limit and passes.
    const retired = res.status === 404 || /model_not_found|decommissioned|does not exist/i.test(errText);
    const paid = res.status === 402 || res.status === 403 || /\b(billing|upgrade|paid|plan|permission)\b/i.test(errText);
    if (res.status !== 429 && res.status < 500 && (retired || paid)) {
      groqBlocked.set(model, Date.now() + BLOCK_MS);
      groqLive = null; // re-check Groq's list on the next request
      console.warn(`ai-generate-schedule: ${RETIRED_TAG}: groq ${model} (${retired ? "retired" : "not free"})`);
      alertRetiredGroq(model, undefined, retired ? "retired" : "paid");
    }
    throw new Error(`Groq API ${res.status} (${model}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty response from Groq");
  return text;
}

async function callGemini(
  userPrompt: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  signal: AbortSignal,
  effort: "low" | "medium" = "low",
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        // Gemini 3.x models (including gemini-3.5-flash) are tuned for
        // their default sampling params — overriding temperature/top_p/
        // top_k is no longer recommended and can hurt output quality.
        //
        // 2048 was too tight: a realistic 7-day schedule with multiple
        // subjects/day plus breaks and a sleep slot commonly needs 15-20+
        // slot objects, which routinely got cut off mid-generation —
        // the truncated JSON (unclosed brackets) then failed to parse
        // with the opaque "Unexpected end of JSON input", which is what
        // was surfacing directly in the UI. Raised with real headroom.
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        // Plans don't need deep reasoning, and thinking is most of the
        // wait. Gemini 3 models take thinkingLevel; older ones would
        // reject it, so it's only sent to them.
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: effort } } : {}),
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      console.warn(`ai-generate-schedule: ${RETIRED_TAG}: gemini ${model}`);
      alertOwner(
        `ai-retired:gemini:${model}`,
        `Google retired the Gemini model ${model}`,
        "Wynky is answering with Groq only until this is fixed. Set the GEMINI_MODEL secret in Supabase (or the default in ai-generate-schedule) to a current Gemini model.",
      );
    }
    throw new GeminiError(res.status, `Gemini API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

function extractJson(text: string): unknown {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  if (cleaned.startsWith("{")) {
    const end = cleaned.lastIndexOf("}");
    if (end >= 0) cleaned = cleaned.slice(0, end + 1);
  }
  return JSON.parse(cleaned);
}

function validateSchedule(sched: Record<string, unknown>): string | null {
  if (!sched.name || typeof sched.name !== "string")
    return "Missing schedule name";
  if (
    !Array.isArray(sched.days_of_week) || sched.days_of_week.length === 0
  ) return "No days selected";
  for (const d of sched.days_of_week) {
    if (typeof d !== "number" || d < 0 || d > 6)
      return `Invalid day: ${d}`;
  }
  if (!Array.isArray(sched.slots) || sched.slots.length < 2)
    return "Need at least 2 slots";
  for (const slot of sched.slots) {
    if (typeof slot.start_time !== "string" || !/^\d{2}:\d{2}$/.test(slot.start_time))
      return `Bad start_time: ${slot.start_time}`;
    if (typeof slot.end_time !== "string" || !/^\d{2}:\d{2}$/.test(slot.end_time))
      return `Bad end_time: ${slot.end_time}`;
    // NOTE: schedule-tick (the cron that actually fires these slots) and
    // the schedule builder's own save-time check both compare "HH:MM"
    // strings lexicographically and never handle a slot wrapping past
    // midnight, so end_time must stay strictly after start_time for every
    // slot, sleep included. Since the AI naturally reaches for realistic
    // overnight sleep like "23:00"-"07:00", that constraint has to be
    // spelled out for it in SYSTEM_PROMPT (see below) rather than enforced
    // only here — otherwise valid-looking schedules get rejected.
    if (slot.end_time <= slot.start_time)
      return `end_time must be after start_time: ${slot.start_time}-${slot.end_time}`;
    if (!slot.is_sleep && !slot.subject)
      return "Non-sleep slot needs a subject";
    if (!slot.is_sleep && !slot.preset_name)
      return "Non-sleep slot needs a preset_name";
  }
  return null;
}

const HHMM = /^\d{2}:\d{2}$/;

/** Checks one day's slots (format, order, overlap, known subject). Shared
 *  by the single-day and weekly refine answers. */
function slotsError(slots: unknown, subjects: string[]): string | null {
  if (!Array.isArray(slots) || !slots.length) return "No study blocks";
  let prevEnd = "00:00";
  for (const slot of slots as Record<string, unknown>[]) {
    const { start_time, end_time, subject } = slot;
    if (typeof start_time !== "string" || !HHMM.test(start_time)) return `Bad start_time: ${start_time}`;
    if (typeof end_time !== "string" || !HHMM.test(end_time)) return `Bad end_time: ${end_time}`;
    if (end_time <= start_time) return `end_time must be after start_time: ${start_time}-${end_time}`;
    if (start_time < prevEnd) return `Overlapping or out-of-order block at ${start_time}`;
    if (typeof subject !== "string" || !subjects.includes(subject)) return `Unknown subject: ${subject}`;
    prevEnd = end_time;
  }
  return null;
}

/** Checks the refine answer's shape; Wynky checks the plan itself
 *  (busy times, wake/sleep, total) again before showing it. */
function validateRefined(out: Record<string, unknown>, subjects: string[]): string | null {
  return slotsError(out.slots, subjects);
}

/** Checks the refine_week answer's shape: exactly 7 days, 0-6 with no
 *  repeats, each day's own slots valid on their own terms. */
function validateRefinedWeek(out: Record<string, unknown>, subjects: string[]): string | null {
  if (!Array.isArray(out.days) || out.days.length !== 7) return "Need exactly 7 days";
  const seen = new Set<number>();
  for (const day of out.days as Record<string, unknown>[]) {
    if (typeof day.day !== "number" || day.day < 0 || day.day > 6) return `Invalid day: ${day.day}`;
    if (seen.has(day.day)) return `Duplicate day: ${day.day}`;
    seen.add(day.day);
    const err = slotsError(day.slots, subjects);
    if (err) return `Day ${day.day}: ${err}`;
  }
  return null;
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v: unknown, max = 10) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => str(x)) : []);

// ── Wynky chat ─────────────────────────────────────────────────────────

const RANGE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const numIn = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : undefined);
const dayName = (d: number) => (d >= 7 ? `Week B ${DAY_NAMES[d - 7]}` : DAY_NAMES[d]);

type ChatSlot = { start_time: string; end_time: string; subject: string };
type ChatDay = { day: number | "all"; slots: ChatSlot[] };

/** The settings Wynky and the student agreed, with anything malformed dropped. */
function cleanSettings(v: unknown): Record<string, unknown> {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
  const ranges = (x: unknown) => strList(x, 10).filter((r) => RANGE.test(r));
  const out: Record<string, unknown> = {
    daily_hours: numIn(o.daily_hours, 0.5, 16),
    session_minutes: numIn(o.session_minutes, 15, 240),
    break_minutes: numIn(o.break_minutes, 0, 60),
    wake: typeof o.wake === "string" && HHMM.test(o.wake) ? o.wake : undefined,
    sleep: typeof o.sleep === "string" && HHMM.test(o.sleep) ? o.sleep : undefined,
    busy: ranges(o.busy),
    study_windows: ranges(o.study_windows),
    week_shape: ["same", "vary", "ab"].includes(o.week_shape as string) ? o.week_shape : undefined,
    repeat: ["weekly", "every2", "ab"].includes(o.repeat as string) ? o.repeat : undefined,
    active_days: Array.isArray(o.active_days)
      ? [...new Set(o.active_days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : undefined,
    rules: strList(o.rules, 15).map((r) => r.slice(0, 200)),
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

/** The plan the student is looking at, one line per day, for the prompt. */
function planText(v: unknown): string {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
  const days = (Array.isArray(o.days) ? o.days : []).slice(0, 14) as Record<string, unknown>[];
  const lines = days.map((d) => {
    const slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 20) as Record<string, unknown>[];
    const label = d.day === "all" ? "Every active day" : Number.isInteger(d.day) ? dayName(d.day as number) : "?";
    return `${label}: ${slots.map((x) => `${str(x.start_time, 5)}-${str(x.end_time, 5)} ${str(x.subject, 60)}`).join("; ") || "day off"}`;
  });
  return lines.join("\n") || "none yet";
}

/** Checks the chat answer. A broken plan is an error (the race moves on);
 *  a plan that works but misses an agreed setting is "soft" (kept as a
 *  fallback while a better answer is awaited). */
function checkChat(out: Record<string, unknown>, subjects: string[]):
  { error: string | null; soft: string | null; value: Record<string, unknown> } {
  const fail = (error: string) => ({ error, soft: null, value: {} });
  const reply = str(out.reply, 600).trim();
  if (!reply) return fail("no reply");
  const settings = cleanSettings(out.settings);
  const bySubject = new Map(subjects.map((x) => [x.toLowerCase(), x]));
  const days: ChatDay[] = [];
  const seen = new Set<string>();
  for (const raw of (Array.isArray(out.days) ? out.days : []).slice(0, 14) as Record<string, unknown>[]) {
    const day = raw?.day === "all" ? "all" : Number.isInteger(raw?.day) && (raw.day as number) >= 0 && (raw.day as number) <= 13 ? raw.day as number : null;
    if (day === null) return fail(`Invalid day: ${raw?.day}`);
    if (seen.has(String(day))) return fail(`Duplicate day: ${day}`);
    seen.add(String(day));
    const slots: ChatSlot[] = [];
    for (const x of (Array.isArray(raw.slots) ? raw.slots : []) as unknown[]) {
      const [a, b, c] = Array.isArray(x) ? x : [(x as Record<string, unknown>)?.start_time, (x as Record<string, unknown>)?.end_time, (x as Record<string, unknown>)?.subject];
      const subject = typeof c === "string" ? bySubject.get(c.trim().toLowerCase()) : undefined;
      slots.push({ start_time: String(a), end_time: String(b), subject: subject ?? String(c) });
    }
    // An active day needs sessions; an empty list means that day is off.
    if (slots.length) {
      const err = slotsError(slots, subjects);
      if (err) return fail(`${day === "all" ? "Plan" : dayName(day)}: ${err}`);
    }
    days.push({ day, slots });
  }
  if (seen.has("all") && days.length > 1) return fail("Mixed 'all' with single days");

  let soft: string | null = null;
  const target = typeof settings.daily_hours === "number" ? Math.round(settings.daily_hours * 60) : 0;
  const busy = (settings.busy as string[]) || [];
  for (const d of days) {
    if (!d.slots.length) continue;
    const label = d.day === "all" ? "each day" : dayName(d.day);
    const total = d.slots.reduce((n, x) => n + minOf(x.end_time) - minOf(x.start_time), 0);
    if (target && Math.abs(total - target) > Math.max(20, target * 0.1)) {
      soft ??= `${label} has ${total} min of study, agreed ${target}`;
    }
    for (const r of busy) {
      const [bs, be] = r.split("-").map(minOf);
      const end = be <= bs ? 1440 : be;
      if (d.slots.some((x) => minOf(x.start_time) < end && minOf(x.end_time) > bs)) soft ??= `${label} has study during busy ${r}`;
    }
  }
  return {
    error: null,
    soft,
    value: { reply, settings, days, remember: strList(out.remember, 8).map((r) => r.slice(0, 200)), forget: strList(out.forget, 8).map((r) => r.slice(0, 200)) },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const { mode, goal_text, presets, subjects } = body;
    if (!mode) return json({ error: "mode is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Invalid auth token" }, 401);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash";

    if (mode === "chat") {
      const subjectNames = strList(subjects, 20);
      if (!subjectNames.length) return json({ error: "subjects are required" }, 400);
      const message = str(body.message, 1500).trim();
      if (!message) return json({ error: "message is required" }, 400);
      const chat = (Array.isArray(body.history) ? body.history : []).slice(-16)
        .filter((m: Record<string, unknown>) => m && (m.sender === "user" || m.sender === "bot") && typeof m.text === "string")
        .map((m: Record<string, unknown>) =>
          `${m.sender === "user" ? "Student" : "Wynky"}: ${str(m.text, m.sender === "user" ? 500 : 700).replace(/\s*\n\s*/g, " / ")}`);
      const learned = [...strList(body.facts, 12), ...strList(body.learned, 12)];
      const remembered = strList(body.standing_requests, 40);
      const prompt = `SUBJECTS: ${subjectNames.join(", ")}
WEAK SUBJECTS (least studied lately): ${strList(body.weak, 20).join(", ") || "none known"}
TODAY: ${str(body.today, 12) || "unknown"}

SETTINGS: ${JSON.stringify(cleanSettings(body.settings))}

CURRENT PLAN:
${planText(body.plan)}

WHAT WYNKY HAS LEARNED:
${learned.map((f) => `- ${f}`).join("\n") || "- nothing yet"}
REMEMBERED FROM EARLIER CHATS: ${remembered.length ? remembered.map((r) => `"${r}"`).join("; ") : "nothing"}

RECENT CHAT (oldest first; "Wynky" is you):
${chat.join("\n") || "none"}

STUDENT'S MESSAGE NOW: ${message}`;
      const rawText = await generate(prompt, apiKey, model, CHAT_PROMPT, (text) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = extractJson(text) as Record<string, unknown>;
        } catch {
          return "not JSON";
        }
        const r = checkChat(parsed, subjectNames);
        return r.error ?? (r.soft ? `${SOFT} ${r.soft}` : null);
      }, { budgetMs: CHAT_BUDGET_MS, hedgeMs: CHAT_HEDGE_MS, effort: "medium", maxTokens: 3000 });
      let out: Record<string, unknown>;
      try {
        out = extractJson(rawText) as Record<string, unknown>;
      } catch {
        console.error("ai-generate-schedule: chat output not JSON:", rawText.slice(0, 300));
        return json({ error: "The AI's answer was cut off." }, 500);
      }
      const r = checkChat(out, subjectNames);
      if (r.error) return json({ error: `AI returned an invalid plan: ${r.error}` }, 500);
      if (r.soft) console.warn(`ai-generate-schedule: chat answer used with a miss (${r.soft})`);
      return json({ success: true, mode: "chat", ...r.value, miss: r.soft });
    }

    if (mode === "refine" || mode === "refine_week") {
      const subjectNames = strList(subjects, 20);
      if (!subjectNames.length) return json({ error: "subjects are required" }, 400);
      const draft = (Array.isArray(body.draft) ? body.draft : []).slice(0, 30)
        .map((b: Record<string, unknown>) => `${str(b.start_time, 5)}-${str(b.end_time, 5)} ${str(b.subject, 60)}`);
      const busy = (Array.isArray(body.busy) ? body.busy : []).slice(0, 6)
        .map((b: Record<string, unknown>) => `${str(b.start, 5)}-${str(b.end, 5)}`);
      const requestNow = str(body.request_now);
      const standing = strList(body.standing_requests, 5);
      const chat = (Array.isArray(body.history) ? body.history : []).slice(-12)
        .filter((m: Record<string, unknown>) => m && (m.sender === "user" || m.sender === "bot") && typeof m.text === "string")
        .map((m: Record<string, unknown>) =>
          `${m.sender === "user" ? "Student" : "Wynky"}: ${str(m.text, m.sender === "user" ? 300 : 1500).replace(/\s*\n\s*/g, " / ")}`);
      const prompt = `RECENT CHAT (oldest first; "Wynky" is you):
${chat.join("\n") || "none"}

STUDENT'S REQUEST NOW: ${requestNow || "none"}
STANDING REQUESTS: ${standing.length ? standing.map((r) => `"${r}"`).join("; ") : "none"}

SUBJECTS: ${subjectNames.join(", ")}
WEAK SUBJECTS (least studied lately): ${strList(body.weak, 20).join(", ") || "none known"}
WAKE: ${str(body.wake, 5)}   SLEEP: ${str(body.sleep, 5)}
BUSY: ${busy.join(", ") || "nothing fixed"}
TARGET STUDY MINUTES: ${Number(body.target_minutes) || 0}
BLOCK LENGTH: ${Number(body.block_minutes) || 60} minutes
ABOUT THE STUDENT: ${strList(body.facts, 12).join("; ") || "nothing more known"}

DRAFT:
${draft.join("\n")}`;
      const isWeek = mode === "refine_week";
      const rawText = await generate(prompt, apiKey, model, isWeek ? REFINE_WEEK_PROMPT : REFINE_PROMPT, (text) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = extractJson(text) as Record<string, unknown>;
        } catch {
          return "not JSON";
        }
        return isWeek ? validateRefinedWeek(parsed, subjectNames) : validateRefined(parsed, subjectNames);
      });
      let out: Record<string, unknown>;
      try {
        out = extractJson(rawText) as Record<string, unknown>;
      } catch {
        console.error(`ai-generate-schedule: ${mode} output not JSON:`, rawText.slice(0, 300));
        return json({ error: "The AI's answer was cut off." }, 500);
      }
      if (isWeek) {
        const err = validateRefinedWeek(out, subjectNames);
        if (err) return json({ error: `AI returned an invalid week: ${err}` }, 500);
        return json({ success: true, mode: "refine_week", days: out.days, note: str(out.note, 160) });
      }
      const err = validateRefined(out, subjectNames);
      if (err) return json({ error: `AI returned an invalid plan: ${err}` }, 500);
      return json({ success: true, mode: "refine", slots: out.slots, note: str(out.note, 160) });
    }

    let userPrompt: string;
    const presetList = (presets || []).map(
      (p: { name: string }) => p.name,
    );
    const subjectList = subjects || [];

    if (mode === "stats") {
      // Fetch user's study data for AI analysis
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("subject, started_at, total_seconds, accumulated_paused_seconds")
        .eq("user_id", user.id)
        .gte("started_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("started_at", { ascending: false })
        .limit(200);

      // user_profiles' primary key / FK-to-auth.users column is "id", not
      // "user_id" (every other query in this app uses .eq('id', ...) for
      // this table - schedule-tick.ts, tracker-sync.js, groups.page.js,
      // etc.). This was filtering on a column that doesn't match any row,
      // so `profile` was always null/undefined here.
      //
      // Also "exam_date" isn't a real column (confirmed against the live
      // schema) - onboarding.html/tracker-sync.js write the student's
      // target date to "end_date", with "exam" holding just the exam name
      // (e.g. "JEE"). Selecting exam_date silently returned no such field,
      // so profile.exam_date was always undefined too - the AI never once
      // saw the student's real exam date in "smart schedule" mode.
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("subjects, exam, end_date")
        .eq("id", user.id)
        .maybeSingle();

      // Build study analytics summary
      const subjectStats: Record<
        string,
        { total_seconds: number; session_count: number; avg_hour: number[] }
      > = {};
      for (const s of sessions || []) {
        const subj = s.subject || "General";
        if (!subjectStats[subj]) {
          subjectStats[subj] = {
            total_seconds: 0,
            session_count: 0,
            avg_hour: [],
          };
        }
        subjectStats[subj].total_seconds += s.total_seconds || 0;
        subjectStats[subj].session_count++;
        if (s.started_at) {
          subjectStats[subj].avg_hour.push(
            new Date(s.started_at).getHours(),
          );
        }
      }

      const subjectSummary = Object.entries(subjectStats).map(
        ([subj, stats]) => {
          const hours = Math.round(stats.total_seconds / 3600 * 10) / 10;
          const avgHr = stats.avg_hour.length
            ? Math.round(
              stats.avg_hour.reduce((a: number, b: number) => a + b, 0) /
                stats.avg_hour.length,
            )
            : null;
          return `${subj}: ${hours}h total, ${stats.session_count} sessions${
            avgHr !== null ? `, avg start hour: ${avgHr}:00` : ""
          }`;
        },
      );

      const totalStudyHours = Math.round(
        (sessions || []).reduce(
          (sum: number, s: { total_seconds?: number }) =>
            sum + (s.total_seconds || 0),
          0,
        ) / 3600 * 10,
      ) / 10;

      // Find weakest subjects (least time) and strongest (most time)
      const sorted = Object.entries(subjectStats).sort(
        (a, b) => a[1].total_seconds - b[1].total_seconds,
      );
      const weakest = sorted.slice(0, 3).map(([s]) => s);
      const strongest = sorted.slice(-3).reverse().map(([s]) => s);

      userPrompt =
        `Generate an optimized study schedule based on this student's data:

STUDY DATA (last 30 days):
- Total study time: ${totalStudyHours} hours across ${(sessions || []).length} sessions
- Per subject: ${subjectSummary.join("\n  ")}
- Weakest areas (least study time): ${weakest.join(", ") || "N/A"}
- Strongest areas (most study time): ${strongest.join(", ") || "N/A"}

STUDENT PROFILE:
- Subjects: ${(profile?.subjects || subjectList || []).join(", ")}
- Exam: ${profile?.exam || "not specified"}
- Exam date: ${profile?.end_date || "not specified"}

AVAILABLE BLOCK PRESETS: ${presetList.join(", ") || "none specified"}

REQUIREMENTS:
- Give MORE time to weaker subjects
- Schedule study sessions around the student's natural peak hours
- Include adequate breaks
- Be realistic — don't schedule 12 hours if they currently average 3
- Create a schedule name that motivates`;
    } else {
      // Text goals mode
      userPrompt =
        `Generate a study schedule based on this student's goals:

GOALS: ${goal_text || "Not provided"}

AVAILABLE BLOCK PRESETS: ${presetList.join(", ") || "none specified"}
SUBJECTS: ${subjectList.join(", ") || "none specified"}

Create a balanced, realistic schedule that addresses these goals.`;
    }

    const rawText = await generate(userPrompt, apiKey, model, SYSTEM_PROMPT, (text) => {
      try {
        return validateSchedule(extractJson(text) as Record<string, unknown>);
      } catch {
        return "not JSON";
      }
    });

    let schedule: unknown;
    try {
      schedule = extractJson(rawText);
    } catch (parseErr) {
      // Log the raw text (truncated) server-side so a recurrence is
      // actually debuggable — the client only ever sees the friendly
      // message below, never the raw parser error.
      console.error(
        "ai-generate-schedule: failed to parse Gemini output.",
        "Raw text (first 500 chars):",
        rawText.slice(0, 500),
        "Parse error:",
        parseErr instanceof Error ? parseErr.message : parseErr,
      );
      return json({
        error:
          "The AI's response got cut off before it finished. Try describing fewer days or subjects, or just try again.",
      }, 500);
    }

    const err = validateSchedule(
      schedule as Record<string, unknown>,
    );
    if (err) return json({ error: `AI returned invalid schedule: ${err}` }, 500);

    return json({ success: true, schedule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-generate-schedule error:", msg);
    // Gemini's own error body (raw JSON, sometimes long) must never reach
    // the student directly — only a plain sentence they can act on.
    const bothProvidersDown = e instanceof Error && /^(Groq API|Empty response from Groq)/.test(e.message);
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    const unusable = e instanceof Error && e.message.startsWith("unusable answer");
    const friendly = (e instanceof GeminiError && RETRYABLE.has(e.status)) || bothProvidersDown || timedOut
      ? "Gemini is busy right now. Please try again in a moment."
      : e instanceof GeminiError || unusable
      ? "The AI couldn't answer that request."
      : msg;
    return json({ error: friendly }, 500);
  }
});
