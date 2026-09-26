/**
 * AES-256-GCM with a password, and a container format that says what it is.
 *
 * The cipher is the easy part — `crypto.subtle` does AES-GCM, and GCM is
 * authenticated, so a wrong password or a flipped bit fails loudly instead of
 * producing garbage plaintext. The parts that are easy to get wrong, and that
 * this file is mostly about:
 *
 *  - **A password is not a key.** It has to be stretched, slowly, or a GPU
 *    tries a few billion candidates a second against the ciphertext. PBKDF2
 *    with SHA-256 at 600,000 iterations is OWASP's 2023 figure for this
 *    combination. It is not a great KDF — Argon2id is, and is not in
 *    WebCrypto — so the cost is spent where it can be: iterations.
 *  - **Salt and IV must be fresh every time.** A reused salt means one
 *    derivation attacks every message; a reused (key, IV) pair in GCM is
 *    catastrophic — it leaks the XOR of two plaintexts and, worse, the
 *    authentication subkey. Both are drawn from the CSPRNG per message and
 *    stored in the output, which is why the same input never encrypts to the
 *    same bytes twice.
 *  - **The parameters have to travel with the ciphertext and be
 *    authenticated.** The header carries version, KDF, cipher and iteration
 *    count, and it is passed to GCM as additional authenticated data, so
 *    editing the iteration count in the file makes decryption fail rather
 *    than quietly deriving a different key.
 *
 * The format is this tool's own — nothing else reads it. It is documented
 * byte-for-byte below so that the output is not a black box: with the salt,
 * IV and iteration count in the clear, anyone can reproduce the decryption
 * with a dozen lines of any language's crypto library.
 *
 *   offset  size  meaning
 *        0     5  magic, ASCII "SPENC"
 *        5     1  format version, currently 1
 *        6     1  KDF id: 1 = PBKDF2-HMAC-SHA256
 *        7     1  cipher id: 1 = AES-256-GCM
 *        8     4  iteration count, big-endian uint32
 *       12    16  salt
 *       28    12  IV (96 bits, the size GCM is specified for)
 *       40     …  ciphertext, with GCM's 16-byte tag appended
 */

export const MAGIC = 'SPENC';
export const VERSION = 1;
export const KDF_PBKDF2_SHA256 = 1;
export const CIPHER_AES_256_GCM = 1;

export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const HEADER_BYTES = 40;

/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000;
/** Low enough for tests and throwaway data; the UI warns below the default. */
export const MIN_ITERATIONS = 1_000;
/** Above this a phone takes the best part of a minute per attempt. */
export const MAX_ITERATIONS = 5_000_000;

export class BadContainer extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadContainer';
  }
}

/** Wrong password, or the data was altered. GCM cannot tell you which. */
export class AuthFailed extends Error {
  constructor() {
    super('authentication failed — wrong password, or the data was altered');
    this.name = 'AuthFailed';
  }
}

export type Header = {
  version: number;
  kdf: number;
  cipher: number;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
};

export type Container = Header & { ciphertext: Uint8Array };

/* ── Bytes ────────────────────────────────── */
/** Local copies: the test runner imports this file directly and does not
 *  resolve the `@/` path alias. */

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

export function toBase64(data: Uint8Array): string {
  let raw = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) raw += String.fromCharCode(...data.subarray(i, i + CHUNK));
  return btoa(raw);
}

export function fromBase64(text: string): Uint8Array {
  let b64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 1) throw new BadContainer('not a valid base64 length');
  if (pad) b64 += '='.repeat(4 - pad);
  let raw: string;
  try {
    raw = atob(b64);
  } catch {
    throw new BadContainer('not valid base64');
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/* ── Container ────────────────────────────── */

export function buildHeader(iterations: number, salt: Uint8Array, iv: Uint8Array): Uint8Array {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new BadContainer('the iteration count must be a positive integer');
  }
  if (iterations > 0xffffffff) throw new BadContainer('the iteration count does not fit in the header');
  if (salt.length !== SALT_BYTES) throw new BadContainer(`the salt must be ${SALT_BYTES} bytes`);
  if (iv.length !== IV_BYTES) throw new BadContainer(`the IV must be ${IV_BYTES} bytes`);

  const header = new Uint8Array(HEADER_BYTES);
  for (let i = 0; i < MAGIC.length; i += 1) header[i] = MAGIC.charCodeAt(i);
  header[5] = VERSION;
  header[6] = KDF_PBKDF2_SHA256;
  header[7] = CIPHER_AES_256_GCM;
  header[8] = (iterations >>> 24) & 0xff;
  header[9] = (iterations >>> 16) & 0xff;
  header[10] = (iterations >>> 8) & 0xff;
  header[11] = iterations & 0xff;
  header.set(salt, 12);
  header.set(iv, 28);
  return header;
}

export function parseContainer(data: Uint8Array): Container {
  if (data.length < HEADER_BYTES + TAG_BYTES) {
    throw new BadContainer('too short to be a container — the header alone is 40 bytes');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (data[i] !== MAGIC.charCodeAt(i)) {
      throw new BadContainer('this is not output from this tool (the SPENC marker is missing)');
    }
  }
  const version = data[5];
  if (version !== VERSION) throw new BadContainer(`container version ${version} is not supported`);
  const kdf = data[6];
  if (kdf !== KDF_PBKDF2_SHA256) throw new BadContainer(`unknown key-derivation id ${kdf}`);
  const cipher = data[7];
  if (cipher !== CIPHER_AES_256_GCM) throw new BadContainer(`unknown cipher id ${cipher}`);

  const iterations = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0;
  if (iterations < 1) throw new BadContainer('the header claims zero iterations');

  return {
    version,
    kdf,
    cipher,
    iterations,
    salt: data.slice(12, 12 + SALT_BYTES),
    iv: data.slice(28, 28 + IV_BYTES),
    ciphertext: data.slice(HEADER_BYTES),
  };
}

