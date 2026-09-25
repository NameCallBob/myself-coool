/**
 * Password generation, and an entropy figure that is actually true.
 *
 * Two things here are easy to get wrong in ways nobody notices:
 *
 * 1. Sampling. `crypto.getRandomValues` is only half the job; taking a modulus
 *    of it re-introduces bias. That part lives in src/lib/tools/random.ts.
 *
 * 2. The claimed strength. Almost every generator offers "at least one of each
 *    character type" and then reports `length × log2(alphabet)` bits anyway.
 *    That number is for uniform draws from the whole alphabet, and the
 *    constraint makes the draw non-uniform — it forbids some strings entirely,
 *    so the real figure is lower. Here the generator rejection-samples (which
 *    keeps the distribution exactly uniform over the allowed strings) and the
 *    entropy is computed for that smaller set by inclusion–exclusion.
 */

export type SetId = 'lower' | 'upper' | 'digit' | 'symbol';

export const CHARSETS: Record<SetId, string> = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  // Punctuation that survives a copy-paste into a shell, a CSV and a form.
  // Quotes, backslash and backtick are left out: they get escaped, mangled or
  // rejected somewhere in every toolchain, and a password you cannot paste
  // gets replaced by a weaker one you can.
  symbol: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
};

/** Characters that look like each other in the fonts people actually use. */
export const AMBIGUOUS = 'Il1O0oB8S5Z2';

export type Options = {
  length: number;
  sets: SetId[];
  /** Require at least one character from every selected set. */
  requireEach: boolean;
  /** Drop look-alike characters, for passwords that get read aloud or typed. */
  avoidAmbiguous: boolean;
};

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;

export function alphabetFor(options: Options): string {
  const used = options.sets.length > 0 ? options.sets : (['lower'] as SetId[]);
  const joined = used.map((id) => CHARSETS[id]).join('');
  const cleaned = options.avoidAmbiguous
    ? [...joined].filter((ch) => !AMBIGUOUS.includes(ch)).join('')
    : joined;
  return cleaned;
}

/** Per-set alphabets after the ambiguity filter — what the constraint checks. */
function setsFor(options: Options): string[] {
  const used = options.sets.length > 0 ? options.sets : (['lower'] as SetId[]);
  return used
    .map((id) =>
      options.avoidAmbiguous
        ? [...CHARSETS[id]].filter((ch) => !AMBIGUOUS.includes(ch)).join('')
        : CHARSETS[id]
    )
    .filter((set) => set.length > 0);
}

/**
 * Probability that a uniform draw of `length` characters contains at least one
 * from every set, by inclusion–exclusion over the (disjoint) sets.
 */
export function satisfactionProbability(options: Options): number {
  const sets = setsFor(options);
  const alphabet = alphabetFor(options).length;
  if (alphabet === 0 || sets.length === 0) return 0;
  if (!options.requireEach) return 1;
  if (options.length < sets.length) return 0;

  let total = 0;
  const combinations = 1 << sets.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    let excluded = 0;
    let bits = 0;
    for (let i = 0; i < sets.length; i += 1) {
      if (mask & (1 << i)) {
        excluded += sets[i].length;
        bits += 1;
      }
    }
    const sign = bits % 2 === 0 ? 1 : -1;
    total += sign * ((alphabet - excluded) / alphabet) ** options.length;
  }
  return Math.max(0, Math.min(1, total));
}

/**
 * Entropy of the distribution this generator actually samples from.
 *
 * Uniform over the allowed strings, so it is log2 of how many there are:
 * `length × log2(alphabet) + log2(P(allowed))`. The second term is zero or
 * negative — the constraint never adds strength, which is the part generators
 * quietly omit.
 */
export function entropyOf(options: Options): number {
  const alphabet = alphabetFor(options).length;
  if (alphabet <= 1) return 0;
  const probability = satisfactionProbability(options);
  if (probability <= 0) return 0;
  return options.length * Math.log2(alphabet) + Math.log2(probability);
}

export function satisfies(password: string, options: Options): boolean {
  if (!options.requireEach) return true;
  return setsFor(options).every((set) => [...password].some((ch) => set.includes(ch)));
}

export class ImpossibleOptions extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpossibleOptions';
  }
}

/**
 * One password, uniform over the strings the options allow.
 *
 * `randomIndex` is injected so the tests can drive a deterministic sequence;
 * the tool always passes the CSPRNG-backed one.
 */
export function generate(options: Options, randomIndex: (max: number) => number): string {
  const alphabet = alphabetFor(options);
  if (alphabet.length === 0) throw new ImpossibleOptions('no characters left to choose from');
  const sets = setsFor(options);
  if (options.requireEach && options.length < sets.length) {
    throw new ImpossibleOptions(`length ${options.length} cannot hold ${sets.length} character types`);
  }

  // Rejection sampling keeps the result uniform over the allowed set, which is
  // what `entropyOf` reports. Patching a rejected password in place instead
  // would bias whichever position got patched.
  const attempts = 10_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let password = '';
    for (let i = 0; i < options.length; i += 1) {
      password += alphabet[randomIndex(alphabet.length)];
    }
    if (satisfies(password, options)) return password;
  }
  throw new ImpossibleOptions('could not satisfy the constraints — loosen them');
}

export type Strength = 'weak' | 'fair' | 'strong' | 'excessive';

/**
 * Bands, not a score out of a hundred.
 *
 * 60 bits is roughly where an offline attack against a fast hash stops being a
 * weekend project; 80 is comfortable for anything that might be dumped; past
 * 120 the password is no longer the weak part of the system.
 */
export function strengthOf(bits: number): Strength {
  if (bits < 60) return 'weak';
  if (bits < 80) return 'fair';
  if (bits < 120) return 'strong';
  return 'excessive';
}

/**
 * Time to exhaust half the keyspace at `guessesPerSecond`.
 *
 * The default rate is an offline attack on a fast hash with commodity GPUs —
 * the assumption worth designing against, and far harsher than an online one.
 */
export function crackTime(bits: number, guessesPerSecond = 1e11): string {
  if (bits <= 0) return 'instantly';
  const seconds = 2 ** (bits - 1) / guessesPerSecond;
  const units: [number, string][] = [
    [1, 'second'],
    [60, 'minute'],
    [3600, 'hour'],
    [86_400, 'day'],
    [31_557_600, 'year'],
  ];
  if (seconds < 1) return 'instantly';

  let chosen = units[0];
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  const value = seconds / chosen[0];

  if (chosen[1] === 'year' && value >= 1e6) {
    const exponent = Math.floor(Math.log10(value));
    return `1e${exponent} years`;
  }
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString('en-US');
  return `${rounded} ${chosen[1]}${value >= 2 ? 's' : ''}`;
}
