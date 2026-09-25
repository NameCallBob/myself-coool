/* eslint-disable no-restricted-globals */
/**
 * Service worker for the instruments bench.
 *
 * Written by hand rather than generated. Two reasons: the generators in this
 * space want a bundler plugin, which is one more moving part in a build that
 * has to stay a plain static export; and the interesting behaviour here is not
 * caching, it is the egress gate below, which no generator offers.
 *
 * Scope is the whole origin because the shared chunks live at the root, but the
 * fetch handler deliberately does almost nothing outside /tools and
 * /_next/static — the brand pages keep ordinary network semantics so their
 * caching and indexing behave exactly as they did before this file existed.
 *
 * BUILD_ID is substituted by scripts/build-pwa.mjs after `next build`.
 */

const BUILD_ID = '__BUILD_ID__';
const SHELL = `inst-shell-${BUILD_ID}`;
const RUNTIME = 'inst-runtime';

/** Written next to this file by the build; lists what to precache. */
const MANIFEST_URL = new URL('sw-manifest.json', self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'reload' });
        if (!response.ok) return;
        const manifest = await response.json();
        const cache = await caches.open(SHELL);
        // Individually, not addAll: one missing file should not throw away a
        // whole install and leave the bench with no offline mode at all.
        await Promise.all(
          (manifest.precache || []).map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
          )
        );
      } catch {
        /* No manifest, no precache. The worker still gates egress. */
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('inst-shell-') && name !== SHELL)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  // The page asks for the swap; the worker never takes it unprompted.
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const isStatic = (path) =>
  path.startsWith(`${scopePath}/_next/static/`) ||
  path.startsWith(`${scopePath}/fonts/`) ||
  path.startsWith(`${scopePath}/icons/`);
const isBench = (path) => path.includes('/tools');

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

/** Shown for a bench page that was never downloaded, while offline. */
function offlinePage(path) {
  const en = path.startsWith(`${scopePath}/en/`);
  const index = `${scopePath}/${en ? 'en' : 'zh-TW'}/tools`;
  const body = en
    ? {
        title: 'Not downloaded',
        text: 'This tool has not been cached on this device, and there is no connection to fetch it.',
        link: 'Open the instrument index',
      }
    : {
        title: '尚未下載',
        text: '這件工具還沒有存進這台裝置,而目前沒有連線可以取得它。',
        link: '開啟儀器索引',
      };

  return new Response(
    `<!doctype html><html lang="${en ? 'en' : 'zh-Hant-TW'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${body.title}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:2rem;
       background:#faf8f4;color:#1a1714;
       font:16px/1.7 system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}
  main{max-width:30rem}
  p{color:#5e574e}
  a{color:#a31621}
  code{font:12px ui-monospace,monospace;color:#726a5d}
  @media(prefers-color-scheme:dark){
    body{background:#12100e;color:#ede8df}p{color:#a8a296}a{color:#e25d5d}code{color:#89847a}
  }
</style></head><body><main>
<h1 style="font-size:1.25rem;font-weight:600">${body.title}</h1>
<p>${body.text}</p>
<p><a href="${index}">${body.link}</a></p>
<p><code>${path}</code></p>
</main></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /**
   * The egress gate.
   *
   * Everything this site needs is same-origin, so a cross-origin GET from a
   * page under this scope is either a mistake or an exfiltration attempt, and
   * either way it is refused here. This backs up the `connect-src 'self'` CSP
   * rather than replacing it: the CSP lives in a meta tag that a future edit
   * could drop, and this does not.
   *
   * If an external resource is ever wanted on this site, it has to be added to
   * an allowlist here on purpose — which is the point.
   */
  if (url.origin !== self.location.origin) {
    event.respondWith(Response.error());
    return;
  }

  const path = url.pathname;

  if (isStatic(path)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (!isBench(path)) return; // brand pages: untouched network semantics

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request).catch(async () => {
        const cached = await caches.match(request, { ignoreVary: true });
        return cached || offlinePage(path);
      })
    );
    return;
  }

  // RSC payloads and anything else the bench asks for: fresh when online,
  // cached when not.
  event.respondWith(networkFirst(request).catch(() => Response.error()));
});
