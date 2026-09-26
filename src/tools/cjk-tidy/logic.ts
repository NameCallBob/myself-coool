/**
 * Chinese typography repair, in the order the steps have to run.
 *
 * Every rule here is context-dependent, and the context changes as earlier rules
 * fire — which is why this is a pipeline and not a list of independent
 * substitutions. Ellipses are settled before punctuation, or the first dot of
 * `...` gets converted to `。` on its own. Punctuation is settled before spacing,
 * because whether a space belongs between two characters depends on whether the
 * punctuation between them ended up full-width.
 *
 * The rules are also deliberately conservative. A tool that turns `檔案.txt`
 * into `檔案。txt` is worse than no tool: the output looks plausible and is
 * wrong. So `.` and `:` only become full-width when what follows is *not* a
 * Latin letter or digit, which is what keeps file names, version numbers and
 * URLs intact.
 */

export type PunctuationMode = 'keep' | 'contextual' | 'full' | 'half';
export type QuoteStyle = 'curly' | 'corner';
export type WidthMode = 'keep' | 'half' | 'full';
export type RunMode = 'keep' | 'cjk' | 'single';

export type Options = {
  /** Insert a space between CJK and Latin letters, digits and @#$%&. */
  spaceCjkLatin: boolean;
  /** Full-width ASCII letters and digits to half-width, or the reverse. */
  width: WidthMode;
  /** U+3000 IDEOGRAPHIC SPACE to a plain space. */
  fullwidthSpace: boolean;
  /** Half-width katakana composed into full-width, via NFKC on those runs. */
  composeKana: boolean;
  punctuation: PunctuationMode;
  /** `...` to `……` (CJK convention) or `…` (single). */
  ellipsis: RunMode;
  /** `--` to `——` or `—`, only next to CJK. */
  dash: RunMode;
  /** Straight quotes paired into “ ” ‘ ’ or 「 」 『 』. */
  quotes: boolean;
  quoteStyle: QuoteStyle;
  /** Drop spaces and tabs that sit against full-width punctuation. */
  trimAroundFullwidth: boolean;
  /** Drop spaces and tabs between two CJK characters. Off by default. */
  dropSpaceBetweenCjk: boolean;
  /** Runs of spaces and tabs collapsed to one. */
  collapseSpaces: boolean;
};

export const DEFAULTS: Options = {
  spaceCjkLatin: true,
  width: 'half',
  fullwidthSpace: false,
  composeKana: false,
  punctuation: 'contextual',
  ellipsis: 'keep',
  dash: 'keep',
  quotes: false,
  quoteStyle: 'curly',
  trimAroundFullwidth: true,
  dropSpaceBetweenCjk: false,
  collapseSpaces: false,
};

export type Changes = {
  kana: number;
  width: number;
  ellipsis: number;
  dash: number;
  punctuation: number;
  quotes: number;
  spacesAdded: number;
  spacesRemoved: number;
};

const NO_CHANGES: Changes = {
  kana: 0,
  width: 0,
  ellipsis: 0,
  dash: 0,
  punctuation: 0,
  quotes: 0,
  spacesAdded: 0,
  spacesRemoved: 0,
};

const CJK_CLASS = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const CJK = new RegExp(`[${CJK_CLASS}]`, 'u');
const LATIN = /[A-Za-z0-9]/;

/** Full-width punctuation, for deciding whether a space is wanted next to it. */
const FULLWIDTH_PUNCT = /[，。、；：！？（）【】《》〈〉「」『』〔〕…—～]/u;

/** Half-width to full-width. `、` is not reachable from `,` — it is a choice. */
const TO_FULL: Record<string, string> = {
  ',': '，',
  '.': '。',
  ';': '；',
  ':': '：',
  '!': '！',
  '?': '？',
  '(': '（',
  ')': '）',
};

const TO_HALF: Record<string, string> = {
  '，': ',',
  '。': '.',
  '、': ',',
  '；': ';',
  '：': ':',
  '！': '!',
  '？': '?',
  '（': '(',
  '）': ')',
};

/** Sentence punctuation that must not be widened in front of Latin text. */
const GUARDED = new Set(['.', ':']);

function isCjk(ch: string | undefined): boolean {
  return ch !== undefined && CJK.test(ch);
}

function isLatin(ch: string | undefined): boolean {
  return ch !== undefined && LATIN.test(ch);
}

function isFullPunct(ch: string | undefined): boolean {
  return ch !== undefined && FULLWIDTH_PUNCT.test(ch);
}

/** Replace, and report how many times. */
function tally(text: string, pattern: RegExp, replacement: string): [string, number] {
  let n = 0;
  const out = text.replace(pattern, (...args: unknown[]) => {
    n += 1;
    // Group references are resolved by hand so the counter can sit here.
    return replacement.replace(/\$(\d)/g, (_whole, index: string) => String(args[Number(index)] ?? ''));
  });
  return [out, n];
}

