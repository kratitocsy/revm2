// RevM2 - adult content heuristic (page-text layer).
//
// The static layers (rules/adult-blocklist.json, rules/adult-keyword-
// domains.json) and the RTA tag check (content/rta-check.js) all key off
// the DOMAIN or a self-declared meta tag. That misses one common case:
// text-based "story" porn sites (Antarvasna is the best-known Hindi
// example, but there are many English-language equivalents too) that get
// republished on generic, otherwise-innocent hosting - a random blogspot
// subdomain, a wordpress.com blog, a pastebin-style site, a rotating
// throwaway domain that isn't on any list yet.
//
// This is a second, content-level layer: it looks at what's actually on
// the page (title, meta description/keywords, and a sample of the visible
// text) and only redirects if SEVERAL distinct, high-signal explicit terms
// show up together - a single incidental word (e.g. a news article that
// mentions "porn" once, a sex-ed page) will not trip this. It's
// deliberately conservative: false positives are far more annoying than a
// missed site, and the domain-level layers above still catch the bulk of
// adult content anyway.
//
// Like rta-check.js, this only runs at all when the person has "Block
// adult content" switched on in the extension's options page - it has
// zero effect on browsing otherwise.

(function () {
  chrome.storage.local.get("revm2Settings", ({ revm2Settings }) => {
    if (!revm2Settings || !revm2Settings.blockAdultContent) return;

    // High-signal terms only - things that show up densely on explicit
    // pages but essentially never together on non-adult pages. Mixes
    // English terms with common Hindi-transliteration terms used by desi
    // text-story sites, since that's the specific gap this layer exists to
    // close (see rules/adult-keyword-domains.json for the matching domain-
    // name layer).
    const KEYWORDS = [
      "hardcore porn", "free porn", "porn video", "xxx video", "sex video",
      "nude photos", "hentai manga", "escort service", "cam girl",
      "live sex cam", "adult video chat",
      // Hindi/desi story-site terms (transliterated)
      "chudai kahani", "chudai story", "sex kahani", "hindi sex story",
      "hindi sex stories", "desi sex story", "bhabhi sex story",
      "antarvasna", "kamukta katha", "kamvasna kahani",
    ];

    const MATCH_THRESHOLD = 3; // need several distinct hits, not just one

    function collectPageText() {
      const parts = [document.title || ""];
      const metaDesc = document.querySelector('meta[name="description"]');
      const metaKeywords = document.querySelector('meta[name="keywords"]');
      if (metaDesc) parts.push(metaDesc.getAttribute("content") || "");
      if (metaKeywords) parts.push(metaKeywords.getAttribute("content") || "");
      // A capped sample of visible text is enough to catch a story page's
      // own words without doing expensive full-DOM work on every page.
      if (document.body && document.body.innerText) {
        parts.push(document.body.innerText.slice(0, 6000));
      }
      return parts.join(" \n ").toLowerCase();
    }

    function checkAndBlock() {
      const text = collectPageText();
      let hits = 0;
      for (const kw of KEYWORDS) {
        if (text.includes(kw)) {
          hits += 1;
          if (hits >= MATCH_THRESHOLD) break;
        }
      }
      if (hits >= MATCH_THRESHOLD) {
        const site = encodeURIComponent(location.hostname);
        const blockedUrl = chrome.runtime.getURL(
          `blocked/blocked.html?site=${site}&adult=1&reason=content`
        );
        window.location.replace(blockedUrl);
      }
    }

    // document_end usually means most of the initial HTML is already
    // parsed, but give text-heavy pages (long story posts) a moment to
    // finish rendering before sampling innerText.
    if (document.readyState === "complete") {
      checkAndBlock();
    } else {
      window.addEventListener("load", checkAndBlock, { once: true });
    }
  });
})();