/** The header of a parsed container, rebuilt — this is what GCM authenticated. */
export function headerOf(container: Container): Uint8Array {
  return buildHeader(container.iterations, container.salt, container.iv);
}

/* ── Key derivation ───────────────────────── */

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new BadContainer(`the iteration count must be at least ${MIN_ITERATIONS}`);
  }
  if (iterations > MAX_ITERATIONS) {
    throw new BadContainer(`the iteration count must be at most ${MAX_ITERATIONS}`);
  }
  const material = await crypto.subtle.importKey('raw', encodeUtf8(password) as Uint8Array<ArrayBuffer>, 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ── Encrypt and decrypt ──────────────────── */

export type EncryptOptions = {
  iterations?: number;
  /** Test hook. Left out in the tool, so every message gets fresh randomness. */
  salt?: Uint8Array;
  iv?: Uint8Array;
};

export async function encryptBytes(
  plaintext: Uint8Array,
  password: string,
  options: EncryptOptions = {}
): Promise<Uint8Array> {
  if (password === '') throw new BadContainer('a passphrase is required');
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  // crypto.getRandomValues, not Math.random: these two values are the entire
  // reason the same plaintext does not encrypt to the same bytes twice.
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = options.iv ?? crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const header = buildHeader(iterations, salt, iv);
  const key = await deriveKey(password, salt, iterations);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, additionalData: header as Uint8Array<ArrayBuffer>, tagLength: TAG_BYTES * 8 },
      key,
      plaintext as Uint8Array<ArrayBuffer>
    )
  );

  const out = new Uint8Array(header.length + sealed.length);
  out.set(header, 0);
  out.set(sealed, header.length);
  return out;
}

export async function decryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  const container = parseContainer(data);
  const key = await deriveKey(password, container.salt, container.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: container.iv as Uint8Array<ArrayBuffer>,
        additionalData: headerOf(container) as Uint8Array<ArrayBuffer>,
        tagLength: TAG_BYTES * 8,
      },
      key,
      container.ciphertext as Uint8Array<ArrayBuffer>
    );
    return new Uint8Array(plain);
  } catch {
    // Every failure mode of GCM arrives here as the same DOMException, and
    // that is the correct amount of information to hand back: distinguishing
    // "wrong password" from "altered data" would be a padding oracle.
    throw new AuthFailed();
  }
}

/* ── Armoured text ────────────────────────── */

export const ARMOR_BEGIN = '-----BEGIN SPENC MESSAGE-----';
export const ARMOR_END = '-----END SPENC MESSAGE-----';

/** Base64 in 64-column lines between markers, so it survives email and chat. */
export function armor(data: Uint8Array): string {
  const body = toBase64(data).replace(/(.{64})/g, '$1\n').trimEnd();
  return `${ARMOR_BEGIN}\n${body}\n${ARMOR_END}`;
}

/**
 * Reads armoured text back, and also accepts bare base64 — people paste the
 * middle of the block, or a version their mail client re-wrapped.
 */
export function dearmor(text: string): Uint8Array {
  const trimmed = text.trim();
  if (trimmed === '') throw new BadContainer('nothing to decrypt');
  const begin = trimmed.indexOf(ARMOR_BEGIN);
  if (begin >= 0) {
    const end = trimmed.indexOf(ARMOR_END, begin);
    if (end < 0) throw new BadContainer('the END marker is missing — the message looks truncated');
    return fromBase64(trimmed.slice(begin + ARMOR_BEGIN.length, end));
  }
  return fromBase64(trimmed);
}

export async function encryptText(
  plaintext: string,
  password: string,
  options: EncryptOptions = {}
): Promise<string> {
  return armor(await encryptBytes(encodeUtf8(plaintext), password, options));
}

/**
 * Decrypts armoured text. The result is decoded as UTF-8 with `fatal: true`:
 * if the plaintext was not text, saying so beats handing back replacement
 * characters that look like corruption.
 */
export async function decryptText(armored: string, password: string): Promise<string> {
  const plain = await decryptBytes(dearmor(armored), password);
  try {
    return decodeUtf8(plain);
  } catch {
    throw new BadContainer('decrypted fine, but the contents are not UTF-8 text — use file mode');
  }
}

/* ── Reporting ────────────────────────────── */

/** Ciphertext size for a given plaintext size: header, tag, and nothing else. */
export function containerSize(plaintextBytes: number): number {
  return HEADER_BYTES + plaintextBytes + TAG_BYTES;
}

/**
 * Rough offline guess rate against this container, for the passphrase advice
 * on the page. One PBKDF2-SHA256 iteration is two SHA-256 compressions, and a
 * 2024-era GPU does on the order of 1e10 of those per second.
 */
export function guessesPerSecond(iterations: number, hashesPerSecond = 1e10): number {
  return hashesPerSecond / (iterations * 2);
}
