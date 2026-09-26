/**
 * Two different jobs share this tool, and keeping them apart is the whole idea.
 *
 * An identifier (`parseHTTPResponse`) has no punctuation and no grammar: it is a
 * list of words glued together, so converting it means splitting that list and
 * re-gluing it another way. A sentence has both, so converting it means leaving
 * everything that is not a word exactly where it is. Running prose through an
 * identifier splitter destroys the punctuation; running an identifier through a
 * prose function leaves `parsehttpresponse`. So the word-boundary functions
 * below are used for the naming styles, and the in-place functions for title
 * and sentence case.
 *
 * Word splitting is Unicode-aware because an identifier can contain Chinese,
 * and `[A-Za-z]` would drop it silently rather than passing it through.
 */

export type CaseStyle =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'
  | 'path'
  | 'train'
  | 'lower'
  | 'upper'
  | 'sentence'
  | 'title';

export const CASE_STYLES: readonly CaseStyle[] = [
  'camel',
  'pascal',
  'snake',
  'kebab',
  'constant',
  'dot',
  'path',
  'train',
  'lower',
  'upper',
  'sentence',
  'title',
];

/** Styles built by re-gluing words; the rest edit the text in place. */
export const NAMING_STYLES: readonly CaseStyle[] = [
  'camel',
  'pascal',
  'snake',
  'kebab',
  'constant',
  'dot',
  'path',
  'train',
];

export type Options = {
  /** Split `utf8` into `utf` + `8`. Off by default: `utf8Length` reads better. */
  splitDigits?: boolean;
  /**
   * Leave the capitals a word already has alone: a run of them (`HTTP` does not
   * become `Http`) and a capital past the first letter (`iPhone`, `McDonald`).
   */
  preserveAcronyms?: boolean;
  /** Words title case leaves lowercase unless they are first or last. */
  smallWords?: readonly string[];
};

/**
 * The words title case keeps lowercase: articles, coordinating conjunctions and
 * the short prepositions. There is no single authority — AP, Chicago and the
 * New York Times all draw the line somewhere else, mostly on how long a
 * preposition has to be before it gets a capital. This is the AP-ish list, and
 * the UI lets you edit it, because the house style that matters is yours.
 */
export const SMALL_WORDS: readonly string[] = [
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'nor',
  'of', 'on', 'or', 'per', 'the', 'to', 'v', 'v.', 'via', 'vs', 'vs.',
];

/**
 * Word pieces of an identifier.
 *
 * The first alternative is the acronym rule: a run of two or more capitals ends
 * one word early when what follows is a capital plus a lowercase, because that
 * capital starts the next word — `HTTPServer` is `HTTP` plus `Server`, not
 * `HTTPS` plus `erver`. The run has to be two long, or `IPv4Address` would
 * split after the `I`.
 */
const TOKENS_KEEP_DIGITS =
  /\p{Lu}{2,}(?=\p{Lu}\p{Ll}|[^\p{L}\p{N}]|$)|\p{Lu}?[\p{Ll}\p{N}]+|\p{Lu}+\p{N}*|\p{Lo}+\p{N}*|\p{N}+/gu;

const TOKENS_SPLIT_DIGITS =
  /\p{Lu}{2,}(?=\p{Lu}\p{Ll}|[^\p{L}\p{N}]|$)|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{Lo}+|\p{N}+/gu;

/** A word as prose sees it: a letter followed by letters or digits. */
const WORDISH = /\p{L}[\p{L}\p{N}]*/gu;

const ALL_CAPS = /^\p{Lu}[\p{Lu}\p{N}]+$/u;

/**
 * A capital anywhere but the front: `iPhone`, `McDonald`, `eBay`, `LaTeX`.
 *
 * `ALL_CAPS` cannot cover these — it wants two or more capitals and nothing
 * else — so without a second test the only thing title case could do with
 * `iPhone` was `Iphone`. Iterated by code point because an astral letter is two
 * UTF-16 units and `slice(1)` would test half of one.
 */
function hasInnerCapital(word: string): boolean {
  const chars = [...word];
  for (let i = 1; i < chars.length; i += 1) {
    if (/\p{Lu}/u.test(chars[i])) return true;
  }
  return false;
}

export function splitWords(input: string, options?: Options): string[] {
  const pattern = options?.splitDigits ? TOKENS_SPLIT_DIGITS : TOKENS_KEEP_DIGITS;
  pattern.lastIndex = 0;
  return input.match(pattern) ?? [];
}

/** Lowercase, unless it is an acronym the caller asked to keep. */
function fold(word: string, options?: Options): string {
  if (options?.preserveAcronyms && ALL_CAPS.test(word)) return word;
  return word.toLowerCase();
}

/**
 * First letter up, rest down — except a word the caller asked to keep whole.
 *
 * Two shapes are kept when `preserveAcronyms` is on: a run of capitals (`HTTP`)
 * and a word with a capital past its first letter (`iPhone`, `McDonald`). The
 * second is not an acronym, but it is the same promise — the capitals in it were
 * typed on purpose — and lowercasing them is the one edit a title caser cannot
 * be forgiven for, because `Mcdonald` looks like a spelling mistake rather than
 * a formatting choice. Nothing is added: a word already written in lower case
 * still gets its initial capital.
 */
