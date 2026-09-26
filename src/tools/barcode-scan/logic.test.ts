import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT,
  KNOWN_FORMATS,
  addScan,
  assessSupport,
  checkGtin,
  classifyPayload,
  formatFamily,
  gtinCheckDigit,
  historyToTsv,
  isbn10CheckDigit,
  isbn10From13,
  parseMeCard,
  parseVCard,
  parseWifi,
  summarizeVCard,
  unescapeVCard,
  unescapeWifi,
  urlWarnings,
  type Scan,
} from './logic.ts';

/* ── Capability ────────────────────────────── */

test('support is reported per capability, not as one yes or no', () => {
  const chromium = assessSupport({
    detector: true,
    formats: ['qr_code', 'ean_13', 'code_128'],
    mediaDevices: true,
    secureContext: true,
  });
  assert.equal(chromium.image, true);
  assert.equal(chromium.camera, true);
  assert.deepEqual(chromium.reasons, []);
  assert.deepEqual(chromium.unknownFormats, []);

  // Safari and Firefox: no detector at all, so neither path works.
  const safari = assessSupport({ detector: false, formats: null, mediaDevices: true, secureContext: true });
  assert.equal(safari.image, false);
  assert.equal(safari.camera, false);
  assert.deepEqual(safari.reasons, ['no-detector']);

  // A detector with no camera still scans a dropped image.
  const noCamera = assessSupport({ detector: true, formats: ['qr_code'], mediaDevices: false, secureContext: true });
  assert.equal(noCamera.image, true);
  assert.equal(noCamera.camera, false);
  assert.deepEqual(noCamera.reasons, ['no-media-devices']);

  // Served over plain http: getUserMedia is refused, the file path is not.
  const insecure = assessSupport({ detector: true, formats: ['qr_code'], mediaDevices: true, secureContext: false });
  assert.equal(insecure.image, true);
  assert.equal(insecure.camera, false);
  assert.deepEqual(insecure.reasons, ['insecure-context']);

  // The format list can be unavailable even when the detector exists.
  const noList = assessSupport({ detector: true, formats: null, mediaDevices: true, secureContext: true });
  assert.deepEqual(noList.reasons, ['formats-unknown']);
  assert.deepEqual(noList.formats, []);
});

test('unfamiliar format names are surfaced rather than dropped', () => {
  const verdict = assessSupport({
    detector: true,
    formats: ['qr_code', 'rss_14', ''],
    mediaDevices: true,
    secureContext: true,
  });
  assert.deepEqual(verdict.formats, ['qr_code', 'rss_14']);
  assert.deepEqual(verdict.unknownFormats, ['rss_14']);
});

test('formats are grouped into the families that matter when aiming', () => {
  assert.equal(formatFamily('qr_code'), '2d');
  assert.equal(formatFamily('data_matrix'), '2d');
  assert.equal(formatFamily('ean_13'), '1d');
  assert.equal(formatFamily('itf'), '1d');
  assert.equal(formatFamily('unknown'), 'unknown');
  assert.equal(formatFamily('nonsense'), 'unknown');
  for (const format of KNOWN_FORMATS) {
    if (format === 'unknown') continue;
    assert.notEqual(formatFamily(format), 'unknown', `${format} should have a family`);
  }
});

/* ── Check digits ──────────────────────────── */

test('GTIN check digits match published barcodes', () => {
  // EAN-13 from the ISO example, UPC-A from a supermarket tin, EAN-8, GTIN-14.
  assert.equal(gtinCheckDigit('400638133393'), 1);
  assert.equal(gtinCheckDigit('03600029145'), 2);
  assert.equal(gtinCheckDigit('7351353'), 7);
  assert.equal(gtinCheckDigit('978030640615'), 7);
  assert.equal(gtinCheckDigit('1001234567890'), 2);
  // A body of zeros has check digit zero, which is the degenerate case.
  assert.equal(gtinCheckDigit('000000000000'), 0);
  assert.throws(() => gtinCheckDigit('12a'), Error);
});

test('checkGtin reports the expected digit when the given one is wrong', () => {
  assert.deepEqual(checkGtin('4006381333931'), {
    kind: 'GTIN-13',
    valid: true,
    expected: 1,
    given: 1,
  });
  assert.deepEqual(checkGtin('4006381333932'), {
    kind: 'GTIN-13',
    valid: false,
    expected: 1,
    given: 2,
  });
  assert.equal(checkGtin('73513537')?.kind, 'GTIN-8');
  assert.equal(checkGtin('036000291452')?.kind, 'GTIN-12');
  assert.equal(checkGtin('10012345678902')?.kind, 'GTIN-14');
  // Lengths that are not a GTIN, and non-digits, are not forced into one.
  assert.equal(checkGtin('123456789'), null);
  assert.equal(checkGtin(''), null);
  assert.equal(checkGtin('4006381333A1'), null);
});

