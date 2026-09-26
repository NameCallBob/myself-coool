/**
 * MD5, SHA-1, SHA-256, SHA-384 and SHA-512, written out by hand.
 *
 * WebCrypto has four of these five (`crypto.subtle.digest` refuses MD5), so
 * half of this file could have been a one-liner. It is not, for one reason:
 * `subtle.digest` only takes a whole buffer. Hashing a 4 GB disk image that
 * way means holding 4 GB in the tab, which on most machines means the tab
 * dies. Everything here is incremental — feed it 1 MB at a time and memory
 * stays flat — which is what makes `digestStream` possible.
 *
 * The constants are derived, not transcribed. SHA-256 and SHA-512 take their
 * round constants from the fractional parts of cube roots of the first primes
 * and their initial state from square roots, and a mistyped digit in one of
 * 80 hex literals produces a hash that is wrong only for some inputs. Integer
 * roots computed with BigInt are exact, so there is nothing to mistype. The
 * tests still pin the published vectors, and cross-check every algorithm
 * against the platform's own implementation.
 */

export type Algo = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

/** Offered order: what you should reach for first comes first. */
export const ALGOS: Algo[] = ['sha256', 'sha512', 'sha384', 'sha1', 'md5'];

/**
 * Broken as signatures. Both have practical collisions (MD5 since 2004,
 * SHA-1 since the 2017 SHAttered work), which means an attacker can build two
 * different files with the same digest. Fine for spotting a corrupt download,
 * never fine for deciding that a file is the file you were promised.
 */
export const COLLIDABLE: Algo[] = ['md5', 'sha1'];

export const DIGEST_BYTES: Record<Algo, number> = {
  md5: 16,
  sha1: 20,
  sha256: 32,
  sha384: 48,
  sha512: 64,
};

export const BLOCK_BYTES: Record<Algo, number> = {
  md5: 64,
  sha1: 64,
  sha256: 64,
  sha384: 128,
  sha512: 128,
};

/* ── Derived constants ────────────────────── */

/** First `n` primes, by trial division — n is never more than 80 here. */
function firstPrimes(n: number): number[] {
  const out: number[] = [];
  for (let candidate = 2; out.length < n; candidate += 1) {
    let prime = true;
    for (const p of out) {
      if (p * p > candidate) break;
      if (candidate % p === 0) {
        prime = false;
        break;
      }
    }
    if (prime) out.push(candidate);
  }
  return out;
}

/**
 * BigInt without literals: the project targets ES2017, where `1n` is a syntax
 * error. `BigInt(1)` is the same value.
 */
const B1 = BigInt(1);
const B2 = BigInt(2);
const B8 = BigInt(8);
const B32 = BigInt(32);
const BYTE = BigInt(0xff);
const W32 = BigInt(0xffffffff);

/** Floor of the k-th root of n, by Newton's method on integers. */
function iroot(n: bigint, k: bigint): bigint {
  if (n < B2) return n;
  let x = B1 << (BigInt(n.toString(2).length) / k + B1);
  for (;;) {
    const next = ((k - B1) * x + n / x ** (k - B1)) / k;
    if (next >= x) return x;
    x = next;
  }
}

/**
 * The first `bits` bits of the fractional part of the `root`-th root of `p`.
 *
 * `frac(p^(1/r)) * 2^b` is the low b bits of `(p * 2^(r·b))^(1/r)`, and that
 * root is an exact integer operation — no floating point anywhere.
 */
function fractionBits(p: number, root: number, bits: number): bigint {
  const scaled = BigInt(p) << BigInt(root * bits);
  return iroot(scaled, BigInt(root)) & ((B1 << BigInt(bits)) - B1);
}

function words32(values: bigint[]): Uint32Array {
  return new Uint32Array(values.map((v) => Number(v & W32)));
}

