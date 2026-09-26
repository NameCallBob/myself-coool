import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FIELDS,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  cleanName,
  dmsToDecimal,
  formatEntry,
  parseTiffBlock,
  readMetadata,
  scanJpegSegments,
  scanPngChunks,
  stripMetadata,
  tagName,
  type Entry,
} from './logic.ts';

/* ── builders: the test vectors are assembled byte by byte ───────────── */

type Spec = { tag: number; type: number; value: string | number[] | [number, number][] };

const ascii = (tag: number, text: string): Spec => ({ tag, type: 2, value: text });
const short = (tag: number, ...values: number[]): Spec => ({ tag, type: 3, value: values });
const long = (tag: number, ...values: number[]): Spec => ({ tag, type: 4, value: values });
const rational = (tag: number, ...pairs: [number, number][]): Spec => ({ tag, type: 5, value: pairs });

function countOf(spec: Spec): number {
  if (typeof spec.value === 'string') return spec.value.length + 1;
  return spec.value.length;
}

function sizeOf(spec: Spec): number {
  const unit = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][spec.type];
  return unit * countOf(spec);
}

function ifdSize(specs: Spec[]): number {
  return 2 + specs.length * 12 + 4;
}

/**
 * A TIFF block with IFD0, optional Exif/GPS sub-IFDs and an optional IFD1.
 * Offsets are laid out by hand so the parser is tested against a file whose
 * every byte is known, not against a library's output.
 */
function tiff(
  order: 'II' | 'MM',
  ifd0: Spec[],
  parts: { exif?: Spec[]; gps?: Spec[]; ifd1?: Spec[] } = {}
): Uint8Array {
  const little = order === 'II';
  const hasExif = !!parts.exif;
  const hasGps = !!parts.gps;
  const ifd0All: Spec[] = [...ifd0];
  // Sub-IFD pointers are ordinary LONG entries; their values are patched later.
  if (hasExif) ifd0All.push(long(0x8769, 0));
  if (hasGps) ifd0All.push(long(0x8825, 0));
  ifd0All.sort((a, b) => a.tag - b.tag);

  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(ifd0All);
  const gpsAt = exifAt + (hasExif ? ifdSize(parts.exif!) : 0);
  const ifd1At = gpsAt + (hasGps ? ifdSize(parts.gps!) : 0);
  const dataAt = ifd1At + (parts.ifd1 ? ifdSize(parts.ifd1) : 0);

  const tables: [Spec[], number][] = [[ifd0All, ifd0At]];
  if (hasExif) tables.push([parts.exif!, exifAt]);
  if (hasGps) tables.push([parts.gps!, gpsAt]);
  if (parts.ifd1) tables.push([parts.ifd1, ifd1At]);

  let dataBytes = 0;
  for (const [specs] of tables) {
    for (const spec of specs) if (sizeOf(spec) > 4) dataBytes += sizeOf(spec) + (sizeOf(spec) % 2);
  }

  const out = new Uint8Array(dataAt + dataBytes);
  const view = new DataView(out.buffer);
  out[0] = little ? 0x49 : 0x4d;
  out[1] = out[0];
  view.setUint16(2, 42, little);
  view.setUint32(4, ifd0At, little);

  let dataCursor = dataAt;
  const writeValue = (spec: Spec, at: number) => {
    const bytes = new Uint8Array(sizeOf(spec));
    const bv = new DataView(bytes.buffer);
    if (typeof spec.value === 'string') {
      for (let i = 0; i < spec.value.length; i += 1) bytes[i] = spec.value.charCodeAt(i);
    } else if (spec.type === 3) {
      (spec.value as number[]).forEach((v, i) => bv.setUint16(i * 2, v, little));
    } else if (spec.type === 4) {
      (spec.value as number[]).forEach((v, i) => bv.setUint32(i * 4, v, little));
    } else if (spec.type === 5) {
      (spec.value as [number, number][]).forEach(([n, d], i) => {
        bv.setUint32(i * 8, n, little);
        bv.setUint32(i * 8 + 4, d, little);
      });
    } else if (spec.type === 1 || spec.type === 7) {
      (spec.value as number[]).forEach((v, i) => {
        bytes[i] = v;
      });
    }
    if (bytes.length <= 4) {
      out.set(bytes, at + 8);
    } else {
      out.set(bytes, dataCursor);
      view.setUint32(at + 8, dataCursor, little);
      dataCursor += bytes.length + (bytes.length % 2);
    }
  };

  for (const [specs, at] of tables) {
    view.setUint16(at, specs.length, little);
    specs.forEach((spec, i) => {
      const entryAt = at + 2 + i * 12;
      view.setUint16(entryAt, spec.tag, little);
      view.setUint16(entryAt + 2, spec.type, little);
      view.setUint32(entryAt + 4, countOf(spec), little);
      if (spec.tag === 0x8769 && hasExif) view.setUint32(entryAt + 8, exifAt, little);
      else if (spec.tag === 0x8825 && hasGps) view.setUint32(entryAt + 8, gpsAt, little);
      else writeValue(spec, entryAt);
    });
    const nextAt = at + 2 + specs.length * 12;
    view.setUint32(nextAt, at === ifd0At && parts.ifd1 ? ifd1At : 0, little);
  }
  return out;
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 4);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (payload.length + 2) >> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

