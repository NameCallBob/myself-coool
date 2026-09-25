/**
 * Randomness for anything a person might rely on.
 *
 * `Math.random()` is banned in this directory tree (see eslint.config.mjs):
 * it is a fast PRNG seeded per context, it is not a secret source, and a
 * password generator built on it looks identical to one that is safe.
 *
 * `below` uses rejection sampling rather than `% n`. Taking a modulus of a
 * uniform byte range skews the low end whenever n does not divide 256 — with
 * a 62-character alphabet the first 8 characters come up ~1.6% more often
 * than the rest, which quietly costs entropy the UI would still be claiming.
 */

function fill(n: number): Uint32Array {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

/** Uniform integer in [0, max). `max` must be a positive safe integer. */
export function below(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`below() needs a positive integer, got ${max}`);
  }
  if (max === 1) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  for (;;) {
    const [v] = fill(1);
    if (v < limit) return v % max;
  }
}

/** Uniform integer in [min, max], inclusive both ends. */
export function between(min: number, max: number): number {
  return min + below(max - min + 1);
}

export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick() from an empty list');
  return items[below(items.length)];
}

/** Fisher–Yates, unbiased, returns a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = below(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** n distinct items, in random order. Throws if n exceeds the pool. */
export function sample<T>(items: readonly T[], n: number): T[] {
  if (n > items.length) throw new RangeError('sample() larger than the pool');
  return shuffle(items).slice(0, n);
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Entropy of k independent draws from an alphabet of `size`, in bits. */
export function entropyBits(size: number, k: number): number {
  if (size <= 1 || k <= 0) return 0;
  return Math.log2(size) * k;
}
