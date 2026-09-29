// Renders the Wynko ad set (ads.mjs) to PNG with Playwright.
//   node marketing/ads/build.mjs          -> all 30
//   node marketing/ads/build.mjs 03 17    -> just those ids
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADS, SIZES } from './ads.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'png');
const SRC = path.join(HERE, 'html');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

const CSS = fs.readFileSync(path.join(HERE, 'ads.css'), 'utf8');

function page(ad) {
  const { w, h } = SIZES[ad.size];
  const assets = path.relative(SRC, ROOT).split(path.sep).join('/');
  const body = ad.body.replaceAll('{{A}}', assets);
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body><div class="ad ${ad.size} glow-${ad.glow || 'orange'}" style="width:${w}px;height:${h}px">
  <div class="bg"></div>
  <header><img class="logo" src="${assets}/wynko-logo.png" alt="Wynko"><span class="tagline">Focus · Study · Together</span></header>
  <main>${body}</main>
  <footer><div class="cta">${ad.cta} <span>→</span></div><div class="url">wynko.in</div></footer>
</div></body></html>`;
}

const only = process.argv.slice(2);
const list = only.length ? ADS.filter((a) => only.includes(a.id)) : ADS;

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
for (const ad of list) {
  const { w, h } = SIZES[ad.size];
  const file = path.join(SRC, `${ad.id}-${ad.slug}.html`);
  fs.writeFileSync(file, page(ad));
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  await p.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  // Flag any content that spills outside <main> (into header/footer) or off the canvas.
  const overflow = await p.evaluate(() => {
    const m = document.querySelector('main').getBoundingClientRect();
    const ad = document.querySelector('.ad').getBoundingClientRect();
    let worst = 0;
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      worst = Math.max(worst, m.top - r.top, r.bottom - m.bottom, ad.left + 40 - r.left, r.right - (ad.right - 40));
    }
    return worst > 1 ? `${Math.round(worst)}px` : null;
  });
  const png = path.join(OUT, `wynko-ad-${ad.id}-${ad.slug}.png`);
  await p.locator('.ad').screenshot({ path: png });
  console.log(`${ad.id} ${SIZES[ad.size].label.padEnd(16)} ${path.relative(ROOT, png)}${overflow ? `  ⚠ overflow ${overflow}` : ''}`);
  await p.close();
}
await browser.close();