/** Latin-1 bytes, the encoding tEXt and the segment prefixes actually use. */
const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
/** UTF-8 bytes, for iTXt. */
const utf8 = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Not a decodable image — a marker chain with a scan whose bytes are known. */
const SCAN = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]);

function jpegWith(exif?: Uint8Array, extra: Uint8Array[] = []): Uint8Array {
  const parts = [new Uint8Array([0xff, 0xd8]), segment(0xe0, concat(text('JFIF\0'), new Uint8Array([1, 2, 0, 0, 0, 1, 0, 1, 0, 0])))];
  if (exif) parts.push(segment(0xe1, concat(text('Exif\0\0'), exif)));
  parts.push(...extra, SCAN);
  return concat(...parts);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(text(type), 4);
  out.set(data, 8);
  view.setUint32(out.length - 4, 0xdeadbeef); // CRC is never recomputed, only preserved
  return out;
}

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ── limits ──────────────────────────────────────────────────────────── */

test('the declared ceilings are the ones the reader enforces', () => {
  assert.equal(MAX_FILE_BYTES, 64 * 1024 * 1024);
  assert.equal(MAX_FIELDS, 4096);
  assert.equal(MAX_TEXT_CHARS, 512);
  const oversized = new Uint8Array(MAX_FILE_BYTES + 1);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  const report = readMetadata(oversized);
  assert.equal(report.container, 'unknown');
  assert.match(report.warnings.join('\n'), /larger than/);
});

/* ── JPEG segments ───────────────────────────────────────────────────── */

test('the segment chain is read up to the scan, fill bytes included', () => {
  const file = concat(
    new Uint8Array([0xff, 0xd8]),
    segment(0xe0, text('JFIF\0')),
    new Uint8Array([0xff]), // fill byte before the next marker
    segment(0xfe, text('hello')),
    SCAN
  );
  const { segments, tailOffset } = scanJpegSegments(file);
  assert.deepEqual(segments.map((s) => s.marker), [0xe0, 0xfe]);
  assert.equal(segments[0].payloadLength, 5);
  assert.equal(segments[1].payloadLength, 5);
  assert.equal(segments[1].totalLength, 9);
  assert.equal(tailOffset, file.length - SCAN.length);
  assert.equal(file[tailOffset], 0xff);
  assert.equal(file[tailOffset + 1], 0xda);
});

test('restart and standalone markers carry no length', () => {
  const file = concat(new Uint8Array([0xff, 0xd8, 0xff, 0xd0, 0xff, 0x01]), segment(0xe1, text('x')), SCAN);
  const { segments } = scanJpegSegments(file);
  assert.deepEqual(segments.map((s) => s.marker), [0xe1]);
});

