/**
 * CIDR arithmetic for IPv4 and IPv6.
 *
 * Both families are held as one `bigint` and a prefix length. IPv4 would fit in
 * a 32-bit number, but JavaScript's bitwise operators coerce to *signed* 32-bit,
 * so `~mask` on 0.0.0.0/1 comes back negative and every subsequent comparison
 * is wrong. One numeric type for both families removes that whole class of bug
 * and costs nothing at this size.
 *
 * Nothing here resolves a name or asks the network anything: every value below
 * is derived from the address and the prefix by arithmetic alone.
 */

/**
 * Written as `BigInt(0)` rather than the `0n` literal throughout: this project
 * targets ES2017, where the literal syntax is a compile error. Same values.
 */
const ZERO = BigInt(0);
const ONE = BigInt(1);

export type Family = 4 | 6;

export type Cidr = { family: Family; addr: bigint; prefix: number };

/** Address width per family, in bits. */
export const BIT_WIDTH: Record<Family, number> = { 4: 32, 6: 128 };

/* ── Parsing ──────────────────────────────── */

/**
 * Strict dotted quad. Leading zeros are rejected on purpose: `010` is ten to
 * this parser, eight to `inet_aton`, and which one a given library means is
 * exactly the ambiguity behind a long line of SSRF bypasses. Refusing the form
 * is the only answer that cannot be silently wrong.
 */
export function parseIPv4(text: string): bigint | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let out = ZERO;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = (out << BigInt(8)) | BigInt(n);
  }
  return out;
}

function hextet(value: bigint): string {
  return value.toString(16);
}

/**
 * RFC 4291 textual form: eight hextets, at most one `::` run, optionally an
 * embedded dotted quad in the last 32 bits. A zone id (`%eth0`) is accepted and
 * dropped — it identifies an interface, not part of the address.
 */
export function parseIPv6(text: string): bigint | null {
  let s = text.trim();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  if (s === '' || s.includes(' ')) return null;

  // Fold an embedded IPv4 tail into two hextets so the rest is uniform.
  const lastColon = s.lastIndexOf(':');
  if (s.includes('.')) {
    if (lastColon === -1) return null;
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${hextet(v4 >> BigInt(16))}:${hextet(v4 & BigInt(0xffff))}`;
  }

  const double = s.indexOf('::');
  let head: string[];
  let tail: string[];
  if (double === -1) {
    head = s.split(':');
    tail = [];
    if (head.length !== 8) return null;
  } else {
    // A second '::' (which also catches ':::') has no defined meaning.
    if (s.indexOf('::', double + 1) !== -1) return null;
    const before = s.slice(0, double);
    const after = s.slice(double + 2);
    head = before === '' ? [] : before.split(':');
    tail = after === '' ? [] : after.split(':');
    // '::' stands for one or more zero groups, so it cannot fill nothing.
    if (head.length + tail.length > 7) return null;
  }

  const groups = [
    ...head,
    ...Array.from({ length: 8 - head.length - tail.length }, () => '0'),
    ...tail,
  ];
  let out = ZERO;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    out = (out << BigInt(16)) | BigInt(Number.parseInt(group, 16));
  }
  return out;
}

export function parseAddress(text: string): { family: Family; addr: bigint } | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(':')) {
    const v6 = parseIPv6(trimmed);
    return v6 === null ? null : { family: 6, addr: v6 };
  }
  const v4 = parseIPv4(trimmed);
  return v4 === null ? null : { family: 4, addr: v4 };
}

/* ── Formatting ───────────────────────────── */

export function formatIPv4(addr: bigint): string {
  return [BigInt(24), BigInt(16), BigInt(8), ZERO].map((shift) => String((addr >> shift) & BigInt(0xff))).join('.');
}

/**
 * RFC 5952 canonical form: lowercase, no leading zeros in a hextet, and the
 * longest run of two or more zero hextets collapsed to `::` (leftmost on a tie).
 * Two tools that disagree on this print the same address two ways, which is how
 * an allow-list comparison ends up failing on a string mismatch.
 */
export function formatIPv6(addr: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i -= 1) groups.push(Number((addr >> BigInt(i * 16)) & BigInt(0xffff)));

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;
  for (let i = 0; i < 8; i += 1) {
    if (groups[i] === 0) {
      if (runStart === -1) runStart = i;
      runLength += 1;
      if (runLength > bestLength) {
        bestLength = runLength;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
      runLength = 0;
    }
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLength).join(':')}`;
}

/** All eight hextets, four digits each — the form to paste into a filter. */
export function expandIPv6(addr: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i -= 1) {
    groups.push(Number((addr >> BigInt(i * 16)) & BigInt(0xffff)).toString(16).padStart(4, '0'));
  }
  return groups.join(':');
}

