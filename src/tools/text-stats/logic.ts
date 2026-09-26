/**
 * Counting text is only simple until the text is mixed.
 *
 * "How many words" has no single answer once a paragraph contains both English
 * and Chinese: English words are delimited by spaces, Chinese is not, so the
 * usual `split(/\s+/)` reports one enormous word for a Chinese paragraph and a
 * reading time of two seconds. Everything here therefore counts the two writing
 * systems separately and only adds them at the end, where the reader can see
 * both halves and the rate applied to each.
 *
 * Unicode property escapes do the script classification (`\p{Script=Han}` and
 * friends) rather than hand-written code-point ranges: the ranges are a moving
 * target across Unicode versions, and Extension B lives outside the BMP where
 * a naive range test silently misses surrogate pairs.
 */

/** Beyond this many UTF-16 units, count the head and say so. */
export const MAX_INPUT = 2_000_000;

export type Counts = {
  /** `String.length` — what a database column limit usually means. */
  utf16: number;
  /** Code points — what "characters" means to a programmer. */
  codePoints: number;
  /** User-perceived characters. One flag or emoji family is one grapheme. */
  graphemes: number;
  utf8Bytes: number;
  /** Code points that are not whitespace. */
  visible: number;
  whitespace: number;
  /** Han, Hiragana, Katakana, Hangul. The things counted as 字. */
  cjk: number;
  /** Full-width and CJK punctuation. Counted apart from 字 on purpose. */
  cjkPunct: number;
  /** Space-delimited alphabetic tokens. */
  latinWords: number;
  /** Tokens that are purely numeric, including 3.14 and 1,000. */
  numbers: number;
  lines: number;
  blankLines: number;
  paragraphs: number;
  sentences: number;
  /** True when the input was longer than MAX_INPUT and only the head counted. */
  truncated: boolean;
};

export type Rates = {
  /** CJK characters per minute. */
  cjkPerMinute: number;
  /** Latin words per minute. */
  wordsPerMinute: number;
};

/** Silent-reading rates, deliberately conservative. Editable in the UI. */
export const DEFAULT_RATES: Rates = { cjkPerMinute: 300, wordsPerMinute: 200 };

const CJK_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/**
 * CJK and full-width punctuation, listed rather than taken as a block range:
 * U+FF00–FFEF also holds full-width Latin letters and digits, which are not
 * punctuation and must not be counted as such.
 */
const CJK_PUNCT =
  /[、。〃〈-】〔-〟・！＂＃％-，．／：-？＠［-＿｛-～‘’“”—…·]/gu;

/**
 * A word token: letters or digits, with internal apostrophes, hyphens,
 * underscores and dots allowed so `don't`, `state-of-the-art` and `3.14`
 * survive as one token each.
 */