test('a file that is not a JPEG, or whose lengths lie, is rejected', () => {
  assert.throws(() => scanJpegSegments(new Uint8Array([1, 2, 3, 4])), /not a JPEG/);
  assert.throws(() => scanJpegSegments(new Uint8Array([0xff, 0xd8])), /not a JPEG/);
  // A segment claiming 0xffff bytes in a 10-byte file.
  assert.throws(
    () => scanJpegSegments(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0, 0, 0])),
    /past the end/
  );
  // Length below the two bytes the length field itself occupies.
  assert.throws(
    () => scanJpegSegments(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0, 0])),
    /impossible length/
  );
  // A byte where a marker must be.
  assert.throws(() => scanJpegSegments(new Uint8Array([0xff, 0xd8, 0x41, 0x41, 0x41, 0x41])), /expected a marker/);
});

/* ── PNG chunks ──────────────────────────────────────────────────────── */

test('PNG chunks are walked by their length prefix and stop at IEND', () => {
  const file = concat(
    PNG_HEAD,
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('tEXt', concat(text('Author\0'), text('binbin'))),
    pngChunk('IEND', new Uint8Array(0)),
    text('trailing junk ignored')
  );
  const chunks = scanPngChunks(file);
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'tEXt', 'IEND']);
  assert.equal(chunks[1].dataLength, 13);
  assert.equal(chunks[1].totalLength, 25);
  assert.equal(chunks[0].offset, 8);
});

test('a bad PNG signature or an over-long chunk is rejected', () => {
  assert.throws(() => scanPngChunks(new Uint8Array([1, 2, 3])), /too short/);
  assert.throws(() => scanPngChunks(new Uint8Array(20)), /bad signature/);
  const lying = concat(PNG_HEAD, new Uint8Array([0x00, 0x00, 0x10, 0x00]), text('IDAT'), new Uint8Array(4));
  assert.throws(() => scanPngChunks(lying), /past the end/);
});

/* ── TIFF ────────────────────────────────────────────────────────────── */

test('both byte orders decode to the same values', () => {
  for (const order of ['II', 'MM'] as const) {
    const block = parseTiffBlock(tiff(order, [ascii(0x010f, 'Canon'), short(0x0112, 6), rational(0x011a, [72, 1])]));
    assert.equal(block.byteOrder, order === 'II' ? 'little' : 'big');
    const ifd0 = block.ifds.find((i) => i.name === 'ifd0')!;
    assert.equal(ifd0.entries.find((e) => e.tag === 0x010f)!.text, 'Canon');
    assert.equal(ifd0.entries.find((e) => e.tag === 0x0112)!.numbers[0], 6);
    assert.deepEqual(ifd0.entries.find((e) => e.tag === 0x011a)!.ratios, [[72, 1]]);
    assert.equal(ifd0.entries.find((e) => e.tag === 0x011a)!.numbers[0], 72);
  }
});

test('sub-IFDs are followed and the pointer entries are not reported as fields', () => {
  const block = parseTiffBlock(
    tiff('II', [ascii(0x0110, 'X100V')], {
      exif: [rational(0x829a, [1, 200])],
      gps: [ascii(0x0001, 'N')],
      ifd1: [long(0x0201, 1234)],
    })
  );
  assert.deepEqual(block.ifds.map((i) => i.name).sort(), ['exif', 'gps', 'ifd0', 'ifd1']);
  const ifd0 = block.ifds.find((i) => i.name === 'ifd0')!;
  assert.deepEqual(ifd0.entries.map((e) => e.tag), [0x0110]);
  assert.equal(block.ifds.find((i) => i.name === 'ifd1')!.entries[0].numbers[0], 1234);
});

test('a header that is not TIFF throws instead of guessing', () => {
  assert.throws(() => parseTiffBlock(new Uint8Array(4)), /shorter than its header/);
  assert.throws(() => parseTiffBlock(new Uint8Array([0x41, 0x42, 42, 0, 8, 0, 0, 0])), /unknown byte order/);
  const wrongMagic = tiff('II', [short(0x0112, 1)]);
  wrongMagic[2] = 41;
  assert.throws(() => parseTiffBlock(wrongMagic), /magic number 42/);
});

test('entries pointing outside the block are dropped with a warning, not followed', () => {
  const block = tiff('II', [ascii(0x010f, 'a long make string that needs an offset')]);
  const view = new DataView(block.buffer);
  view.setUint32(8 + 2 + 8, 0xfffff0, true); // value offset far past the end
  const parsed = parseTiffBlock(block);
  assert.equal(parsed.ifds[0].entries.length, 0);
  assert.match(parsed.warnings.join('\n'), /outside the Exif block|more than the block holds/);
});

