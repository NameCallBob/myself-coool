/**
 * Hexdump, magic-number identification and byte-level search.
 *
 * The file is never held in memory in one piece. A hexdump only ever shows a
 * window of a few hundred bytes, so the viewer reads exactly that window with
 * `File.slice()` — which means a 4 GB disk image opens as fast as a 4 KB one,
 * and the browser is never asked for a 4 GB ArrayBuffer it would refuse.
 *
 * Signatures are honest heuristics, not proof. A file starting with `PK\x03\x04`
 * is a ZIP container, which is equally the right answer for a .docx, a .jar, an
 * .apk and an .epub; `CA FE BA BE` is both a Java class file and a Mach-O
 * universal binary. So identification returns every match with its offset and
 * says what else the bytes could be, rather than printing one confident name.
 */

export type Signature = {
  name: string;
  /** Byte offset the pattern sits at. Not always zero — tar's is at 257. */
  offset: number;
  /** Bytes to match; `null` is a wildcard. */
  bytes: (number | null)[];
  /** Extensions that share this signature, when there are several. */
  also?: string;
};

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

/**
 * Magic numbers, in no particular order; matches are ranked by length.
 *
 * Only signatures that are actually distinguishing are here. "First two bytes
 * are 0xFF 0xD8" is a real JPEG test; "the file contains the word PDF" is not,
 * and a table full of one-byte patterns produces more noise than answers.
 */
