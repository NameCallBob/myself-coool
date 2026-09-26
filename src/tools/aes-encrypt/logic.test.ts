import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMOR_BEGIN,
  ARMOR_END,
  AuthFailed,
  BadContainer,
  CIPHER_AES_256_GCM,
  DEFAULT_ITERATIONS,
  HEADER_BYTES,
  IV_BYTES,
  KDF_PBKDF2_SHA256,
  MAGIC,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  SALT_BYTES,
  TAG_BYTES,
  VERSION,
  armor,
  buildHeader,
  containerSize,
  dearmor,
  decodeUtf8,
  decryptBytes,
  decryptText,
  deriveKey,
  encodeUtf8,
  encryptBytes,
  encryptText,
  fromBase64,
  guessesPerSecond,
  headerOf,
  parseContainer,
  toBase64,
  GPU_SHA256_PER_SECOND,
} from './logic.ts';
import { GPU_SHA256_PER_SECOND as GENERATOR_RATE } from '../password-generator/logic.ts';

/** Tests use the floor, not the default: 600,000 iterations per case would
 *  turn this file into a minute of PBKDF2. The algorithm is identical. */
const FAST = { iterations: MIN_ITERATIONS };
const SALT = new Uint8Array(SALT_BYTES).map((_, i) => i + 1);
const IV = new Uint8Array(IV_BYTES).map((_, i) => 200 + i);

/* ── Round trips ───────────────────────────── */

test('text survives the round trip, including CJK, emoji and CRLF', async () => {
  for (const message of [
    'hello',
    '',
    '中文與 English 混排',
    'emoji \u{1F9EA}\u{1F512}',
    'line one\r\nline two\n',
    'x'.repeat(10_000),
  ]) {
    const sealed = await encryptText(message, 'correct horse battery staple', FAST);
    assert.equal(await decryptText(sealed, 'correct horse battery staple'), message, JSON.stringify(message.slice(0, 20)));
  }
});

test('arbitrary bytes survive the round trip', async () => {
  for (const length of [0, 1, 15, 16, 17, 1000]) {
    const data = new Uint8Array(length).map((_, i) => (i * 73 + 5) % 256);
    const sealed = await encryptBytes(data, 'pw', FAST);
    assert.deepEqual(await decryptBytes(sealed, 'pw'), data, `length ${length}`);
  }
});

test('the same input encrypts differently every time', async () => {
  const one = await encryptBytes(encodeUtf8('same'), 'pw', FAST);
  const two = await encryptBytes(encodeUtf8('same'), 'pw', FAST);
  assert.notDeepEqual(one, two);
  // Specifically: the salt and the IV differ, which is the point.
  const a = parseContainer(one);
  const b = parseContainer(two);
  assert.notDeepEqual(a.salt, b.salt);
  assert.notDeepEqual(a.iv, b.iv);
  assert.deepEqual(await decryptBytes(one, 'pw'), await decryptBytes(two, 'pw'));
});

test('the container is exactly header + plaintext + tag', async () => {
  for (const length of [0, 5, 4096]) {
    const sealed = await encryptBytes(new Uint8Array(length), 'pw', FAST);
    assert.equal(sealed.length, containerSize(length), `length ${length}`);
    assert.equal(sealed.length, HEADER_BYTES + length + TAG_BYTES);
  }
});

/* ── Failure modes ─────────────────────────── */

test('a wrong password fails, and says nothing about why', async () => {
  const sealed = await encryptBytes(encodeUtf8('secret'), 'right', FAST);
  await assert.rejects(() => decryptBytes(sealed, 'wrong'), AuthFailed);
  await assert.rejects(() => decryptBytes(sealed, ''), AuthFailed);
  await assert.rejects(() => decryptBytes(sealed, 'right '), AuthFailed);
});

test('a single flipped bit anywhere in the ciphertext is caught', async () => {
  const sealed = await encryptBytes(encodeUtf8('a message worth protecting'), 'pw', FAST);
  for (const offset of [HEADER_BYTES, HEADER_BYTES + 3, sealed.length - 1, sealed.length - TAG_BYTES]) {
    const tampered = sealed.slice();
    tampered[offset] ^= 1;
    await assert.rejects(() => decryptBytes(tampered, 'pw'), AuthFailed, `offset ${offset}`);
  }
});

test('editing the authenticated header is caught too', async () => {
  const sealed = await encryptBytes(encodeUtf8('m'), 'pw', FAST);
  // The iteration count is inside the AAD, so editing it to make cracking
  // cheaper breaks decryption instead. Below the format's floor the header is
  // refused outright; a value that stays in range gets as far as GCM and fails
  // there. Neither path buys a cheaper derivation.
  const lowered = sealed.slice();
  lowered[11] = 1;
  await assert.rejects(() => decryptBytes(lowered, 'pw'), /range this format allows/);

  const raised = sealed.slice();
  raised[9] = 0x01; // 1,000 -> 66,536, still inside the allowed range
  await assert.rejects(() => decryptBytes(raised, 'pw'), AuthFailed);

  const movedSalt = sealed.slice();
  movedSalt[12] ^= 0xff;
  await assert.rejects(() => decryptBytes(movedSalt, 'pw'), AuthFailed);

  const movedIv = sealed.slice();
  movedIv[28] ^= 0xff;
  await assert.rejects(() => decryptBytes(movedIv, 'pw'), AuthFailed);
});

