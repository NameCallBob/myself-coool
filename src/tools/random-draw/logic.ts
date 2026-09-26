/**
 * Draws, groupings and dice — reproducible from a published seed.
 *
 * The seed is the point. A draw nobody can check is just an assertion, and
 * "trust me, I clicked the button" is exactly what a raffle cannot afford. So
 * the unpredictable part and the deterministic part are separated: the seed
 * comes from `crypto.getRandomValues` (the UI's job), and everything after it is
 * a documented function of that seed. Publish the seed before the draw and
 * anyone can re-enter it afterwards, here or in their own code, and get the same
 * result — including the order, not just the winners.
 *
 * That requires a named, reimplementable generator rather than the browser's.
 * This uses xoshiro128** (Blackman & Vigna), which is four 32-bit words of state
 * and about ten lines; the seed string is expanded into those four words with
 * SplitMix32. Both are published algorithms, so the verification does not depend
 * on this page still existing.
 *
 * What it is not: a cryptographic sequence. Given enough output, xoshiro's state
 * can be recovered and the rest predicted. That does not matter for a draw whose
 * seed is only revealed at the end, and it would matter a great deal for a key —
 * which is why key generation lives in the crypto drawer and calls
 * `getRandomValues` directly.
 */

export const MAX_ENTRIES = 20_000;
export const MAX_TICKETS = 1000;
export const MAX_DICE = 1000;
export const MAX_DIE_FACES = 1000;
export const MAX_DICE_TERMS = 20;

export class DrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawError';
  }
}

/* ── Seeded generator ──────────────────────── */

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/**
 * SplitMix32, used only to turn a seed into generator state.
 *
 * A single weak word of seed (say the string "1") expanded by copying would give
 * xoshiro a near-zero state, and xoshiro started near zero produces visibly
 * poor output for its first few dozen draws. SplitMix avalanches it first.
 */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** FNV-1a over the seed's UTF-16 code units. Deterministic and easy to restate. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= text.charCodeAt(i) >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Four words of xoshiro state from a seed string.
 *
 * A 32-character hex seed is read as the four words directly, so a seed printed
 * from `crypto.getRandomValues` carries its full 128 bits into the state. Any
 * other string is hashed. Either way an all-zero state is replaced, because
 * xoshiro cannot leave it.
 */
export function seedState(seed: string): Uint32Array {
  const clean = seed.trim();
  const state = new Uint32Array(4);

  if (/^[0-9a-fA-F]{32}$/.test(clean)) {
    for (let i = 0; i < 4; i += 1) {
      state[i] = Number.parseInt(clean.slice(i * 8, i * 8 + 8), 16) >>> 0;
    }
  } else {
    const next = splitmix32(fnv1a(clean));
    for (let i = 0; i < 4; i += 1) state[i] = next();
  }

  if (state[0] === 0 && state[1] === 0 && state[2] === 0 && state[3] === 0) {
    state[0] = 0x9e3779b9;
  }
  return state;
}

export type Rng = {
  /** Next 32-bit output. */
  uint32: () => number;
  /** Uniform integer in [0, max), by rejection sampling. */
  below: (max: number) => number;
  /** Uniform integer in [min, max], both ends included. */
  between: (min: number, max: number) => number;
};

/**
 * xoshiro128** over a seeded state.
 *
 * `below` rejects rather than taking a modulus. `% n` on a uniform 32-bit value
 * favours the low buckets whenever n does not divide 2^32 — invisible in a
 * single draw, and a real bias in a raffle run a thousand times.
 */
export function createRng(seed: string): Rng {
  const state = seedState(seed);
  let s0 = state[0];
  let s1 = state[1];
  let s2 = state[2];
  let s3 = state[3];

  const uint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  const below = (max: number): number => {
    if (!Number.isInteger(max) || max <= 0) {
      throw new DrawError(`below() needs a positive integer, got ${max}`);
    }
    if (max === 1) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    for (;;) {
      const value = uint32();
      if (value < limit) return value % max;
    }
  };

  return { uint32, below, between: (min, max) => min + below(max - min + 1) };
}

