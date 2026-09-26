import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DETECTORS,
  InputTooLarge,
  MAX_INPUT,
  STANDARD_DETECTORS,
  detectorFor,
  isIpv4,
  isLuhnValid,
  isTwBusinessValid,
  isTwIdValid,
  maskFor,
  redact,
  scan,
  segments,
  type DetectorId,
} from './logic.ts';

const all: DetectorId[] = DETECTORS.map((detector) => detector.id);

test('the validators agree with published test values', () => {
  assert.equal(isLuhnValid('4111111111111111'), true);
  assert.equal(isLuhnValid('4111 1111 1111 1111'), true);
  assert.equal(isLuhnValid('4111111111111112'), false);
  assert.equal(isLuhnValid('378282246310005'), true);
  assert.equal(isLuhnValid('1234567890123'), false);
  assert.equal(isLuhnValid('411111111111'), false); // 12 digits is too short

  assert.equal(isTwIdValid('A123456789'), true);
  assert.equal(isTwIdValid('A123456788'), false);
  assert.equal(isTwIdValid('A323456789'), false); // second digit must be 1 or 2

  assert.equal(isTwBusinessValid('04595257'), true);
  assert.equal(isTwBusinessValid('04595258'), false);

  assert.equal(isIpv4('192.168.0.1'), true);
  assert.equal(isIpv4('255.255.255.255'), true);
  assert.equal(isIpv4('999.1.1.1'), false);
  assert.equal(isIpv4('1.2.3'), false);
});

test('an e-mail address is found and labelled', () => {
  const result = redact('contact ann.lee@example.com now', ['email'], 'label');
  assert.equal(result.text, 'contact [EMAIL_1] now');
  assert.equal(result.counts.email, 1);
  assert.equal(result.distinct.email, 1);
});

test('the same value keeps the same label, a different value gets a new one', () => {
  const result = redact('a@x.com b@x.com a@x.com', ['email'], 'label');
  assert.equal(result.text, '[EMAIL_1] [EMAIL_2] [EMAIL_1]');
  assert.equal(result.counts.email, 3);
  assert.equal(result.distinct.email, 2);
});

test('partial mode keeps what a debugger needs and nothing more', () => {
  assert.equal(redact('ann.lee@example.com', ['email'], 'partial').text, 'a******@example.com');
  assert.equal(redact('card 4111 1111 1111 1111 ok', ['card'], 'partial').text, 'card ************1111 ok');
  assert.equal(redact('from 192.168.13.24', ['ipv4'], 'partial').text, 'from 192.168.*.*');
  assert.equal(redact('id A123456789', ['twId'], 'partial').text, 'id A******789');
  assert.equal(redact('call 0912-345-678', ['mobileTw'], 'partial').text, 'call *********678');
});

test('fixed mode says nothing at all about the value', () => {
  const result = redact('ann@example.com and 192.168.0.1', ['email', 'ipv4'], 'fixed');
  assert.equal(result.text, '[REDACTED] and [REDACTED]');
});

test('card numbers are Luhn-verified, so order numbers survive', () => {
  // A sixteen-digit number that is not a card must not be masked.
  const kept = redact('order 1234567812345678 shipped', ['card'], 'label');
  assert.equal(kept.text, 'order 1234567812345678 shipped');
  const masked = redact('paid with 4111111111111111', ['card'], 'label');
  assert.equal(masked.text, 'paid with [CARD_1]');
  // Grouped forms are found too.
  assert.equal(redact('4111-1111-1111-1111', ['card'], 'label').text, '[CARD_1]');
  assert.equal(redact('378282246310005', ['card'], 'label').text, '[CARD_1]');
});

test('身分證字號 is checksum-verified', () => {
  assert.equal(redact('A123456789', ['twId'], 'label').text, '[TWID_1]');
  assert.equal(redact('A123456788', ['twId'], 'label').text, 'A123456788');
  assert.equal(redact('身分證 A123456789 已驗證', ['twId'], 'label').text, '身分證 [TWID_1] 已驗證');
});

test('the noisy detectors are off by default, and say why when on', () => {
  assert.equal(STANDARD_DETECTORS.includes('twBusiness'), false);
  assert.equal(STANDARD_DETECTORS.includes('base64Token'), false);
  assert.equal(STANDARD_DETECTORS.includes('email'), true);
  // 04595257 is a valid 統編, so with the detector on it is masked.
  assert.equal(redact('統編 04595257', ['twBusiness'], 'label').text, '統編 [TWBAN_1]');
  // and with the standard set it is not touched at all.
  assert.equal(redact('統編 04595257', STANDARD_DETECTORS, 'label').text, '統編 04595257');
});

test('IPv4 is range-checked, IPv6 and MAC have their own shapes', () => {
  assert.equal(redact('at 10.0.0.255', ['ipv4'], 'label').text, 'at [IP_1]');
  assert.equal(redact('version 1.2.3.400', ['ipv4'], 'label').text, 'version 1.2.3.400');
  assert.equal(redact('2001:db8:85a3::8a2e:370:7334', ['ipv6'], 'label').text, '[IPV6_1]');
  assert.equal(redact('aa:bb:cc:dd:ee:ff', ['mac'], 'label').text, '[MAC_1]');
});