test('an IFD that links to itself stops instead of looping', () => {
  const block = tiff('II', [short(0x0112, 1)], { ifd1: [short(0x0112, 2)] });
  const view = new DataView(block.buffer);
  view.setUint32(8 + 2 + 12, 8, true); // IFD0's next-IFD pointer aimed at IFD0
  const parsed = parseTiffBlock(block);
  assert.equal(parsed.ifds.length, 1);
  assert.match(parsed.warnings.join('\n'), /links back to itself/);
});

test('an unknown value type is skipped rather than mis-sized', () => {
  const block = tiff('II', [short(0x0112, 1)]);
  new DataView(block.buffer).setUint16(8 + 2 + 2, 99, true);
  const parsed = parseTiffBlock(block);
  assert.equal(parsed.ifds[0].entries.length, 0);
  assert.match(parsed.warnings.join('\n'), /unknown type 99/);
});

test('an entry count larger than the block is refused', () => {
  const block = tiff('II', [ascii(0x010f, 'Canon')]);
  new DataView(block.buffer).setUint32(8 + 2 + 4, 0x7fffffff, true);
  const parsed = parseTiffBlock(block);
  assert.equal(parsed.ifds[0].entries.length, 0);
  assert.match(parsed.warnings.join('\n'), /more than the block holds/);
});

/* ── names and formatting ────────────────────────────────────────────── */

test('tags are named per IFD, and unknown ones keep their number', () => {
  assert.equal(tagName('ifd0', 0x010f), 'Make');
  assert.equal(tagName('exif', 0x829a), 'ExposureTime');
  assert.equal(tagName('gps', 0x0002), 'GPSLatitude');
  assert.equal(tagName('interop', 0x0001), 'InteroperabilityIndex');
  // 0x0002 is GPSLatitude in the GPS IFD and nothing in IFD0.
  assert.equal(tagName('ifd0', 0x0002), 'Tag 0x0002');
});

function entry(tag: number, type: number, numbers: number[], ratios?: [number, number][]): Entry {
  return { tag, type, count: numbers.length, numbers, ratios };
}

test('exposure values are shown the way the camera wrote them', () => {
  assert.equal(formatEntry('exif', entry(0x829a, 5, [0.005], [[1, 200]])), '1/200 s');
  assert.equal(formatEntry('exif', entry(0x829a, 5, [0.005], [[10, 2000]])), '1/200 s');
  assert.equal(formatEntry('exif', entry(0x829a, 5, [2], [[2, 1]])), '2 s');
  assert.equal(formatEntry('exif', entry(0x829a, 5, [0], [[0, 1]])), '0 s');
  assert.equal(formatEntry('exif', entry(0x829a, 5, [Number.NaN], [[1, 0]])), '—');
  assert.equal(formatEntry('exif', entry(0x829d, 5, [2.8], [[28, 10]])), 'f/2.8');
  assert.equal(formatEntry('exif', entry(0x9205, 5, [4], [[4, 1]])), 'f/4'); // APEX 4 → f/4
  assert.equal(formatEntry('exif', entry(0x920a, 5, [23], [[23, 1]])), '23 mm');
  assert.equal(formatEntry('exif', entry(0xa405, 3, [35])), '35 mm');
  assert.equal(formatEntry('exif', entry(0x9204, 10, [-0.33], [[-1, 3]])), '-0.33 EV');
  assert.equal(formatEntry('exif', entry(0x9204, 10, [1], [[1, 1]])), '+1 EV');
});

test('coded values are spelled out, and unknown codes stay numeric', () => {
  assert.equal(formatEntry('ifd0', entry(0x0112, 3, [6])), '6 — rotated 90° CW');
  assert.equal(formatEntry('ifd0', entry(0x0112, 3, [99])), '99');
  assert.equal(formatEntry('exif', entry(0xa001, 3, [1])), 'sRGB');
  assert.equal(formatEntry('exif', entry(0x9207, 3, [5])), 'pattern');
  assert.equal(formatEntry('exif', entry(0x9209, 3, [0x19])), '0x19 — fired, mode: auto');
  assert.equal(formatEntry('exif', entry(0x9209, 3, [0x10])), '0x10 — did not fire, mode: off');
});

