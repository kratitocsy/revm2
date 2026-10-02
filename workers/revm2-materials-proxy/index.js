// revm2-materials-proxy — Cloudflare Worker in front of the private Backblaze B2 bucket.
//
// Routes
//   POST /upload?group_id&material_id&page&ext   one compressed page image (PDF / image materials)
//   POST /upload-file?group_id&material_id&name  one raw file: docx / video / anything else (streamed)
//   POST /mint        {material_id, page_number} -> short-lived view token for a page
//   POST /mint-file   {material_id, download?}   -> longer-lived view token for a raw file
//   GET  /view/<token>                           streams the object (Range supported, so video seeks)
//   POST /delete?group_id&material_id            removes everything stored for a material
//
// Bindings (unchanged): B2_KEY_ID, B2_APP_KEY, B2_BUCKET_ID, B2_BUCKET_NAME, TOKEN_SECRET,
// SUPABASE_URL, SUPABASE_ANON_KEY, optional ALLOWED_ORIGIN and MAX_RAW_BYTES.
//
// Authorisation is always the caller's own Supabase session: uploads/deletes need group admin,
// minting needs row-level read access to the material.

const PAGE_TOKEN_TTL = 90; // seconds
const RAW_TOKEN_TTL = 6 * 60 * 60; // a video must stay playable and seekable while it is watched
const MAX_PAGE_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_RAW_BYTES = 90 * 1024 * 1024; // stays under Cloudflare's 100 MB request-body limit
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Types the browser may render inline. Everything else is served as a download.
const INLINE_TYPES = new Set([
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KNOWN_TYPES = new Set([...INLINE_TYPES, DOCX, "application/msword"]);
const EXT_TYPES = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pdf: "application/pdf", docx: DOCX, doc: "application/msword",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return corsPreflight(env);
    if (request.method === "GET" && url.pathname.startsWith("/view/")) return handleView(request, url, env);
    if (request.method === "POST") {
      if (url.pathname === "/mint") return handleMint(request, env);
      if (url.pathname === "/mint-file") return handleMintFile(request, env);
      if (url.pathname === "/upload") return handleUpload(request, url, env);
      if (url.pathname === "/upload-file") return handleUploadFile(request, url, env);
      if (url.pathname === "/delete") return handleDelete(request, url, env);
    }
    return new Response("Not found", { status: 404 });
  },
};

const corsOf = (env) => ({ "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" });

/* ── content types ───────────────────────────────────────────────────────── */

export function resolveContentType(declared, fileName) {
  const t = String(declared || "").split(";")[0].trim().toLowerCase();
  if (KNOWN_TYPES.has(t)) return t;
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  return EXT_TYPES[ext] || "application/octet-stream";
}

export function safeFileName(name) {
  return String(name || "").replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "").slice(-80) || "file";
}

