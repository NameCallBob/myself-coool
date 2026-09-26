import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLE_FILE_NAME,
  DEFAULT_ICO_SIZES,
  DEFAULT_PNG_SIZES,
  ICO_FILE_NAME,
  ICO_MAX_SIDE,
  KNOWN_SIZES,
  MANIFEST_FILE_NAME,
  buildIco,
  htmlSnippet,
  isPng,
  manifestJson,
  normalizeBase,
  parseIco,
  parseSizeList,
  planDraw,
  pngFileName,
  readPngSize,
} from './logic.ts';

/** Signature plus an IHDR whose width/height are written by hand. */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13, false); // IHDR chunk length
  out.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return out;
}

/** A payload that is recognisably a PNG and has a distinguishable length. */
function fakePng(width: number, height: number, extra: number): Uint8Array {
  const head = pngHeader(width, height);
  const out = new Uint8Array(head.length + extra);
  out.set(head, 0);
  out.fill(0xab, head.length);
  return out;
}

const readU16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8);
const readU32 = (d: Uint8Array, at: number) =>
  (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16)) + d[at + 3] * 0x1000000;

/* ── signature and IHDR ───────────────────── */

test('isPng checks all eight signature bytes', () => {
  assert.equal(isPng(pngHeader(16, 16)), true);
  const broken = pngHeader(16, 16);
  broken[3] = 0x00;
  assert.equal(isPng(broken), false);
  assert.equal(isPng(new Uint8Array([0x89, 0x50])), false);
  assert.equal(isPng(new Uint8Array(0)), false);
});

test('readPngSize reads IHDR of a real 1x1 PNG', () => {
  // The canonical 1x1 transparent PNG. Only its first 24 bytes matter here.
  const real = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    )
  );
  assert.equal(isPng(real), true);
  assert.deepEqual(readPngSize(real), { width: 1, height: 1 });
});

test('readPngSize handles non-square and large dimensions', () => {
  assert.deepEqual(readPngSize(pngHeader(1920, 1080)), { width: 1920, height: 1080 });
  assert.deepEqual(readPngSize(pngHeader(0xffff_ffff >>> 1, 3)), {
    width: 2147483647,
    height: 3,
  });
});

test('readPngSize rejects non-PNG, truncated and zero-sized input', () => {
  assert.throws(() => readPngSize(new Uint8Array([1, 2, 3])), /not a PNG/);
  assert.throws(() => readPngSize(pngHeader(16, 16).subarray(0, 20)), /truncated/);
  assert.throws(() => readPngSize(pngHeader(0, 16)), /zero dimension/);
  const notIhdr = pngHeader(16, 16);
  notIhdr.set([0x49, 0x44, 0x41, 0x54], 12); // "IDAT" first
  assert.throws(() => readPngSize(notIhdr), /expected IHDR/);
});

/* ── ICO container ────────────────────────── */

test('buildIco writes ICONDIR, entries and payload offsets', () => {
  const a = fakePng(16, 16, 10); // 34 bytes
  const b = fakePng(32, 32, 30); // 54 bytes
  const ico = buildIco([
    { width: 32, height: 32, png: b },
    { width: 16, height: 16, png: a },
  ]);

  // 6-byte ICONDIR + two 16-byte entries.
  const headerBytes = 6 + 16 * 2;
  assert.equal(ico.length, headerBytes + a.length + b.length);
  assert.equal(readU16(ico, 0), 0, 'reserved');
  assert.equal(readU16(ico, 2), 1, 'type = icon');
  assert.equal(readU16(ico, 4), 2, 'count');

  // Smallest first, regardless of the order handed in.
  assert.equal(ico[6], 16);
  assert.equal(ico[7], 16);
  assert.equal(ico[8], 0, 'palette colours');
  assert.equal(ico[9], 0, 'reserved');
  assert.equal(readU16(ico, 10), 1, 'planes');
  assert.equal(readU16(ico, 12), 32, 'bit count');
  assert.equal(readU32(ico, 14), a.length);
  assert.equal(readU32(ico, 18), headerBytes);

  assert.equal(ico[22], 32);
  assert.equal(readU32(ico, 30), b.length);
  assert.equal(readU32(ico, 34), headerBytes + a.length);

  // The offsets must land on the actual payloads, byte for byte.
  assert.deepEqual(ico.subarray(headerBytes, headerBytes + a.length), a);
  assert.deepEqual(ico.subarray(headerBytes + a.length), b);
});

test('buildIco stores 256 as the byte 0', () => {
  const ico = buildIco([{ width: 256, height: 256, png: fakePng(256, 256, 1) }]);
  assert.equal(ico[6], 0);
  assert.equal(ico[7], 0);
  assert.equal(parseIco(ico)[0].width, ICO_MAX_SIDE);
});

