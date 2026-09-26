/**
 * Verification pass over the built export.
 *
 * This is where the bench's promises become assertions:
 *
 *  1. No page makes a cross-origin request — the claim on /tools stated as a
 *     test rather than as a badge.
 *  2. The injected CSP does not break anything. A meta policy with per-page
 *     script hashes fails loudly if a hash is wrong, so every page is loaded
 *     with a `securitypolicyviolation` listener attached.
 *  3. Nothing throws, and no console error appears.
 *  4. The bench still works with the network switched off.
 *
 * Usage: node scripts/verify.mjs [--all]
 *   default: brand pages, the index, settings and a sample of tools
 *   --all:   every tool page (slow)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4399;
const ORIGIN = `http://localhost:${PORT}`;
const ALL = process.argv.includes('--all');

if (!existsSync('out/sw-manifest.json')) {
  console.error('out/ is missing or stale — run `npm run build` first.');
  process.exit(1);
}

const { TOOLS } = await import('../content/tools/registry.ts');
const { BUILT_TOOLS } = await import('../src/tools/built.generated.ts');

/* ── Serve the export ─────────────────────── */

const server = spawn(process.execPath, ['scripts/serve-out.mjs', String(PORT)], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (chunk) => String(chunk).includes('serving') && resolve());
  server.on('error', reject);
  setTimeout(() => reject(new Error('server did not start')), 10_000);
});

const failures = [];
const note = (where, message) => failures.push(`${where}: ${message}`);

const browser = await chromium.launch();

/** Attaches the collectors every check depends on. */
async function open(context) {
  const page = await context.newPage();
  const seen = { requests: [], console: [], errors: [], csp: [] };

  await page.addInitScript(() => {
    // The CSP arrives in a meta tag, so violations surface as events on the
    // document rather than as an HTTP report.
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__csp.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });

  page.on('request', (request) => seen.requests.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.console.push(message.text());
  });
  page.on('pageerror', (error) => seen.errors.push(error.message));

  return { page, seen };
}

async function drain(page, seen) {
  const violations = await page.evaluate(() => window.__csp ?? []).catch(() => []);
  seen.csp.push(...violations);
}

const foreign = (urls) =>
  urls.filter((url) => !url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:'));

/* ── Page checks ──────────────────────────── */

const brand = ['/zh-TW', '/en', '/zh-TW/work', '/zh-TW/about', '/zh-TW/ai'];
const bench = ['/zh-TW/tools', '/en/tools', '/zh-TW/tools/settings'];
const tools = (ALL ? BUILT_TOOLS : BUILT_TOOLS.slice(0, 12)).map((slug) => `/zh-TW/tools/${slug}`);
const paths = [...brand, ...bench, ...tools];

const context = await browser.newContext();
let checked = 0;

for (const path of paths) {
  const { page, seen } = await open(context);
  try {
    const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'load', timeout: 30_000 });
    if (!response || response.status() >= 400) {
      note(path, `HTTP ${response ? response.status() : 'no response'}`);
    }
    await page.waitForTimeout(400);

    // Exercise the tool: a bench page that only renders proves little.
    const area = page.locator('textarea, input[type="text"]').first();
    if (await area.count()) {
      await area.fill('binbin 測試 42 {"a":1}').catch(() => undefined);
      await page.waitForTimeout(250);
    }

    // House rule: every tool ends with a readout strip. Its absence is the
    // cheapest reliable signal that a page is a stub rather than a tool.
    if (path.startsWith('/zh-TW/tools/') && path !== '/zh-TW/tools/settings') {
      if ((await page.locator('.inst-readout').count()) === 0) {
        note(path, 'no readout strip — tool looks unimplemented');
      }
      if ((await page.locator('button, input, textarea, select').count()) < 2) {
        note(path, 'almost no controls — tool looks unimplemented');
      }
    }

    await drain(page, seen);

    const outside = foreign(seen.requests);
    if (outside.length) note(path, `cross-origin request: ${outside.slice(0, 3).join(', ')}`);
    if (seen.csp.length) note(path, `CSP: ${[...new Set(seen.csp)].slice(0, 3).join(' | ')}`);
    if (seen.errors.length) note(path, `page error: ${seen.errors[0]}`);
    if (seen.console.length) note(path, `console error: ${seen.console[0]}`);

    checked += 1;
  } catch (error) {
    note(path, error.message);
  } finally {
    await page.close();
  }
}

