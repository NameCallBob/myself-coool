/**
 * What a scan result actually says, and what the browser can actually do.
 *
 * The decoding itself belongs to `BarcodeDetector`, which the browser either
 * has or does not — Chromium on Android and desktop Chrome/Edge do, Safari and
 * Firefox do not at the time of writing. There is no polyfill here: a
 * zero-dependency decoder for a dozen symbologies would be thousands of lines
 * that nobody could verify, and one that half works is worse than none. So the
 * honest shape of this tool is a feature test plus a clear statement of what
 * is missing, which is what `assessSupport` produces.
 *
 * Everything else here is the part worth writing by hand: deciding what a
 * decoded string means, checking the check digit, and saying out loud when a
 * scanned URL looks like something you should not tap.
 */

/* ── Capability ────────────────────────────── */

/** Formats the Barcode Detection API defines. */
export const KNOWN_FORMATS = [
  'aztec',
  'codabar',
  'code_128',
  'code_39',
  'code_93',
  'data_matrix',
  'ean_13',
  'ean_8',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e',
  'unknown',
] as const;

export type KnownFormat = (typeof KNOWN_FORMATS)[number];

/** One-dimensional symbologies need a straighter aim than the 2D ones. */
const ONE_D: string[] = ['codabar', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'];

export function formatFamily(format: string): '1d' | '2d' | 'unknown' {
  if (ONE_D.includes(format)) return '1d';
  if (['aztec', 'data_matrix', 'pdf417', 'qr_code'].includes(format)) return '2d';
  return 'unknown';
}

export type BrowserFacts = {
  /** `'BarcodeDetector' in window`. */
  detector: boolean;
  /** What getSupportedFormats() returned, or null when it could not be asked. */
  formats: string[] | null;
  /** `navigator.mediaDevices?.getUserMedia` is a function. */
  mediaDevices: boolean;
  /** `window.isSecureContext`. */
  secureContext: boolean;
};

export type SupportVerdict = {
  image: boolean;
  camera: boolean;
  /** Why something is unavailable. The UI turns these into sentences. */
  reasons: ('no-detector' | 'no-media-devices' | 'insecure-context' | 'formats-unknown')[];
  formats: string[];
  unknownFormats: string[];
};

/**
 * What this browser can do, stated plainly.
 *
 * Camera and still-image scanning fail for different reasons and one can work
 * without the other, so they are reported separately — a tool that says only
 * "not supported" sends someone to go and find another browser when dropping
 * in a photo would have worked fine.
 */
export function assessSupport(facts: BrowserFacts): SupportVerdict {
  const reasons: SupportVerdict['reasons'] = [];
  if (!facts.detector) reasons.push('no-detector');
  if (!facts.mediaDevices) reasons.push('no-media-devices');
  // getUserMedia is gated on a secure context; file input is not.
  if (!facts.secureContext) reasons.push('insecure-context');
  if (facts.detector && facts.formats === null) reasons.push('formats-unknown');

  const formats = (facts.formats ?? []).filter((format) => format !== '');
  const unknownFormats = formats.filter((format) => !(KNOWN_FORMATS as readonly string[]).includes(format));

  return {
    image: facts.detector,
    camera: facts.detector && facts.mediaDevices && facts.secureContext,
    reasons,
    formats,
    unknownFormats,
  };
}

/* ── Check digits ──────────────────────────── */

/**
 * GS1 modulo-10 check digit, for GTIN-8/12/13/14.
 *
 * Weights alternate 3 and 1 from the rightmost digit of the body, which is why
 * the same routine serves every GTIN length: the parity is anchored at the
 * check digit, not at the start.
 */
export function gtinCheckDigit(body: string): number {
  if (!/^[0-9]+$/.test(body)) throw new Error('GTIN body must be digits');
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export type GtinVerdict = {
  kind: 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14';
  valid: boolean;
  /** The digit the body implies, whether or not it matches. */
  expected: number;
  given: number;
};

/** Validate a bare digit string as a GTIN, or null when it is not one. */
export function checkGtin(value: string): GtinVerdict | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const kinds: Record<number, GtinVerdict['kind']> = {
    8: 'GTIN-8',
    12: 'GTIN-12',
    13: 'GTIN-13',
    14: 'GTIN-14',
  };
  const kind = kinds[value.length];
  if (!kind) return null;
  const expected = gtinCheckDigit(value.slice(0, -1));
  const given = value.charCodeAt(value.length - 1) - 48;
  return { kind, valid: expected === given, expected, given };
}

/** ISBN-10 check character, weights 10…2 modulo 11. X stands for ten. */
export function isbn10CheckDigit(body: string): string {
  if (!/^[0-9]{9}$/.test(body)) throw new Error('ISBN-10 body must be nine digits');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (body.charCodeAt(i) - 48) * (10 - i);
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * The ISBN-10 that a 978-prefixed ISBN-13 came from.
 *
 * Only 978 converts. The 979 block was allocated after ISBN-10 ran out, so
 * those books have no ten-digit form and printing one would be a fabrication.
 */
export function isbn10From13(ean13: string): string | null {
  if (!/^978[0-9]{10}$/.test(ean13)) return null;
  const verdict = checkGtin(ean13);
  if (!verdict || !verdict.valid) return null;
  const body = ean13.slice(3, 12);
  return body + isbn10CheckDigit(body);
}

/* ── WiFi payloads ─────────────────────────── */

export type WifiInfo = {
  ssid: string;
  password: string;
  /** As written in the payload; WPA, WEP and nopass are the common values. */
  auth: string;
  hidden: boolean;
  /** Keys present that this parser does not interpret. */
  extras: string[];
};

/** Undo the backslash escaping the WIFI: payload uses. */
export function unescapeWifi(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\' && i + 1 < value.length) {
      out += value[i + 1];
      i += 1;
    } else {
      out += value[i];
    }
  }
  return out;
}