export function formatAddress(family: Family, addr: bigint): string {
  return family === 4 ? formatIPv4(addr) : formatIPv6(addr);
}

export function cidrToString(cidr: Cidr): string {
  return `${formatAddress(cidr.family, cidr.addr)}/${cidr.prefix}`;
}

/* ── Masks ────────────────────────────────── */

export function maskFor(family: Family, prefix: number): bigint {
  const bits = BIT_WIDTH[family];
  const all = (ONE << BigInt(bits)) - ONE;
  if (prefix <= 0) return ZERO;
  if (prefix >= bits) return all;
  return (all << BigInt(bits - prefix)) & all;
}

/** Prefix length of a dotted mask, or null when its ones are not contiguous. */
export function prefixFromMask(mask: bigint, family: Family): number | null {
  const bits = BIT_WIDTH[family];
  let seenZero = false;
  let ones = 0;
  for (let i = bits - 1; i >= 0; i -= 1) {
    const bit = (mask >> BigInt(i)) & ONE;
    if (bit === ONE) {
      if (seenZero) return null;
      ones += 1;
    } else {
      seenZero = true;
    }
  }
  return ones;
}

/* ── CIDR text ────────────────────────────── */

export type ParseFailure =
  | 'empty'
  | 'bad-address'
  | 'bad-prefix'
  | 'prefix-range'
  | 'mask-not-contiguous'
  | 'mask-on-ipv6';

export type ParseResult = { ok: true; cidr: Cidr } | { ok: false; code: ParseFailure };

/**
 * `1.2.3.0/24`, `1.2.3.0/255.255.255.0`, `1.2.3.4` (treated as /32) and the
 * IPv6 equivalents. The address is kept exactly as typed — the host bits are
 * not cleared here, because "you gave a host address, not a network address" is
 * information the caller should be able to show rather than quietly lose.
 */
export function parseCidr(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, code: 'empty' };

  const slash = trimmed.indexOf('/');
  const addressPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const prefixPart = slash === -1 ? '' : trimmed.slice(slash + 1).trim();

  const parsed = parseAddress(addressPart);
  if (!parsed) return { ok: false, code: 'bad-address' };
  const bits = BIT_WIDTH[parsed.family];

  if (prefixPart === '') {
    if (slash !== -1) return { ok: false, code: 'bad-prefix' };
    return { ok: true, cidr: { family: parsed.family, addr: parsed.addr, prefix: bits } };
  }

  if (prefixPart.includes('.')) {
    if (parsed.family === 6) return { ok: false, code: 'mask-on-ipv6' };
    const mask = parseIPv4(prefixPart);
    if (mask === null) return { ok: false, code: 'bad-prefix' };
    const prefix = prefixFromMask(mask, 4);
    if (prefix === null) return { ok: false, code: 'mask-not-contiguous' };
    return { ok: true, cidr: { family: 4, addr: parsed.addr, prefix } };
  }

  if (!/^\d{1,3}$/.test(prefixPart)) return { ok: false, code: 'bad-prefix' };
  const prefix = Number(prefixPart);
  if (prefix > bits) return { ok: false, code: 'prefix-range' };
  return { ok: true, cidr: { family: parsed.family, addr: parsed.addr, prefix } };
}

/* ── Derived values ───────────────────────── */

export type HostNote = 'normal' | 'point-to-point' | 'single-host' | 'ipv6';

export type Report = {
  family: Family;
  prefix: number;
  /** The address as typed, so the caller can say it was a host address. */
  given: bigint;
  network: bigint;
  /** Last address in the block — the broadcast address on IPv4. */
  last: bigint;
  mask: bigint;
  wildcard: bigint;
  /** Addresses in the block, including network and broadcast. */
  total: bigint;
  /** Addresses a host can be given. */
  usable: bigint;
  firstUsable: bigint | null;
  lastUsable: bigint | null;
  note: HostNote;
  /** True when host bits were set in the input. */
  hostBitsSet: boolean;
};

/**
 * Host counting is where subnet calculators disagree, so the three IPv4 cases
 * are written out. A /31 has no broadcast address: RFC 3021 gives both of its
 * addresses to the two ends of a point-to-point link, which is what routers
 * actually do. A /32 is one host and no network. Everything at /30 or shorter
 * loses the network and broadcast addresses, hence total − 2.
 *
 * IPv6 has no broadcast address at all — its place is taken by multicast — so
 * the whole block is addressable. The all-zeros host part is reserved as the
 * subnet-router anycast address (RFC 4291 §2.6.1), but that is a reservation
 * for routers rather than a hole in the count, so it is not subtracted here.
 */
