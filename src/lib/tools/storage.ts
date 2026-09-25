/**
 * Namespaced, failure-tolerant local storage.
 *
 * Every key is prefixed so the settings page can enumerate and wipe exactly
 * what this section wrote, and nothing else. Reads and writes are wrapped
 * because storage throws outright in a private window, when site data is
 * blocked, and when the quota is full — none of which should break a tool.
 *
 * Tools marked `sensitive` in the registry must not call this at all; the
 * shell passes `persist: false` down so the rule is visible in the component.
 */

export const PREFIX = 'tools:';

export function storageKey(slug: string, key: string): string {
  return `${PREFIX}${slug}:${key}`;
}

export function read<T>(slug: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(slug, key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function write(slug: string, key: string, value: unknown): boolean {
  try {
    localStorage.setItem(storageKey(slug, key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(slug: string, key: string): void {
  try {
    localStorage.removeItem(storageKey(slug, key));
  } catch {
    /* nothing to do — the value was never stored */
  }
}

/** Every `tools:` key currently held, with its byte size. */
export function inventory(): { key: string; size: number }[] {
  const out: { key: string; size: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      out.push({ key, size: (localStorage.getItem(key) ?? '').length });
    }
  } catch {
    return out;
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function clearAll(): number {
  const keys = inventory().map((entry) => entry.key);
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore — reported by the caller re-reading the inventory */
    }
  }
  return keys.length;
}

/* ── Inventory as a store ─────────────────── */
/**
 * The settings page has to show what is stored *and* re-read it after a wipe.
 * Reading it in an effect means a setState per mount; exposing it as a store
 * with an explicit `refreshInventory()` keeps the snapshot referentially
 * stable, so `useSyncExternalStore` can read it directly.
 */
let snapshot: { key: string; size: number }[] = [];
const listeners = new Set<() => void>();

export function subscribeInventory(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function inventorySnapshot(): { key: string; size: number }[] {
  return snapshot;
}

export function refreshInventory(): void {
  snapshot = inventory();
  for (const listener of listeners) listener();
}

/** Stable empty array for the server snapshot — a new one would loop. */
const EMPTY: { key: string; size: number }[] = [];

export function serverInventory(): { key: string; size: number }[] {
  return EMPTY;
}