export const SIGNATURES: Signature[] = [
  /* Images */
  { name: 'PNG', offset: 0, bytes: [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'JPEG', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { name: 'GIF87a', offset: 0, bytes: ascii('GIF87a') },
  { name: 'GIF89a', offset: 0, bytes: ascii('GIF89a') },
  { name: 'BMP', offset: 0, bytes: ascii('BM') },
  { name: 'WebP', offset: 8, bytes: ascii('WEBP'), also: 'inside a RIFF container' },
  { name: 'TIFF (little-endian)', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: 'TIFF (big-endian)', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: 'ICO', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00], also: 'CUR uses 00 00 02 00' },
  { name: 'Photoshop PSD', offset: 0, bytes: ascii('8BPS') },
  { name: 'AVIF', offset: 8, bytes: ascii('avif') },
  { name: 'HEIC', offset: 8, bytes: ascii('heic') },

  /* Documents and archives */
  { name: 'PDF', offset: 0, bytes: ascii('%PDF-') },
  {
    name: 'ZIP container',
    offset: 0,
    bytes: [...ascii('PK'), 0x03, 0x04],
    also: 'also .docx .xlsx .pptx .jar .apk .epub .odt — all ZIP',
  },
  { name: 'ZIP (empty archive)', offset: 0, bytes: [...ascii('PK'), 0x05, 0x06] },
  { name: 'ZIP (spanned archive)', offset: 0, bytes: [...ascii('PK'), 0x07, 0x08] },
  { name: 'gzip', offset: 0, bytes: [0x1f, 0x8b] },
  { name: 'bzip2', offset: 0, bytes: ascii('BZh') },
  { name: 'xz', offset: 0, bytes: [0xfd, ...ascii('7zXZ'), 0x00] },
  { name: 'zstd', offset: 0, bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: 'LZ4 frame', offset: 0, bytes: [0x04, 0x22, 0x4d, 0x18] },
  { name: '7-Zip', offset: 0, bytes: [...ascii('7z'), 0xbc, 0xaf, 0x27, 0x1c] },
  { name: 'RAR v1.5–4.0', offset: 0, bytes: [...ascii('Rar!'), 0x1a, 0x07, 0x00] },
  { name: 'RAR v5+', offset: 0, bytes: [...ascii('Rar!'), 0x1a, 0x07, 0x01, 0x00] },
  { name: 'tar', offset: 257, bytes: ascii('ustar') },
  { name: 'ar archive (.deb, .a)', offset: 0, bytes: ascii('!<arch>') },
  { name: 'Microsoft Cabinet', offset: 0, bytes: ascii('MSCF') },
  { name: 'ISO 9660 image', offset: 0x8001, bytes: ascii('CD001') },
  { name: 'RTF', offset: 0, bytes: ascii('{\\rtf') },
  {
    name: 'legacy Office (OLE2)',
    offset: 0,
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    also: 'the old .doc .xls .ppt, and .msi',
  },

  /* Executables and bytecode */
  { name: 'ELF', offset: 0, bytes: [0x7f, ...ascii('ELF')] },
  { name: 'DOS/Windows executable (MZ)', offset: 0, bytes: ascii('MZ'), also: '.exe .dll .sys' },
  { name: 'Mach-O 32-bit', offset: 0, bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'Mach-O 64-bit', offset: 0, bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'Mach-O 64-bit (reverse)', offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  {
    name: 'Java class file',
    offset: 0,
    bytes: [0xca, 0xfe, 0xba, 0xbe],
    also: 'identical to a Mach-O universal binary — check the next four bytes',
  },
  { name: 'WebAssembly', offset: 0, bytes: [0x00, ...ascii('asm'), 0x01, 0x00, 0x00, 0x00] },
  { name: 'Windows shortcut (.lnk)', offset: 0, bytes: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00] },

  /* Audio, video, fonts, data */
  { name: 'MP4 / MOV / 3GP', offset: 4, bytes: ascii('ftyp'), also: 'the brand at offset 8 says which' },
  { name: 'Matroska / WebM', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'Ogg', offset: 0, bytes: ascii('OggS') },
  { name: 'FLAC', offset: 0, bytes: ascii('fLaC') },
  { name: 'MP3 with ID3 tag', offset: 0, bytes: ascii('ID3') },
  { name: 'WAV', offset: 8, bytes: ascii('WAVE') },
  { name: 'AVI', offset: 8, bytes: ascii('AVI ') },
  { name: 'AIFF', offset: 8, bytes: ascii('AIFF') },
  { name: 'WOFF font', offset: 0, bytes: ascii('wOFF') },
  { name: 'WOFF2 font', offset: 0, bytes: ascii('wOF2') },
  { name: 'TrueType font', offset: 0, bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },
  { name: 'OpenType font', offset: 0, bytes: ascii('OTTO') },
  { name: 'TrueType collection', offset: 0, bytes: ascii('ttcf') },
  { name: 'SQLite 3 database', offset: 0, bytes: [...ascii('SQLite format 3'), 0x00] },
  { name: 'pcap (little-endian)', offset: 0, bytes: [0xd4, 0xc3, 0xb2, 0xa1] },
  { name: 'pcap (big-endian)', offset: 0, bytes: [0xa1, 0xb2, 0xc3, 0xd4] },
  { name: 'pcapng', offset: 0, bytes: [0x0a, 0x0d, 0x0d, 0x0a] },
  { name: 'Flash SWF', offset: 0, bytes: ascii('FWS') },
  { name: 'Flash SWF (compressed)', offset: 0, bytes: ascii('CWS') },

  /* Text markers */
  { name: 'UTF-8 BOM', offset: 0, bytes: [0xef, 0xbb, 0xbf], also: 'a text file with a byte-order mark' },
  { name: 'UTF-16 LE BOM', offset: 0, bytes: [0xff, 0xfe] },
  { name: 'UTF-16 BE BOM', offset: 0, bytes: [0xfe, 0xff] },
  { name: 'script with a shebang', offset: 0, bytes: ascii('#!') },
];

export type Match = { signature: Signature; offset: number; length: number };

/**
 * Every signature the given head bytes satisfy, most specific first.
 *
 * `head` does not have to be the whole file — signatures beyond its length are
 * skipped rather than failed, so passing the first 64 KB catches everything in
 * the table (the deepest is ISO 9660's, at 0x8001).
 */
export function identify(head: Uint8Array): Match[] {
  const matches: Match[] = [];
  for (const signature of SIGNATURES) {
    const end = signature.offset + signature.bytes.length;
    if (head.length < end) continue;
    let hit = true;
    for (let i = 0; i < signature.bytes.length; i += 1) {
      const expected = signature.bytes[i];
      if (expected !== null && head[signature.offset + i] !== expected) {
        hit = false;
        break;
      }
    }
    if (hit) matches.push({ signature, offset: signature.offset, length: signature.bytes.length });
  }
  return matches.sort((x, y) => y.length - x.length || x.offset - y.offset);
}

/** The deepest offset any signature needs, so a caller knows what head to read. */
export const HEAD_BYTES = SIGNATURES.reduce(
  (n, signature) => Math.max(n, signature.offset + signature.bytes.length),
  0
);

/* ── The dump ─────────────────────────────── */

const HEX = '0123456789abcdef';

export function hexByte(byte: number, upper = false): string {
  const text = HEX[byte >> 4] + HEX[byte & 15];
  return upper ? text.toUpperCase() : text;
}

/**
 * Printable ASCII, or a full stop.
 *
 * Only 0x20–0x7E. Latin-1's upper half is *not* substituted in: showing `é`
 * for 0xE9 in a file that is really UTF-8 or Big5 invents information, and the
 * gutter's job is to let you spot ASCII strings, not to decode text.
 */
export function asciiChar(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
}

export type DumpLine = {
  /** Absolute offset of this line's first byte. */
  offset: number;
  /** One entry per column; empty string past the end of the data. */
  hex: string[];
  ascii: string;
};

export function dumpLines(
  data: Uint8Array,
  base = 0,
  width = 16,
  options: { upper?: boolean } = {}
): DumpLine[] {
  const lines: DumpLine[] = [];
  for (let i = 0; i < data.length; i += width) {
    const slice = data.subarray(i, i + width);
    const hex = Array.from({ length: width }, (_, k) =>
      k < slice.length ? hexByte(slice[k], options.upper) : ''
    );
    lines.push({
      offset: base + i,
      hex,
      ascii: [...slice].map(asciiChar).join(''),
    });
  }
  return lines;
}

/** Offset in hex, padded to at least eight digits like every other hexdump. */
export function formatOffset(offset: number, upper = false): string {
  const text = offset.toString(16).padStart(8, '0');
  return upper ? text.toUpperCase() : text;
}

/** The classic three-column text form, for the clipboard. */
export function renderDump(lines: readonly DumpLine[], options: { upper?: boolean } = {}): string {
  return lines
    .map((line) => {
      const groups: string[] = [];
      for (let i = 0; i < line.hex.length; i += 8) {
        groups.push(line.hex.slice(i, i + 8).map((cell) => cell || '  ').join(' '));
      }
      return `${formatOffset(line.offset, options.upper)}  ${groups.join('  ')}  |${line.ascii}|`;
    })
    .join('\n');
}

/* ── Search ───────────────────────────────── */

export class NeedleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NeedleError';
  }
}

