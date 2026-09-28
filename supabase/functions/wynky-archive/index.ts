// ===== wynky-archive =====
// Moves old Wynky learning events to Cloudflare R2 so the Supabase database
// stays small while the full history is kept for training a model later.
//
// Called once a day by pg_cron (migration 0098). It only does work:
//   - on the 1st of the month, or
//   - when wynky_events is over WYNKY_ARCHIVE_MAX_MB (default 100), or
//   - when called with {"force": true}.
// {"check": true} only tests that the R2 keys can reach the bucket.
// Each run copies events older than 120 days (the window Wynky's learning
// and the same-exam counts read) to R2 in batches, as gzipped NDJSON files,
// checks each file arrived with the right size, and only then deletes that
// batch here. Wynky keeps learning from wynky_learned, which the database
// keeps up to date and which is never archived.
//
// Archive files never hold the real user id: it becomes an HMAC keyed with
// the Vault secret, so one student's rows stay linkable for training but
// can't be traced back to an account.
//
// Needs these secrets (Project Settings → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Until they are set it does nothing and deletes nothing.
//
// Deploy with verify_jwt = false: the caller is pg_cron, authenticated by
// the x-archive-key header matching the Vault secret instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const KEEP_DAYS = 120;
const BATCH = 5000;
const MAX_BATCHES_PER_RUN = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacHex(key: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Plain-text comparison that doesn't leak how much of the key matched. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: key, error: keyErr } = await supabase.rpc("wynky_archive_key");
  if (keyErr || typeof key !== "string" || !key) return json({ error: "archive key missing" }, 500);
  if (!sameKey(req.headers.get("x-archive-key") ?? "", key)) return json({ error: "forbidden" }, 403);

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((n) => !Deno.env.get(n));
    return json({ skipped: "R2 secrets not set yet; nothing archived or deleted", missing });
  }

  let force = false;
  let check = false;
  try {
    const body = await req.json();
    force = !!body?.force;
    check = !!body?.check;
  } catch { /* empty body */ }
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

  if (check) {
    const res = await r2.fetch(`${base}?list-type=2&max-keys=1`);
    return json({ check: res.ok ? "R2 reachable" : `R2 said ${res.status}: ${(await res.text()).slice(0, 300)}` }, res.ok ? 200 : 502);
  }

  const { data: bytes } = await supabase.rpc("wynky_events_bytes");
  const maxBytes = (Number(Deno.env.get("WYNKY_ARCHIVE_MAX_MB")) || 100) * 1024 * 1024;
  const firstOfMonth = new Date().getUTCDate() === 1;
  if (!force && !firstOfMonth && Number(bytes) < maxBytes) {
    return json({ skipped: "nothing due", bytes });
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const hashCache = new Map<string, string>();
  const files: string[] = [];
  let archived = 0;

  for (let n = 0; n < MAX_BATCHES_PER_RUN; n++) {
    const { data: rows, error } = await supabase
      .from("wynky_events")
      .select("id, user_id, exam_key, day_type, field, value, multi, action, created_at")
      .lt("created_at", cutoff)
      .order("id", { ascending: true })
      .limit(BATCH);
    if (error) return json({ error: error.message, archived, files }, 500);
    if (!rows || !rows.length) break;

    const lines: string[] = [];
    for (const r of rows) {
      let student = hashCache.get(r.user_id);
      if (!student) {
        student = await hmacHex(key, r.user_id);
        hashCache.set(r.user_id, student);
      }
      const { user_id: _drop, ...rest } = r;
      lines.push(JSON.stringify({ ...rest, student }));
    }
    const body = await gzip(lines.join("\n") + "\n");
    const firstId = rows[0].id;
    const lastId = rows[rows.length - 1].id;
    const month = String(rows[0].created_at).slice(0, 7).replace("-", "/");
    const path = `wynky-events/${month}/${firstId}-${lastId}.ndjson.gz`;

    const put = await r2.fetch(`${base}/${path}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": "application/x-ndjson", "Content-Encoding": "gzip" },
    });
    if (!put.ok) return json({ error: `R2 upload failed: ${put.status} ${await put.text()}`, archived, files }, 502);

    // Only delete once R2 confirms the whole file is there.
    const head = await r2.fetch(`${base}/${path}`, { method: "HEAD" });
    if (!head.ok || Number(head.headers.get("content-length")) !== body.byteLength) {
      return json({ error: `R2 check failed for ${path}`, archived, files }, 502);
    }

    const { error: delErr } = await supabase
      .from("wynky_events")
      .delete()
      .gte("id", firstId)
      .lte("id", lastId)
      .lt("created_at", cutoff);
    if (delErr) return json({ error: `delete failed after upload: ${delErr.message}`, archived, files }, 500);

    archived += rows.length;
    files.push(path);
    if (rows.length < BATCH) break;
  }

  console.log(`wynky-archive: archived ${archived} rows in ${files.length} files`);
  return json({ archived, files });
});