/** Fisher–Yates against a seeded generator. Returns a new array. */
export function shuffleWith<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.below(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Entries ───────────────────────────────── */

export type Entry = {
  name: string;
  /** Tickets this name holds. More tickets, better odds. */
  tickets: number;
};

/**
 * Reads the entry list.
 *
 * One name per line. A trailing `*3` gives that name three tickets, which is how
 * a raffle with unequal odds is normally written down; without it every line is
 * one ticket. Blank lines and lines starting with `#` are ignored so a list can
 * carry headings.
 */
export function parseEntries(text: string): { entries: Entry[]; truncated: boolean } {
  const entries: Entry[] = [];
  let truncated = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }

    const match = /^(.*?)\s*[*×x]\s*(\d{1,4})$/i.exec(line);
    if (match && match[1].trim() !== '') {
      const tickets = Math.min(Math.max(Number.parseInt(match[2], 10), 1), MAX_TICKETS);
      entries.push({ name: match[1].trim(), tickets });
    } else {
      entries.push({ name: line, tickets: 1 });
    }
  }

  return { entries, truncated };
}

/** The ticket pool: each name repeated once per ticket. */
export function ticketPool(entries: readonly Entry[]): string[] {
  const pool: string[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.tickets; i += 1) pool.push(entry.name);
  }
  return pool;
}

export type Draw = {
  /** Winners, in the order drawn. */
  winners: string[];
  /** Everyone else, in the order they would have been drawn next. */
  rest: string[];
  /** Tickets in the pool. */
  poolSize: number;
};

/**
 * Draws `wanted` names.
 *
 * Without replacement a name cannot win twice, so its extra tickets only improve
 * its chance of being drawn — which is what a raffle means. With replacement the
 * same name can come up again, which is what "pick a random person to answer,
 * every round" means. Both are real; neither is a default worth hiding.
 */
export function drawNames(
  entries: readonly Entry[],
  wanted: number,
  seed: string,
  withReplacement = false
): Draw {
  if (entries.length === 0) throw new DrawError('there is nobody to draw from');
  if (!Number.isInteger(wanted) || wanted < 1) throw new DrawError('draw at least one name');

  const rng = createRng(seed);
  const pool = ticketPool(entries);

  if (withReplacement) {
    const winners: string[] = [];
    for (let i = 0; i < wanted; i += 1) winners.push(pool[rng.below(pool.length)]);
    return { winners, rest: [], poolSize: pool.length };
  }

  if (wanted > entries.length) {
    throw new DrawError(`only ${entries.length} names to draw from, ${wanted} asked for`);
  }

  // Shuffle the tickets, then walk them keeping the first appearance of each
  // name. Drawing tickets and skipping repeats is what a physical raffle does,
  // and it is what makes extra tickets improve the odds without letting one
  // name win twice.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const name of shuffleWith(rng, pool)) {
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }

  return {
    winners: order.slice(0, wanted),
    rest: order.slice(wanted),
    poolSize: pool.length,
  };
}

export type GroupMode = 'count' | 'size';

/**
 * Splits names into groups.
 *
 * `count` fixes the number of groups, `size` fixes how many per group. Either
 * way the remainder is spread one per group rather than piled into a last group
 * of one — a "group" of one person is not a group, and it is the failure mode of
 * every naive chunking.
 */
export function groupInto(
  names: readonly string[],
  mode: GroupMode,
  value: number,
  seed: string
): string[][] {
  if (names.length === 0) return [];
  if (!Number.isInteger(value) || value < 1) throw new DrawError('groups need a positive number');

  const groupCount =
    mode === 'count' ? Math.min(value, names.length) : Math.ceil(names.length / value);
  const shuffled = shuffleWith(createRng(seed), names);

  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  // Round-robin rather than slicing: it balances the sizes automatically and
  // never leaves a final group of one.
  shuffled.forEach((name, index) => {
    groups[index % groupCount].push(name);
  });
  return groups;
}

