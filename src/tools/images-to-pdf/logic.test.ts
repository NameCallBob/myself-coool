import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import {
  MAX_PAGE_PT,
  PAPERS,
  PT_PER_IN,
  PT_PER_MM,
  adler32,
  buildPdf,
  inToPt,
  jpegEmbedVerdict,
  mmToPt,
  paperById,
  parseJpeg,
  pdfNumber,
  pdfTextString,
  planPage,
  rgbaToRgb,
  zlibStore,
  type PagePlanInput,
  type PdfPageSpec,
} from './logic.ts';

const latin1 = (data: Uint8Array) => Buffer.from(data).toString('latin1');
const near = (actual: number, expected: number, tolerance = 1e-4) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );

/* ── units and paper ──────────────────────── */

test('point conversions match the definitions', () => {
  assert.equal(PT_PER_IN, 72);
  near(PT_PER_MM, 2.834645669);
  near(mmToPt(210), 595.2756);
  near(mmToPt(297), 841.8898);
  assert.equal(inToPt(8.5), 612);
  assert.equal(inToPt(11), 792);
  assert.equal(mmToPt(0), 0);
});

test('paperById finds the listed sizes and nothing else', () => {
  assert.deepEqual(paperById('a4'), { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 });
  // Letter and Legal are exact in inches: 8.5 x 11 and 8.5 x 14.
  near(mmToPt(paperById('letter')!.widthMm), 612);
  near(mmToPt(paperById('letter')!.heightMm), 792);
  near(mmToPt(paperById('legal')!.heightMm), 1008);
  assert.equal(paperById('tabloid'), null);
  assert.equal(
    PAPERS.every((paper) => paper.widthMm < paper.heightMm),
    true,
    'the table is stored portrait'
  );
});

/* ── page planning ────────────────────────── */

const plan = (over: Partial<PagePlanInput>): PagePlanInput => ({
  image: { width: 1000, height: 1000 },
  paper: { width: mmToPt(210), height: mmToPt(297) },
  marginPt: 0,
  orientation: 'portrait',
  dpi: 96,
  upscale: true,
  ...over,
});

test('planPage fits a square image to the width of A4 portrait', () => {
  const result = planPage(plan({}));
  near(result.page.width, 595.2756);
  near(result.page.height, 841.8898);
  // 1000 px at 96 dpi is 750 pt; the width is the binding constraint.
  near(result.rect.width, 595.2756);
  near(result.rect.height, 595.2756);
  near(result.rect.x, 0);
  near(result.rect.y, (841.8898 - 595.2756) / 2);
  near(result.scale, 595.2756 / 750);
  near(result.effectiveDpi, (1000 / 595.2756) * 72);
});

test('planPage auto orientation follows the image', () => {
  const wide = planPage(plan({ image: { width: 1600, height: 900 }, orientation: 'auto' }));
  assert.ok(wide.page.width > wide.page.height);
  const tall = planPage(plan({ image: { width: 900, height: 1600 }, orientation: 'auto' }));
  assert.ok(tall.page.height > tall.page.width);
  const square = planPage(plan({ image: { width: 800, height: 800 }, orientation: 'auto' }));
  assert.ok(square.page.height > square.page.width, 'a square image gets portrait');
});

test('planPage forced orientation ignores the image and swaps the page', () => {
  const forced = planPage(plan({ image: { width: 1600, height: 900 }, orientation: 'portrait' }));
  near(forced.page.width, 595.2756);
  const other = planPage(plan({ image: { width: 900, height: 1600 }, orientation: 'landscape' }));
  near(other.page.width, 841.8898);
  near(other.page.height, 595.2756);
});

test('planPage centres inside the margins and shrinks the content box', () => {
  const margin = mmToPt(20);
  const result = planPage(plan({ marginPt: margin }));
  const box = 595.2756 - margin * 2;
  near(result.rect.width, box);
  near(result.rect.x, margin);
  near(result.rect.y, (841.8898 - box) / 2);
  assert.ok(result.rect.y > margin);
});