function contentDisposition(inline, fileName) {
  if (inline) return "inline";
  const ascii = String(fileName || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(fileName || "file").slice(0, 200))}`;
}

/* ── view ────────────────────────────────────────────────────────────────── */

async function handleView(request, url, env) {
  const token = url.pathname.slice("/view/".length);
  const payload = await verifyToken(token, env.TOKEN_SECRET);
  if (!payload) return new Response("Invalid or expired link", { status: 403 });
  if (!payload.key || typeof payload.key !== "string") {
    return new Response("Malformed token", { status: 400 });
  }
  const isRaw = typeof payload.ct === "string";
  const range = isRaw ? request.headers.get("Range") : null;

  let fileRes = await b2Download(env, payload.key, range);
  if (fileRes.status === 401) { clearAuthCache(); fileRes = await b2Download(env, payload.key, range); }
  if (fileRes.status === 502 && !fileRes.body) return new Response("Storage auth error", { status: 502 });
  if (!fileRes.ok) return new Response("File not found", { status: fileRes.status === 416 ? 416 : 404 });

  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
  };
  if (isRaw) {
    const inline = INLINE_TYPES.has(payload.ct) && !payload.dl;
    headers["Content-Type"] = payload.ct;
    headers["Content-Disposition"] = contentDisposition(inline, payload.fn);
    headers["Accept-Ranges"] = "bytes";
    for (const h of ["Content-Length", "Content-Range"]) {
      const v = fileRes.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(fileRes.body, { status: fileRes.status === 206 ? 206 : 200, headers });
  }
  const ext = payload.key.split(".").pop().toLowerCase();
  headers["Content-Type"] = ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "image/jpeg";
  headers["Content-Disposition"] = "inline";
  return new Response(fileRes.body, { status: 200, headers });
}

/* ── mint ────────────────────────────────────────────────────────────────── */

async function handleMint(request, env) {
  const cors = corsOf(env);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return new Response("Missing auth", { status: 401, headers: cors });
  let body;
  try { body = await request.json(); } catch { return new Response("Bad request", { status: 400, headers: cors }); }
  const { material_id, page_number } = body || {};
  if (!material_id || !page_number) {
    return new Response("material_id and page_number required", { status: 400, headers: cors });
  }
  const q = `${env.SUPABASE_URL}/rest/v1/group_material_pages?select=storage_path,group_materials(group_id)&material_id=eq.${encodeURIComponent(material_id)}&page_number=eq.${encodeURIComponent(page_number)}`;
  const res = await fetch(q, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } });
  if (!res.ok) return new Response("Lookup failed", { status: 502, headers: cors });
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response("Not found or not permitted", { status: 403, headers: cors });
  }
  const exp = Math.floor(Date.now() / 1e3) + PAGE_TOKEN_TTL;
  const token = await signToken({ key: rows[0].storage_path, exp }, env.TOKEN_SECRET);
  return json({ token }, 200, cors);
}

async function handleMintFile(request, env) {
  const cors = corsOf(env);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return new Response("Missing auth", { status: 401, headers: cors });
  let body;
  try { body = await request.json(); } catch { return new Response("Bad request", { status: 400, headers: cors }); }
  const { material_id, download } = body || {};
  if (!ID_RE.test(String(material_id || ""))) return new Response("material_id required", { status: 400, headers: cors });
  // The caller's own session reads the row, so row-level security decides who may open it.
  const q = `${env.SUPABASE_URL}/rest/v1/group_materials?select=storage_path,mime_type,file_name&id=eq.${encodeURIComponent(material_id)}`;
  const res = await fetch(q, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } });
  if (!res.ok) return new Response("Lookup failed", { status: 502, headers: cors });
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || typeof row.storage_path !== "string" || !row.storage_path.startsWith("b2:")) {
    return new Response("Not found or not permitted", { status: 403, headers: cors });
  }
  const key = row.storage_path.slice(3);
  if (key.split("/")[1] !== material_id) return new Response("Bad file reference", { status: 400, headers: cors });
  const payload = {
    key,
    ct: resolveContentType(row.mime_type, row.file_name),
    fn: typeof download === "string" && download ? download : row.file_name || "file",
    dl: typeof download === "string" && download.length > 0,
    exp: Math.floor(Date.now() / 1e3) + RAW_TOKEN_TTL,
  };
  return json({ token: await signToken(payload, env.TOKEN_SECRET) }, 200, cors);
}

/* ── upload ──────────────────────────────────────────────────────────────── */

async function requireGroupAdmin(request, env, groupId, cors) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { error: new Response("Missing auth", { status: 401, headers: cors }) };
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return { error: new Response("Invalid session", { status: 401, headers: cors }) };
  const user = await userRes.json();
  if (!user?.id) return { error: new Response("Invalid session", { status: 401, headers: cors }) };
  const roleRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/group_members?select=role&group_id=eq.${encodeURIComponent(groupId)}&user_id=eq.${encodeURIComponent(user.id)}`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } },
  );
  if (!roleRes.ok) return { error: new Response("Lookup failed", { status: 502, headers: cors }) };
  const roleRows = await roleRes.json();
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== "admin") {
    return { error: new Response("Admin only", { status: 403, headers: cors }) };
  }
  return { user };
}

