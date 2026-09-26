/**
 * Morse code and the NATO spelling alphabet: two ways of getting a string
 * through a channel that loses characters.
 *
 * Morse's unit of time is the dit. A dah is three dits, the gap inside a
 * character is one, between characters three, between words seven — which is
 * why the word PARIS is the standard for calibrating a keyer: it is exactly
 * fifty units including its trailing word gap, so "words per minute" has a
 * definition instead of a feel. Those ratios are what make the code readable
 * at speed, and they are why this file counts units rather than characters.
 *
 * The spelling alphabet is the same idea for a voice channel. It is worth
 * noting that ICAO and NATO do not agree on the digits: aviation says "tree",
 * "fower", "fife" and "niner" precisely because "three" and "free", "five" and
 * "fife", "nine" and "nein" are confusable over a bad radio link. Both forms
 * are here, because reading a code to a bank and reading it to a control tower
 * are different jobs.
 */

/** ITU-R M.1677-1, the letters, digits and punctuation it actually defines. */
export const MORSE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  ':': '---...',
  '?': '..--..',
  "'": '.----.',
  '-': '-....-',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '"': '.-..-.',
  '=': '-...-',
  '+': '.-.-.',
  '@': '.--.-.',
  // Not in M.1677 but universally used and unambiguous.
  '!': '-.-.--',
  ';': '-.-.-.',
  _: '..--.-',
  $: '...-..-',
  '&': '.-...',
};

/**
 * Prosigns: run-together letter pairs with a procedural meaning.
 *
 * They are listed separately because they are *not* characters — `...---...`
 * is SOS sent as one symbol with no gaps, which is a different transmission
 * from S, O, S even though it decodes to the same three letters.
 */
export const PROSIGNS: { code: string; name: string; meaning: { zh: string; en: string } }[] = [
  { code: '...---...', name: 'SOS', meaning: { zh: '求救', en: 'distress' } },
  { code: '........', name: 'HH', meaning: { zh: '前面發錯了,重來', en: 'error, disregard' } },
  { code: '-.-', name: 'K', meaning: { zh: '請回答', en: 'go ahead, over' } },
  { code: '.-.-.', name: 'AR', meaning: { zh: '訊息結束', en: 'end of message' } },
  { code: '...-.-', name: 'SK', meaning: { zh: '通聯結束', en: 'end of contact' } },
  { code: '-...-', name: 'BT', meaning: { zh: '段落分隔', en: 'new paragraph' } },
  { code: '.-...', name: 'AS', meaning: { zh: '稍等', en: 'wait' } },
];

const FROM_MORSE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [char, code] of Object.entries(MORSE)) {
    if (!(code in out)) out[code] = char;
  }
  return out;
})();

export type ToMorseOptions = {
  /** Separator between characters. */
  letterSep?: string;
  /** Separator between words. */
  wordSep?: string;
  /**
   * Strip diacritics before looking a letter up, so `café` sends as CAFE.
   * Morse has national extensions for accented letters and they conflict
   * between countries, so folding is the honest default.
   */
  fold?: boolean;
};

export type MorseResult = { code: string; unknown: string[] };

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '');
}

export function toMorse(text: string, options: ToMorseOptions = {}): MorseResult {
  const letterSep = options.letterSep ?? ' ';
  const wordSep = options.wordSep ?? '/';
  const source = (options.fold ?? true) ? fold(text) : text;
  const unknown = new Set<string>();

  const words = source.trim().split(/\s+/).filter((word) => word !== '');
  const encoded = words.map((word) => {
    const parts: string[] = [];
    for (const ch of word) {
      const code = MORSE[ch.toUpperCase()];
      if (code) parts.push(code);
      else unknown.add(ch);
    }
    return parts.join(letterSep);
  });

  return {
    code: encoded.filter((word) => word !== '').join(`${letterSep}${wordSep}${letterSep}`),
    unknown: [...unknown],
  };
}

/**
 * Normalises the many ways people write dots and dashes.
 *
 * A code pasted out of a PDF arrives with U+2212 MINUS SIGN or an en dash
 * instead of a hyphen, and with U+00B7 MIDDLE DOT or U+2022 BULLET instead of
 * a full stop. Refusing those would be technically correct and useless.
 */
export function normaliseMorse(code: string): string {
  return code
    // MINUS SIGN, EN DASH, EM DASH, HORIZONTAL BAR, LOW LINE — all mean a dah.
    .replace(/[\u2212\u2013\u2014\u2015_]/g, '-')
    // MIDDLE DOT, BULLET, DOT OPERATOR, RING OPERATOR — all mean a dit.
    .replace(/[\u00b7\u2022\u22c5\u2218]/g, '.')
    // IDEOGRAPHIC SPACE, from text typed on a CJK keyboard.
    .replace(/\u3000/g, ' ');
}

export type FromMorseResult = { text: string; unknown: string[] };

/**
 * Decodes morse back to text.
 *
 * Word separation accepts `/`, `|`, and a run of three or more spaces, because
 * all three are in use and a decoder that only knows one turns a message into
 * a single long word.
 */
export function fromMorse(code: string): FromMorseResult {
  const unknown = new Set<string>();
  const normalised = normaliseMorse(code).trim();
  if (normalised === '') return { text: '', unknown: [] };

  const words = normalised.split(/\s*[/|]\s*|\s{3,}/);
  const text = words
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter((token) => token !== '')
        .map((token) => {
          const char = FROM_MORSE[token];
          if (char) return char;
          unknown.add(token);
          return '�';
        })
        .join('')
    )
    .join(' ');

  return { text, unknown: [...unknown] };
}

/* ── Timing ───────────────────────────────── */

export type Segment = { on: boolean; units: number };