export function describe(cidr: Cidr): Report {
  const bits = BIT_WIDTH[cidr.family];
  const mask = maskFor(cidr.family, cidr.prefix);
  const all = (ONE << BigInt(bits)) - ONE;
  const wildcard = all ^ mask;
  const network = cidr.addr & mask;
  const last = network | wildcard;
  const total = ONE << BigInt(bits - cidr.prefix);

  let usable = total;
  let firstUsable: bigint | null = network;
  let lastUsable: bigint | null = last;
  let note: HostNote = 'ipv6';

  if (cidr.family === 4) {
    if (cidr.prefix === 32) {
      note = 'single-host';
      usable = ONE;
    } else if (cidr.prefix === 31) {
      note = 'point-to-point';
      usable = BigInt(2);
    } else {
      note = 'normal';
      usable = total - BigInt(2);
      firstUsable = network + ONE;
      lastUsable = last - ONE;
    }
  } else if (cidr.prefix === 128) {
    note = 'single-host';
  }

  return {
    family: cidr.family,
    prefix: cidr.prefix,
    given: cidr.addr,
    network,
    last,
    mask,
    wildcard,
    total,
    usable,
    firstUsable,
    lastUsable,
    note,
    hostBitsSet: (cidr.addr & wildcard) !== ZERO,
  };
}

export function contains(cidr: Cidr, addr: bigint): boolean {
  const mask = maskFor(cidr.family, cidr.prefix);
  return (addr & mask) === (cidr.addr & mask);
}

/* ── Special-purpose blocks ───────────────── */

/**
 * The IANA special-purpose registries, as of 2024. These are stable — entries
 * are added over decades, not months — but the list is not magic: an address
 * outside every entry is reported as global unicast, which means "not reserved
 * for anything in particular", not "reachable".
 */
const V4_BLOCKS: { block: string; id: string }[] = [
  { block: '0.0.0.0/8', id: 'this-network' },
  { block: '10.0.0.0/8', id: 'private' },
  { block: '100.64.0.0/10', id: 'cgnat' },
  { block: '127.0.0.0/8', id: 'loopback' },
  { block: '169.254.0.0/16', id: 'link-local' },
  { block: '172.16.0.0/12', id: 'private' },
  { block: '192.0.0.0/24', id: 'protocol' },
  { block: '192.0.2.0/24', id: 'documentation' },
  { block: '192.88.99.0/24', id: '6to4-relay' },
  { block: '192.168.0.0/16', id: 'private' },
  { block: '198.18.0.0/15', id: 'benchmark' },
  { block: '198.51.100.0/24', id: 'documentation' },
  { block: '203.0.113.0/24', id: 'documentation' },
  { block: '224.0.0.0/4', id: 'multicast' },
  { block: '240.0.0.0/4', id: 'reserved' },
  { block: '255.255.255.255/32', id: 'broadcast' },
];

const V6_BLOCKS: { block: string; id: string }[] = [
  { block: '::/128', id: 'unspecified' },
  { block: '::1/128', id: 'loopback' },
  { block: '::ffff:0:0/96', id: 'ipv4-mapped' },
  { block: '64:ff9b::/96', id: 'nat64' },
  { block: '100::/64', id: 'discard' },
  { block: '2001::/32', id: 'teredo' },
  { block: '2001:db8::/32', id: 'documentation' },
  { block: '2002::/16', id: '6to4' },
  { block: 'fc00::/7', id: 'unique-local' },
  { block: 'fe80::/10', id: 'link-local' },
  { block: 'ff00::/8', id: 'multicast' },
  { block: '2000::/3', id: 'global-unicast' },
];

/**
 * Longest-prefix match against the special-purpose list, the same way a routing
 * table would resolve it: `2001:db8::1` is documentation, not Teredo, even
 * though `2001::/32` also covers it.
 */
export function classify(family: Family, addr: bigint): { id: string; block: string } {
  const table = family === 4 ? V4_BLOCKS : V6_BLOCKS;
  let best: { id: string; block: string; prefix: number } | null = null;
  for (const entry of table) {
    const parsed = parseCidr(entry.block);
    if (!parsed.ok) continue;
    if (!contains(parsed.cidr, addr)) continue;
    if (!best || parsed.cidr.prefix > best.prefix) {
      best = { id: entry.id, block: entry.block, prefix: parsed.cidr.prefix };
    }
  }
  if (best) return { id: best.id, block: best.block };
  return family === 4
    ? { id: 'global-unicast', block: '0.0.0.0/0' }
    : { id: 'reserved', block: '::/0' };
}

/* ── Subnetting ───────────────────────────── */

