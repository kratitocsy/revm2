import { getSettings, setSettings, getPresets, deletePreset } from "../utils/storage.js";

async function loadSettings() {
  const settings = await getSettings();
  document.getElementById("api-base").value = settings.apiBase;
  document.getElementById("web-base").value = settings.webBase;
  document.getElementById("api-token").value = settings.token;
}

async function saveSettings() {
  const apiBase = document.getElementById("api-base").value.trim();
  const webBase = document.getElementById("web-base").value.trim();
  const token = document.getElementById("api-token").value.trim();
  await setSettings({ apiBase, webBase, token });
  chrome.runtime.sendMessage({ type: "RM2_SETTINGS_SAVED" }).catch(() => {});
  const status = document.getElementById("settings-status");
  status.textContent = "Saved. Syncing on next check-in.";
  setTimeout(() => (status.textContent = ""), 2500);
}

async function renderPresets() {
  const presets = await getPresets();
  const list = document.getElementById("presets-list");
  list.innerHTML = "";

  const entries = Object.values(presets);
  if (entries.length === 0) {
    list.innerHTML = '<p class="empty">No saved blocks yet - start one from the popup and name it to save it here.</p>';
    return;
  }

  entries.forEach((preset) => {
    const row = document.createElement("div");
    row.className = "preset-row";
    const mode = preset.mode === "whitelist" ? "Whitelist" : "Blacklist";
    row.innerHTML = `
      <div>
        <div class="preset-name">${escapeHtml(preset.name)} <span class="preset-mode">${mode}</span></div>
        <div class="preset-sites">${escapeHtml(preset.sites.join(", "))}</div>
      </div>
      <button class="delete-btn" data-id="${preset.id}">Remove</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deletePreset(btn.dataset.id);
      renderPresets();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadAdultBlockState() {
  const res = await chrome.runtime.sendMessage({ type: "GET_ADULT_BLOCK_STATE" });
  const checkbox = document.getElementById("block-adult-toggle");
  const status = document.getElementById("adult-block-status");
  checkbox.checked = !!(res && res.enabled);
  status.textContent = checkbox.checked ? "Currently blocking." : "Currently off.";
}

async function toggleAdultBlock(e) {
  const status = document.getElementById("adult-block-status");
  status.textContent = "Updating…";
  const res = await chrome.runtime.sendMessage({ type: "TOGGLE_ADULT_BLOCK", enabled: e.target.checked });
  status.textContent = res && res.ok ? (res.enabled ? "Currently blocking." : "Currently off.") : "Could not update - try again.";
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  renderPresets();
  loadAdultBlockState();
  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
  document.getElementById("block-adult-toggle").addEventListener("change", toggleAdultBlock);
});