test('GPS values are shown as degrees, minutes and seconds', () => {
  assert.equal(
    formatEntry('gps', entry(0x0002, 5, [25, 2, 3.6], [[25, 1], [2, 1], [36, 10]])),
    "25° 2' 3.6\""
  );
  assert.equal(formatEntry('gps', entry(0x0007, 5, [7, 5, 30.4], [[7, 1], [5, 1], [304, 10]])), '07:05:30 UTC');
  assert.equal(formatEntry('gps', entry(0x0006, 5, [16.4], [[164, 10]])), '16.4 m');
  assert.equal(formatEntry('gps', entry(0x0000, 1, [2, 3, 0, 0])), '2.3.0.0');
  assert.equal(formatEntry('gps', entry(0x0005, 1, [1])), 'below sea level');
});

test('text is passed through and capped; blobs are shown as hex', () => {
  const short = { tag: 0x010e, type: 2, count: 3, numbers: [], text: 'hi' } as Entry;
  assert.equal(formatEntry('ifd0', short), 'hi');
  const long = { tag: 0x010e, type: 2, count: 2000, numbers: [], text: 'x'.repeat(2000) } as Entry;
  const shown = formatEntry('ifd0', long);
  assert.ok(shown.startsWith('x'.repeat(MAX_TEXT_CHARS)));
  assert.match(shown, /2000 chars/);
  const blob: Entry = { tag: 0x927c, type: 7, count: 300, numbers: [0x00, 0xff, 0x10] };
  assert.equal(formatEntry('exif', blob), '00 ff 10 …(300 bytes)');
  assert.equal(formatEntry('exif', { tag: 0x9000, type: 7, count: 4, numbers: [48, 50, 51, 50] }), '0232');
  assert.equal(formatEntry('ifd0', { tag: 0x0102, type: 3, count: 3, numbers: [8, 8, 8] }), '8, 8, 8');
  assert.equal(
    formatEntry('ifd0', { tag: 0x0211, type: 5, count: 3, numbers: [0.299, 0.587], ratios: [[299, 1000], [587, 1000]] }),
    '299/1000 (0.299), 587/1000 (0.587)'
  );
});

/* ── GPS conversion ──────────────────────────────────────────────────── */

test('degrees, minutes, seconds convert to signed decimal degrees', () => {
  // Taipei 101: 25° 2' 1.2" N, 121° 33' 53.9" E
  assert.equal(dmsToDecimal([25, 2, 1.2], 'N').toFixed(6), '25.033667');
  assert.equal(dmsToDecimal([121, 33, 53.9], 'E').toFixed(6), '121.564972');
  // Hemisphere letters carry the sign, not the numbers.
  assert.equal(dmsToDecimal([33, 51, 35.9], 'S').toFixed(6), '-33.859972');
  assert.equal(dmsToDecimal([118, 14, 34.3], 'W').toFixed(6), '-118.242861');
  assert.equal(dmsToDecimal([25, 2, 1.2], 'S'), -dmsToDecimal([25, 2, 1.2], 'N'));
  // Exact thirds: 30' is half a degree, 45" is 1/80 of a degree.
  assert.equal(dmsToDecimal([10, 30, 0], 'N'), 10.5);
  assert.equal(dmsToDecimal([0, 0, 45], 'N'), 0.0125);
  // Devices that put the whole angle in the degrees rational, or skip seconds.
  assert.equal(dmsToDecimal([25.5], 'N'), 25.5);
  assert.equal(dmsToDecimal([25, 30], 'N'), 25.5);
  // A trailing NUL or spaces from the ASCII field, and lower case.
  assert.equal(dmsToDecimal([1, 0, 0], ' w '), -1);
  assert.equal(dmsToDecimal([1, 0, 0], 'n'), 1);
  assert.equal(dmsToDecimal([0, 0, 0], 'N'), 0);
});

