/**
 * Serves `out/` the way GitHub Pages does, for verification runs.
 *
 * `next start` cannot serve a static export, and a plain file server does not
 * resolve `/zh-TW/tools` to `zh-TW/tools.html` — which is exactly the mapping
 * the service worker's cache keys depend on. Getting that wrong locally means
 * the offline test passes against a layout production does not have.
 *
 * Usage: node scripts/serve-out.mjs [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = 'out';
const PORT = Number(process.argv[2] ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};

/** Pages' resolution order for a request path. */
function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [clean, `${clean}.html`, join(clean, 'index.html')];
  for (const candidate of candidates) {
    const full = join(ROOT, candidate);
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const file = resolve(pathname);

  if (!file) {
    const notFound = join(ROOT, '404.html');
    response.writeHead(404, { 'Content-Type': TYPES['.html'] });
    if (existsSync(notFound)) createReadStream(notFound).pipe(response);
    else response.end('404');
    return;
  }

  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // No caching: every verification run must see what was just built.
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
