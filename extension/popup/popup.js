import { getSettings } from "../utils/storage.js";

async function getCurrentTabDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function openBlocksPage() {
  const settings = await getSettings();
  const base = (settings.webBase || "https://www.wynko.in").replace(/\/$/, "");
  chrome.tabs.create({ url: `${base}/home?page=schedules` });
}

function formatTimeRemaining(session) {
  if (session.unlimited || !session.endsAt) return "Unlimited session";
  const msLeft = new Date(session.endsAt).getTime() - Date.now();
  if (msLeft <= 0) return "Ending...";
  const mins = Math.floor(msLeft / 60_000);
  const secs = Math.floor((msLeft % 60_000) / 1000);
  return `${mins}m ${secs.toString().padStart(2, "0")}s remaining`;
}

async function renderActiveView(session) {
  document.getElementById("start-view").classList.add("hidden");
  const view = document.getElementById("active-view");
  view.classList.remove("hidden");

  const mode = session.mode === "whitelist" ? "whitelist" : "blacklist";

  document.getElementById("active-block-name").textContent = session.blockName || "Focus block";
  document.getElementById("active-time-remaining").textContent = formatTimeRemaining(session);
  document.getElementById("active-sites-list").textContent = session.sites.join(" \u00b7 ");

  const badge = document.getElementById("active-mode-badge");
  if (badge) badge.textContent = mode === "whitelist" ? "Whitelist" : "Blacklist";
  const listLabel = document.getElementById("active-sites-list-label");
  if (listLabel) listLabel.textContent = mode === "whitelist" ? "Allowed sites" : "Blocked sites";

  // Locked sessions (see blocks.html's "Lock until time is up" toggle) have
  // no early exit at all - hide the buttons that would otherwise send the
  // person to a code/payment gate that unlock.js is going to refuse anyway.
  const endEarlyBtn = document.getElementById("end-early-btn");
  const emergencyBtn = document.getElementById("emergency-unlock-btn");
  const lockedNote = document.getElementById("locked-note");
  const isLocked = !!session.noEarlyUnlock;
  if (endEarlyBtn) endEarlyBtn.classList.toggle("hidden", isLocked);
  if (emergencyBtn) emergencyBtn.classList.toggle("hidden", isLocked);
  if (lockedNote) lockedNote.classList.toggle("hidden", !isLocked);

  const domain = await getCurrentTabDomain();
  const label = document.getElementById("current-site-label");
  const addBtn = document.getElementById("add-current-site-btn");

  const verb = mode === "whitelist" ? "Allow" : "Block";
  const verbPast = mode === "whitelist" ? "Allowed" : "Blocked";
  const alreadyLabel = mode === "whitelist" ? "Already allowed" : "Already blocked";

  if (!domain) {
    label.textContent = "no active tab";
    addBtn.disabled = true;
  } else if (session.sites.includes(domain)) {
    label.textContent = domain;
    addBtn.textContent = alreadyLabel;
    addBtn.disabled = true;
  } else {
    label.textContent = domain;
    addBtn.textContent = `${verb} this site now`;
    addBtn.disabled = false;
    addBtn.onclick = async () => {
      addBtn.textContent = `${verb}ing...`;
      const result = await sendMessage("ADD_CURRENT_SITE", { domain });
      if (result.ok) {
        addBtn.textContent = verbPast;
        addBtn.disabled = true;
        renderActiveView(result.session || (await sendMessage("GET_STATUS")).session);
      }
    };
  }

  await renderChannelRow(domain, session);
}

// Shows a second "Block this channel" row, specific to whichever YouTube
// channel the active tab is currently on - separate from "Block this site
// now" above, which only operates at the whole-youtube.com level. Only
// meaningful in "block" mode: in "allow" mode you can only ever be looking
// at an already-allowed channel in the first place (anything else would
// already have been redirected to the blocked page before this popup could
// even ask it a question), so there's nothing new to add from here.
async function renderChannelRow(domain, session) {
  const row = document.getElementById("current-channel-row");
  if (!domain || !/(^|\.)youtube\.com$/.test(domain) || session.youtubeRules?.mode === "allow") {
    row.classList.add("hidden");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    row.classList.add("hidden");
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "RM2_GET_CURRENT_CHANNEL" });
  } catch {
    response = null; // content script not injected yet (page still loading) - just skip this round
  }
  const channel = response?.channel;
  if (!channel) {
    row.classList.add("hidden");
    return;
  }

  row.classList.remove("hidden");
  const label = document.getElementById("current-channel-label");
  const btn = document.getElementById("add-current-channel-btn");
  const alreadyBlocked = (session.youtubeRules?.channels || []).some((c) => c.id === channel.id);

  label.textContent = channel.label;
  if (alreadyBlocked) {
    btn.textContent = "Already blocked";
    btn.disabled = true;
  } else {
    btn.textContent = "Block this channel";
    btn.disabled = false;
    btn.onclick = async () => {
      btn.textContent = "Blocking...";
      const result = await sendMessage("ADD_YT_CHANNEL_BLOCK", { channel });
      if (result.ok) {
        btn.textContent = "Already blocked";
        btn.disabled = true;
      } else {
        btn.textContent = "Block this channel";
        btn.disabled = false;
      }
    };
  }
}

async function renderBlockedAttempts() {
  const el = document.getElementById("blocked-attempts");
  if (!el) return;
  const result = await sendMessage("GET_BLOCKED_ATTEMPTS");
  const attempts = result?.attempts;
  if (!attempts || !attempts.total) {
    el.classList.add("hidden");
    return;
  }
  const top = Object.entries(attempts.bySite)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([site, n]) => `${site} ${n}`)
    .join(" \u00b7 ");
  const times = attempts.total === 1 ? "time" : "times";
  el.textContent = `Blocked ${attempts.total} ${times} this session: ${top}`;
  el.classList.remove("hidden");
}

function renderStartView() {
  document.getElementById("active-view").classList.add("hidden");
  document.getElementById("start-view").classList.remove("hidden");
}

async function init() {
  const status = await sendMessage("GET_STATUS");
  if (status.ok && status.session?.active) {
    await renderActiveView(status.session);
    renderBlockedAttempts();
    setInterval(renderBlockedAttempts, 30_000);
  } else {
    renderStartView();
  }

  document.getElementById("open-website-btn")?.addEventListener("click", openBlocksPage);
  document.getElementById("manage-block-btn")?.addEventListener("click", openBlocksPage);
  document.getElementById("end-early-btn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("blocked/blocked.html?manual=1") });
  });
  document.getElementById("emergency-unlock-btn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("blocked/blocked.html?manual=1&emergency=1") });
  });
  document.getElementById("open-options-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Keep the countdown fresh while the popup is open.
  setInterval(async () => {
    const s = await sendMessage("GET_STATUS");
    if (s.ok && s.session?.active) {
      const el = document.getElementById("active-time-remaining");
      if (el) el.textContent = formatTimeRemaining(s.session);
    }
  }, 1000);
}

document.addEventListener("DOMContentLoaded", init);
