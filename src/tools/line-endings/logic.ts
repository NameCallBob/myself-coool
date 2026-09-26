/**
 * Line endings, byte-order marks, UTF-8 validity, and the characters you
 * cannot see — the four things that make a file "look identical but not work".
 *
 * They belong in one tool because they are one class of problem: a difference
 * in the bytes that no rendering of the text will show you. A file with CRLF
 * endings and one with LF endings display the same and hash differently. A BOM
 * is three invisible bytes that make a shell script fail with "command not
 * found" on its own first line, and make a CSV's first column header not match
 * the string you compare it to. Invalid UTF-8 shows as U+FFFD only once
 * something has already replaced it.
 *
 * Nothing here guesses. The UTF-8 validator is written out rather than handed
 * to `TextDecoder`, because `TextDecoder` in non-fatal mode silently replaces
 * bad sequences and in fatal mode throws without saying where — and "where" is
 * the only useful output when a 40 MB export has one bad byte in it.
 */

export type Ending = 'lf' | 'crlf' | 'cr';

export type TextReport = {
  crlf: number;
  lf: number;
  cr: number;
  /** Lines, counting the last one even when it has no terminator. */
  lines: number;
  mixed: boolean;
  /** The ending in the majority, or null when there are none at all. */
  dominant: Ending | null;
  /** Whether the text ends with a line terminator, as POSIX text files should. */
  finalNewline: boolean;
  /** 1-based line numbers that end in a space or tab. */
  trailingWhitespace: number[];
  tabs: number;
  longestLine: number;
};

/**
 * Counts endings without first normalising them.
 *
 * The order matters: a bare CR count has to exclude the CRs that belong to a
 * CRLF pair, or a Windows file reports as "mixed" and the tool sends you
 * looking for a problem that is not there.
 */
export function analyzeText(text: string): TextReport {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  let tabs = 0;
  const trailingWhitespace: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\t') tabs += 1;
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        crlf += 1;
        i += 1;
      } else {
        cr += 1;
      }
    } else if (ch === '\n') {
      lf += 1;
    }
  }

  const rows = text.split(/\r\n|\r|\n/);
  const finalNewline = text !== '' && /(\r\n|\r|\n)$/.test(text);
  // split() leaves an empty trailing element when the text ends with a
  // terminator; that is the absence of a next line, not a blank line.
  const contentRows = finalNewline ? rows.slice(0, -1) : rows;
  contentRows.forEach((row, index) => {
    if (/[ \t]$/.test(row)) trailingWhitespace.push(index + 1);
  });

  const present = ([['crlf', crlf], ['lf', lf], ['cr', cr]] as [Ending, number][]).filter(
    ([, n]) => n > 0
  );
  present.sort((a, b) => b[1] - a[1]);

  return {
    crlf,
    lf,
    cr,
    lines: text === '' ? 0 : contentRows.length,
    mixed: present.length > 1,
    dominant: present[0]?.[0] ?? null,
    finalNewline,
    trailingWhitespace,
    tabs,
    longestLine: contentRows.reduce((n, row) => Math.max(n, row.length), 0),
  };
}

const TERMINATORS: Record<Ending, string> = { lf: '\n', crlf: '\r\n', cr: '\r' };

/** Rewrites every terminator to one kind. Normalises through LF first. */
export function convertEndings(text: string, to: Ending): string {
  const normalised = text.replace(/\r\n|\r/g, '\n');
  return to === 'lf' ? normalised : normalised.replace(/\n/g, TERMINATORS[to]);
}

export function trimTrailingWhitespace(text: string): string {
  // Multiline, so the run before each terminator goes, and the terminator stays.
  return text.replace(/[ \t]+(?=\r\n|\r|\n|$)/g, '');
}

export function ensureFinalNewline(text: string, ending: Ending = 'lf'): string {
  if (text === '' || /(\r\n|\r|\n)$/.test(text)) return text;
  return text + TERMINATORS[ending];
}

export function removeFinalNewline(text: string): string {
  return text.replace(/(\r\n|\r|\n)$/, '');
}