test('planPage upscale=false leaves a small image at its natural size', () => {
  const small = { width: 200, height: 100 };
  const fixedSize = planPage(plan({ image: small, upscale: false }));
  near(fixedSize.rect.width, (200 / 96) * 72);
  near(fixedSize.rect.height, (100 / 96) * 72);
  near(fixedSize.scale, 1);
  near(fixedSize.effectiveDpi, 96);
  const stretched = planPage(plan({ image: small, upscale: true }));
  assert.ok(stretched.scale > 1);
  assert.ok(stretched.effectiveDpi < 96, 'enlarging drops the effective resolution');
});

test('planPage original size makes the page the image plus margins', () => {
  const result = planPage(
    plan({ paper: 'original', image: { width: 1200, height: 600 }, dpi: 300, marginPt: 10 })
  );
  near(result.page.width, (1200 / 300) * 72 + 20);
  near(result.page.height, (600 / 300) * 72 + 20);
  near(result.rect.x, 10);
  near(result.rect.y, 10);
  near(result.rect.width, 288);
  near(result.rect.height, 144);
  assert.equal(result.scale, 1);
  near(result.effectiveDpi, 300);
});

test('planPage refuses geometry it cannot honour', () => {
  assert.throws(() => planPage(plan({ image: { width: 0, height: 10 } })), /zero dimension/);
  assert.throws(() => planPage(plan({ dpi: 0 })), /dpi must be positive/);
  assert.throws(() => planPage(plan({ marginPt: -1 })), /margin must be/);
  assert.throws(() => planPage(plan({ marginPt: 400 })), /no room/);
  assert.throws(() => planPage(plan({ paper: { width: 0, height: 100 } })), /zero dimension/);
  // 20000 px at 72 dpi is 20000 pt, past the format's own ceiling.
  assert.throws(
    () => planPage(plan({ paper: 'original', image: { width: 20000, height: 100 }, dpi: 72 })),
    new RegExp(String(MAX_PAGE_PT))
  );
});

/* ── JPEG inspection ──────────────────────── */

/** Assemble a JPEG marker stream: SOI, an APP0 to skip, then the frame header. */
function jpeg({
  sof = 0xc0,
  width = 64,
  height = 32,
  components = 3,
  bits = 8,
  fillBytes = false,
}: {
  sof?: number;
  width?: number;
  height?: number;
  components?: number;
  bits?: number;
  fillBytes?: boolean;
} = {}): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  // APP0/JFIF: 16 bytes of payload that must be walked past, not parsed.
  out.push(0xff, 0xe0, 0x00, 0x10);
  for (let i = 0; i < 14; i += 1) out.push(0x00);
  if (fillBytes) out.push(0xff);
  const payload = 8 + components * 3;
  out.push(0xff, sof, (payload >> 8) & 0xff, payload & 0xff);
  out.push(bits, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, components);
  for (let i = 0; i < components; i += 1) out.push(i + 1, 0x11, 0x00);
  out.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00);
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

test('parseJpeg reads the frame header past other segments', () => {
  assert.deepEqual(parseJpeg(jpeg({ width: 1920, height: 1080 })), {
    width: 1920,
    height: 1080,
    components: 3,
    bits: 8,
    mode: 'baseline',
    marker: 0xc0,
  });
});

test('parseJpeg tolerates 0xff fill bytes before a marker', () => {
  assert.equal(parseJpeg(jpeg({ fillBytes: true })).width, 64);
});

test('parseJpeg names each frame type', () => {
  assert.equal(parseJpeg(jpeg({ sof: 0xc1 })).mode, 'extended');
  assert.equal(parseJpeg(jpeg({ sof: 0xc2 })).mode, 'progressive');
  assert.equal(parseJpeg(jpeg({ sof: 0xc3 })).mode, 'lossless');
  assert.equal(parseJpeg(jpeg({ sof: 0xca })).mode, 'other');
  assert.equal(parseJpeg(jpeg({ components: 1 })).components, 1);
  assert.equal(parseJpeg(jpeg({ components: 4 })).components, 4);
  assert.equal(parseJpeg(jpeg({ bits: 12 })).bits, 12);
});

