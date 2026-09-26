/**
 * Redaction for a log you are about to paste into a ticket.
 *
 * Two properties matter more than coverage. The first is that a match is really
 * a match: an eight-digit number is not a 統一編號 and a sixteen-digit number is
 * not a card, so anything with a check digit is verified before it is masked.
 * A detector that fires on order numbers teaches people to turn it off, and then
 * it protects nothing.
 *
 * The second is that masking must be reversible in meaning but not in value.
 * `label` mode gives each distinct value a stable number — every occurrence of
 * the same address becomes `[EMAIL_1]` — so a log still reads as a story about
 * two users rather than a wall of identical boxes, while none of the original
 * values survive.
 *
 * This is a filter, not a guarantee. It cannot know that `order-8891` is a
 * customer reference, and the tool says so where you can see it.
 */

/** Longer than this and the tab stops being responsive; refuse instead. */
export const MAX_INPUT = 500_000;

/**
 * Safety net on the scan loop, counted over the whole scan.
 *
 * It is a budget shared out between the enabled detectors rather than a
 * first-come cap: a cap that simply stopped the loop would let a log whose head
 * is full of JWTs use up the whole allowance before the e-mail and IP detectors
 * had run once, and the output would look redacted while carrying every address
 * in the file. See `scan`.
 */
export const MAX_MATCHES = 20_000;

export type DetectorId =
  | 'email'
  | 'card'
  | 'twId'
  | 'twBusiness'
  | 'mobileTw'
  | 'landlineTw'
  | 'ipv4'
  | 'ipv6'
  | 'mac'
  | 'jwt'
  | 'apiKey'
  | 'authHeader'
  | 'urlCredentials'
  | 'querySecret'
  | 'hexToken'
  | 'base64Token';

export type Mode = 'label' | 'partial' | 'fixed';

export class InputTooLarge extends Error {
  readonly length: number;

  constructor(length: number) {
    super(`input is ${length} characters, over the ${MAX_INPUT} limit`);
    this.name = 'InputTooLarge';
    this.length = length;
  }
}

/* ── Validators ───────────────────────────── */

export function isLuhnValid(number: string): boolean {
  const clean = number.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let value = clean.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Letter codes 10–35, in the published (non-alphabetical) order. */
const ID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';

/**
 * 身分證字號 and the 2021 統一證號, which share one formula.
 *
 * The second character says which: `1`/`2` is a national ID, `8`/`9` a resident
 * certificate issued under the 2021 scheme (published example `A800000014`).
 * The weights are identical in both — the letter expands to its two-digit code,
 * the eight middle digits carry weights 8 down to 1, and the whole thing plus
 * the check digit is a multiple of ten. Only the accepted second digit differs,
 * which is why widening the class is the entire change; a resident certificate
 * left out of the class is not "not matched", it is silently not redacted.
 *
 * The pre-2021 two-letter form (`AB12345678`) is deliberately not accepted: its
 * second character is a letter with its own code table, and the tool would have
 * to guess at a rule that has been superseded.
 */
export function isTwIdValid(id: string): boolean {
  const clean = id.trim().toUpperCase();
  if (!/^[A-Z][1289]\d{8}$/.test(clean)) return false;
  const code = ID_LETTERS.indexOf(clean[0]) + 10;
  if (code < 10) return false;
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let i = 1; i <= 8; i += 1) sum += (clean.charCodeAt(i) - 48) * (9 - i);
  return (sum + (clean.charCodeAt(9) - 48)) % 10 === 0;
}

const BUSINESS_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/**
 * 統一編號 check. The rule became "multiple of five" in April 2023; every number
 * valid under the older multiple-of-ten rule still passes. One in five random
 * eight-digit numbers passes this, which is why the detector is off by default.
 */
