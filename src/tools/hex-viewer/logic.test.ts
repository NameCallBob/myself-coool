import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAD_BYTES,
  MATCH_LIMIT,
  NeedleError,
  SIGNATURES,
  asciiChar,
  classifyEntropy,
  dumpLines,
  entropy,
  formatOffset,
  hexByte,
  histogram,
  identify,
  longestAsciiRun,
  parseNeedle,
  renderDump,
  search,
  stats,
} from './logic.ts';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

function head(prefix: number[], length = 64): Uint8Array {
  const out = new Uint8Array(length);
  out.set(prefix.slice(0, length));
  return out;
}

test('the known magic numbers are identified', () => {
  const cases: [number[], string][] = [
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG'],
    [[0xff, 0xd8, 0xff, 0xe0], 'JPEG'],
    [[...ascii('GIF89a')], 'GIF89a'],
    [[0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 'PDF'],
    [[0x50, 0x4b, 0x03, 0x04], 'ZIP container'],
    [[0x1f, 0x8b, 0x08], 'gzip'],
    [[0x7f, 0x45, 0x4c, 0x46], 'ELF'],
    [[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 'WebAssembly'],
    [[...ascii('SQLite format 3'), 0x00], 'SQLite 3 database'],
    [[0x1a, 0x45, 0xdf, 0xa3], 'Matroska / WebM'],
    [[...ascii('OggS')], 'Ogg'],
    [[...ascii('fLaC')], 'FLAC'],
    [[0xef, 0xbb, 0xbf, 0x61], 'UTF-8 BOM'],
  ];
  for (const [prefix, name] of cases) {
    const matches = identify(head(prefix));
    assert.ok(
      matches.some((match) => match.signature.name === name),
      `${name} not identified from ${prefix.map((b) => b.toString(16)).join(' ')}`
    );
  }
});

test('signatures that are not at offset zero still match', () => {
  // RIFF container: the form type sits at offset 8, not at the start.
  const riff = head([...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBP')]);
  assert.equal(identify(riff)[0].signature.name, 'WebP');

  const wav = head([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]);
  assert.ok(identify(wav).some((match) => match.signature.name === 'WAV'));

  // MP4's ftyp box name begins at offset 4, after the box length.
  const mp4 = head([0x00, 0x00, 0x00, 0x18, ...ascii('ftypmp42')]);
  assert.ok(identify(mp4).some((match) => match.signature.name === 'MP4 / MOV / 3GP'));

  // tar's only signature is 'ustar' at offset 257.
  const tar = new Uint8Array(512);
  tar.set(ascii('ustar'), 257);
  const tarMatch = identify(tar).find((match) => match.signature.name === 'tar');
  assert.equal(tarMatch?.offset, 257);
});

test('a signature deeper than the data is skipped, not failed', () => {
  // ISO 9660's signature is at 0x8001; a short head must not throw or match.
  assert.deepEqual(identify(bytes(0x00, 0x00)), []);
  assert.deepEqual(identify(new Uint8Array()), []);
  const iso = new Uint8Array(0x8010);
  iso.set(ascii('CD001'), 0x8001);
  assert.ok(identify(iso).some((match) => match.signature.name === 'ISO 9660 image'));
  assert.ok(HEAD_BYTES >= 0x8006, `HEAD_BYTES is ${HEAD_BYTES}`);
});

test('ambiguous signatures both come back, longest match first', () => {
  // CA FE BA BE is a Java class file and a Mach-O universal binary.
  const both = identify(head([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x02]));
  const java = both.find((match) => match.signature.name === 'Java class file');
  assert.ok(java);
  assert.match(java.signature.also ?? '', /Mach-O/);

  // A .docx is a ZIP, and the tool says so instead of claiming otherwise.
  const zip = identify(head([0x50, 0x4b, 0x03, 0x04]));
  assert.match(zip[0].signature.also ?? '', /docx/);

  // Matches are ordered by how many bytes they pin down.
  const png = identify(head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  for (let i = 1; i < png.length; i += 1) {
    assert.ok(png[i].length <= png[i - 1].length, `unsorted at ${i}`);
  }
});

test('every signature in the table is well formed', () => {
  assert.ok(SIGNATURES.length >= 50, `only ${SIGNATURES.length} signatures`);
  for (const signature of SIGNATURES) {
    assert.ok(signature.name.length > 0);
    assert.ok(signature.offset >= 0);
    assert.ok(signature.bytes.length >= 2, `${signature.name} is too short to be distinguishing`);
    for (const byte of signature.bytes) {
      assert.ok(byte === null || (byte >= 0 && byte <= 255), signature.name);
    }
  }
  // No two entries share a name, or the list would read as a duplicate.
  const names = SIGNATURES.map((signature) => signature.name);
  assert.equal(new Set(names).size, names.length);
});

test('hex and ascii formatting are the conventional ones', () => {
  assert.equal(hexByte(0), '00');
  assert.equal(hexByte(255), 'ff');
  assert.equal(hexByte(255, true), 'FF');
  assert.equal(hexByte(0x0a), '0a');
  assert.equal(formatOffset(0), '00000000');
  assert.equal(formatOffset(0x1234), '00001234');
  assert.equal(formatOffset(0xabcdef, true), '00ABCDEF');
  assert.equal(asciiChar(0x41), 'A');
  assert.equal(asciiChar(0x20), ' ');
  assert.equal(asciiChar(0x7e), '~');
  assert.equal(asciiChar(0x7f), '.');
  assert.equal(asciiChar(0x00), '.');
  assert.equal(asciiChar(0x0a), '.');
  // Latin-1 is deliberately not substituted in for the high half.
  assert.equal(asciiChar(0xe9), '.');
});

test('the dump is laid out sixteen bytes to a line with an absolute offset', () => {
  const data = new Uint8Array(20);
  for (let i = 0; i < data.length; i += 1) data[i] = i;
  const lines = dumpLines(data);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].offset, 0);
  assert.equal(lines[1].offset, 16);
  assert.equal(lines[0].hex.length, 16);
  assert.equal(lines[0].hex[0], '00');
  assert.equal(lines[0].hex[15], '0f');
  // The short last line pads its hex columns with empty strings, not '00'.
  assert.equal(lines[1].hex[4], '');
  assert.equal(lines[1].ascii.length, 4);
  assert.deepEqual(dumpLines(new Uint8Array()), []);
});

test('the dump honours the base offset and the column width', () => {
  const lines = dumpLines(ascii('abcdefgh'), 0x1000, 4);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].offset, 0x1000);
  assert.equal(lines[1].offset, 0x1004);
  assert.equal(lines[0].ascii, 'abcd');
  assert.equal(dumpLines(ascii('ab'), 0, 16, { upper: true })[0].hex[0], '61');
  assert.equal(dumpLines(bytes(0xff), 0, 16, { upper: true })[0].hex[0], 'FF');
});

test('the text form is the classic offset / hex / ascii layout', () => {
  const text = renderDump(dumpLines(ascii('Hello, hexdump!')));
  assert.equal(text, '00000000  48 65 6c 6c 6f 2c 20 68  65 78 64 75 6d 70 21     |Hello, hexdump!|');
  // A short line keeps its columns aligned with two spaces per missing byte.
  const short = renderDump(dumpLines(ascii('ab')));
  assert.ok(short.startsWith('00000000  61 62'));
  assert.ok(short.endsWith('|ab|'));
  assert.equal(renderDump([]), '');
});

test('the search box accepts hex in every spelling people use', () => {
  assert.deepEqual(parseNeedle('89504e47', 'hex'), bytes(0x89, 0x50, 0x4e, 0x47));
  assert.deepEqual(parseNeedle('89 50 4E 47', 'hex'), bytes(0x89, 0x50, 0x4e, 0x47));
  assert.deepEqual(parseNeedle('89:50-4e_47', 'hex'), bytes(0x89, 0x50, 0x4e, 0x47));
  assert.deepEqual(parseNeedle('0x89 0x50', 'hex'), bytes(0x89, 0x50));
  assert.deepEqual(parseNeedle('AB', 'text'), ascii('AB'));
  assert.deepEqual(parseNeedle('台', 'text'), bytes(0xe5, 0x8f, 0xb0));
});

test('a search needle that cannot be read is refused with a reason', () => {
  assert.throws(() => parseNeedle('', 'hex'), NeedleError);
  assert.throws(() => parseNeedle('', 'text'), NeedleError);
  assert.throws(() => parseNeedle('abc', 'hex'), (error: unknown) => {
    assert.ok(error instanceof NeedleError);
    assert.match(error.message, /even number/);
    return true;
  });
  assert.throws(() => parseNeedle('zz', 'hex'), NeedleError);
});

test('search finds every occurrence, including overlapping ones', () => {
  const data = ascii('abcabcabc');
  assert.deepEqual(search(data, ascii('abc')), [0, 3, 6]);
  assert.deepEqual(search(data, ascii('bca')), [1, 4]);
  assert.deepEqual(search(ascii('aaaa'), ascii('aa')), [0, 1, 2]);
  assert.deepEqual(search(data, ascii('xyz')), []);
  assert.deepEqual(search(data, new Uint8Array()), []);
  assert.deepEqual(search(new Uint8Array(), ascii('a')), []);
  // A needle longer than the data cannot match.
  assert.deepEqual(search(ascii('ab'), ascii('abc')), []);
  // The first and last positions are both reachable.
  assert.deepEqual(search(ascii('xay'), ascii('x')), [0]);
  assert.deepEqual(search(ascii('xay'), ascii('y')), [2]);
});

test('search reports absolute offsets and stops at its limit', () => {
  const data = ascii('aaaa');
  assert.deepEqual(search(data, ascii('a'), { base: 0x1000 }), [0x1000, 0x1001, 0x1002, 0x1003]);
  assert.equal(search(new Uint8Array(10_000), bytes(0)).length, MATCH_LIMIT);
  assert.equal(search(new Uint8Array(10_000), bytes(0), { limit: 3 }).length, 3);
});

test('entropy is the number that tells you what kind of file it is', () => {
  assert.equal(entropy(new Uint8Array()), 0);
  // One repeated byte carries no information at all.
  assert.equal(entropy(new Uint8Array(1000).fill(0x41)), 0);
  // Every byte value exactly once is the maximum, eight bits per byte.
  const uniform = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) uniform[i] = i;
  assert.ok(Math.abs(entropy(uniform) - 8) < 1e-9);
  // Two values used equally is exactly one bit.
  const half = new Uint8Array(100);
  for (let i = 0; i < 100; i += 1) half[i] = i % 2;
  assert.ok(Math.abs(entropy(half) - 1) < 1e-9);
  // English prose sits well below the maximum.
  const prose = ascii('the quick brown fox jumps over the lazy dog '.repeat(20));
  assert.ok(entropy(prose) > 3 && entropy(prose) < 5, `prose entropy ${entropy(prose)}`);
});

