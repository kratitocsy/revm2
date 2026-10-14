import { sb } from '../../_shared/supabaseClient';

/* Pairs the Wynko Focus Lock extension with the signed-in account from the
   dashboard, silently, the same way blocks.html's autoConnectExtension()
   did. Without a token the extension never polls session-status, so blocks
   started by schedules or the desktop app never reach the browser. That
   page is no longer visited, so the dashboard does it on every sign-in.

   Only works in the browser the extension lives in (chrome.runtime is
   exposed to pages listed in the extension's externally_connectable); in
   the desktop app's window or a browser without the extension it does
   nothing. */

// Pinned by the "key" in the extension's manifest.json (same as blocks.html).
export const EXTENSION_ID = 'knofmgookchmjekaefloaljcamjlbnmp';
// The Chrome Web Store copy has its own ID (the store assigns it), so the
// page tries both: the pinned dev/"Load unpacked" ID and the store ID.
export const STORE_EXTENSION_ID = 'knfnglhnejkndbkaegmpeeaickdhjmjh';
export const EXTENSION_STORE_URL = `https://chromewebstore.google.com/detail/${STORE_EXTENSION_ID}`;
const EXTENSION_IDS = [STORE_EXTENSION_ID, EXTENSION_ID];

type ExtResponse = { ok?: boolean; installed?: boolean; connected?: boolean; reason?: string };

async function sendToExtension(msg: Record<string, unknown>, timeoutMs = 1500): Promise<ExtResponse> {
  let last: ExtResponse = { ok: false, reason: 'no_extension_api' };
  for (const id of EXTENSION_IDS) {
    last = await sendToExtensionId(id, msg, timeoutMs);
    if (last.ok) return last;
  }
  return last;
}

function sendToExtensionId(id: string, msg: Record<string, unknown>, timeoutMs: number): Promise<ExtResponse> {
  return new Promise(resolve => {
    const rt = (globalThis as any).chrome?.runtime;
    if (!rt?.sendMessage) { resolve({ ok: false, reason: 'no_extension_api' }); return; }
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, reason: 'timeout' }); } }, timeoutMs);
    try {
      rt.sendMessage(id, msg, (response: ExtResponse | undefined) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (rt.lastError) { resolve({ ok: false, reason: rt.lastError.message }); return; }
        resolve(response || { ok: false, reason: 'empty_response' });
      });
    } catch (e) {
      if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: (e as Error).message }); }
    }
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 'connected' when the extension is (now) paired, 'absent' when there is
 *  no extension to talk to here, 'failed' otherwise. Never throws. */
export async function autoConnectExtension(userId: string): Promise<'connected' | 'absent' | 'failed'> {
  try {
    if (typeof (window as any).__TAURI__ !== 'undefined') return 'absent';
    const status = await sendToExtension({ type: 'RM2_STATUS' });
    if (!status.ok || !status.installed) return 'absent';
    const webBase = window.location.origin;
    if (status.connected) {
      void sendToExtension({ type: 'RM2_SET_WEBBASE', webBase });
      return 'connected';
    }
    const raw = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await sb.from('extension_sync_tokens').insert({
      token_hash: await sha256Hex(raw), user_id: userId, label: 'Extension (auto-connected)',
    });
    if (error) return 'failed';
    const r = await sendToExtension({ type: 'RM2_CONNECT', token: raw, webBase });
    return r.ok ? 'connected' : 'failed';
  } catch {
    return 'failed';
  }
}

/** True only in desktop Chrome/Edge/Brave-style browsers where the extension
 *  is not installed: the one place an "Add to Chrome" prompt makes sense. */
export async function shouldOfferExtensionInstall(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof (window as any).__TAURI__ !== 'undefined') return false;
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua) || /Mobile|Android|Edg\/|OPR\//.test(ua)) return false;
  const status = await sendToExtension({ type: 'RM2_STATUS' });
  return !(status.ok && status.installed);
}
