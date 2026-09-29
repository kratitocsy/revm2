// RevM2 - offscreen document: desktop-app local bridge client.
//
// This is the ONLY thing this document does. It exists purely because
// background.js (an MV3 service worker) gets suspended after ~30s idle
// and can't reliably hold a long-poll connection open by itself - an
// offscreen document has no such lifecycle, so it's what actually parks
// here waiting on the desktop app's local bridge (see
// desktop/src-tauri/src/session_bridge.rs) and relays whatever it learns
// back to background.js.
//
// Deliberately NOT Supabase, not any remote host - purely
// http://127.0.0.1, same machine as the desktop app. If the desktop app
// isn't running (the common case for most people, most of the time),
// every request here just fails fast with a connection error and this
// backs off for a few seconds before trying again - cheap and silent.

const BRIDGE_BASE = "http://127.0.0.1:47552";
const RETRY_DELAY_MS = 4000; // desktop app not running (or briefly restarting) - don't hammer a refused connection
const FETCH_SAFETY_TIMEOUT_MS = 30000; // a little over the server's own ~25s long-poll timeout - this abort is a safety net, not the normal way a request resolves

let since = 0;
let stopped = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_SAFETY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRIDGE_BASE}/session-events?since=${since}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 204) {
      // Server-side long-poll timed out with nothing new - reconnect
      // immediately with the same `since`, no delay needed.
      return;
    }
    if (!res.ok) {
      await sleep(RETRY_DELAY_MS);
      return;
    }

    const data = await res.json();
    if (typeof data.seq === "number") since = data.seq;

    // background.js might not have a listener registered yet on the very
    // first tick right after browser startup - that's fine, this event
    // was just the initial "nothing active" state in that case, and any
    // real future change will land normally once it's up.
    chrome.runtime
      .sendMessage({
        type: "RM2_DESKTOP_SESSION_EVENT",
        active: !!data.active,
        session: data.session ?? null,
      })
      .catch(() => {});
  } catch {
    clearTimeout(timer);
    // Desktop app not running (connection refused) or a genuine network
    // hiccup - either way, back off instead of spinning in a tight loop.
    await sleep(RETRY_DELAY_MS);
  }
}

async function loop() {
  while (!stopped) {
    await pollOnce();
  }
}

loop();
