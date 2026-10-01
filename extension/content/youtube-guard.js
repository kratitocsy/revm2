// RevM2 - YouTube channel-level enforcement.
//
// The domain-level rules in background.js (declarativeNetRequest) can only
// block or allow the whole of youtube.com - they have no idea which channel
// a video belongs to, because that's SPA content, not something that shows
// up as a separate request Chrome's network layer can filter on. This script
// fills that gap: it runs on every youtube.com page, works out which channel
// the person is currently looking at, and checks it against the active
// session's `youtubeRules` (set from the website's "YouTube channels" panel,
// synced down like everything else in revm2Session).
//
// youtubeRules shape:
//   { mode: "block" | "allow", channels: [{ id, label }] }
//   - "block": the listed channels are off-limits; everything else on
//     youtube.com stays reachable.
//   - "allow": ONLY the listed channels are reachable; the home feed and
//     the shells of the Shorts feed/search page stay reachable too (see
//     below), but any video/channel not on the list is redirected.
//   `id` is whatever normalizeChannelRef() below produces - a bare channel
//   ID (UC...), an @handle, or a legacy /c/ or /user/ slug, always lowercase
//   and without a leading punctuation.
//
// Search results ("/results"): every result card - video, channel, playlist,
// or mix - carries the SAME channel identifier (an @handle or /channel/UC...
// link) in its own byline, completely independent of whatever words the
// person typed to search. That's a far more reliable signal than trying to
// guess whether the *query text* is "about" a listed channel (the old
// approach), which broke the moment a channel's saved label didn't happen to
// share words with what someone actually searched - the standard case, not
// an edge case, since most people search a channel by its real name rather
// than its @handle. So instead: the search page itself always stays
// reachable, and applySearchFilter() hides/shows each individual result card
// based on ITS OWN byline channel link - the same authoritative identifier
// used for the actual watch-page check below, just read one level up from a
// results-grid card instead of a loaded video. A MutationObserver keeps this
// applied as YouTube lazy-loads more cards on scroll.
//
// Clicking through into an actual video/channel page is always checked
// against the listed channels regardless of how it was reached (including a
// typed URL or a bookmark, which never touches the search filter above), so
// that's the belt-and-braces layer this all sits on top of, not a
// replacement for it.

