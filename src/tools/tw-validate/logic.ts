/**
 * Check digits for the Taiwanese identifier formats, computed here and nowhere
 * else. No database is consulted, and none exists to consult: a check digit
 * only proves the number is *well formed*. A31234567 with a correct check digit
 * is still not proof that anyone holds it.
 *
 * Sources for each algorithm are named at the function that implements it. The
 * one that changed recently — the business number moved from mod 10 to mod 5 on
 * 2023-04-01 — keeps both rules, because a system that has not been updated is
 * still out there rejecting numbers the government now issues.
 */

/* ── Normalising input ────────────────────── */

/**
 * Full-width digits and letters fold to ASCII, and separators are dropped.
 * Data pasted out of a spreadsheet or typed on a Chinese IME arrives full-width
 * often enough that refusing it would just look broken.
 */
export function normalise(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff10 && code <= 0xff19) out += String.fromCharCode(code - 0xff10 + 0x30);
    else if (code >= 0xff21 && code <= 0xff3a) out += String.fromCharCode(code - 0xff21 + 0x41);
    else if (code >= 0xff41 && code <= 0xff5a) out += String.fromCharCode(code - 0xff41 + 0x41);
    else if (/[0-9A-Za-z]/.test(ch)) out += ch.toUpperCase();
    // Everything else — spaces, hyphens, parentheses, CJK — is separator.
  }
  return out;
}

/* ── The letter table ─────────────────────── */

/**
 * The letter in a Taiwanese ID encodes the household-registration office that
 * first issued it, as two digits. The table is not alphabetical because it
 * follows the administrative numbering of the time: I is 34 and O is 35, tacked
 * on after Z, because Chiayi City and Hsinchu City were promoted later.
 *
 * Source: 內政部戶政司, 國民身分證統一編號編定作業規範.
 */
export const LETTER_VALUES: Record<string, number> = {
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 34,
  J: 18,
  K: 19,
  L: 20,
  M: 21,
  N: 22,
  O: 35,
  P: 23,
  Q: 24,
  R: 25,
  S: 26,
  T: 27,
  U: 28,
  V: 29,
  W: 32,
  X: 30,
  Y: 31,
  Z: 33,
};

/**
 * Where each letter was issued. These are the county and city names as they
 * were when the scheme was drawn up, which is why several no longer exist:
 * Taipei County became New Taipei City, Taichung/Tainan/Kaohsiung counties were
 * merged into their cities, and Y (Yangmingshan Administration) was abolished
 * in 1974 and is never issued now. The letter records the office of *first*
 * issue, not where the holder lives.
 */
export const LETTER_PLACES: Record<string, { zh: string; en: string }> = {
  A: { zh: '臺北市', en: 'Taipei City' },
  B: { zh: '臺中市', en: 'Taichung City' },
  C: { zh: '基隆市', en: 'Keelung City' },
  D: { zh: '臺南市', en: 'Tainan City' },
  E: { zh: '高雄市', en: 'Kaohsiung City' },
  F: { zh: '新北市(原臺北縣)', en: 'New Taipei City (formerly Taipei County)' },
  G: { zh: '宜蘭縣', en: 'Yilan County' },
  H: { zh: '桃園市(原桃園縣)', en: 'Taoyuan City (formerly Taoyuan County)' },
  I: { zh: '嘉義市', en: 'Chiayi City' },
  J: { zh: '新竹縣', en: 'Hsinchu County' },
  K: { zh: '苗栗縣', en: 'Miaoli County' },
  L: { zh: '臺中縣(已併入臺中市)', en: 'Taichung County (merged into Taichung City)' },
  M: { zh: '南投縣', en: 'Nantou County' },
  N: { zh: '彰化縣', en: 'Changhua County' },
  O: { zh: '新竹市', en: 'Hsinchu City' },
  P: { zh: '雲林縣', en: 'Yunlin County' },
  Q: { zh: '嘉義縣', en: 'Chiayi County' },
  R: { zh: '臺南縣(已併入臺南市)', en: 'Tainan County (merged into Tainan City)' },
  S: { zh: '高雄縣(已併入高雄市)', en: 'Kaohsiung County (merged into Kaohsiung City)' },
  T: { zh: '屏東縣', en: 'Pingtung County' },
  U: { zh: '花蓮縣', en: 'Hualien County' },
  V: { zh: '臺東縣', en: 'Taitung County' },
  W: { zh: '金門縣', en: 'Kinmen County' },
  X: { zh: '澎湖縣', en: 'Penghu County' },
  Y: { zh: '陽明山管理局(1974 年撤銷)', en: 'Yangmingshan Administration (abolished 1974)' },
  Z: { zh: '連江縣(馬祖)', en: 'Lienchiang County (Matsu)' },
};

