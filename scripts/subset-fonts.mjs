/**
 * Subsets the display webfont to the glyphs this site actually renders.
 *
 * next/font/google self-hosts Noto Serif TC as ~36 unicode-range slices per
 * weight. A reader whose text spans many ranges pulls most of them — measured
 * at ~650 KB on the home page, which is 64% of its transfer and, on a case
 * page, the LCP element itself (a .drop-cap paragraph waiting on the face).
 *
 * The site renders 1,200-odd distinct Han characters, all of them living in
 * files we control. Cutting the face down to that set plus Latin, digits and
 * punctuation takes it to a fraction of the size with no visual change.
 *
 * Usage: npm run build && node scripts/subset-fonts.mjs
 * Reads the built HTML in out/, writes public/fonts/*.woff2, and prints the
 * coverage so a missing glyph is caught here rather than on the page.
 * Re-run whenever Chinese copy is added, then build again.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, extname } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const OUT = 'public/fonts';
/* 1 — every character the site actually renders
 *
 * Read from the built export, not from source: source files carry Chinese
 * code comments and docs prose that never reach a page, and every one of
 * those characters would be paid for in the subset. `out/` is exactly what
 * a reader sees, so run `npm run build` first. */
async function walk(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (extname(e.name) === '.html') acc.push(p);
  }
  return acc;
}

const pages = await walk('out').catch(() => []);
if (!pages.length) throw new Error('out/ 是空的 —— 請先跑 npm run build');

const chars = new Set();
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  // Strip tags and the RSC payload script blocks; keep visible text only.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  for (const ch of text) chars.add(ch);
}
console.log(`  掃描 ${pages.length} 個產出頁面`);

// Always keep the basics, whatever the copy happens to use today.
for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCodePoint(c));
for (const ch of '　、。，．・：；！？「」『』（）〔〕【】—…‧·～＋－＝％＆＃＠／＼｜＜＞°′″×÷±≈≤≥←→↑↓◆●○■□★☆✓✗') {
  chars.add(ch);
}
for (const ch of '０１２３４５６７８９') chars.add(ch);

const han = [...chars].filter((c) => c >= '一' && c <= '鿿');
const codepoints = [...chars]
  .map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase())
  .join(',');

console.log(`  來源字元 ${chars.size} 個(其中漢字 ${han.length} 個)`);

/* 2 — find the face next/font already downloaded, and subset it */
await mkdir(OUT, { recursive: true });

const CANDIDATES = ['node_modules/.cache/fonts'];

async function findSource() {
  for (const dir of CANDIDATES) {
    try {
      for (const f of await readdir(dir)) {
        if (/\.(ttf|otf)$/i.test(f)) return join(dir, f);
      }
    } catch {}
  }
  return null;
}

let src = await findSource();
if (!src) {
  // Google serves the full TTF from the css2 endpoint's @font-face src.
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600&display=swap',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:10.0) Gecko/20100101 Firefox/10.0' } }
  ).then((r) => r.text());
  const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error('找不到 Noto Serif TC 的原始字型檔');
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await mkdir('node_modules/.cache/fonts', { recursive: true });
  src = 'node_modules/.cache/fonts/noto-serif-tc.ttf';
  await writeFile(src, buf);
  console.log(`  下載原始字型 ${(buf.length / 1e6).toFixed(1)} MB`);
}

const dest = join(OUT, 'noto-serif-tc-600.woff2');
await run('python3', [
  '-m', 'fontTools.subset', src,
  `--unicodes=${codepoints}`,
  '--layout-features=kern,liga,locl,vert,vrt2',
  '--flavor=woff2',
  '--no-hinting',
  '--desubroutinize',
  `--output-file=${dest}`,
]);

const before = (await stat(src)).size;
const after = (await stat(dest)).size;
console.log(
  `  子集完成:${(before / 1e6).toFixed(1)} MB → ${(after / 1024).toFixed(0)} KB  →  ${dest}`
);