async function handleUpload(request, url, env) {
  const cors = corsOf(env);
  const groupId = url.searchParams.get("group_id");
  const materialId = url.searchParams.get("material_id");
  const page = url.searchParams.get("page");
  const ext = (url.searchParams.get("ext") || "jpg").replace(/[^a-z0-9]/gi, "");
  if (!(request.headers.get("Authorization") || "").startsWith("Bearer ")) {
    return new Response("Missing auth", { status: 401, headers: cors });
  }
  if (!groupId || !materialId || !page) {
    return new Response("group_id, material_id, page required", { status: 400, headers: cors });
  }
  if (!ID_RE.test(groupId) || !ID_RE.test(materialId)) return new Response("Bad id", { status: 400, headers: cors });
  const gate = await requireGroupAdmin(request, env, groupId, cors);
  if (gate.error) return gate.error;

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return new Response("Empty body", { status: 400, headers: cors });
  if (bytes.byteLength > MAX_PAGE_BYTES) return new Response("Page too large", { status: 413, headers: cors });

  const key = `${groupId}/${materialId}/page-${String(page).padStart(3, "0")}.${ext}`;
  const ok = await b2Upload(env, key, bytes, ext === "png" ? "image/png" : "image/jpeg");
  if (!ok) return new Response("Upload failed", { status: 502, headers: cors });
  return json({ ok: true, key }, 200, cors);
}

async function handleUploadFile(request, url, env) {
  const cors = corsOf(env);
  const groupId = url.searchParams.get("group_id");
  const materialId = url.searchParams.get("material_id");
  const name = url.searchParams.get("name") || "file";
  if (!(request.headers.get("Authorization") || "").startsWith("Bearer ")) {
    return new Response("Missing auth", { status: 401, headers: cors });
  }
  if (!groupId || !materialId) return new Response("group_id and material_id required", { status: 400, headers: cors });
  if (!ID_RE.test(groupId) || !ID_RE.test(materialId)) return new Response("Bad id", { status: 400, headers: cors });
  const gate = await requireGroupAdmin(request, env, groupId, cors);
  if (gate.error) return gate.error;

  const length = parseInt(request.headers.get("Content-Length") || "", 10);
  if (!Number.isFinite(length) || length <= 0) return new Response("Content-Length required", { status: 411, headers: cors });
  const max = parseInt(env.MAX_RAW_BYTES || "", 10) || DEFAULT_MAX_RAW_BYTES;
  if (length > max) return new Response("File too large", { status: 413, headers: cors });
  if (!request.body) return new Response("Empty body", { status: 400, headers: cors });

  const key = `${groupId}/${materialId}/file/${safeFileName(name)}`;
  const contentType = resolveContentType(request.headers.get("Content-Type"), name);
  const ok = await b2UploadStream(env, key, request.body, length, contentType);
  if (!ok) return new Response("Upload failed", { status: 502, headers: cors });
  return json({ ok: true, key }, 200, cors);
}

/* ── delete ──────────────────────────────────────────────────────────────── */

