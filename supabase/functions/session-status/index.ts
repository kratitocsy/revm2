// ===== Bundled for Supabase Dashboard deploy: session-status =====
// Inlined from _shared/auth.ts (same token-resolution pattern as
// session-pause / session-end-early / emergency-unlock-webhook).
//
// GET /functions/v1/session-status
// Polled by TWO consumers, both depending on the exact shape of the
// `session` field below (unchanged from before this file's `study`
// addition):
//   - the browser extension's background.js SYNC_ALARM (~every 1 min) -
//     needs session.sites/mode/youtubeRules to enforce allow/block lists,
//     not just whether a session is active. See the "FIX" note further
//     down for why every one of those fields has to stay present.
//   - the Tauri desktop app's main.js poll() (~every 30s) - only reads
//     session.active/blockName/durationMinutes/unlimited, but must not
//     break if the other fields are there too.
// `session` is `null` when nothing's active - NOT `{active:false}` -
// because that's what background.js already checks for.
//
// `study` is new: study_sessions status (what's actually being studied
// right now, and how long today), additive and independent of `session`.
// Only the desktop app reads this today. Read-only from every consumer's
// point of view - nobody using this endpoint starts/stops study_sessions
// through it.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  return _admin;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ResolvedAuth = { userId: string; admin: SupabaseClient };

// Returns null if the token is missing/unknown - callers should
// respond 401 in that case. Never throws.
async function resolveUser(req: Request): Promise<ResolvedAuth | null> {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const hash = await sha256Hex(token);
  const db = admin();
  const { data, error } = await db
    .from("extension_sync_tokens")
    .select("user_id")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return null;

  // fire-and-forget last_seen_at bump - never block the response on this
  db.from("extension_sync_tokens")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .then(() => {}, () => {});

  return { userId: data.user_id, admin: db };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function unauthorized(): Response {
  return json({ error: "invalid_or_missing_token" }, 401);
}

// ===== session-status/index.ts body =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  // 1. Enforcement (focus_lock_sessions) - unchanged from the
  // previously-deployed version. Every field here (sites, mode,
  // youtubeRules, startedAt) is load-bearing for the extension's
  // background.js, not just decorative - see this function's header
  // comment for why dropping any of them would silently break
  // allow-list sessions there.
  const { data: session, error: sessionErr } = await auth.admin
    .from("focus_lock_sessions")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (sessionErr) return json({ error: sessionErr.message }, 500);

  const durationMinutes = session?.ends_at
    ? Math.max(0, Math.round((new Date(session.ends_at).getTime() - Date.now()) / 60000))
    : null;

  // 2. Study session (study_sessions) - new. Same "at most one open row
  // per user" invariant the rest of the app relies on (see migration
  // 0053's unique index), so .maybeSingle() here is safe for the same
  // reason it's safe in groups.html's reconcileMyFocusSession().
  const { data: study, error: studyErr } = await auth.admin
    .from("study_sessions")
    .select("id, subject, started_at, accumulated_paused_seconds")
    .eq("user_id", auth.userId)
    .is("ended_at", null)
    .maybeSingle();

  if (studyErr) return json({ error: studyErr.message }, 500);

  // Today's total across all subjects, closed rows + the currently-open
  // one, same accounting group_live_totals() uses server-side for
  // today_seconds.
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data: todayRows, error: todayErr } = await auth.admin
    .from("study_sessions")
    .select("started_at, ended_at, total_seconds, accumulated_paused_seconds")
    .eq("user_id", auth.userId)
    .gte("started_at", startOfDayUtc.toISOString());

  if (todayErr) return json({ error: todayErr.message }, 500);

  const todaySeconds = (todayRows || []).reduce((sum, row) => {
    const secs =
      row.total_seconds ??
      Math.max(
        0,
        Math.floor((new Date(row.ended_at || Date.now()).getTime() - new Date(row.started_at).getTime()) / 1000) -
          (row.accumulated_paused_seconds || 0)
      );
    return sum + secs;
  }, 0);

  return json({
    session: session
      ? {
          active: true,
          blockName: session.block_name,
          sites: session.sites,
          durationMinutes,
          startedAt: session.started_at,
          unlimited: session.unlimited,
          mode: session.mode,
          youtubeRules: session.youtube_rules,
        }
      : null,
    study: study
      ? {
          running: true,
          subject: study.subject,
          startedAt: study.started_at,
          elapsedSeconds: Math.max(
            0,
            Math.floor((Date.now() - new Date(study.started_at).getTime()) / 1000) -
              (study.accumulated_paused_seconds || 0)
          ),
          todaySeconds,
        }
      : {
          running: false,
          todaySeconds,
        },
  });
});
