/**
 * Offline plumbing shared by the runtime and the settings page.
 *
 * `BASE_PATH` matters more than it looks: the site is served from the domain
 * root in production but from a subpath on the preview deploy, and a service
 * worker registered at the wrong path either 404s or claims a scope that does
 * not cover the pages it is meant to serve.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const SW_URL = `${BASE_PATH}/sw.js`;
export const SW_SCOPE = `${BASE_PATH}/`;

/** Asks the active worker to warm every tool page and chunk into the cache. */
export type PrefetchProgress = { done: number; total: number };

export async function prefetchAll(
  urls: string[],
  onProgress: (progress: PrefetchProgress) => void
): Promise<{ cached: number; failed: number }> {
  const cache = await caches.open('inst-runtime');
  let cached = 0;
  let failed = 0;

  // Four at a time: enough to saturate a connection, few enough that a slow
  // network does not look frozen and the progress readout stays truthful.
  const queue = urls.slice();
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const url = queue.pop();
      if (!url) return;
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) {
          await cache.put(url, response.clone());
          cached += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      onProgress({ done: cached + failed, total: urls.length });
    }
  });

  await Promise.all(workers);
  return { cached, failed };
}

/** Bytes this origin is using, when the browser is willing to say. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!('storage' in navigator) || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Removes every cache, every tools:* key and the worker itself. */
export async function wipeEverything(): Promise<void> {
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}