/* ── Byte-order marks ─────────────────────── */

export type BomKind = 'utf8' | 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be';

/**
 * Signatures longest-first.
 *
 * UTF-32LE begins with the UTF-16LE signature, so testing in the wrong order
 * identifies every UTF-32LE file as UTF-16LE and then reads it as text full of
 * NULs.
 */
export const BOMS: { kind: BomKind; bytes: number[] }[] = [
  { kind: 'utf32le', bytes: [0xff, 0xfe, 0x00, 0x00] },
  { kind: 'utf32be', bytes: [0x00, 0x00, 0xfe, 0xff] },
  { kind: 'utf8', bytes: [0xef, 0xbb, 0xbf] },
  { kind: 'utf16le', bytes: [0xff, 0xfe] },
  { kind: 'utf16be', bytes: [0xfe, 0xff] },
];

export function detectBom(data: Uint8Array): { kind: BomKind; length: number } | null {
  for (const bom of BOMS) {
    if (data.length < bom.bytes.length) continue;
    if (bom.bytes.every((byte, i) => data[i] === byte)) {
      return { kind: bom.kind, length: bom.bytes.length };
    }
  }
  return null;
}

export function stripBom(data: Uint8Array): Uint8Array {
  const bom = detectBom(data);
  return bom ? data.subarray(bom.length) : data;
}

