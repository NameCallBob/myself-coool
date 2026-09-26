import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_CODES,
  BATCH_LIMIT,
  LETTER_PLACES,
  LETTER_VALUES,
  formatAreaTable,
  idCheckDigit,
  letterPair,
  normalise,
  parseAreaTable,
  validateBatch,
  validateLandline,
  validateMobile,
  validateTwId,
  validateVat,
} from './logic.ts';

/* ── Normalising ──────────────────────────── */

test('full-width characters fold to ASCII and separators drop out', () => {
  assert.equal(normalise('Ａ１２３４５６７８９'), 'A123456789');
  assert.equal(normalise('a123456789'), 'A123456789');
  assert.equal(normalise('A1 2345-6789'), 'A123456789');
  assert.equal(normalise('0912-345-678'), '0912345678');
  assert.equal(normalise('(02) 2345 6789'), '0223456789');
  assert.equal(normalise('統編:22099131'), '22099131');
  assert.equal(normalise(''), '');
  assert.equal(normalise('　'), '', 'an ideographic space is a separator');
});

/* ── The letter table ─────────────────────── */

test('the letter table is the published one, including the two out of order', () => {
  assert.equal(LETTER_VALUES.A, 10);
  assert.equal(LETTER_VALUES.H, 17);
  assert.equal(LETTER_VALUES.I, 34, 'Chiayi City was numbered after Z');
  assert.equal(LETTER_VALUES.O, 35, 'Hsinchu City likewise');
  assert.equal(LETTER_VALUES.W, 32);
  assert.equal(LETTER_VALUES.X, 30);
  assert.equal(LETTER_VALUES.Y, 31);
  assert.equal(LETTER_VALUES.Z, 33);
  assert.equal(Object.keys(LETTER_VALUES).length, 26);
  // Every letter has a place name, and the values are all distinct.
  assert.equal(Object.keys(LETTER_PLACES).length, 26);
  assert.equal(new Set(Object.values(LETTER_VALUES)).size, 26);
});

test('letterPair splits the value into its two digits', () => {
  assert.deepEqual(letterPair('A'), [1, 0]);
  assert.deepEqual(letterPair('I'), [3, 4]);
  assert.deepEqual(letterPair('Z'), [3, 3]);
  assert.equal(letterPair('1'), null);
  assert.equal(letterPair(''), null);
});

/* ── National ID, against known numbers ───── */

test('the canonical valid national IDs pass', () => {
  // A123456789 sums to 130 by hand: 1 + 0 + 8 + 14 + 18 + 20 + 20 + 18 + 14 + 8 + 9.
  const a = validateTwId('A123456789');
  assert.equal(a.ok, true);
  assert.equal(a.kind, 'national');
  assert.equal(a.gender, 'male');
  assert.equal(a.letter, 'A');
  assert.equal(a.expectedCheck, 9);

  assert.equal(validateTwId('A100000001').ok, true);
  assert.equal(validateTwId('F131104093').ok, true);
});

test('changing the letter breaks the checksum', () => {
  const b = validateTwId('B123456789');
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'checksum');
  assert.equal(b.expectedCheck, 0, 'it would be valid ending in 0');
  assert.equal(validateTwId('B123456780').ok, true);
});

test('the second digit is the gender and only 1 or 2 is a national ID', () => {
  assert.equal(validateTwId('A223456781').gender, 'female');
  assert.equal(validateTwId('A223456781').kind, 'national');
  assert.equal(validateTwId('A323456789').reason, 'shape');
  assert.equal(validateTwId('A023456789').reason, 'shape');
});

test('a single wrong digit anywhere is caught', () => {
  for (let position = 1; position <= 9; position += 1) {
    const original = 'A123456789';
    const digit = Number(original[position]);
    const swapped = `${original.slice(0, position)}${(digit + 1) % 10}${original.slice(position + 1)}`;
    if (position === 1 && !/[12]/.test(swapped[1])) continue;
    assert.equal(validateTwId(swapped).ok, false, swapped);
  }
});

test('length and shape failures are named, not reported as bad checksums', () => {
  assert.equal(validateTwId('').reason, 'empty');
  assert.equal(validateTwId('   ').reason, 'empty');
  assert.equal(validateTwId('A12345678').reason, 'length');
  assert.equal(validateTwId('A1234567890').reason, 'length');
  assert.equal(validateTwId('1123456789').reason, 'shape', 'no leading letter');
  assert.equal(validateTwId('A12345678X').reason, 'shape', 'the check digit must be a digit');
});

/* ── Resident numbers ─────────────────────── */

