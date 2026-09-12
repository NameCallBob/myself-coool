import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const OUT = '.shots';
const ROOT = 'out';
const PORT = 4399;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg',
};
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  for (const c of [url, `${url}.html`, join(url, 'index.html')]) {
    try {
      const body = await readFile(join(ROOT, normalize(c)));
      res.writeHead(200, { 'Content-Type': TYPES[extname(c)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404).end('not found');
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const report = {};

async function run(tag, w, h) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/zh-TW`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    docH: document.documentElement.scrollHeight,
    innerW: window.innerWidth,
  }));

  // find elements wider than viewport
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.pointerEvents === 'none') continue;
        out.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,3).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), pos: cs.position,
        });
      }
    }
    return out.slice(0, 25);
  });

  // tap targets
  const taps = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a, button, [role="button"], input, summary')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44 || r.width < 24) {
        out.push({
          tag: el.tagName.toLowerCase(),
          txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
          w: Math.round(r.width), h: Math.round(r.height),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
        });
      }
    }
    return out.slice(0, 40);
  });

  report[tag] = { metrics, overflow, taps, errs: [...new Set(errs)].slice(0, 6) };

  const depths = [0, 0.12, 0.28, 0.45, 0.62, 0.8, 0.97];
  let i = 0;
  for (const d of depths) {
    const target = Math.round((metrics.docH - h) * d);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), target);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `mobile-${tag}-${String(++i).padStart(2,'0')}.png`) });
  }

  // nav overlay
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(600);
  const menuBtn = page.locator('header button[aria-expanded]');
  const box = await menuBtn.boundingBox();
  await menuBtn.tap();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `mobile-${tag}-nav-open.png`) });
  const navState = await page.evaluate(() => {
    const ov = document.querySelector('header > div:last-child');
    const link = document.querySelector('header > div:last-child a');
    if (!link) return { found: false };
    const cs = getComputedStyle(link);
    const ovcs = getComputedStyle(ov);
    return {
      found: true,
      linkColor: cs.color, linkH: Math.round(link.getBoundingClientRect().height),
      overlayBg: ovcs.backgroundColor, overlayZ: ovcs.zIndex,
      bodyOverflow: document.body.style.overflow,
      btnBox: null,
    };
  });
  report[tag].nav = { ...navState, btn: box };

  // does tapping a link close it / navigate?
  const first = page.locator('header > div:last-child a').first();
  if (await first.count()) {
    await first.tap();
    await page.waitForTimeout(1600);
    report[tag].navAfterClick = await page.evaluate(() => ({
      url: location.pathname,
      overlayPresent: !!document.querySelector('header > div:last-child a'),
      bodyOverflow: document.body.style.overflow,
    }));
    await page.screenshot({ path: join(OUT, `mobile-${tag}-after-nav.png`) });
  }
  await ctx.close();
}

await run('390', 390, 844);
await run('320', 320, 568);
await browser.close();
server.close();
console.log(JSON.stringify(report, null, 1));
