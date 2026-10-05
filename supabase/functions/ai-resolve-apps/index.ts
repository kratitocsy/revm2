// ===== ai-resolve-apps =====
// Maps friendly app names a block was saved with ("Instagram", "VS Code",
// "Steam") onto the real process names running on THIS computer
// ("Code.exe", "steam.exe"), so the desktop app can close them.
//
// The model only ever chooses from the `device_apps` list the client sent
// (the Tauri list_running_apps result). Anything it returns that isn't in
// that list is dropped, so a hallucinated process name can never reach the
// kill list. Names with no confident match are simply left out.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const SYSTEM_PROMPT = `You match app names a student typed to process names running on their Windows computer.
Input: "names" (what the student called the apps) and "device_apps" (real process names, e.g. "Code.exe").
Output ONLY JSON: {"matches":{"<name>":["<process name from device_apps>", ...]}}
Rules:
- Use process names copied exactly from device_apps. Never invent one.
- A name may map to several processes (an app with helper processes).
- If nothing in device_apps is clearly that app, leave the name out. Websites such as Instagram or YouTube
  have no process of their own; do not map them to a browser.
- Never map to system, shell, or security processes.`;

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, max)
    : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const names = strList(body.names, 20);
    const deviceApps = strList(body.device_apps, 300);
    if (!names.length || !deviceApps.length) return json({ matches: {} });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Invalid auth token" }, 401);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: JSON.stringify({ names, device_apps: deviceApps }) }] }],
          generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) return json({ error: `AI error ${res.status}` }, 502);
    const text: string = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let raw: Record<string, unknown> = {};
    try {
      raw = (JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim())?.matches ?? {}) as Record<string, unknown>;
    } catch {
      return json({ matches: {} });
    }

    // Only names the client asked about, only processes it actually listed.
    const deviceByLower = new Map(deviceApps.map((a) => [a.toLowerCase(), a]));
    const matches: Record<string, string[]> = {};
    for (const name of names) {
      const picked = strList(raw[name], 10)
        .map((p) => deviceByLower.get(p.toLowerCase()))
        .filter((p): p is string => !!p);
      if (picked.length) matches[name] = [...new Set(picked)];
    }
    return json({ matches });
  } catch (e) {
    console.error("ai-resolve-apps:", e instanceof Error ? e.message : e);
    return json({ error: "Could not resolve apps" }, 500);
  }
});
