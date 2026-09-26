/**
 * Percent-encoding, with the four different answers spelled out.
 *
 * "URL encode" is not one operation. `encodeURIComponent` leaves `!'()*` alone
 * because it was written against RFC 2396, where those were "marks"; RFC 3986
 * made them sub-delimiters, so a filename with an apostrophe survives
 * `encodeURIComponent` and then breaks whatever parses the URL on the other
 * side. A form body is different again: it is not RFC 3986 at all, it encodes
 * space as `+`, and a `+` that means space is indistinguishable from a `+` that
 * means plus unless you already know which of the two you are reading.
 *
 * So the mode is a choice the tool makes you make, and each mode is defined by
 * the exact set of bytes it leaves untouched — not by delegating to a built-in
 * whose set you have to look up.
 */

export type Mode =
  /** `encodeURIComponent`: unreserved plus the RFC 2396 marks `!'()*`. */
  | 'component'
  /** RFC 3986 §2.3 unreserved only — `A-Z a-z 0-9 - . _ ~`. */
  | 'rfc3986'
  /** `encodeURI`: leaves the reserved delimiters, for a whole URL. */
  | 'uri'
  /** `application/x-www-form-urlencoded`: space becomes `+`. */
  | 'form';

export class PercentError extends Error {
  /** 0-based offset into the input string. */
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = 'PercentError';
    this.index = index;
  }
}

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** Bytes each mode emits literally. Everything else becomes `%XX`. */
export const SAFE: Record<Mode, string> = {
  component: `${UNRESERVED}!'()*`,
  rfc3986: UNRESERVED,
  // encodeURI also leaves the delimiters so a URL stays a URL — but not the
  // brackets of an IPv6 literal, which is a quirk of the built-in this mode
  // deliberately reproduces rather than quietly improving on.
  uri: `${UNRESERVED}!$&'()*+,;=:/?#@`,
  // HTML's urlencoded serialiser: unreserved minus `~`, plus `*`, space to `+`.
  form: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._',
};

const HEX = '0123456789ABCDEF';

function safeSet(mode: Mode): Set<number> {
  const set = new Set<number>();
  for (const ch of SAFE[mode]) set.add(ch.charCodeAt(0));
  return set;
}

const SAFE_SETS: Record<Mode, Set<number>> = {
  component: safeSet('component'),
  rfc3986: safeSet('rfc3986'),
  uri: safeSet('uri'),
  form: safeSet('form'),
};

/**
 * Percent-encodes the UTF-8 bytes of `text`.
 *
 * Encoding operates on bytes, never on characters: `%E4%B8%AD` is three
 * escapes for one ideograph, and any implementation that escapes code units
 * instead produces `%U4E2D`, which nothing on earth decodes.
 */
export function percentEncode(text: string, mode: Mode = 'component'): string {
  const safe = SAFE_SETS[mode];
  const data = new TextEncoder().encode(text);
  let out = '';
  for (const byte of data) {
    if (safe.has(byte)) out += String.fromCharCode(byte);
    else if (mode === 'form' && byte === 0x20) out += '+';
    else out += `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
  }
  return out;
}

/**
 * First byte offset at which `data` stops being valid UTF-8, or -1.
 *
 * `TextDecoder` with `fatal` tells you that it failed but not where, and
 * "where" is the whole point when someone has double-encoded half a query
 * string and single-encoded the rest.
 */
export function firstInvalidUtf8(data: Uint8Array): number {
  let i = 0;
  while (i < data.length) {
    const b = data[i];
    let need: number;
    let min: number;
    let cp: number;
    if (b < 0x80) {
      i += 1;
      continue;
    } else if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      min = 0x80;
      cp = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      min = 0x800;
      cp = b & 0x0f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      min = 0x10000;
      cp = b & 0x07;
    } else {
      // 0x80–0xC1 is a stray continuation or an overlong two-byte lead;
      // 0xF5–0xFF encodes above U+10FFFF, which UTF-8 no longer allows.
      return i;
    }
    // Not enough bytes left for the continuation sequence: truncated.
    if (i + need >= data.length) return i;
    for (let k = 1; k <= need; k += 1) {
      const c = data[i + k];
      if (c < 0x80 || c > 0xbf) return i;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min) return i; // overlong
    if (cp >= 0xd800 && cp <= 0xdfff) return i; // lone surrogate
    if (cp > 0x10ffff) return i;
    i += need + 1;
  }
  return -1;
}

export type DecodeOptions = { plusAsSpace?: boolean };

/**
 * Decodes percent escapes back to text, reporting the offset of whatever broke.
 *
 * `decodeURIComponent` throws `URIError: malformed URI sequence` for a bad
 * escape *and* for bytes that are not valid UTF-8, with no distinction and no
 * position. Both cases have different fixes, so they are separated here.
 */
export function percentDecode(text: string, options: DecodeOptions = {}): string {
  const data: number[] = [];
  /** Source character index for each byte, so an error can point at it. */
  const origin: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '%') {
      const pair = text.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
        throw new PercentError(
          `"%${pair}" is not a percent escape: % must be followed by two hex digits`,
          i
        );
      }
      data.push(Number.parseInt(pair, 16));
      origin.push(i);
      i += 2;
      continue;
    }
    if (ch === '+' && options.plusAsSpace) {
      data.push(0x20);
      origin.push(i);
      continue;
    }
    for (const byte of new TextEncoder().encode(ch)) {
      data.push(byte);
      origin.push(i);
    }
  }

  const bytes = new Uint8Array(data);
  const bad = firstInvalidUtf8(bytes);
  if (bad !== -1) {
    throw new PercentError(
      'the escapes decode to bytes that are not valid UTF-8 (a different encoding, or double-encoded input)',
      origin[bad] ?? 0
    );
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Decode that never throws, for per-row display in the query table. */
export function tryDecode(text: string, options: DecodeOptions = {}): { text: string; error: string | null } {
  try {
    return { text: percentDecode(text, options), error: null };
  } catch (problem) {
    return { text, error: problem instanceof Error ? problem.message : String(problem) };
  }
}

/* ── URL structure ────────────────────────── */

export type UrlParts = {
  scheme: string;
  /** Everything between `//` and the path: userinfo, host, port. */
  authority: string;
  userinfo: string;
  host: string;
  port: string;
  path: string;
  query: string;
  fragment: string;
  /** No scheme and no authority: this is a relative reference, not a URL. */
  relative: boolean;
};

/** RFC 3986 Appendix B, the regular expression the spec itself prints. */
const URL_RE = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;

export function splitUrl(url: string): UrlParts {
  const match = URL_RE.exec(url.trim());
  // The expression matches every string, including the empty one.
  const [, scheme = '', authority = '', path = '', query = '', fragment = ''] = match ?? [];

  let userinfo = '';
  let rest = authority;
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    userinfo = authority.slice(0, at);
    rest = authority.slice(at + 1);
  }

  let host = rest;
  let port = '';
  if (rest.startsWith('[')) {
    // IPv6 literal: the colons inside the brackets are part of the address.
    const close = rest.indexOf(']');
    if (close !== -1) {
      host = rest.slice(0, close + 1);
      if (rest[close + 1] === ':') port = rest.slice(close + 2);
    }
  } else {
    const colon = rest.lastIndexOf(':');
    if (colon !== -1) {
      host = rest.slice(0, colon);
      port = rest.slice(colon + 1);
    }
  }

  return {
    scheme,
    authority,
    userinfo,
    host,
    port,
    path,
    query,
    fragment,
    relative: scheme === '' && authority === '',
  };
}