test('ISBN-10 check characters follow the modulo-11 rule, X included', () => {
  // 0306406152 (Dover) — 130 mod 11 is 9, so the check digit is 2.
  assert.equal(isbn10CheckDigit('030640615'), '2');
  // 199 mod 11 is 1, so the remainder is ten and prints as X.
  assert.equal(isbn10CheckDigit('043942089'), 'X');
  // The degenerate body: a sum of zero checks as zero, not as eleven.
  assert.equal(isbn10CheckDigit('000000000'), '0');
  assert.throws(() => isbn10CheckDigit('12345678'), Error);
  assert.throws(() => isbn10CheckDigit('12345678X'), Error);
});

test('an ISBN-13 converts back only when it came from a 978 block', () => {
  assert.equal(isbn10From13('9780306406157'), '0306406152');
  // 979 was allocated after ISBN-10 ran out: there is no ten-digit form.
  assert.equal(isbn10From13('9791234567896'), null);
  // A bad check digit is not converted either.
  assert.equal(isbn10From13('9780306406158'), null);
  assert.equal(isbn10From13('4006381333931'), null);
  assert.equal(isbn10From13('123'), null);
});

/* ── WiFi ──────────────────────────────────── */

test('a WiFi payload parses back to its fields', () => {
  assert.deepEqual(parseWifi('WIFI:T:WPA;S:Cafe;P:pw123456;;'), {
    ssid: 'Cafe',
    password: 'pw123456',
    auth: 'WPA',
    hidden: false,
    extras: [],
  });
  assert.deepEqual(parseWifi('WIFI:S:Open;;'), {
    ssid: 'Open',
    password: '',
    auth: 'nopass',
    hidden: false,
    extras: [],
  });
  assert.equal(parseWifi('WIFI:T:WPA;S:x;H:true;;')?.hidden, true);
  assert.equal(parseWifi('WIFI:T:WPA;S:x;H:false;;')?.hidden, false);
  assert.equal(parseWifi('https://example.com'), null);
  assert.equal(parseWifi(''), null);
});

test('escaped separators in an SSID or password survive the parse', () => {
  const info = parseWifi('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;H:true;;');
  assert.equal(info?.ssid, 'a;b,c:d"e\\f');
  assert.equal(info?.password, 'p;w');
  assert.equal(unescapeWifi('\\:\\;\\,\\"\\\\'), ':;,"\\');
  assert.equal(unescapeWifi('plain'), 'plain');
  // A trailing lone backslash is kept rather than eating the terminator.
  assert.equal(unescapeWifi('abc\\'), 'abc\\');
});

test('field order does not matter and unknown keys are reported', () => {
  const info = parseWifi('WIFI:S:名字;P:密碼;T:WPA;I:eap-identity;;');
  assert.equal(info?.ssid, '名字');
  assert.equal(info?.password, '密碼');
  assert.equal(info?.auth, 'WPA');
  assert.deepEqual(info?.extras, ['I']);
  // A password containing a colon is not truncated at it.
  assert.equal(parseWifi('WIFI:T:WPA;S:x;P:a:b;;')?.password, 'a:b');
  assert.equal(parseWifi('wifi:t:wpa;s:lower;;')?.ssid, 'lower');
});

/* ── vCard ─────────────────────────────────── */

const CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:陳;小明;;;',
  'FN:小明 陳',
  'ORG:Acme\\, Inc.;Hardware',
  'TITLE:Engineer',
  'TEL;TYPE=CELL:0912345678',
  'TEL;TYPE=WORK:0223456789',
  'EMAIL;TYPE=INTERNET:ming@example.com',
  'ADR;TYPE=WORK:;;信義路 1 段 1 號;台北市;;110;台灣',
  'NOTE:line1\\nline2',
  'END:VCARD',
].join('\r\n');

test('a vCard parses to properties and summarises to the fields people read', () => {
  const properties = parseVCard(CARD);
  assert.ok(properties);
  assert.equal(properties.length, 10);
  assert.deepEqual(properties[0], { name: 'VERSION', params: [], value: '3.0' });
  assert.deepEqual(properties[5].params, ['TYPE=CELL']);

  const summary = summarizeVCard(properties);
  assert.equal(summary.name, '小明 陳');
  assert.equal(summary.organization, 'Acme, Inc. / Hardware');
  assert.equal(summary.title, 'Engineer');
  assert.deepEqual(summary.phones, ['0912345678', '0223456789']);
  assert.deepEqual(summary.emails, ['ming@example.com']);
  assert.deepEqual(summary.addresses, ['信義路 1 段 1 號 台北市 110 台灣']);
  assert.equal(summary.note, 'line1\nline2');
  assert.equal(parseVCard('not a card'), null);
});

