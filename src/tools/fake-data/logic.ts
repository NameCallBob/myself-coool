/**
 * Test data that is realistic in shape and false in substance.
 *
 * Two rules run through all of it. Anything with a check digit — card numbers,
 * 身分證字號, 統一編號 — is generated with a *valid* one, because the point of
 * test data is to get through the validator you are testing. And anything that
 * could collide with a real person or a real service is taken from a reserved
 * range: e-mail domains are the RFC 2606 `example.*` names, never gmail.com, and
 * card numbers use the documented test prefixes.
 *
 * Randomness is an argument, not an import. The caller passes the same
 * `below(max)` the rest of the bench uses (crypto-backed, no modulo bias), and
 * the tests pass a seeded counter so every case is reproducible.
 */

/** Uniform integer in [0, max). Matches `@/lib/tools/random`'s `below`. */
export type Rng = (max: number) => number;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[rng(items.length)];
}

function digits(n: number, rng: Rng): string {
  let out = '';
  for (let i = 0; i < n; i += 1) out += String(rng(10));
  return out;
}

/* ── Check digits ─────────────────────────── */

/**
 * Luhn check digit for a number that does not have one yet.
 *
 * Doubling starts at the rightmost digit of the partial number, because the
 * check digit will occupy the position to its right — get that offset backwards
 * and every generated number fails validation for no visible reason.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  let double = true;
  for (let i = partial.length - 1; i >= 0; i -= 1) {
    let value = partial.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function isLuhnValid(number: string): boolean {
  const clean = number.replace(/[\s-]/g, '');
  if (!/^\d{2,}$/.test(clean)) return false;
  return luhnCheckDigit(clean.slice(0, -1)) === clean.charCodeAt(clean.length - 1) - 48;
}

/**
 * Letter codes for 身分證字號.
 *
 * The order is not alphabetical, which is why it is written out: the sequence
 * below maps to 10–35 by position, and it is the mapping the Ministry of the
 * Interior published — I, O, W, X, Y, Z sit out of order at the end.
 */
export const ID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';

export function idLetterCode(letter: string): number | null {
  const at = ID_LETTERS.indexOf(letter.toUpperCase());
  return at === -1 ? null : at + 10;
}

/**
 * Weighted checksum of a 身分證字號.
 *
 * The letter contributes twice: its tens digit with weight 1 and its units digit
 * with weight 9. The eight digits after it take weights 8 down to 1, and the
 * check digit takes weight 1. A valid number sums to a multiple of ten.
 */
export function twIdChecksum(letter: string, body: string): number | null {
  const code = idLetterCode(letter);
  if (code === null || !/^\d{8}$/.test(body)) return null;
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let i = 0; i < 8; i += 1) {
    sum += (body.charCodeAt(i) - 48) * (8 - i);
  }
  return (10 - (sum % 10)) % 10;
}

export function isTwIdValid(id: string): boolean {
  const clean = id.trim().toUpperCase();
  if (!/^[A-Z]\d{9}$/.test(clean)) return false;
  return twIdChecksum(clean[0], clean.slice(1, 9)) === clean.charCodeAt(9) - 48;
}

