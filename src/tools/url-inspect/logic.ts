/**
 * URL dissection, query editing, and tracking-parameter removal.
 *
 * The parse itself is `new URL`, which is the WHATWG algorithm and therefore
 * the definition of what a browser will do with the string. Everything else
 * here exists because `URL` alone does not answer the questions people open a
 * URL inspector to ask:
 *
 *  - `URLSearchParams` loses the difference between `?a` and `?a=`, and
 *    silently reorders nothing but also cannot tell you a parameter appeared
 *    twice with different values. The query is re-parsed here, in order,
 *    keeping duplicates and keeping whether an `=` was present.
 *  - `hostname` is punycode. `https://xn--e1awd7f.example` tells you nothing
 *    about what it will look like in the address bar, so Punycode (RFC 3492)
 *    is decoded here.
 */

/* ── Query strings ────────────────────────── */

export type QueryPair = {
  name: string;
  value: string;
  /** `?a=` had one; `?a` did not. Some APIs treat the two differently. */
  hasEquals: boolean;
  /** True when the raw text could not be percent-decoded. */
  malformed: boolean;
};

/**
 * `decodeURIComponent` throws on a lone `%`; a URL inspector must not.
 *
 * `plus` says whether `+` means a space. It does in a query string, which is
 * `application/x-www-form-urlencoded`, and it does *not* anywhere else: in a
 * path `+` is an ordinary character, so `/foo+bar` is a segment literally
 * called `foo+bar` and showing it as `foo bar` is a wrong answer about which
 * resource the URL points at. Callers say which rule applies.
 */
export function safeDecode(raw: string, plus = true): { text: string; malformed: boolean } {
  const plussed = plus ? raw.replace(/\+/g, ' ') : raw;
  try {
    return { text: decodeURIComponent(plussed), malformed: false };
  } catch {
    return { text: plussed, malformed: true };
  }
}

/**
 * Splits a query in document order. Duplicates are kept as separate rows,
 * because `?id=1&id=2` means different things to different servers and
 * collapsing it would hide the reason a request behaves oddly.
 */
export function parseQuery(search: string): QueryPair[] {
  const body = search.startsWith('?') ? search.slice(1) : search;
  if (body === '') return [];
  return body.split('&').map((chunk) => {
    const eq = chunk.indexOf('=');
    const rawName = eq === -1 ? chunk : chunk.slice(0, eq);
    const rawValue = eq === -1 ? '' : chunk.slice(eq + 1);
    const name = safeDecode(rawName);
    const value = safeDecode(rawValue);
    return {
      name: name.text,
      value: value.text,
      hasEquals: eq !== -1,
      malformed: name.malformed || value.malformed,
    };
  });
}

/**
 * Re-encodes pairs into a query string. `encodeURIComponent` leaves `!'()*`
 * alone, which is legal in a query but confuses some naive server parsers, so
 * they are escaped too — the result is the strictest form that still means the
 * same thing.
 */