test('buildIco and parseIco round-trip a three-size set', () => {
  const members = [16, 32, 48].map((size) => ({
    width: size,
    height: size,
    png: fakePng(size, size, size),
  }));
  const entries = parseIco(buildIco(members));
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.width),
    [16, 32, 48]
  );
  assert.deepEqual(
    entries.map((entry) => entry.bytes),
    members.map((member) => member.png.length)
  );
  assert.equal(
    entries.every((entry) => entry.png && entry.bitCount === 32),
    true
  );
  // Offsets are contiguous from the end of the directory.
  let expected = 6 + 16 * 3;
  for (const entry of entries) {
    assert.equal(entry.offset, expected);
    expected += entry.bytes;
  }
});

test('buildIco refuses input it cannot represent', () => {
  assert.throws(() => buildIco([]), /at least one/);
  assert.throws(
    () => buildIco([{ width: 257, height: 257, png: fakePng(2, 2, 1) }]),
    /side must be/
  );
  assert.throws(() => buildIco([{ width: 0, height: 16, png: fakePng(2, 2, 1) }]), /side must be/);
  assert.throws(
    () => buildIco([{ width: 16.5, height: 16, png: fakePng(2, 2, 1) }]),
    /side must be/
  );
  assert.throws(
    () => buildIco([{ width: 16, height: 16, png: new Uint8Array(0) }]),
    /empty payload/
  );
  assert.throws(
    () =>
      buildIco([
        { width: 16, height: 16, png: fakePng(16, 16, 1) },
        { width: 16, height: 16, png: fakePng(16, 16, 2) },
      ]),
    /duplicate/
  );
});

test('parseIco rejects malformed containers', () => {
  assert.throws(() => parseIco(new Uint8Array(4)), /too short/);
  const cur = buildIco([{ width: 16, height: 16, png: fakePng(16, 16, 1) }]);
  cur[2] = 2; // idType 2 = cursor
  assert.throws(() => parseIco(cur), /\.cur/);
  const empty = new Uint8Array([0, 0, 1, 0, 0, 0]);
  assert.throws(() => parseIco(empty), /empty/);
  const short = new Uint8Array([0, 0, 1, 0, 2, 0, 0]);
  assert.throws(() => parseIco(short), /truncated/);
  const overrun = buildIco([{ width: 16, height: 16, png: fakePng(16, 16, 1) }]);
  overrun[6 + 8] = 0xff; // claim a payload far bigger than the file
  overrun[6 + 9] = 0xff;
  assert.throws(() => parseIco(overrun), /past the end/);
});

test('parseIco reports a DIB payload as not-PNG', () => {
  const dib = new Uint8Array(40).fill(0x11);
  const ico = buildIco([{ width: 16, height: 16, png: dib }]);
  assert.equal(parseIco(ico)[0].png, false);
});

/* ── squaring the source ──────────────────── */

test('planDraw leaves a square source alone', () => {
  assert.deepEqual(planDraw({ width: 512, height: 512 }, 32, 'contain'), {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
  });
  assert.deepEqual(planDraw({ width: 512, height: 512 }, 32, 'cover'), {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
  });
});

test('planDraw contain fits the long edge and centres the short one', () => {
  // 400x300 into 100: scale 0.25, so 100x75 with 12.5 px above and below.
  assert.deepEqual(planDraw({ width: 400, height: 300 }, 100, 'contain'), {
    x: 0,
    y: 12.5,
    width: 100,
    height: 75,
  });
});

test('planDraw cover fills the box and crops symmetrically', () => {
  // 400x300 into 100: scale 1/3, height 100, width 133.33 hanging off both sides.
  const draw = planDraw({ width: 400, height: 300 }, 100, 'cover');
  assert.equal(Math.round(draw.width * 100) / 100, 133.33);
  assert.equal(draw.height, 100);
  assert.equal(Math.round(draw.x * 100) / 100, -16.67);
  assert.equal(draw.y, 0);
});