/** The letter as its two digits, most significant first. */
export function letterPair(letter: string): [number, number] | null {
  const value = LETTER_VALUES[letter];
  if (value === undefined) return null;
  return [Math.floor(value / 10), value % 10];
}

/* ── ID numbers ───────────────────────────── */

export type IdKind = 'national' | 'resident-2021' | 'resident-legacy';

export type IdFailure = 'empty' | 'length' | 'shape' | 'checksum';

export type IdResult = {
  ok: boolean;
  normalised: string;
  kind: IdKind | null;
  /** Null for the legacy resident format, which does not encode it. */
  gender: 'male' | 'female' | null;
  /** The first letter, when the shape got that far. */
  letter: string | null;
  /** What the last digit would have to be. Null when the shape is wrong. */
  expectedCheck: number | null;
  reason: IdFailure | null;
};

const WEIGHTS = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/**
 * One weighted sum serves all three formats, which is the point of the design:
 *
 *   national / 2021-resident   A 1 2 3 4 5 6 7 8 9
 *   legacy resident            A B 1 2 3 4 5 6 7 8
 *
 * The leading letter always expands to two digits weighted 1 and 9. In the
 * legacy resident number the *second* letter takes the third slot, contributing
 * only its units digit. Everything after that is weighted 8,7,6,…,2, and the
 * final digit is the check digit weighted 1. Valid when the total is a multiple
 * of ten.
 *
 * Source: 內政部移民署, 外來人口統一證號編碼原則 (2020-12 公告, effective 2021-01-02),
 * which is also where the 2021 format — a letter then 8 or 9 then eight digits —
 * comes from. Before that, residents had two leading letters.
 */
function idChecksum(body: number[]): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += body[i] * WEIGHTS[i];
  return sum;
}

export function validateTwId(input: string): IdResult {
  const text = normalise(input);
  const empty: IdResult = {
    ok: false,
    normalised: text,
    kind: null,
    gender: null,
    letter: null,
    expectedCheck: null,
    reason: 'empty',
  };
  if (text === '') return empty;
  if (text.length !== 10) return { ...empty, reason: 'length' };

  const first = text[0];
  const pair = letterPair(first);
  if (!pair) return { ...empty, reason: 'shape' };

  const second = text[1];
  let kind: IdKind;
  let gender: 'male' | 'female' | null;
  let body: number[];

  if (/^[12]$/.test(second)) {
    kind = 'national';
    gender = second === '1' ? 'male' : 'female';
    body = [pair[0], pair[1], ...text.slice(1, 9).split('').map(Number)];
  } else if (/^[89]$/.test(second)) {
    // 2021 onward: the same shape as a national ID, 8 male and 9 female.
    kind = 'resident-2021';
    gender = second === '8' ? 'male' : 'female';
    body = [pair[0], pair[1], ...text.slice(1, 9).split('').map(Number)];
  } else if (/^[A-Z]$/.test(second)) {
    const secondValue = LETTER_VALUES[second];
    if (secondValue === undefined) return { ...empty, letter: first, reason: 'shape' };
    kind = 'resident-legacy';
    gender = null;
    body = [pair[0], pair[1], secondValue % 10, ...text.slice(2, 9).split('').map(Number)];
  } else {
    return { ...empty, letter: first, reason: 'shape' };
  }

  if (!/^\d+$/.test(text.slice(kind === 'resident-legacy' ? 2 : 1))) {
    return { ...empty, letter: first, kind, reason: 'shape' };
  }

  const check = Number(text[9]);
  const sum = idChecksum(body);
  // body already carries weight-1 slots for everything but the check digit.
  const expectedCheck = (10 - (sum % 10)) % 10;
  const ok = (sum + check) % 10 === 0;

  return {
    ok,
    normalised: text,
    kind,
    gender,
    letter: first,
    expectedCheck,
    reason: ok ? null : 'checksum',
  };
}

/** The check digit that would make a nine-character stem valid. */
export function idCheckDigit(stem: string): number | null {
  const text = normalise(stem);
  if (text.length !== 9) return null;
  const probe = validateTwId(`${text}0`);
  return probe.expectedCheck;
}

