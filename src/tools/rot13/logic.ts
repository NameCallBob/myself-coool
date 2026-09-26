/**
 * Caesar shifts, Atbash and ROT47 — obfuscation, not encryption.
 *
 * Worth being precise about why. A cipher's strength lives in the key; here
 * the key is one of 25 numbers, and a program tries all 25 faster than you can
 * read one. That is not a weakness to be fixed by shifting further: the whole
 * family is a way of making text not-immediately-readable, which is a real and
 * useful thing (a spoiler, a puzzle answer, a sample of abuse in a bug report)
 * and is not secrecy.
 *
 * The frequency analysis at the bottom is there to make that concrete. Paste
 * something shifted, and the tool names the shift — which is the honest
 * demonstration of what the cipher is worth.
 */

const A = 65;
const a = 97;

/** Positive remainder: JavaScript's `%` gives -3 for -3 % 26. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Shifts Latin letters by `n`, leaving everything else exactly as it is.
 *
 * Only A–Z and a–z move. Accented letters, Greek, Cyrillic and CJK are left
 * alone rather than shifted by code point: `é + 13` is `ò`, which is not what
 * any Caesar cipher has ever meant and would not survive the round trip
 * through a different normalisation.
 */
export function rot(text: string, n: number): string {
  const shift = mod(Math.trunc(n), 26);
  if (shift === 0) return text;
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= A && code <= A + 25) out += String.fromCharCode(A + mod(code - A + shift, 26));
    else if (ch.length === 1 && code >= a && code <= a + 25) out += String.fromCharCode(a + mod(code - a + shift, 26));
    else out += ch;
  }
  return out;
}

/** ROT13: the shift that is its own inverse, because 13 + 13 = 26. */
export function rot13(text: string): string {
  return rot(text, 13);
}

/** ROT5 on the digits — the other half of what is sometimes called ROT18. */
export function rot5(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= 48 && code <= 57) out += String.fromCharCode(48 + mod(code - 48 + 5, 10));
    else out += ch;
  }
  return out;
}

/** ROT13 on letters and ROT5 on digits. Also self-inverse. */
export function rot18(text: string): string {
  return rot5(rot13(text));
}

/**
 * ROT47: shift 47 over the 94 printable ASCII characters from `!` to `~`.
 *
 * Also self-inverse, and unlike ROT13 it hides digits and punctuation too —
 * which makes it slightly more useful for hiding a URL or a command and no
 * more secure.
 */
export function rot47(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= 33 && code <= 126) out += String.fromCharCode(33 + mod(code - 33 + 47, 94));
    else out += ch;
  }
  return out;
}

/**
 * Atbash: A becomes Z, B becomes Y. A reflection, so it is its own inverse.
 *
 * Older than Caesar — it is in the Hebrew scriptures — and it has no key at
 * all, which makes it the one cipher in this tool with nothing to guess.
 */
export function atbash(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= A && code <= A + 25) out += String.fromCharCode(A + 25 - (code - A));
    else if (ch.length === 1 && code >= a && code <= a + 25) out += String.fromCharCode(a + 25 - (code - a));
    else out += ch;
  }
  return out;
}

/* ── Breaking it ──────────────────────────── */

/**
 * Letter frequencies of English text, in percent.
 *
 * From counts over a large English corpus; the exact source matters less than
 * the shape, because chi-square only needs the ranking to be roughly right to
 * pick the correct shift out of 25 on anything longer than a few words.
 */
export const ENGLISH_FREQ: Record<string, number> = {
  A: 8.167,
  B: 1.492,
  C: 2.782,
  D: 4.253,
  E: 12.702,
  F: 2.228,
  G: 2.015,
  H: 6.094,
  I: 6.966,
  J: 0.153,
  K: 0.772,
  L: 4.025,
  M: 2.406,
  N: 6.749,
  O: 7.507,
  P: 1.929,
  Q: 0.095,
  R: 5.987,
  S: 6.327,
  T: 9.056,
  U: 2.758,
  V: 0.978,
  W: 2.361,
  X: 0.15,
  Y: 1.974,
  Z: 0.074,
};

export function letterCounts(text: string): number[] {
  const counts = new Array<number>(26).fill(0);
  for (const ch of text.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code >= A && code <= A + 25) counts[code - A] += 1;
  }
  return counts;
}

/**
 * Chi-square distance from English letter frequencies. Lower is more English.
 *
 * Returns Infinity for text with no letters in it, because there is nothing to
 * measure and pretending otherwise would let an empty box "win" the ranking.
 */
export function scoreEnglish(text: string): number {
  const counts = letterCounts(text);
  const total = counts.reduce((n, c) => n + c, 0);
  if (total === 0) return Number.POSITIVE_INFINITY;
  let chi = 0;
  for (let i = 0; i < 26; i += 1) {
    const expected = (ENGLISH_FREQ[String.fromCharCode(A + i)] / 100) * total;
    const diff = counts[i] - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
}

export type Candidate = { shift: number; text: string; score: number };

/** Length above which only a sample is scored — the ranking does not need more. */
export const SAMPLE_LIMIT = 4000;

/**
 * All 25 shifts, best English first.
 *
 * This is the demonstration, not a feature: twenty-five tries is nothing, and
 * the ranking is nearly always right on more than a sentence of English. On
 * Chinese, or on a short string, or on something that was not English to begin
 * with, the ranking means nothing — which is why every candidate is shown.
 */
export function breakCaesar(text: string): Candidate[] {
  const sample = text.length > SAMPLE_LIMIT ? text.slice(0, SAMPLE_LIMIT) : text;
  const candidates: Candidate[] = [];
  for (let shift = 0; shift < 26; shift += 1) {
    // `shift` here is the amount to add to get back to plaintext, so a text
    // that was encoded with ROT13 is recovered at shift 13.
    const decoded = rot(sample, shift);
    candidates.push({ shift, text: rot(text, shift), score: scoreEnglish(decoded) });
  }
  return candidates.sort((x, y) => x.score - y.score || x.shift - y.shift);
}

/** Letters present at all — below about twenty, the ranking is a coin toss. */
export function letterTotal(text: string): number {
  return letterCounts(text).reduce((n, c) => n + c, 0);
}
