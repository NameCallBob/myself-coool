/**
 * Titles into URL slugs.
 *
 * The interesting decision is what to do with everything that is not ASCII.
 * There are three honest answers and this implements all three, because which
 * one is right depends on the site: strip it and `台北美食指南` becomes an empty
 * slug; keep it and the URL is readable but 42 bytes of percent-encoding in the
 * address bar; transliterate it and `Ünïcödé` becomes `unicode`.
 *
 * Transliteration here means Latin-script diacritics only — Unicode NFD pulls a
 * base letter apart from its accent, so dropping the combining marks leaves the
 * letter behind, plus a small table for the letters that have no decomposition
 * (ß, æ, ø, ł…). There is no pinyin and no Cyrillic romanisation: those need
 * dictionaries, and a table that only half works produces slugs that look right
 * and are wrong. For CJK, `keep` is the honest option.
 */

export type NonAscii = 'strip' | 'keep' | 'transliterate';

export type Options = {
  separator: string;
  lowercase: boolean;
  nonAscii: NonAscii;
  /** Characters, not bytes. 0 means no limit. */
  maxLength: number;
  /** Cut at a separator rather than mid-word. */
  wordSafe: boolean;
  /** The word `&` becomes. Empty leaves it to be treated as a separator. */
  ampersand: string;
};

export const DEFAULTS: Options = {
  separator: '-',
  lowercase: true,
  nonAscii: 'transliterate',
  maxLength: 60,
  wordSafe: true,
  ampersand: 'and',
};

/**
 * Letters with no canonical decomposition, so NFD leaves them whole.
 * Listed rather than guessed; each one is the spelling its own language uses
 * when the letter is unavailable.
 */
export const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ø: 'o',
  Ø: 'O',
  å: 'a',
  Å: 'A',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ł: 'l',
  Ł: 'L',
  ħ: 'h',
  Ħ: 'H',
  ı: 'i',
  İ: 'I',
  ŋ: 'ng',
  Ŋ: 'Ng',
  ŧ: 't',
  Ŧ: 'T',
  ĸ: 'k',
  '№': 'no',
};

/** Combining marks, the things NFD separates out. */
const MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃰︠-︯]/g;

/**
 * Latin diacritics folded to their base letters.
 *
 * `å` is in the table above even though NFD would decompose it: in Danish,
 * Norwegian and Swedish it is its own letter and folding it to `a` is the
 * accepted substitution, which is the same answer NFD gives — the entry only
 * documents that it was a decision rather than an accident.
 */
export function transliterate(text: string): string {
  let out = '';
  for (const ch of text) {
    const special = SPECIAL_LETTERS[ch];
    out += special ?? ch;
  }
  return out.normalize('NFD').replace(MARKS, '');
}

const ASCII_WORD = /[A-Za-z0-9]/;
const ANY_WORD = /[\p{L}\p{N}]/u;

/**
 * One slug.
 *
 * Everything that is not a kept word character becomes a separator, then runs of
 * separators collapse and the ends are trimmed. Doing it in that order is what
 * makes `Hello -- World!!` and `Hello World` produce the same slug.
 */
export function slugify(input: string, options: Options = DEFAULTS): string {
  const separator = options.separator;
  let text = input;

  if (options.ampersand !== '' && options.ampersand !== '&') {
    // Spaces around it so `A&B` becomes `a-and-b`, not `aandb`.
    text = text.replace(/&/g, ` ${options.ampersand} `);
  }
  if (options.nonAscii === 'transliterate') text = transliterate(text);
  if (options.lowercase) text = text.toLowerCase();

  const keepAnyScript = options.nonAscii === 'keep';
  let out = '';
  let pendingSeparator = false;
  for (const ch of text) {
    const keep = keepAnyScript ? ANY_WORD.test(ch) : ASCII_WORD.test(ch);
    if (keep) {
      // The separator is only emitted once something follows it, which trims
      // the leading and collapses runs without a second pass.
      if (pendingSeparator && out !== '') out += separator;
      pendingSeparator = false;
      out += ch;
    } else {
      pendingSeparator = true;
    }
  }

  return truncate(out, options);
}

/**
 * Length capping.
 *
 * Word-safe cutting only backs off when the cut actually landed inside a word.
 * Backing off unconditionally throws away a whole word that happened to end
 * exactly on the limit — `one-two-three` capped at 7 is `one-two`, not `one`.
 * With no separator inside the limit at all, a hard cut beats returning nothing.
 */
export function truncate(slug: string, options: Options): string {
  const limit = options.maxLength;
  if (limit <= 0) return slug;
  const chars = [...slug];
  if (chars.length <= limit) return slug;

  let cut = chars.slice(0, limit).join('');
  const brokeAWord =
    options.separator !== '' &&
    !cut.endsWith(options.separator) &&
    !chars.slice(limit).join('').startsWith(options.separator);
  if (options.wordSafe && brokeAWord) {
    const at = cut.lastIndexOf(options.separator);
    if (at > 0) cut = cut.slice(0, at);
  }
  // A hard cut can leave the separator dangling.
  while (options.separator !== '' && cut.endsWith(options.separator)) {
    cut = cut.slice(0, -options.separator.length);
  }
  return cut;
}

export type SlugRow = { source: string; slug: string; duplicate: boolean };

/**
 * A list of titles slugged together, with collisions numbered.
 *
 * Two posts called "Notes" cannot share a URL, so the second becomes `notes-2`.
 * The counter is per distinct slug, and the suffix uses the chosen separator so
 * an underscore-separated site does not suddenly emit a hyphen.
 */
export function uniqueSlugs(lines: readonly string[], options: Options = DEFAULTS): SlugRow[] {
  const seen = new Map<string, number>();
  return lines.map((source) => {
    const base = slugify(source, options);
    if (base === '') return { source, slug: '', duplicate: false };
    const times = seen.get(base) ?? 0;
    seen.set(base, times + 1);
    if (times === 0) return { source, slug: base, duplicate: false };
    const suffix = `${options.separator}${times + 1}`;
    return { source, slug: truncate(base, options) + suffix, duplicate: true };
  });
}

/** What the slug looks like in a URL once the browser has encoded it. */
export function percentEncoded(slug: string): string {
  return encodeURIComponent(slug);
}

/** UTF-8 byte length — the number a URL length limit actually counts. */
export function byteLength(slug: string): number {
  let n = 0;
  for (const ch of slug) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else n += 4;
  }
  return n;
}
