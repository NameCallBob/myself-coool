'use client';

import Image from 'next/image';
import { useMemo, useSyncExternalStore } from 'react';

export type ArtItem = {
  id: string;
  title: string;
  artist: string;
  date: string;
  url: string;
};

/** Nothing to subscribe to — this store only reports "are we past hydration". */
const noopSubscribe = () => () => {};

/**
 * Drawn once when the module loads, never during render — React 19 rejects
 * impure calls in a render pass, and a seed fixed per page load is exactly
 * what "a different wall each visit, stable while you read it" needs.
 */
const LOAD_SEED = typeof window === 'undefined' ? 7 : Math.floor(Math.random() * 1e9);

function pick<T>(items: T[], n: number, seed: number): T[] {
  const pool = [...items];
  let s = seed || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * The picture wall — public-domain paintings hung under museum labels, where
 * the label says something about shipping software instead of about the art.
 *
 * The paintings are CC0 (Met Open Access) so they can be used and remixed
 * freely; the captions are ours. Painting and caption are paired at random on
 * each load, so a wall of 200 works and 40 labels never repeats itself in any
 * way a visitor would notice.
 *
 * Server render is a fixed slice — the static export must be deterministic —
 * and the browser re-draws once hydrated.
 */
export function ArtWall({
  art,
  captions,
  count = 9,
  note,
}: {
  art: ArtItem[];
  captions: string[];
  count?: number;
  note: string;
}) {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const hung = useMemo(() => {
    const seed = hydrated ? LOAD_SEED : 7;
    const works = pick(art, count, seed);
    const labels = pick(captions, count, seed + 977);
    return works.map((w, i) => ({ ...w, caption: labels[i % labels.length] }));
  }, [hydrated, art, captions, count]);

  if (!art.length) return null;

  return (
    <div>
      <div className="art-wall">
        {hung.map((w, i) => (
          <figure key={`${w.id}-${i}`} className="art-piece" style={{ '--tilt': `${((i * 29) % 7) - 3}deg` } as React.CSSProperties}>
            <a href={w.url} target="_blank" rel="noopener noreferrer" className="art-mount">
              <Image
                src={`/memes/${w.id}.webp`}
                width={420}
                height={420}
                loading="lazy"
                decoding="async"
                sizes="(max-width: 820px) 45vw, 220px"
                alt={`${w.title} — ${w.artist}`}
                className="art-img"
              />
            </a>
            <figcaption className="art-label">
              <p className="art-caption">{w.caption}</p>
              <p className="art-credit">
                {w.artist} · {w.title}
                {w.date ? ` · ${w.date}` : ''}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="art-note">{note}</p>
    </div>
  );
}
