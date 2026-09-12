/**
 * Visual verification — drives the built static export in a real browser and
 * writes screenshots plus any console/page errors it saw.
 *
 * Usage: npm run build && node scripts/shots.mjs [outDir]
 * Serves ./out itself, so it needs no separate server.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const OUT = process.argv[2] ?? '.shots';
const ROOT = 'out';
const PORT = 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  for (const candidate of [url, `${url}.html`, join(url, 'index.html')]) {
    try {
      const body = await readFile(join(ROOT, normalize(candidate)));
      res.writeHead(200, { 'Content-Type': TYPES[extname(candidate)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404).end('not found');
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function shoot(path, file, { w = 1440, h = 900, keys = [], wait = 1900, motion = 'no-preference', scroll = 0 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' });
  if (scroll) {
    // Step the scroll so ScrollTrigger fires the way it does for a reader.
    for (let y = 0; y <= scroll; y += 400) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(90);
    }
  }
  await page.waitForTimeout(wait);
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(850);
  }
  await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: h > 2000 });
  if (errs.length) problems.push(`${file}: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  await ctx.close();
  console.log(`  ✓ ${file}`);
}

// The deck is a scrolling composition, so it is captured by scroll depth.
await shoot('/zh-TW', 'home-01-top');
await shoot('/zh-TW', 'home-02-scale', { scroll: 900 });
await shoot('/zh-TW', 'home-03-projects', { scroll: 1900 });
await shoot('/zh-TW', 'home-04-experience', { scroll: 2900 });
await shoot('/zh-TW', 'home-05-path', { scroll: 3900 });
await shoot('/zh-TW', 'home-06-wall', { scroll: 5600 });
await shoot('/zh-TW', 'home-07-contact', { scroll: 7200 });
await shoot('/zh-TW', 'home-reduced-motion', { motion: 'reduce', scroll: 900 });
await shoot('/zh-TW', 'home-mobile', { w: 390, h: 844, scroll: 1200 });
await shoot('/en', 'home-en', { scroll: 900 });
await shoot('/zh-TW/about', 'about', { h: 2000 });
await shoot('/zh-TW/work', 'work', { h: 3000 });
await shoot('/zh-TW/work/nkust-borrow', 'case-borrow', { h: 4000 });

await browser.close();
server.close();

if (problems.length) {
  console.log('\nBrowser errors:');
  for (const p of problems) console.log('  ⚠ ' + p);
  process.exitCode = 1;
} else {
  console.log('\nNo console or page errors.');
}