test('folded lines are rejoined before anything is read', () => {
  const folded = 'BEGIN:VCARD\r\nFN:A very long display\r\n  name here\r\nEND:VCARD';
  const properties = parseVCard(folded);
  assert.equal(properties?.[0].value, 'A very long display name here');
});

test('a card with no FN falls back to the structured name', () => {
  const summary = summarizeVCard(parseVCard('BEGIN:VCARD\nN:Chen;Ming;;;\nEND:VCARD') ?? []);
  assert.equal(summary.name, 'Ming Chen');
  const empty = summarizeVCard([]);
  assert.equal(empty.name, '');
  assert.deepEqual(empty.phones, []);
  assert.equal(unescapeVCard('a\\\\b\\,c\\;d\\ne\\Nf'), 'a\\b,c;d\ne\nf');
  assert.equal(unescapeVCard('trailing\\'), 'trailing\\');
});

test('MECARD parses to the same shape as a vCard', () => {
  const summary = parseMeCard('MECARD:N:陳,小明;TEL:0912345678;EMAIL:a@b.c;ORG:Acme;;');
  assert.equal(summary?.name, '小明 陳');
  assert.deepEqual(summary?.phones, ['0912345678']);
  assert.deepEqual(summary?.emails, ['a@b.c']);
  assert.equal(summary?.organization, 'Acme');
  assert.equal(parseMeCard('BEGIN:VCARD'), null);
});

/* ── URL risk ──────────────────────────────── */

test('a plain https link raises nothing', () => {
  assert.deepEqual(urlWarnings('https://example.com/path?a=1'), []);
  assert.deepEqual(urlWarnings('https://example.com:443/'), []);
  assert.deepEqual(urlWarnings('not a url at all'), []);
});

test('the things a careful reader would notice are reported', () => {
  assert.deepEqual(urlWarnings('http://example.com'), ['no-tls']);
  assert.deepEqual(urlWarnings('https://user:pw@example.com'), ['userinfo']);
  // The URL parser punycodes an internationalised host, which is the tell.
  assert.deepEqual(urlWarnings('https://пример.example/'), ['punycode']);
  assert.deepEqual(urlWarnings('https://192.168.1.1/admin'), ['ip-host']);
  assert.deepEqual(urlWarnings('https://[::1]/'), ['ip-host']);
  assert.deepEqual(urlWarnings('https://example.com:8443/'), ['unusual-port']);
  assert.deepEqual(urlWarnings('market://details?id=x'), ['non-web-scheme']);
  assert.ok(urlWarnings(`https://example.com/${'a'.repeat(600)}`).includes('very-long'));
  // Several at once, in one list.
  assert.deepEqual(urlWarnings('http://a:b@10.0.0.1:8080/'), [
    'no-tls',
    'userinfo',
    'ip-host',
    'unusual-port',
  ]);
});

/* ── Classification ────────────────────────── */

test('QR payload types are recognised from their prefixes', () => {
  const wifi = classifyPayload('WIFI:T:WPA;S:Cafe;P:secret;;');
  assert.equal(wifi.kind, 'wifi');
  if (wifi.kind === 'wifi') assert.equal(wifi.wifi.ssid, 'Cafe');

  const contact = classifyPayload(CARD);
  assert.equal(contact.kind, 'contact');
  if (contact.kind === 'contact') {
    assert.equal(contact.source, 'vcard');
    assert.equal(contact.contact.name, '小明 陳');
  }

  const meCard = classifyPayload('MECARD:N:Chen,Ming;TEL:0912;;');
  assert.equal(meCard.kind, 'contact');
  if (meCard.kind === 'contact') assert.equal(meCard.source, 'mecard');

  const url = classifyPayload('https://example.com');
  assert.equal(url.kind, 'url');
  if (url.kind === 'url') assert.deepEqual(url.warnings, []);

  const mail = classifyPayload('mailto:a%40b.c?subject=Hi%20there&body=Text');
  assert.equal(mail.kind, 'mailto');
  if (mail.kind === 'mailto') {
    assert.equal(mail.address, 'a@b.c');
    assert.equal(mail.subject, 'Hi there');
    assert.equal(mail.body, 'Text');
  }

  const tel = classifyPayload('tel:+886912345678');
  assert.equal(tel.kind, 'tel');
  if (tel.kind === 'tel') assert.equal(tel.number, '+886912345678');

  const sms = classifyPayload('smsto:0912345678:hello');
  assert.equal(sms.kind, 'sms');
  if (sms.kind === 'sms') {
    assert.equal(sms.number, '0912345678');
    assert.equal(sms.body, 'hello');
  }
  const sms2 = classifyPayload('sms:0912345678?body=hi');
  if (sms2.kind === 'sms') assert.equal(sms2.body, 'hi');

  const geo = classifyPayload('geo:25.033,121.5654?z=17');
  assert.equal(geo.kind, 'geo');
  if (geo.kind === 'geo') {
    assert.equal(geo.latitude, 25.033);
    assert.equal(geo.longitude, 121.5654);
  }

  const otp = classifyPayload('otpauth://totp/Acme:ming@example.com?secret=ABC&issuer=Acme');
  assert.equal(otp.kind, 'otp');
  if (otp.kind === 'otp') {
    assert.equal(otp.issuer, 'Acme');
    assert.equal(otp.account, 'ming@example.com');
  }

  const calendar = classifyPayload('BEGIN:VEVENT\r\nSUMMARY:Standup\r\nDTSTART:20260101T090000Z\r\nEND:VEVENT');
  assert.equal(calendar.kind, 'calendar');
  if (calendar.kind === 'calendar') {
    assert.equal(calendar.properties.length, 2);
    assert.equal(calendar.properties[0].value, 'Standup');
  }
});