/* ── Offline check ────────────────────────── */

{
  const { page, seen } = await open(context);
  try {
    await page.goto(`${ORIGIN}/zh-TW/tools`, { waitUntil: 'load' });
    // Give the worker a moment to install and claim the page.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 });
    await page.waitForTimeout(600);

    await context.setOffline(true);
    const response = await page.reload({ waitUntil: 'load' });
    const heading = await page.locator('h1').first().textContent();

    if (!response || response.status() >= 400) note('offline', 'index did not load from cache');
    if (!heading || !heading.includes('工具')) note('offline', `unexpected heading: ${heading}`);

    // An uncached tool must say so rather than showing a browser error page.
    await page.goto(`${ORIGIN}/zh-TW/tools/cidr`, { waitUntil: 'load' }).catch(() => undefined);
    const body = (await page.locator('body').textContent()) ?? '';
    if (!/尚未下載|子網路|CIDR/.test(body)) note('offline', 'uncached tool gave no usable page');

    await drain(page, seen);
    if (seen.errors.length) note('offline', `page error: ${seen.errors[0]}`);
  } catch (error) {
    note('offline', error.message);
  } finally {
    await context.setOffline(false);
    await page.close();
  }
}

/* ── Static assertions ────────────────────── */

{
  const manifest = JSON.parse(readFileSync('out/sw-manifest.json', 'utf8'));
  if (readFileSync('out/sw.js', 'utf8').includes('__BUILD_ID__')) {
    note('sw.js', 'build id was never substituted');
  }
  if (!manifest.precache.length) note('sw-manifest', 'precache list is empty');

  const index = readFileSync('out/zh-TW/tools.html', 'utf8');
  if (!index.includes("connect-src 'self'")) note('csp', 'connect-src is not locked to self');
  if (index.includes('noto_serif_tc')) note('fonts', 'bench still preloads the display serif');

  const missing = TOOLS.filter((tool) => !existsSync(`out/zh-TW/tools/${tool.slug}.html`));
  if (missing.length) note('export', `${missing.length} tool pages were not emitted`);
}

/* ── Source rules ─────────────────────────── */

/**
 * Strips comments and string literals, keeping template interpolations.
 *
 * Needed because the first version of the scan below flagged five tools that
 * were innocent: four of them say "this tool does not write localStorage" in
 * their own UI copy, and the curl converter emits `fetch(...)` as the code it
 * generates for you to paste. The rule is about what the tool executes, not
 * about what it says, so the prose has to come out before matching — while
 * `${...}` inside a template stays, since that is real code.
 */
function codeOnly(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          const start = i;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            if (depth > 0) i += 1;
          }
          out += ` ${source.slice(start, i)} `;
          i += 1;
          continue;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Read straight off the source, not the bundle.
 *
 * ESLint already refuses `Math.random`, `eval` and `dangerouslySetInnerHTML`
 * in this tree. These are the two rules it cannot express: a tool must not
 * reach the network at all, and a tool whose input is a secret must not write
 * that input anywhere it can outlive the tab.
 */
{
  const NETWORK = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)/;
  const PERSIST = /\b(localStorage|sessionStorage|indexedDB|document\.cookie)/;

  for (const tool of TOOLS) {
    const dir = join('src/tools', tool.slug);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!/\.tsx?$/.test(file) || file.endsWith('.test.ts')) continue;
      const code = codeOnly(readFileSync(join(dir, file), 'utf8'));

      const network = NETWORK.exec(code);
      if (network) note(`${tool.slug}/${file}`, `reaches the network: ${network[0]}`);

      if (tool.sensitive) {
        const persist = PERSIST.exec(code);
        if (persist) note(`${tool.slug}/${file}`, `sensitive tool persists via ${persist[0]}`);
      }
    }
  }
}

await browser.close();
server.kill();

/* ── Report ───────────────────────────────── */

console.log(
  `\nverify: ${checked}/${paths.length} pages loaded · ${BUILT_TOOLS.length}/${TOOLS.length} tools built`
);
if (failures.length === 0) {
  console.log('verify: clean — no cross-origin requests, no CSP violations, offline works');
  process.exit(0);
}
console.error(`\nverify: ${failures.length} problem(s)`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
process.exit(1);
