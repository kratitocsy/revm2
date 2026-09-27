// RevM2 - shared storage + API helpers
// Storage schema (chrome.storage.local):
//   revm2Session:  { active, blockName, sites[], mode, youtubeRules|null,
//                    startedAt, endsAt|null, unlimited, verified,
//                    usedEmergencyUnlock }
//                  mode: "blacklist" (block just these sites, default) or
//                  "whitelist" (only these sites stay reachable, everything
//                  else is blocked). Missing/unrecognized mode is treated
//                  as "blacklist" for backward compatibility.
//                  youtubeRules (optional, read by content/youtube-guard.js):
//                  { mode: "block"|"allow", channels: [{ id, label }] }
//                  where `id` is a normalized channel identifier (UC... id,
//                  @handle, or /c//user/ slug). "block" = these channels are
//                  off-limits, rest of youtube.com is untouched. "allow" =
//                  ONLY these channels are reachable on youtube.com.
//   revm2Presets:  { [id]: { id, name, sites[], mode } }   -- saved named blocks
//   revm2Settings: { apiBase, token }

export const DEFAULT_SETTINGS = {
  // Supabase Edge Functions base — see supabase/functions/* in the website
  // repo. If you later put a custom-domain rewrite in front of these
  // (e.g. api.revm2.app/api/extension/* -> this URL), change this to that
  // domain instead; PATH_TO_FUNCTION above only matters when calling the
  // raw Supabase functions URL directly.
  apiBase: "https://dhzjtjekbvxxsauzhadl.supabase.co/functions/v1",
  webBase: "https://www.wynko.in", // separate from apiBase - this is the actual website, used only to open the emergency-unlock payment page.
  token: "",
  blockAdultContent: false, // toggles the bundled adult-content static ruleset (see rules/adult-blocklist.json)
};

export async function getSettings() {
  const { revm2Settings } = await chrome.storage.local.get("revm2Settings");
  return { ...DEFAULT_SETTINGS, ...(revm2Settings || {}) };
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ revm2Settings: next });
  return next;
}

export async function getSession() {
  const { revm2Session } = await chrome.storage.local.get("revm2Session");
  return revm2Session || null;
}

export async function setSession(session) {
  await chrome.storage.local.set({ revm2Session: session });
  return session;
}

export async function clearSession() {
  await chrome.storage.local.remove("revm2Session");
}

export async function getPresets() {
  const { revm2Presets } = await chrome.storage.local.get("revm2Presets");
  return revm2Presets || {};
}

export async function savePreset(preset) {
  const presets = await getPresets();
  presets[preset.id] = preset;
  await chrome.storage.local.set({ revm2Presets: presets });
  return presets;
}

export async function deletePreset(id) {
  const presets = await getPresets();
  delete presets[id];
  await chrome.storage.local.set({ revm2Presets: presets });
  return presets;
}

// Normalizes user input ("youtube.com", "https://youtube.com/watch", "www.x.com")
// down to a bare matchable domain.
export function normalizeDomain(input) {
  let value = input.trim().toLowerCase();
  if (!value) return "";
  try {
    if (!value.startsWith("http")) value = `https://${value}`;
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^www\./, "").split("/")[0];
  }
}

// The extension code (background.js, unlock.js) calls the clean paths
// documented in the README. Those aren't real routes - they're mapped
// here to the actual deployed Supabase Edge Function names, so nothing
// else in the codebase needs to know that detail or change if a
// function gets renamed/redeployed.
const PATH_TO_FUNCTION = {
  "/api/extension/session/status": "/session-status",
  "/api/extension/session/start": "/session-start",
  "/api/extension/session/end": "/session-end",
  "/api/extension/session/sites": "/session-sites",
  "/api/extension/session/youtube-rules": "/session-youtube-rules", // not deployed yet - see README
  "/api/extension/session/end-early": "/session-end-early",
  "/api/extension/session/pause": "/session-pause",
  "/api/extension/profile": "/profile",
};

// Thin wrapper around fetch that attaches auth + swallows network errors
// so a flaky connection never crashes the extension - it just means the
// backend sync is stale until the next successful poll.
export async function apiRequest(path, options = {}) {
  const settings = await getSettings();
  if (!settings.token) return { ok: false, offline: true };

  const resolvedPath = PATH_TO_FUNCTION[path] || path;

  try {
    const res = await fetch(`${settings.apiBase}${resolvedPath}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.token}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (err) {
    console.warn("RevM2: API request failed (offline?)", path, err);
    return { ok: false, offline: true };
  }
}