/** How many subnets a split produces, without building any of them. */
export function subnetCount(prefix: number, newPrefix: number): bigint {
  if (newPrefix < prefix) return ZERO;
  return ONE << BigInt(newPrefix - prefix);
}

export type SplitResult = { subnets: Cidr[]; total: bigint; truncated: boolean };

/**
 * Splits a block into equal children. A /8 cut into /32s is four billion rows,
 * so the list is capped and the caller is told it was — building them all would
 * exhaust memory long before anyone could read them.
 */
export function split(cidr: Cidr, newPrefix: number, limit = 256): SplitResult {
  const bits = BIT_WIDTH[cidr.family];
  if (newPrefix < cidr.prefix || newPrefix > bits) {
    return { subnets: [], total: ZERO, truncated: false };
  }
  const total = subnetCount(cidr.prefix, newPrefix);
  const network = cidr.addr & maskFor(cidr.family, cidr.prefix);
  const step = ONE << BigInt(bits - newPrefix);
  const shown = total > BigInt(limit) ? BigInt(limit) : total;
  const subnets: Cidr[] = [];
  for (let i = ZERO; i < shown; i += ONE) {
    subnets.push({ family: cidr.family, addr: network + i * step, prefix: newPrefix });
  }
  return { subnets, total, truncated: total > shown };
}

/**
 * The smallest set of CIDR blocks covering start…end inclusive.
 *
 * At each step the largest block that both starts at `cursor` and does not run
 * past `end` is taken. `cursor & -cursor` isolates the lowest set bit, which is
 * the alignment of the current position and therefore the largest block that
 * can legally start there; that is then shrunk until it fits the remaining
 * range. Position 0 has no lowest set bit, so it is the whole space.
 */
export function rangeToCidrs(
  family: Family,
  start: bigint,
  end: bigint,
  limit = 256
): { blocks: Cidr[]; truncated: boolean } {
  const bits = BIT_WIDTH[family];
  if (end < start) return { blocks: [], truncated: false };
  const blocks: Cidr[] = [];
  let cursor = start;
  for (;;) {
    if (blocks.length >= limit) return { blocks, truncated: true };
    const alignment = cursor === ZERO ? ONE << BigInt(bits) : cursor & -cursor;
    let size = alignment;
    while (size > end - cursor + ONE) size >>= ONE;
    let exponent = 0;
    while (ONE << BigInt(exponent) < size) exponent += 1;
    blocks.push({ family, addr: cursor, prefix: bits - exponent });
    if (cursor + size > end) return { blocks, truncated: false };
    cursor += size;
  }
}

/* ── Reverse DNS ──────────────────────────── */

/** The PTR name for a single address. */
export function reversePointer(family: Family, addr: bigint): string {
  if (family === 4) {
    return `${[ZERO, BigInt(8), BigInt(16), BigInt(24)].map((shift) => String((addr >> shift) & BigInt(0xff))).join('.')}.in-addr.arpa`;
  }
  return `${expandIPv6(addr).replace(/:/g, '').split('').reverse().join('.')}.ip6.arpa`;
}

/**
 * The reverse zone for a block, or null when the prefix does not land on a
 * label boundary — eight bits on IPv4, four on IPv6. A /26 has no single
 * reverse zone, and pretending otherwise is how delegations get filed wrong.
 */
export function reverseZone(cidr: Cidr): string | null {
  const network = cidr.addr & maskFor(cidr.family, cidr.prefix);
  if (cidr.family === 4) {
    if (cidr.prefix % 8 !== 0) return null;
    const labels = cidr.prefix / 8;
    const octets = [BigInt(24), BigInt(16), BigInt(8), ZERO].map((shift) => String((network >> shift) & BigInt(0xff)));
    if (labels === 0) return 'in-addr.arpa';
    return `${octets.slice(0, labels).reverse().join('.')}.in-addr.arpa`;
  }
  if (cidr.prefix % 4 !== 0) return null;
  const nibbles = expandIPv6(network).replace(/:/g, '').slice(0, cidr.prefix / 4);
  if (nibbles === '') return 'ip6.arpa';
  return `${nibbles.split('').reverse().join('.')}.ip6.arpa`;
}

/* ── Readout formatting ───────────────────── */

/** Grouped digits while that is readable, scientific notation past 10^15. */
export function formatBigCount(n: bigint): string {
  if (n < ZERO) return '—';
  const s = n.toString();
  if (s.length <= 15) return n.toLocaleString('en-US');
  return `${s[0]}.${s.slice(1, 4)}e${s.length - 1}`;
}

/** `2^96` — a power of two is easier to hold than 79 octillion. */
export function powerLabel(exponent: number): string {
  return `2^${exponent}`;
}