export function isTwBusinessValid(number: string): boolean {
  const clean = number.replace(/\D/g, '');
  if (!/^\d{8}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const product = (clean.charCodeAt(i) - 48) * BUSINESS_WEIGHTS[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  if (sum % 5 === 0) return true;
  return clean[6] === '7' && (sum - 1) % 5 === 0;
}

/** Rejects 1.2.3.4.5 and 999.1.1.1, which the loose pattern would accept. */
export function isIpv4(text: string): boolean {
  const parts = text.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/**
 * IPv6, checked properly rather than pattern-matched.
 *
 * A loose pattern cannot tell `2001:db8::1` from the `10:14:22` in a log
 * timestamp — both are hex groups separated by colons. So the pattern only
 * proposes candidates and this decides: at most one `::`, every group one to
 * four hex digits, and without a `::` there must be exactly eight groups. A
 * clock never has eight.
 */
export function isIpv6(text: string): boolean {
  if (!text.includes(':')) return false;
  const halves = text.split('::');
  if (halves.length > 2) return false;
  const group = /^[0-9A-Fa-f]{1,4}$/;
  const parts = (half: string) => (half === '' ? [] : half.split(':'));

  if (halves.length === 2) {
    const left = parts(halves[0]);
    const right = parts(halves[1]);
    if (left.length + right.length > 7) return false;
    return [...left, ...right].every((part) => group.test(part));
  }
  const groups = parts(text);
  return groups.length === 8 && groups.every((part) => group.test(part));
}

/* ── Detectors ────────────────────────────── */

export type Detector = {
  id: DetectorId;
  /** Shown in the UI and used as the label stem in `label` mode. */
  label: string;
  pattern: RegExp;
  /** Higher wins when two detectors match at the same place. */
  priority: number;
  /** On by default. The noisy ones are not. */
  standard: boolean;
  validate?: (value: string) => boolean;
  /** `partial` mode rendering. Defaults to keeping the last four characters. */
  partial?: (value: string) => string;
  /**
   * Full control over the replacement in every mode. Used where part of the
   * match must survive in all modes — the `token=` in a query string, the
   * `Bearer` in a header — because a log with the key name removed is harder to
   * read and no safer.
   */
  mask?: (value: string, mode: Mode, labelled: string) => string;
};

function keepLast(value: string, n: number, fill = '*'): string {
  const chars = [...value];
  if (chars.length <= n) return fill.repeat(chars.length);
  return fill.repeat(chars.length - n) + chars.slice(chars.length - n).join('');
}

/**
 * The catalogue.
 *
 * Every pattern is linear: bounded repetitions and simple character classes, no
 * quantifier inside a quantifier. That is deliberate — this runs on the main
 * thread over a whole log, and a pattern that backtracks would freeze the tab.
 */
export const DETECTORS: readonly Detector[] = [
  {
    id: 'jwt',
    label: 'JWT',
    // A JWT header is base64url of `{"`, which always begins `eyJ`.
    pattern: /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
    priority: 90,
    standard: true,
    partial: (value) => `${value.slice(0, 6)}…${'*'.repeat(8)}`,
  },
  {
    id: 'apiKey',
    label: 'KEY',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprse]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{16,})/g,
    priority: 88,
    standard: true,
    partial: (value) => {
      const head = value.slice(0, Math.min(8, value.indexOf('_') + 1 || 4));
      return `${head}${'*'.repeat(Math.max(4, value.length - head.length))}`;
    },
  },
  {
    id: 'authHeader',
    label: 'AUTH',
    pattern: /\b(?:Bearer|Basic|Token)[ \t]+[A-Za-z0-9._~+/=-]{8,}/g,
    priority: 86,
    standard: true,
    partial: (value) => `${value.split(/[ \t]+/)[0]} ${'*'.repeat(8)}`,
    // The scheme is not the secret, and knowing which scheme failed matters.
    mask: (value, mode, labelled) =>
      `${value.split(/[ \t]+/)[0]} ${mode === 'partial' ? '*'.repeat(8) : labelled}`,
  },
  {
    id: 'urlCredentials',
    label: 'URLAUTH',
    // Only the credentials, not the host: a log is useless without the host.
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi,
    priority: 84,
    standard: true,
    partial: (value) => value.replace(/\/\/[^\s/@]+@/, '//***:***@'),
    // The host stays in every mode: a URL without it says nothing at all.
    mask: (value) => value.replace(/\/\/[^\s/@]+@/, '//***:***@'),
  },
  {
    id: 'querySecret',
    label: 'SECRET',
    pattern:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|auth)=[^&\s"'`;]+/gi,
    priority: 82,
    standard: true,
    partial: (value) => `${value.slice(0, value.indexOf('=') + 1)}${'*'.repeat(8)}`,
    // Keep the parameter name: `token=[SECRET_1]` tells you what leaked.
    mask: (value, mode, labelled) =>
      `${value.slice(0, value.indexOf('=') + 1)}${mode === 'partial' ? '*'.repeat(8) : labelled}`,
  },
  {
    id: 'email',
    label: 'EMAIL',
    pattern: /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
    priority: 70,
    standard: true,
    // The domain usually matters for debugging; the person does not.
    partial: (value) => {
      const at = value.lastIndexOf('@');
      const local = value.slice(0, at);
      const first = [...local][0] ?? '';
      return `${first}${'*'.repeat(Math.max(1, [...local].length - 1))}${value.slice(at)}`;
    },
  },
  {
    id: 'card',
    label: 'CARD',
    /**
     * Three explicit shapes rather than "digits with optional separators": a
     * loose separator lets the match run across a space into the next number in
     * the log, and the whole thing then fails Luhn and is silently skipped.
     * Plain 13–19 digits, the 4-4-4-4 grouping, and the Amex 4-6-5 grouping.
     */
    pattern: /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b|\b\d{4}[ -]\d{6}[ -]\d{5}\b/g,
    priority: 68,
    standard: true,
    validate: isLuhnValid,
    partial: (value) => keepLast(value.replace(/\D/g, ''), 4),
  },
  {
    id: 'twId',
    label: 'TWID',
    pattern: /\b[A-Za-z][1289]\d{8}\b/g,
    priority: 66,
    standard: true,
    validate: isTwIdValid,
    partial: (value) => `${value.slice(0, 1)}${'*'.repeat(6)}${value.slice(-3)}`,
  },
  {
    id: 'mobileTw',
    label: 'MOBILE',
    pattern: /(?:\+886[- ]?|\b0)9\d{2}[- ]?\d{3}[- ]?\d{3}\b/g,
    priority: 64,
    standard: true,
    partial: (value) => keepLast(value, 3),
  },
  {
    id: 'landlineTw',
    label: 'PHONE',
    pattern: /\b0[2-8][- ]?\d{3,4}[- ]?\d{4}\b/g,
    priority: 62,
    standard: true,
    partial: (value) => keepLast(value, 3),
  },
  {
    id: 'ipv6',
    label: 'IPV6',
    // Proposes candidates; `isIpv6` decides. See the comment on that function.
    pattern: /(?:[0-9A-Fa-f]{0,4}:){1,7}[0-9A-Fa-f]{0,4}/g,
    priority: 58,
    standard: true,
    validate: isIpv6,
    partial: () => '****:****',
  },
  {
    id: 'mac',
    label: 'MAC',
    pattern: /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g,
    priority: 57,
    standard: true,
    partial: (value) => `${value.slice(0, 8)}:**:**:**`,
  },
  {
    id: 'ipv4',
    label: 'IP',
    pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
    priority: 56,
    standard: true,
    validate: isIpv4,
    // The first two octets say which network it was, which is usually the point.
    partial: (value) => `${value.split('.').slice(0, 2).join('.')}.*.*`,
  },
  {
    id: 'hexToken',
    label: 'HEX',
    pattern: /\b[0-9a-fA-F]{32,}\b/g,
    priority: 40,
    standard: true,
    partial: (value) => `${value.slice(0, 6)}…${'*'.repeat(6)}`,
  },
  {
    id: 'base64Token',
    label: 'B64',
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}/g,
    priority: 30,
    standard: false,
    partial: (value) => `${value.slice(0, 6)}…${'*'.repeat(6)}`,
  },
  {
    id: 'twBusiness',
    label: 'TWBAN',
    pattern: /\b\d{8}\b/g,
    priority: 20,
    standard: false,
    validate: isTwBusinessValid,
    partial: (value) => `${value.slice(0, 2)}${'*'.repeat(6)}`,
  },
];