test('a missing or nonsense hemisphere is an error, not a guess', () => {
  assert.throws(() => dmsToDecimal([], 'N'), /no degrees value/);
  assert.throws(() => dmsToDecimal([1, 2, 3], ''), /unknown hemisphere/);
  assert.throws(() => dmsToDecimal([1, 2, 3], 'X'), /unknown hemisphere/);
  assert.throws(() => dmsToDecimal([Number.NaN, 0, 0], 'N'), /finite/);
  assert.throws(() => dmsToDecimal([1, Number.POSITIVE_INFINITY, 0], 'N'), /finite/);
});

/* ── whole-file reading ──────────────────────────────────────────────── */

const FULL = tiff(
  'MM',
  [ascii(0x010f, 'FUJIFILM'), ascii(0x0110, 'X-T5'), short(0x0112, 6), ascii(0x0131, 'Darktable 4.6')],
  {
    exif: [
      rational(0x829a, [1, 250]),
      rational(0x829d, [40, 10]),
      short(0x8827, 400),
      ascii(0x9003, '2026:03:14 09:26:53'),
      rational(0x920a, [35, 1]),
      long(0xa002, 6000),
      long(0xa003, 4000),
      ascii(0xa434, 'XF23mmF1.4 R'),
      ascii(0xa431, 'SN-0001'),
    ],
    gps: [
      ascii(0x0001, 'N'),
      rational(0x0002, [25, 1], [2, 1], [12, 10]),
      ascii(0x0003, 'E'),
      rational(0x0004, [121, 1], [33, 1], [539, 10]),
      { tag: 0x0005, type: 1, value: [0] },
      rational(0x0006, [164, 10]),
      rational(0x0007, [1, 1], [26, 1], [53, 1]),
      ascii(0x001d, '2026:03:14'),
    ],
  }
);

test('a JPEG is read down to camera, exposure, lens and GPS', () => {
  const report = readMetadata(jpegWith(FULL));
  assert.equal(report.container, 'jpeg');
  assert.equal(report.removable, true);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.summary.make, 'FUJIFILM');
  assert.equal(report.summary.model, 'X-T5');
  assert.equal(report.summary.lens, 'XF23mmF1.4 R');
  assert.equal(report.summary.software, 'Darktable 4.6');
  assert.equal(report.summary.dateTaken, '2026:03:14 09:26:53');
  assert.equal(report.summary.orientation, '6 — rotated 90° CW');
  assert.equal(report.summary.exposure, '1/250 s  ·  f/4  ·  35 mm  ·  ISO 400');
  assert.equal(report.summary.pixels, '6000 × 4000');
  assert.equal(report.summary.serial, 'SN-0001');

  assert.equal(report.gps?.decimal, '25.033667, 121.564972');
  assert.equal(report.gps?.altitude, 16.4);
  assert.equal(report.gps?.utc, '2026-03-14 01:26:53 UTC');

  // Blocks: the JFIF header is listed but marked as affecting rendering.
  assert.deepEqual(report.blocks.map((b) => b.label), ['APP0 JFIF', 'APP1 Exif']);
  const exifBlock = report.blocks.find((b) => b.kind === 'exif')!;
  assert.equal(exifBlock.identifying, true);
  assert.equal(exifBlock.affectsRendering, false);
  assert.equal(report.blocks.find((b) => b.kind === 'app')!.affectsRendering, true);

  // GPS fields and serial numbers are flagged; ISO is not.
  const gpsField = report.fields.find((f) => f.name === 'GPSLatitude')!;
  assert.equal(gpsField.identifying, true);
  assert.equal(gpsField.typeName, 'RATIONAL');
  assert.equal(report.fields.find((f) => f.name === 'ISOSpeedRatings')!.identifying, false);
  assert.equal(report.fields.find((f) => f.name === 'BodySerialNumber')!.identifying, true);
});

test('GPS without a hemisphere reference is reported as unknown, not as zero', () => {
  const block = tiff('II', [ascii(0x010f, 'x')], {
    gps: [rational(0x0002, [25, 1], [0, 1], [0, 1]), rational(0x0004, [121, 1], [0, 1], [0, 1])],
  });
  const report = readMetadata(jpegWith(block));
  assert.equal(report.gps, null);
  assert.match(report.warnings.join('\n'), /reference is missing/);
});