/**
 * The transmission as a list of on/off runs, in dit units.
 *
 * This is the shape both the timing readout and the audio playback need, and
 * deriving it once keeps the two from disagreeing about how long a message is.
 */
export function timing(code: string): Segment[] {
  const normalised = normaliseMorse(code).trim();
  if (normalised === '') return [];
  const out: Segment[] = [];
  const words = normalised.split(/\s*[/|]\s*|\s{3,}/).filter((word) => word.trim() !== '');

  words.forEach((word, wordIndex) => {
    if (wordIndex > 0) out.push({ on: false, units: 7 });
    const letters = word.trim().split(/\s+/).filter((token) => token !== '');
    letters.forEach((letter, letterIndex) => {
      if (letterIndex > 0) out.push({ on: false, units: 3 });
      const elements = [...letter].filter((ch) => ch === '.' || ch === '-');
      elements.forEach((element, index) => {
        if (index > 0) out.push({ on: false, units: 1 });
        out.push({ on: true, units: element === '-' ? 3 : 1 });
      });
    });
  });

  return out;
}

/** Total dit units, gaps included. PARIS is 43 without its trailing word gap. */
export function morseUnits(code: string): number {
  return timing(code).reduce((total, segment) => total + segment.units, 0);
}

/**
 * Seconds one dit lasts at a given words-per-minute.
 *
 * The definition is PARIS: fifty units per word, so at n words per minute a
 * unit is 60/(50n) = 1.2/n seconds. Every keyer and every practice app agrees
 * on this one thing.
 */
export function ditSeconds(wpm: number): number {
  if (!Number.isFinite(wpm) || wpm <= 0) return 0;
  return 1.2 / wpm;
}

export function durationSeconds(code: string, wpm: number): number {
  return morseUnits(code) * ditSeconds(wpm);
}

/* ── Spelling alphabets ───────────────────── */

export const NATO: Record<string, string> = {
  A: 'Alfa',
  B: 'Bravo',
  C: 'Charlie',
  D: 'Delta',
  E: 'Echo',
  F: 'Foxtrot',
  G: 'Golf',
  H: 'Hotel',
  I: 'India',
  J: 'Juliett',
  K: 'Kilo',
  L: 'Lima',
  M: 'Mike',
  N: 'November',
  O: 'Oscar',
  P: 'Papa',
  Q: 'Quebec',
  R: 'Romeo',
  S: 'Sierra',
  T: 'Tango',
  U: 'Uniform',
  V: 'Victor',
  W: 'Whiskey',
  X: 'Xray',
  Y: 'Yankee',
  Z: 'Zulu',
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
};

/** ICAO's radiotelephony digits, built to survive a noisy channel. */
export const ICAO_DIGITS: Record<string, string> = {
  '0': 'Zero',
  '1': 'Wun',
  '2': 'Too',
  '3': 'Tree',
  '4': 'Fower',
  '5': 'Fife',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Ait',
  '9': 'Niner',
};

/** Spoken names for the punctuation people actually have to read aloud. */
export const SPOKEN_PUNCTUATION: Record<string, string> = {
  '-': 'Dash',
  _: 'Underscore',
  '.': 'Dot',
  '@': 'At',
  '/': 'Slash',
  ':': 'Colon',
  '+': 'Plus',
  '=': 'Equals',
  '#': 'Hash',
  '%': 'Percent',
  '*': 'Star',
  ',': 'Comma',
  '(': 'Open paren',
  ')': 'Close paren',
  "'": 'Apostrophe',
  '"': 'Quote',
  ' ': 'Space',
};

export type NatoOptions = { icao?: boolean; punctuation?: boolean };

export type NatoResult = { words: string[]; unknown: string[] };

/**
 * Spells a string out one symbol at a time.
 *
 * Case is reported as "capital X" / "small x" only when the input mixes both,
 * because a code that is entirely uppercase does not need it said 24 times.
 */
export function toNato(text: string, options: NatoOptions = {}): NatoResult {
  const digits = options.icao ? ICAO_DIGITS : NATO;
  const unknown = new Set<string>();
  const hasLower = /[a-z]/.test(text);
  const hasUpper = /[A-Z]/.test(text);
  const markCase = hasLower && hasUpper;

  const words: string[] = [];
  for (const ch of text) {
    const upper = ch.toUpperCase();
    if (/[0-9]/.test(ch)) {
      words.push(digits[ch]);
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const word = NATO[upper];
      words.push(markCase ? `${ch === upper ? 'capital' : 'small'} ${word}` : word);
      continue;
    }
    if (options.punctuation !== false && ch in SPOKEN_PUNCTUATION) {
      words.push(SPOKEN_PUNCTUATION[ch]);
      continue;
    }
    unknown.add(ch);
  }

  return { words, unknown: [...unknown] };
}

const FROM_NATO: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [char, word] of Object.entries(NATO)) out[word.toLowerCase()] = char;
  for (const [char, word] of Object.entries(ICAO_DIGITS)) out[word.toLowerCase()] = char;
  // The spellings people actually say, which are not the official ones.
  Object.assign(out, {
    alpha: 'A', // official is Alfa, spelled that way so non-English readers say it right
    juliet: 'J',
    'x-ray': 'X',
    whisky: 'W',
  });
  return out;
})();

/** Reads a spelled-out code back into the string, ignoring case markers. */
export function fromNato(text: string): FromMorseResult {
  const unknown = new Set<string>();
  const tokens = text
    .split(/[\s,;\u00b7]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '' && token !== 'capital' && token !== 'small');

  let out = '';
  for (const token of tokens) {
    const char = FROM_NATO[token];
    if (char) out += char;
    else {
      unknown.add(token);
      out += '�';
    }
  }
  return { text: out, unknown: [...unknown] };
}
