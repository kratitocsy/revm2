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
1. STUDENT'S REQUEST NOW (if given).
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

Return ONLY raw JSON, no markdown:
{"slots":[{"start_time":"HH:MM","end_time":"HH:MM","subject":"one of SUBJECTS, copied exactly"}],"note":"one short friendly sentence (max 120 chars) saying what you changed and why, or empty"}

Rules for slots: study blocks only (no sleep, no breaks), 24-hour HH:MM, end_time later than start_time
on the same day, chronological, no overlaps, subject copied exactly from SUBJECTS.`;

const REFINE_WEEK_PROMPT = `You are Wynky, a study planner for Indian exam students (JEE, NEET, boards and others).
You get a DRAFT plan for one day (its block times and lengths) and return a full WEEK of plans, one for
each day 0-6 (0=Sun 1=Mon ... 6=Sat), that rotates subjects across the week instead of repeating the
same subjects every day.

Priority, highest first — a higher item always wins over a lower one:
1. STUDENT'S REQUEST NOW (if given).
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

Return ONLY raw JSON, no markdown:
{"days":[{"day":0,"slots":[{"start_time":"HH:MM","end_time":"HH:MM","subject":"one of SUBJECTS, copied exactly"}]}],"note":"one short friendly sentence (max 120 chars), or empty"}

"days" must have exactly 7 entries, one per day number 0-6 with no repeats, each with at least one slot.
Rules for each day's slots: study blocks only (no sleep, no breaks), 24-hour HH:MM, end_time later than
start_time on the same day, chronological, no overlaps, subject copied exactly from SUBJECTS.`;

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
// Checked 2026-09-29: qwen/qwen3-32b shut down 2026-07-17 and
// qwen/qwen3.6-27b 2026-09-14. Groq marks Qwen models "preview", so they
// can go at short notice. groqModels() swaps a retired one for another
// live model on its own, and logs RETIRED_TAG so the daily check can tell
// the Founder which name to update here.
const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const RETIRED_TAG = "AI MODEL RETIRED";
// Groq's /models list also has speech, safety and tool-router models that
// can't write a plan; never pick those as a stand-in.
const NOT_CHAT = /whisper|tts|guard|playai|orpheus|distil|compound|allam|vision/i;
// Stand-ins are picked in this order of family, then Groq's own order.
const FAMILY_ORDER = [/gpt-oss/, /qwen/, /llama/, /kimi/];

let groqLive: { at: number; ids: string[] } | null = null;

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

/** The configured Groq models, with any Groq has retired swapped for other
 *  live chat models so the race keeps the same number of tries. */
async function groqModels(apiKey: string, wanted: string[]): Promise<string[]> {
  const live = await liveGroqModels(apiKey);
  if (!live) return wanted;
  const kept = wanted.filter((m) => live.includes(m));
  const retired = wanted.filter((m) => !live.includes(m));
  if (!retired.length) return wanted;
  const family = (id: string) => {
    const i = FAMILY_ORDER.findIndex((re) => re.test(id));
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  const standIns = live
    .filter((id) => !kept.includes(id) && !NOT_CHAT.test(id))
    .sort((a, b) => family(a) - family(b))
    .slice(0, retired.length);
  console.warn(
    `ai-generate-schedule: ${RETIRED_TAG}: groq ${retired.join(", ")}; using ${standIns.join(", ") || "nothing"} instead`,
  );
  return [...kept, ...standIns];
}

class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Provider = { name: string; run: (signal: AbortSignal) => Promise<string> };

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
): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const configured = (Deno.env.get("GROQ_MODELS") ?? Deno.env.get("GROQ_MODEL") ?? "")
    .split(",").map((m) => m.trim()).filter(Boolean);
  const wanted = configured.length ? configured : DEFAULT_GROQ_MODELS;
  // Checked while Gemini runs; the first Groq try starts after the hedge.
  const groqList = groqKey ? groqModels(groqKey, wanted) : Promise.resolve([]);
  const providers: Provider[] = [
    { name: model, run: (sig) => callGemini(userPrompt, apiKey, model, systemPrompt, sig) },
    ...(groqKey
      ? wanted.map((_, i) => ({
        name: `groq #${i + 1}`,
        run: async (sig: AbortSignal) => {
          const m = (await groqList)[i];
          if (!m) throw new Error("Groq API: no live model for this slot");
          return callGroq(userPrompt, groqKey, m, systemPrompt, sig);
        },
      }))
      : []),
  ];

  const stop = new AbortController();
  const budget = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const signal = AbortSignal.any([stop.signal, budget]);
  return await new Promise<string>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let lastErr: unknown = null;
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
          else if (running === 0) finish(() => reject(lastErr instanceof Error ? lastErr : new Error("Gemini failed")));
        },
      );
      if (next < providers.length) hedge = setTimeout(launch, HEDGE_AFTER_MS);
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
      max_tokens: 4096,
      // gpt-oss and Qwen 3.8 reason at "medium" by default, which is most
      // of their wait.
      ...(model.startsWith("openai/gpt-oss") || model.startsWith("qwen/") ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404 || /model_not_found|decommissioned/.test(errText)) {
      groqLive = null; // re-check Groq's list on the next request
      console.warn(`ai-generate-schedule: ${RETIRED_TAG}: groq ${model}`);
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
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
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
    if (res.status === 404) console.warn(`ai-generate-schedule: ${RETIRED_TAG}: gemini ${model}`);
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

    if (mode === "refine" || mode === "refine_week") {
      const subjectNames = strList(subjects, 20);
      if (!subjectNames.length) return json({ error: "subjects are required" }, 400);
      const draft = (Array.isArray(body.draft) ? body.draft : []).slice(0, 30)
        .map((b: Record<string, unknown>) => `${str(b.start_time, 5)}-${str(b.end_time, 5)} ${str(b.subject, 60)}`);
      const busy = (Array.isArray(body.busy) ? body.busy : []).slice(0, 6)
        .map((b: Record<string, unknown>) => `${str(b.start, 5)}-${str(b.end, 5)}`);
      const requestNow = str(body.request_now);
      const standing = strList(body.standing_requests, 5);
      const prompt = `STUDENT'S REQUEST NOW: ${requestNow || "none"}
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
