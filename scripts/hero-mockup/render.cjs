// Renders the product-hero images from their HTML sources:
//   mockup.html      -> assets/hero/wynko-hero-devices.webp      (2280x1400, transparent, desktop)
//                    -> assets/hero/wynko-hero-devices-720.webp  (1140x700, transparent, phones)
//   background.html  -> assets/hero/wynko-hero-bg.webp           (3344x1882, desktop)
//                    -> assets/hero/wynko-hero-bg-mobile.webp    (1600x3200, phones)
// Usage: node scripts/hero-mockup/render.cjs   (needs the `playwright` package and a Chromium build)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const src = 'file://' + path.join(__dirname, 'mockup.html');
const out = (name) => path.join(root, 'assets/hero', name);

(async () => {
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({
    args: proxy ? ['--ignore-certificate-errors', '--proxy-server=' + proxy] : [],
  });
  const page = await browser.newPage({ viewport: { width: 1140, height: 700 }, deviceScaleFactor: 2 });
  await page.goto(src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: true, type: 'png' });

  // Encode to WebP (with alpha) using Chromium's own encoder, at full and half size.
  const encoded = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const enc = (w, q) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round(w * img.height / img.width);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', q).split(',')[1];
    };
    return { full: enc(img.width, 0.9), small: enc(img.width / 2, 0.9) };
  }, png.toString('base64'));

  fs.writeFileSync(out('wynko-hero-devices.webp'), Buffer.from(encoded.full, 'base64'));
  fs.writeFileSync(out('wynko-hero-devices-720.webp'), Buffer.from(encoded.small, 'base64'));

  // Backgrounds: drawn as SVG, captured at 2x, encoded at high quality so the gradients stay smooth.
  const bgSrc = 'file://' + path.join(__dirname, 'background.html');
  for (const [v, w, h, file] of [['desktop', 1672, 941, 'wynko-hero-bg.webp'], ['mobile', 800, 1600, 'wynko-hero-bg-mobile.webp']]) {
    const bg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await bg.goto(bgSrc + '?v=' + v);
    await bg.waitForSelector('body[data-ready]');
    const shot = await bg.screenshot({ type: 'png' });
    const webp = await bg.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.92).split(',')[1];
    }, shot.toString('base64'));
    fs.writeFileSync(out(file), Buffer.from(webp, 'base64'));
    await bg.close();
  }

  await browser.close();
  console.log('wrote assets/hero/wynko-hero-devices*.webp and wynko-hero-bg*.webp');
})();
