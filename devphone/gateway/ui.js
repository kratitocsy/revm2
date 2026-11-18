// Turns a uiautomator XML dump into a compact list agents can act on by text or id instead of pixels.

const ATTR = /([\w-]+)="([^"]*)"/g;
const BOUNDS = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/;

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Every node that has text, a content description, a resource id, or is clickable/scrollable/editable. */
export function parseUi(xml) {
  const nodes = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const a = {};
    for (const [, k, v] of m[1].matchAll(ATTR)) a[k] = decode(v);
    const b = BOUNDS.exec(a.bounds || '');
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    if (x2 <= x1 || y2 <= y1) continue;
    const node = {
      text: a.text || undefined,
      desc: a['content-desc'] || undefined,
      id: a['resource-id'] || undefined,
      cls: (a.class || '').split('.').pop() || undefined,
      pkg: a.package || undefined,
      clickable: a.clickable === 'true' || undefined,
      scrollable: a.scrollable === 'true' || undefined,
      editable: a.class === 'android.widget.EditText' || undefined,
      checked: a.checked === 'true' || undefined,
      enabled: a.enabled === 'false' ? false : undefined,
      bounds: [x1, y1, x2, y2],
      center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
    };
    if (node.text || node.desc || node.id || node.clickable || node.scrollable || node.editable) nodes.push(node);
  }
  return nodes;
}

/**
 * Finds the best node for a tap target. Exact text/desc wins over a substring match; clickable nodes win
 * ties. `id` may be the full resource id or just its last part ("login_button").
 */
export function findNode(nodes, { text, id }) {
  if (id) {
    const hit = nodes.find(n => n.id === id) || nodes.find(n => n.id && n.id.endsWith('/' + id));
    if (hit) return hit;
  }
  if (text) {
    const t = text.toLowerCase();
    const label = n => [n.text, n.desc].filter(Boolean).map(s => s.toLowerCase());
    const score = n => {
      const ls = label(n);
      if (ls.some(s => s === t)) return n.clickable ? 4 : 3;
      if (ls.some(s => s.includes(t))) return n.clickable ? 2 : 1;
      return 0;
    };
    let best = null, bestScore = 0;
    for (const n of nodes) {
      const s = score(n);
      if (s > bestScore) { best = n; bestScore = s; }
    }
    if (best) return best;
  }
  return null;
}
