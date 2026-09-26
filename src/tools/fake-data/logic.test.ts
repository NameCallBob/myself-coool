import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_CODES,
  CARD_SHAPES,
  CITIES,
  DEFAULTS,
  EMAIL_DOMAINS,
  FIELDS,
  ID_LETTERS,
  MAX_ROWS,
  address,
  businessSum,
  cardNumber,
  chineseName,
  emailFor,
  englishName,
  generateRow,
  generateRows,
  idLetterCode,
  isLuhnValid,
  isTwBusinessValid,
  isTwIdValid,
  isoDate,
  landlineNumber,
  loremCjk,
  loremLatin,
  luhnCheckDigit,
  mobileNumber,
  toCsv,
  toJson,
  toLines,
  twBusinessNumber,
  twIdChecksum,
  twIdNumber,
  uuidV4,
  type FieldId,
  type Rng,
} from './logic.ts';

/**
 * A seeded counter standing in for `below`. Not random and not meant to be:
 * every case below has to be reproducible, and Math.random is banned here.
 */
function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return (max: number) => {
    state = (state * 1103515245 + 12345) >>> 0;
    return (state >>> 8) % max;
  };
}

test('Luhn, against published test numbers', () => {
  assert.equal(luhnCheckDigit('7992739871'), 3); // the Wikipedia worked example
  assert.equal(isLuhnValid('79927398713'), true);
  assert.equal(isLuhnValid('79927398710'), false);
  assert.equal(isLuhnValid('4111111111111111'), true); // the classic Visa test card
  assert.equal(isLuhnValid('4111 1111 1111 1111'), true); // spacing ignored
  assert.equal(isLuhnValid('4111-1111-1111-1112'), false);
  assert.equal(isLuhnValid('378282246310005'), true); // Amex test number
  assert.equal(isLuhnValid('not a number'), false);
  assert.equal(isLuhnValid(''), false);
});

test('every generated card number passes Luhn and has its brand shape', () => {
  const rng = seeded(7);
  for (const brand of ['visa', 'mastercard', 'amex', 'jcb'] as const) {
    for (let i = 0; i < 40; i += 1) {
      const grouped = cardNumber(brand, rng);
      const plain = grouped.replace(/ /g, '');
      assert.equal(plain.length, CARD_SHAPES[brand].length, `${brand} length`);
      assert.equal(isLuhnValid(plain), true, `${brand} ${plain}`);
      assert.ok(
        CARD_SHAPES[brand].prefixes.some((prefix) => plain.startsWith(prefix)),
        `${brand} prefix ${plain}`
      );
    }
  }
  // Grouping is presentation only.
  assert.match(cardNumber('visa', seeded(1)), /^\d{4} \d{4} \d{4} \d{4}$/);
  assert.match(cardNumber('amex', seeded(1)), /^\d{4} \d{6} \d{5}$/);
  assert.match(cardNumber('visa', seeded(1), false), /^\d{16}$/);
});

test('the 身分證 letter table maps to 10-35 in the published order', () => {
  assert.equal(ID_LETTERS.length, 26);
  assert.equal(idLetterCode('A'), 10);
  assert.equal(idLetterCode('H'), 17);
  assert.equal(idLetterCode('I'), 34);
  assert.equal(idLetterCode('O'), 35);
  assert.equal(idLetterCode('W'), 32);
  assert.equal(idLetterCode('Z'), 33);
  assert.equal(idLetterCode('a'), 10);
  assert.equal(idLetterCode('1'), null);
  // Every letter has a distinct code in 10..35.
  const codes = new Set([...ID_LETTERS].map((letter) => idLetterCode(letter)));
  assert.equal(codes.size, 26);
});

test('身分證字號 checksum, against a known-valid number', () => {
  assert.equal(twIdChecksum('A', '12345678'), 9); // A123456789 is the textbook case
  assert.equal(isTwIdValid('A123456789'), true);
  assert.equal(isTwIdValid('A123456788'), false);
  assert.equal(isTwIdValid('a123456789'), true); // case folded
  assert.equal(isTwIdValid('A12345678'), false); // too short
  assert.equal(isTwIdValid('1123456789'), false);
  assert.equal(twIdChecksum('A', '1234567'), null);
  assert.equal(twIdChecksum('1', '12345678'), null);
});