test('tokens: JWT, provider keys, headers, URLs and query strings', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
  assert.equal(redact(`token=${jwt}`, ['jwt'], 'label').text, 'token=[JWT_1]');

  assert.equal(redact('key sk-abcdefghijklmnopqrstuvwx', ['apiKey'], 'label').text, 'key [KEY_1]');
  assert.equal(redact('AKIAIOSFODNN7EXAMPLE', ['apiKey'], 'label').text, '[KEY_1]');
  assert.equal(redact('ghp_1234567890abcdefghijklmnopqrstuvwx', ['apiKey'], 'label').text, '[KEY_1]');

  // The scheme survives, the credential does not.
  assert.equal(
    redact('Authorization: Bearer abcdefgh12345678', ['authHeader'], 'partial').text,
    'Authorization: Bearer ********'
  );
  assert.equal(
    redact('psql postgres://admin:hunter2@db.internal/app', ['urlCredentials'], 'partial').text,
    'psql postgres://***:***@db.internal/app'
  );
  assert.equal(
    redact('GET /login?user=ann&password=hunter2 HTTP/1.1', ['querySecret'], 'partial').text,
    'GET /login?user=ann&password=******** HTTP/1.1'
  );
});

test('a specific detector beats a generic one at the same position', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
  // The middle segment is also a long base64 run; the JWT match must win.
  const result = redact(jwt, ['jwt', 'base64Token', 'hexToken'], 'label');
  assert.equal(result.text, '[JWT_1]');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, 'jwt');
});

test('matches never overlap and are returned in reading order', () => {
  const text = 'ann@example.com 4111111111111111 192.168.0.1 A123456789';
  const result = scan(text, all);
  for (let i = 1; i < result.matches.length; i += 1) {
    const previous = result.matches[i - 1];
    assert.ok(previous.at + previous.length <= result.matches[i].at, 'overlap');
  }
  assert.equal(result.matches.length >= 4, true);
});

test('redaction rebuilds everything that was not a match', () => {
  const text = 'line one\nmail ann@example.com\n\ttab\r\nend 中文 \u{1F600}';
  const result = redact(text, all, 'label');
  assert.ok(result.text.includes('\n\ttab\r\n'));
  assert.ok(result.text.includes('中文 \u{1F600}'));
  assert.ok(!result.text.includes('ann@example.com'));
});

test('nothing to find means the text comes back byte for byte', () => {
  const text = 'a plain log line with no secrets in it';
  const result = redact(text, all, 'label');
  assert.equal(result.text, text);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.counts, {});
});

test('empty input and no detectors are both no-ops', () => {
  assert.equal(redact('', all, 'label').text, '');
  assert.equal(redact('ann@example.com', [], 'label').text, 'ann@example.com');
});

test('oversized input is refused instead of freezing the tab', () => {
  assert.throws(() => scan('x'.repeat(MAX_INPUT + 1), all), InputTooLarge);
  try {
    scan('x'.repeat(MAX_INPUT + 1), all);
  } catch (error) {
    assert.ok(error instanceof InputTooLarge);
    assert.equal(error.length, MAX_INPUT + 1);
  }
});

test('every detector has a label, a linear pattern and a working partial mode', () => {
  for (const detector of DETECTORS) {
    assert.match(detector.label, /^[A-Z0-9]+$/, detector.id);
    assert.ok(detector.pattern.flags.includes('g'), detector.id);
    assert.equal(detectorFor(detector.id), detector);
  }
  const fake = { id: 'email' as DetectorId, at: 0, length: 7, value: 'ann@b.com', ordinal: 2 };
  assert.equal(maskFor(fake, 'label'), '[EMAIL_2]');
  assert.equal(maskFor(fake, 'fixed'), '[REDACTED]');
  assert.equal(maskFor(fake, 'partial'), 'a**@b.com');
});

test('no pattern backtracks: an adversarial input scans to completion', () => {
  // Every detector against text built to be almost-but-not-quite a match. If any
  // pattern had a nested quantifier this would not return.
  const nasty = [
    'a'.repeat(400) + '@' + 'b'.repeat(400),
    '1'.repeat(400),
    '1234-'.repeat(80),
    'eyJ' + 'a'.repeat(400),
    'Bearer ' + 'a'.repeat(400),
    'http://' + 'a'.repeat(200) + ':' + 'b'.repeat(200),
    'token=' + 'a'.repeat(400),
    ('ff:'.repeat(60)),
    '0'.repeat(400) + ' ',
    'A1' + '2'.repeat(400),
  ].join('\n');
  const result = scan(nasty, all);
  assert.ok(Array.isArray(result.matches));
  assert.equal(result.truncated, false);
});

test('segments rebuild the input exactly, tagged by detector', () => {
  const text = 'mail ann@example.com then 192.168.0.1';
  const result = scan(text, ['email', 'ipv4']);
  const parts = segments(text, result.matches);
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.deepEqual(
    parts.filter((part) => part.id !== null).map((part) => part.id),
    ['email', 'ipv4']
  );
  assert.deepEqual(segments('', []), []);
});

test('a realistic log line, end to end', () => {
  const line =
    '2024-03-02T10:14:22Z WARN user ann.lee@example.com (id A123456789, ip 203.0.113.42) card 4111 1111 1111 1111 failed; token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij';
  const result = redact(line, STANDARD_DETECTORS, 'label');
  assert.equal(
    result.text,
    // token=… is caught by the query-secret rule first, which keeps the
    // parameter name so the line still says which credential leaked.
    '2024-03-02T10:14:22Z WARN user [EMAIL_1] (id [TWID_1], ip [IP_1]) card [CARD_1] failed; token=[SECRET_1]'
  );
  // The timestamp is not a phone number, and the date is not an IP.
  assert.equal(result.counts.mobileTw, undefined);
  assert.equal(result.counts.ipv4, 1);
});