export type NeedleKind = 'hex' | 'text';

/** Turns the search box into bytes. Hex accepts any of the usual separators. */
export function parseNeedle(query: string, kind: NeedleKind): Uint8Array {
  if (kind === 'text') {
    if (query === '') throw new NeedleError('nothing to search for');
    return new TextEncoder().encode(query);
  }
  const clean = query
    .split(/[\s:,_-]+/)
    .filter((token) => token !== '')
    .map((token) => token.replace(/^0[xX]/, ''))
    .join('');
  if (clean === '') throw new NeedleError('nothing to search for');
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new NeedleError('hex search takes only 0-9 and a-f');
  if (clean.length % 2 !== 0) throw new NeedleError('hex search needs an even number of digits');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const MATCH_LIMIT = 500;

/**
 * Every offset in `data` where `needle` occurs, as absolute offsets.
 *
 * Plain byte-by-byte scanning: no Boyer-Moore, because the caller feeds this
 * multi-megabyte slices and the cost is already dominated by reading them off
 * disk. The match limit exists so searching for `00` in a sparse file returns a
 * list instead of a hundred million entries.
 */
export function search(
  data: Uint8Array,
  needle: Uint8Array,
  options: { base?: number; limit?: number } = {}
): number[] {
  const base = options.base ?? 0;
  const limit = options.limit ?? MATCH_LIMIT;
  const found: number[] = [];
  if (needle.length === 0 || needle.length > data.length) return found;

  const last = data.length - needle.length;
  outer: for (let i = 0; i <= last; i += 1) {
    if (data[i] !== needle[0]) continue;
    for (let k = 1; k < needle.length; k += 1) {
      if (data[i + k] !== needle[k]) continue outer;
    }
    found.push(base + i);
    if (found.length >= limit) break;
  }
  return found;
}

/* ── Measurements ─────────────────────────── */

export function histogram(data: Uint8Array): Uint32Array {
  const counts = new Uint32Array(256);
  for (const byte of data) counts[byte] += 1;
  return counts;
}

/**
 * Shannon entropy in bits per byte, 0 to 8.
 *
 * The one number that tells you what kind of file you are looking at without
 * knowing its format. English text sits near 4.5, a binary with lots of zero
 * padding lower, and anything compressed or encrypted crowds up against 8 —
 * because both processes exist to remove exactly the redundancy this measures.
 */
export function entropy(data: Uint8Array): number {
  if (data.length === 0) return 0;
  const counts = histogram(data);
  let bits = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / data.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

export type EntropyVerdict = 'low' | 'text' | 'mixed' | 'dense';

export function classifyEntropy(bits: number): EntropyVerdict {
  if (bits < 3) return 'low';
  if (bits < 5.5) return 'text';
  if (bits < 7.5) return 'mixed';
  return 'dense';
}

export type ByteStats = {
  bytes: number;
  printable: number;
  zero: number;
  high: number;
  entropy: number;
  verdict: EntropyVerdict;
};

export function stats(data: Uint8Array): ByteStats {
  let printable = 0;
  let zero = 0;
  let high = 0;
  for (const byte of data) {
    if (byte >= 0x20 && byte <= 0x7e) printable += 1;
    if (byte === 0) zero += 1;
    if (byte >= 0x80) high += 1;
  }
  const bits = entropy(data);
  return { bytes: data.length, printable, zero, high, entropy: bits, verdict: classifyEntropy(bits) };
}

/** Longest run of printable ASCII, the `strings(1)` idea in one number. */
export function longestAsciiRun(data: Uint8Array): number {
  let best = 0;
  let run = 0;
  for (const byte of data) {
    if (byte >= 0x20 && byte <= 0x7e) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}
