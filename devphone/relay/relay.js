#!/usr/bin/env node
// Local relay: serves a remote devphone gateway on localhost so a preview pane (Claude Code's, an IDE's)
// can show the live phone without the token in the URL. The relay adds the token to every request.
// Usage: DEVPHONE_URL=https://phone.example.com DEVPHONE_TOKEN=... node relay.js [port]
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1.
import http from 'node:http';
import { Readable } from 'node:stream';

const BASE = (process.env.DEVPHONE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.DEVPHONE_TOKEN || process.env.DEVPHONE_VIEW_TOKEN || '';
const PORT = Number(process.argv[2] || process.env.PORT || 8701);
if (!BASE || !TOKEN) {
  console.error('Set DEVPHONE_URL and DEVPHONE_TOKEN (or DEVPHONE_VIEW_TOKEN for watch-only).');
  process.exit(1);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    url.searchParams.delete('token');
    const headers = { authorization: `Bearer ${TOKEN}` };
    for (const h of ['content-type', 'x-devphone-holder', 'x-devphone-force']) if (req.headers[h]) headers[h] = req.headers[h];
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(BASE + url.pathname + url.search, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    });
    const out = {};
    for (const h of ['content-type', 'cache-control']) { const v = upstream.headers.get(h); if (v) out[h] = v; }
    res.writeHead(upstream.status, out);
    if (!upstream.body) return res.end();
    const body = Readable.fromWeb(upstream.body);
    res.on('close', () => body.destroy());
    body.on('error', () => res.end());
    body.pipe(res);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'relay: ' + e.message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`devphone relay: http://127.0.0.1:${PORT}/ -> ${BASE}`));