/** hi/lo pairs, flattened: [hi0, lo0, hi1, lo1, …]. */
function words64(values: bigint[]): Uint32Array {
  const out = new Uint32Array(values.length * 2);
  values.forEach((v, i) => {
    out[i * 2] = Number((v >> B32) & W32);
    out[i * 2 + 1] = Number(v & W32);
  });
  return out;
}

const PRIMES = firstPrimes(80);

const SHA256_K = words32(PRIMES.slice(0, 64).map((p) => fractionBits(p, 3, 32)));
const SHA256_IV = words32(PRIMES.slice(0, 8).map((p) => fractionBits(p, 2, 32)));
const SHA512_K = words64(PRIMES.slice(0, 80).map((p) => fractionBits(p, 3, 64)));
const SHA512_IV = words64(PRIMES.slice(0, 8).map((p) => fractionBits(p, 2, 64)));
/** SHA-384 starts from the 9th–16th primes' square roots. */
const SHA384_IV = words64(PRIMES.slice(8, 16).map((p) => fractionBits(p, 2, 64)));

/** MD5's additive constants: |sin(i+1)| in radians, scaled. */
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i += 1) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

/* ── Cores ────────────────────────────────── */

type Core = {
  blockBytes: number;
  /** Bytes reserved for the length field: 8, or 16 for the SHA-512 family. */
  lengthBytes: number;
  /** MD5 writes its length little-endian; the SHA family big-endian. */
  littleEndian: boolean;
  compress: (block: Uint8Array) => void;
  final: () => Uint8Array;
};

const rotl = (v: number, n: number) => ((v << n) | (v >>> (32 - n))) >>> 0;
const rotr = (v: number, n: number) => ((v >>> n) | (v << (32 - n))) >>> 0;

function md5Core(): Core {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const m = new Uint32Array(16);

  const compress = (block: Uint8Array) => {
    for (let i = 0; i < 16; i += 1) {
      m[i] =
        (block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24)) >>> 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + (f >>> 0) + MD5_K[i] + m[g]) >>> 0;
      const shift = MD5_S[(i >> 4) * 4 + (i % 4)];
      const next = (b + rotl(sum, shift)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
  };

  const final = () => {
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i += 1) {
      out[i * 4] = h[i] & 0xff;
      out[i * 4 + 1] = (h[i] >>> 8) & 0xff;
      out[i * 4 + 2] = (h[i] >>> 16) & 0xff;
      out[i * 4 + 3] = (h[i] >>> 24) & 0xff;
    }
    return out;
  };

  return { blockBytes: 64, lengthBytes: 8, littleEndian: true, compress, final };
}