test('the 2021 resident format shares the national algorithm, with 8 and 9 for gender', () => {
  // Built from the same weights: A8 then digits, so the check digit is fixed.
  const stem = 'A80000000';
  const check = idCheckDigit(stem);
  assert.notEqual(check, null);
  const result = validateTwId(`${stem}${check}`);
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'resident-2021');
  assert.equal(result.gender, 'male');
  assert.equal(validateTwId(`A90000000${idCheckDigit('A90000000')}`).gender, 'female');
});

test('the legacy resident format takes the second letter as one digit', () => {
  // Worked by hand from the published weights: A → (1,0), B → 11 → units 1, so
  // 1·1 + 0·9 + 1·8 + 1·7 + 2·6 + 3·5 + 4·4 + 5·3 + 6·2 + 7·1 = 93, check 7.
  const result = validateTwId('AB12345677');
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'resident-legacy');
  assert.equal(result.gender, null, 'the legacy format does not encode gender');
  assert.equal(validateTwId('AB12345678').ok, false);
  // A different second letter changes the sum, and therefore the check digit.
  assert.equal(validateTwId('AC12345677').ok, false);
  assert.equal(validateTwId('AC12345679').ok, true);
});

test('only 1, 2, 8, 9 or a letter can follow the first letter', () => {
  for (const second of ['0', '3', '4', '5', '6', '7']) {
    assert.equal(validateTwId(`A${second}23456789`).reason, 'shape', second);
  }
  for (const second of ['1', '2', '8', '9', 'B']) {
    assert.notEqual(validateTwId(`A${second}23456789`).reason, 'shape', second);
  }
  // Punctuation is treated as a separator, so it shortens the string instead.
  assert.equal(validateTwId('A_12345678').reason, 'length');
});

test('idCheckDigit needs exactly nine characters', () => {
  assert.equal(idCheckDigit('A12345678'), 9);
  assert.equal(idCheckDigit('A1234567'), null);
  assert.equal(idCheckDigit('A123456789'), null);
  // And the digit it returns always validates.
  for (const stem of ['A12345678', 'Z21234567', 'AB1234567', 'O81234567']) {
    const check = idCheckDigit(stem);
    assert.notEqual(check, null, stem);
    assert.equal(validateTwId(`${stem}${check}`).ok, true, stem);
  }
});

/* ── Business number ──────────────────────── */

test('real business numbers pass, with the sum shown', () => {
  // 2·1 + 2·2 + 0 + 9·2→9 + 9 + 1·2 + 3·4→3 + 1 = 30.
  const tsmc = validateVat('22099131');
  assert.equal(tsmc.ok, true);
  assert.equal(tsmc.sum, 30);
  assert.equal(tsmc.legacyOk, true);
  assert.equal(validateVat('04541302').ok, true);
  assert.equal(validateVat('96979933').ok, true);
});

test('the seventh-digit-is-7 rule gives a number two acceptable totals', () => {
  const result = validateVat('12345675');
  assert.equal(result.sevenRule, true);
  assert.equal(result.sum, 39);
  assert.equal(result.ok, true, '39 is not a multiple of 5, but 40 is');
  const plain = validateVat('22099131');
  assert.equal(plain.sevenRule, false);
});

test('a number valid under the 2023 mod-5 rule but not the old mod-10 rule', () => {
  const result = validateVat('10000004');
  assert.equal(result.sum, 5);
  assert.equal(result.ok, true, 'mod 5');
  assert.equal(result.legacyOk, false, 'a system still checking mod 10 rejects it');
});

test('invalid business numbers', () => {
  assert.equal(validateVat('12345678').ok, false);
  assert.equal(validateVat('12345678').reason, 'checksum');
  assert.equal(validateVat('').reason, 'empty');
  assert.equal(validateVat('1234567').reason, 'length');
  assert.equal(validateVat('123456789').reason, 'length');
  assert.equal(validateVat('1234567A').reason, 'shape');
  assert.equal(validateVat('00000000').ok, true, 'all zeros satisfies the arithmetic');
});

test('a business number survives being pasted with separators', () => {
  assert.equal(validateVat(' 2209-9131 ').ok, true);
  assert.equal(validateVat('２２０９９１３１').ok, true);
});

/* ── Mobile ───────────────────────────────── */

test('mobile numbers are format-checked and reformatted three ways', () => {
  const result = validateMobile('0912345678');
  assert.equal(result.ok, true);
  assert.equal(result.national, '0912345678');
  assert.equal(result.international, '+886912345678');
  assert.equal(result.pretty, '0912-345-678');
});

test('the +886 and 886 forms fold to the local form', () => {
  assert.equal(validateMobile('+886912345678').national, '0912345678');
  assert.equal(validateMobile('886-912-345-678').national, '0912345678');
  assert.equal(validateMobile('886912345678').ok, true);
});