/* ── Business number (統一編號) ───────────── */

export type VatFailure = 'empty' | 'length' | 'shape' | 'checksum';

export type VatResult = {
  ok: boolean;
  normalised: string;
  /** The weighted total, for showing the work. */
  sum: number;
  /** True when the 7th digit is 7, which gives the number two valid totals. */
  sevenRule: boolean;
  /** Whether it would also pass the pre-2023 mod-10 rule. */
  legacyOk: boolean;
  reason: VatFailure | null;
};

const VAT_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/**
 * 財政部's logical multiplication: each digit times its weight, then the
 * *digits of that product* are added — 7×4 = 28 contributes 2+8 = 10, not 28.
 *
 * Two things make this awkward and both are real:
 *
 *  - On 2023-04-01 the rule changed from "the total is a multiple of 10" to
 *    "a multiple of 5", because the remaining unissued numbers could not all
 *    satisfy the stricter rule. Numbers issued before then satisfy both, so a
 *    system still checking mod 10 rejects only the new ones — which is exactly
 *    the bug that is hard to find. Both verdicts are reported here.
 *  - When the seventh digit is 7 its weighted product is 28 or 35, and the
 *    official rule allows the total either as-is or plus one. So such a number
 *    has two acceptable totals, and this is not a bug in the implementation.
 */
export function validateVat(input: string): VatResult {
  const text = normalise(input);
  const base: VatResult = {
    ok: false,
    normalised: text,
    sum: 0,
    sevenRule: false,
    legacyOk: false,
    reason: 'empty',
  };
  if (text === '') return base;
  if (text.length !== 8) return { ...base, reason: 'length' };
  if (!/^\d{8}$/.test(text)) return { ...base, reason: 'shape' };

  const digits = text.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const product = digits[i] * VAT_WEIGHTS[i];
    sum += Math.floor(product / 10) + (product % 10);
  }

  const sevenRule = digits[6] === 7;
  const passes = (modulus: number) =>
    sum % modulus === 0 || (sevenRule && (sum + 1) % modulus === 0);

  const ok = passes(5);
  return {
    ok,
    normalised: text,
    sum,
    sevenRule,
    legacyOk: passes(10),
    reason: ok ? null : 'checksum',
  };
}

/* ── Phone numbers ────────────────────────── */

export type PhoneFailure = 'empty' | 'shape' | 'length' | 'prefix';

export type MobileResult = {
  ok: boolean;
  /** Local form, `09xxxxxxxx`. */
  national: string;
  /** `+8869xxxxxxxx`. */
  international: string;
  /** `0912-345-678`. */
  pretty: string;
  reason: PhoneFailure | null;
};

/**
 * Taiwanese mobile numbers carry no check digit at all, so there is nothing to
 * verify beyond the shape: `09` and eight more digits. Which `09xx` blocks are
 * actually assigned to a carrier is an NCC allocation table that changes, and
 * numbers port between carriers anyway, so this deliberately does not claim to
 * know. `+886` and `886` prefixes are accepted and folded to the local form.
 */
export function validateMobile(input: string): MobileResult {
  const raw = normalise(input);
  const fail = (reason: PhoneFailure): MobileResult => ({
    ok: false,
    national: raw,
    international: '',
    pretty: '',
    reason,
  });
  if (raw === '') return fail('empty');
  if (!/^\d+$/.test(raw)) return fail('shape');

  let digits = raw;
  if (digits.startsWith('886')) digits = `0${digits.slice(3)}`;
  if (!digits.startsWith('09')) return fail('prefix');
  if (digits.length !== 10) return fail('length');

  return {
    ok: true,
    national: digits,
    international: `+886${digits.slice(1)}`,
    pretty: `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`,
    reason: null,
  };
}

/* ── Landline area codes ──────────────────── */

export type AreaCode = { code: string; length: number; name: string };

/**
 * Area code, local-number length, and the area it covers.
 *
 * This is the part of the tool with an expiry date: the NCC can renumber, and
 * has (Taipei went from seven digits to eight in 2000). Which is why the table
 * is editable on the page and this constant is only the starting point.
 * Reviewed 2025-09 against the NCC numbering plan.
 */
