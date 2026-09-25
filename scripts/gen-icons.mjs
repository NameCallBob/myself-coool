/**
 * Renders the PWA icon set from src/app/icon.svg.
 *
 * Playwright is already a dev dependency for the screenshot scripts, so the
 * icons come out of a real renderer instead of adding an image library to the
 * tree — one fewer package in the supply chain for the sake of four PNGs.
 *
 * The maskable variant is not the same drawing scaled up: Android crops to a
 * circle inscribed in the middle 80%, so the mark is drawn at 60% inside a
 * full-bleed field. Reusing the normal icon would clip the diamond's points.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

const source = readFileSync('src/app/icon.svg', 'utf8');
const inner = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const PAPER = '#FAF8F4';

/** `scale` is the mark's share of the canvas; the rest is quiet field. */
function page(size, scale) {
  const box = Math.round(size * scale);
  const offset = Math.round((size - box) / 2);
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;width:${size}px;height:${size}px;background:${PAPER}}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${PAPER}"/>
  <svg x="${offset}" y="${offset}" width="${box}" height="${box}" viewBox="0 0 32 32">${inner}</svg>
</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, scale: 0.86 },
  { file: 'icon-512.png', size: 512, scale: 0.86 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.6 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.8 },
];

const browser = await chromium.launch();
try {
  for (const target of TARGETS) {
    const tab = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    });
    await tab.setContent(page(target.size, target.scale), { waitUntil: 'load' });
    const buffer = await tab.screenshot({ type: 'png' });
    writeFileSync(join(OUT, target.file), buffer);
    await tab.close();
    console.log(`${OUT}/${target.file} — ${target.size}px (${buffer.length} bytes)`);
  }
} finally {
  await browser.close();
}
