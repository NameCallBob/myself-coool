/**
 * Favicon set assembly.
 *
 * Two things happen in this file and neither of them touches a canvas:
 *
 *  1. **The ICO container.** An `.ico` is not an image format, it is a
 *     directory of images: a 6-byte header, one 16-byte entry per member, then
 *     the member payloads. Since Vista every real-world browser reads a PNG
 *     payload inside that container, so the tool stores PNGs and never has to
 *     write a BMP DIB with its upside-down rows and its AND mask. The bytes
 *     are assembled here so the offsets can be pinned by tests — an ICO with a
 *     wrong `imageOffset` still opens in some viewers, which is exactly the
 *     kind of bug that ships.
 *
 *  2. **The placement arithmetic** for squaring a non-square source, and the
 *     HTML/manifest text that goes with the finished set.
 *
 * Reference: the ICO layout is documented by Microsoft as ICONDIR +
 * ICONDIRENTRY (the same structure as CUR, with a different `idType`).
 */

export type Size = { width: number; height: number };

/** A member of the ICO container: one already-encoded PNG and its dimensions. */
export type IcoMember = {
  width: number;
  height: number;
  png: Uint8Array;
};

/** What a parsed ICONDIRENTRY says, after the 0-means-256 quirk is undone. */
export type IcoEntry = {
  width: number;
  height: number;
  bitCount: number;
  bytes: number;
  offset: number;
  /** True when the payload starts with the PNG signature rather than a DIB. */
  png: boolean;
};

/**
 * A single ICO member may not exceed 256 px: the directory stores the edge
 * length in one unsigned byte, with 0 standing in for 256.
 */
export const ICO_MAX_SIDE = 256;

/** Every size the generator can write, and what each one is actually for. */
export const KNOWN_SIZES: { size: number; use: { zh: string; en: string } }[] = [
  { size: 16, use: { zh: '瀏覽器分頁、書籤列', en: 'Tab and bookmark bar' } },
  { size: 32, use: { zh: '高解析分頁、Windows 工作列', en: 'Retina tab, Windows taskbar' } },
  { size: 48, use: { zh: 'Windows 桌面捷徑', en: 'Windows desktop shortcut' } },
  { size: 64, use: { zh: 'Windows 大圖示(選用)', en: 'Windows large icon (optional)' } },
  { size: 128, use: { zh: 'Chrome 舊版擴充/應用', en: 'Legacy Chrome app icon' } },
  { size: 180, use: { zh: 'iOS apple-touch-icon', en: 'iOS apple-touch-icon' } },
  { size: 192, use: { zh: 'Android 主畫面(manifest)', en: 'Android home screen (manifest)' } },
  { size: 256, use: { zh: 'Windows 高解析、ICO 上限', en: 'Windows high-DPI, ICO ceiling' } },
  { size: 512, use: { zh: 'manifest 大圖、商店列表', en: 'Manifest large icon, store listings' } },
];

export const DEFAULT_PNG_SIZES = [16, 32, 48, 180, 192, 512];
export const DEFAULT_ICO_SIZES = [16, 32, 48];

/** PNG signature: \x89 P N G \r \n \x1a \n. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(data: Uint8Array): boolean {
  if (data.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (data[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Read width/height out of a PNG's IHDR.
 *
 * The directory entry has to agree with the payload, and the only honest way
 * to know the payload's size is to read it rather than to trust whatever the
 * caller thought it asked the canvas for.
 */
export function readPngSize(data: Uint8Array): Size {
  if (!isPng(data)) throw new Error('not a PNG (signature mismatch)');
  // 8-byte signature, then the first chunk: length(4) type(4) data... IHDR is
  // required by the spec to be first, and its data starts at byte 16.
  if (data.length < 24) throw new Error('PNG truncated before IHDR');
  const type = String.fromCharCode(data[12], data[13], data[14], data[15]);
  if (type !== 'IHDR') throw new Error(`expected IHDR first, found ${type}`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) throw new Error('PNG reports a zero dimension');
  return { width, height };
}

