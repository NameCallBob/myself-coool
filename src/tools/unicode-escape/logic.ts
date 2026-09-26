/**
 * Unicode escapes, and a per-character inspector for when one character is
 * the whole problem.
 *
 * Two ideas the escape styles disagree about. `\uXXXX` is a *code unit*
 * escape — it comes from a time when 16 bits was assumed to be enough, so an
 * emoji is two of them and any code that reverses the escape one unit at a
 * time produces two broken halves. `\u{...}` is a *code point* escape and has
 * no such problem, but it is only legal in JavaScript, Rust and a handful of
 * others. Getting this wrong does not throw; it produces text that looks fine
 * in one editor and shows two grey boxes in another.
 *
 * The inspector does not ship a Unicode name table — that is a megabyte of
 * data for this drawer's whole budget. Instead it asks the engine, through
 * regular-expression property escapes, for the real general category, script
 * and "is this default-ignorable" answers, and carries hand-written names only
 * for the characters that actually cause support tickets: the invisible ones.
 */

export type Style =
  /** `\uXXXX`, one per UTF-16 code unit. JSON, Java, C#, older JavaScript. */
  | 'u16'
  /** `\u{1F600}`, one per code point. ES2015+, Rust. */
  | 'brace'
  /** `\xNN` where it fits in a byte, `\uXXXX` otherwise. JavaScript, C, PHP. */
  | 'x'
  /** `\xNN` / `\uXXXX` / `\UXXXXXXXX`. Python, and C99's universal names. */
  | 'python'
  /** `U+1F600 `, space separated. For talking about characters, not for code. */
  | 'codepoint'
  /** `\1F600 ` with a trailing space. CSS identifiers and content strings. */
  | 'css';

export type Scope =
  /** Everything above U+007F. */
  | 'nonAscii'
  /** Every character, including plain ASCII letters. */
  | 'all'
  /** Only the characters you cannot see — the usual culprits. */
  | 'suspicious';

export type EscapeOptions = { style?: Style; scope?: Scope; upper?: boolean };

function hex(cp: number, width: number, upper: boolean): string {
  const text = cp.toString(16).padStart(width, '0');
  return upper ? text.toUpperCase() : text;
}

/** One code point rendered in the chosen style; may be several escapes. */
export function escapeCodePoint(cp: number, style: Style, upper = true): string {
  switch (style) {
    case 'brace':
      return `\\u{${hex(cp, 1, upper)}}`;
    case 'codepoint':
      // Space-terminated like the CSS form: `U+4E2DU+6587` cannot be read back,
      // because the `D` at the end of one is a legal hex digit of the next.
      return `U+${hex(cp, 4, true)} `;
    case 'css':
      // CSS needs the terminating space, or a following hex digit joins on.
      return `\\${hex(cp, 1, upper)} `;
    case 'python':
      if (cp <= 0xff) return `\\x${hex(cp, 2, upper)}`;
      if (cp <= 0xffff) return `\\u${hex(cp, 4, upper)}`;
      return `\\U${hex(cp, 8, upper)}`;
    case 'x':
      if (cp <= 0xff) return `\\x${hex(cp, 2, upper)}`;
      return surrogateEscapes(cp, upper);
    case 'u16':
    default:
      return surrogateEscapes(cp, upper);
  }
}

/** A code point as one or two `\uXXXX` escapes, the UTF-16 way. */
function surrogateEscapes(cp: number, upper: boolean): string {
  if (cp <= 0xffff) return `\\u${hex(cp, 4, upper)}`;
  const v = cp - 0x10000;
  const high = 0xd800 + (v >> 10);
  const low = 0xdc00 + (v & 0x3ff);
  return `\\u${hex(high, 4, upper)}\\u${hex(low, 4, upper)}`;
}

export function escapeUnicode(text: string, options: EscapeOptions = {}): string {
  const style = options.style ?? 'u16';
  const scope = options.scope ?? 'nonAscii';
  const upper = options.upper ?? true;
  let out = '';
  // `for…of` walks code points, so a surrogate pair is one iteration and the
  // style — not the loop — decides whether it becomes one escape or two.
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const needed =
      scope === 'all' ? true : scope === 'suspicious' ? isSuspicious(cp) : cp > 0x7f;
    out += needed ? escapeCodePoint(cp, style, upper) : ch;
  }
  return out;
}

