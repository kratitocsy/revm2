// Runs the gateway, relay and MCP server against a fake adb. No Android device needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(tmpdir(), `fake-adb-${process.pid}.log`);
process.env.ADB = join(HERE, 'fake-adb.sh');
process.env.FAKE_ADB_LOG = LOG;
const { createGateway } = await import('../gateway/server.js');

const DRIVE = 'drive-token', VIEW = 'view-token';
let gw, base;
before(async () => {
  gw = createGateway({ serial: 'redroid:5555', driveToken: DRIVE, viewToken: VIEW, frameMs: 50 });
  gw.server.listen(0, '127.0.0.1');
  await once(gw.server, 'listening');
  base = `http://127.0.0.1:${gw.server.address().port}`;
});
after(async () => { gw.close(); await rm(LOG, { force: true }); });

const req = (method, path, { token = DRIVE, body, holder, raw } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(holder && { 'x-devphone-holder': holder }), ...(body && !raw && { 'content-type': 'application/json' }) },
    body: raw ? body : body && JSON.stringify(body),
  });
const adbCalls = async () => (await readFile(LOG, 'utf8').catch(() => '')).trim().split('\n');

test('rejects missing and wrong tokens', async () => {
  assert.equal((await req('GET', '/api/status', { token: null })).status, 401);
  assert.equal((await req('GET', '/api/status', { token: 'nope' })).status, 401);
  assert.equal((await req('GET', '/healthz', { token: null })).status, 200);
});

test('view token can watch but not drive', async () => {
  assert.equal((await req('GET', '/api/status', { token: VIEW })).status, 200);
  assert.equal((await req('GET', '/api/screenshot', { token: VIEW })).status, 200);
  assert.equal((await req('POST', '/api/tap', { token: VIEW, body: { x: 1, y: 1 } })).status, 403);
});

test('status reports online device and foreground app', async () => {
  const s = await (await req('GET', '/api/status')).json();
  assert.equal(s.online, true);
  assert.equal(s.foreground, 'com.wynko.app');
});

test('screenshot returns a PNG', async () => {
  const r = await req('GET', '/api/screenshot');
  assert.equal(r.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.readUInt32BE(0), 0x89504e47);
});

test('ui tree is parsed into actionable nodes', async () => {
  const { nodes } = await (await req('GET', '/api/ui')).json();
  const btn = nodes.find(n => n.text === 'Start Focus');
  assert.deepEqual(btn.center, [360, 1050]);
  assert.equal(btn.clickable, true);
  assert.ok(nodes.find(n => n.text === 'Email & phone').editable);
});

test('tap by text, by id and by coordinates', async () => {
  let j = await (await req('POST', '/api/tap', { body: { text: 'start focus' } })).json();
  assert.deepEqual(j.tapped, [360, 1050]);
  j = await (await req('POST', '/api/tap', { body: { id: 'email' } })).json();
  assert.deepEqual(j.tapped, [360, 440]);
  j = await (await req('POST', '/api/tap', { body: { x: 10.4, y: 20.6 } })).json();
  assert.deepEqual(j.tapped, [10.4, 20.6]);
  assert.equal((await req('POST', '/api/tap', { body: { text: 'nothing like this' } })).status, 404);
  const calls = await adbCalls();
  assert.ok(calls.includes('-s redroid:5555 shell input tap 360 1050'));
  assert.ok(calls.includes('-s redroid:5555 shell input tap 10 21'));
});

test('text is escaped for the remote shell', async () => {
  await req('POST', '/api/text', { body: { text: "it's 100% done" } });
  const calls = await adbCalls();
  assert.ok(calls.includes(`-s redroid:5555 shell input text 'it'\\''s%s100%%%sdone'`), calls.at(-1));
});

test('keys by name, unknown key rejected', async () => {
  assert.equal((await req('POST', '/api/key', { body: { key: 'back' } })).status, 200);
  assert.equal((await req('POST', '/api/key', { body: { key: 'warp' } })).status, 400);
  assert.ok((await adbCalls()).includes('-s redroid:5555 shell input keyevent 4'));
});