/** The same for a decoded string: a leading U+FEFF. */
export function stripBomChar(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* ── UTF-8 validation ─────────────────────── */

export type Utf8ErrorKind =
  /** A continuation byte (0x80–0xBF) where a sequence should start. */
  | 'stray-continuation'
  /** A lead byte that no longer exists in UTF-8 (0xC0, 0xC1, 0xF5–0xFF). */
  | 'invalid-lead'
  /** A sequence that runs off the end of the data. */
  | 'truncated'
  /** A continuation byte missing from the middle of a sequence. */
  | 'bad-continuation'
  /** A code point encoded in more bytes than it needs. */
  | 'overlong'
  /** A UTF-16 surrogate, which UTF-8 must never encode. */
  | 'surrogate'
  /** Above U+10FFFF. */
  | 'out-of-range';

export type Utf8Error = { offset: number; kind: Utf8ErrorKind; bytes: number[] };

export type Utf8Report = {
  ok: boolean;
  codePoints: number;
  /** Errors, up to the reporting cap. */
  errors: Utf8Error[];
  /** Total errors found, which may exceed `errors.length`. */
  errorCount: number;
  /** Bytes that are not plain ASCII — how much of the file is multi-byte. */
  nonAscii: number;
};

/** Reporting cap. A file of garbage would otherwise build a list per byte. */
export const ERROR_CAP = 200;

/**
 * Validates UTF-8 the way the standard defines it, not the way it is often
 * implemented.
 *
 * Three rules are usually the ones missing. Overlong forms — `C0 80` for NUL —
 * were a real security problem, because a path check looking for `2F` would
 * miss `C0 AF`; UTF-8 has forbidden them since 2003. Surrogates D800–DFFF have
 * no UTF-8 encoding at all, though CESU-8 and Java's modified UTF-8 both emit
 * them. And the lead bytes F5–FF cannot start anything, since Unicode stops at
 * U+10FFFF.
 */
export function validateUtf8(data: Uint8Array): Utf8Report {
  const errors: Utf8Error[] = [];
  let errorCount = 0;
  let codePoints = 0;
  let nonAscii = 0;
  let i = 0;

  const fail = (offset: number, kind: Utf8ErrorKind, length: number) => {
    errorCount += 1;
    if (errors.length < ERROR_CAP) {
      errors.push({ offset, kind, bytes: [...data.subarray(offset, offset + length)] });
    }
  };

  while (i < data.length) {
    const b = data[i];
    if (b < 0x80) {
      codePoints += 1;
      i += 1;
      continue;
    }
    nonAscii += 1;

    if (b < 0xc0) {
      fail(i, 'stray-continuation', 1);
      i += 1;
      continue;
    }
    if (b === 0xc0 || b === 0xc1 || b > 0xf4) {
      // C0/C1 could only ever encode an overlong; F5+ is above U+10FFFF.
      fail(i, 'invalid-lead', 1);
      i += 1;
      continue;
    }

    const need = b < 0xe0 ? 1 : b < 0xf0 ? 2 : 3;
    if (i + need >= data.length) {
      fail(i, 'truncated', data.length - i);
      i = data.length;
      continue;
    }

    let bad = false;
    let cp = b < 0xe0 ? b & 0x1f : b < 0xf0 ? b & 0x0f : b & 0x07;
    for (let k = 1; k <= need; k += 1) {
      const c = data[i + k];
      if (c < 0x80 || c > 0xbf) {
        fail(i, 'bad-continuation', k + 1);
        // Resume at the offending byte, not past it: it may itself be a
        // perfectly good lead byte for the next character.
        i += k;
        bad = true;
        break;
      }
      cp = (cp << 6) | (c & 0x3f);
      nonAscii += 1;
    }
    if (bad) continue;

    const min = need === 1 ? 0x80 : need === 2 ? 0x800 : 0x10000;
    if (cp < min) fail(i, 'overlong', need + 1);
    else if (cp >= 0xd800 && cp <= 0xdfff) fail(i, 'surrogate', need + 1);
    else if (cp > 0x10ffff) fail(i, 'out-of-range', need + 1);
    else codePoints += 1;

    i += need + 1;
  }

  return { ok: errorCount === 0, codePoints, errors, errorCount, nonAscii };
}

export const UTF8_ERROR_TEXT: Record<Utf8ErrorKind, { zh: string; en: string }> = {
  'stray-continuation': {
    zh: '接續位元組出現在不該出現的位置(通常是前面被截掉了,或兩段不同編碼被接在一起)',
    en: 'a continuation byte where a character should start — usually a cut, or two encodings spliced together',
  },
  'invalid-lead': {
    zh: '這個位元組不能當開頭:C0、C1 只能表示 overlong,F5 以上超出 U+10FFFF',
    en: 'not a legal lead byte: C0 and C1 could only be overlong, F5 and above exceed U+10FFFF',
  },
  truncated: { zh: '序列還沒結束檔案就結束了', en: 'the sequence runs off the end of the data' },
  'bad-continuation': {
    zh: '序列中間少了接續位元組(常見於按位元組切字串)',
    en: 'a continuation byte is missing mid-sequence — typical of slicing a string by bytes',
  },
  overlong: {
    zh: 'overlong:用了比需要更多的位元組。2003 年起明文禁止,因為 C0 AF 可以偽裝成斜線繞過路徑檢查',
    en: 'overlong: more bytes than the code point needs. Banned since 2003, because C0 AF can smuggle a slash past a path check',
  },
  surrogate: {
    zh: 'UTF-16 代理碼位。UTF-8 不得編碼這個範圍;會出現通常是經過 CESU-8 或 Java 的 modified UTF-8',
    en: 'a UTF-16 surrogate. UTF-8 must not encode this range; usually means CESU-8 or Java modified UTF-8',
  },
  'out-of-range': { zh: '超過 U+10FFFF', en: 'above U+10FFFF' },
};

/* ── Invisible characters ─────────────────── */

/** The ones worth a name here: everything that is invisible in a text file. */
export const INVISIBLE: Record<number, string> = {
  0x0000: 'NUL',
  0x0007: 'BEL',
  0x0008: 'BS',
  0x000b: 'VT',
  0x000c: 'FF',
  0x001b: 'ESC',
  0x007f: 'DEL',
  0x00a0: 'NBSP',
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'CGJ',
  0x061c: 'ALM',
  0x1680: 'OGHAM SPACE',
  0x2000: 'EN QUAD',
  0x2001: 'EM QUAD',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2004: '3-PER-EM SPACE',
  0x2005: '4-PER-EM SPACE',
  0x2006: '6-PER-EM SPACE',
  0x2007: 'FIGURE SPACE',
  0x2008: 'PUNCT SPACE',
  0x2009: 'THIN SPACE',
  0x200a: 'HAIR SPACE',
  0x200b: 'ZWSP',
  0x200c: 'ZWNJ',
  0x200d: 'ZWJ',
  0x200e: 'LRM',
  0x200f: 'RLM',
  0x2028: 'LINE SEP',
  0x2029: 'PARA SEP',
  0x202a: 'LRE',
  0x202b: 'RLE',
  0x202c: 'PDF',
  0x202d: 'LRO',
  0x202e: 'RLO',
  0x202f: 'NARROW NBSP',
  0x205f: 'MMSP',
  0x2060: 'WORD JOINER',
  0x2066: 'LRI',
  0x2067: 'RLI',
  0x2068: 'FSI',
  0x2069: 'PDI',
  0x3000: 'IDEOGRAPHIC SPACE',
  0xfeff: 'BOM / ZWNBSP',
  0xfffd: 'REPLACEMENT CHAR',
};

const FORMAT_OR_CONTROL = /[\p{Cf}\p{Cc}\p{Co}]/u;
const ODD_SPACE = /\p{Zs}/u;

export type Finding = {
  /** Code-unit index, so it lines up with a textarea's selection. */
  index: number;
  /** 1-based line and column, for a message a person can act on. */
  line: number;
  column: number;
  cp: number;
  label: string;
};

export const FINDING_CAP = 500;

/**
 * Every character in the text that a reader cannot see.
 *
 * TAB, LF and CR are excluded: they are invisible too, but they are the
 * expected structure of a text file and reporting them would bury the ones
 * that matter. Their counts come from `analyzeText` instead.
 */
export function findInvisibles(text: string, cap = FINDING_CAP): Finding[] {
  const out: Finding[] = [];
  let line = 1;
  let column = 1;
  let index = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 0x0a) {
      line += 1;
      column = 1;
      index += ch.length;
      continue;
    }
    if (cp !== 0x09 && cp !== 0x0d && cp !== 0x20) {
      const named = INVISIBLE[cp];
      const odd = named !== undefined || FORMAT_OR_CONTROL.test(ch) || ODD_SPACE.test(ch);
      if (odd && out.length < cap) {
        out.push({
          index,
          line,
          column,
          cp,
          label: named ?? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
        });
      }
    }
    index += ch.length;
    column += 1;
  }
  return out;
}