/* ── Unescaping ───────────────────────────── */

/** The one-letter escapes every C-descended language shares. */
const SIMPLE: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  a: '\u0007', // BEL, spelled \a by C and Python
  e: '\u001b', // ESC, a GCC and shell extension
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
  '/': '/',
};

export type UnescapeResult = {
  text: string;
  /** Escape sequences that were left alone because nothing recognised them. */
  unknown: string[];
};

/**
 * Turns escapes back into characters, accepting every style this tool emits.
 *
 * Unrecognised sequences are passed through rather than dropped or guessed at:
 * a `\d` inside a pasted regular expression means "digit", and silently
 * turning it into `d` would corrupt the very thing you pasted in to inspect.
 */
export function unescapeUnicode(text: string): UnescapeResult {
  let out = '';
  const unknown = new Set<string>();
  let i = 0;

  while (i < text.length) {
    // `U+XXXX`, the display form. Guarded against a preceding letter or digit
    // so that an identifier like `MAU+1` is not read as a code point.
    if (
      (text[i] === 'U' || text[i] === 'u') &&
      text[i + 1] === '+' &&
      (i === 0 || !/[0-9A-Za-z]/.test(text[i - 1]))
    ) {
      const digits = /^[0-9a-fA-F]{1,6}/.exec(text.slice(i + 2))?.[0];
      if (digits) {
        const cp = Number.parseInt(digits, 16);
        if (cp <= 0x10ffff) {
          out += String.fromCodePoint(cp);
          i += 2 + digits.length;
          continue;
        }
      }
    }

    if (text[i] !== '\\') {
      out += text[i];
      i += 1;
      continue;
    }

    const next = text[i + 1];

    if (next === 'u' && text[i + 2] === '{') {
      const close = text.indexOf('}', i + 3);
      const digits = close === -1 ? null : text.slice(i + 3, close);
      if (digits && /^[0-9a-fA-F]{1,6}$/.test(digits) && Number.parseInt(digits, 16) <= 0x10ffff) {
        out += String.fromCodePoint(Number.parseInt(digits, 16));
        i = close + 1;
        continue;
      }
    }

    if (next === 'u') {
      const digits = /^[0-9a-fA-F]{4}/.exec(text.slice(i + 2))?.[0];
      if (digits) {
        // fromCharCode, not fromCodePoint: a lone high surrogate written here
        // has to stay a high surrogate so the low one that follows can pair
        // with it, which is the whole reason \uXXXX comes in twos.
        out += String.fromCharCode(Number.parseInt(digits, 16));
        i += 6;
        continue;
      }
    }

    if (next === 'x') {
      const digits = /^[0-9a-fA-F]{2}/.exec(text.slice(i + 2))?.[0];
      if (digits) {
        out += String.fromCharCode(Number.parseInt(digits, 16));
        i += 4;
        continue;
      }
    }

    if (next === 'U') {
      const digits = /^[0-9a-fA-F]{8}/.exec(text.slice(i + 2))?.[0];
      if (digits && Number.parseInt(digits, 16) <= 0x10ffff) {
        out += String.fromCodePoint(Number.parseInt(digits, 16));
        i += 10;
        continue;
      }
    }

    if (next !== undefined && next in SIMPLE) {
      out += SIMPLE[next];
      i += 2;
      continue;
    }

    if (next === undefined) {
      out += '\\';
      i += 1;
      continue;
    }

    unknown.add(`\\${next}`);
    out += `\\${next}`;
    i += 2;
  }

  return { text: out, unknown: [...unknown] };
}

/* ── Inspection ───────────────────────────── */

/**
 * General category, asked of the engine rather than shipped as a table.
 *
 * Order matters: the first match wins, and the specific classes are listed
 * before the general ones.
 */