function beBytes(h: Uint32Array, words: number): Uint8Array {
  const out = new Uint8Array(words * 4);
  for (let i = 0; i < words; i += 1) {
    out[i * 4] = (h[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (h[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (h[i] >>> 8) & 0xff;
    out[i * 4 + 3] = h[i] & 0xff;
  }
  return out;
}

function sha1Core(): Core {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const w = new Uint32Array(80);

  const compress = (block: Uint8Array) => {
    for (let i = 0; i < 16; i += 1) {
      w[i] =
        ((block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i += 1) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  };

  return { blockBytes: 64, lengthBytes: 8, littleEndian: false, compress, final: () => beBytes(h, 5) };
}

function sha256Core(): Core {
  const h = SHA256_IV.slice();
  const w = new Uint32Array(64);

  const compress = (block: Uint8Array) => {
    for (let i = 0; i < 16; i += 1) {
      w[i] =
        ((block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + (ch >>> 0) + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + (maj >>> 0)) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i += 1) h[i] = (h[i] + next[i]) >>> 0;
  };

  return { blockBytes: 64, lengthBytes: 8, littleEndian: false, compress, final: () => beBytes(h, 8) };
}

/* SHA-512 arithmetic on 32-bit halves. `n` is never 0 or 32 in this cipher,
   so the shift helpers do not need the degenerate cases. */
const rotrHi = (hi: number, lo: number, n: number) =>
  (n < 32 ? (hi >>> n) | (lo << (32 - n)) : (lo >>> (n - 32)) | (hi << (64 - n))) >>> 0;
const rotrLo = (hi: number, lo: number, n: number) =>
  (n < 32 ? (lo >>> n) | (hi << (32 - n)) : (hi >>> (n - 32)) | (lo << (64 - n))) >>> 0;

function sha512Family(iv: Uint32Array, outBytes: number): Core {
  const h = iv.slice();
  const w = new Uint32Array(160);

  const compress = (block: Uint8Array) => {
    for (let i = 0; i < 32; i += 1) {
      w[i] =
        ((block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i += 1) {
      const h15 = w[(i - 15) * 2];
      const l15 = w[(i - 15) * 2 + 1];
      const s0hi = (rotrHi(h15, l15, 1) ^ rotrHi(h15, l15, 8) ^ (h15 >>> 7)) >>> 0;
      const s0lo = (rotrLo(h15, l15, 1) ^ rotrLo(h15, l15, 8) ^ ((l15 >>> 7) | (h15 << 25))) >>> 0;
      const h2 = w[(i - 2) * 2];
      const l2 = w[(i - 2) * 2 + 1];
      const s1hi = (rotrHi(h2, l2, 19) ^ rotrHi(h2, l2, 61) ^ (h2 >>> 6)) >>> 0;
      const s1lo = (rotrLo(h2, l2, 19) ^ rotrLo(h2, l2, 61) ^ ((l2 >>> 6) | (h2 << 26))) >>> 0;

      const lo = s1lo + w[(i - 7) * 2 + 1] + s0lo + w[(i - 16) * 2 + 1];
      const hi = s1hi + w[(i - 7) * 2] + s0hi + w[(i - 16) * 2] + Math.floor(lo / 0x100000000);
      w[i * 2] = hi % 0x100000000;
      w[i * 2 + 1] = lo % 0x100000000;
    }

    const v = h.slice();
    for (let i = 0; i < 80; i += 1) {
      const ahi = v[0];
      const alo = v[1];
      const bhi = v[2];
      const blo = v[3];
      const chi = v[4];
      const clo = v[5];
      const dhi = v[6];
      const dlo = v[7];
      const ehi = v[8];
      const elo = v[9];
      const fhi = v[10];
      const flo = v[11];
      const ghi = v[12];
      const glo = v[13];
      const hhi = v[14];
      const hlo = v[15];

      const S1hi = (rotrHi(ehi, elo, 14) ^ rotrHi(ehi, elo, 18) ^ rotrHi(ehi, elo, 41)) >>> 0;
      const S1lo = (rotrLo(ehi, elo, 14) ^ rotrLo(ehi, elo, 18) ^ rotrLo(ehi, elo, 41)) >>> 0;
      const chHi = ((ehi & fhi) ^ (~ehi & ghi)) >>> 0;
      const chLo = ((elo & flo) ^ (~elo & glo)) >>> 0;
      const S0hi = (rotrHi(ahi, alo, 28) ^ rotrHi(ahi, alo, 34) ^ rotrHi(ahi, alo, 39)) >>> 0;
      const S0lo = (rotrLo(ahi, alo, 28) ^ rotrLo(ahi, alo, 34) ^ rotrLo(ahi, alo, 39)) >>> 0;
      const majHi = ((ahi & bhi) ^ (ahi & chi) ^ (bhi & chi)) >>> 0;
      const majLo = ((alo & blo) ^ (alo & clo) ^ (blo & clo)) >>> 0;

      const t1lo = hlo + S1lo + chLo + SHA512_K[i * 2 + 1] + w[i * 2 + 1];
      const t1hi = hhi + S1hi + chHi + SHA512_K[i * 2] + w[i * 2] + Math.floor(t1lo / 0x100000000);
      const t2lo = S0lo + majLo;
      const t2hi = S0hi + majHi + Math.floor(t2lo / 0x100000000);

      const dSumLo = dlo + (t1lo % 0x100000000);
      const dSumHi = dhi + (t1hi % 0x100000000) + Math.floor(dSumLo / 0x100000000);
      const aSumLo = (t1lo % 0x100000000) + (t2lo % 0x100000000);
      const aSumHi =
        (t1hi % 0x100000000) + (t2hi % 0x100000000) + Math.floor(aSumLo / 0x100000000);

      v[14] = ghi;
      v[15] = glo;
      v[12] = fhi;
      v[13] = flo;
      v[10] = ehi;
      v[11] = elo;
      v[8] = dSumHi % 0x100000000;
      v[9] = dSumLo % 0x100000000;
      v[6] = chi;
      v[7] = clo;
      v[4] = bhi;
      v[5] = blo;
      v[2] = ahi;
      v[3] = alo;
      v[0] = aSumHi % 0x100000000;
      v[1] = aSumLo % 0x100000000;
    }

    for (let i = 0; i < 8; i += 1) {
      const lo = h[i * 2 + 1] + v[i * 2 + 1];
      const hi = h[i * 2] + v[i * 2] + Math.floor(lo / 0x100000000);
      h[i * 2] = hi % 0x100000000;
      h[i * 2 + 1] = lo % 0x100000000;
    }
  };

  return {
    blockBytes: 128,
    lengthBytes: 16,
    littleEndian: false,
    compress,
    final: () => beBytes(h, 16).subarray(0, outBytes),
  };
}

/* ── Incremental interface ────────────────── */

export type Digester = {
  update: (chunk: Uint8Array) => void;
  /** Finishes the hash. Calling it twice throws rather than lying. */
  digest: () => Uint8Array;
};

function core(algo: Algo): Core {
  if (algo === 'md5') return md5Core();
  if (algo === 'sha1') return sha1Core();
  if (algo === 'sha256') return sha256Core();
  if (algo === 'sha384') return sha512Family(SHA384_IV, 48);
  return sha512Family(SHA512_IV, 64);
}

export function createDigest(algo: Algo): Digester {
  const c = core(algo);
  const buffer = new Uint8Array(c.blockBytes);
  let buffered = 0;
  let total = 0;
  let finished = false;

  const update = (chunk: Uint8Array) => {
    if (finished) throw new Error('digest() already called on this digester');
    total += chunk.length;
    let offset = 0;
    if (buffered > 0) {
      const take = Math.min(c.blockBytes - buffered, chunk.length);
      buffer.set(chunk.subarray(0, take), buffered);
      buffered += take;
      offset = take;
      if (buffered === c.blockBytes) {
        c.compress(buffer);
        buffered = 0;
      }
    }
    while (offset + c.blockBytes <= chunk.length) {
      c.compress(chunk.subarray(offset, offset + c.blockBytes));
      offset += c.blockBytes;
    }
    if (offset < chunk.length) {
      buffer.set(chunk.subarray(offset), 0);
      buffered = chunk.length - offset;
    }
  };

  const digest = () => {
    if (finished) throw new Error('digest() already called on this digester');
    finished = true;

    // 0x80, then zeros, then the message length in bits. When the length no
    // longer fits in this block the padding runs into one more block.
    const tail = new Uint8Array(buffered + 1 <= c.blockBytes - c.lengthBytes ? c.blockBytes : c.blockBytes * 2);
    tail.set(buffer.subarray(0, buffered), 0);
    tail[buffered] = 0x80;

    const bits = BigInt(total) * B8;
    for (let i = 0; i < c.lengthBytes; i += 1) {
      const byte = Number((bits >> BigInt(8 * i)) & BYTE);
      tail[c.littleEndian ? tail.length - c.lengthBytes + i : tail.length - 1 - i] = byte;
    }
    for (let offset = 0; offset < tail.length; offset += c.blockBytes) {
      c.compress(tail.subarray(offset, offset + c.blockBytes));
    }
    return c.final();
  };

  return { update, digest };
}

export function digestBytes(algo: Algo, data: Uint8Array): Uint8Array {
  const d = createDigest(algo);
  d.update(data);
  return d.digest();
}

/**
 * Hashes a stream without ever holding all of it.
 *
 * `onProgress` is called per chunk with the running byte count; the caller
 * decides how often to repaint. Several algorithms at once share one pass
 * over the data, because reading a 4 GB file five times is five times the
 * wait for the same answer.
 */
export async function digestStreamMulti(
  algos: Algo[],
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  onProgress?: (bytesSoFar: number) => void
): Promise<Record<string, Uint8Array>> {
  const digesters = algos.map((algo) => ({ algo, d: createDigest(algo) }));
  let seen = 0;
  for await (const chunk of chunks as AsyncIterable<Uint8Array>) {
    for (const entry of digesters) entry.d.update(chunk);
    seen += chunk.length;
    onProgress?.(seen);
  }
  const out: Record<string, Uint8Array> = {};
  for (const entry of digesters) out[entry.algo] = entry.d.digest();
  return out;
}

/* ── Naming and comparison ────────────────── */

export const ALGO_LABEL: Record<Algo, string> = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

/** Which algorithms could have produced a digest of this hex length. */
export function algosForHexLength(length: number): Algo[] {
  return ALGOS.filter((algo) => DIGEST_BYTES[algo] * 2 === length);
}

/** Drops the separators people put inside a digest, and lower-cases it. */
const join = (text: string) => text.replace(/[\s:]/g, '').toLowerCase();

/** `md5:`, `SHA256 =`, `sha-512/256:` — the prefix people paste in front. */
const ALGO_PREFIX = /^(?:md5|sha-?1|sha-?2?-?(?:224|256|384|512)|sha512-?\/?2?(?:24|56)?)\s*[:=]\s*/i;

/**
 * Compares a pasted digest against a computed one, tolerating the shapes
 * checksums arrive in:
 *
 *   upper case                `E3B0C442…`
 *   an algorithm prefix       `sha256: e3b0c442…`
 *   groups                    `e3b0c442 98fc1c14 …` or `e3:b0:c4:42…`
 *   GNU coreutils output      `e3b0c442…  ubuntu-24.04.iso`  (` *name` in
 *                             binary mode, and a leading `\` when the name
 *                             had to be escaped)
 *   BSD / openssl output      `SHA256 (ubuntu-24.04.iso) = e3b0c442…`
 *
 * The last two are what `sha256sum`, `shasum --tag` and `openssl dgst` print,
 * which makes them the forms most likely to be copied straight in. Dropping a
 * filename matters: left in, it turns a correct download into a mismatch that
 * reads as "the file is broken" rather than "the tool misread the line".
 *
 * Anything this cannot recognise comes back with separators stripped, so it
 * simply fails to match instead of being silently reinterpreted.
 */
export function normalizeDigest(text: string): string {
  const line = text.trim();

  // Tagged form. The filename may contain anything, so the digest is taken
  // from after the last `=` rather than the name being parsed.
  const tagged = /^[A-Za-z][A-Za-z0-9-]*\s*\(.*\)\s*=\s*([\sA-Fa-f0-9:]+)$/.exec(line);
  if (tagged) return join(tagged[1]);

  const body = line.replace(ALGO_PREFIX, '');

  // Untagged form: digest, separator, filename. Taken only when the first token
  // is a whole digest's worth of hex and what follows is not simply more hex —
  // otherwise `e3b0c442 98fc1c14 …` would lose everything after its first group
  // to an imaginary file called 98fc1c14.
  const untagged = /^\\?([A-Fa-f0-9]+)(?:[ \t]+\*?|[ \t]*\*)(\S.*)$/.exec(body);
  if (
    untagged &&
    algosForHexLength(untagged[1].length).length > 0 &&
    /[^\sA-Fa-f0-9:]/.test(untagged[2])
  ) {
    return untagged[1].toLowerCase();
  }

  return join(body);
}
