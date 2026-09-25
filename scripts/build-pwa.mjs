/**
 * Post-export pass: offline manifest, worker stamp, and CSP.
 *
 * Runs after `next build` because all three need the finished output —
 * the hashed asset names, the emitted HTML, and the inline scripts React and
 * next-themes put in it.
 *
 * Why the CSP is injected here instead of written in the layout: GitHub Pages
 * serves static files and cannot set response headers, so the policy has to
 * ride in a `<meta http-equiv>` tag. A meta policy cannot carry a per-request
 * nonce, so every inline script is allowed by the SHA-256 of its own contents,
 * computed from the built HTML. The cost is that this file must run on every
 * build; the benefit is `connect-src 'self'`, which is what turns "this page
 * does not phone home" from a claim into something the browser enforces.
 *
 * Usage: node scripts/build-pwa.mjs   (wired into `npm run build`)
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
const BASE = process.env.PAGES_BASE_PATH ?? '';

/* ── Walk the export ──────────────────────── */

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const files = walk(OUT);
const url = (file) => `${BASE}/${relative(OUT, file).split(sep).join('/')}`;

/** `out/zh-TW/tools.html` is served at `/zh-TW/tools` — match the request. */
const pageUrl = (file) => url(file).replace(/\.html$/, '').replace(/\/index$/, '/');

const htmlFiles = files.filter((file) => file.endsWith('.html'));
const benchPages = htmlFiles.filter((file) => url(file).includes('/tools'));
/**
 * Next 16 emits a per-segment RSC payload for client-side navigation. They are
 * left out of the offline set on purpose: there are ~1,800 of them for 8.8 MB,
 * and without them the router simply falls back to a full page load, which the
 * worker serves from the cached HTML. Paying 8.8 MB for a smoother transition
 * while offline is not a trade worth making.
 */
const benchPayloads = files.filter(
  (file) =>
    file.endsWith('.txt') &&
    url(file).includes('/tools') &&
    !url(file).split('/').pop().startsWith('__next.')
);
const staticAssets = files.filter((file) => url(file).includes('/_next/static/'));
const chrome = files.filter((file) => {
  const target = url(file);
  return target.startsWith(`${BASE}/icons/`) || target.startsWith(`${BASE}/fonts/`);
});

/* ── Build id ─────────────────────────────── */

/**
 * Next's build id when it is available, otherwise a digest of every asset
 * name. Never a timestamp: an unchanged build should produce an unchanged
 * cache name, or every deploy evicts caches that are still valid.
 */
let buildId;
try {
  buildId = readFileSync(join('.next', 'BUILD_ID'), 'utf8').trim();
} catch {
  buildId = createHash('sha256')
    .update(staticAssets.map((file) => url(file)).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}

/* ── Offline manifest ─────────────────────── */

const indexPages = benchPages.filter((file) => /\/tools(\/settings)?\.html$/.test(url(file)));

// The shell: the index and settings pages in both locales, the stylesheet and
// the icons. Deliberately not the fonts in public/ — that is the display serif,
// which the bench never sets a glyph in (src/lib/fonts.ts).
const precache = [
  ...indexPages.map(pageUrl),
  ...files.filter((file) => url(file).includes('/_next/static/css/')).map(url),
  ...chrome.filter((file) => url(file).startsWith(`${BASE}/icons/`)).map(url),
];

/**
 * Everything needed for the bench to work with the network off, split so the
 * settings page can download one language instead of both. Brand-page images
 * stay out entirely — they would more than double a download nobody asked for.
 */
const localeOf = (target) => {
  const match = /^(?:.*)?\/(zh-TW|en)\//.exec(target);
  return match ? match[1] : null;
};

const shared = [...new Set([...staticAssets.map(url), ...chrome.map(url)])];
const byLocale = {};
for (const file of [...benchPages.map(pageUrl), ...benchPayloads.map(url)]) {
  const locale = localeOf(file);
  if (!locale) continue;
  (byLocale[locale] ??= []).push(file);
}

const offline = { shared, ...byLocale };

const sizeByUrl = new Map(files.map((file) => [pageUrl(file), statSync(file).size]));
const bytesOf = (list) => list.reduce((total, target) => total + (sizeByUrl.get(target) ?? 0), 0);

writeFileSync(
  join(OUT, 'sw-manifest.json'),
  `${JSON.stringify({ buildId, precache, offline }, null, 2)}\n`
);

/* ── Stamp the worker ─────────────────────── */

const swPath = join(OUT, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_ID__')) {
  throw new Error('out/sw.js has no __BUILD_ID__ placeholder — did public/sw.js change?');
}
writeFileSync(swPath, sw.replace('__BUILD_ID__', buildId));

/* ── Content Security Policy ──────────────── */

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

function policyFor(html) {
  const hashes = new Set();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1];
    if (!body) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }

  return [
    "default-src 'self'",
    // The whole point. No fetch, XHR, WebSocket or beacon may leave the origin.
    "connect-src 'self'",
    `script-src 'self' ${[...hashes].join(' ')}`.trim(),
    // Styles stay inline-permissive: element style attributes are used
    // throughout the bench, and a style injection cannot exfiltrate anything
    // once connect-src and img-src are closed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

let patched = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const head = html.indexOf('<head>');
  if (head === -1) continue;

  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html)}">`;
  const at = head + '<head>'.length;
  writeFileSync(file, html.slice(0, at) + meta + html.slice(at));
  patched += 1;
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const lines = [
  `build-pwa: build ${buildId}`,
  `  precache ${precache.length} files (${kb(bytesOf(precache))})`,
];
for (const [key, list] of Object.entries(offline)) {
  lines.push(`  offline/${key.padEnd(6)} ${String(list.length).padStart(4)} files (${kb(bytesOf(list))})`);
}
lines.push(`  csp      ${patched}/${htmlFiles.length} pages`);
console.log(lines.join('\n'));