const WORD = /[\p{L}\p{N}]+(?:['’._-][\p{L}\p{N}]+)*/gu;

const HAS_LETTER = /\p{L}/u;

/**
 * Sentence ends. Full-width terminators always close a sentence; ASCII ones
 * need a following boundary, or every `e.g.` and `3.5` would be a sentence.
 * (`e.g. ` still counts as one — see the note under the tool.)
 */
const SENTENCE_END = /[。！？…｡]+|[.!?]+(?=["'”’)\]\s]|$)/gu;

const WHITESPACE = /\s/u;

/** UTF-8 length without allocating a buffer. */
function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else n += 4;
  }
  return n;
}

function matchCount(text: string, pattern: RegExp): number {
  // Patterns are module-level and global, so lastIndex has to be reset:
  // a shared global regex otherwise resumes where the previous call stopped.
  pattern.lastIndex = 0;
  let n = 0;
  while (pattern.exec(text) !== null) n += 1;
  return n;
}

/**
 * User-perceived character count.
 *
 * `Intl.Segmenter` is the only correct way to do this — a family emoji is five
 * code points and eight UTF-16 units but one character to the person who typed
 * it. Where the API is missing, fall back to code points and let the caller
 * notice that the two readings agree.
 */
export function graphemeCount(text: string): number {
  const Segmenter = (
    Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }
  ).Segmenter;
  if (!Segmenter) return [...text].length;
  const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
  // Stepped by hand rather than `for…of`: the segment value is not wanted, and
  // materialising the array would allocate one object per character.
  const steps = segmenter.segment(text)[Symbol.iterator]();
  let n = 0;
  for (let step = steps.next(); step.done !== true; step = steps.next()) n += 1;
  return n;
}

/** Lines, with CRLF and CR folded so a Windows file does not double-count. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Blocks separated by one or more blank lines, blanks discarded. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t　]*\n+/)
    .map((block) => block.trim())
    .filter((block) => block !== '');
}

export function countWords(text: string): { latinWords: number; numbers: number } {
  // CJK letters are removed first: they have no delimiters, so leaving them in
  // would glue a whole Chinese paragraph onto the neighbouring English word.
  const latin = text.replace(CJK_LETTER, ' ');
  WORD.lastIndex = 0;
  let latinWords = 0;
  let numbers = 0;
  for (;;) {
    const found = WORD.exec(latin);
    if (found === null) break;
    if (HAS_LETTER.test(found[0])) latinWords += 1;
    else numbers += 1;
  }
  return { latinWords, numbers };
}

export function countSentences(text: string): number {
  return matchCount(text, SENTENCE_END);
}

export function analyze(input: string): Counts {
  const truncated = input.length > MAX_INPUT;
  const text = truncated ? input.slice(0, MAX_INPUT) : input;

  let whitespace = 0;
  let codePoints = 0;
  for (const ch of text) {
    codePoints += 1;
    if (WHITESPACE.test(ch)) whitespace += 1;
  }

  const lines = splitLines(text);
  const words = countWords(text);

  return {
    utf16: text.length,
    codePoints,
    graphemes: graphemeCount(text),
    utf8Bytes: utf8Length(text),
    visible: codePoints - whitespace,
    whitespace,
    cjk: matchCount(text, CJK_LETTER),
    cjkPunct: matchCount(text, CJK_PUNCT),
    latinWords: words.latinWords,
    numbers: words.numbers,
    lines: lines.length,
    blankLines: lines.filter((line) => line.trim() === '').length,
    paragraphs: splitParagraphs(text).length,
    sentences: countSentences(text),
    truncated,
  };
}

export type Reading = { cjkSeconds: number; latinSeconds: number; seconds: number };

/**
 * Reading time as two independent terms.
 *
 * Mixed text is read at neither rate, so the two halves are timed with their
 * own and then added. Rates are an argument rather than a constant because the
 * published figures disagree by a factor of two and the only person who knows
 * how fast this particular reader reads is the reader.
 */
export function readingTime(counts: Counts, rates: Rates = DEFAULT_RATES): Reading {
  const cjkRate = rates.cjkPerMinute > 0 ? rates.cjkPerMinute : DEFAULT_RATES.cjkPerMinute;
  const wordRate = rates.wordsPerMinute > 0 ? rates.wordsPerMinute : DEFAULT_RATES.wordsPerMinute;
  const cjkSeconds = (counts.cjk / cjkRate) * 60;
  const latinSeconds = ((counts.latinWords + counts.numbers) / wordRate) * 60;
  return { cjkSeconds, latinSeconds, seconds: cjkSeconds + latinSeconds };
}

/** `1 分 20 秒` / `1m 20s`, or `< 1 秒` for anything under a second. */
export function formatDuration(seconds: number, zh: boolean): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return zh ? '0 秒' : '0s';
  if (seconds < 1) return zh ? '不到 1 秒' : 'under 1s';
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return zh ? `${rest} 秒` : `${rest}s`;
  if (rest === 0) return zh ? `${minutes} 分` : `${minutes}m`;
  return zh ? `${minutes} 分 ${rest} 秒` : `${minutes}m ${rest}s`;
}

export type Frequency = { token: string; n: number; share: number };

/**
 * Token frequency, with CJK counted per character.
 *
 * Without a dictionary there is no word segmentation for Chinese, and guessing
 * at one would produce confidently wrong words. Single characters are a true
 * statement about the text; `彌補` split as `彌` and `補` is at least not a lie.
 */
export function frequency(
  text: string,
  options?: { limit?: number; ignoreCase?: boolean; minLength?: number; includeCjk?: boolean }
): Frequency[] {
  const limit = options?.limit ?? 20;
  const ignoreCase = options?.ignoreCase ?? true;
  const minLength = options?.minLength ?? 1;
  const includeCjk = options?.includeCjk ?? true;

  const tally = new Map<string, number>();
  const bump = (token: string) => {
    if ([...token].length < minLength) return;
    const key = ignoreCase ? token.toLowerCase() : token;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  };

  if (includeCjk) {
    CJK_LETTER.lastIndex = 0;
    for (;;) {
      const found = CJK_LETTER.exec(text);
      if (found === null) break;
      bump(found[0]);
    }
  }

  const latin = text.replace(CJK_LETTER, ' ');
  WORD.lastIndex = 0;
  for (;;) {
    const found = WORD.exec(latin);
    if (found === null) break;
    bump(found[0]);
  }

  let total = 0;
  for (const n of tally.values()) total += n;

  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token, n]) => ({ token, n, share: total === 0 ? 0 : n / total }));
}
