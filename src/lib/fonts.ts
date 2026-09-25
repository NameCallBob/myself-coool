import localFont from 'next/font/local';

/**
 * The display face, declared apart from the root layout on purpose.
 *
 * next/font emits its `<link rel="preload">` on the pages whose module graph
 * imports the font, so keeping this out of the root layout is what stops the
 * bench from downloading 256 KB of Chinese serif it never sets a single glyph
 * in — 200 tool pages were preloading it before this module existed.
 *
 * The cut is to the glyphs the prose pages actually render. Regenerate with
 * `node scripts/subset-fonts.mjs` after adding Chinese copy to a page that
 * uses `font-serif`; a glyph outside the subset falls back to the system
 * serif without warning.
 *
 * Apply `displaySerif.variable` on a page's outermost element. Everything
 * under it resolves `--font-serif`, including `.drop-cap` and `.pull-quote`.
 */
export const displaySerif = localFont({
  src: '../../public/fonts/noto-serif-tc-600.woff2',
  weight: '600',
  style: 'normal',
  variable: '--font-noto-serif-tc',
  display: 'swap',
});