test('a bare digit string is read as a GTIN, with the ISBN when there is one', () => {
  const isbn = classifyPayload('9780306406157');
  assert.equal(isbn.kind, 'gtin');
  if (isbn.kind === 'gtin') {
    assert.equal(isbn.verdict.valid, true);
    assert.equal(isbn.isbn10, '0306406152');
  }
  const broken = classifyPayload('4006381333932');
  if (broken.kind === 'gtin') {
    assert.equal(broken.verdict.valid, false);
    assert.equal(broken.verdict.expected, 1);
    assert.equal(broken.isbn10, null);
  }
});

test('text that merely looks like an address stays text', () => {
  // No scheme, no guessing: turning this into a link is how a typo becomes a
  // visit to someone else's domain.
  assert.deepEqual(classifyPayload('example.com'), { kind: 'text', text: 'example.com' });
  assert.deepEqual(classifyPayload('  '), { kind: 'text', text: '  ' });
  assert.equal(classifyPayload('ABC-123-XYZ').kind, 'text');
  assert.equal(classifyPayload('123456789').kind, 'text');
  assert.equal(classifyPayload('中文內容').kind, 'text');
  // An unrecognised scheme is still reported as a link, with the warning.
  const custom = classifyPayload('myapp://do/thing');
  assert.equal(custom.kind, 'url');
  if (custom.kind === 'url') assert.deepEqual(custom.warnings, ['non-web-scheme']);
});

/* ── History ───────────────────────────────── */

test('repeated readings of one code bump a counter instead of piling up', () => {
  let history: Scan[] = [];
  history = addScan(history, { value: 'A', format: 'qr_code' });
  history = addScan(history, { value: 'A', format: 'qr_code' });
  history = addScan(history, { value: 'A', format: 'qr_code' });
  assert.equal(history.length, 1);
  assert.equal(history[0].count, 3);

  history = addScan(history, { value: 'B', format: 'qr_code' });
  assert.deepEqual(history.map((entry) => entry.value), ['B', 'A']);
  // The same text from a different symbology is a different reading.
  history = addScan(history, { value: 'A', format: 'code_128' });
  assert.equal(history.length, 3);
  // A repeat does not reorder the list under the reader's finger.
  history = addScan(history, { value: 'A', format: 'qr_code' });
  assert.deepEqual(history.map((entry) => entry.value), ['A', 'B', 'A']);
  assert.equal(history[2].count, 4);
});

test('the history is capped and the oldest entry falls off', () => {
  let history: Scan[] = [];
  for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
    history = addScan(history, { value: `v${i}`, format: 'qr_code' });
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].value, `v${HISTORY_LIMIT + 9}`);
  assert.equal(history[HISTORY_LIMIT - 1].value, 'v10');
  // A limit of zero still keeps the reading that just came in.
  assert.equal(addScan([], { value: 'x', format: 'qr_code' }, 0).length, 1);
});

test('the TSV export keeps one reading per row', () => {
  const history = [
    { value: 'https://example.com', format: 'qr_code', count: 2 },
    { value: 'line\nbreak\there', format: 'code_128', count: 1 },
  ];
  const rows = historyToTsv(history).split('\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[0], 'format\tcount\tvalue');
  assert.equal(rows[1], 'qr_code\t2\thttps://example.com');
  assert.equal(rows[2], 'code_128\t1\tline break here');
  assert.equal(historyToTsv([]), 'format\tcount\tvalue');
});
