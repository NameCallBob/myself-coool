import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InvalidInput,
  LEGACY,
  MAC_ALGOS,
  MAC_LABEL,
  SUBTLE_HASH,
  blockBytes,
  compareSignature,
  decodeInput,
  equalBytes,
  extractSignature,
  hmac,
  keyIsFolded,
  toBase64,
  toHex,
  type MacAlgo,
} from './logic.ts';

const utf8 = (text: string) => new TextEncoder().encode(text);
const filled = (n: number, byte: number) => new Uint8Array(n).fill(byte);

/* ── RFC 4231 test vectors ─────────────────── */
/**
 * Cases 1, 2, 3, 6 and 7 of RFC 4231, plus the SHA-1 figures from RFC 2202
 * for the same inputs. Case 6 and 7 are the ones that matter most here: the
 * key is longer than the block, which is the path where an implementation
 * either hashes the key first or silently gets everything wrong.
 */
test('RFC 4231 case 1 — a 20-byte key', async () => {
  const key = filled(20, 0x0b);
  const message = utf8('Hi There');
  assert.equal(toHex(await hmac('sha1', key, message)), 'b617318655057264e28bc0b6fb378c8ef146be00');
  assert.equal(
    toHex(await hmac('sha256', key, message)),
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
  );
  assert.equal(
    toHex(await hmac('sha384', key, message)),
    'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6'
  );
  assert.equal(
    toHex(await hmac('sha512', key, message)),
    '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'
  );
});