export function detectorFor(id: DetectorId): Detector | undefined {
  return DETECTORS.find((detector) => detector.id === id);
}

export const STANDARD_DETECTORS: readonly DetectorId[] = DETECTORS.filter(
  (detector) => detector.standard
).map((detector) => detector.id);

/* ── Scanning ─────────────────────────────── */

export type Match = {
  id: DetectorId;
  at: number;
  length: number;
  value: string;
  /** 1-based index of this distinct value within its detector. */
  ordinal: number;
};

export type ScanResult = {
  matches: Match[];
  truncated: boolean;
  /**
   * Detectors whose own scan hit the budget and stopped early — the categories
   * the result under-reports. Empty whenever `truncated` is false.
   */
  truncatedIds: DetectorId[];
};

/**
 * All matches, overlaps resolved.
 *
 * Detectors overlap by design: a JWT is also a long base64 run, and a card
 * number inside a URL is also a digit run. Everything is collected first and
 * then swept left to right, taking the highest-priority match at each position
 * and skipping anything that would overlap what was already taken — which is why
 * the specific detectors carry higher priorities than the generic ones.
 *
 * `MAX_MATCHES` is shared out in rounds rather than spent first-come. Each
 * pending detector gets an equal slice of what is left, keeps its own
 * `lastIndex`, and the detectors that finish inside their slice hand the
 * remainder back to the ones that did not — so a log whose first 300 KB is
 * nothing but JWTs still gets its e-mail addresses and IPs scanned, and what the
 * result loses is the tail of the JWTs, named in `truncatedIds`.
 *
 * Each round either retires a detector or spends at least one match of the
 * budget, so the loop terminates and the total stays at or under the cap.
 */