async function handleDelete(request, url, env) {
  const cors = corsOf(env);
  const groupId = url.searchParams.get("group_id");
  const materialId = url.searchParams.get("material_id");
  if (!(request.headers.get("Authorization") || "").startsWith("Bearer ")) {
    return new Response("Missing auth", { status: 401, headers: cors });
  }
  if (!ID_RE.test(String(groupId || "")) || !ID_RE.test(String(materialId || ""))) {
    return new Response("group_id and material_id required", { status: 400, headers: cors });
  }
  const gate = await requireGroupAdmin(request, env, groupId, cors);
  if (gate.error) return gate.error;

  const auth = await b2Authorize(env);
  if (!auth) return new Response("Storage auth error", { status: 502, headers: cors });
  const prefix = `${groupId}/${materialId}/`; // only ever inside a group the caller administers
  let deleted = 0;
  let startFileName = null;
  for (let round = 0; round < 5; round++) {
    const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: "POST",
      headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId: env.B2_BUCKET_ID, prefix, maxFileCount: 1000, ...(startFileName ? { startFileName } : {}) }),
    });
    if (!listRes.ok) return new Response("List failed", { status: 502, headers: cors });
    const list = await listRes.json();
    for (const f of list.files || []) {
      const del = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
        method: "POST",
        headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: f.fileName, fileId: f.fileId }),
      });
      if (del.ok) deleted++;
    }
    startFileName = list.nextFileName;
    if (!startFileName) break;
  }
  return json({ ok: true, deleted }, 200, cors);
}

/* ── Backblaze B2 ────────────────────────────────────────────────────────── */

let authCache = { at: 0, value: null };
const AUTH_TTL_MS = 20 * 60 * 1000; // B2 tokens last 24 h; reusing one avoids an authorize call per Range request
export function clearAuthCache() { authCache = { at: 0, value: null }; }

async function b2Authorize(env) {
  if (authCache.value && Date.now() - authCache.at < AUTH_TTL_MS) return authCache.value;
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: "Basic " + btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`) },
  });
  if (!res.ok) return null;
  const value = await res.json();
  authCache = { at: Date.now(), value };
  return value;
}

async function b2Download(env, key, range) {
  const auth = await b2Authorize(env);
  if (!auth) return new Response(null, { status: 502 });
  const fileUrl = `${auth.downloadUrl}/file/${env.B2_BUCKET_NAME}/${encodeURI(key)}`;
  return fetch(fileUrl, { headers: { Authorization: auth.authorizationToken, ...(range ? { Range: range } : {}) } });
}

async function b2GetUploadUrl(env) {
  const auth = await b2Authorize(env);
  if (!auth) return null;
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: env.B2_BUCKET_ID }),
  });
  if (res.status === 401) clearAuthCache();
  return res.ok ? res.json() : null;
}

async function b2Upload(env, key, bytes, contentType) {
  const info = await b2GetUploadUrl(env);
  if (!info) return false;
  const sha1Buf = await crypto.subtle.digest("SHA-1", bytes);
  const sha1Hex = [...new Uint8Array(sha1Buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const putRes = await fetch(info.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: info.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": contentType,
      "X-Bz-Content-Sha1": sha1Hex,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  return putRes.ok;
}

// Raw files are streamed straight through: nothing is buffered, so memory use stays flat for large
// videos. B2 needs a Content-Length, hence FixedLengthStream; the checksum is skipped for the same reason.
async function b2UploadStream(env, key, body, length, contentType) {
  const info = await b2GetUploadUrl(env);
  if (!info) return false;
  const { readable, writable } = new FixedLengthStream(length);
  const piping = body.pipeTo(writable);
  const putRes = await fetch(info.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: info.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": contentType,
      "X-Bz-Content-Sha1": "do_not_verify",
    },
    body: readable,
  });
  try { await piping; } catch { return false; }
  return putRes.ok;
}

/* ── tokens / helpers ────────────────────────────────────────────────────── */

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } });
}

export async function signToken(payload, secret) {
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64urlEncodeBytes(new Uint8Array(sig))}`;
}

export async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64urlToBytes(sigB64), new TextEncoder().encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(base64urlDecodeToString(payloadB64));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}

function corsPreflight(env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Encode through UTF-8 so non-ASCII file names survive inside a token.
function base64urlEncode(str) { return base64urlEncodeBytes(new TextEncoder().encode(str)); }
function base64urlEncodeBytes(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function base64urlDecodeToString(b64url) {
  return new TextDecoder().decode(base64urlToBytes(b64url));
}