test('RFC 4231 case 2 — a short ASCII key', async () => {
  const key = utf8('Jefe');
  const message = utf8('what do ya want for nothing?');
  assert.equal(toHex(await hmac('sha1', key, message)), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
  assert.equal(
    toHex(await hmac('sha256', key, message)),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
  );
  assert.equal(
    toHex(await hmac('sha512', key, message)),
    '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
  );
});

test('RFC 4231 case 3 — a 50-byte message', async () => {
  const mac = await hmac('sha256', filled(20, 0xaa), filled(50, 0xdd));
  assert.equal(toHex(mac), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe');
});

test('RFC 4231 cases 6 and 7 — a key longer than the block', async () => {
  const key = filled(131, 0xaa);
  assert.equal(
    toHex(await hmac('sha256', key, utf8('Test Using Larger Than Block-Size Key - Hash Key First'))),
    '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'
  );
  assert.equal(
    toHex(
      await hmac(
        'sha512',
        key,
        utf8(
          'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'
        )
      )
    ),
    'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58'
  );
});

test('an empty key and an empty message still produce the RFC-defined MAC', async () => {
  assert.equal(
    toHex(await hmac('sha256', new Uint8Array(), new Uint8Array())),
    'b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad'
  );
});

test('UTF-8 keys and messages are signed as their bytes', async () => {
  assert.equal(
    toHex(await hmac('sha256', utf8('密鑰'), utf8('中文 \u{1F9EA}'))),
    'ea4b1d2e189cefa0a60eedff6adc82bc7b33e4f61765c424858546bb42b6c7df'
  );
});

test('a trailing newline is a different message — the classic webhook bug', async () => {
  const key = utf8('k');
  const a = toHex(await hmac('sha256', key, utf8('{"a":1}')));
  const b = toHex(await hmac('sha256', key, utf8('{"a":1}\n')));
  const c = toHex(await hmac('sha256', key, utf8('{"a": 1}')));
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

/* ── Encodings ─────────────────────────────── */

test('hex input accepts the separators people paste and rejects the rest', () => {
  assert.deepEqual(decodeInput('de ad:be-ef', 'hex', 'key'), new Uint8Array([222, 173, 190, 239]));
  assert.deepEqual(decodeInput('DEAD', 'hex', 'key'), new Uint8Array([222, 173]));
  assert.deepEqual(decodeInput('', 'hex', 'key'), new Uint8Array());
  assert.throws(() => decodeInput('abc', 'hex', 'key'), InvalidInput);
  assert.throws(() => decodeInput('zz', 'hex', 'key'), /not 0-9a-f/);
});

test('base64 input takes both alphabets, wrapped or unpadded', () => {
  assert.deepEqual(decodeInput('YWI=', 'base64', 'key'), new Uint8Array([97, 98]));
  assert.deepEqual(decodeInput('YWI', 'base64', 'key'), new Uint8Array([97, 98]));
  assert.deepEqual(decodeInput('-_8', 'base64', 'key'), new Uint8Array([251, 255]));
  assert.deepEqual(decodeInput('YWI =\n', 'base64', 'key'), new Uint8Array([97, 98]));
  assert.throws(() => decodeInput('YWIxY', 'base64', 'key'), InvalidInput);
});

test('text input keeps every byte, whitespace included', () => {
  assert.deepEqual(decodeInput(' a\r\n', 'utf8', 'message'), utf8(' a\r\n'));
  assert.equal(decodeInput('中', 'utf8', 'message').length, 3);
});

test('hex and base64 output round-trip through the decoders', () => {
  const data = new Uint8Array(40).map((_, i) => (i * 17) % 256);
  assert.deepEqual(decodeInput(toHex(data), 'hex', 'x'), data);
  assert.deepEqual(decodeInput(toBase64(data), 'base64', 'x'), data);
  assert.equal(toBase64(new Uint8Array()), '');
  assert.equal(toHex(new Uint8Array([0, 255])), '00ff');
});

/* ── Key folding ───────────────────────────── */

test('the block size and the fold threshold match the algorithm', () => {
  assert.equal(blockBytes('sha256'), 64);
  assert.equal(blockBytes('sha1'), 64);
  assert.equal(blockBytes('sha384'), 128);
  assert.equal(blockBytes('sha512'), 128);
  assert.ok(!keyIsFolded('sha256', 64));
  assert.ok(keyIsFolded('sha256', 65));
  assert.ok(!keyIsFolded('sha512', 128));
  assert.ok(keyIsFolded('sha512', 129));
});

test('metadata covers every algorithm offered', () => {
  for (const algo of MAC_ALGOS) {
    assert.ok(MAC_LABEL[algo].startsWith('HMAC-'), algo);
    assert.ok(SUBTLE_HASH[algo].startsWith('SHA-'), algo);
  }
  assert.deepEqual(LEGACY, ['sha1']);
  assert.equal(MAC_ALGOS[0], 'sha256' as MacAlgo);
});

/* ── Signature headers ─────────────────────── */

test('a MAC is pulled out of the header shapes senders actually use', () => {
  const hex = 'a'.repeat(64);
  assert.equal(extractSignature(`sha256=${hex}`), hex);
  assert.equal(extractSignature(`t=1699999999,v1=${hex}`), hex);
  assert.equal(extractSignature(`  ${hex}  `), hex);
  assert.equal(extractSignature('X-Hub-Signature-256: sha256=' + hex), hex);
  assert.equal(extractSignature(''), '');
  // Nothing digest-shaped: hand back the text with whitespace removed, so the
  // comparison can say "unreadable" instead of silently comparing nothing.
  assert.equal(extractSignature('t=169'), 't=169');
});

test('comparison accepts hex or base64 and never short-circuits on equality', async () => {
  const mac = await hmac('sha256', utf8('k'), utf8('body'));
  assert.deepEqual(compareSignature(toHex(mac), mac), { kind: 'match', form: 'hex' });
  assert.deepEqual(compareSignature(`sha256=${toHex(mac).toUpperCase()}`, mac), {
    kind: 'match',
    form: 'hex',
  });
  assert.deepEqual(compareSignature(toBase64(mac), mac), { kind: 'match', form: 'base64' });
  assert.deepEqual(compareSignature('', mac), { kind: 'empty' });

  const flipped = new Uint8Array(mac);
  flipped[flipped.length - 1] ^= 1;
  assert.deepEqual(compareSignature(toHex(flipped), mac), { kind: 'mismatch' });
  // Right length, wrong alphabet: unreadable rather than a false negative.
  assert.deepEqual(compareSignature('%'.repeat(44), mac), { kind: 'unreadable' });
  // A digest of the wrong length cannot be this MAC.
  assert.deepEqual(compareSignature(toHex(mac).slice(0, 40), mac), { kind: 'mismatch' });
});

test('equalBytes compares content and length', () => {
  assert.ok(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assert.ok(!equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assert.ok(!equalBytes(new Uint8Array([1]), new Uint8Array([1, 0])));
  assert.ok(equalBytes(new Uint8Array(), new Uint8Array()));
});