const CATEGORIES: { code: string; re: RegExp }[] = [
  { code: 'Cc', re: /\p{Cc}/u },
  { code: 'Cf', re: /\p{Cf}/u },
  { code: 'Cs', re: /\p{Cs}/u },
  { code: 'Co', re: /\p{Co}/u },
  { code: 'Zs', re: /\p{Zs}/u },
  { code: 'Zl', re: /\p{Zl}/u },
  { code: 'Zp', re: /\p{Zp}/u },
  { code: 'Mn', re: /\p{Mn}/u },
  { code: 'Mc', re: /\p{Mc}/u },
  { code: 'Me', re: /\p{Me}/u },
  { code: 'Nd', re: /\p{Nd}/u },
  { code: 'Nl', re: /\p{Nl}/u },
  { code: 'No', re: /\p{No}/u },
  { code: 'Lu', re: /\p{Lu}/u },
  { code: 'Ll', re: /\p{Ll}/u },
  { code: 'Lt', re: /\p{Lt}/u },
  { code: 'Lm', re: /\p{Lm}/u },
  { code: 'Lo', re: /\p{Lo}/u },
  { code: 'P', re: /\p{P}/u },
  { code: 'Sm', re: /\p{Sm}/u },
  { code: 'Sc', re: /\p{Sc}/u },
  { code: 'Sk', re: /\p{Sk}/u },
  { code: 'So', re: /\p{So}/u },
];

const SCRIPTS: { name: string; re: RegExp }[] = [
  { name: 'Latin', re: /\p{Script=Latin}/u },
  { name: 'Han', re: /\p{Script=Han}/u },
  { name: 'Hiragana', re: /\p{Script=Hiragana}/u },
  { name: 'Katakana', re: /\p{Script=Katakana}/u },
  { name: 'Hangul', re: /\p{Script=Hangul}/u },
  { name: 'Bopomofo', re: /\p{Script=Bopomofo}/u },
  { name: 'Greek', re: /\p{Script=Greek}/u },
  { name: 'Cyrillic', re: /\p{Script=Cyrillic}/u },
  { name: 'Arabic', re: /\p{Script=Arabic}/u },
  { name: 'Hebrew', re: /\p{Script=Hebrew}/u },
  { name: 'Devanagari', re: /\p{Script=Devanagari}/u },
  { name: 'Thai', re: /\p{Script=Thai}/u },
  { name: 'Inherited', re: /\p{Script=Inherited}/u },
  { name: 'Common', re: /\p{Script=Common}/u },
];

