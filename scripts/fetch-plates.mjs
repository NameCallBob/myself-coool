/**
 * Builds the picture wall from public-domain artwork.
 *
 * Why artwork and not internet memes: essentially no well-known meme is
 * freely licensed — the source images are stock photography, film stills or
 * someone's copyrighted photograph. The Met's Open Access set is CC0, which
 * genuinely allows use, modification and redistribution, and "classical
 * painting plus a caption" is an established meme format in its own right.
 * The joke is the caption, and the caption is ours.
 *
 * Usage: node scripts/fetch-plates.mjs [count]
 * Writes public/memes/<id>.webp and content/art-plates.ts
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const WANT = Number(process.argv[2] ?? 200);
const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const DIR = 'public/memes';

/** Search terms chosen for faces and readable gestures — the frames a caption can land on. */
const TERMS = [
  'portrait', 'self-portrait', 'man', 'woman', 'child', 'king', 'queen',
  'soldier', 'musician', 'scholar', 'merchant', 'peasant', 'family', 'couple',
  'banquet', 'feast', 'card players', 'letter', 'reading', 'writing', 'sleeping',
  'drinking', 'argument', 'triumph', 'horse', 'dog', 'cat', 'bird', 'flowers',
  'still life', 'landscape', 'interior', 'genre painting', 'mask', 'mirror',
  'clock', 'ship', 'storm', 'ruins', 'market', 'kitchen', 'garden', 'bridge',
  'chair', 'table', 'teapot', 'fan', 'armor', 'sword', 'printing', 'map',
];

/**
 * Museum collections are full of classical nudes, and this wall sits on a page
 * whose whole job is getting its author hired. Anything the Met tags as a nude
 * — or titles like one — is dropped, along with the explicitly religious
 * execution scenes, which land badly under a joke caption.
 */
const BLOCKED_TAGS = new Set([
  'Female Nudes', 'Male Nudes', 'Nudes', 'Erotic', 'Crucifixion', 'Torture',
]);
const BLOCKED_WORDS =
  /\b(nude|naked|nudity|venus|bather|odalisque|lucretia|susanna|crucifix|flagellation|martyr|massacre|rape|execution)\b/i;

function acceptable(o) {
  const haystack = `${o.title ?? ''} ${o.classification ?? ''} ${o.objectName ?? ''} ${o.culture ?? ''}`;
  if (BLOCKED_WORDS.test(haystack)) return false;
  for (const t of o.tags ?? []) if (BLOCKED_TAGS.has(t.term)) return false;
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (res.status === 429) { await sleep(1500 * (i + 1)); continue; }
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch {
      if (i === tries - 1) return null;
      await sleep(700 * (i + 1));
    }
  }
  return null;
}

/* 1 — collect candidate object ids */
const ids = new Set();
for (const term of TERMS) {
  if (ids.size >= WANT * 2.2) break;
  const q = encodeURIComponent(term);
  const r = await json(`${API}/search?q=${q}&hasImages=true&isPublicDomain=true`);
  for (const id of r?.objectIDs ?? []) ids.add(id);
  process.stdout.write(`\r  搜尋 ${term.padEnd(16)} 累積 ${ids.size} 筆`);
  await sleep(120);
}
console.log(`\n  候選 ${ids.size} 筆,目標 ${WANT} 張`);

/* 2 — fetch details, download, resize */
await mkdir(DIR, { recursive: true });
const plates = [];
const pool = [...ids];
// Deterministic spread so re-runs pick a similar mix rather than a fresh random set.
pool.sort((a, b) => ((a * 2654435761) % 1e6) - ((b * 2654435761) % 1e6));

let bytes = 0;
for (const id of pool) {
  if (plates.length >= WANT) break;
  const o = await json(`${API}/objects/${id}`);
  const src = o?.primaryImageSmall;
  if (!o?.isPublicDomain || !src) continue;
  if (!acceptable(o)) continue;

  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // 420px wide is enough for a framed plate at 2x on the wall.
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 420, height: 420, fit: 'cover', position: 'attention' })
      .webp({ quality: 72 })
      .toBuffer();
    await writeFile(join(DIR, `${id}.webp`), out);
    bytes += out.length;
    plates.push({
      id,
      title: (o.title || 'Untitled').replace(/'/g, '’').slice(0, 90),
      artist: (o.artistDisplayName || 'Unknown').replace(/'/g, '’').slice(0, 60),
      date: (o.objectDate || '').replace(/'/g, '’').slice(0, 30),
      url: o.objectURL,
    });
    process.stdout.write(`\r  下載 ${plates.length}/${WANT}  (${(bytes / 1e6).toFixed(1)} MB)`);
  } catch {}
  await sleep(60);
}
console.log('');

/* 3 — write the manifest */
const body = plates
  .map(
    (p) =>
      `  { id: '${p.id}', title: '${p.title}', artist: '${p.artist}', date: '${p.date}', url: '${p.url}' },`
  )
  .join('\n');

await writeFile(
  'content/art-plates.ts',
  `/**
 * Public-domain artwork for the picture wall — generated by
 * scripts/fetch-plates.mjs, do not edit by hand.
 *
 * Source: The Metropolitan Museum of Art Open Access (CC0 1.0 Universal).
 * CC0 waives copyright entirely: use, modification and redistribution are
 * permitted without attribution. Artist, title and date are kept anyway —
 * crediting the work costs nothing and is the decent thing to do.
 *
 * Images live in public/memes/<id>.webp, cropped to 420x420.
 */
export type ArtPlate = {
  id: string;
  title: string;
  artist: string;
  date: string;
  url: string;
};

export const ART_PLATES: ArtPlate[] = [
${body}
];
`
);

const files = (await readdir(DIR)).length;
console.log(`  完成:${plates.length} 張、${files} 個檔案、${(bytes / 1e6).toFixed(1)} MB`);
console.log('  清單 → content/art-plates.ts');