const BUSINESS_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/** Digit sum of each weighted product, added up. */
export function businessSum(number: string): number | null {
  if (!/^\d{8}$/.test(number)) return null;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const product = (number.charCodeAt(i) - 48) * BUSINESS_WEIGHTS[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  return sum;
}

/**
 * 統一編號 validity.
 *
 * The rule changed in April 2023: it used to be "the weighted sum is a multiple
 * of ten", it is now "a multiple of five". Every number valid under the old rule
 * is valid under the new one, so this accepts the current rule and the generator
 * below deliberately produces numbers that satisfy both. The historical special
 * case — when the seventh digit is 7, the sum may be taken with 1 subtracted —
 * is applied as well, which is why the generator avoids that digit entirely
 * rather than relying on it.
 */
export function isTwBusinessValid(number: string): boolean {
  const clean = number.replace(/[\s-]/g, '');
  const sum = businessSum(clean);
  if (sum === null) return false;
  if (sum % 5 === 0) return true;
  return clean[6] === '7' && (sum - 1) % 5 === 0;
}

/* ── Tables ───────────────────────────────── */

export const SURNAMES: readonly string[] = [
  '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪',
  '曾', '邱', '廖', '賴', '徐', '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高',
  '簡', '朱', '鍾', '游', '彭', '詹', '胡', '施', '沈', '余', '歐陽', '司徒',
];

export const GIVEN_CHARS: readonly string[] = [
  '志', '明', '淑', '芬', '家', '豪', '雅', '婷', '俊', '宏', '怡', '君', '建', '華', '美',
  '玲', '宗', '翰', '欣', '穎', '冠', '廷', '佳', '慧', '文', '彥', '柏', '瑜', '思', '妤',
  '子', '睿', '品', '妍', '承', '恩', '亦', '安', '書', '瑋', '筱', '晴', '哲', '維',
];

export const FIRST_NAMES: readonly string[] = [
  'Ann', 'Ben', 'Clara', 'Dan', 'Elena', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Kate', 'Liam', 'Mia', 'Noah', 'Olive', 'Paul', 'Quinn', 'Rosa', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yuki', 'Zoe',
];

export const LAST_NAMES: readonly string[] = [
  'Adams', 'Baker', 'Chen', 'Diaz', 'Evans', 'Foster', 'Garcia', 'Hall', 'Ito',
  'Jones', 'Kim', 'Lee', 'Moore', 'Novak', 'Olsen', 'Patel', 'Quinn', 'Reed',
  'Silva', 'Tanaka', 'Ueda', 'Vargas', 'Wong', 'Yamada', 'Zhang',
];

/**
 * Reserved second-level domains and TLDs, from RFC 2606 and RFC 6761.
 * These can never be registered, so a generated address can never reach a real
 * inbox — which is the entire requirement for a fake e-mail address.
 */
export const EMAIL_DOMAINS: readonly string[] = [
  'example.com',
  'example.org',
  'example.net',
  'test.example',
  'mail.invalid',
];

/**
 * City and district names are real, because a form that validates them would
 * reject invented ones; the street, number and floor are random. The resulting
 * address is therefore well-formed and almost certainly does not exist.
 */
export const CITIES: readonly { city: string; districts: readonly string[] }[] = [
  { city: '臺北市', districts: ['中正區', '大安區', '信義區', '松山區', '士林區', '內湖區'] },
  { city: '新北市', districts: ['板橋區', '新莊區', '中和區', '永和區', '三重區', '新店區'] },
  { city: '桃園市', districts: ['桃園區', '中壢區', '平鎮區', '八德區', '龜山區'] },
  { city: '臺中市', districts: ['西屯區', '北屯區', '南屯區', '大里區', '豐原區'] },
  { city: '臺南市', districts: ['東區', '安平區', '中西區', '永康區', '仁德區'] },
  { city: '高雄市', districts: ['苓雅區', '三民區', '左營區', '鳳山區', '楠梓區'] },
  { city: '新竹市', districts: ['東區', '北區', '香山區'] },
  { city: '基隆市', districts: ['仁愛區', '信義區', '中正區', '安樂區'] },
];

export const ROADS: readonly string[] = [
  '中山路', '中正路', '民生路', '民權路', '復興路', '忠孝東路', '和平東路', '信義路',
  '文化街', '光復街', '建國路', '博愛街', '學府路', '青年路', '公園街',
];

/** Area code and the number of local digits that follow it. */
export const AREA_CODES: readonly { code: string; length: number }[] = [
  { code: '02', length: 8 },
  { code: '03', length: 7 },
  { code: '037', length: 6 },
  { code: '04', length: 7 },
  { code: '049', length: 6 },
  { code: '05', length: 7 },
  { code: '06', length: 7 },
  { code: '07', length: 7 },
  { code: '08', length: 7 },
  { code: '089', length: 6 },
];

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'jcb';

/**
 * Test prefixes, with the length each brand uses. These are the IIN ranges the
 * brands publish for testing; the check digit makes them pass validation and the
 * account number behind it belongs to nobody.
 */
export const CARD_SHAPES: Record<CardBrand, { prefixes: readonly string[]; length: number }> = {
  visa: { prefixes: ['4111', '4012', '4242'], length: 16 },
  mastercard: { prefixes: ['5100', '5200', '5555', '2223'], length: 16 },
  amex: { prefixes: ['3400', '3700'], length: 15 },
  jcb: { prefixes: ['3528', '3566'], length: 16 },
};

export const LOREM_LATIN: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

/** Filler words, not sentences: the output is meant to look like text and say
 *  nothing. Two-character words keep the rhythm of real Chinese prose. */
export const LOREM_CJK: readonly string[] = [
  '系統', '設計', '資料', '流程', '介面', '版本', '需求', '測試', '文件', '規格',
  '使用', '產生', '記錄', '狀態', '參數', '結果', '條件', '方式', '內容', '項目',
  '時間', '位置', '數量', '欄位', '報表', '通知', '權限', '節點', '快取', '佇列',
];

/* ── Generators ───────────────────────────── */

export function chineseName(rng: Rng): string {
  const surname = pick(SURNAMES, rng);
  const length = rng(10) === 0 ? 1 : 2;
  let given = '';
  for (let i = 0; i < length; i += 1) given += pick(GIVEN_CHARS, rng);
  return surname + given;
}

export function englishName(rng: Rng): { first: string; last: string; full: string } {
  const first = pick(FIRST_NAMES, rng);
  const last = pick(LAST_NAMES, rng);
  return { first, last, full: `${first} ${last}` };
}

export function emailFor(name: { first: string; last: string }, rng: Rng): string {
  const local = [
    `${name.first}.${name.last}`,
    `${name.first[0]}${name.last}`,
    `${name.first}${rng(90) + 10}`,
    `${name.last}.${name.first}`,
  ][rng(4)].toLowerCase();
  return `${local}@${pick(EMAIL_DOMAINS, rng)}`;
}

/** 09 plus eight digits, grouped the way people write it. */
export function mobileNumber(rng: Rng): string {
  const body = digits(8, rng);
  return `09${body.slice(0, 2)}-${body.slice(2, 5)}-${body.slice(5)}`;
}

export function landlineNumber(rng: Rng): string {
  const area = pick(AREA_CODES, rng);
  const body = digits(area.length, rng);
  const split = area.length === 8 ? 4 : area.length === 7 ? 3 : 3;
  return `${area.code}-${body.slice(0, split)}-${body.slice(split)}`;
}

export function address(rng: Rng): string {
  const place = pick(CITIES, rng);
  const district = pick(place.districts, rng);
  const road = pick(ROADS, rng);
  const section = rng(3) === 0 ? `${rng(4) + 1}段` : '';
  const number = rng(500) + 1;
  const floor = rng(3) === 0 ? `${rng(14) + 1}樓` : '';
  return `${place.city}${district}${road}${section}${number}號${floor}`;
}

/**
 * RFC 4122 version 4: 122 random bits, with the version and variant fields
 * overwritten. Without those two writes it is a random string that looks like a
 * UUID and fails a strict parser.
 */
export function uuidV4(rng: Rng): string {
  const bytes: number[] = [];
  for (let i = 0; i < 16; i += 1) bytes.push(rng(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function cardNumber(brand: CardBrand, rng: Rng, grouped = true): string {
  const shape = CARD_SHAPES[brand];
  const prefix = pick(shape.prefixes, rng);
  const middle = digits(shape.length - prefix.length - 1, rng);
  const partial = prefix + middle;
  const full = partial + String(luhnCheckDigit(partial));
  if (!grouped) return full;
  return brand === 'amex'
    ? `${full.slice(0, 4)} ${full.slice(4, 10)} ${full.slice(10)}`
    : full.replace(/(.{4})(?=.)/g, '$1 ');
}

/** A format-valid 身分證字號 with a correct check digit. Nobody's. */
export function twIdNumber(rng: Rng): string {
  const letter = ID_LETTERS[rng(ID_LETTERS.length)];
  const gender = String(rng(2) + 1);
  const body = gender + digits(7, rng);
  const check = twIdChecksum(letter, body);
  return `${letter}${body}${check}`;
}

/**
 * A 統一編號 whose weighted sum is a multiple of ten, which satisfies both the
 * pre-2023 rule and the current multiple-of-five rule. The seventh digit is kept
 * away from 7 so the historical special case never has to be relied on.
 */
export function twBusinessNumber(rng: Rng): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const head = digits(6, rng);
    const seventh = String(rng(7)); // 0–6, never 7
    for (let last = 0; last < 10; last += 1) {
      const candidate = `${head}${seventh}${last}`;
      const sum = businessSum(candidate);
      if (sum !== null && sum % 10 === 0) return candidate;
    }
  }
  // Unreachable in practice: one of the ten last digits always works for a
  // weight-1 position. Kept so the function has no implicit undefined return.
  return '00000000';
}

/** ISO date inside a year range, with the right number of days per month. */
export function isoDate(rng: Rng, startYear: number, endYear: number): string {
  const from = Math.min(startYear, endYear);
  const to = Math.max(startYear, endYear);
  const year = from + rng(to - from + 1);
  const month = rng(12) + 1;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const day = rng(days) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function loremLatin(words: number, rng: Rng): string {
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, words); i += 1) out.push(pick(LOREM_LATIN, rng));
  const sentence = out.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function loremCjk(words: number, rng: Rng): string {
  let out = '';
  for (let i = 0; i < Math.max(1, words); i += 1) {
    out += pick(LOREM_CJK, rng);
    // A comma every few words, so it reads as prose rather than a word list.
    if (i > 0 && i < words - 1 && rng(4) === 0) out += '，';
  }
  return `${out}。`;
}

/* ── Rows ─────────────────────────────────── */

export type FieldId =
  | 'nameZh'
  | 'nameEn'
  | 'email'
  | 'mobile'
  | 'landline'
  | 'address'
  | 'date'
  | 'uuid'
  | 'card'
  | 'twId'
  | 'twBusiness'
  | 'loremZh'
  | 'loremEn';

export const FIELDS: readonly FieldId[] = [
  'nameZh',
  'nameEn',
  'email',
  'mobile',
  'landline',
  'address',
  'date',
  'uuid',
  'card',
  'twId',
  'twBusiness',
  'loremZh',
  'loremEn',
];

export type Options = {
  brand: CardBrand;
  startYear: number;
  endYear: number;
  loremWords: number;
  groupCard: boolean;
};

export const DEFAULTS: Options = {
  brand: 'visa',
  startYear: 2019,
  endYear: 2025,
  loremWords: 12,
  groupCard: true,
};

export const MAX_ROWS = 2000;

export type Row = Partial<Record<FieldId, string>>;

/**
 * One row. The English name is generated first even when it was not asked for,
 * because the e-mail address is derived from it — an address that has nothing to
 * do with the name in the next column is the tell that data is fake in a way
 * that breaks the test you were trying to run.
 */
export function generateRow(fields: readonly FieldId[], rng: Rng, options: Options = DEFAULTS): Row {
  const person = englishName(rng);
  const row: Row = {};
  for (const field of fields) {
    if (field === 'nameZh') row.nameZh = chineseName(rng);
    else if (field === 'nameEn') row.nameEn = person.full;
    else if (field === 'email') row.email = emailFor(person, rng);
    else if (field === 'mobile') row.mobile = mobileNumber(rng);
    else if (field === 'landline') row.landline = landlineNumber(rng);
    else if (field === 'address') row.address = address(rng);
    else if (field === 'date') row.date = isoDate(rng, options.startYear, options.endYear);
    else if (field === 'uuid') row.uuid = uuidV4(rng);
    else if (field === 'card') row.card = cardNumber(options.brand, rng, options.groupCard);
    else if (field === 'twId') row.twId = twIdNumber(rng);
    else if (field === 'twBusiness') row.twBusiness = twBusinessNumber(rng);
    else if (field === 'loremZh') row.loremZh = loremCjk(options.loremWords, rng);
    else if (field === 'loremEn') row.loremEn = loremLatin(options.loremWords, rng);
  }
  return row;
}

export function generateRows(
  fields: readonly FieldId[],
  n: number,
  rng: Rng,
  options: Options = DEFAULTS
): Row[] {
  const rows: Row[] = [];
  const total = Math.max(0, Math.min(MAX_ROWS, Math.trunc(n)));
  for (let i = 0; i < total; i += 1) rows.push(generateRow(fields, rng, options));
  return rows;
}

/** RFC 4180 quoting: only when needed, doubling the quotes inside. */
export function toCsv(rows: readonly Row[], fields: readonly FieldId[], header = true): string {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines: string[] = [];
  if (header) lines.push(fields.join(','));
  for (const row of rows) lines.push(fields.map((field) => cell(row[field] ?? '')).join(','));
  return lines.join('\n');
}

export function toJson(rows: readonly Row[]): string {
  return JSON.stringify(rows, null, 2);
}

export function toLines(rows: readonly Row[], fields: readonly FieldId[]): string {
  return rows.map((row) => fields.map((field) => row[field] ?? '').join('\t')).join('\n');
}