(function () {
  if (window.top !== window) return; // only the top frame - embeds fire this too, and duplicate work

  let lastChecked = null; // dedupe: SPA nav events can fire more than once per real navigation

  function normalizeChannelRef(raw) {
    if (!raw) return "";
    let v = String(raw).trim().toLowerCase();
    v = v.replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//, "");
    // Raw DOM hrefs (e.g. the owner byline link's getAttribute("href")) come
    // through as root-relative paths like "/@eduniti" or "/channel/UC...",
    // not stripped by the domain-prefix removal above (that only matches a
    // full https://youtube.com/... URL). Without this, a handle read off the
    // owner link normalizes to "/@eduniti" instead of "@eduniti" and never
    // equals the slash-free id blocks.html stores for the allow/block list -
    // the metadata is right there, it just never matches on comparison.
    v = v.replace(/^\//, "");
    // Handles keep their leading "@" - only the case was normalized above.
    v = v.replace(/\/$/, "");
    v = v.split(/[?#]/)[0];
    // Collapse known path prefixes down to the bare identifier.
    v = v.replace(/^channel\//, "");
    v = v.replace(/^c\//, "");
    v = v.replace(/^user\//, "");
    return v;
  }

  // Pulls every identifier the current page exposes for "which channel is
  // this" - a video's watch page doesn't put the channel in the URL, so this
  // has to look at the DOM/embedded JSON instead of just location.pathname.
  function currentPageChannelRefs() {
    const refs = new Set();
    const path = location.pathname;

    // Direct channel/handle pages - identifier is right there in the URL.
    const directMatch = path.match(/^\/(channel\/UC[\w-]+|c\/[\w.-]+|user\/[\w.-]+|@[\w.-]+)/i);
    if (directMatch) refs.add(normalizeChannelRef(directMatch[1]));

    // Canonical link - present on watch pages and set to the channel URL on
    // channel pages, so this covers both.
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical) refs.add(normalizeChannelRef(canonical));

    // itemprop channelId - present on watch pages once the player metadata
    // is in the DOM.
    const metaChannelId = document.querySelector('meta[itemprop="channelId"]')?.content;
    if (metaChannelId) refs.add(normalizeChannelRef(metaChannelId));

    // Owner link in the video description area (renders slightly later than
    // the meta tags above, so this is a second chance to catch it).
    const ownerLink = document.querySelector(
      "ytd-video-owner-renderer a.yt-simple-endpoint, #owner a.yt-simple-endpoint, " +
      "ytd-playlist-sidebar-renderer #owner-text a, ytd-playlist-header-renderer #owner-text a, " +
      "ytd-playlist-byline-renderer #owner-text a"
    )?.getAttribute("href");
    if (ownerLink) refs.add(normalizeChannelRef(ownerLink));

    // Last resort: scan the embedded page-data script for a channelId/handle
    // pair. This is a plain regex scan, not a JSON.parse of the whole blob -
    // ytInitialData is large and its shape shifts often, and all this needs
    // is "does this string contain a channel identifier anywhere".
    if (refs.size === 0) {
      for (const script of document.querySelectorAll("script")) {
        const text = script.textContent;
        if (!text || !text.includes("channelId")) continue;
        const idMatch = text.match(/"channelId":"(UC[\w-]{20,})"/);
        if (idMatch) refs.add(normalizeChannelRef(idMatch[1]));
        const handleMatch = text.match(/"canonicalBaseUrl":"\/(@[\w.-]+)"/);
        if (handleMatch) refs.add(normalizeChannelRef(handleMatch[1]));
        if (refs.size) break;
      }
    }

    refs.delete("");
    return refs;
  }

  // Pulls the channel's human-readable DISPLAY NAME off the page (e.g.
  // "Eduniti"), separately from currentPageChannelRefs()'s handles/IDs.
  //
  // Someone adding a channel to their allow/block list on the website has
  // no reason to already know its @handle - they know it as "Eduniti", not
  // "@mohitgoenka99". If they type the display name, normalizeChannelRef()
  // stores it as a literal id ("eduniti") that will never equal any of the
  // real identifiers a video page exposes. That made search results look
  // right (search matching is already loose, word-based) while clicking
  // into the actual video got blocked anyway - confusing, and the
  // displayed name is right there on the page the whole time. This closes
  // that gap by feeding the display name through the same loose word-match
  // used for search cards (see itemMatchesListedChannel/nameMatchesListedChannel).
  function currentPageChannelNames() {
    const names = new Set();

    // Present on watch pages once player metadata has loaded - the most
    // reliable source, exact display name as YouTube itself renders it.
    const metaName = document.querySelector('span[itemprop="author"] link[itemprop="name"]')?.content;
    if (metaName) names.add(metaName);

    // Owner renderer under the video - renders slightly later than the
    // meta tag above, so this is a second chance to catch it.
    const ownerText = document.querySelector(
      "ytd-video-owner-renderer ytd-channel-name #text, #owner #channel-name #text, #owner ytd-channel-name yt-formatted-string, " +
      "ytd-playlist-sidebar-renderer #owner-text a, ytd-playlist-header-renderer #owner-text a, " +
      "ytd-playlist-byline-renderer #owner-text a"
    )?.textContent;
    if (ownerText) names.add(ownerText);

    // Channel page header (visiting the channel's own /@handle page
    // directly, not a video).
    const channelHeaderText = document.querySelector(
      "ytd-channel-name #text, #channel-name #text"
    )?.textContent;
    if (channelHeaderText) names.add(channelHeaderText);

    // Last resort, mirrors the channelId regex scan above - embedded
    // page-data JSON almost always has an "author":"..." field on watch
    // pages.
    if (names.size === 0) {
      for (const script of document.querySelectorAll("script")) {
        const text = script.textContent;
        if (!text || !text.includes('"author"')) continue;
        const m = text.match(/"author":"([^"]{1,100})"/);
        if (m) names.add(m[1]);
        if (names.size) break;
      }
    }

    names.delete("");
    return names;
  }

  // True if any of the page's display names is "about" one of the listed
  // channels, using the exact same loose word-match as search queries -
  // every word of one side appears in the other, order-independent,
  // case-insensitive. Lets a channel added by typed display name ("eduniti")
  // still match the real page even though it's not an exact handle/id.
  function nameMatchesListedChannel(names, channels) {
    for (const name of names) {
      const nameWords = wordsOf(name);
      if (nameWords.length === 0) continue;
      for (const c of channels) {
        const labelWords = wordsOf(c.label);
        const idWords = wordsOf(String(c.id || "").replace(/^@/, ""));
        if (
          containsAllWords(labelWords, nameWords) ||
          containsAllWords(nameWords, labelWords) ||
          containsAllWords(idWords, nameWords) ||
          containsAllWords(nameWords, idWords)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // Home feed - always reachable in "allow" mode, full stop.
  function isHomePage() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path === "/";
  }

  function isSearchResultsPage() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path === "/results";
  }

  // Loose text match: lowercase, collapse anything that isn't a letter or
  // digit down to single spaces, split into words. Case never matters;
  // what matters is whether the same words appear in the same order.
  function normalizeForMatch(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function wordsOf(raw) {
    const normalized = normalizeForMatch(raw);
    return normalized ? normalized.split(" ") : [];
  }

  // True if every word in `needle` also appears somewhere in `haystack`
  // (order doesn't matter, e.g. "gaming mrbeast" and "mrbeast gaming"
  // count the same) - but each is still whole-word matching, not a
  // character-substring check, so a search for "mr" won't match a channel
  // called "MrBeast" just because "mr" is a substring of it.
  function containsAllWords(haystackWords, needleWords) {
    if (needleWords.length === 0) return false;
    const haystackSet = new Set(haystackWords);
    return needleWords.every((w) => haystackSet.has(w));
  }

  // Result cards on a /results page that plausibly attribute to a single
  // channel - each of these renders its channel's byline as a real link
  // (an @handle or /channel/UC... href), same as a watch page's owner link.
  // Shelves/headers/ads and the Shorts shelf (ytd-reel-shelf-renderer -
  // its individual ytd-reel-item-renderer cards don't reliably expose a
  // byline link in the DOM) are deliberately left out of this selector, not
  // filtered at all - see the comment on applySearchFilter() below for why
  // that's the safe default in each mode.
  const SEARCH_RESULT_SELECTOR =
    "ytd-video-renderer, ytd-channel-renderer, ytd-playlist-renderer, ytd-radio-renderer";

  // Pulls the same kind of identifiers/names currentPageChannelRefs() and
  // currentPageChannelNames() pull for a whole page, but scoped to one
  // result card - works for a video/playlist/mix card's byline link just as
  // well as a channel-result card's own link to itself.
  function channelInfoForItem(item) {
    const refs = new Set();
    for (const a of item.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/^\/(channel\/UC[\w-]+|c\/[\w.-]+|user\/[\w.-]+|@[\w.-]+)/i);
      if (m) refs.add(normalizeChannelRef(m[1]));
    }
    const names = new Set();
    const nameEl = item.querySelector(
      "ytd-channel-name #text, #channel-title #text, .ytd-channel-name"
    );
    const nameText = nameEl?.textContent?.trim();
    if (nameText) names.add(nameText);
    refs.delete("");
    names.delete("");
    return { refs, names };
  }

  function itemMatchesListedChannel(item, listed, channels) {
    const { refs, names } = channelInfoForItem(item);
    if ([...refs].some((r) => listed.has(r))) return true;
    return nameMatchesListedChannel(names, channels);
  }

  // Shows/hides each result card on the current /results page based on ITS
  // OWN byline channel, not the search query as a whole - see the module
  // doc comment for why. Cards outside SEARCH_RESULT_SELECTOR (shelves,
  // Shorts, ads, "people also search for") aren't touched by this at all:
  //   - "allow" mode only shows cards it can positively confirm belong to a
  //     listed channel, so anything unattributable defaults to HIDDEN - a
  //     shelf/card type this can't read is treated the same as "not
  //     listed", never accidentally left visible.
  //   - "block" mode only hides cards it can positively confirm belong to a
  //     blocked channel, so anything unattributable defaults to VISIBLE -
  //     "block" is meant to remove specific channels, not everything this
  //     script happens not to recognize.
  // Cards whose byline link hasn't rendered yet (channelInfoForItem finds
  // nothing) get the same safe default as "unattributable" above, and get
  // corrected on the next pass once YouTube finishes rendering them - the
  // MutationObserver below keeps that pass coming.
  function applySearchFilter(mode, listed, channels) {
    for (const item of document.querySelectorAll(SEARCH_RESULT_SELECTOR)) {
      const matches = itemMatchesListedChannel(item, listed, channels);
      if (mode === "allow") {
        item.style.display = matches ? "" : "none";
      } else {
        item.style.display = matches ? "none" : "";
      }
    }
  }

  // Un-hides everything the filter above may have hidden - needed whenever
  // rules stop applying (session ends, or a mid-session edit removes the
  // last channel) so a search filtered earlier doesn't stay stuck with
  // hidden cards after the reason for hiding them is gone.
  function resetSearchFilter() {
    for (const item of document.querySelectorAll(SEARCH_RESULT_SELECTOR)) {
      item.style.display = "";
    }
  }

  // Debounced entry point for the MutationObserver below - YouTube's
  // infinite-scroll search results append DOM nodes continuously without
  // ever firing yt-navigate-finish (that only fires on a real internal
  // navigation), so this is the only way to keep newly-loaded cards
  // filtered too. requestAnimationFrame batches a burst of mutations
  // (a single scroll can trigger dozens) down to one pass.
  let searchFilterScheduled = false;
  function scheduleSearchFilter() {
    if (!isSearchResultsPage() || searchFilterScheduled) return;
    searchFilterScheduled = true;
    requestAnimationFrame(async () => {
      searchFilterScheduled = false;
      if (!isSearchResultsPage()) return;
      const { revm2Session } = await chrome.storage.local.get("revm2Session");
      const rules = revm2Session?.active ? revm2Session.youtubeRules : null;
      if (!rules || !Array.isArray(rules.channels) || rules.channels.length === 0) {
        resetSearchFilter();
        return;
      }
      const listed = new Set(rules.channels.map((c) => normalizeChannelRef(c.id)));
      applySearchFilter(rules.mode, listed, rules.channels);
    });
  }

  new MutationObserver(scheduleSearchFilter).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  function goToBlockedPage(reasonSite) {
    const url = chrome.runtime.getURL(
      `blocked/blocked.html?site=${encodeURIComponent(reasonSite)}&youtube=1`
    );
    window.location.replace(url);
  }

  async function evaluate() {
    if (lastChecked === location.href) return;

    const { revm2Session } = await chrome.storage.local.get("revm2Session");
    const rules = revm2Session?.active ? revm2Session.youtubeRules : null;
    if (!rules || !Array.isArray(rules.channels) || rules.channels.length === 0) {
      lastChecked = location.href;
      if (isSearchResultsPage()) resetSearchFilter();
      return;
    }

    const listed = new Set(rules.channels.map((c) => normalizeChannelRef(c.id)));
    const refs = currentPageChannelRefs();
    const names = currentPageChannelNames();

    // youtube-guard.js runs at document_start (see manifest.json) so it
    // can catch a video before it starts playing - but that means this
    // very first call can fire before YouTube's SPA has put ANY metadata
    // in the DOM yet. On a watch/channel page, refs and names both being
    // empty at that point doesn't mean "not the allowed channel" - it
    // means "don't know yet". Treating it as a block was wrong: in
    // "allow" mode this fired an immediate, incorrect redirect before the
    // real page (and the DOMContentLoaded/load/yt-navigate-finish
    // rechecks meant to catch this) ever got a chance to run with actual
    // data - the tab had already navigated to blocked.html by then.
    // Deliberately do NOT set lastChecked here (unlike every other return
    // in this function) - the dedup check above must NOT block those
    // later rechecks for this same URL once real metadata exists.
    const isNavigationSurface = isHomePage() || isSearchResultsPage();
    if (!isNavigationSurface && refs.size === 0 && names.size === 0) {
      return;
    }

    lastChecked = location.href;

    const onListedChannel =
      [...refs].some((r) => listed.has(r)) || nameMatchesListedChannel(names, rules.channels);

    if (rules.mode === "allow") {
      // "allow" mode - only a listed channel's own pages stay reachable,
      // plus two deliberate exceptions:
      //   1. the home feed, always
      //   2. the search results page's SHELL - the page itself always
      //      stays reachable now; applySearchFilter() below hides any
      //      individual result card that isn't confirmed to belong to a
      //      listed channel, using each card's own byline link rather
      //      than the query text (see the module doc comment for why -
      //      the old query-text approach blocked the whole page for any
      //      search that didn't happen to share words with a channel's
      //      saved label, which is the common case, not an edge case).
      // Everything else not on the list - Shorts feed, another channel's
      // page, or a video from another channel - still gets blocked.
      const allowedHere = onListedChannel || isHomePage() || isSearchResultsPage();
      if (!allowedHere) {
        goToBlockedPage(refs.values().next().value || location.hostname);
      }
    } else {
      // "block" mode - only stop the specific listed channels; navigation
      // surfaces (home, search, etc.) are left alone, though search
      // results specifically still get their matching cards hidden below.
      if (onListedChannel) goToBlockedPage(refs.values().next().value || location.hostname);
    }

    if (isSearchResultsPage()) {
      applySearchFilter(rules.mode, listed, rules.channels);
    }
  }

  // Initial load.
  evaluate();
  // Re-check once the DOM settles, since watch-page channel metadata often
  // isn't present yet at document_start/document_end.
  document.addEventListener("DOMContentLoaded", evaluate);
  window.addEventListener("load", evaluate);
  // YouTube is a single-page app - it swaps content via the History API
  // instead of doing real navigations, so declarativeNetRequest never
  // re-fires and even document_end only runs once per real page load.
  // YouTube's own front-end dispatches this event after every internal
  // navigation finishes rendering, which is exactly the hook needed here.
  window.addEventListener("yt-navigate-finish", () => {
    // Give the new page's metadata a beat to land in the DOM.
    setTimeout(evaluate, 150);
  });

  // A tab that's already sitting open on some channel BEFORE a session
  // (or a mid-session edit to youtubeRules) starts never fires any of the
  // events above - nothing navigates, nothing loads. Left alone, someone
  // could just have the disallowed channel open in a background tab the
  // whole time and it would never get caught. storage.onChanged fires the
  // moment background.js writes the new revm2Session (session start, end,
  // or a rules update mid-session via addYoutubeChannelToActiveSession),
  // so force a fresh check right then - reset lastChecked since the URL
  // itself hasn't changed, only the rules being checked against it have.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.revm2Session) return;
    lastChecked = null;
    evaluate();
  });
})();