test('planDraw padding insets every side by a fraction of the box', () => {
  assert.deepEqual(planDraw({ width: 10, height: 10 }, 100, 'contain', 0.1), {
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const wide = planDraw({ width: 200, height: 100 }, 100, 'contain', 0.25);
  assert.deepEqual(wide, { x: 25, y: 37.5, width: 50, height: 25 });
});

test('planDraw rejects impossible geometry', () => {
  assert.throws(() => planDraw({ width: 10, height: 10 }, 0, 'contain'), /positive/);
  assert.throws(() => planDraw({ width: 0, height: 10 }, 16, 'contain'), /zero dimension/);
  assert.throws(() => planDraw({ width: 10, height: 10 }, 16, 'contain', 0.5), /padding/);
  assert.throws(() => planDraw({ width: 10, height: 10 }, 16, 'contain', -0.1), /padding/);
  assert.throws(() => planDraw({ width: 10, height: 10 }, Number.NaN, 'contain'), /positive/);
});

/* ── size list, names, snippets ───────────── */

test('parseSizeList sorts, de-duplicates and accepts mixed separators', () => {
  assert.deepEqual(parseSizeList('16,32,48'), [16, 32, 48]);
  assert.deepEqual(parseSizeList(' 48 16\n32 16 '), [16, 32, 48]);
  assert.deepEqual(parseSizeList('180;192, 512'), [180, 192, 512]);
  assert.deepEqual(parseSizeList('1'), [1]);
});

test('parseSizeList rejects junk and out-of-range sizes', () => {
  assert.throws(() => parseSizeList(''), /no sizes/);
  assert.throws(() => parseSizeList('   '), /no sizes/);
  assert.throws(() => parseSizeList('16, abc'), /not a whole number/);
  assert.throws(() => parseSizeList('16.5'), /not a whole number/);
  assert.throws(() => parseSizeList('-16'), /not a whole number/);
  assert.throws(() => parseSizeList('0'), /outside/);
  assert.throws(() => parseSizeList('2048'), /outside/);
  assert.deepEqual(parseSizeList('300', 300), [300]);
});

test('normalizeBase always ends in exactly one slash', () => {
  assert.equal(normalizeBase(''), '/');
  assert.equal(normalizeBase('/'), '/');
  assert.equal(normalizeBase('  /assets  '), '/assets/');
  assert.equal(normalizeBase('/assets/'), '/assets/');
  assert.equal(normalizeBase('https://example.com/i'), 'https://example.com/i/');
});

test('pngFileName and the fixed names are stable', () => {
  assert.equal(pngFileName(16), 'icon-16x16.png');
  assert.equal(pngFileName(512), 'icon-512x512.png');
  assert.equal(ICO_FILE_NAME, 'favicon.ico');
  assert.equal(APPLE_FILE_NAME, 'apple-touch-icon.png');
  assert.equal(MANIFEST_FILE_NAME, 'manifest.webmanifest');
});

test('htmlSnippet emits one line per file and skips the apple size twice', () => {
  const html = htmlSnippet({
    base: '/',
    pngSizes: [16, 32, 180, 192, 512],
    icoSizes: [48, 16, 32],
    appleSize: 180,
    manifest: true,
  });
  assert.equal(
    html,
    [
      '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/icon-16x16.png">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png">',
      '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512x512.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/manifest.webmanifest">',
    ].join('\n')
  );
});

test('htmlSnippet honours the base path and the switches', () => {
  const html = htmlSnippet({
    base: '/static/icons',
    pngSizes: [32],
    icoSizes: [],
    appleSize: 0,
    manifest: false,
  });
  assert.equal(
    html,
    '<link rel="icon" type="image/png" sizes="32x32" href="/static/icons/icon-32x32.png">'
  );
});

test('manifestJson lists the icons in ascending order', () => {
  const text = manifestJson({
    base: '/',
    name: '儀器櫃',
    shortName: '儀器',
    sizes: [512, 192],
    themeColor: '#101010',
    backgroundColor: '#ffffff',
  });
  const parsed = JSON.parse(text);
  assert.equal(parsed.name, '儀器櫃');
  assert.equal(parsed.short_name, '儀器');
  assert.equal(parsed.display, 'standalone');
  assert.deepEqual(parsed.icons, [
    { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
  ]);
  assert.equal(parsed.theme_color, '#101010');
  assert.equal(text.endsWith('}\n'), true);
  // No purpose claim: a square icon is not a maskable icon.
  assert.equal(text.includes('maskable'), false);
});

test('the published defaults stay inside what ICO and manifests allow', () => {
  assert.deepEqual(DEFAULT_PNG_SIZES, [16, 32, 48, 180, 192, 512]);
  assert.deepEqual(DEFAULT_ICO_SIZES, [16, 32, 48]);
  assert.equal(
    DEFAULT_ICO_SIZES.every((size) => size <= ICO_MAX_SIDE),
    true
  );
  assert.equal(
    DEFAULT_ICO_SIZES.every((size) => DEFAULT_PNG_SIZES.includes(size)),
    true
  );
  assert.equal(
    KNOWN_SIZES.every((row) => row.size > 0 && row.use.zh !== '' && row.use.en !== ''),
    true
  );
  assert.deepEqual(
    KNOWN_SIZES.map((row) => row.size),
    [...KNOWN_SIZES.map((row) => row.size)].sort((a, b) => a - b)
  );
});