test('parseJpeg rejects what is not a readable JPEG', () => {
  assert.throws(() => parseJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), /not a JPEG/);
  assert.throws(() => parseJpeg(new Uint8Array([0xff, 0xd8])), /not a JPEG/);
  // SOI then SOS with no frame header at all.
  assert.throws(
    () => parseJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])),
    /scan starts before/
  );
  assert.throws(() => parseJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), /before any frame/);
  const truncated = jpeg().subarray(0, 8);
  assert.throws(() => parseJpeg(truncated), /truncated|past the end/);
  const badLength = jpeg();
  badLength[2 + 2] = 0x00;
  badLength[2 + 3] = 0x00; // APP0 length of 0
  assert.throws(() => parseJpeg(badLength), /impossible length/);
  const zeroSize = jpeg({ width: 0 });
  assert.throws(() => parseJpeg(zeroSize), /zero dimension/);
  const notAMarker = jpeg();
  notAMarker[2] = 0x00;
  assert.throws(() => parseJpeg(notAMarker), /expected a marker/);
});

test('jpegEmbedVerdict passes only what DCTDecode actually covers', () => {
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg())), { ok: true, colorSpace: 'DeviceRGB' });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ components: 1 }))), {
    ok: true,
    colorSpace: 'DeviceGray',
  });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ sof: 0xc1 }))), {
    ok: true,
    colorSpace: 'DeviceRGB',
  });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ sof: 0xc2 }))), {
    ok: false,
    reason: 'progressive',
  });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ sof: 0xc3 }))), { ok: false, reason: 'mode' });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ bits: 12 }))), { ok: false, reason: 'bits' });
  assert.deepEqual(jpegEmbedVerdict(parseJpeg(jpeg({ components: 4 }))), {
    ok: false,
    reason: 'components',
  });
});

/* ── zlib ─────────────────────────────────── */

test('adler32 matches published values', () => {
  assert.equal(adler32(new Uint8Array(0)), 1);
  assert.equal(adler32(Uint8Array.from([0x61])), 0x00620062); // "a"
  assert.equal(adler32(Buffer.from('Wikipedia')), 0x11e60398);
  assert.equal(adler32(Buffer.from('abc')), 0x024d0127);
  // Long enough to exercise the deferred modulo.
  assert.equal(adler32(new Uint8Array(70000).fill(0xff)), adler32Slow(new Uint8Array(70000).fill(0xff)));
});

