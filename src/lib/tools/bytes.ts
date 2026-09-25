/** Byte-level conversions shared by the encoding and crypto drawers. */

const HEX = '0123456789abcdef';

export function toHex(data: Uint8Array, separator = ''): string {
  let out = '';
  for (let i = 0; i < data.length; i += 1) {
    out += HEX[data[i] >> 4] + HEX[data[i] & 15];
    if (separator && i < data.length - 1) out += separator;
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[\s:_-]/g, '').toLowerCase();
  if (clean.length % 2 !== 0) throw new Error('hex length must be even');
  if (!/^[0-9a-f]*$/.test(clean)) throw new Error('hex has non-hex characters');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function toBase64(data: Uint8Array, urlSafe = false): string {
  let raw = '';
  // Chunked so a multi-megabyte file does not blow the argument limit.
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    raw += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  const b64 = btoa(raw);
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

export function fromBase64(text: string): Uint8Array {
  let b64 = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 1) throw new Error('not a valid base64 length');
  if (pad) b64 += '='.repeat(4 - pad);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(data: Uint8Array, fatal = false): string {
  return new TextDecoder('utf-8', { fatal }).decode(data);
}

/** Constant-time-ish comparison for checksum verdicts. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