/** Rebuilds a URL from parts, so an edited query can be put back. */
export function joinUrl(parts: Partial<UrlParts>): string {
  const authority =
    parts.authority ??
    `${parts.userinfo ? `${parts.userinfo}@` : ''}${parts.host ?? ''}${parts.port ? `:${parts.port}` : ''}`;
  let out = '';
  if (parts.scheme) out += `${parts.scheme}:`;
  if (authority) out += `//${authority}`;
  out += parts.path ?? '';
  if (parts.query) out += `?${parts.query}`;
  if (parts.fragment) out += `#${parts.fragment}`;
  return out;
}

/* ── Query strings ────────────────────────── */

export type Pair = {
  key: string;
  value: string;
  /** `?flag` with no `=` is not the same as `?flag=`; rebuilding must know. */
  hasEquals: boolean;
  /** Set when this row's key or value would not decode. */
  error: string | null;
};

/**
 * Splits a query string into decoded pairs.
 *
 * Separators are `&` and `;`: the latter was recommended by HTML 4 for a
 * decade, so it turns up in older links, and treating it as data instead of a
 * separator silently merges two parameters into one. A leading `?` is dropped
 * if present, because people paste with it.
 */
export function parseQuery(query: string, options: DecodeOptions = { plusAsSpace: true }): Pair[] {
  const body = query.replace(/^[?]/, '');
  if (body === '') return [];
  return body
    .split(/[&;]/)
    .filter((chunk) => chunk !== '')
    .map((chunk) => {
      const eq = chunk.indexOf('=');
      const rawKey = eq === -1 ? chunk : chunk.slice(0, eq);
      const rawValue = eq === -1 ? '' : chunk.slice(eq + 1);
      const key = tryDecode(rawKey, options);
      const value = tryDecode(rawValue, options);
      return {
        key: key.text,
        value: value.text,
        hasEquals: eq !== -1,
        error: key.error ?? value.error,
      };
    });
}

export type BuildOptions = { plusAsSpace?: boolean; mode?: Mode };

/**
 * Rebuilds a query string from pairs.
 *
 * `form` mode is the default because that is what a browser sends and what
 * every server-side query parser expects; `rfc3986` is there for the case
 * where the query is going into a signature base string and `+` would be
 * read as a literal plus.
 */
export function buildQuery(pairs: readonly Pair[], options: BuildOptions = {}): string {
  const mode = options.mode ?? (options.plusAsSpace === false ? 'rfc3986' : 'form');
  return pairs
    .filter((pair) => pair.key !== '' || pair.value !== '')
    .map((pair) => {
      const key = percentEncode(pair.key, mode);
      if (!pair.hasEquals && pair.value === '') return key;
      return `${key}=${percentEncode(pair.value, mode)}`;
    })
    .join('&');
}

/**
 * Keys that appear more than once, in order of first appearance.
 *
 * Repeated keys are legal and mean a list to PHP and Rails and a last-wins
 * scalar to Express and Go — worth pointing at rather than hiding.
 */
export function duplicateKeys(pairs: readonly Pair[]): string[] {
  const seen = new Map<string, number>();
  for (const pair of pairs) seen.set(pair.key, (seen.get(pair.key) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);
}

/**
 * How many times the input appears to have been percent-encoded.
 *
 * Double encoding is the most common percent-encoding bug there is: `%2520`
 * is a literal `%20` that some layer escaped a second time. Counting the
 * rounds it takes to reach a fixed point names the problem outright.
 */
export function encodingRounds(text: string, limit = 5): number {
  let current = text;
  let rounds = 0;
  while (rounds < limit && /%[0-9a-fA-F]{2}/.test(current)) {
    const next = tryDecode(current);
    if (next.error || next.text === current) break;
    current = next.text;
    rounds += 1;
  }
  return rounds;
}