test('every generated 身分證字號 validates', () => {
  const rng = seeded(99);
  for (let i = 0; i < 300; i += 1) {
    const id = twIdNumber(rng);
    assert.match(id, /^[A-Z][12]\d{8}$/, id);
    assert.equal(isTwIdValid(id), true, id);
  }
});

test('統一編號 checksum, against real published numbers', () => {
  assert.equal(businessSum('04595257'), 40); // TSMC — a public company number
  assert.equal(isTwBusinessValid('04595257'), true);
  assert.equal(isTwBusinessValid('04595258'), false);
  assert.equal(businessSum('1234567'), null); // seven digits is not a 統編
  assert.equal(isTwBusinessValid('abcdefgh'), false);
});

test('every generated 統一編號 is valid under both the old and new rules', () => {
  const rng = seeded(5);
  for (let i = 0; i < 300; i += 1) {
    const number = twBusinessNumber(rng);
    assert.match(number, /^\d{8}$/, number);
    const sum = businessSum(number);
    assert.ok(sum !== null);
    assert.equal(sum % 10, 0, `${number} sum ${sum}`); // the pre-2023 rule
    assert.equal(isTwBusinessValid(number), true, number); // and the current one
    assert.notEqual(number[6], '7'); // the special case is never relied on
  }
});

test('UUID v4 has its version and variant bits set', () => {
  const rng = seeded(42);
  for (let i = 0; i < 100; i += 1) {
    const uuid = uuidV4(rng);
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, uuid);
  }
  // Two draws differ: the generator is consuming randomness, not a constant.
  const twice = seeded(3);
  assert.notEqual(uuidV4(twice), uuidV4(twice));
});

test('phone numbers use real Taiwanese shapes', () => {
  const rng = seeded(11);
  for (let i = 0; i < 100; i += 1) {
    assert.match(mobileNumber(rng), /^09\d{2}-\d{3}-\d{3}$/);
  }
  for (let i = 0; i < 200; i += 1) {
    const landline = landlineNumber(rng);
    const [area, ...rest] = landline.split('-');
    const known = AREA_CODES.find((entry) => entry.code === area);
    assert.ok(known, landline);
    assert.equal(rest.join('').length, known.length, landline);
  }
});

test('an address never pairs a district with the wrong city', () => {
  const rng = seeded(21);
  for (let i = 0; i < 200; i += 1) {
    const full = address(rng);
    const place = CITIES.find((entry) => full.startsWith(entry.city));
    assert.ok(place, full);
    assert.ok(
      place.districts.some((district) => full.startsWith(place.city + district)),
      full
    );
    assert.match(full, /\d+號/);
  }
});

test('names look like names', () => {
  const rng = seeded(4);
  for (let i = 0; i < 100; i += 1) {
    const zh = chineseName(rng);
    assert.ok([...zh].length >= 2 && [...zh].length <= 4, zh);
    assert.match(zh, /^[\p{Script=Han}]+$/u, zh);
  }
  const en = englishName(seeded(8));
  assert.equal(en.full, `${en.first} ${en.last}`);
  assert.match(en.full, /^[A-Za-z]+ [A-Za-z]+$/);
});

test('e-mail addresses can only ever be undeliverable', () => {
  const rng = seeded(13);
  for (let i = 0; i < 200; i += 1) {
    const person = englishName(rng);
    const email = emailFor(person, rng);
    const domain = email.split('@')[1];
    assert.ok(EMAIL_DOMAINS.includes(domain), email);
    assert.match(email, /^[a-z0-9.]+@[a-z.]+$/, email);
  }
  // Every domain is a reserved name, so none of them can be registered.
  for (const domain of EMAIL_DOMAINS) {
    assert.match(domain, /(^|\.)(example\.(com|org|net)|example|invalid|test|localhost)$/);
  }
});