/** Split on separators that are not backslash-escaped. */
function splitUnescaped(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      current += char + text[i + 1];
      i += 1;
    } else if (char === separator) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Parse `WIFI:T:WPA;S:name;P:secret;H:true;;`.
 *
 * Fields are order-independent here even though writers conventionally emit
 * T, S, P, H — a reader that insists on the order rejects payloads that are
 * perfectly legal. An unknown key is reported rather than dropped silently.
 */
export function parseWifi(text: string): WifiInfo | null {
  const match = /^WIFI:/i.exec(text.trim());
  if (!match) return null;
  const body = text.trim().slice(match[0].length);
  const info: WifiInfo = { ssid: '', password: '', auth: '', hidden: false, extras: [] };
  for (const token of splitUnescaped(body, ';')) {
    if (token === '') continue;
    const colon = splitUnescaped(token, ':');
    const key = colon[0].toUpperCase();
    const value = unescapeWifi(colon.slice(1).join(':'));
    if (key === 'S') info.ssid = value;
    else if (key === 'P') info.password = value;
    else if (key === 'T') info.auth = value === '' ? 'nopass' : value;
    else if (key === 'H') info.hidden = value.toLowerCase() === 'true';
    else info.extras.push(colon[0]);
  }
  if (info.auth === '') info.auth = 'nopass';
  return info;
}

/* ── vCard payloads ────────────────────────── */

export type VCardProperty = { name: string; params: string[]; value: string };

/** Undo vCard text escaping: \\ \n \, \; . */
export function unescapeVCard(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '\\' || i + 1 >= value.length) {
      out += value[i];
      continue;
    }
    const next = value[i + 1];
    out += next === 'n' || next === 'N' ? '\n' : next;
    i += 1;
  }
  return out;
}

/**
 * Parse a vCard into properties, unfolding continuation lines first.
 *
 * Folding (a line break followed by a space) is part of the format, so a card
 * that was wrapped at 75 characters must be rejoined before anything is read
 * — otherwise a long address arrives as two half-properties.
 */
export function parseVCard(text: string): VCardProperty[] | null {
  const trimmed = text.trim();
  if (!/^BEGIN:VCARD/i.test(trimmed)) return null;
  const unfolded = trimmed.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const properties: VCardProperty[] = [];
  for (const line of unfolded.split('\n')) {
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon).split(';');
    const name = head[0].toUpperCase();
    if (name === 'BEGIN' || name === 'END') continue;
    properties.push({ name, params: head.slice(1), value: unescapeVCard(line.slice(colon + 1)) });
  }
  return properties;
}

export type ContactSummary = {
  name: string;
  organization: string;
  title: string;
  phones: string[];
  emails: string[];
  urls: string[];
  addresses: string[];
  note: string;
};

