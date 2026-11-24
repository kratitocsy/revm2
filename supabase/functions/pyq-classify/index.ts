// ===== pyq-classify =====
// Used by the Eduniti PDF importer (EdunitiPyqs page). After the browser
// cuts a PDF into question pictures, a few questions have a key answer of
// 1-4 that could be either an option number or a numerical answer. The
// browser sends just those pictures here; Gemini looks at each and says
// whether it shows options (1)-(4) / (a)-(d) or asks for a number.
//
// Signed-in users only. The key stays server-side:
//   PYQ_GEMINI_API_KEY (falls back to GEMINI_API_KEY)
//   PYQ_GEMINI_MODEL   (default gemini-3.5-flash-lite: cheapest, fast, reads images)
//
// Request:  { images: [{ id: number, mime: "image/webp" | "image/jpeg" | "image/png", data: "<base64>" }] }
// Response: { results: { [id]: "mcq" | "num" } }   ids Gemini couldn't read are left out.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_IMAGES = 80;
const MAX_IMAGE_BYTES = 600_000;
const BATCH = 10;
const MIMES = new Set(["image/webp", "image/jpeg", "image/png"]);

const PROMPT = `Each image is one question cut from a JEE physics paper. Images are given in order, each preceded by its id.
For every image decide:
- "mcq" if the question lists answer options to choose from, labelled (1) (2) (3) (4) or (A)/(a) (B) (C) (D), including options that are graphs or figures.
- "num" if there are no options and the student must write a number (often ends with a blank like ____ or asks "the value of x is").
Answer with JSON only: {"results":[{"id":<id>,"kind":"mcq"|"num"}]} covering every id.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

type Img = { id: number; mime: string; data: string };

async function classifyBatch(apiKey: string, model: string, batch: Img[]): Promise<Record<number, "mcq" | "num">> {
  const parts: unknown[] = [{ text: PROMPT }];
  for (const im of batch) {
    parts.push({ text: `id ${im.id}:` });
    parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const out: Record<number, "mcq" | "num"> = {};
  const wanted = new Set(batch.map(b => b.id));
  for (const r of parsed?.results ?? []) {
    const id = Number(r?.id);
    if (wanted.has(id) && (r?.kind === "mcq" || r?.kind === "num")) out[id] = r.kind;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Invalid auth token" }, 401);

    const apiKey = Deno.env.get("PYQ_GEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI checking is not set up" }, 503);
    const model = (Deno.env.get("PYQ_GEMINI_MODEL") || "gemini-3.5-flash-lite").trim();

    const body = await req.json().catch(() => null);
    const raw: unknown[] = Array.isArray(body?.images) ? body.images : [];
    if (raw.length === 0) return json({ results: {} });
    if (raw.length > MAX_IMAGES) return json({ error: `At most ${MAX_IMAGES} pictures at a time` }, 413);
    const images: Img[] = [];
    for (const r of raw as Img[]) {
      if (!Number.isInteger(r?.id) || typeof r?.data !== "string" || !MIMES.has(r?.mime)) return json({ error: "Bad picture" }, 400);
      if (r.data.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "Picture too large" }, 413);
      images.push(r);
    }

    const batches: Img[][] = [];
    for (let i = 0; i < images.length; i += BATCH) batches.push(images.slice(i, i + BATCH));
    const settled = await Promise.allSettled(batches.map(b => classifyBatch(apiKey, model, b)));
    const results: Record<number, "mcq" | "num"> = {};
    let failed = 0;
    for (const s of settled) {
      if (s.status === "fulfilled") Object.assign(results, s.value);
      else { failed++; console.error("pyq-classify:", s.reason instanceof Error ? s.reason.message : s.reason); }
    }
    if (failed === batches.length) return json({ error: "AI checking failed, try again later" }, 502);
    return json({ results });
  } catch (e) {
    console.error("pyq-classify:", e instanceof Error ? e.message : e);
    return json({ error: "Something went wrong" }, 500);
  }
});