export function encodeComponent(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function buildQuery(pairs: readonly QueryPair[]): string {
  return pairs
    .map((pair) => {
      const name = encodeComponent(pair.name);
      if (!pair.hasEquals && pair.value === '') return name;
      return `${name}=${encodeComponent(pair.value)}`;
    })
    .join('&');
}

/* ── Tracking parameters ──────────────────── */

/**
 * Parameters that exist to identify the click rather than to select content,
 * so removing them cannot change what page you get. Sources: Google's own
 * `utm_*` documentation, the click-id parameters each ad network documents,
 * and the list Firefox ships for its query-stripping feature.
 *
 * This list is a starting point, not law — it is editable in the UI, because
 * networks add parameters faster than anyone updates a table, and because a
 * site is always free to make one of these load-bearing.
 *
 * Reviewed 2025-09. A trailing `*` matches any suffix.
 */
export const TRACKING_PATTERNS: string[] = [
  'utm_*',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'fbclid',
  'igshid',
  'igsh',
  'msclkid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'yclid',
  'ysclid',
  'wickedid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  'vero_conv',
  'vero_id',
  'mkt_tok',
  'oly_anon_id',
  'oly_enc_id',
  '_openstat',
  'ref_src',
  'ref_url',
  's_cid',
  'spm',
  'scm',
  'share_source',
  'share_medium',
  'cmpid',
  'campaign_id',
  'pk_campaign',
  'pk_kwd',
  'piwik_campaign',
  'trk',
  'trkCampaign',
  'sc_campaign',
  'sc_channel',
  'sc_content',
  'sc_medium',
  'sc_outcome',
  'sc_geo',
];

/** Case-insensitive, with `*` allowed only as a trailing wildcard. */
export function matchesPattern(name: string, pattern: string): boolean {
  const a = name.toLowerCase();
  const b = pattern.toLowerCase();
  if (b.endsWith('*')) return a.startsWith(b.slice(0, -1));
  return a === b;
}

export function matchesAny(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => pattern !== '' && matchesPattern(name, pattern));
}

export function stripTracking(
  pairs: readonly QueryPair[],
  patterns: readonly string[]
): { kept: QueryPair[]; removed: QueryPair[] } {
  const kept: QueryPair[] = [];
  const removed: QueryPair[] = [];
  for (const pair of pairs) {
    if (matchesAny(pair.name, patterns)) removed.push(pair);
    else kept.push(pair);
  }
  return { kept, removed };
}

/** Free-text patterns, one per line or comma-separated. */
export function parsePatterns(text: string): string[] {
  return text
    .split(/[\n,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/* ── Punycode (RFC 3492) ──────────────────── */

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7fffffff;
const DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function digitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26; // '0'-'9' → 26..35
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // 'A'-'Z' → 0..25
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // 'a'-'z' → 0..25
  return BASE;
}

/** RFC 3492 §6.1, verbatim. The bias keeps later deltas cheap to encode. */
function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}

function threshold(k: number, bias: number): number {
  if (k <= bias + TMIN) return TMIN;
  if (k >= bias + TMAX) return TMAX;
  return k - bias;
}

/** Decodes one label's Punycode body (no `xn--`), or null if it is not valid. */
export function punyDecode(input: string): string | null {
  const output: number[] = [];
  const lastDelimiter = input.lastIndexOf('-');
  if (lastDelimiter > 0) {
    for (let j = 0; j < lastDelimiter; j += 1) {
      const code = input.charCodeAt(j);
      if (code >= 0x80) return null;
      output.push(code);
    }
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = lastDelimiter > 0 ? lastDelimiter + 1 : 0;

  while (index < input.length) {
    const previousI = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitValue(input.charCodeAt(index));
      index += 1;
      if (digit >= BASE) return null;
      if (digit > Math.floor((MAX_INT - i) / weight)) return null;
      i += digit * weight;
      const limit = threshold(k, bias);
      if (digit < limit) break;
      if (weight > Math.floor(MAX_INT / (BASE - limit))) return null;
      weight *= BASE - limit;
    }
    const length = output.length + 1;
    bias = adapt(i - previousI, length, previousI === 0);
    if (Math.floor(i / length) > MAX_INT - n) return null;
    n += Math.floor(i / length);
    i %= length;
    // Surrogates and out-of-range code points are not characters.
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
    output.splice(i, 0, n);
    i += 1;
  }

  return String.fromCodePoint(...output);
}

/** Encodes one label to its Punycode body (no `xn--` prefix). */
export function punyEncode(input: string): string {
  const points = Array.from(input).map((ch) => ch.codePointAt(0)!);
  const basic = points.filter((code) => code < 0x80);
  let handled = basic.length;
  const output = basic.map((code) => String.fromCharCode(code));
  if (handled > 0) output.push('-');

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (handled < points.length) {
    let m = MAX_INT;
    for (const code of points) if (code >= n && code < m) m = code;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const code of points) {
      if (code < n) delta += 1;
      if (code !== n) continue;
      let q = delta;
      for (let k = BASE; ; k += BASE) {
        const limit = threshold(k, bias);
        if (q < limit) break;
        output.push(DIGITS[limit + ((q - limit) % (BASE - limit))]);
        q = Math.floor((q - limit) / (BASE - limit));
      }
      output.push(DIGITS[q]);
      bias = adapt(delta, handled + 1, handled === basic.length);
      delta = 0;
      handled += 1;
    }
    delta += 1;
    n += 1;
  }

  return output.join('');
}