/**
 * Assemble the ICO container.
 *
 * Layout, all little-endian:
 *
 *   ICONDIR       0  u16 reserved = 0
 *                 2  u16 type     = 1 (icon)
 *                 4  u16 count
 *   ICONDIRENTRY  0  u8  width    (0 = 256)
 *                 1  u8  height   (0 = 256)
 *                 2  u8  colours in palette (0 for truecolour)
 *                 3  u8  reserved = 0
 *                 4  u16 planes   = 1
 *                 6  u16 bitCount = 32
 *                 8  u32 bytes in payload
 *                12  u32 payload offset from the start of the file
 *
 * Members are written smallest first, which is what every generator does and
 * what old Windows shell code assumed.
 */
export function buildIco(members: IcoMember[]): Uint8Array {
  if (members.length === 0) throw new Error('an ICO needs at least one image');
  if (members.length > 255) throw new Error('refusing to write more than 255 members');

  const seen = new Set<number>();
  for (const member of members) {
    for (const side of [member.width, member.height]) {
      if (!Number.isInteger(side) || side < 1 || side > ICO_MAX_SIDE) {
        throw new Error(`ICO side must be an integer 1–${ICO_MAX_SIDE}, got ${side}`);
      }
    }
    if (member.png.length === 0) throw new Error('empty payload');
    if (seen.has(member.width * 0x10000 + member.height)) {
      throw new Error(`duplicate ${member.width}x${member.height} entry`);
    }
    seen.add(member.width * 0x10000 + member.height);
  }

  const sorted = [...members].sort((a, b) => a.width - b.width || a.height - b.height);
  const headerBytes = 6 + 16 * sorted.length;
  const total = sorted.reduce((sum, member) => sum + member.png.length, headerBytes);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, sorted.length, true);

  let offset = headerBytes;
  sorted.forEach((member, index) => {
    const at = 6 + index * 16;
    out[at] = member.width === ICO_MAX_SIDE ? 0 : member.width;
    out[at + 1] = member.height === ICO_MAX_SIDE ? 0 : member.height;
    out[at + 2] = 0;
    out[at + 3] = 0;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, member.png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(member.png, offset);
    offset += member.png.length;
  });

  return out;
}

/**
 * Read an ICO directory back.
 *
 * Used by the tool to show what it just wrote (and by the tests to check the
 * offsets land on real payloads instead of merely looking plausible).
 */
export function parseIco(data: Uint8Array): IcoEntry[] {
  if (data.length < 6) throw new Error('too short to be an ICO');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint16(0, true) !== 0) throw new Error('reserved field is not zero');
  const type = view.getUint16(2, true);
  if (type !== 1) throw new Error(type === 2 ? 'this is a .cur, not an .ico' : 'unknown ICO type');
  const count = view.getUint16(4, true);
  if (count === 0) throw new Error('directory is empty');
  if (data.length < 6 + count * 16) throw new Error('directory is truncated');

  const entries: IcoEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16;
    const bytes = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (offset + bytes > data.length) {
      throw new Error(`entry ${index} points past the end of the file`);
    }
    entries.push({
      width: data[at] === 0 ? ICO_MAX_SIDE : data[at],
      height: data[at + 1] === 0 ? ICO_MAX_SIDE : data[at + 1],
      bitCount: view.getUint16(at + 6, true),
      bytes,
      offset,
      png: isPng(data.subarray(offset, offset + Math.min(bytes, 8))),
    });
  }
  return entries;
}

export type FitMode = 'contain' | 'cover';

/** Where to draw the source inside a square icon box, in device pixels. */
export type Draw = { x: number; y: number; width: number; height: number };

/**
 * Square a rectangular source.
 *
 * `contain` keeps everything and leaves margin (filled with the background by
 * the caller); `cover` fills the box and cuts the long edge. `padding` is a
 * fraction of the box taken off every side first, which is how you stop a
 * wordmark from touching the edge at 16 px.
 */
export function planDraw(source: Size, box: number, mode: FitMode, padding = 0): Draw {
  if (!Number.isFinite(box) || box <= 0) throw new Error('box must be a positive number');
  if (source.width <= 0 || source.height <= 0) throw new Error('source has a zero dimension');
  if (!(padding >= 0) || padding >= 0.5) throw new Error('padding must be in [0, 0.5)');

  const inset = box * padding;
  const content = box - inset * 2;
  const scale =
    mode === 'cover'
      ? Math.max(content / source.width, content / source.height)
      : Math.min(content / source.width, content / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: inset + (content - width) / 2,
    y: inset + (content - height) / 2,
    width,
    height,
  };
}