test('mobile failures are named', () => {
  assert.equal(validateMobile('').reason, 'empty');
  assert.equal(validateMobile('0912-345-67A').reason, 'shape');
  assert.equal(validateMobile('0812345678').reason, 'prefix');
  assert.equal(validateMobile('091234567').reason, 'length');
  assert.equal(validateMobile('09123456789').reason, 'length');
});

/* ── Landline ─────────────────────────────── */

test('the area-code table is longest-prefix matched', () => {
  const taipei = validateLandline('0223456789');
  assert.equal(taipei.ok, true);
  assert.equal(taipei.area?.code, '02');
  assert.equal(taipei.local, '23456789');
  assert.equal(taipei.pretty, '02-23456789');
  assert.equal(taipei.international, '+886-2-23456789');

  // 0836 must beat 08, or a Matsu number becomes a Pingtung number.
  const matsu = validateLandline('083612345');
  assert.equal(matsu.area?.code, '0836');
  assert.equal(matsu.local, '12345');

  const kinmen = validateLandline('082123456');
  assert.equal(kinmen.area?.code, '082');

  // 037 must beat 03.
  const miaoli = validateLandline('037123456');
  assert.equal(miaoli.area?.code, '037');
  assert.equal(miaoli.ok, true);

  const taoyuan = validateLandline('0312345678'.slice(0, 10));
  assert.equal(taoyuan.area?.code, '03');
});

test('the wrong number of local digits is a length error that still names the area', () => {
  const result = validateLandline('022345678');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'length');
  assert.equal(result.area?.code, '02');
});

test('landline failures', () => {
  assert.equal(validateLandline('').reason, 'empty');
  assert.equal(validateLandline('02-2345-678A').reason, 'shape');
  assert.equal(validateLandline('2234567890').reason, 'prefix', 'no leading zero');
  assert.equal(validateLandline('0112345678').reason, 'prefix', 'no such area code');
});

test('the built-in area table is well formed and round-trips through the text form', () => {
  for (const entry of AREA_CODES) {
    assert.match(entry.code, /^0\d{1,3}$/);
    assert.ok(entry.length >= 5 && entry.length <= 8);
    assert.notEqual(entry.name, '');
  }
  const text = formatAreaTable(AREA_CODES);
  const parsed = parseAreaTable(text);
  assert.equal(parsed.length, AREA_CODES.length);
  assert.deepEqual(
    new Set(parsed.map((entry) => entry.code)),
    new Set(AREA_CODES.map((entry) => entry.code))
  );
});

test('the editable table ignores comments and rejects nonsense rows', () => {
  const parsed = parseAreaTable(
    ['# a comment', '', '02:8:臺北', '99:8:not an area code', '03:abc:bad length', '05:7:嘉義'].join('\n')
  );
  assert.deepEqual(parsed.map((entry) => entry.code), ['02', '05']);
  assert.equal(parsed[0].name, '臺北');
});

test('a user-edited table is what gets used', () => {
  const table = parseAreaTable('099:4:somewhere');
  assert.equal(validateLandline('0991234', table).ok, true);
  assert.equal(validateLandline('0223456789', table).reason, 'prefix');
});

/* ── Batch ────────────────────────────────── */

test('batch mode reports one verdict per line', () => {
  const { rows, truncated } = validateBatch('A123456789\nB123456789\n\n  A100000001  ', 'id');
  assert.equal(truncated, false);
  assert.deepEqual(rows.map((row) => row.ok), [true, false, true]);
  assert.equal(rows[0].note, 'national');
  assert.equal(rows[1].note, 'checksum');
});

test('batch mode for each kind', () => {
  assert.equal(validateBatch('22099131', 'vat').rows[0].note, 'both rules');
  assert.equal(validateBatch('10000004', 'vat').rows[0].note, 'mod 5 only');
  assert.equal(validateBatch('0912345678', 'mobile').rows[0].note, '0912-345-678');
  assert.equal(validateBatch('0223456789', 'landline').rows[0].note, '02-23456789');
});

test('batch mode caps the work instead of locking up', () => {
  const many = Array.from({ length: BATCH_LIMIT + 50 }, () => 'A123456789').join('\n');
  const { rows, truncated } = validateBatch(many, 'id');
  assert.equal(rows.length, BATCH_LIMIT);
  assert.equal(truncated, true);
});

test('an empty batch is an empty result', () => {
  assert.deepEqual(validateBatch('', 'id'), { rows: [], truncated: false });
  assert.deepEqual(validateBatch('\n\n  \n', 'vat'), { rows: [], truncated: false });
});