function adler32Slow(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

test('zlibStore produces a stream a real inflater accepts', () => {
  const cases = [
    new Uint8Array(0),
    Uint8Array.from([0]),
    new Uint8Array(Buffer.from('中文與 emoji 🙂 都只是位元組')),
    new Uint8Array(65535).fill(0x41),
    new Uint8Array(65536).fill(0x42),
    new Uint8Array(200000).map((_, i) => i & 0xff),
  ];
  for (const input of cases) {
    const stream = zlibStore(input);
    assert.equal(stream[0], 0x78, 'zlib CMF');
    assert.equal(((stream[0] << 8) | stream[1]) % 31, 0, 'zlib header checksum');
    assert.deepEqual(new Uint8Array(inflateSync(Buffer.from(stream))), input);
  }
});

test('zlibStore block framing costs five bytes per 64 KiB block', () => {
  assert.equal(zlibStore(new Uint8Array(0)).length, 2 + 5 + 0 + 4);
  assert.equal(zlibStore(new Uint8Array(10)).length, 2 + 5 + 10 + 4);
  assert.equal(zlibStore(new Uint8Array(65536)).length, 2 + 10 + 65536 + 4);
  const stream = zlibStore(new Uint8Array(10));
  assert.equal(stream[2], 1, 'BFINAL set, BTYPE stored');
  assert.equal(stream[3] | (stream[4] << 8), 10, 'LEN');
  assert.equal(stream[5] | (stream[6] << 8), 0xffff - 10, 'NLEN is the complement of LEN');
});

/* ── alpha flattening ─────────────────────── */

test('rgbaToRgb passes opaque pixels through untouched', () => {
  const rgba = Uint8Array.from([1, 2, 3, 255, 250, 251, 252, 255]);
  assert.deepEqual(rgbaToRgb(rgba, [255, 255, 255]), Uint8Array.from([1, 2, 3, 250, 251, 252]));
});

test('rgbaToRgb composites transparency over the background', () => {
  const clear = Uint8Array.from([255, 0, 0, 0]);
  assert.deepEqual(rgbaToRgb(clear, [255, 255, 255]), Uint8Array.from([255, 255, 255]));
  assert.deepEqual(rgbaToRgb(clear, [0, 0, 0]), Uint8Array.from([0, 0, 0]));
  // Alpha 128 is 128/255 = 0.50196, so white shows through at 0.49804:
  // 255 * 0.49804 = 127.0 — not 128. Half-transparent black is 127, and the
  // rounding is checked rather than assumed.
  assert.deepEqual(
    rgbaToRgb(Uint8Array.from([0, 0, 0, 128]), [255, 255, 255]),
    Uint8Array.from([127, 127, 127])
  );
  assert.deepEqual(
    rgbaToRgb(Uint8Array.from([0, 0, 0, 127]), [255, 255, 255]),
    Uint8Array.from([128, 128, 128])
  );
  // A colour composited over itself is unchanged whatever the alpha.
  assert.deepEqual(
    rgbaToRgb(Uint8Array.from([10, 20, 30, 40]), [10, 20, 30]),
    Uint8Array.from([10, 20, 30])
  );
  assert.deepEqual(rgbaToRgb(new Uint8Array(0), [0, 0, 0]), new Uint8Array(0));
});

test('rgbaToRgb rejects data that is not four bytes per pixel', () => {
  assert.throws(() => rgbaToRgb(new Uint8Array(7), [0, 0, 0]), /multiple of 4/);
});

/* ── PDF syntax helpers ───────────────────── */

test('pdfNumber writes plain decimals with no exponent', () => {
  assert.equal(pdfNumber(0), '0');
  assert.equal(pdfNumber(10), '10');
  assert.equal(pdfNumber(100), '100');
  assert.equal(pdfNumber(1000), '1000');
  assert.equal(pdfNumber(612), '612');
  assert.equal(pdfNumber(0.5), '0.5');
  assert.equal(pdfNumber(595.2755905511812), '595.2756');
  assert.equal(pdfNumber(-16.666666), '-16.6667');
  assert.equal(pdfNumber(1e-7), '0', 'nothing may come out in exponent form');
  assert.equal(pdfNumber(-0), '0');
  assert.equal(pdfNumber(-1e-9), '0');
  assert.throws(() => pdfNumber(Number.NaN), /cannot write/);
  assert.throws(() => pdfNumber(Number.POSITIVE_INFINITY), /cannot write/);
});

test('pdfTextString escapes literals and goes UTF-16 for anything else', () => {
  assert.equal(pdfTextString('scan 2024'), '(scan 2024)');
  assert.equal(pdfTextString('a(b)c\\d'), '(a\\(b\\)c\\\\d)');
  assert.equal(pdfTextString(''), '()');
  assert.equal(pdfTextString('中'), '<FEFF4E2D>');
  assert.equal(pdfTextString('a中'), '<FEFF00614E2D>');
  // Astral plane: a surrogate pair is two UTF-16 units.
  assert.equal(pdfTextString('🙂'), '<FEFFD83DDE42>');
  assert.equal(pdfTextString('line\nbreak').startsWith('<FEFF'), true);
});

/* ── the file itself ──────────────────────── */

const jpegBytes = jpeg({ width: 64, height: 32 });

function page(over: Partial<PdfPageSpec> = {}): PdfPageSpec {
  return {
    width: 595.2756,
    height: 841.8898,
    image: {
      data: jpegBytes,
      width: 64,
      height: 32,
      filter: 'DCTDecode',
      colorSpace: 'DeviceRGB',
    },
    rect: { x: 20, y: 30, width: 400, height: 200 },
    ...over,
  };
}

/** Re-read the cross-reference table the way a viewer does. */
function readXref(pdf: Uint8Array) {
  const text = latin1(pdf);
  const marker = text.lastIndexOf('startxref\n');
  assert.notEqual(marker, -1, 'no startxref');
  const startxref = Number(text.slice(marker + 'startxref\n'.length).split('\n')[0]);
  assert.equal(text.startsWith('xref\n', startxref), true, 'startxref does not point at the table');
  const header = text.slice(startxref + 5, text.indexOf('\n', startxref + 5));
  const [first, size] = header.split(' ').map(Number);
  assert.equal(first, 0);
  const tableAt = startxref + 5 + header.length + 1;
  const entries: { offset: number; type: string }[] = [];
  for (let i = 0; i < size; i += 1) {
    const raw = text.slice(tableAt + i * 20, tableAt + (i + 1) * 20);
    assert.equal(raw.length, 20, `entry ${i} is not 20 bytes`);
    assert.match(raw, /^\d{10} \d{5} [nf] \n$/, `entry ${i} is malformed: ${JSON.stringify(raw)}`);
    entries.push({ offset: Number(raw.slice(0, 10)), type: raw[17] });
  }
  return { startxref, size, entries, text };
}

test('buildPdf writes a header, a trailer and nothing after %%EOF', () => {
  const pdf = buildPdf([page()]);
  const text = latin1(pdf);
  assert.equal(text.startsWith('%PDF-1.4\n'), true);
  // The binary comment that marks the file as not-text.
  assert.deepEqual(pdf.subarray(9, 15), Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  assert.equal(text.endsWith('%%EOF\n'), true);
  assert.equal(text.includes('/Root 1 0 R'), true);
});

test('buildPdf xref offsets point at the objects they claim', () => {
  for (const count of [1, 2, 5]) {
    const pdf = buildPdf(Array.from({ length: count }, () => page()));
    const { size, entries, text } = readXref(pdf);
    // 1 catalog + 1 page tree + 3 per page + 1 info, plus the free entry.
    assert.equal(size, 3 + count * 3 + 1, `object count for ${count} page(s)`);
    assert.equal(entries[0].type, 'f');
    assert.equal(entries[0].offset, 0);
    for (let number = 1; number < size; number += 1) {
      const entry = entries[number];
      assert.equal(entry.type, 'n');
      assert.equal(
        text.startsWith(`${number} 0 obj\n`, entry.offset),
        true,
        `entry ${number} offset ${entry.offset} does not begin object ${number}`
      );
      if (number > 1) {
        assert.ok(entry.offset > entries[number - 1].offset, 'offsets increase with object number');
      }
    }
    assert.equal(text.includes(`/Size ${size} `), true, 'trailer /Size counts the free entry');
    assert.equal(text.includes(`/Info ${size - 1} 0 R`), true);
  }
});

test('buildPdf declares a /Length that matches every stream', () => {
  const pdf = buildPdf([page(), page()]);
  const text = latin1(pdf);
  let searched = 0;
  let streams = 0;
  for (;;) {
    const at = text.indexOf('/Length ', searched);
    if (at === -1) break;
    const declared = Number(text.slice(at + 8, text.indexOf(' ', at + 8)));
    const streamAt = text.indexOf('stream\n', at) + 'stream\n'.length;
    const endAt = text.indexOf('\nendstream', streamAt);
    assert.equal(endAt - streamAt, declared, `stream at ${streamAt} does not match /Length`);
    streams += 1;
    searched = endAt;
  }
  assert.equal(streams, 4, 'two content streams and two images');
});

test('buildPdf embeds the JPEG bytes verbatim under DCTDecode', () => {
  const pdf = buildPdf([page()]);
  const text = latin1(pdf);
  assert.equal(text.includes('/Filter /DCTDecode'), true);
  assert.equal(text.includes('/Width 64 /Height 32'), true);
  assert.equal(text.includes('/ColorSpace /DeviceRGB /BitsPerComponent 8'), true);
  const at = text.indexOf(latin1(jpegBytes));
  assert.notEqual(at, -1, 'the scan is not in the file byte for byte');
  assert.deepEqual(pdf.subarray(at, at + jpegBytes.length), jpegBytes);
});

test('buildPdf writes the page box and the placement matrix', () => {
  const pdf = buildPdf([
    page({ width: 612, height: 792, rect: { x: 36, y: 100.5, width: 540, height: 270 } }),
  ]);
  const text = latin1(pdf);
  assert.equal(text.includes('/MediaBox [0 0 612 792]'), true);
  // w 0 0 h x y cm maps the image's unit square onto the rectangle.
  assert.equal(text.includes('q\n540 0 0 270 36 100.5 cm\n/Im0 Do\nQ\n'), true);
  assert.equal(text.includes('/XObject << /Im0 5 0 R >>'), true);
  assert.equal(text.includes('/Contents 4 0 R'), true);
});

test('buildPdf links every page into the page tree in order', () => {
  const pdf = buildPdf([page({ width: 100, height: 200 }), page({ width: 300, height: 400 }), page()]);
  const text = latin1(pdf);
  assert.equal(text.includes('/Type /Pages /Count 3 /Kids [3 0 R 6 0 R 9 0 R]'), true);
  assert.equal(text.includes('/MediaBox [0 0 100 200]'), true);
  assert.equal(text.includes('/MediaBox [0 0 300 400]'), true);
  for (const number of [3, 6, 9]) {
    assert.equal(text.includes(`${number} 0 obj\n<< /Type /Page /Parent 2 0 R`), true);
  }
});

test('buildPdf carries a FlateDecode page and metadata', () => {
  const raw = new Uint8Array(4 * 2 * 3).fill(0x7f);
  const pdf = buildPdf(
    [
      page({
        image: {
          data: zlibStore(raw),
          width: 4,
          height: 2,
          filter: 'FlateDecode',
          colorSpace: 'DeviceRGB',
        },
      }),
    ],
    { title: '掃描件 2024', producer: 'instrument bench', creationDate: 'D:20240131120000Z' }
  );
  const text = latin1(pdf);
  assert.equal(text.includes('/Filter /FlateDecode'), true);
  assert.equal(text.includes('/Producer (instrument bench)'), true);
  assert.equal(text.includes(`/Title ${pdfTextString('掃描件 2024')}`), true);
  assert.equal(text.includes('/CreationDate (D:20240131120000Z)'), true);
  // The image stream still inflates to the samples that went in.
  const streamAt = text.lastIndexOf('/Filter /FlateDecode');
  const from = text.indexOf('stream\n', streamAt) + 'stream\n'.length;
  const to = text.indexOf('\nendstream', from);
  assert.deepEqual(new Uint8Array(inflateSync(Buffer.from(pdf.subarray(from, to)))), raw);
  // No metadata is invented when none is given.
  assert.equal(latin1(buildPdf([page()])).includes('/CreationDate'), false);
  assert.equal(latin1(buildPdf([page()])).includes('/Producer (tools bench)'), true);
});

test('buildPdf refuses documents it cannot write correctly', () => {
  assert.throws(() => buildPdf([]), /at least one page/);
  assert.throws(() => buildPdf([page({ width: 0 })]), /zero dimension/);
  assert.throws(() => buildPdf([page({ height: MAX_PAGE_PT + 1 })]), /limit/);
  assert.throws(
    () => buildPdf([page({ image: { ...page().image, data: new Uint8Array(0) } })]),
    /stream is empty/
  );
  assert.throws(
    () => buildPdf([page({ image: { ...page().image, width: 0 } })]),
    /width must be a positive integer/
  );
  assert.throws(
    () => buildPdf([page({ image: { ...page().image, height: 1.5 } })]),
    /height must be a positive integer/
  );
  assert.throws(() => buildPdf([page({ rect: { x: 0, y: 0, width: 0, height: 10 } })]), /rectangle is empty/);
});

test('buildPdf output is byte-identical for identical input', () => {
  // No clock, no RNG anywhere in the writer: the same pages give the same file.
  assert.deepEqual(buildPdf([page(), page()]), buildPdf([page(), page()]));
});