/**
 * Parse a user-edited size list ("16, 32, 48").
 *
 * The size table is editable in the UI, so this has to reject nonsense rather
 * than silently produce a 0x0 icon.
 */
export function parseSizeList(text: string, max = 1024): number[] {
  const out: number[] = [];
  for (const piece of text.split(/[\s,;]+/)) {
    if (piece === '') continue;
    if (!/^\d+$/.test(piece)) throw new Error(`"${piece}" is not a whole number`);
    const size = Number(piece);
    if (size < 1 || size > max) throw new Error(`${size} is outside 1–${max}`);
    if (!out.includes(size)) out.push(size);
  }
  if (out.length === 0) throw new Error('no sizes given');
  return out.sort((a, b) => a - b);
}

export type SnippetOptions = {
  /** URL prefix the files will live under, e.g. "/" or "/assets/". */
  base: string;
  /** PNG sizes that were generated. */
  pngSizes: number[];
  /** Sizes packed into favicon.ico, empty when no ICO was written. */
  icoSizes: number[];
  /** Which PNG size is served as the iOS touch icon (0 = none). */
  appleSize: number;
  /** Emit a <link rel="manifest"> line. */
  manifest: boolean;
};

/** Normalise a base path to exactly one trailing slash (empty stays empty). */
export function normalizeBase(base: string): string {
  const trimmed = base.trim();
  if (trimmed === '' || trimmed === '/') return '/';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function pngFileName(size: number): string {
  return `icon-${size}x${size}.png`;
}

export const APPLE_FILE_NAME = 'apple-touch-icon.png';
export const ICO_FILE_NAME = 'favicon.ico';
export const MANIFEST_FILE_NAME = 'manifest.webmanifest';

/**
 * The markup to paste into <head>.
 *
 * Deliberately short. `favicon.ico` carries the legacy cases (and is found at
 * the root even with no markup at all), one or two PNG links cover modern
 * browsers, `apple-touch-icon` covers iOS because iOS ignores the manifest for
 * the home-screen icon, and the manifest covers Android.
 */
export function htmlSnippet(options: SnippetOptions): string {
  const base = normalizeBase(options.base);
  const lines: string[] = [];

  if (options.icoSizes.length > 0) {
    const sizes = [...options.icoSizes].sort((a, b) => a - b).map((s) => `${s}x${s}`).join(' ');
    lines.push(`<link rel="icon" href="${base}${ICO_FILE_NAME}" sizes="${sizes}">`);
  }
  for (const size of [...options.pngSizes].sort((a, b) => a - b)) {
    if (size === options.appleSize) continue;
    lines.push(
      `<link rel="icon" type="image/png" sizes="${size}x${size}" href="${base}${pngFileName(size)}">`
    );
  }
  if (options.appleSize > 0) {
    lines.push(`<link rel="apple-touch-icon" sizes="${options.appleSize}x${options.appleSize}" href="${base}${APPLE_FILE_NAME}">`);
  }
  if (options.manifest) {
    lines.push(`<link rel="manifest" href="${base}${MANIFEST_FILE_NAME}">`);
  }
  return lines.join('\n');
}

export type ManifestOptions = {
  base: string;
  name: string;
  shortName: string;
  sizes: number[];
  themeColor: string;
  backgroundColor: string;
};

/**
 * A minimal web app manifest listing the icons.
 *
 * `purpose` is left off on purpose: `maskable` icons need a design with a
 * safe zone, and claiming it for an icon that merely happens to be square is
 * how you get a logo with its corners shaved off on Android.
 */
export function manifestJson(options: ManifestOptions): string {
  const base = normalizeBase(options.base);
  const icons = [...options.sizes]
    .sort((a, b) => a - b)
    .map((size) => ({
      src: `${base}${pngFileName(size)}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    }));
  return `${JSON.stringify(
    {
      name: options.name,
      short_name: options.shortName,
      icons,
      theme_color: options.themeColor,
      background_color: options.backgroundColor,
      display: 'standalone',
    },
    null,
    2
  )}\n`;
}
