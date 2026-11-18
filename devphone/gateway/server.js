// devphone gateway: an HTTP API, a live screen stream and a browser viewer for one Android device.
// No dependencies beyond Node 20+ and the adb binary.
import http from 'node:http';
import { readFile, writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Adb, KEYCODES } from './adb.js';
import { parseUi, findNode } from './ui.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function createGateway(opts = {}) {
  const cfg = {
    serial: opts.serial ?? process.env.ADB_SERIAL ?? 'localhost:5555',
    driveToken: opts.driveToken ?? process.env.DEVPHONE_TOKEN ?? '',
    viewToken: opts.viewToken ?? process.env.DEVPHONE_VIEW_TOKEN ?? '',
    frameMs: Number(opts.frameMs ?? process.env.DEVPHONE_FRAME_MS ?? 250),
    maxApkBytes: Number(opts.maxApkBytes ?? process.env.DEVPHONE_MAX_APK_MB ?? 300) * 1024 * 1024,
  };
  if (!cfg.driveToken) throw new Error('DEVPHONE_TOKEN must be set (the token that can drive the phone).');
  const adb = new Adb(cfg.serial);

  // ── Lease: one driver at a time. Watching never needs it. ──
  let lease = null; // { holder, id, expires }
  const leaseActive = () => (lease && lease.expires > Date.now() ? lease : (lease = null));

  // ── Shared frame loop: captures only while someone is watching; every viewer gets the same frame. ──
  const watchers = new Set();
  let lastFrame = null, looping = false;
  async function frameLoop() {
    if (looping) return;
    looping = true;
    while (watchers.size) {
      const t0 = Date.now();
      try {
        const png = await adb.screenshot();
        if (png.length > 8 && (!lastFrame || !png.equals(lastFrame))) {
          lastFrame = png;
          for (const w of watchers) w(png);
        }
      } catch {
        await adb.connect().catch(() => {});
        await sleep(1000);
      }
      await sleep(Math.max(0, cfg.frameMs - (Date.now() - t0)));
    }
    looping = false;
  }

  function role(req, url) {
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token') || '';
    if (tok && safeEq(tok, cfg.driveToken)) return 'drive';
    if (tok && cfg.viewToken && safeEq(tok, cfg.viewToken)) return 'view';
    return null;
  }

  function checkLease(req) {
    const l = leaseActive();
    if (!l) return null;
    const holder = req.headers['x-devphone-holder'];
    return holder === l.holder ? null : `phone is leased to "${l.holder}" for ${Math.ceil((l.expires - Date.now()) / 1000)}s more`;
  }

  async function uiNodes() {
    return parseUi(await adb.uiXml());
  }

  const routes = {
    'GET /api/status': async () => {
      const online = await adb.isOnline();
      const l = leaseActive();
      return {
        serial: cfg.serial,
        online,
        foreground: online ? await adb.foregroundPackage() : null,
        size: lastFrame ? pngSize(lastFrame) : null,
        lease: l ? { holder: l.holder, expiresInSec: Math.ceil((l.expires - Date.now()) / 1000) } : null,
        watchers: watchers.size,
      };
    },
    'GET /api/ui': async () => ({ nodes: await uiNodes() }),
    'POST /api/tap': async b => {
      if (b.text || b.id) {
        const node = findNode(await uiNodes(), b);
        if (!node) throw httpError(404, `no element matching ${JSON.stringify(b.text ?? b.id)}`);
        await adb.tap(...node.center);
        return { tapped: node.center, node };
      }
      need(b, 'x', 'y');
      await adb.tap(b.x, b.y);
      return { tapped: [b.x, b.y] };
    },
    'POST /api/swipe': async b => {
      need(b, 'x1', 'y1', 'x2', 'y2');
      await adb.swipe(b.x1, b.y1, b.x2, b.y2, b.ms ?? 300);
      return { ok: true };
    },
    'POST /api/text': async b => {
      if (typeof b.text !== 'string') throw httpError(400, 'text is required');
      await adb.type(b.text);
      return { ok: true };
    },
    'POST /api/key': async b => {
      const code = typeof b.key === 'number' ? b.key : KEYCODES[String(b.key).toLowerCase()];
      if (code == null) throw httpError(400, `unknown key ${b.key}; use one of ${Object.keys(KEYCODES).join(', ')} or a keycode number`);
      await adb.key(code);
      return { ok: true };
    },
    'POST /api/launch': async b => {
      need(b, 'package');
      await adb.launch(b.package);
      return { ok: true };
    },
    'POST /api/stop': async b => {
      need(b, 'package');
      await adb.stop(b.package);
      return { ok: true };
    },
    'GET /api/logcat': async (_, url) => {
      const lines = Math.min(Number(url.searchParams.get('lines') || 200), 5000);
      const level = (url.searchParams.get('level') || '').toUpperCase();
      if (level && !/^[VDIWEF]$/.test(level)) throw httpError(400, 'level must be one of V D I W E F');
      return { log: await adb.logcat(lines, level) };
    },
    'POST /api/lease': async (b, _, req) => {
      need(b, 'holder');
      const l = leaseActive();
      if (l && l.holder !== b.holder) throw httpError(423, `phone is leased to "${l.holder}"`);
      const ttl = Math.min(Math.max(Number(b.ttlSec || 600), 10), 4 * 3600);
      lease = { holder: String(b.holder), id: l?.id || randomUUID(), expires: Date.now() + ttl * 1000 };
      return { holder: lease.holder, expiresInSec: ttl };
    },
    'DELETE /api/lease': async (_, __, req) => {
      const l = leaseActive();
      if (l && req.headers['x-devphone-holder'] !== l.holder && !req.headers['x-devphone-force']) {
        throw httpError(423, `phone is leased to "${l.holder}"; send x-devphone-force: 1 to break it`);
      }
      lease = null;
      return { ok: true };
    },
  };

  // Routes anyone with a view token may call; everything else needs the drive token.
  const VIEW_OK = new Set(['GET /', 'GET /api/status', 'GET /api/screenshot', 'GET /api/stream', 'GET /api/ui', 'GET /api/logcat']);
  // Routes that change the phone and therefore respect the lease.
  const LEASED = new Set(['POST /api/tap', 'POST /api/swipe', 'POST /api/text', 'POST /api/key', 'POST /api/launch', 'POST /api/stop', 'POST /api/install']);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const key = `${req.method} ${url.pathname}`;
    try {
      if (key === 'GET /healthz') return send(res, 200, { ok: true });
      const who = role(req, url);
      if (!who) return send(res, 401, { error: 'missing or wrong token' });
      if (who === 'view' && !VIEW_OK.has(key)) return send(res, 403, { error: 'this token can only watch' });
      if (LEASED.has(key)) {
        const busy = checkLease(req);
        if (busy) return send(res, 423, { error: busy });
      }

      if (key === 'GET /') {
        const html = await readFile(join(HERE, 'viewer.html'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html);
      }
      if (key === 'GET /api/screenshot') {
        const png = await adb.screenshot();
        lastFrame = png;
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        return res.end(png);
      }
      if (key === 'GET /api/stream') return stream(req, res);
      if (key === 'POST /api/install') return send(res, 200, await install(req, url));

      const handler = routes[key];
      if (!handler) return send(res, 404, { error: `no route ${key}` });
      const body = req.method === 'POST' ? await readJson(req) : {};
      return send(res, 200, await handler(body, url, req));
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  });

  function stream(req, res) {
    const boundary = 'devphoneframe';
    res.writeHead(200, {
      'content-type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'cache-control': 'no-store',
      connection: 'close',
    });
    // Each part ends with the next boundary, so browsers show a frame as soon as it arrives instead of
    // waiting for the following one (which never comes while the screen is still).
    res.write(`--${boundary}\r\n`);
    const push = png => {
      res.write(`content-type: image/png\r\ncontent-length: ${png.length}\r\n\r\n`);
      res.write(png);
      res.write(`\r\n--${boundary}\r\n`);
    };
    if (lastFrame) push(lastFrame);
    watchers.add(push);
    res.on('close', () => watchers.delete(push));
    frameLoop();
  }

  async function install(req, url) {
    const buf = await readBody(req, cfg.maxApkBytes);
    if (buf.length < 4 || buf.readUInt32BE(0) !== 0x504b0304) throw httpError(400, 'body must be the raw .apk file (a zip)');
    const dir = await mkdtemp(join(tmpdir(), 'devphone-'));
    const file = join(dir, 'app.apk');
    await writeFile(file, buf);
    try {
      const out = await adb.install(file);
      if (!/Success/.test(out)) throw httpError(500, out.trim());
      const pkg = url.searchParams.get('launch');
      if (pkg) await adb.launch(pkg);
      return { installed: true, bytes: buf.length, launched: pkg || null, output: out.trim() };
    } finally {
      await unlink(file).catch(() => {});
    }
  }

  // Keep the network device attached (redroid restarts, adb server restarts).
  const keepAlive = setInterval(async () => { if (!(await adb.isOnline())) await adb.connect().catch(() => {}); }, 15000);
  keepAlive.unref();
  adb.connect().catch(() => {});

  return { server, adb, close: () => { clearInterval(keepAlive); watchers.clear(); server.close(); } };
}

// ── helpers ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeEq(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function need(b, ...keys) {
  for (const k of keys) if (b[k] == null || b[k] === '') throw httpError(400, `${k} is required`);
}
function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'body too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw httpError(400, 'body must be JSON'); }
}
function pngSize(png) {
  return png.length > 24 ? { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8700);
  const { server } = createGateway();
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`devphone gateway on :${port}`));
}