/* ── Dice ──────────────────────────────────── */

export type DiceTerm =
  | { kind: 'dice'; count: number; faces: number; sign: 1 | -1 }
  | { kind: 'constant'; value: number; sign: 1 | -1 };

/**
 * Parses dice notation: `2d6`, `3d8+2`, `1d20-1`, `2d6+1d4+3`.
 *
 * Caps on the number and size of dice are not decoration: `99999d99999` is a
 * plausible typo and would allocate a hundred million rolls.
 */
export function parseDice(text: string): DiceTerm[] {
  const clean = text.replace(/\s+/g, '').toLowerCase();
  if (clean === '') throw new DrawError('write something like 2d6+3');

  const terms: DiceTerm[] = [];
  const pattern = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)(?![d\d])/g;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(clean)) !== null) {
    if (match.index !== consumed) {
      throw new DrawError(`"${clean.slice(consumed, match.index)}" is not dice notation`);
    }
    consumed = match.index + match[0].length;
    if (terms.length >= MAX_DICE_TERMS) throw new DrawError(`at most ${MAX_DICE_TERMS} terms`);

    if (match[3] !== undefined) {
      const count = match[2] === '' ? 1 : Number.parseInt(match[2], 10);
      const faces = Number.parseInt(match[3], 10);
      if (count < 1 || count > MAX_DICE) throw new DrawError(`between 1 and ${MAX_DICE} dice`);
      if (faces < 2 || faces > MAX_DIE_FACES) {
        throw new DrawError(`a die needs 2 to ${MAX_DIE_FACES} faces`);
      }
      terms.push({ kind: 'dice', count, faces, sign: match[1] === '-' ? -1 : 1 });
    } else {
      terms.push({
        kind: 'constant',
        value: Number.parseInt(match[5], 10),
        sign: match[4] === '-' ? -1 : 1,
      });
    }
  }

  if (consumed !== clean.length) {
    throw new DrawError(`"${clean.slice(consumed)}" is not dice notation`);
  }
  if (terms.length === 0) throw new DrawError('write something like 2d6+3');
  return terms;
}

export type DiceRoll = {
  terms: { term: DiceTerm; rolls: number[]; subtotal: number }[];
  total: number;
  /** Smallest and largest the notation can produce. */
  min: number;
  max: number;
};

export function rollDice(terms: readonly DiceTerm[], seed: string): DiceRoll {
  const rng = createRng(seed);
  const out: DiceRoll['terms'] = [];
  let total = 0;
  let min = 0;
  let max = 0;

  for (const term of terms) {
    if (term.kind === 'constant') {
      const subtotal = term.sign * term.value;
      out.push({ term, rolls: [], subtotal });
      total += subtotal;
      min += subtotal;
      max += subtotal;
      continue;
    }
    const rolls: number[] = [];
    for (let i = 0; i < term.count; i += 1) rolls.push(rng.between(1, term.faces));
    const subtotal = term.sign * rolls.reduce((sum, value) => sum + value, 0);
    out.push({ term, rolls, subtotal });
    total += subtotal;
    if (term.sign === 1) {
      min += term.count;
      max += term.count * term.faces;
    } else {
      min -= term.count * term.faces;
      max -= term.count;
    }
  }

  return { terms: out, total, min, max };
}

/** Dice notation written back out, so a roll can be quoted with its spec. */
export function formatDice(terms: readonly DiceTerm[]): string {
  return terms
    .map((term, index) => {
      const sign = term.sign === -1 ? '-' : index === 0 ? '' : '+';
      return term.kind === 'dice'
        ? `${sign}${term.count}d${term.faces}`
        : `${sign}${term.value}`;
    })
    .join('');
}