test('dates are real dates, inside the range, including February', () => {
  const rng = seeded(17);
  for (let i = 0; i < 400; i += 1) {
    const date = isoDate(rng, 2019, 2025);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, date);
    const [year, month, day] = date.split('-').map(Number);
    assert.ok(year >= 2019 && year <= 2025, date);
    // Parsing it back must give the same day: 2021-02-30 would roll over.
    const back = new Date(Date.UTC(year, month - 1, day));
    assert.equal(back.getUTCDate(), day, date);
    assert.equal(back.getUTCMonth() + 1, month, date);
  }
  // A reversed range is accepted rather than producing nothing.
  assert.match(isoDate(seeded(1), 2025, 2019), /^20(19|2[0-5])-/);
  assert.match(isoDate(seeded(1), 2000, 2000), /^2000-/);
});

test('filler text has the shape of prose', () => {
  const latin = loremLatin(10, seeded(2));
  assert.match(latin, /^[A-Z][a-z]+( [a-z]+){9}\.$/);
  assert.equal(loremLatin(0, seeded(2)).split(' ').length, 1); // clamped to one word

  const cjk = loremCjk(8, seeded(2));
  assert.match(cjk, /^[\p{Script=Han}，]+。$/u);
  assert.ok([...cjk].length >= 9);
});

test('rows carry exactly the requested fields, and the e-mail matches the name', () => {
  const fields: FieldId[] = ['nameEn', 'email', 'mobile'];
  const row = generateRow(fields, seeded(6));
  assert.deepEqual(Object.keys(row).sort(), ['email', 'mobile', 'nameEn']);
  const last = row.nameEn!.split(' ')[1].toLowerCase();
  const first = row.nameEn!.split(' ')[0].toLowerCase();
  assert.ok(
    row.email!.includes(last) || row.email!.includes(first),
    `${row.nameEn} / ${row.email}`
  );
});

test('every field id in the catalogue actually produces a value', () => {
  const row = generateRow(FIELDS, seeded(31));
  for (const field of FIELDS) {
    assert.ok((row[field] ?? '').length > 0, field);
  }
});

test('row counts are clamped rather than trusted', () => {
  assert.equal(generateRows(['uuid'], 5, seeded(1)).length, 5);
  assert.equal(generateRows(['uuid'], 0, seeded(1)).length, 0);
  assert.equal(generateRows(['uuid'], -3, seeded(1)).length, 0);
  assert.equal(generateRows(['uuid'], MAX_ROWS + 500, seeded(1)).length, MAX_ROWS);
  assert.equal(generateRows(['uuid'], 2.7, seeded(1)).length, 2);
  assert.deepEqual(generateRows([], 3, seeded(1)), [{}, {}, {}]);
});

test('CSV quoting follows RFC 4180, and only when it has to', () => {
  const rows = [
    { nameZh: '陳小明', address: '臺北市中正區中山路1號' },
    { nameZh: 'a,b', address: 'says "hi"' },
    { nameZh: 'line\nbreak', address: '' },
  ];
  const fields: FieldId[] = ['nameZh', 'address'];
  const csv = toCsv(rows, fields);
  assert.equal(
    csv,
    'nameZh,address\n陳小明,臺北市中正區中山路1號\n"a,b","says ""hi"""\n"line\nbreak",'
  );
  assert.equal(toCsv(rows, fields, false).startsWith('陳小明'), true);
  assert.equal(toCsv([], fields), 'nameZh,address');
});

test('JSON and tab output round trip the rows', () => {
  const rows = generateRows(['nameZh', 'uuid'], 3, seeded(9));
  const parsed = JSON.parse(toJson(rows)) as Record<string, string>[];
  assert.deepEqual(parsed, rows);
  const lines = toLines(rows, ['nameZh', 'uuid']).split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].split('\t')[1], rows[0].uuid);
});

test('the same seed gives the same data, a different seed does not', () => {
  const a = generateRows(FIELDS, 3, seeded(123), DEFAULTS);
  const b = generateRows(FIELDS, 3, seeded(123), DEFAULTS);
  const c = generateRows(FIELDS, 3, seeded(124), DEFAULTS);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('options reach the generators they belong to', () => {
  const row = generateRow(['card', 'date', 'loremEn'], seeded(2), {
    ...DEFAULTS,
    brand: 'amex',
    startYear: 2001,
    endYear: 2001,
    loremWords: 3,
    groupCard: false,
  });
  assert.match(row.card!, /^3[47]\d{13}$/);
  assert.match(row.date!, /^2001-/);
  assert.equal(row.loremEn!.split(' ').length, 3);
});
