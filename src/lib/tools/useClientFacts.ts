'use client';

import { useSyncExternalStore } from 'react';

/**
 * Browser facts read through a store rather than an effect.
 *
 * The house pattern — `Nav.tsx` does the same for the stored theme. Reading
 * `navigator` in an effect and calling setState works but triggers a cascading
 * render on every mount, which the lint config rejects; a store gives the same
 * value with a correct server snapshot and no extra render.
 */

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

/** `true` during SSR: a page rendered at build time cannot know, and claiming
 *  "offline" before hydration would flash a warning at everyone. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}

const noSubscribe = () => () => {};

/** Whether this browser can do offline at all. Assumed yes until hydration. */
export function useOfflineCapable(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => 'serviceWorker' in navigator && 'caches' in window,
    () => true
  );
}

/** Post-hydration flag, for UI that must not render two different trees. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}