test('out-of-range coordinates are rejected rather than plotted', () => {
  const block = tiff('II', [ascii(0x010f, 'x')], {
    gps: [ascii(0x0001, 'N'), rational(0x0002, [500, 1], [0, 1], [0, 1]), ascii(0x0003, 'E'), rational(0x0004, [1, 1], [0, 1], [0, 1])],
  });
  const report = readMetadata(jpegWith(block));
  assert.equal(report.gps, null);
  assert.match(report.warnings.join('\n'), /out of range/);
});

test('XMP, Photoshop, ICC and comment segments are told apart', () => {
  const file = jpegWith(FULL, [
    segment(0xe1, concat(text('http://ns.adobe.com/xap/1.0/\0'), text('<x:xmpmeta/>'))),
    segment(0xed, concat(text('Photoshop 3.0\0'), text('8BIM'))),
    segment(0xe2, concat(text('ICC_PROFILE\0'), new Uint8Array(8))),
    segment(0xee, concat(text('Adobe'), new Uint8Array(6))),
    segment(0xfe, text('scanner note')),
    segment(0xe5, concat(text('WEIRD\0'), new Uint8Array(4))),
  ]);
  const report = readMetadata(file);
  assert.deepEqual(report.blocks.map((b) => b.kind), [
    'app', 'exif', 'xmp', 'photoshop', 'icc', 'app', 'comment', 'app',
  ]);
  const icc = report.blocks.find((b) => b.kind === 'icc')!;
  assert.equal(icc.identifying, false);
  assert.equal(icc.affectsRendering, true);
  assert.equal(report.blocks.find((b) => b.label.startsWith('APP5'))!.label, 'APP5 WEIRD');
  assert.equal(report.blocks.find((b) => b.kind === 'comment')!.identifying, true);
});

test('PNG eXIf and text chunks are read', () => {
  const file = concat(
    PNG_HEAD,
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('eXIf', FULL),
    pngChunk('tEXt', concat(text('Author\0'), text('binbin'))),
    pngChunk('iTXt', concat(text('Comment\0'), new Uint8Array([0, 0]), text('en\0'), text('\0'), utf8('拍攝於台北'))),
    pngChunk('zTXt', concat(text('Deflated\0'), new Uint8Array([0]), new Uint8Array([0x78, 0x9c]))),
    pngChunk('tIME', new Uint8Array(7)),
    pngChunk('iCCP', concat(text('sRGB\0'), new Uint8Array([0, 0x78, 0x9c]))),
    pngChunk('IEND', new Uint8Array(0))
  );
  const report = readMetadata(file);
  assert.equal(report.container, 'png');
  assert.equal(report.removable, true);
  assert.deepEqual(report.blocks.map((b) => b.label), ['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME', 'iCCP colour profile']);
  assert.equal(report.summary.model, 'X-T5');
  assert.equal(report.gps?.decimal, '25.033667, 121.564972');
  assert.equal(report.fields.find((f) => f.name === 'tEXt:Author')!.value, 'binbin');
  assert.equal(report.fields.find((f) => f.name === 'iTXt:Comment')!.value, '拍攝於台北');
  assert.match(report.warnings.join('\n'), /zTXt/);
});

test('a bare TIFF is read but declared not rewritable', () => {
  const report = readMetadata(FULL);
  assert.equal(report.container, 'tiff');
  assert.equal(report.removable, false);
  assert.equal(report.summary.make, 'FUJIFILM');
  assert.match(report.warnings.join('\n'), /read-only/);
  assert.throws(() => stripMetadata(FULL, report, []), /tiff cannot be rewritten/);
});

test('an unrecognised container is said to be unrecognised', () => {
  const report = readMetadata(concat(text('RIFF'), new Uint8Array(4), text('WEBPVP8 ')));
  assert.equal(report.container, 'unknown');
  assert.equal(report.fields.length, 0);
  assert.match(report.warnings.join('\n'), /HEIC, WebP and AVIF are not handled/);
});

test('a truncated JPEG is reported and not offered for rewriting', () => {
  const file = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0]);
  const report = readMetadata(file);
  assert.equal(report.container, 'jpeg');
  assert.equal(report.removable, false);
  assert.match(report.warnings.join('\n'), /past the end/);
});