export function scan(text: string, enabled: readonly DetectorId[]): ScanResult {
  if (text.length > MAX_INPUT) throw new InputTooLarge(text.length);

  const found: { id: DetectorId; at: number; length: number; value: string; priority: number }[] = [];

  let pending = DETECTORS.filter((detector) => enabled.includes(detector.id)).map((detector) => ({
    detector,
    pattern: new RegExp(detector.pattern.source, detector.pattern.flags),
  }));
  let budget = MAX_MATCHES;

  while (pending.length > 0 && budget > 0) {
    const share = Math.max(1, Math.floor(budget / pending.length));
    const stillPending: typeof pending = [];

    for (const pass of pending) {
      if (budget <= 0) {
        stillPending.push(pass);
        continue;
      }
      const quota = Math.min(share, budget);
      let taken = 0;
      let exhausted = false;
      while (taken < quota) {
        const hit = pass.pattern.exec(text);
        if (hit === null) {
          exhausted = true;
          break;
        }
        if (hit[0] === '') {
          pass.pattern.lastIndex += 1;
          continue;
        }
        if (pass.detector.validate && !pass.detector.validate(hit[0])) continue;
        found.push({
          id: pass.detector.id,
          at: hit.index,
          length: hit[0].length,
          value: hit[0],
          priority: pass.detector.priority,
        });
        taken += 1;
      }
      budget -= taken;
      if (!exhausted) stillPending.push(pass);
    }

    pending = stillPending;
  }

  const truncatedIds = pending.map((pass) => pass.detector.id);

  found.sort((a, b) => a.at - b.at || b.priority - a.priority || b.length - a.length);

  const ordinals = new Map<string, number>();
  const seenPerDetector = new Map<DetectorId, number>();
  const matches: Match[] = [];
  let cursor = 0;
  for (const hit of found) {
    if (hit.at < cursor) continue;
    const key = `${hit.id}:${hit.value}`;
    let ordinal = ordinals.get(key);
    if (ordinal === undefined) {
      // Numbered per detector, so the labels read EMAIL_1, EMAIL_2, IP_1.
      // Counted in a map rather than by scanning the keys: this loop runs once
      // per match, and rescanning would make a big log quadratic.
      ordinal = (seenPerDetector.get(hit.id) ?? 0) + 1;
      seenPerDetector.set(hit.id, ordinal);
      ordinals.set(key, ordinal);
    }
    matches.push({ id: hit.id, at: hit.at, length: hit.length, value: hit.value, ordinal });
    cursor = hit.at + hit.length;
  }

  return { matches, truncated: truncatedIds.length > 0, truncatedIds };
}

/** What one match is replaced with, in the chosen mode. */
export function maskFor(match: Match, mode: Mode): string {
  const detector = detectorFor(match.id);
  const label = detector?.label ?? 'REDACTED';
  const labelled = mode === 'fixed' ? '[REDACTED]' : `[${label}_${match.ordinal}]`;
  if (detector?.mask) return detector.mask(match.value, mode, labelled);
  if (mode === 'fixed') return '[REDACTED]';
  if (mode === 'label') return labelled;
  return detector?.partial ? detector.partial(match.value) : keepLast(match.value, 4);
}

export type RedactResult = {
  text: string;
  matches: Match[];
  counts: Record<string, number>;
  /** Distinct values per detector — how many different people or hosts. */
  distinct: Record<string, number>;
  truncated: boolean;
  /** Which categories stopped early. The UI has to name them, not just say "cut". */
  truncatedIds: DetectorId[];
};

export function redact(text: string, enabled: readonly DetectorId[], mode: Mode): RedactResult {
  const scanned = scan(text, enabled);
  const counts: Record<string, number> = {};
  const distinct: Record<string, number> = {};

  let out = '';
  let cursor = 0;
  for (const match of scanned.matches) {
    out += text.slice(cursor, match.at);
    out += maskFor(match, mode);
    cursor = match.at + match.length;
    counts[match.id] = (counts[match.id] ?? 0) + 1;
    distinct[match.id] = Math.max(distinct[match.id] ?? 0, match.ordinal);
  }
  out += text.slice(cursor);

  return {
    text: out,
    matches: scanned.matches,
    counts,
    distinct,
    truncated: scanned.truncated,
    truncatedIds: scanned.truncatedIds,
  };
}

export type Segment = { text: string; id: DetectorId | null };

/** The input cut into plain and matched pieces, for highlighting the findings. */
export function segments(text: string, matches: readonly Match[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.at > cursor) out.push({ text: text.slice(cursor, match.at), id: null });
    out.push({ text: match.value, id: match.id });
    cursor = match.at + match.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), id: null });
  return out;
}
