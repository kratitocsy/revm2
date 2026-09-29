// RevM2 - RTA (Restricted To Adults) meta tag check.
//
// RTA is a voluntary self-labeling standard (from ASACP) that many adult
// sites embed specifically so filtering tools can find them without needing
// an exhaustive domain list:
//   <meta name="rating" content="RTA-5042-1996-1400-1577-RTA">
//
// This is a second layer on top of rules/adult-blocklist.json (the static
// domain list) and the adult-TLD regex rule - it catches sites that use
// the tag but aren't on the static list yet, or that rotate domains often.
// It is NOT comprehensive: plenty of large adult sites skip the tag
// entirely, so this is additive, not a replacement for the domain list.

(function () {
  // Only cost-check once per page; bail immediately if the filter is off,
  // so this has zero effect on browsing when the setting is disabled.
  chrome.storage.local.get("revm2Settings", ({ revm2Settings }) => {
    if (!revm2Settings || !revm2Settings.blockAdultContent) return;

    const meta = document.querySelector('meta[name="rating"], meta[name="RATING"]');
    if (!meta) return;

    const content = (meta.getAttribute("content") || "").toUpperCase();
    if (content.includes("RTA-5042-1996-1400-1577-RTA")) {
      const site = encodeURIComponent(location.hostname);
      const blockedUrl = chrome.runtime.getURL(`blocked/blocked.html?site=${site}&adult=1&reason=rta`);
      window.location.replace(blockedUrl);
    }
  });
})();
