#!/usr/bin/env node
// devphone MCP server (stdio). Gives an AI agent tools to see and drive a devphone gateway.
// Config: DEVPHONE_URL, DEVPHONE_TOKEN, optional DEVPHONE_HOLDER (lease name, default "agent-<pid>").
// Behind an HTTPS proxy, run Node with NODE_USE_ENV_PROXY=1 so fetch uses it.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const BASE = (process.env.DEVPHONE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.DEVPHONE_TOKEN || '';
const HOLDER = process.env.DEVPHONE_HOLDER || `agent-${process.pid}`;

async function call(method, path, body, { raw = false, binary } = {}) {
  if (!BASE || !TOKEN) throw new Error('devphone is not configured: set DEVPHONE_URL and DEVPHONE_TOKEN for this MCP server.');
  const headers = { authorization: `Bearer ${TOKEN}`, 'x-devphone-holder': HOLDER };
  let payload;
  if (binary) { payload = binary; headers['content-type'] = 'application/vnd.android.package-archive'; }
  else if (body) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  if (raw && r.ok) return Buffer.from(await r.arrayBuffer());
  const j = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw new Error(`${r.status}: ${j.error || 'request failed'}`);
  return j;
}

const text = obj => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1) }] });
async function screenshot(note) {
  const png = await call('GET', '/api/screenshot', null, { raw: true });
  const content = [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }];
  if (note) content.unshift({ type: 'text', text: note });
  return { content };
}
const after = async (note, settleMs = 600) => { await new Promise(r => setTimeout(r, settleMs)); return screenshot(note); };

/** Compact one-line-per-element view of the UI tree; cheaper for the model than raw JSON. */
function formatUi(nodes) {
  return nodes.map((n, i) => {
    const label = [n.text && `"${n.text}"`, n.desc && `desc="${n.desc}"`, n.id && `id=${n.id.split('/').pop()}`].filter(Boolean).join(' ');
    const flags = [n.clickable && 'click', n.editable && 'edit', n.scrollable && 'scroll', n.checked && 'checked', n.enabled === false && 'disabled'].filter(Boolean).join(',');
    return `${i}. ${n.cls || '?'} ${label}${flags ? ' [' + flags + ']' : ''} @${n.center.join(',')}`;
  }).join('\n') || '(no elements)';
}

const num = { type: 'number' };
const TOOLS = [
  { name: 'phone_status', description: 'Is the phone online, which app is in front, who holds the lease.', inputSchema: { type: 'object', properties: {} },
    run: async () => text(await call('GET', '/api/status')) },
  { name: 'phone_screenshot', description: 'Take a screenshot of the phone screen.', inputSchema: { type: 'object', properties: {} },
    run: () => screenshot() },
  { name: 'phone_ui', description: 'List on-screen elements (text, content description, resource id, flags, center point). Prefer tapping by text/id over pixel coordinates.', inputSchema: { type: 'object', properties: {} },
    run: async () => text(formatUi((await call('GET', '/api/ui')).nodes)) },
  { name: 'phone_tap', description: 'Tap an element by visible text / content description, by resource id, or at x,y pixels. Returns a screenshot after the tap.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, id: { type: 'string' }, x: num, y: num } },
    run: async a => { const r = await call('POST', '/api/tap', a); return after(`Tapped at ${r.tapped.join(',')}`); } },
  { name: 'phone_swipe', description: 'Swipe from (x1,y1) to (x2,y2) in pixels. Use for scrolling. Returns a screenshot.',
    inputSchema: { type: 'object', properties: { x1: num, y1: num, x2: num, y2: num, ms: num }, required: ['x1', 'y1', 'x2', 'y2'] },
    run: async a => { await call('POST', '/api/swipe', a); return after('Swiped'); } },
  { name: 'phone_type', description: 'Type text into the focused field (tap the field first).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: async a => { await call('POST', '/api/text', a); return after('Typed'); } },
  { name: 'phone_key', description: 'Press a key: back, home, recents, enter, delete, tab, up, down, left, right, power, or an Android keycode number.',
    inputSchema: { type: 'object', properties: { key: { type: ['string', 'number'] } }, required: ['key'] },
    run: async a => { await call('POST', '/api/key', a); return after(`Pressed ${a.key}`); } },
  { name: 'phone_install', description: 'Install an APK from a local file path or an https URL, optionally launching a package afterwards.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, url: { type: 'string' }, launch: { type: 'string', description: 'package to launch after install' } } },
    run: async a => {
      let apk;
      if (a.path) apk = await readFile(a.path);
      else if (a.url) { const r = await fetch(a.url); if (!r.ok) throw new Error(`download failed: ${r.status}`); apk = Buffer.from(await r.arrayBuffer()); }
      else throw new Error('give path or url');
      const q = a.launch ? `?launch=${encodeURIComponent(a.launch)}` : '';
      const r = await call('POST', '/api/install' + q, null, { binary: apk });
      return a.launch ? after(`Installed ${r.bytes} bytes and launched ${a.launch}`, 2500) : text(r);
    } },
  { name: 'phone_launch', description: 'Launch an installed app by package name. Returns a screenshot.',
    inputSchema: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] },
    run: async a => { await call('POST', '/api/launch', a); return after(`Launched ${a.package}`, 2000); } },
  { name: 'phone_stop', description: 'Force-stop an app by package name.',
    inputSchema: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] },
    run: async a => text(await call('POST', '/api/stop', a)) },
  { name: 'phone_logcat', description: 'Recent device log lines. level E shows errors and crashes only.',
    inputSchema: { type: 'object', properties: { lines: num, level: { type: 'string', enum: ['V', 'D', 'I', 'W', 'E', 'F'] } } },
    run: async a => {
      const q = new URLSearchParams({ lines: String(a.lines || 200) });
      if (a.level) q.set('level', a.level);
      return text((await call('GET', '/api/logcat?' + q)).log || '(empty)');
    } },
  { name: 'phone_lease', description: 'Claim the phone so other agents cannot drive it while you work (they can still watch). Renew before it expires.',
    inputSchema: { type: 'object', properties: { ttlSec: num } },
    run: async a => text(await call('POST', '/api/lease', { holder: HOLDER, ttlSec: a.ttlSec || 600 })) },
  { name: 'phone_release', description: 'Release your lease on the phone.', inputSchema: { type: 'object', properties: {} },
    run: async () => text(await call('DELETE', '/api/lease')) },
];

// ── Minimal MCP over stdio: newline-delimited JSON-RPC 2.0 ──
const out = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  try {
    let result;
    if (method === 'initialize') {
      result = {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'devphone', version: '0.1.0' },
        instructions: 'Tools to see and drive a cloud Android phone. Use phone_ui to find elements, tap by text or id, and phone_logcat level E after a crash. Claim phone_lease for multi-step work.',
      };
    } else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools: TOOLS.map(({ run, ...t }) => t) };
    else if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) throw Object.assign(new Error(`unknown tool ${params?.name}`), { code: -32602 });
      try { result = await tool.run(params.arguments || {}); }
      catch (e) { result = { isError: true, content: [{ type: 'text', text: e.message }] }; }
    } else throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
    out({ jsonrpc: '2.0', id, result });
  } catch (e) {
    out({ jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message } });
  }
});