/* ── removal ─────────────────────────────────────────────────────────── */

test('removing the Exif segment rewrites the file and leaves the image bytes alone', () => {
  const file = jpegWith(FULL, [segment(0xfe, text('a comment'))]);
  const report = readMetadata(file);
  const exifBlock = report.blocks.find((b) => b.kind === 'exif')!;
  const comment = report.blocks.find((b) => b.kind === 'comment')!;

  const result = stripMetadata(file, report, [exifBlock.id, comment.id]);
  assert.equal(result.removedBytes, exifBlock.bytes + comment.bytes);
  assert.equal(result.data.length, file.length - result.removedBytes);
  assert.deepEqual(result.removed.map((b) => b.kind).sort(), ['comment', 'exif']);

  // The scan survives byte for byte, and it still starts with SOI.
  assert.deepEqual(result.data.subarray(result.data.length - SCAN.length), SCAN);
  assert.equal(result.data[0], 0xff);
  assert.equal(result.data[1], 0xd8);

  // Re-reading the output finds no Exif at all.
  const after = readMetadata(result.data);
  assert.equal(after.fields.length, 0);
  assert.equal(after.gps, null);
  assert.deepEqual(after.blocks.map((b) => b.label), ['APP0 JFIF']);
  assert.deepEqual(after.summary, {});
  // No trace of the camera name is left anywhere in the bytes.
  assert.equal(Buffer.from(result.data).includes('FUJIFILM'), false);
  assert.equal(Buffer.from(file).includes('FUJIFILM'), true);
});

test('blocks not selected are kept, so a colour profile can be preserved', () => {
  const iccPayload = concat(text('ICC_PROFILE\0'), new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  const file = jpegWith(FULL, [segment(0xe2, iccPayload)]);
  const report = readMetadata(file);
  const exifBlock = report.blocks.find((b) => b.kind === 'exif')!;
  const result = stripMetadata(file, report, [exifBlock.id]);
  const after = readMetadata(result.data);
  assert.deepEqual(after.blocks.map((b) => b.kind), ['app', 'icc']);
  assert.equal(Buffer.from(result.data).includes('ICC_PROFILE'), true);
});

test('removing nothing returns a copy, not the same array', () => {
  const file = jpegWith(FULL);
  const report = readMetadata(file);
  const result = stripMetadata(file, report, []);
  assert.equal(result.removedBytes, 0);
  assert.deepEqual(result.data, file);
  assert.notEqual(result.data, file);
  // Ids that are not in this report are ignored rather than shifting bytes.
  const other = stripMetadata(file, report, ['jpeg:999999']);
  assert.deepEqual(other.data, file);
});

test('PNG chunks are deleted with their length and CRC, keeping the rest valid', () => {
  const file = concat(
    PNG_HEAD,
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('eXIf', FULL),
    pngChunk('tEXt', concat(text('Author\0'), text('binbin'))),
    pngChunk('IDAT', new Uint8Array([9, 9, 9])),
    pngChunk('IEND', new Uint8Array(0))
  );
  const report = readMetadata(file);
  const result = stripMetadata(file, report, report.blocks.map((b) => b.id));
  const after = readMetadata(result.data);
  assert.deepEqual(after.blocks, []);
  assert.deepEqual(after.fields, []);
  assert.deepEqual(scanPngChunks(result.data).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  assert.equal(Buffer.from(result.data).includes('binbin'), false);
  // The IDAT chunk kept its bytes, CRC included.
  const idat = scanPngChunks(result.data).find((c) => c.type === 'IDAT')!;
  assert.deepEqual(result.data.subarray(idat.dataOffset, idat.dataOffset + 3), new Uint8Array([9, 9, 9]));
});

test('the output name marks the file as the cleaned one', () => {
  assert.equal(cleanName('photo.jpg'), 'photo.clean.jpg');
  assert.equal(cleanName('a.b.png'), 'a.b.clean.png');
  assert.equal(cleanName('noextension'), 'noextension.clean');
  assert.equal(cleanName('.hidden'), '.hidden.clean');
  assert.equal(cleanName(''), '.clean');
});