test('truncation and foreign data are refused before any key derivation', async () => {
  const sealed = await encryptBytes(encodeUtf8('m'), 'pw', FAST);
  await assert.rejects(() => decryptBytes(sealed.slice(0, HEADER_BYTES + 4), 'pw'), BadContainer);
  await assert.rejects(() => decryptBytes(new Uint8Array(10), 'pw'), /too short/);

  const foreign = sealed.slice();
  foreign[0] = 0x58;
  await assert.rejects(() => decryptBytes(foreign, 'pw'), /SPENC marker/);

  const future = sealed.slice();
  future[5] = 9;
  await assert.rejects(() => decryptBytes(future, 'pw'), /version 9/);

  const otherKdf = sealed.slice();
  otherKdf[6] = 2;
  await assert.rejects(() => decryptBytes(otherKdf, 'pw'), /key-derivation id 2/);

  const otherCipher = sealed.slice();
  otherCipher[7] = 2;
  await assert.rejects(() => decryptBytes(otherCipher, 'pw'), /cipher id 2/);
});

test('an empty passphrase is refused when encrypting', async () => {
  await assert.rejects(() => encryptBytes(encodeUtf8('m'), '', FAST), /passphrase is required/);
});

test('binary plaintext decrypted as text reports itself instead of mangling', async () => {
  const sealed = armor(await encryptBytes(new Uint8Array([0xff, 0xfe, 0x00]), 'pw', FAST));
  await assert.rejects(() => decryptText(sealed, 'pw'), /not UTF-8 text/);
});

/* ── Header layout ─────────────────────────── */

test('the header is laid out exactly as the comment claims', () => {
  const header = buildHeader(600_000, SALT, IV);
  assert.equal(header.length, HEADER_BYTES);
  assert.equal(String.fromCharCode(...header.subarray(0, 5)), MAGIC);
  assert.equal(header[5], VERSION);
  assert.equal(header[6], KDF_PBKDF2_SHA256);
  assert.equal(header[7], CIPHER_AES_256_GCM);
  // 600000 = 0x0009_27C0
  assert.deepEqual([...header.subarray(8, 12)], [0x00, 0x09, 0x27, 0xc0]);
  assert.deepEqual([...header.subarray(12, 28)], [...SALT]);
  assert.deepEqual([...header.subarray(28, 40)], [...IV]);
});

test('a header round-trips through parse and rebuild', async () => {
  const sealed = await encryptBytes(encodeUtf8('m'), 'pw', { ...FAST, salt: SALT, iv: IV });
  const parsed = parseContainer(sealed);
  assert.equal(parsed.iterations, MIN_ITERATIONS);
  assert.deepEqual(parsed.salt, SALT);
  assert.deepEqual(parsed.iv, IV);
  assert.deepEqual(headerOf(parsed), sealed.slice(0, HEADER_BYTES));
});

test('buildHeader() refuses parameters it cannot represent', () => {
  assert.throws(() => buildHeader(0, SALT, IV), /positive integer/);
  assert.throws(() => buildHeader(1.5, SALT, IV), /positive integer/);
  assert.throws(() => buildHeader(0x1_0000_0000, SALT, IV), /does not fit/);
  assert.throws(() => buildHeader(1000, new Uint8Array(8), IV), /salt must be 16/);
  assert.throws(() => buildHeader(1000, SALT, new Uint8Array(16)), /IV must be 12/);
});

test('the iteration count is bounded on both sides', async () => {
  await assert.rejects(() => deriveKey('pw', SALT, MIN_ITERATIONS - 1), /at least/);
  await assert.rejects(() => deriveKey('pw', SALT, MAX_ITERATIONS + 1), /at most/);
  const key = await deriveKey('pw', SALT, MIN_ITERATIONS);
  assert.equal(key.algorithm.name, 'AES-GCM');
  assert.equal((key.algorithm as AesKeyAlgorithm).length, 256);
  assert.equal(key.extractable, false);
});

test('the same password and salt derive the same key, a different salt does not', async () => {
  const other = new Uint8Array(SALT_BYTES).fill(9);
  const sealed = await encryptBytes(encodeUtf8('m'), 'pw', { ...FAST, salt: SALT, iv: IV });
  const sameParams = await encryptBytes(encodeUtf8('m'), 'pw', { ...FAST, salt: SALT, iv: IV });
  // Deterministic when salt and IV are pinned — which is exactly why the tool
  // never pins them.
  assert.deepEqual(sealed, sameParams);
  const otherSalt = await encryptBytes(encodeUtf8('m'), 'pw', { ...FAST, salt: other, iv: IV });
  assert.notDeepEqual(sealed.slice(HEADER_BYTES), otherSalt.slice(HEADER_BYTES));
});

