// Renders scripts/day-cards/mockup.html to the four "Your Day" card images on product.html:
//   assets/day/day-01-plan.webp, day-02-focus.webp, day-03-track.webp, day-04-improve.webp  (960x556, transparent)
// Usage: node scripts/day-cards/render.cjs   (needs the `playwright` package and a Chromium build)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const src = 'file://' + path.join(__dirname, 'mockup.html');
const outDir = path.join(root, 'assets/day');
const cards = [['plan', 'day-01-plan'], ['focus', 'day-02-focus'], ['track', 'day-03-track'], ['improve', 'day-04-improve']];

(async () => {
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch({
    args: proxy ? ['--ignore-certificate-errors', '--proxy-server=' + proxy] : [],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 1300 }, deviceScaleFactor: 2 });
  await page.goto(src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(outDir, { recursive: true });

  for (const [id, name] of cards) {
    const png = await page.locator('#' + id).screenshot({ omitBackground: true, type: 'png' });
    // Encode to WebP (with alpha) using Chromium's own encoder.
    const webp = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.9).split(',')[1];
    }, png.toString('base64'));
    fs.writeFileSync(path.join(outDir, name + '.webp'), Buffer.from(webp, 'base64'));
    console.log('wrote assets/day/' + name + '.webp');
  }

  await browser.close();
})();
