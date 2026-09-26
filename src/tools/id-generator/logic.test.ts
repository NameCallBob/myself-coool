import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CROCKFORD,
  GREGORIAN_OFFSET_100NS,
  MAX_ULID_MS,
  MAX_V7_MS,
  NANOID_URL_SAFE,
  ULID_MAX_TIME,
  decodeBase32,
  decodeId,
  encodeBase32,
  entropyBits,
  formatUuid,
  guessAlphabet,
  hexOf,
  idsBeforeCollision,
  nanoid,
  parseUuid,
  ulid,
  uuidV4,
  uuidV7,
} from './logic.ts';

/** Deterministic byte source: 00 01 02 … so every output is reproducible. */
const counting = (start = 0) => {
  let next = start;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) out[i] = next++ & 0xff;
    return out;
  };
};

const zeros = (n: number) => new Uint8Array(n);
const ones = (n: number) => new Uint8Array(n).fill(0xff);

/* ── Crockford base32 ─────────────────────── */

test('the alphabet omits I, L, O and U and is 32 characters', () => {
  assert.equal(CROCKFORD.length, 32);
  for (const ch of ['I', 'L', 'O', 'U']) assert.ok(!CROCKFORD.includes(ch));
  assert.equal(new Set(CROCKFORD).size, 32);
});

test('base32 round-trips and pads to width', () => {
  assert.equal(encodeBase32(BigInt(0), 4), '0000');
  assert.equal(encodeBase32(BigInt(31), 1), 'Z');
  assert.equal(encodeBase32(BigInt(32), 2), '10');
  const cases = [0, 1, 31, 32, 1023, 1469918176385].map((n) => BigInt(n));
  cases.push((BigInt(1) << BigInt(80)) - BigInt(1));
  for (const value of cases) {
    assert.equal(decodeBase32(encodeBase32(value, 26)), value);
  }
});

test('a value too large for the width is refused, not truncated', () => {
  assert.throws(() => encodeBase32(BigInt(32), 1), RangeError);
  assert.throws(() => encodeBase32(BigInt(-1), 4), RangeError);
});

test('decoding forgives the characters the alphabet left out', () => {
  // I and L read as 1, O reads as 0 — the reason to use this alphabet at all.
  assert.equal(decodeBase32('I'), BigInt(1));
  assert.equal(decodeBase32('L'), BigInt(1));
  assert.equal(decodeBase32('O'), BigInt(0));
  assert.equal(decodeBase32('abc'), decodeBase32('ABC'));
  assert.throws(() => decodeBase32('U'), RangeError);
  assert.throws(() => decodeBase32('!'), RangeError);
});

/* ── UUID formatting ──────────────────────── */

