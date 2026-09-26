import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALGOS,
  ALGO_LABEL,
  BLOCK_BYTES,
  COLLIDABLE,
  DIGEST_BYTES,
  algosForHexLength,
  createDigest,
  digestBytes,
  digestStreamMulti,
  normalizeDigest,
  type Algo,
} from './logic.ts';

const hex = (data: Uint8Array) => Buffer.from(data).toString('hex');
const utf8 = (text: string) => new TextEncoder().encode(text);
const of = (algo: Algo, text: string) => hex(digestBytes(algo, utf8(text)));

/* ── Published vectors ─────────────────────── */
/**
 * FIPS 180-4 / RFC 1321 figures, typed out so this file is still a real test
 * if the reference implementation below ever goes away.
 */
test('the published vectors for the empty string', () => {
  assert.equal(of('md5', ''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(of('sha1', ''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.equal(of('sha256', ''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(
    of('sha384', ''),
    '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b'
  );
  assert.equal(
    of('sha512', ''),
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
  );
});

test('the published vectors for "abc"', () => {
  assert.equal(of('md5', 'abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(of('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(of('sha256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    of('sha384', 'abc'),
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'
  );
  assert.equal(
    of('sha512', 'abc'),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
  );
});

test('the one-million-a vector, which exercises many blocks', () => {
  const million = new Uint8Array(1_000_000).fill(0x61);
  assert.equal(hex(digestBytes('sha1', million)), '34aa973cd4c4daa4f61eeb2bdbad27316534016f');
  assert.equal(
    hex(digestBytes('sha256', million)),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
  );
});

/* ── Against the platform ──────────────────── */
/**
 * The padding boundary is where hand-written hashes break: a message that
 * ends one byte before the length field has to spill into an extra block.
 * Every length around both block sizes gets compared with Node's OpenSSL.
 */
test('every algorithm agrees with the platform across the padding boundaries', () => {
  const lengths = new Set<number>([0, 1, 2, 3, 63, 64, 65, 127, 128, 129, 1023, 1024, 4097]);
  for (const algo of ALGOS) {
    const block = BLOCK_BYTES[algo];
    for (const base of [0, block, block * 2]) {
      for (let delta = -10; delta <= 10; delta += 1) {
        if (base + delta >= 0) lengths.add(base + delta);
      }
    }
  }
  for (const algo of ALGOS) {
    for (const length of lengths) {
      const data = new Uint8Array(length).map((_, i) => (i * 37 + 11) % 256);
      assert.equal(
        hex(digestBytes(algo, data)),
        createHash(algo === 'sha1' ? 'sha1' : algo).update(Buffer.from(data)).digest('hex'),
        `${algo} at ${length} bytes`
      );
    }
  }
});

test('UTF-8 input hashes its bytes, emoji and CJK included', () => {
  assert.equal(
    of('sha256', '中文 \u{1F9EA} test'),
    'f52c2fe2210114effd9149913096b6f73dca90fde5499a418d3a8571304d22fd'
  );
  // CRLF and LF are different bytes, so they must be different digests —
  // the usual reason two people get different checksums for "the same" text.
  assert.notEqual(of('sha256', 'a\r\nb'), of('sha256', 'a\nb'));
});

/* ── Incremental behaviour ─────────────────── */

test('chunking does not change the answer, whatever the chunk sizes', () => {
  const data = new Uint8Array(5000).map((_, i) => (i * 131) % 256);
  const expected = hex(digestBytes('sha512', data));
  for (const size of [1, 7, 64, 100, 127, 128, 999, 4096]) {
    const d = createDigest('sha512');
    for (let i = 0; i < data.length; i += size) d.update(data.subarray(i, i + size));
    assert.equal(hex(d.digest()), expected, `chunk size ${size}`);
  }
});

test('a digester refuses to be reused after it is finished', () => {
  const d = createDigest('sha256');
  d.update(utf8('abc'));
  d.digest();
  assert.throws(() => d.digest(), /already called/);
  assert.throws(() => d.update(utf8('more')), /already called/);
});

test('digestStreamMulti hashes several algorithms in one pass and reports progress', async () => {
  const chunks = [utf8('abc'), utf8('def'), utf8('')];
  const seen: number[] = [];
  const out = await digestStreamMulti(['sha256', 'md5'], chunks, (n) => seen.push(n));
  assert.equal(hex(out.sha256), of('sha256', 'abcdef'));
  assert.equal(hex(out.md5), of('md5', 'abcdef'));
  assert.deepEqual(seen, [3, 6, 6]);
});

test('digestStreamMulti accepts an async source', async () => {
  async function* source() {
    yield utf8('ab');
    yield utf8('c');
  }
  const out = await digestStreamMulti(['sha1'], source());
  assert.equal(hex(out.sha1), of('sha1', 'abc'));
});

/* ── Metadata ──────────────────────────────── */

test('digest lengths match what comes out, and labels exist', () => {
  for (const algo of ALGOS) {
    assert.equal(digestBytes(algo, utf8('x')).length, DIGEST_BYTES[algo], algo);
    assert.ok(ALGO_LABEL[algo].length > 2, algo);
  }
  assert.deepEqual(COLLIDABLE, ['md5', 'sha1']);
});

test('a hex length identifies the algorithm where it is unambiguous', () => {
  assert.deepEqual(algosForHexLength(64), ['sha256']);
  assert.deepEqual(algosForHexLength(32), ['md5']);
  assert.deepEqual(algosForHexLength(40), ['sha1']);
  assert.deepEqual(algosForHexLength(96), ['sha384']);
  assert.deepEqual(algosForHexLength(128), ['sha512']);
  assert.deepEqual(algosForHexLength(50), []);
});

test('pasted digests are normalised the way people paste them', () => {
  assert.equal(normalizeDigest('  DEADBEEF  '), 'deadbeef');
  assert.equal(normalizeDigest('sha256:DEADbeef'), 'deadbeef');
  assert.equal(normalizeDigest('SHA256 = de ad be ef'), 'deadbeef');
  assert.equal(normalizeDigest('de:ad:be:ef'), 'deadbeef');
  assert.equal(normalizeDigest(''), '');
});