export const AREA_CODES: AreaCode[] = [
  { code: '02', length: 8, name: '臺北、新北、基隆' },
  { code: '037', length: 6, name: '苗栗' },
  { code: '03', length: 7, name: '桃園、新竹、宜蘭、花蓮' },
  { code: '049', length: 7, name: '南投' },
  { code: '04', length: 8, name: '臺中、彰化' },
  { code: '05', length: 7, name: '嘉義、雲林' },
  { code: '06', length: 7, name: '臺南、澎湖' },
  { code: '07', length: 7, name: '高雄' },
  { code: '0826', length: 5, name: '烏坵' },
  { code: '0836', length: 5, name: '馬祖' },
  { code: '082', length: 6, name: '金門' },
  { code: '089', length: 6, name: '臺東' },
  { code: '08', length: 7, name: '屏東' },
];

/** `code:length:name` per line. Blank lines and `#` comments are ignored. */
export function parseAreaTable(text: string): AreaCode[] {
  const out: AreaCode[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [code, length, ...rest] = trimmed.split(':');
    const digits = (code ?? '').trim();
    const size = Number((length ?? '').trim());
    if (!/^0\d{1,3}$/.test(digits) || !Number.isInteger(size) || size < 3 || size > 10) continue;
    out.push({ code: digits, length: size, name: rest.join(':').trim() });
  }
  // Longest code first, so 0826 wins over 08 the way a dial plan resolves it.
  return out.sort((a, b) => b.code.length - a.code.length);
}

export function formatAreaTable(codes: readonly AreaCode[]): string {
  return codes.map((entry) => `${entry.code}:${entry.length}:${entry.name}`).join('\n');
}

export type LandlineResult = {
  ok: boolean;
  area: AreaCode | null;
  local: string;
  pretty: string;
  international: string;
  reason: PhoneFailure | null;
};

/**
 * Longest-prefix match against the table, exactly the way a dial plan resolves
 * an area code: 0826 must be tried before 082 and 08, or every Wuqiu number
 * becomes a Pingtung number with the wrong digit count.
 */
export function validateLandline(input: string, table: readonly AreaCode[] = AREA_CODES): LandlineResult {
  const raw = normalise(input);
  const fail = (reason: PhoneFailure): LandlineResult => ({
    ok: false,
    area: null,
    local: '',
    pretty: '',
    international: '',
    reason,
  });
  if (raw === '') return fail('empty');
  if (!/^\d+$/.test(raw)) return fail('shape');

  let digits = raw;
  if (digits.startsWith('886')) digits = `0${digits.slice(3)}`;
  if (!digits.startsWith('0')) return fail('prefix');

  const sorted = [...table].sort((a, b) => b.code.length - a.code.length);
  const area = sorted.find((entry) => digits.startsWith(entry.code));
  if (!area) return fail('prefix');

  const local = digits.slice(area.code.length);
  if (local.length !== area.length) {
    return { ok: false, area, local, pretty: '', international: '', reason: 'length' };
  }
  return {
    ok: true,
    area,
    local,
    pretty: `${area.code}-${local}`,
    international: `+886-${area.code.slice(1)}-${local}`,
    reason: null,
  };
}

/* ── Batch mode ───────────────────────────── */

export type BatchKind = 'id' | 'vat' | 'mobile' | 'landline';

export type BatchRow = { input: string; ok: boolean; note: string };

export const BATCH_LIMIT = 2000;

/**
 * One line in, one verdict out, capped so pasting a hundred thousand rows
 * reports a limit instead of locking the tab.
 */
export function validateBatch(
  text: string,
  kind: BatchKind,
  table: readonly AreaCode[] = AREA_CODES
): { rows: BatchRow[]; truncated: boolean } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const truncated = lines.length > BATCH_LIMIT;
  const rows = lines.slice(0, BATCH_LIMIT).map((input) => {
    if (kind === 'id') {
      const result = validateTwId(input);
      return { input, ok: result.ok, note: result.ok ? (result.kind ?? '') : (result.reason ?? '') };
    }
    if (kind === 'vat') {
      const result = validateVat(input);
      return {
        input,
        ok: result.ok,
        note: result.ok ? (result.legacyOk ? 'both rules' : 'mod 5 only') : (result.reason ?? ''),
      };
    }
    if (kind === 'mobile') {
      const result = validateMobile(input);
      return { input, ok: result.ok, note: result.ok ? result.pretty : (result.reason ?? '') };
    }
    const result = validateLandline(input, table);
    return { input, ok: result.ok, note: result.ok ? result.pretty : (result.reason ?? '') };
  });
  return { rows, truncated };
}