/** Punycode host → the Unicode a browser shows. Labels it cannot decode stay. */
export function hostToUnicode(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!/^xn--/i.test(label)) return label;
      const decoded = punyDecode(label.slice(4));
      return decoded === null ? label : decoded;
    })
    .join('.');
}

export function isAscii(text: string): boolean {
  for (const ch of text) {
    if (ch.codePointAt(0)! >= 0x80) return false;
  }
  return true;
}

/** Unicode host → the ASCII form. Labels already ASCII are left alone. */
export function hostToAscii(host: string): string {
  return host
    .split('.')
    .map((label) => (isAscii(label) ? label : `xn--${punyEncode(label)}`))
    .join('.');
}

/* ── Confusable scripts ───────────────────── */

/**
 * The three alphabets whose letters look alike — Latin, Cyrillic, Greek — plus
 * a bucket for everything else. A label mixing two of them is the classic
 * homograph trick (`аpple.com` with a Cyrillic а), and a label written wholly
 * in one script is not suspicious at all, which is why this reports the set of
 * scripts rather than a verdict.
 */
export function scriptsOf(label: string): string[] {
  const found = new Set<string>();
  for (const ch of label) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      if (/[a-z]/i.test(ch)) found.add('Latin');
      continue;
    }
    if (code >= 0x0370 && code <= 0x03ff) found.add('Greek');
    else if (code >= 0x0400 && code <= 0x04ff) found.add('Cyrillic');
    // Latin-1 Supplement (é, ñ, ö …) minus its two maths signs, then Latin
    // Extended-A and -B: all still the Latin alphabet, all still confusable.
    else if (code >= 0x00c0 && code <= 0x024f && code !== 0x00d7 && code !== 0x00f7) {
      found.add('Latin');
    }
    else if (code >= 0x4e00 && code <= 0x9fff) found.add('Han');
    else if (code >= 0x3040 && code <= 0x30ff) found.add('Kana');
    else if (code >= 0xac00 && code <= 0xd7af) found.add('Hangul');
    else found.add('Other');
  }
  return [...found].sort();
}

const CONFUSABLE = ['Latin', 'Cyrillic', 'Greek'];

/** Labels that mix two or more of the look-alike alphabets. */
export function confusableLabels(host: string): string[] {
  return host.split('.').filter((label) => {
    const scripts = scriptsOf(label).filter((script) => CONFUSABLE.includes(script));
    return scripts.length > 1;
  });
}

/* ── The URL itself ───────────────────────── */

export const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
  'ws:': '80',
  'wss:': '443',
  'ftp:': '21',
};

export type Parts = {
  href: string;
  protocol: string;
  username: string;
  password: string;
  /** As the URL API gives it: lowercased, and punycode for an IDN. */
  hostname: string;
  unicodeHost: string;
  /** Empty when the URL omitted it. */
  port: string;
  /** The port actually used, default included. Empty for unknown schemes. */
  effectivePort: string;
  pathname: string;
  /** Percent-decoded path segments, empty ones dropped. */
  segments: string[];
  search: string;
  query: QueryPair[];
  /** Without the leading `#`. */
  hash: string;
  origin: string;
  /** http(s), ws(s), ftp, file — the schemes the URL spec gives host parsing to. */
  special: boolean;
};

