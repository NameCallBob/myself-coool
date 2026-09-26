import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALGOS,
  ALGO_LABEL,
  BLOCK_BYTES,
  COLLIDABLE,
  DIGEST_BYTES,
  MAX_LINES,
  algoOf,
  algosForHexLength,
  baseName,
  createDigest,
  digestBytes,
  digestStreamMulti,
  hex,
  manifestLine,
  namedAlgo,
  normalizeDigest,
  parseChecksumText,
  verifyFile,
  type ParsedSum,
} from './logic.ts';

const utf8 = (text: string) => new TextEncoder().encode(text);
const sum = (over: Partial<ParsedSum> = {}): ParsedSum => ({
  hex: hex(digestBytes('sha256', utf8('abc'))),
  algo: null,
  name: 'a.iso',
  line: 1,
  ...over,
});
const digestsOf = (text: string) => {
  const out: Record<string, Uint8Array> = {};
  for (const algo of ALGOS) out[algo] = digestBytes(algo, utf8(text));
  return out;
};

/* ── The engine (the copy in this folder) ──── */

test('the copied engine still produces the published vectors', () => {
  assert.equal(hex(digestBytes('md5', utf8(''))), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hex(digestBytes('sha1', utf8('abc'))), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(
    hex(digestBytes('sha256', utf8('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    hex(digestBytes('sha512', utf8('abc'))),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
  );
  assert.equal(
    hex(digestBytes('sha384', utf8('abc'))),
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
  );
});

test('the copied engine agrees with the platform around the padding boundaries', () => {
  for (const algo of ALGOS) {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129, 1000]) {
      const data = new Uint8Array(length).map((_, i) => (i * 29 + 7) % 256);
      assert.equal(
        hex(digestBytes(algo, data)),
        createHash(algo).update(Buffer.from(data)).digest('hex'),
        `${algo} at ${length} bytes`
      );
    }
    assert.equal(digestBytes(algo, utf8('x')).length, DIGEST_BYTES[algo]);
    assert.ok(BLOCK_BYTES[algo] === 64 || BLOCK_BYTES[algo] === 128);
    assert.ok(ALGO_LABEL[algo].length > 2);
  }
  assert.deepEqual(COLLIDABLE, ['md5', 'sha1']);
});

test('a file arriving in chunks hashes the same as in one piece', async () => {
  const data = new Uint8Array(3000).map((_, i) => i % 256);
  const one = hex(digestBytes('sha256', data));
  const d = createDigest('sha256');
  for (let i = 0; i < data.length; i += 97) d.update(data.subarray(i, i + 97));
  assert.equal(hex(d.digest()), one);

  const streamed = await digestStreamMulti(['sha256', 'md5'], [data.subarray(0, 1000), data.subarray(1000)]);
  assert.equal(hex(streamed.sha256), one);
  assert.equal(hex(streamed.md5), hex(digestBytes('md5', data)));
});

test('hex() and normalizeDigest() are inverses of the usual mangling', () => {
  assert.equal(hex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  assert.equal(hex(new Uint8Array()), '');
  assert.equal(normalizeDigest('SHA256: DE AD be ef'), 'deadbeef');
  assert.deepEqual(algosForHexLength(64), ['sha256']);
});

/* ── Manifest parsing ─────────────────────── */

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('GNU coreutils lines parse, binary marker and paths included', () => {
  const { sums, skipped } = parseChecksumText(
    `${SHA256_ABC}  ubuntu.iso\n${SHA256_ABC} *dir/sub/other.iso\n`
  );
  assert.equal(skipped.length, 0);
  assert.deepEqual(
    sums.map((entry) => [entry.name, entry.algo, entry.line]),
    [
      ['ubuntu.iso', null, 1],
      ['other.iso', null, 2],
    ]
  );
  assert.equal(sums[0].hex, SHA256_ABC);
});

test('BSD and openssl lines parse, including the algorithm name', () => {
  const { sums } = parseChecksumText(
    `SHA256 (ubuntu.iso) = ${SHA256_ABC}\nSHA2-256(x.bin)= ${SHA256_ABC.toUpperCase()}\nMD5 (y) = d41d8cd98f00b204e9800998ecf8427e`
  );
  assert.deepEqual(
    sums.map((entry) => [entry.algo, entry.name]),
    [
      ['sha256', 'ubuntu.iso'],
      ['sha256', 'x.bin'],
      ['md5', 'y'],
    ]
  );
  assert.equal(sums[1].hex, SHA256_ABC, 'upper case is normalised');
});

test('a bare digest parses, prefixed or spaced out as people paste it', () => {
  const { sums } = parseChecksumText(
    `  ${SHA256_ABC.toUpperCase()}  \nsha256:${SHA256_ABC}\n${SHA256_ABC.replace(/(.{8})/g, '$1 ').trim()}`
  );
  assert.equal(sums.length, 3);
  for (const entry of sums) {
    assert.equal(entry.hex, SHA256_ABC);
    assert.equal(entry.name, null);
  }
  assert.equal(sums[1].algo, 'sha256');
});

test('comments, blanks, prose and CRLF are handled without noise', () => {
  const { sums, skipped } = parseChecksumText(
    `# Ubuntu 24.04 checksums\r\n\r\n; another comment\r\n${SHA256_ABC}  a.iso\r\nnot a checksum at all\r\ndeadbeef  short.bin\r\n`
  );
  assert.equal(sums.length, 1);
  assert.equal(sums[0].name, 'a.iso');
  assert.deepEqual(
    skipped.map((entry) => entry.line),
    [5, 6]
  );
});

test('parsing stops at the line ceiling instead of grinding', () => {
  const text = `${SHA256_ABC}  f\n`.repeat(MAX_LINES + 500);
  assert.equal(parseChecksumText(text).sums.length, MAX_LINES);
});

test('baseName() takes the leaf of any path shape', () => {
  assert.equal(baseName('a.iso'), 'a.iso');
  assert.equal(baseName('dir/sub/a.iso'), 'a.iso');
  assert.equal(baseName('C:\\Users\\me\\a.iso'), 'a.iso');
  assert.equal(baseName('./a.iso'), 'a.iso');
  assert.equal(baseName('"quoted name.iso"'), 'quoted name.iso');
  assert.equal(baseName('  '), null);
  assert.equal(baseName('/'), null);
});

test('namedAlgo() accepts the spellings that appear in the wild', () => {
  assert.equal(namedAlgo('SHA-256'), 'sha256');
  assert.equal(namedAlgo('sha2-512'), 'sha512');
  assert.equal(namedAlgo('MD5'), 'md5');
  assert.equal(namedAlgo('sha1'), 'sha1');
  assert.equal(namedAlgo('SHA-384'), 'sha384');
  assert.equal(namedAlgo('crc32'), null);
  assert.equal(namedAlgo(null), null);
});

test('algoOf() trusts a named algorithm and otherwise uses the length', () => {
  assert.deepEqual(algoOf(sum({ algo: 'md5', hex: 'x'.repeat(4) })), ['md5']);
  assert.deepEqual(algoOf(sum()), ['sha256']);
  assert.deepEqual(algoOf(sum({ hex: 'ab' })), []);
});

/* ── Verdicts ─────────────────────────────── */

test('a matching digest is reported with the algorithm that matched', () => {
  const verdict = verifyFile('a.iso', digestsOf('abc'), [sum()]);
  assert.equal(verdict.kind, 'match');
  if (verdict.kind === 'match') assert.equal(verdict.algo, 'sha256');
});

test('a single wrong character is a mismatch, and the computed value is shown', () => {
  const broken = sum({ hex: SHA256_ABC.slice(0, -1) + (SHA256_ABC.endsWith('d') ? 'e' : 'd') });
  const verdict = verifyFile('a.iso', digestsOf('abc'), [broken]);
  assert.equal(verdict.kind, 'mismatch');
  if (verdict.kind === 'mismatch') assert.equal(verdict.computed, SHA256_ABC);
});

test('the line naming this file wins over the others in a manifest', () => {
  const sums = parseChecksumText(
    `${hex(digestBytes('sha256', utf8('other')))}  other.iso\n${SHA256_ABC}  a.iso\n`
  ).sums;
  const verdict = verifyFile('downloads/a.iso', digestsOf('abc'), sums);
  assert.equal(verdict.kind, 'match');
  if (verdict.kind === 'match') assert.equal(verdict.sum.line, 2);
});

test('a renamed download still matches by digest rather than by name', () => {
  const sums = parseChecksumText(
    `${hex(digestBytes('sha256', utf8('other')))}  other.iso\n${SHA256_ABC}  original-name.iso\n`
  ).sums;
  const verdict = verifyFile('a-copy(1).iso', digestsOf('abc'), sums);
  assert.equal(verdict.kind, 'match');
  if (verdict.kind === 'match') assert.equal(verdict.sum.name, 'original-name.iso');
});

test('a manifest that says nothing about this file is absent, not a mismatch', () => {
  const sums = parseChecksumText(
    `${hex(digestBytes('sha256', utf8('one')))}  one.iso\n${hex(digestBytes('sha256', utf8('two')))}  two.iso\n`
  ).sums;
  assert.equal(verifyFile('three.iso', digestsOf('abc'), sums).kind, 'absent');
  assert.equal(verifyFile('a.iso', digestsOf('abc'), []).kind, 'absent');
});

test('a digest length we cannot produce is reported as unsupported', () => {
  const crc = { hex: 'deadbeef'.repeat(7), algo: null, name: 'a.iso', line: 1 };
  assert.equal(verifyFile('a.iso', digestsOf('abc'), [crc]).kind, 'unsupported');
});

test('every algorithm in the manifest is honoured, not just SHA-256', () => {
  for (const algo of ALGOS) {
    const line = `${ALGO_LABEL[algo].replace('-', '')} (a.iso) = ${hex(digestBytes(algo, utf8('abc')))}`;
    const verdict = verifyFile('a.iso', digestsOf('abc'), parseChecksumText(line).sums);
    assert.equal(verdict.kind, 'match', algo);
    if (verdict.kind === 'match') assert.equal(verdict.algo, algo);
  }
});

test('manifestLine() writes what sha256sum -c reads back', () => {
  const line = manifestLine(SHA256_ABC, 'a.iso');
  assert.equal(line, `${SHA256_ABC}  a.iso`);
  const parsed = parseChecksumText(line).sums[0];
  assert.equal(parsed.hex, SHA256_ABC);
  assert.equal(parsed.name, 'a.iso');
});