/** The fields a person wants to see, pulled out of the property list. */
export function summarizeVCard(properties: VCardProperty[]): ContactSummary {
  const first = (name: string) => properties.find((property) => property.name === name)?.value ?? '';
  const all = (name: string) =>
    properties.filter((property) => property.name === name).map((property) => property.value);
  const structured = first('N');
  // N is Family;Given;Middle;Prefix;Suffix — FN is the display form when present.
  const fallback = structured
    .split(';')
    .slice(0, 2)
    .reverse()
    .filter((part) => part.trim() !== '')
    .join(' ');
  return {
    name: first('FN') || fallback,
    organization: first('ORG').split(';').filter(Boolean).join(' / '),
    title: first('TITLE'),
    phones: all('TEL'),
    emails: all('EMAIL'),
    urls: all('URL'),
    // ADR is seven semicolon-separated components; join the non-empty ones.
    addresses: all('ADR').map((value) => value.split(';').filter((part) => part.trim() !== '').join(' ')),
    note: first('NOTE'),
  };
}

/** MECARD:N:name;TEL:0912;;  — the older Japanese-carrier contact format. */
export function parseMeCard(text: string): ContactSummary | null {
  const match = /^MECARD:/i.exec(text.trim());
  if (!match) return null;
  const body = text.trim().slice(match[0].length);
  const summary: ContactSummary = {
    name: '',
    organization: '',
    title: '',
    phones: [],
    emails: [],
    urls: [],
    addresses: [],
    note: '',
  };
  for (const token of splitUnescaped(body, ';')) {
    if (token === '') continue;
    const colon = splitUnescaped(token, ':');
    const key = colon[0].toUpperCase();
    const value = unescapeWifi(colon.slice(1).join(':'));
    if (key === 'N') summary.name = value.split(',').reverse().filter(Boolean).join(' ');
    else if (key === 'TEL') summary.phones.push(value);
    else if (key === 'EMAIL') summary.emails.push(value);
    else if (key === 'URL') summary.urls.push(value);
    else if (key === 'ADR') summary.addresses.push(value.split(',').filter(Boolean).join(' '));
    else if (key === 'ORG') summary.organization = value;
    else if (key === 'NOTE') summary.note = value;
  }
  return summary;
}

/* ── URL risk ──────────────────────────────── */

export type UrlWarning =
  | 'non-web-scheme'
  | 'userinfo'
  | 'punycode'
  | 'ip-host'
  | 'unusual-port'
  | 'no-tls'
  | 'very-long';

/**
 * Reasons not to tap a scanned link.
 *
 * A QR code is a URL nobody can read before following it, which is exactly why
 * it is used for phishing. None of these checks is a verdict — they are the
 * things a careful person would notice if the address had been printed in
 * text, surfaced so that it is noticed here too.
 */
export function urlWarnings(raw: string): UrlWarning[] {
  const warnings: UrlWarning[] = [];
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return warnings;
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') warnings.push('non-web-scheme');
  if (scheme === 'http') warnings.push('no-tls');
  if (parsed.username !== '' || parsed.password !== '') warnings.push('userinfo');

  // The URL parser converts an internationalised host to punycode, so a label
  // starting xn-- is the tell for a name that was not plain ASCII, which is how
  // a lookalike domain gets past a glance at the address.
  const host = parsed.hostname.toLowerCase();
  if (host.split('.').some((label) => label.startsWith('xn--'))) warnings.push('punycode');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('ip-host');
  if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') warnings.push('unusual-port');
  if (raw.length > 512) warnings.push('very-long');
  return warnings;
}

/* ── Classification ────────────────────────── */

export type Payload =
  | { kind: 'url'; url: string; warnings: UrlWarning[] }
  | { kind: 'wifi'; wifi: WifiInfo }
  | { kind: 'contact'; source: 'vcard' | 'mecard'; contact: ContactSummary }
  | { kind: 'calendar'; properties: VCardProperty[] }
  | { kind: 'mailto'; address: string; subject: string; body: string }
  | { kind: 'tel'; number: string }
  | { kind: 'sms'; number: string; body: string }
  | { kind: 'geo'; latitude: number; longitude: number; raw: string }
  | { kind: 'otp'; issuer: string; account: string }
  | { kind: 'gtin'; value: string; verdict: GtinVerdict; isbn10: string | null }
  | { kind: 'text'; text: string };

/** Percent-decoding that survives a malformed escape instead of throwing. */
function decodePercent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseQuery(search: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(search)) out.set(key.toLowerCase(), value);
  return out;
}

/**
 * What a decoded string is.
 *
 * Deliberately conservative: text that merely looks like a host stays text,
 * because "probably a website" is how a scanner turns a typo into a visit to
 * somebody else's domain.
 */