function capitalize(word: string, options?: Options): string {
  if (options?.preserveAcronyms && (ALL_CAPS.test(word) || hasInnerCapital(word))) return word;
  const lower = word.toLowerCase();
  // Iterated by code point: the first "character" of an astral word is two
  // UTF-16 units, and slicing at 1 would cut a surrogate pair in half.
  const first = [...lower][0] ?? '';
  return first.toUpperCase() + lower.slice(first.length);
}

export function toCamel(input: string, options?: Options): string {
  const words = splitWords(input, options);
  return words
    .map((word, index) => (index === 0 ? fold(word, options) : capitalize(word, options)))
    .join('');
}

export function toPascal(input: string, options?: Options): string {
  return splitWords(input, options)
    .map((word) => capitalize(word, options))
    .join('');
}

function joinLower(input: string, separator: string, options?: Options): string {
  return splitWords(input, options)
    .map((word) => fold(word, options))
    .join(separator);
}

export function toSnake(input: string, options?: Options): string {
  return joinLower(input, '_', options);
}

export function toKebab(input: string, options?: Options): string {
  return joinLower(input, '-', options);
}

export function toDot(input: string, options?: Options): string {
  return joinLower(input, '.', options);
}

export function toPath(input: string, options?: Options): string {
  return joinLower(input, '/', options);
}

export function toConstant(input: string, options?: Options): string {
  return splitWords(input, options)
    .map((word) => word.toUpperCase())
    .join('_');
}

/** `Train-Case`: every word capitalised, hyphen separated. HTTP headers use it. */
export function toTrain(input: string, options?: Options): string {
  return splitWords(input, options)
    .map((word) => capitalize(word, options))
    .join('-');
}

/**
 * Lowercase everything, in place.
 *
 * Punctuation, spacing and line breaks survive untouched; only words change,
 * so an acronym can be exempted without having to reconstruct the string.
 */
export function toLowerText(input: string, options?: Options): string {
  WORDISH.lastIndex = 0;
  return input.replace(WORDISH, (word) => fold(word, options));
}

/**
 * Upper case, by Unicode's own full case mapping.
 *
 * Deliberately `toUpperCase()` over the whole string rather than word by word:
 * there is nothing to exempt, since a preserved acronym is already upper case.
 * The mapping is not length-preserving and not invertible — `ß` uppercases to
 * `SS`, the `ﬁ` ligature to `FI` — so upper and lower are not a round trip, and
 * no amount of bookkeeping here would make them one. Keep the original if you
 * need the text back.
 */
export function toUpperText(input: string): string {
  return input.toUpperCase();
}

/** Sentence ends, for deciding where a capital letter belongs. */
const AFTER_END = /(^|[.!?。！？…]["'”’)\]]*[ \t]*|\n[ \t]*)(\p{L})/gu;

/**
 * Sentence case: everything down, then the first letter of each sentence up.
 *
 * The sentence boundary is the same approximation used in A01 — a terminator
 * followed by space — so an abbreviation like `e.g.` starts a new "sentence"
 * and gets a capital. Check the output; there is no dictionary here to know
 * that `e.g.` is not the end of anything.
 */
export function toSentence(input: string, options?: Options): string {
  const lowered = toLowerText(input, options);
  AFTER_END.lastIndex = 0;
  return lowered.replace(AFTER_END, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * Title case, line by line.
 *
 * First and last word always take a capital; the small words in between do not.
 * The decision needs to know a word's position among the words of its line, so
 * the matches are collected first and the string rebuilt from them, rather than
 * replaced in one pass.
 */
export function toTitle(input: string, options?: Options): string {
  const small = new Set((options?.smallWords ?? SMALL_WORDS).map((word) => word.toLowerCase()));

  return input
    .split('\n')
    .map((line) => {
      WORDISH.lastIndex = 0;
      const found = [...line.matchAll(WORDISH)];
      if (found.length === 0) return line;

      let out = '';
      let cursor = 0;
      found.forEach((match, index) => {
        const start = match.index ?? 0;
        out += line.slice(cursor, start);
        const word = match[0];
        const edge = index === 0 || index === found.length - 1;
        out += !edge && small.has(word.toLowerCase())
          ? fold(word, options)
          : capitalize(word, options);
        cursor = start + word.length;
      });
      return out + line.slice(cursor);
    })
    .join('\n');
}

/**
 * One style applied to the text.
 *
 * Naming styles run per line, because a pasted column of names is the common
 * case and joining the lines would produce one enormous identifier. Prose
 * styles already handle line breaks themselves.
 */
export function convert(input: string, style: CaseStyle, options?: Options): string {
  if (style === 'lower') return toLowerText(input, options);
  if (style === 'upper') return toUpperText(input);
  if (style === 'sentence') return toSentence(input, options);
  if (style === 'title') return toTitle(input, options);

  const perLine: Record<string, (line: string) => string> = {
    camel: (line) => toCamel(line, options),
    pascal: (line) => toPascal(line, options),
    snake: (line) => toSnake(line, options),
    kebab: (line) => toKebab(line, options),
    constant: (line) => toConstant(line, options),
    dot: (line) => toDot(line, options),
    path: (line) => toPath(line, options),
    train: (line) => toTrain(line, options),
  };
  const apply = perLine[style];
  return input.split('\n').map(apply).join('\n');
}

/** Every style at once, in catalogue order. */
export function convertAll(input: string, options?: Options): { style: CaseStyle; text: string }[] {
  return CASE_STYLES.map((style) => ({ style, text: convert(input, style, options) }));
}