export type Inspection =
  | { ok: true; parts: Parts; schemeAdded: boolean }
  | { ok: false; reason: 'empty' | 'invalid' };

const SPECIAL = new Set(['http:', 'https:', 'ws:', 'wss:', 'ftp:', 'file:']);

/** Host characters (ASCII and anything above it), an optional port, a delimiter. */
const HOST_START = /^[a-zA-Z0-9\u00a1-\uffff][a-zA-Z0-9._\-\u00a1-\uffff]*(:\d{1,5})?([/?#]|$)/;

/**
 * Parses, and if that fails retries with `https://` in front.
 *
 * People paste `example.com/a?b=1`. Rejecting it would be technically correct
 * and useless, so the retry happens — but it is reported, because `//x/y` and
 * `https://x/y` are not the same string and the caller should be able to say
 * which one was measured.
 */
export function inspect(text: string): Inspection {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  let url: URL | null = null;
  let schemeAdded = false;
  try {
    url = new URL(trimmed);
  } catch {
    // The retry only happens when what is there already looks like a host:
    // a run of host characters, an optional port, then a delimiter or the end.
    // Without that test `ht!tp://x` becomes `https://ht!tp//x`, which parses
    // and is not what anyone meant — a wrong answer is worse than an error.
    if (HOST_START.test(trimmed)) {
      try {
        url = new URL(`https://${trimmed}`);
        schemeAdded = true;
      } catch {
        return { ok: false, reason: 'invalid' };
      }
    } else {
      return { ok: false, reason: 'invalid' };
    }
  }

  const special = SPECIAL.has(url.protocol);
  const segments = url.pathname
    .split('/')
    .filter((segment) => segment !== '')
    // `false`: a `+` in a path is a plus sign, not a space.
    .map((segment) => safeDecode(segment, false).text);

  return {
    ok: true,
    schemeAdded,
    parts: {
      href: url.href,
      protocol: url.protocol,
      username: url.username,
      password: url.password,
      hostname: url.hostname,
      unicodeHost: hostToUnicode(url.hostname),
      port: url.port,
      effectivePort: url.port || DEFAULT_PORTS[url.protocol] || '',
      pathname: url.pathname,
      segments,
      search: url.search,
      query: parseQuery(url.search),
      hash: url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
      origin: url.origin,
      special,
    },
  };
}

/* ── Rebuilding ───────────────────────────── */

export type CleanOptions = {
  patterns: readonly string[];
  dropFragment: boolean;
  dropAuth: boolean;
  sortParams: boolean;
  forceHttps: boolean;
};

export const DEFAULT_CLEAN: CleanOptions = {
  patterns: TRACKING_PATTERNS,
  dropFragment: false,
  dropAuth: false,
  sortParams: false,
  forceHttps: false,
};

/**
 * Rebuilds a URL from the pairs the caller is holding.
 *
 * Only the parts the options name are touched. In particular the path is never
 * normalised and the case of the path is never changed: `/A` and `/a` are
 * different resources, and a cleaner that "tidies" them breaks links.
 */
export function rebuild(
  href: string,
  pairs: readonly QueryPair[],
  options: CleanOptions
): { url: string; removed: QueryPair[] } {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { url: href, removed: [] };
  }

  const { kept, removed } = stripTracking(pairs, options.patterns);
  const ordered = options.sortParams
    ? [...kept].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.value.localeCompare(b.value, 'en'))
    : kept;

  const query = buildQuery(ordered);
  url.search = query === '' ? '' : `?${query}`;
  if (options.dropFragment) url.hash = '';
  if (options.dropAuth) {
    url.username = '';
    url.password = '';
  }
  if (options.forceHttps && url.protocol === 'http:') url.protocol = 'https:';
  // A port equal to the scheme default is dropped by the URL setter itself and
  // cannot be put back, so there is deliberately no option for it — the
  // breakdown reports the effective port instead.

  return { url: url.href, removed };
}

/** Byte length of a string in UTF-8, for the readout. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