/**
 * Renders the text with every invisible character spelled out.
 *
 * Bracketed names rather than the usual control pictures (␉ ␊): the pictures
 * need a font that has them, and the whole point of this view is to be certain
 * about what is there.
 */
export function markInvisibles(text: string, options: { endings?: boolean } = {}): string {
  const endings = options.endings ?? true;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        out += endings ? '⟨CRLF⟩\n' : '\r\n';
        i += 1;
      } else {
        out += endings ? '⟨CR⟩\n' : '\r';
      }
      continue;
    }
    if (ch === '\n') {
      out += endings ? '⟨LF⟩\n' : '\n';
      continue;
    }
    if (ch === '\t') {
      out += '⟨TAB⟩';
      continue;
    }
    const cp = text.codePointAt(i) as number;
    const named = INVISIBLE[cp];
    if (named !== undefined || (cp !== 0x20 && (FORMAT_OR_CONTROL.test(ch) || ODD_SPACE.test(ch)))) {
      out += `⟨${named ?? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`}⟩`;
      if (cp > 0xffff) i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Strips every invisible character `findInvisibles` would report. */
export function removeInvisibles(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) {
      out += ch;
      continue;
    }
    const odd = INVISIBLE[cp] !== undefined || FORMAT_OR_CONTROL.test(ch) || ODD_SPACE.test(ch);
    // An odd space becomes an ordinary one; a zero-width character goes.
    if (odd) out += ODD_SPACE.test(ch) ? ' ' : '';
    else out += ch;
  }
  return out;
}