test('install accepts an apk and launches it', async () => {
  const apk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
  const r = await req('POST', '/api/install?launch=com.wynko.app', { body: apk, raw: true });
  const j = await r.json();
  assert.equal(r.status, 200, j.error);
  assert.equal(j.installed, true);
  assert.equal(j.launched, 'com.wynko.app');
  assert.equal((await req('POST', '/api/install', { body: Buffer.from('not a zip'), raw: true })).status, 400);
});

test('logcat returns lines and validates level', async () => {
  const j = await (await req('GET', '/api/logcat?lines=50&level=E')).json();
  assert.match(j.log, /FATAL EXCEPTION/);
  assert.ok((await adbCalls()).includes('-s redroid:5555 logcat -d -t 50 *:E'));
  assert.equal((await req('GET', '/api/logcat?level=X')).status, 400);
});

test('lease blocks other drivers until released', async () => {
  assert.equal((await req('POST', '/api/lease', { body: { holder: 'agent-a', ttlSec: 60 } })).status, 200);
  assert.equal((await req('POST', '/api/tap', { body: { x: 1, y: 1 }, holder: 'agent-b' })).status, 423);
  assert.equal((await req('POST', '/api/tap', { body: { x: 1, y: 1 }, holder: 'agent-a' })).status, 200);
  assert.equal((await req('POST', '/api/lease', { body: { holder: 'agent-b' } })).status, 423);
  assert.equal((await req('DELETE', '/api/lease', { holder: 'agent-b' })).status, 423);
  assert.equal((await req('DELETE', '/api/lease', { holder: 'agent-a' })).status, 200);
  assert.equal((await req('POST', '/api/tap', { body: { x: 1, y: 1 }, holder: 'agent-b' })).status, 200);
});

test('stream sends multipart PNG frames', async () => {
  const ac = new AbortController();
  const r = await fetch(`${base}/api/stream?token=${VIEW}`, { signal: ac.signal });
  assert.match(r.headers.get('content-type'), /multipart\/x-mixed-replace/);
  const reader = r.body.getReader();
  let got = '';
  while (!got.includes('image/png')) got += Buffer.from((await reader.read()).value).toString('latin1');
  ac.abort();
});

test('viewer page is served', async () => {
  const r = await req('GET', `/?token=${VIEW}`, { token: null });
  assert.match(await r.text(), /devphone/);
});

test('relay serves the gateway without a token in the URL', async () => {
  const port = 18000 + (process.pid % 1000);
  const relay = spawn(process.execPath, [join(HERE, '../relay/relay.js'), String(port)], {
    env: { ...process.env, DEVPHONE_URL: base, DEVPHONE_TOKEN: DRIVE },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await once(relay.stdout, 'data');
    const s = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
    assert.equal(s.online, true);
    const t = await fetch(`http://127.0.0.1:${port}/api/tap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Start Focus' }) });
    assert.equal(t.status, 200);
  } finally { relay.kill(); }
});

test('MCP server lists tools and returns a screenshot image', async () => {
  const mcp = spawn(process.execPath, [join(HERE, '../mcp/server.js')], {
    env: { ...process.env, DEVPHONE_URL: base, DEVPHONE_TOKEN: DRIVE },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]();
  const rpc = async (id, method, params) => {
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return JSON.parse((await lines.next()).value);
  };
  try {
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'devphone');
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc(2, 'tools/list');
    assert.ok(list.result.tools.some(t => t.name === 'phone_tap'));
    const shot = await rpc(3, 'tools/call', { name: 'phone_screenshot', arguments: {} });
    assert.equal(shot.result.content[0].type, 'image');
    const ui = await rpc(4, 'tools/call', { name: 'phone_ui', arguments: {} });
    assert.match(ui.result.content[0].text, /"Start Focus" id=start \[click\] @360,1050/);
    const bad = await rpc(5, 'tools/call', { name: 'phone_tap', arguments: { text: 'missing thing' } });
    assert.equal(bad.result.isError, true);
  } finally { mcp.kill(); }
});
