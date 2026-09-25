'use client';

import { useEffect, useState } from 'react';
import { loc, t } from '@/lib/tools/locale';
import { SW_SCOPE, SW_URL } from '@/lib/tools/pwa';

/**
 * Registers the worker and offers the update, rather than taking it.
 *
 * `skipWaiting` is not called. Swapping the worker out from under someone who
 * is halfway through encrypting a file — or has half a form filled in — to
 * save them one click is not a trade worth making, so the new version waits
 * behind a button.
 */
export function PwaRuntime({ locale }: { locale: string }) {
  const l = loc(locale);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In dev the worker would cache the dev server's chunks and then serve
    // them after a rebuild, which looks exactly like a broken page.
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .then((registration) => {
        if (cancelled) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const next = registration.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            // A worker reaching `installed` while another controls the page is
            // an update; the same state with no controller is a first install.
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(next);
            }
          });
        });
      })
      .catch(() => {
        /* No worker means no offline mode. Everything else still works. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="inst-banner" role="status">
      <span>{t(l, '有新版本已下載完成。', 'A new version is ready.')}</span>
      <button
        type="button"
        className="inst-btn"
        data-primary="true"
        onClick={() => {
          waiting.postMessage({ type: 'skip-waiting' });
          // The new worker takes over on the next navigation; reloading now
          // is the shortest path to it and is the user's own decision.
          window.location.reload();
        }}
      >
        {t(l, '重新載入', 'reload')}
      </button>
      <button type="button" className="inst-btn" onClick={() => setWaiting(null)}>
        {t(l, '稍後', 'later')}
      </button>
    </div>
  );
}
