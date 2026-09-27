// RevM2 - inline "Block this channel" control.
//
// Companion to content/youtube-guard.js (which enforces the rules) - this
// file is what lets someone build up that block list from inside YouTube
// itself, instead of having to go to the website, find the channel's
// handle, and paste it in manually. Only makes sense while a block session
// is running and youtube.com is actually reachable (if it weren't, guard.js
// would already have redirected away before this ever got a chance to run).

(function () {
  if (window.top !== window) return;

  const BTN_ID = "revm2-block-channel-btn";
  let lastRenderedFor = null;

  function normalizeChannelRef(raw) {
    if (!raw) return "";
    let v = String(raw).trim().toLowerCase();
    v = v.replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//, "");
    v = v.replace(/\/$/, "").split(/[?#]/)[0];
    v = v.replace(/^channel\//, "").replace(/^c\//, "").replace(/^user\//, "");
    return v;
  }

  // Same extraction approach as youtube-guard.js. Kept as a separate copy
  // rather than a shared import - MV3 content scripts don't share module
  // scope with each other, and this is small enough that duplicating it is
  // simpler than wiring up a shared bundle for two files.
  function currentChannel() {
    const path = location.pathname;
    let id = "";

    const directMatch = path.match(/^\/(channel\/UC[\w-]+|c\/[\w.-]+|user\/[\w.-]+|@[\w.-]+)/i);
    if (directMatch) id = normalizeChannelRef(directMatch[1]);

    if (!id) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (canonical) id = normalizeChannelRef(canonical);
    }
    if (!id) {
      const metaChannelId = document.querySelector('meta[itemprop="channelId"]')?.content;
      if (metaChannelId) id = normalizeChannelRef(metaChannelId);
    }
    if (!id) {
      const ownerLink = document.querySelector(
        "ytd-video-owner-renderer a.yt-simple-endpoint, #owner a.yt-simple-endpoint"
      )?.getAttribute("href");
      if (ownerLink) id = normalizeChannelRef(ownerLink);
    }
    if (!id) return null;

    const nameEl = document.querySelector(
      "ytd-channel-name#channel-name a, #channel-name a, #owner-name a, ytd-video-owner-renderer .ytd-channel-name a"
    );
    const label = nameEl?.textContent?.trim() || (id.startsWith("@") ? id : `@${id}`);

    return { id, label };
  }

  function removeButton() {
    document.getElementById(BTN_ID)?.remove();
  }

  function ensureStyles() {
    if (document.getElementById("revm2-btn-styles")) return;
    const style = document.createElement("style");
    style.id = "revm2-btn-styles";
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        background: #1b1b1f;
        color: #f1f1ee;
        border: 1px solid #d4af37;
        border-radius: 999px;
        padding: 9px 16px;
        font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.45);
        opacity: 0.88;
        transition: opacity 0.15s ease;
      }
      #${BTN_ID}:hover { opacity: 1; }
      #${BTN_ID}[data-state="blocked"] { border-color: #6b6f78; color: #8b8f98; cursor: default; }
      #${BTN_ID}[data-state="working"] { opacity: 0.6; cursor: default; }
    `;
    document.head.appendChild(style);
  }

  function renderButton(channel, alreadyBlocked) {
    removeButton();
    ensureStyles();
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    if (alreadyBlocked) {
      btn.textContent = `\u2713 ${channel.label} blocked`;
      btn.dataset.state = "blocked";
    } else {
      btn.textContent = `\u{1F6AB} Block ${channel.label}`;
      btn.dataset.state = "idle";
      btn.addEventListener("click", async () => {
        btn.dataset.state = "working";
        btn.textContent = "Blocking\u2026";
        const result = await chrome.runtime.sendMessage({
          type: "ADD_YT_CHANNEL_BLOCK",
          channel: { id: channel.id, label: channel.label },
        });
        if (result?.ok) {
          btn.dataset.state = "blocked";
          btn.textContent = `\u2713 ${channel.label} blocked`;
        } else {
          btn.dataset.state = "idle";
          btn.textContent = `\u{1F6AB} Block ${channel.label}`;
        }
      });
    }
    document.body.appendChild(btn);
  }

  async function evaluate() {
    if (lastRenderedFor === location.href) return;
    lastRenderedFor = location.href;

    const { revm2Session } = await chrome.storage.local.get("revm2Session");
    if (!revm2Session?.active) {
      removeButton();
      return;
    }
    // "allow" mode already means only chosen channels are reachable at all -
    // a "block this channel" action doesn't make sense on top of that, and
    // background.js's addYoutubeChannelToActiveSession refuses it anyway.
    if (revm2Session.youtubeRules?.mode === "allow") {
      removeButton();
      return;
    }

    const channel = currentChannel();
    if (!channel) {
      removeButton();
      return;
    }

    const alreadyBlocked = (revm2Session.youtubeRules?.channels || []).some(
      (c) => c.id === channel.id
    );
    renderButton(channel, alreadyBlocked);
  }

  document.addEventListener("DOMContentLoaded", evaluate);
  window.addEventListener("load", evaluate);
  window.addEventListener("yt-navigate-finish", () => setTimeout(evaluate, 300));

  // The session can change (block starts/ends, or another channel gets
  // added from the website) without a YouTube navigation happening at all -
  // watch storage directly so the button's state/visibility stays correct.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.revm2Session) {
      lastRenderedFor = null;
      evaluate();
    }
  });

  // Lets the popup show its own "Block this channel" row for the active
  // tab, instead of only having the floating in-page button.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "RM2_GET_CURRENT_CHANNEL") {
      sendResponse({ channel: currentChannel() });
      return true;
    }
  });

  evaluate();
})();