test('the entropy verdict names the four cases it can tell apart', () => {
  assert.equal(classifyEntropy(0), 'low');
  assert.equal(classifyEntropy(2.9), 'low');
  assert.equal(classifyEntropy(4.5), 'text');
  assert.equal(classifyEntropy(6.5), 'mixed');
  assert.equal(classifyEntropy(7.99), 'dense');
  assert.equal(classifyEntropy(8), 'dense');
});

test('the histogram counts every byte exactly once', () => {
  const counts = histogram(ascii('aab'));
  assert.equal(counts[0x61], 2);
  assert.equal(counts[0x62], 1);
  assert.equal(counts.length, 256);
  assert.equal(counts.reduce((n, c) => n + c, 0), 3);
  assert.equal(histogram(new Uint8Array()).reduce((n, c) => n + c, 0), 0);
});

test('the byte statistics separate text from binary', () => {
  const text = stats(ascii('plain ascii text'));
  assert.equal(text.bytes, 16);
  assert.equal(text.printable, 16);
  assert.equal(text.zero, 0);
  assert.equal(text.high, 0);

  const binary = stats(bytes(0x00, 0x00, 0xff, 0x80, 0x41));
  assert.equal(binary.zero, 2);
  assert.equal(binary.high, 2);
  assert.equal(binary.printable, 1);
  assert.equal(binary.verdict, classifyEntropy(binary.entropy));

  const empty = stats(new Uint8Array());
  assert.equal(empty.bytes, 0);
  assert.equal(empty.entropy, 0);
});

test('the longest printable run is the strings(1) idea in one number', () => {
  assert.equal(longestAsciiRun(ascii('hello')), 5);
  assert.equal(longestAsciiRun(bytes(0x00, 0x41, 0x42, 0x00, 0x43)), 2);
  assert.equal(longestAsciiRun(new Uint8Array(100)), 0);
  assert.equal(longestAsciiRun(new Uint8Array()), 0);
});