test('formatting and parsing a UUID round-trip', () => {
  const data = counting(0x10)(16);
  const text = formatUuid(data);
  assert.match(text, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(parseUuid(text), data);
  assert.throws(() => formatUuid(new Uint8Array(15)), RangeError);
});

test('parsing accepts the forms people actually paste', () => {
  const canonical = '017f22e2-79b0-7cc3-98c4-dc0c0c07398f';
  const expected = parseUuid(canonical);
  assert.ok(expected);
  assert.deepEqual(parseUuid(canonical.replace(/-/g, '')), expected);
  assert.deepEqual(parseUuid(canonical.toUpperCase()), expected);
  assert.deepEqual(parseUuid(`{${canonical}}`), expected);
  assert.deepEqual(parseUuid(`urn:uuid:${canonical}`), expected);
  assert.deepEqual(parseUuid(`  ${canonical}  `), expected);
  assert.equal(parseUuid('nope'), null);
  assert.equal(parseUuid(`${canonical}0`), null);
  assert.equal(parseUuid('017f22e2-79b0-7cc3-98c4-dc0c0c07398g'), null);
});

/* ── v4 ───────────────────────────────────── */

test('v4 stamps the version and variant over the random bytes', () => {
  const id = uuidV4(zeros);
  assert.equal(id, '00000000-0000-4000-8000-000000000000');
  const all = uuidV4(ones);
  assert.equal(all, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  // Only those six bits are fixed: 122 of the 128 come from the source.
  assert.equal(decodeId(all).randomBits, 122);
});

test('v4 from a distinct source produces a distinct id', () => {
  assert.notEqual(uuidV4(counting(0)), uuidV4(counting(9)));
});

/* ── v7, against the RFC 9562 example ─────── */

/**
 * RFC 9562 Appendix B.2 gives 017F22E2-79B0-7CC3-98C4-DC0C0C07398F as its v7
 * example, stating the instant as Tuesday 22 February 2022 14:22:22 GMT-05:00 —
 * 2022-02-22T19:22:22Z, i.e. 1645557742000 ms.
 */
const RFC_V7 = '017f22e2-79b0-7cc3-98c4-dc0c0c07398f';
const RFC_INSTANT_MS = 1645557742000;

test('the RFC v7 example decodes to the instant the RFC states', () => {
  const decoded = decodeId(RFC_V7);
  assert.equal(decoded.kind, 'uuid');
  assert.equal(decoded.version, 7);
  assert.equal(decoded.timestampMs, RFC_INSTANT_MS);
  assert.equal(new Date(decoded.timestampMs!).toISOString(), '2022-02-22T19:22:22.000Z');
  assert.equal(decoded.randomBits, 74);
  assert.ok(decoded.notes.includes('time-ordered'));
});

test('generating v7 for that instant reproduces the RFC timestamp bytes', () => {
  const id = uuidV7(RFC_INSTANT_MS, zeros);
  assert.equal(id.slice(0, 13), RFC_V7.slice(0, 13));
  assert.equal(id, '017f22e2-79b0-7000-8000-000000000000');
  assert.equal(decodeId(id).timestampMs, RFC_INSTANT_MS);
});

test('v7 sorts lexicographically in time order', () => {
  const ids = [3_000_000_000_000, 1_000_000_000_000, 2_000_000_000_000].map((ms) =>
    uuidV7(ms, zeros)
  );
  assert.deepEqual(
    ids.slice().sort(),
    [1_000_000_000_000, 2_000_000_000_000, 3_000_000_000_000].map((ms) => uuidV7(ms, zeros))
  );
});

test('v7 boundary timestamps are accepted and out-of-range ones refused', () => {
  assert.equal(decodeId(uuidV7(0, zeros)).timestampMs, 0);
  assert.equal(decodeId(uuidV7(MAX_V7_MS, zeros)).timestampMs, MAX_V7_MS);
  assert.throws(() => uuidV7(-1, zeros), RangeError);
  assert.throws(() => uuidV7(MAX_V7_MS + 1, zeros), RangeError);
  assert.throws(() => uuidV7(1.5, zeros), RangeError);
});

/* ── v1 and v6, against RFC 9562 and the epoch constant ─ */

test('the UUID Gregorian epoch constant is the documented one', () => {
  // 0x01B21DD213814000 hundred-nanosecond ticks from 1582-10-15 to 1970-01-01.
  assert.equal(GREGORIAN_OFFSET_100NS, BigInt('0x01b21dd213814000'));
});

test('a v1 UUID at Unix time zero decodes to Unix time zero', () => {
  // Built by hand from the epoch constant: time_low 13814000, time_mid 1dd2,
  // time_hi 1b2 with the version nibble making the field 11b2.
  const decoded = decodeId('13814000-1dd2-11b2-8000-000000000000');
  assert.equal(decoded.version, 1);
  assert.equal(decoded.timestampMs, 0);
  assert.equal(decoded.timestampSub100ns, 0);
  assert.ok(decoded.notes.includes('gregorian-epoch'));
});

test('the RFC v1 example decodes to the same instant as its v7 sibling', () => {
  const decoded = decodeId('C232AB00-9414-11EC-B3C8-9E6BDECED846');
  assert.equal(decoded.version, 1);
  assert.equal(decoded.timestampMs, RFC_INSTANT_MS);
  assert.equal(decoded.timestampSub100ns, 0);
});

test('the RFC v6 example decodes to the same instant with reordered bits', () => {
  const decoded = decodeId('1EC9414C-232A-6B00-B3C8-9E6BDECED846');
  assert.equal(decoded.version, 6);
  assert.equal(decoded.timestampMs, RFC_INSTANT_MS);
  assert.ok(decoded.notes.includes('time-ordered'));
});

test('v1 exposes the clock sequence, node and multicast bit', () => {
  const decoded = decodeId('C232AB00-9414-11EC-B3C8-9E6BDECED846');
  const parts = new Map(decoded.parts.map((part) => [part.label, part.value]));
  assert.equal(parts.get('node'), '9e6bdeced846');
  // 0xB3C8 with the top two variant bits masked off: 0x33C8 = 13256.
  assert.equal(parts.get('clock_seq'), '13256');
  // 0x9e has its low bit clear, so this is a unicast MAC-shaped node.
  assert.equal(parts.get('multicast'), 'no');
});

/* ── Other UUID versions and edge cases ───── */

test('v3 and v5 are named as name-based, not random', () => {
  // RFC 9562 Appendix A: v5 of "www.example.com" in the DNS namespace.
  const v5 = decodeId('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(v5.version, 5);
  assert.ok(v5.notes.includes('name-based'));
  assert.ok(v5.notes.includes('not-time-based'));
  assert.equal(v5.randomBits, 0);
  const v3 = decodeId('5df41881-3aed-3515-88a7-2f4a814cf09e');
  assert.equal(v3.version, 3);
  assert.ok(v3.notes.includes('name-based'));
});

test('the nil and max UUIDs are recognised as such', () => {
  const nil = decodeId('00000000-0000-0000-0000-000000000000');
  assert.ok(nil.notes.includes('nil'));
  assert.equal(nil.version, null);
  const max = decodeId('ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.ok(max.notes.includes('max'));
  assert.equal(max.version, null);
});

test('a non-RFC variant is flagged rather than read as RFC layout', () => {
  // Variant bits 110 is the Microsoft GUID layout, not RFC 9562.
  const decoded = decodeId('017f22e2-79b0-7cc3-c8c4-dc0c0c07398f');
  assert.ok(decoded.notes.includes('non-rfc-variant'));
  assert.ok(decoded.variant?.includes('Microsoft'));
});

test('an unknown version is named as unknown', () => {
  const decoded = decodeId('017f22e2-79b0-fcc3-98c4-dc0c0c07398f');
  assert.equal(decoded.version, 15);
  assert.ok(decoded.notes.includes('unknown-version'));
});

/* ── ULID ─────────────────────────────────── */

test('the ULID spec timestamp encodes to the documented characters', () => {
  // ULID spec: 1469918176385 ms is written 01ARYZ6S41.
  assert.equal(encodeBase32(BigInt(1469918176385), 10), '01ARYZ6S41');
  const id = ulid(1469918176385, zeros);
  assert.equal(id.slice(0, 10), '01ARYZ6S41');
  assert.equal(id.length, 26);
});

test('a ULID round-trips through the decoder', () => {
  const id = ulid(RFC_INSTANT_MS, counting(0x40));
  const decoded = decodeId(id);
  assert.equal(decoded.kind, 'ulid');
  assert.equal(decoded.timestampMs, RFC_INSTANT_MS);
  assert.equal(decoded.randomBits, 80);
  assert.equal(decoded.totalBits, 128);
  assert.equal(decoded.randomHex, hexOf(counting(0x40)(10)));
});

test('ULIDs sort lexicographically in time order', () => {
  const early = ulid(1_000_000_000_000, ones);
  const late = ulid(1_000_000_000_001, zeros);
  assert.ok(early < late, 'a later millisecond must sort after an earlier one');
});

test('ULID boundaries are accepted and overflow refused', () => {
  assert.equal(ulid(0, zeros), '0'.repeat(26));
  assert.equal(ulid(MAX_ULID_MS, ones).slice(0, 10), '7ZZZZZZZZZ');
  assert.equal(MAX_ULID_MS, ULID_MAX_TIME);
  assert.throws(() => ulid(MAX_ULID_MS + 1, zeros), RangeError);
  assert.throws(() => ulid(-1, zeros), RangeError);
});

test('a 26-character string with an impossible timestamp is not called a ULID', () => {
  // 'Z' first means a timestamp past 2^48 ms, which no ULID can hold.
  const decoded = decodeId('ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
  assert.equal(decoded.kind, 'nanoid');
  assert.equal(decoded.timestampMs, null);
  assert.ok(decoded.notes.includes('ambiguous-length'));
});

test('lower-case ULIDs are accepted and normalised', () => {
  const id = ulid(RFC_INSTANT_MS, zeros);
  const decoded = decodeId(id.toLowerCase());
  assert.equal(decoded.kind, 'ulid');
  assert.equal(decoded.canonical, id);
  assert.equal(decoded.timestampMs, RFC_INSTANT_MS);
});

/* ── NanoID ───────────────────────────────── */

test('nanoid draws size characters from the alphabet', () => {
  let call = 0;
  const below = () => call++ % 4;
  assert.equal(nanoid(6, 'abcd', below), 'abcdab');
  assert.equal(nanoid(21, NANOID_URL_SAFE, () => 0).length, 21);
});

test('nanoid de-duplicates the alphabet so the entropy claim stays true', () => {
  // 'aab' has two distinct characters; drawing from three would double a's odds
  // while the reported entropy assumed uniformity.
  const picks: number[] = [];
  nanoid(3, 'aab', (max) => {
    picks.push(max);
    return 0;
  });
  assert.deepEqual(picks, [2, 2, 2]);
});

test('nanoid refuses impossible parameters', () => {
  assert.throws(() => nanoid(0, 'abc', () => 0), RangeError);
  assert.throws(() => nanoid(-1, 'abc', () => 0), RangeError);
  assert.throws(() => nanoid(1.5, 'abc', () => 0), RangeError);
  assert.throws(() => nanoid(4, 'a', () => 0), RangeError);
  assert.throws(() => nanoid(4, 'aaaa', () => 0), RangeError);
});

test('alphabet guessing narrows from digits up to url-safe 64', () => {
  assert.deepEqual(guessAlphabet('12345'), { name: 'digits', size: 10 });
  assert.deepEqual(guessAlphabet('deadbeef'), { name: 'hex', size: 16 });
  assert.deepEqual(guessAlphabet('01ARYZ6S41'), { name: 'Crockford base32', size: 32 });
  assert.deepEqual(guessAlphabet('V1StGXR8_Z5jdHi6B-myT'), { name: 'URL-safe 64', size: 64 });
  assert.equal(guessAlphabet('中文 id').name, 'unknown');
});

test('a 21-character nanoid reports the entropy the default alphabet gives', () => {
  const decoded = decodeId('V1StGXR8_Z5jdHi6B-myT');
  assert.equal(decoded.kind, 'nanoid');
  // 21 characters from 64 is exactly 126 bits.
  assert.equal(decoded.randomBits, 126);
  assert.ok(decoded.notes.includes('alphabet-guess'));
});

/* ── Entropy and collisions ───────────────── */

test('entropy is log2(alphabet) times length', () => {
  assert.equal(entropyBits(64, 21), 126);
  assert.equal(entropyBits(32, 26), 130);
  assert.equal(entropyBits(16, 32), 128);
  assert.equal(entropyBits(1, 10), 0);
  assert.equal(entropyBits(64, 0), 0);
});

test('the birthday bound matches the textbook figure for 122 bits', () => {
  // sqrt(2 · 2^122 · ln(1/0.99)) ≈ 2.9 × 10^17.
  const n = idsBeforeCollision(122, 0.01);
  assert.ok(n > 2e17 && n < 4e17, `unexpected bound: ${n}`);
  // Halving the bits quarters nothing — it square-roots the count.
  assert.ok(idsBeforeCollision(61, 0.01) < 1e10);
  assert.equal(idsBeforeCollision(0), 0);
  assert.equal(idsBeforeCollision(128, 0), 0);
  assert.equal(idsBeforeCollision(128, 1), 0);
});

test('50 percent is the classic birthday figure', () => {
  // sqrt(2 · 2^128 · ln 2) ≈ 2.2 × 10^19.
  const n = idsBeforeCollision(128, 0.5);
  assert.ok(n > 1e19 && n < 3e19, `unexpected bound: ${n}`);
});

/* ── Empty and junk input ─────────────────── */

test('an empty input decodes to nothing rather than a guess', () => {
  const decoded = decodeId('   ');
  assert.equal(decoded.kind, 'unknown');
  assert.equal(decoded.totalBits, 0);
  assert.deepEqual(decoded.parts, []);
  assert.deepEqual(decoded.notes, []);
});

test('hex output is lower-case and two characters per byte', () => {
  assert.equal(hexOf(new Uint8Array([0, 15, 16, 255])), '000f10ff');
  assert.equal(hexOf(new Uint8Array(0)), '');
});
