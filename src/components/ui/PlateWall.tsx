'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { Frame } from './Avatar';

export type WallPlate = { value: string; note: string };

/** Nothing to subscribe to — this store only reports "are we past hydration". */
const noopSubscribe = () => () => {};

function shuffled<T>(items: T[]): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * A wall of framed plates — a different selection on every load.
 *
 * The site is a static export, so shuffling during render would bake one
 * "random" order into the HTML every visitor receives, and then disagree with
 * whatever the client picked. `useSyncExternalStore` gives the server a stable
 * first slice and lets the browser re-pick once it has hydrated — the same job
 * a mount effect would do, without writing state from inside one.
 */
export function PlateWall({
  plates,
  count = 12,
  variant = 'background',
}: {
  plates: WallPlate[];
  count?: number;
  variant?: 'background' | 'feature';
}) {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const picked = useMemo(
    () => (hydrated ? shuffled(plates) : plates).slice(0, count),
    [hydrated, plates, count]
  );

  return (
    <div
      className={`wall wall-${variant}`}
      aria-hidden={variant === 'background' ? true : undefined}
    >
      {picked.map((p, i) => (
        // Nothing on a real wall hangs straight.
        <Frame key={`${p.value}-${i}`} tilt={((i * 37) % 9) - 4}>
          <p className="wall-plate">
            <b>{p.value}</b>
            <span>{p.note}</span>
          </p>
        </Frame>
      ))}
    </div>
  );
}