export function classifyPayload(value: string): Payload {
  const text = value.trim();
  if (text === '') return { kind: 'text', text: value };

  const wifi = parseWifi(text);
  if (wifi) return { kind: 'wifi', wifi };

  if (/^BEGIN:VCARD/i.test(text)) {
    const properties = parseVCard(text) ?? [];
    return { kind: 'contact', source: 'vcard', contact: summarizeVCard(properties) };
  }
  const meCard = parseMeCard(text);
  if (meCard) return { kind: 'contact', source: 'mecard', contact: meCard };

  if (/^BEGIN:(VCALENDAR|VEVENT)/i.test(text)) {
    const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    const properties: VCardProperty[] = [];
    for (const line of unfolded.split('\n')) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const head = line.slice(0, colon).split(';');
      const name = head[0].toUpperCase();
      if (name.startsWith('BEGIN') || name.startsWith('END')) continue;
      properties.push({ name, params: head.slice(1), value: unescapeVCard(line.slice(colon + 1)) });
    }
    return { kind: 'calendar', properties };
  }

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(text);
  if (scheme) {
    const lower = scheme[1].toLowerCase();
    const rest = text.slice(scheme[0].length);
    if (lower === 'mailto') {
      const [address, query = ''] = rest.split('?');
      const fields = parseQuery(query);
      return {
        kind: 'mailto',
        address: decodePercent(address),
        subject: fields.get('subject') ?? '',
        body: fields.get('body') ?? '',
      };
    }
    if (lower === 'tel') return { kind: 'tel', number: rest };
    if (lower === 'sms' || lower === 'smsto') {
      // sms:number?body=… and the older smsto:number:body both occur.
      const [head, query = ''] = rest.split('?');
      const parts = head.split(':');
      const body = query !== '' ? (parseQuery(query).get('body') ?? '') : parts.slice(1).join(':');
      return { kind: 'sms', number: parts[0], body };
    }
    if (lower === 'geo') {
      const [coordinates] = rest.split('?');
      const [latitude, longitude] = coordinates.split(',');
      return {
        kind: 'geo',
        latitude: Number.parseFloat(latitude),
        longitude: Number.parseFloat(longitude),
        raw: text,
      };
    }
    if (lower === 'otpauth') {
      try {
        const parsed = new URL(text);
        const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
        const [issuerFromLabel, account] = label.includes(':') ? label.split(':') : ['', label];
        return {
          kind: 'otp',
          issuer: parsed.searchParams.get('issuer') ?? issuerFromLabel,
          account: account ?? '',
        };
      } catch {
        return { kind: 'text', text: value };
      }
    }
    if (lower === 'http' || lower === 'https') {
      return { kind: 'url', url: text, warnings: urlWarnings(text) };
    }
    // Any other scheme is still a URL to something; warn rather than pretend.
    return { kind: 'url', url: text, warnings: urlWarnings(text) };
  }

  const gtin = checkGtin(text);
  if (gtin) return { kind: 'gtin', value: text, verdict: gtin, isbn10: isbn10From13(text) };

  return { kind: 'text', text: value };
}

/* ── Scan history ──────────────────────────── */

export type Scan = {
  value: string;
  format: string;
  /** How many times this exact value has come back. */
  count: number;
};

export const HISTORY_LIMIT = 50;

/**
 * Add a reading to the list, collapsing repeats.
 *
 * A camera at 30 frames a second sees the same code dozens of times; a list
 * that grows with every frame is unusable. Repeats bump a counter in place
 * instead of reordering, so the newest distinct code stays at the top and the
 * list does not shuffle under the reader's finger.
 */
export function addScan(history: readonly Scan[], scan: { value: string; format: string }, limit = HISTORY_LIMIT): Scan[] {
  const index = history.findIndex((entry) => entry.value === scan.value && entry.format === scan.format);
  if (index >= 0) {
    const next = history.slice();
    next[index] = { ...next[index], count: next[index].count + 1 };
    return next;
  }
  return [{ value: scan.value, format: scan.format, count: 1 }, ...history].slice(0, Math.max(1, limit));
}

/** Tab-separated history, for pasting into a sheet. */
export function historyToTsv(history: readonly Scan[]): string {
  const rows = history.map((entry) => {
    // Tabs and newlines in a payload would break the row shape.
    const safe = entry.value.replace(/[\t\r\n]+/g, ' ');
    return `${entry.format}\t${entry.count}\t${safe}`;
  });
  return ['format\tcount\tvalue', ...rows].join('\n');
}