/* ── Armour ────────────────────────────────── */

test('armour wraps at 64 columns between markers and reads back', async () => {
  const sealed = await encryptBytes(encodeUtf8('x'.repeat(300)), 'pw', FAST);
  const text = armor(sealed);
  const lines = text.split('\n');
  assert.equal(lines[0], ARMOR_BEGIN);
  assert.equal(lines[lines.length - 1], ARMOR_END);
  for (const line of lines.slice(1, -1)) assert.ok(line.length <= 64, `line of ${line.length}`);
  assert.deepEqual(dearmor(text), sealed);
});

test('dearmor tolerates re-wrapped, indented and bare base64', async () => {
  const sealed = await encryptBytes(encodeUtf8('hello'), 'pw', FAST);
  const text = armor(sealed);
  assert.deepEqual(dearmor(`\n\n  ${text}  \n`), sealed);
  assert.deepEqual(dearmor(text.replace(/\n/g, '\r\n')), sealed);
  assert.deepEqual(dearmor(toBase64(sealed)), sealed);
  assert.deepEqual(dearmor(toBase64(sealed).replace(/(.{10})/g, '$1\n')), sealed);
  assert.deepEqual(dearmor(`> ${ARMOR_BEGIN}\n${toBase64(sealed)}\n${ARMOR_END}`), sealed);
});

test('dearmor reports the damage instead of guessing', () => {
  assert.throws(() => dearmor(''), /nothing to decrypt/);
  assert.throws(() => dearmor(`${ARMOR_BEGIN}\nQUJD\n`), /END marker is missing/);
  assert.throws(() => dearmor('!!!!'), /not valid base64/);
  assert.throws(() => dearmor('QUJDR'), /base64 length/);
});

test('base64 helpers round-trip, empty input included', () => {
  for (const length of [0, 1, 2, 3, 100, 0x8000 + 5]) {
    const data = new Uint8Array(length).map((_, i) => i % 256);
    assert.deepEqual(fromBase64(toBase64(data)), data, `length ${length}`);
  }
  assert.equal(decodeUtf8(encodeUtf8('中文 \u{1F9EA}')), '中文 \u{1F9EA}');
  assert.throws(() => decodeUtf8(new Uint8Array([0x80])));
});

/* ── Advice figures ────────────────────────── */

test('the guess-rate figure scales the way PBKDF2 does', () => {
  assert.equal(guessesPerSecond(1, 1e10), 5e9);
  assert.equal(guessesPerSecond(DEFAULT_ITERATIONS, 1.2e10), 1.2e10 / 1_200_000);
  // Ten times the iterations, a tenth of the guesses.
  assert.ok(Math.abs(guessesPerSecond(10_000) / guessesPerSecond(100_000) - 10) < 1e-9);
});

test('an out-of-range iteration count in a file is reported as a broken file', async () => {
  const sealed = await encryptBytes(encodeUtf8('m'), 'pw', FAST);
  const said = (data: Uint8Array) => {
    try {
      parseContainer(data);
      return '';
    } catch (problem) {
      return (problem as Error).message;
    }
  };

  // 1000 with its low byte overwritten: 769, inside the 1–999 gap that used to
  // sail through parseContainer and land on deriveKey's advice for a human.
  const low = sealed.slice();
  low[11] = 1;
  assert.throws(() => parseContainer(low), BadContainer);
  assert.match(said(low), /769/);
  assert.match(said(low), /header/);
  assert.doesNotMatch(said(low), /must be at least/);

  const zero = sealed.slice();
  zero.fill(0, 8, 12);
  assert.match(said(zero), /header/);

  // Far above the ceiling: deriving with this would hang the tab for hours.
  const high = sealed.slice();
  high[8] = 0xff;
  assert.throws(() => parseContainer(high), BadContainer);
  assert.doesNotMatch(said(high), /must be at most/);

  // And decryption stops there, before any key derivation.
  await assert.rejects(() => decryptBytes(low, 'pw'), BadContainer);
  await assert.rejects(() => decryptBytes(high, 'pw'), BadContainer);
});

test('the assumed attacker is the same one E01 reports crack times for', () => {
  // E01 and E07 sit in the same drawer and their numbers get read side by side,
  // so they have to describe one attacker. Both name the rate in SHA-256
  // compressions per second: E01 spends one per guess against a raw hash, E07
  // spends two per PBKDF2 iteration.
  assert.equal(GPU_SHA256_PER_SECOND, GENERATOR_RATE);
  assert.equal(guessesPerSecond(DEFAULT_ITERATIONS), GPU_SHA256_PER_SECOND / (DEFAULT_ITERATIONS * 2));
  // Which is about 83,000 guesses a second at the default cost, not 8,000.
  assert.ok(Math.abs(guessesPerSecond(DEFAULT_ITERATIONS) - 83_333) < 1);
});