/**
 * Half-width katakana folded into full-width by normalising only those runs.
 *
 * NFKC over the whole string would also flatten full-width Latin, ㍿-style
 * squared forms and superscripts — changes nobody asked for. Restricted to the
 * half-width kana block it does exactly one thing, including composing a kana
 * and its following voiced sound mark into a single character.
 */
export function composeHalfwidthKana(text: string): [string, number] {
  let n = 0;
  const out = text.replace(/[｡-ﾟ]+/g, (run) => {
    n += [...run].length;
    return run.normalize('NFKC');
  });
  return [out, n];
}

/** Full-width ASCII letters and digits to half-width, or the reverse. */
export function convertWidth(text: string, mode: WidthMode): [string, number] {
  if (mode === 'keep') return [text, 0];
  let n = 0;
  if (mode === 'half') {
    const out = text.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => {
      n += 1;
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
    return [out, n];
  }
  const out = text.replace(/[0-9A-Za-z]/g, (ch) => {
    n += 1;
    return String.fromCharCode(ch.charCodeAt(0) + 0xfee0);
  });
  return [out, n];
}

export function convertEllipsis(text: string, mode: RunMode): [string, number] {
  if (mode === 'keep') return [text, 0];
  const target = mode === 'cjk' ? '……' : '…';
  // Three or more dots, or an existing run of ellipsis characters.
  return tally(text, /\.{3,}|…{1,}/g, target);
}

export function convertDash(text: string, mode: RunMode): [string, number] {
  if (mode === 'keep') return [text, 0];
  const target = mode === 'cjk' ? '——' : '—';
  let n = 0;
  // Only next to CJK: `--flag` and `a -- b` in Latin text are not dashes.
  // `[\s\S]` rather than `.` with the `s` flag: the build targets ES2017.
  const out = text.replace(/([\s\S]?)(-{2,}|—{1,2})([\s\S]?)/gu, (whole, before: string, run: string, after: string) => {
    if (!isCjk(before) && !isCjk(after)) return whole;
    // Already in the wanted form: leave it, and do not report a change that
    // did not happen.
    if (run === target) return whole;
    n += 1;
    return before + target + after;
  });
  return [out, n];
}

/**
 * Punctuation width, decided per line and then per character.
 *
 * The line comes first because a single character's neighbours are not enough.
 * `A1。` ends a Chinese sentence whose last token happens to be Latin, and a
 * neighbour-only rule narrows that full stop to `A1.` — technically consistent,
 * visibly wrong. So `contextual` asks whether the line contains any CJK at all:
 * a Chinese line keeps full-width punctuation and may gain more, a Latin line
 * gets its stray full-width punctuation narrowed.
 *
 * Within a Chinese line the remaining rules are:
 *  - brackets are judged by the side they face: `(` by what follows, `)` by what
 *    precedes;
 *  - `,` `;` `!` `?` widen after CJK, and after Latin only when what follows is
 *    not Latin — so `a,b` in a Chinese sentence stays a Latin list;
 *  - `.` and `:` additionally never widen in front of Latin, and after Latin only
 *    at the end of a line. That is what keeps `檔案.txt`, `2.0`, `12:30`,
 *    `http://…` and `e.g. ` intact while still ending `…是 A1.` with `。`.
 */
export function convertPunctuation(text: string, mode: PunctuationMode): [string, number] {
  if (mode === 'keep') return [text, 0];
  let n = 0;

  const out = text
    .split('\n')
    .map((line) => {
      const lineHasCjk = CJK.test(line);
      const chars = [...line];

      return chars
        .map((ch, index) => {
          const previous = chars[index - 1];
          const next = chars[index + 1];
          const atLineEnd = next === undefined;

          const wide = TO_FULL[ch];
          if (wide !== undefined && (mode === 'full' || (mode === 'contextual' && lineHasCjk))) {
            const after = isCjk(previous) || isFullPunct(previous);
            const widen =
              mode === 'full'
                ? true
                : ch === '('
                  ? isCjk(next)
                  : ch === ')'
                    ? isCjk(previous)
                    : GUARDED.has(ch)
                      ? !isLatin(next) && (after || (isLatin(previous) && atLineEnd))
                      : after || (isLatin(previous) && !isLatin(next));
            if (widen) {
              n += 1;
              return wide;
            }
          }

          const narrow = TO_HALF[ch];
          if (narrow !== undefined && (mode === 'half' || (mode === 'contextual' && !lineHasCjk))) {
            n += 1;
            return narrow;
          }

          return ch;
        })
        .join('');
    })
    .join('\n');

  return [out, n];
}

const OPENERS = new Set(['(', '（', '[', '【', '{', '「', '『', '“', '‘', '《', '〈', '　']);

/**
 * Straight quotes paired into typographic ones.
 *
 * Pairing is decided by what is on the left, not by counting: an opening quote
 * follows a space, a line start or an opening bracket, and anything else is a
 * closing quote. A `'` between two letters is an apostrophe (`don't`), never a
 * quote — deciding that by parity would turn every contraction into an open
 * quotation that swallows the rest of the paragraph.
 */
export function convertQuotes(text: string, style: QuoteStyle): [string, number] {
  const double = style === 'corner' ? ['「', '」'] : ['“', '”'];
  const single = style === 'corner' ? ['『', '』'] : ['‘', '’'];
  const chars = [...text];
  let n = 0;

  const out = chars.map((ch, index) => {
    if (ch !== '"' && ch !== "'") return ch;
    const previous = chars[index - 1];
    const next = chars[index + 1];

    if (ch === "'" && isLatin(previous) && isLatin(next)) {
      n += 1;
      return '’'; // apostrophe, in both styles
    }

    const opening =
      previous === undefined || previous === '\n' || /\s/.test(previous) || OPENERS.has(previous);
    n += 1;
    const pair = ch === '"' ? double : single;
    return opening ? pair[0] : pair[1];
  });

  return [out.join(''), n];
}

/** Spaces and tabs (never newlines) that sit against full-width punctuation. */
export function trimAroundFullwidth(text: string): [string, number] {
  let n = 0;
  let out = text.replace(new RegExp(`[ \\t]+(${FULLWIDTH_PUNCT.source})`, 'gu'), (_whole, punct: string) => {
    n += 1;
    return punct;
  });
  out = out.replace(new RegExp(`(${FULLWIDTH_PUNCT.source})[ \\t]+`, 'gu'), (_whole, punct: string) => {
    n += 1;
    return punct;
  });
  return [out, n];
}

const PANGU_AFTER_CJK = new RegExp(`([${CJK_CLASS}])([A-Za-z0-9@#$%&([])`, 'gu');
const PANGU_BEFORE_CJK = new RegExp(`([A-Za-z0-9@#$%&)\\]])([${CJK_CLASS}])`, 'gu');

/**
 * A space between CJK and Latin.
 *
 * Two passes rather than one: the two rules overlap on `中a中`, and a single
 * global pass consumes the shared character, leaving the second boundary
 * unspaced.
 */
export function spaceCjkLatin(text: string): [string, number] {
  const [first, a] = tally(text, PANGU_AFTER_CJK, '$1 $2');
  const [second, b] = tally(first, PANGU_BEFORE_CJK, '$1 $2');
  return [second, a + b];
}

export function tidy(input: string, options: Options): { text: string; changes: Changes } {
  const changes: Changes = { ...NO_CHANGES };
  let text = input;

  if (options.composeKana) {
    const [next, n] = composeHalfwidthKana(text);
    text = next;
    changes.kana = n;
  }

  const [widened, widthChanges] = convertWidth(text, options.width);
  text = widened;
  changes.width = widthChanges;

  if (options.fullwidthSpace) {
    const [next, n] = tally(text, /　/g, ' ');
    text = next;
    changes.width += n;
  }

  const [ellipsed, ellipsisChanges] = convertEllipsis(text, options.ellipsis);
  text = ellipsed;
  changes.ellipsis = ellipsisChanges;

  const [dashed, dashChanges] = convertDash(text, options.dash);
  text = dashed;
  changes.dash = dashChanges;

  const [punctuated, punctChanges] = convertPunctuation(text, options.punctuation);
  text = punctuated;
  changes.punctuation = punctChanges;

  if (options.quotes) {
    const [next, n] = convertQuotes(text, options.quoteStyle);
    text = next;
    changes.quotes = n;
  }

  if (options.trimAroundFullwidth) {
    const [next, n] = trimAroundFullwidth(text);
    text = next;
    changes.spacesRemoved += n;
  }

  if (options.dropSpaceBetweenCjk) {
    const [next, n] = tally(text, new RegExp(`([${CJK_CLASS}])[ \\t]+([${CJK_CLASS}])`, 'gu'), '$1$2');
    text = next;
    changes.spacesRemoved += n;
  }

  if (options.collapseSpaces) {
    const [next, n] = tally(text, /[ \t]{2,}/g, ' ');
    text = next;
    changes.spacesRemoved += n;
  }

  if (options.spaceCjkLatin) {
    const [next, n] = spaceCjkLatin(text);
    text = next;
    changes.spacesAdded = n;
  }

  return { text, changes };
}

export function totalChanges(changes: Changes): number {
  return (
    changes.kana +
    changes.width +
    changes.ellipsis +
    changes.dash +
    changes.punctuation +
    changes.quotes +
    changes.spacesAdded +
    changes.spacesRemoved
  );
}