const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const NONCHARACTER = /\p{Noncharacter_Code_Point}/u;
const BIDI_CONTROL = /\p{Bidi_Control}/u;
const IS_EMOJI = /\p{Emoji}/u;
const VARIATION = /[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/u;

/**
 * Names for the characters that cause support tickets.
 *
 * No general Unicode name table is shipped, but these specific ones earn their
 * bytes: every one of them is invisible or nearly so, and every one has caused
 * a "the string looks identical but the comparison fails" bug.
 */
export const NOTABLE: Record<number, string> = {
  0x0009: 'TAB',
  0x000a: 'LINE FEED',
  0x000d: 'CARRIAGE RETURN',
  0x001b: 'ESCAPE',
  0x0020: 'SPACE',
  0x00a0: 'NO-BREAK SPACE',
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK',
  0x1680: 'OGHAM SPACE MARK',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR',
  0x2000: 'EN QUAD',
  0x2001: 'EM QUAD',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2004: 'THREE-PER-EM SPACE',
  0x2005: 'FOUR-PER-EM SPACE',
  0x2006: 'SIX-PER-EM SPACE',
  0x2007: 'FIGURE SPACE',
  0x2008: 'PUNCTUATION SPACE',
  0x2009: 'THIN SPACE',
  0x200a: 'HAIR SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x205f: 'MEDIUM MATHEMATICAL SPACE',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0x3000: 'IDEOGRAPHIC SPACE',
  0xfe0e: 'VARIATION SELECTOR-15 (text style)',
  0xfe0f: 'VARIATION SELECTOR-16 (emoji style)',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  0xfff9: 'INTERLINEAR ANNOTATION ANCHOR',
  0xfffa: 'INTERLINEAR ANNOTATION SEPARATOR',
  0xfffb: 'INTERLINEAR ANNOTATION TERMINATOR',
  0xfffc: 'OBJECT REPLACEMENT CHARACTER',
  0xfffd: 'REPLACEMENT CHARACTER',
  0xe0001: 'LANGUAGE TAG',
};

export function categoryOf(cp: number): string {
  const ch = String.fromCodePoint(cp);
  for (const entry of CATEGORIES) if (entry.re.test(ch)) return entry.code;
  // Everything the engine has no category for is unassigned.
  return 'Cn';
}

export function scriptOf(cp: number): string {
  const ch = String.fromCodePoint(cp);
  for (const entry of SCRIPTS) if (entry.re.test(ch)) return entry.name;
  return '—';
}

/**
 * Whether a character is one of the invisible troublemakers.
 *
 * "Invisible" here means: a control, a format character, default-ignorable, a
 * noncharacter, an unpaired surrogate, private use, or any space that is not
 * the ordinary U+0020 — because a no-break space looks exactly like a space and
 * compares unequal to one.
 */
export function isSuspicious(cp: number): boolean {
  if (cp === 0x20 || cp === 0x0a || cp === 0x09) return false;
  const category = categoryOf(cp);
  if (['Cc', 'Cf', 'Cs', 'Co', 'Cn', 'Zs', 'Zl', 'Zp'].includes(category)) return true;
  const ch = String.fromCodePoint(cp);
  return IGNORABLE.test(ch) || NONCHARACTER.test(ch) || VARIATION.test(ch);
}

export type CharInfo = {
  /** Index in code points, not code units. */
  index: number;
  char: string;
  cp: number;
  /** `U+XXXX`, at least four digits. */
  label: string;
  /** A name, for the characters this tool carries names for. */
  name: string | null;
  category: string;
  script: string;
  /** UTF-8 bytes, lowercase hex. */
  utf8: string;
  /** UTF-16 code units, `\uXXXX` form. */
  utf16: string;
  suspicious: boolean;
  emoji: boolean;
  bidi: boolean;
};

/** Above this many code points the table stops; the caller says so in the UI. */
export const INSPECT_LIMIT = 2000;

const HEX = '0123456789abcdef';

function utf8Hex(ch: string): string {
  const data = new TextEncoder().encode(ch);
  return [...data].map((b) => HEX[b >> 4] + HEX[b & 15]).join(' ');
}

export function inspect(text: string, limit = INSPECT_LIMIT): CharInfo[] {
  const rows: CharInfo[] = [];
  let index = 0;
  for (const ch of text) {
    if (rows.length >= limit) break;
    const cp = ch.codePointAt(0) as number;
    rows.push({
      index,
      char: ch,
      cp,
      label: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
      name: NOTABLE[cp] ?? null,
      category: categoryOf(cp),
      script: scriptOf(cp),
      utf8: utf8Hex(ch),
      utf16: surrogateEscapes(cp, true),
      suspicious: isSuspicious(cp),
      emoji: IS_EMOJI.test(ch),
      bidi: BIDI_CONTROL.test(ch),
    });
    index += 1;
  }
  return rows;
}

export type Summary = {
  codePoints: number;
  codeUnits: number;
  utf8Bytes: number;
  /** Code points that need a surrogate pair in UTF-16. */
  astral: number;
  suspicious: number;
  /** Grapheme clusters, when the engine can segment them. */
  graphemes: number | null;
};

/**
 * The counts that explain why "length" disagrees with what you see.
 *
 * Four different numbers are all called "length": UTF-16 code units (what
 * `String.length` returns), code points, UTF-8 bytes (what a database column
 * limit counts), and grapheme clusters (what a person counts). A flag emoji is
 * 1, 2, 8 and 1 of those respectively.
 */
export function summarise(text: string): Summary {
  let codePoints = 0;
  let astral = 0;
  let suspicious = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    codePoints += 1;
    if (cp > 0xffff) astral += 1;
    if (isSuspicious(cp)) suspicious += 1;
  }
  return {
    codePoints,
    codeUnits: text.length,
    utf8Bytes: new TextEncoder().encode(text).length,
    astral,
    suspicious,
    graphemes: countGraphemes(text),
  };
}

/** Grapheme clusters via Intl.Segmenter, or null where it is unavailable. */
export function countGraphemes(text: string): number | null {
  const segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: string }
      ) => { segment: (input: string) => Iterable<unknown> };
    }
  ).Segmenter;
  // Feature-detected rather than assumed: it is the newest thing this file
  // relies on, and a missing count is better than a thrown error.
  if (!segmenter) return null;
  return [...new segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}
