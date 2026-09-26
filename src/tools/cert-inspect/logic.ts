/**
 * A minimal DER reader, an X.509 field walk on top of it, and OpenSSH public
 * key fingerprints.
 *
 * Why write the ASN.1 by hand: the browser has no certificate parser. WebCrypto
 * will import an SPKI key but tells you nothing about the certificate wrapped
 * around it, and there is no dependency to add here. So this file reads DER
 * directly — about two hundred lines for the subset X.509 actually uses.
 *
 * The parser is deliberately unforgiving about three things, because each of
 * them is a way a lenient reader ends up displaying a field that isn't there:
 *
 *  - Indefinite-length encodings are rejected. They are legal BER and illegal
 *    DER; accepting them means guessing where a value ends.
 *  - Depth, node count and total size are capped. A hostile 20-byte input can
 *    describe unbounded nesting, and a frozen tab is a crash.
 *  - Every field is checked against the tag RFC 5280 says it must have. An
 *    unexpected tag is reported with its byte offset instead of being skipped,
 *    because a skipped field means a certificate rendered with someone else's
 *    subject line, which is exactly the mistake that matters here.
 *
 * What this is not: a validator. Nothing here checks a signature, walks a chain,
 * consults a CRL or OCSP, or decides whether a certificate is trusted. It reads
 * what the bytes say. The UI states that, too.
 */

/* ── Errors ────────────────────────────────── */

export type FailCode =
  | 'empty'
  | 'too-large'
  | 'no-pem'
  | 'bad-base64'
  | 'label-mismatch'
  | 'private-key'
  | 'not-a-certificate'
  | 'too-many-blocks'
  | 'truncated'
  | 'indefinite-length'
  | 'reserved-length'
  | 'length-too-long'
  | 'tag-too-long'
  | 'trailing-bytes'
  | 'too-deep'
  | 'too-many-nodes'
  | 'unexpected-tag'
  | 'missing-field'
  | 'bad-oid'
  | 'bad-integer'
  | 'bad-string'
  | 'bad-time'
  | 'bad-version'
  | 'bad-bitstring'
  | 'ssh-bad-line'
  | 'ssh-truncated'
  | 'ssh-blob-mismatch';

/** Carries a code plus where it happened, so the UI writes the sentence. */
export class InspectError extends Error {
  /** Declared then assigned: Node's type-stripping runner rejects parameter
   *  properties. */
  readonly code: FailCode;
  readonly where: string;
  readonly offset: number;

  constructor(code: FailCode, where: string, offset = -1) {
    super(offset >= 0 ? `${code} at ${where} (byte ${offset})` : `${code} at ${where}`);
    this.name = 'InspectError';
    this.code = code;
    this.where = where;
    this.offset = offset;
  }
}

/* ── Ceilings ──────────────────────────────── */

export const MAX_DER_DEPTH = 24;
export const MAX_DER_BYTES = 512 * 1024;
export const MAX_DER_NODES = 20_000;
export const MAX_PEM_BLOCKS = 16;
export const MAX_SSH_BLOB = 64 * 1024;

/* ── Local codecs ──────────────────────────── */

/* logic.ts stays import-free so `node --test` can run it without a bundler
 * resolving path aliases; these are the two lines of @/lib/tools/bytes it uses. */

const HEX = '0123456789ABCDEF';

/** Colon-separated uppercase hex — the form openssl and browsers both print. */
export function toHexColon(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 1) {
    if (i > 0) out += ':';
    out += HEX[data[i] >> 4] + HEX[data[i] & 15];
  }
  return out;
}

export function toHexPlain(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 1) out += HEX[data[i] >> 4] + HEX[data[i] & 15];
  return out.toLowerCase();
}

function toBase64(data: Uint8Array, pad = true): string {
  let raw = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    raw += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  const b64 = btoa(raw);
  return pad ? b64 : b64.replace(/=+$/, '');
}

function fromBase64(text: string, where: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (clean === '') throw new InspectError('bad-base64', where);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new InspectError('bad-base64', where);
  let raw: string;
  try {
    raw = atob(clean);
  } catch {
    throw new InspectError('bad-base64', where);
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/* ── ASN.1 / DER ───────────────────────────── */

export type Asn1Class = 'universal' | 'application' | 'context' | 'private';

export type Asn1 = {
  cls: Asn1Class;
  tag: number;
  constructed: boolean;
  /** Offset of the identifier octet inside the buffer that was parsed. */
  offset: number;
  headerLength: number;
  content: Uint8Array;
  children: Asn1[];
};

const CLASSES: Asn1Class[] = ['universal', 'application', 'context', 'private'];

/** Universal tags this file knows by name. */
export const TAG = {
  boolean: 1,
  integer: 2,
  bitString: 3,
  octetString: 4,
  null: 5,
  oid: 6,
  utf8String: 12,
  sequence: 16,
  set: 17,
  numericString: 18,
  printableString: 19,
  t61String: 20,
  ia5String: 22,
  utcTime: 23,
  generalizedTime: 24,
  visibleString: 26,
  generalString: 27,
  universalString: 28,
  bmpString: 30,
} as const;

function readNode(
  data: Uint8Array,
  offset: number,
  limit: number,
  depth: number,
  budget: { nodes: number },
  where: string
): { node: Asn1; end: number } {
  if (depth > MAX_DER_DEPTH) throw new InspectError('too-deep', where, offset);
  budget.nodes += 1;
  if (budget.nodes > MAX_DER_NODES) throw new InspectError('too-many-nodes', where, offset);
  if (offset >= limit) throw new InspectError('truncated', where, offset);

  const id = data[offset];
  const cls = CLASSES[id >> 6];
  const constructed = (id & 0x20) !== 0;
  let tag = id & 0x1f;
  let i = offset + 1;

  // High tag number form: base-128, capped so a long run of 0x80 cannot spin.
  if (tag === 0x1f) {
    tag = 0;
    for (let seen = 0; ; seen += 1) {
      if (i >= limit) throw new InspectError('truncated', where, i);
      if (seen >= 4) throw new InspectError('tag-too-long', where, offset);
      const b = data[i];
      i += 1;
      tag = tag * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
  }

  if (i >= limit) throw new InspectError('truncated', where, i);
  let length = data[i];
  i += 1;
  if (length === 0x80) throw new InspectError('indefinite-length', where, offset);
  if (length === 0xff) throw new InspectError('reserved-length', where, offset);
  if (length > 0x80) {
    const n = length & 0x7f;
    // Four bytes is 4 GB; anything longer is not a length we could honour.
    if (n > 4) throw new InspectError('length-too-long', where, offset);
    if (i + n > limit) throw new InspectError('truncated', where, i);
    length = 0;
    for (let k = 0; k < n; k += 1) length = length * 256 + data[i + k];
    i += n;
  }

  const end = i + length;
  if (end > limit || end < i) throw new InspectError('truncated', where, offset);

  const node: Asn1 = {
    cls,
    tag,
    constructed,
    offset,
    headerLength: i - offset,
    content: data.subarray(i, end),
    children: [],
  };

  if (constructed) {
    let p = i;
    while (p < end) {
      const child = readNode(data, p, end, depth + 1, budget, where);
      node.children.push(child.node);
      p = child.end;
    }
  }

  return { node, end };
}

/** One complete DER value that accounts for every byte given. */
export function parseDer(data: Uint8Array, where = 'DER'): Asn1 {
  if (data.length === 0) throw new InspectError('empty', where, 0);
  if (data.length > MAX_DER_BYTES) throw new InspectError('too-large', where, data.length);
  const read = readNode(data, 0, data.length, 0, { nodes: 0 }, where);
  if (read.end !== data.length) throw new InspectError('trailing-bytes', where, read.end);
  return read.node;
}

/** The node's own encoding, header included — what you hash to fingerprint it. */
export function nodeBytes(data: Uint8Array, node: Asn1): Uint8Array {
  return data.subarray(node.offset, node.offset + node.headerLength + node.content.length);
}

function expect(node: Asn1 | undefined, cls: Asn1Class, tag: number, where: string): Asn1 {
  if (!node) throw new InspectError('missing-field', where);
  if (node.cls !== cls || node.tag !== tag) {
    throw new InspectError('unexpected-tag', `${where}: ${node.cls} ${node.tag}`, node.offset);
  }
  return node;
}

function expectSeq(node: Asn1 | undefined, where: string): Asn1 {
  const seq = expect(node, 'universal', TAG.sequence, where);
  if (!seq.constructed) throw new InspectError('unexpected-tag', `${where}: primitive SEQUENCE`, seq.offset);
  return seq;
}

/** Signed big-endian two's complement, in decimal. Serials outrun a double. */
export function integerToDecimal(content: Uint8Array): string {
  if (content.length === 0) throw new InspectError('bad-integer', 'INTEGER of zero length', -1);
  let value = 0n;
  for (const byte of content) value = (value << 8n) | BigInt(byte);
  if ((content[0] & 0x80) !== 0) value -= 1n << BigInt(8 * content.length);
  return value.toString();
}

/** Bit length of a big-endian unsigned magnitude, ignoring leading zero bytes. */
export function bitLength(content: Uint8Array): number {
  let i = 0;
  while (i < content.length && content[i] === 0) i += 1;
  if (i === content.length) return 0;
  return (content.length - i - 1) * 8 + (32 - Math.clz32(content[i]));
}

export function oidToString(content: Uint8Array): string {
  if (content.length === 0) throw new InspectError('bad-oid', 'OID of zero length', -1);
  const parts: string[] = [];
  let value = 0n;
  let bytes = 0;
  let first = true;
  for (let i = 0; i < content.length; i += 1) {
    const b = content[i];
    bytes += 1;
    // 16 continuation bytes is 112 bits of arc; nothing real comes close.
    if (bytes > 16) throw new InspectError('bad-oid', 'sub-identifier too long', i);
    value = (value << 7n) | BigInt(b & 0x7f);
    if ((b & 0x80) === 0) {
      if (first) {
        const arc = value < 40n ? 0n : value < 80n ? 1n : 2n;
        parts.push(arc.toString(), (value - arc * 40n).toString());
        first = false;
      } else {
        parts.push(value.toString());
      }
      value = 0n;
      bytes = 0;
    }
  }
  if (bytes !== 0) throw new InspectError('bad-oid', 'OID ends mid sub-identifier', content.length);
  return parts.join('.');
}

function decodeLatin1(content: Uint8Array): string {
  let out = '';
  for (const byte of content) out += String.fromCharCode(byte);
  return out;
}

/**
 * Text out of a DirectoryString and friends.
 *
 * T61String is decoded as Latin-1, which is wrong for its escape sequences and
 * right for the ASCII that certificates actually put in one; it is flagged in
 * the UI rather than silently presented as if it were UTF-8.
 */
export function parseAsn1String(node: Asn1): string {
  switch (node.tag) {
    case TAG.utf8String:
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(node.content);
      } catch {
        throw new InspectError('bad-string', 'UTF8String is not valid UTF-8', node.offset);
      }
    case TAG.printableString:
    case TAG.ia5String:
    case TAG.numericString:
    case TAG.visibleString:
    case TAG.generalString:
    case TAG.t61String:
      return decodeLatin1(node.content);
    case TAG.bmpString: {
      if (node.content.length % 2 !== 0) {
        throw new InspectError('bad-string', 'BMPString of odd length', node.offset);
      }
      let out = '';
      for (let i = 0; i < node.content.length; i += 2) {
        out += String.fromCharCode((node.content[i] << 8) | node.content[i + 1]);
      }
      return out;
    }
    case TAG.universalString: {
      if (node.content.length % 4 !== 0) {
        throw new InspectError('bad-string', 'UniversalString of odd length', node.offset);
      }
      let out = '';
      for (let i = 0; i < node.content.length; i += 4) {
        const cp =
          (node.content[i] << 24) |
          (node.content[i + 1] << 16) |
          (node.content[i + 2] << 8) |
          node.content[i + 3];
        if (cp < 0 || cp > 0x10ffff) {
          throw new InspectError('bad-string', 'UniversalString code point out of range', node.offset);
        }
        out += String.fromCodePoint(cp);
      }
      return out;
    }
    default:
      throw new InspectError('bad-string', `tag ${node.tag} is not a string type`, node.offset);
  }
}

export type Asn1Time = { iso: string; epochMs: number };

/**
 * UTCTime and GeneralizedTime.
 *
 * The two-digit year rule is RFC 5280 §4.1.2.5.1: 50-99 is 19xx, 00-49 is 20xx.
 * Offsets other than Z are accepted because old certificates carry them, but
 * everything is normalised to UTC so two certificates can be compared.
 */
export function parseAsn1Time(node: Asn1): Asn1Time {
  const text = decodeLatin1(node.content);
  let year: number;
  let rest: string;

  if (node.tag === TAG.utcTime) {
    const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/.exec(text);
    if (!m) throw new InspectError('bad-time', `UTCTime "${text}"`, node.offset);
    const yy = Number(m[1]);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    rest = text.slice(2);
  } else if (node.tag === TAG.generalizedTime) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(\.\d+)?(Z|[+-]\d{4})$/.exec(text);
    if (!m) throw new InspectError('bad-time', `GeneralizedTime "${text}"`, node.offset);
    year = Number(m[1]);
    rest = text.slice(4).replace(/\.\d+/, '');
  } else {
    throw new InspectError('unexpected-tag', `time tag ${node.tag}`, node.offset);
  }

  const month = Number(rest.slice(0, 2));
  const day = Number(rest.slice(2, 4));
  const hour = Number(rest.slice(4, 6));
  const minute = Number(rest.slice(6, 8));
  const zone = rest.slice(rest.length - (rest.endsWith('Z') ? 1 : 5));
  const second = rest.length - zone.length > 8 ? Number(rest.slice(8, 10)) : 0;

  let epochMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(epochMs)) throw new InspectError('bad-time', `"${text}"`, node.offset);

  // Date.UTC rolls 2024-02-31 into March instead of refusing it, so the parsed
  // components are compared back against the date that came out.
  const check = new Date(epochMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    throw new InspectError('bad-time', `"${text}" is not a real instant`, node.offset);
  }

  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const offsetMinutes = Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5));
    if (!Number.isFinite(offsetMinutes) || offsetMinutes > 24 * 60) {
      throw new InspectError('bad-time', `offset "${zone}"`, node.offset);
    }
    epochMs -= sign * offsetMinutes * 60_000;
  }

  return { iso: new Date(epochMs).toISOString().replace('.000', ''), epochMs };
}

/* ── OID names ─────────────────────────────── */

/** Descriptive names. OIDs are permanent registrations, not a dated table. */
const OID_NAMES: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.7': 'RSAES-OAEP',
  '1.2.840.113549.1.1.8': 'id-mgf1',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
  '1.2.840.10040.4.1': 'dsa',
  '1.2.840.10040.4.3': 'dsa-with-sha1',
  '1.2.840.10045.2.1': 'id-ecPublicKey',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)',
  '1.3.132.0.33': 'secp224r1 (P-224)',
  '1.3.132.0.34': 'secp384r1 (P-384)',
  '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.132.0.10': 'secp256k1',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
  '2.16.840.1.101.3.4.2.1': 'sha-256',
  '2.16.840.1.101.3.4.2.2': 'sha-384',
  '2.16.840.1.101.3.4.2.3': 'sha-512',
  '2.5.29.9': 'subjectDirectoryAttributes',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.16': 'privateKeyUsagePeriod',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.30': 'nameConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.33': 'policyMappings',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.36': 'policyConstraints',
  '2.5.29.37': 'extKeyUsage',
  '2.5.29.54': 'inhibitAnyPolicy',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '1.3.6.1.5.5.7.1.11': 'subjectInfoAccess',
  '1.3.6.1.5.5.7.48.1': 'OCSP',
  '1.3.6.1.5.5.7.48.2': 'caIssuers',
  '1.3.6.1.5.5.7.3.1': 'serverAuth',
  '1.3.6.1.5.5.7.3.2': 'clientAuth',
  '1.3.6.1.5.5.7.3.3': 'codeSigning',
  '1.3.6.1.5.5.7.3.4': 'emailProtection',
  '1.3.6.1.5.5.7.3.8': 'timeStamping',
  '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
  '2.5.29.37.0': 'anyExtendedKeyUsage',
  '1.3.6.1.4.1.11129.2.4.2': 'signedCertificateTimestampList',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '2.5.4.3': 'commonName',
  '2.5.4.6': 'countryName',
  '2.5.4.7': 'localityName',
  '2.5.4.8': 'stateOrProvinceName',
  '2.5.4.10': 'organizationName',
  '2.5.4.11': 'organizationalUnitName',
};

/** Short RFC 4514 labels for the attributes that appear in a subject line. */
const DN_LABELS: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.4': 'SN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'STREET',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory',
  '2.5.4.17': 'postalCode',
  '2.5.4.42': 'GN',
  '2.5.4.43': 'initials',
  '2.5.4.65': 'pseudonym',
  '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.1': 'UID',
  '0.9.2342.19200300.100.1.25': 'DC',
  '1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionL',
  '1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionST',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
};

/** Descriptive name, or '' when the OID is not in the table. */
export function oidName(oid: string): string {
  return OID_NAMES[oid] ?? '';
}

/* ── Certificate ───────────────────────────── */

export type Rdn = { oid: string; label: string; value: string };
export type DistinguishedName = { rdns: Rdn[]; text: string };
export type AlgorithmId = { oid: string; name: string; parameterOid: string | null };
export type GeneralName = {
  kind: 'dns' | 'ip' | 'email' | 'uri' | 'dirname' | 'registered-id' | 'other';
  value: string;
};
export type PublicKeyInfo = {
  oid: string;
  name: string;
  bits: number | null;
  curve: string | null;
  exponent: string | null;
  /** The SubjectPublicKeyInfo as encoded, for the pin. */
  spki: Uint8Array;
};
export type CertExtension = {
  oid: string;
  name: string;
  critical: boolean;
  size: number;
  summary: string;
};
export type Certificate = {
  version: number;
  serialHex: string;
  serialDecimal: string;
  signatureAlgorithm: AlgorithmId;
  /** RFC 5280 requires this to equal `signatureAlgorithm`; it is shown if not. */
  tbsSignatureAlgorithm: AlgorithmId;
  signatureBits: number;
  issuer: DistinguishedName;
  subject: DistinguishedName;
  notBefore: Asn1Time;
  notAfter: Asn1Time;
  publicKey: PublicKeyInfo;
  sans: GeneralName[];
  basicConstraints: { ca: boolean; pathLen: number | null } | null;
  keyUsage: string[];
  extKeyUsage: { oid: string; name: string }[];
  subjectKeyId: string | null;
  authorityKeyId: string | null;
  extensions: CertExtension[];
  selfIssued: boolean;
  der: Uint8Array;
};

function parseAlgorithm(node: Asn1 | undefined, where: string): AlgorithmId {
  const seq = expectSeq(node, where);
  const oid = oidToString(expect(seq.children[0], 'universal', TAG.oid, `${where}.algorithm`).content);
  const parameter = seq.children[1];
  const parameterOid =
    parameter && parameter.cls === 'universal' && parameter.tag === TAG.oid
      ? oidToString(parameter.content)
      : null;
  return { oid, name: oidName(oid), parameterOid };
}

function parseName(node: Asn1 | undefined, where: string): DistinguishedName {
  const seq = expectSeq(node, where);
  const rdns: Rdn[] = [];
  seq.children.forEach((set, i) => {
    expect(set, 'universal', TAG.set, `${where}.rdn[${i}]`);
    set.children.forEach((pair, j) => {
      const attr = expectSeq(pair, `${where}.rdn[${i}][${j}]`);
      const oid = oidToString(
        expect(attr.children[0], 'universal', TAG.oid, `${where}.rdn[${i}][${j}].type`).content
      );
      const valueNode = attr.children[1];
      if (!valueNode) throw new InspectError('missing-field', `${where}.rdn[${i}][${j}].value`);
      const value =
        valueNode.cls === 'universal' && valueNode.tag !== TAG.oid
          ? parseAsn1String(valueNode)
          : `#${toHexPlain(valueNode.content)}`;
      rdns.push({ oid, label: DN_LABELS[oid] ?? oid, value });
    });
  });
  // Printed in encoding order, the way openssl prints it, so a line pasted from
  // a terminal and a line from here can be compared character by character.
  const text = rdns.map((rdn) => `${rdn.label}=${rdn.value}`).join(', ');
  return { rdns, text };
}

function formatIp(content: Uint8Array): string {
  if (content.length === 4) return Array.from(content).join('.');
  if (content.length === 16) {
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      groups.push(((content[i] << 8) | content[i + 1]).toString(16));
    }
    // RFC 5952: longest run of zero groups (2 or more) becomes '::'.
    let bestStart = -1;
    let bestLength = 0;
    let start = -1;
    for (let i = 0; i <= groups.length; i += 1) {
      if (i < groups.length && groups[i] === '0') {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start > bestLength) {
          bestLength = i - start;
          bestStart = start;
        }
        start = -1;
      }
    }
    if (bestLength < 2) return groups.join(':');
    return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLength).join(':')}`;
  }
  // A mask-bearing IP (8 or 32 bytes) appears in name constraints, not in a SAN.
  return toHexColon(content);
}

function parseGeneralNames(node: Asn1, where: string): GeneralName[] {
  expectSeq(node, where);
  return node.children.map((item, i) => {
    const at = `${where}[${i}]`;
    if (item.cls !== 'context') throw new InspectError('unexpected-tag', at, item.offset);
    switch (item.tag) {
      case 1:
        return { kind: 'email' as const, value: decodeLatin1(item.content) };
      case 2:
        return { kind: 'dns' as const, value: decodeLatin1(item.content) };
      case 6:
        return { kind: 'uri' as const, value: decodeLatin1(item.content) };
      case 7:
        return { kind: 'ip' as const, value: formatIp(item.content) };
      case 8:
        return { kind: 'registered-id' as const, value: oidToString(item.content) };
      case 4: {
        const inner = item.children[0];
        if (!inner) throw new InspectError('missing-field', `${at}.directoryName`, item.offset);
        return { kind: 'dirname' as const, value: parseName(inner, `${at}.directoryName`).text };
      }
      case 0: {
        const oid = item.children[0];
        const label =
          oid && oid.cls === 'universal' && oid.tag === TAG.oid ? oidToString(oid.content) : 'otherName';
        return { kind: 'other' as const, value: `${label} (${item.content.length} B)` };
      }
      default:
        // x400Address and ediPartyName have no text form worth inventing.
        return { kind: 'other' as const, value: `[${item.tag}] ${item.content.length} B` };
    }
  });
}

const KEY_USAGE = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
];

function parseKeyUsage(node: Asn1, where: string): string[] {
  expect(node, 'universal', TAG.bitString, where);
  if (node.content.length === 0) throw new InspectError('bad-bitstring', where, node.offset);
  const unused = node.content[0];
  if (unused > 7) throw new InspectError('bad-bitstring', `${where}: ${unused} unused bits`, node.offset);
  const bits = (node.content.length - 1) * 8 - unused;
  const out: string[] = [];
  for (let i = 0; i < bits && i < KEY_USAGE.length; i += 1) {
    if ((node.content[1 + (i >> 3)] >> (7 - (i % 8))) & 1) out.push(KEY_USAGE[i]);
  }
  return out;
}

const CURVE_BITS: Record<string, number> = {
  '1.2.840.10045.3.1.7': 256,
  '1.3.132.0.33': 224,
  '1.3.132.0.34': 384,
  '1.3.132.0.35': 521,
  '1.3.132.0.10': 256,
};

function parsePublicKey(der: Uint8Array, node: Asn1, where: string): PublicKeyInfo {
  const seq = expectSeq(node, where);
  const algorithm = parseAlgorithm(seq.children[0], `${where}.algorithm`);
  const keyBits = expect(seq.children[1], 'universal', TAG.bitString, `${where}.subjectPublicKey`);
  if (keyBits.content.length === 0) {
    throw new InspectError('bad-bitstring', `${where}.subjectPublicKey`, keyBits.offset);
  }
  const key = keyBits.content.subarray(1);

  let bits: number | null = null;
  let curve: string | null = null;
  let exponent: string | null = null;

  if (algorithm.oid === '1.2.840.113549.1.1.1') {
    const rsa = parseDer(key, `${where}.rsaPublicKey`);
    expectSeq(rsa, `${where}.rsaPublicKey`);
    const modulus = expect(rsa.children[0], 'universal', TAG.integer, `${where}.rsaPublicKey.modulus`);
    const e = expect(rsa.children[1], 'universal', TAG.integer, `${where}.rsaPublicKey.exponent`);
    bits = bitLength(modulus.content);
    exponent = integerToDecimal(e.content);
  } else if (algorithm.oid === '1.2.840.10045.2.1') {
    curve = algorithm.parameterOid ? oidName(algorithm.parameterOid) || algorithm.parameterOid : null;
    bits = algorithm.parameterOid ? (CURVE_BITS[algorithm.parameterOid] ?? null) : null;
  } else if (algorithm.oid === '1.3.101.112') {
    bits = 256;
  } else if (algorithm.oid === '1.3.101.113') {
    bits = 456;
  }
  // Anything else keeps bits null rather than guessing from the key length.

  return {
    oid: algorithm.oid,
    name: algorithm.name,
    bits,
    curve,
    exponent,
    spki: nodeBytes(der, seq),
  };
}

function summarizeExtension(
  oid: string,
  value: Asn1,
  where: string
): { summary: string; parsed: 'san' | 'ku' | 'eku' | 'bc' | 'skid' | 'akid' | null } {
  switch (oid) {
    case '2.5.29.17':
      return { summary: `${value.children.length} name(s)`, parsed: 'san' };
    case '2.5.29.15':
      return { summary: parseKeyUsage(value, where).join(', '), parsed: 'ku' };
    case '2.5.29.37':
      return { summary: `${value.children.length} purpose(s)`, parsed: 'eku' };
    case '2.5.29.19':
      return { summary: '', parsed: 'bc' };
    case '2.5.29.14':
      return { summary: '', parsed: 'skid' };
    case '2.5.29.35':
      return { summary: '', parsed: 'akid' };
    default:
      return { summary: '', parsed: null };
  }
}

/**
 * Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
 * walked field by field against RFC 5280 §4.1.
 */
export function parseCertificate(der: Uint8Array): Certificate {
  const root = parseDer(der, 'Certificate');
  expectSeq(root, 'Certificate');
  if (root.children.length !== 3) {
    throw new InspectError('unexpected-tag', `Certificate has ${root.children.length} fields`, root.offset);
  }
  const tbs = expectSeq(root.children[0], 'tbsCertificate');
  const signatureAlgorithm = parseAlgorithm(root.children[1], 'signatureAlgorithm');
  const signature = expect(root.children[2], 'universal', TAG.bitString, 'signatureValue');
  if (signature.content.length === 0) {
    throw new InspectError('bad-bitstring', 'signatureValue', signature.offset);
  }

  let i = 0;
  let version = 1;
  const head = tbs.children[i];
  if (head && head.cls === 'context' && head.tag === 0) {
    const raw = expect(head.children[0], 'universal', TAG.integer, 'tbsCertificate.version');
    const decoded = Number(integerToDecimal(raw.content));
    if (decoded < 0 || decoded > 2) {
      throw new InspectError('bad-version', `version ${decoded + 1}`, raw.offset);
    }
    version = decoded + 1;
    i += 1;
  }

  const serial = expect(tbs.children[i], 'universal', TAG.integer, 'tbsCertificate.serialNumber');
  i += 1;
  const tbsSignatureAlgorithm = parseAlgorithm(tbs.children[i], 'tbsCertificate.signature');
  i += 1;
  const issuer = parseName(tbs.children[i], 'tbsCertificate.issuer');
  i += 1;
  const validity = expectSeq(tbs.children[i], 'tbsCertificate.validity');
  i += 1;
  const subject = parseName(tbs.children[i], 'tbsCertificate.subject');
  i += 1;
  const publicKey = parsePublicKey(der, tbs.children[i], 'tbsCertificate.subjectPublicKeyInfo');
  i += 1;

  const notBeforeNode = validity.children[0];
  const notAfterNode = validity.children[1];
  if (!notBeforeNode || !notAfterNode) {
    throw new InspectError('missing-field', 'tbsCertificate.validity', validity.offset);
  }
  const notBefore = parseAsn1Time(notBeforeNode);
  const notAfter = parseAsn1Time(notAfterNode);

  let extensionList: Asn1 | null = null;
  for (; i < tbs.children.length; i += 1) {
    const tail = tbs.children[i];
    if (tail.cls !== 'context') {
      throw new InspectError('unexpected-tag', `tbsCertificate field ${i}`, tail.offset);
    }
    // [1] issuerUniqueID and [2] subjectUniqueID carry nothing worth showing.
    if (tail.tag === 3) {
      extensionList = expectSeq(tail.children[0], 'tbsCertificate.extensions');
      if (version !== 3) {
        throw new InspectError('bad-version', 'extensions present in a v1/v2 certificate', tail.offset);
      }
    } else if (tail.tag !== 1 && tail.tag !== 2) {
      throw new InspectError('unexpected-tag', `tbsCertificate [${tail.tag}]`, tail.offset);
    }
  }

  const extensions: CertExtension[] = [];
  let sans: GeneralName[] = [];
  let keyUsage: string[] = [];
  let extKeyUsage: { oid: string; name: string }[] = [];
  let basicConstraints: { ca: boolean; pathLen: number | null } | null = null;
  let subjectKeyId: string | null = null;
  let authorityKeyId: string | null = null;

  (extensionList?.children ?? []).forEach((entry, index) => {
    const at = `extensions[${index}]`;
    const seq = expectSeq(entry, at);
    const oid = oidToString(expect(seq.children[0], 'universal', TAG.oid, `${at}.extnID`).content);
    let cursor = 1;
    let critical = false;
    const maybeCritical = seq.children[cursor];
    if (maybeCritical && maybeCritical.cls === 'universal' && maybeCritical.tag === TAG.boolean) {
      if (maybeCritical.content.length !== 1) {
        throw new InspectError('unexpected-tag', `${at}.critical`, maybeCritical.offset);
      }
      critical = maybeCritical.content[0] !== 0;
      cursor += 1;
    }
    const raw = expect(seq.children[cursor], 'universal', TAG.octetString, `${at}.extnValue`);

    let summary = '';
    if (OID_NAMES[oid] !== undefined || raw.content.length > 0) {
      // Known extensions are decoded; unknown ones are reported by size only,
      // which is the honest thing to say about bytes we do not understand.
      const known = new Set(['2.5.29.17', '2.5.29.15', '2.5.29.37', '2.5.29.19', '2.5.29.14', '2.5.29.35']);
      if (known.has(oid)) {
        const inner = parseDer(raw.content, `${at}.extnValue`);
        const described = summarizeExtension(oid, inner, `${at}.extnValue`);
        summary = described.summary;
        if (described.parsed === 'san') sans = parseGeneralNames(inner, `${at}.subjectAltName`);
        if (described.parsed === 'ku') keyUsage = parseKeyUsage(inner, `${at}.keyUsage`);
        if (described.parsed === 'eku') {
          expectSeq(inner, `${at}.extKeyUsage`);
          extKeyUsage = inner.children.map((child, k) => {
            const purpose = oidToString(
              expect(child, 'universal', TAG.oid, `${at}.extKeyUsage[${k}]`).content
            );
            return { oid: purpose, name: oidName(purpose) };
          });
          summary = extKeyUsage.map((purpose) => purpose.name || purpose.oid).join(', ');
        }
        if (described.parsed === 'bc') {
          expectSeq(inner, `${at}.basicConstraints`);
          let ca = false;
          let pathLen: number | null = null;
          for (const field of inner.children) {
            if (field.cls === 'universal' && field.tag === TAG.boolean) ca = field.content[0] !== 0;
            else if (field.cls === 'universal' && field.tag === TAG.integer) {
              pathLen = Number(integerToDecimal(field.content));
            } else throw new InspectError('unexpected-tag', `${at}.basicConstraints`, field.offset);
          }
          basicConstraints = { ca, pathLen };
          summary = `CA:${ca ? 'TRUE' : 'FALSE'}${pathLen === null ? '' : `, pathlen:${pathLen}`}`;
        }
        if (described.parsed === 'skid') {
          expect(inner, 'universal', TAG.octetString, `${at}.subjectKeyIdentifier`);
          subjectKeyId = toHexColon(inner.content);
          summary = subjectKeyId;
        }
        if (described.parsed === 'akid') {
          expectSeq(inner, `${at}.authorityKeyIdentifier`);
          for (const field of inner.children) {
            if (field.cls === 'context' && field.tag === 0) {
              authorityKeyId = toHexColon(field.content);
              summary = authorityKeyId;
            }
          }
        }
      }
    }

    extensions.push({
      oid,
      name: oidName(oid),
      critical,
      size: raw.content.length,
      summary,
    });
  });

  return {
    version,
    serialHex: toHexColon(serial.content),
    serialDecimal: integerToDecimal(serial.content),
    signatureAlgorithm,
    tbsSignatureAlgorithm,
    signatureBits: (signature.content.length - 1) * 8 - signature.content[0],
    issuer,
    subject,
    notBefore,
    notAfter,
    publicKey,
    sans,
    basicConstraints,
    keyUsage,
    extKeyUsage,
    subjectKeyId,
    authorityKeyId,
    extensions,
    selfIssued: issuer.text === subject.text,
    der,
  };
}

/** Where a certificate sits relative to a clock the caller supplies. */
export function describeValidity(
  cert: Certificate,
  nowMs: number
): { state: 'not-yet' | 'valid' | 'expired'; days: number; lifetimeDays: number } {
  const day = 86_400_000;
  const lifetimeDays = Math.round((cert.notAfter.epochMs - cert.notBefore.epochMs) / day);
  if (nowMs < cert.notBefore.epochMs) {
    return { state: 'not-yet', days: Math.ceil((cert.notBefore.epochMs - nowMs) / day), lifetimeDays };
  }
  if (nowMs > cert.notAfter.epochMs) {
    return { state: 'expired', days: Math.floor((nowMs - cert.notAfter.epochMs) / day), lifetimeDays };
  }
  return { state: 'valid', days: Math.floor((cert.notAfter.epochMs - nowMs) / day), lifetimeDays };
}

/* ── PEM ───────────────────────────────────── */

export type PemBlock = { label: string; der: Uint8Array };

const ARMOUR = /-----BEGIN ([A-Z0-9 ]*)-----([\s\S]*?)-----END ([A-Z0-9 ]*)-----/g;

/**
 * Every armoured block in the text, in order — a chain file is the normal case.
 * A private key is refused rather than parsed: this tool has no reason to read
 * one, and saying so is more useful than a field dump.
 */
export function decodePem(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  ARMOUR.lastIndex = 0;
  let match = ARMOUR.exec(text);
  while (match !== null) {
    const label = match[1].trim();
    if (label !== match[3].trim()) {
      throw new InspectError('label-mismatch', `BEGIN ${label} / END ${match[3].trim()}`);
    }
    if (/PRIVATE KEY/.test(label)) throw new InspectError('private-key', label);
    if (blocks.length >= MAX_PEM_BLOCKS) throw new InspectError('too-many-blocks', String(MAX_PEM_BLOCKS));
    blocks.push({ label, der: fromBase64(match[2], `${label} body`) });
    match = ARMOUR.exec(text);
  }
  if (blocks.length === 0) throw new InspectError('no-pem', 'no -----BEGIN ...----- block found');
  return blocks;
}

const CERT_LABELS = new Set(['CERTIFICATE', 'X509 CERTIFICATE', 'TRUSTED CERTIFICATE']);

/** Certificates out of a PEM text, refusing labels that are something else. */
export function parsePemCertificates(text: string): Certificate[] {
  return decodePem(text).map((block) => {
    if (!CERT_LABELS.has(block.label)) throw new InspectError('not-a-certificate', block.label);
    return parseCertificate(block.der);
  });
}

/* ── Digests ───────────────────────────────── */

async function digest(algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> {
  const view = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest(algorithm, view));
}

/**
 * The three readings people actually compare:
 *
 *  - SHA-256 and SHA-1 over the whole certificate, colon hex, as openssl
 *    `-fingerprint` and every browser's certificate viewer print them.
 *  - The SPKI pin, base64 of SHA-256 over the SubjectPublicKeyInfo. That is the
 *    `pin-sha256` value, and it survives a reissue with the same key — which is
 *    why it is a different reading rather than the same one twice.
 *
 * MD5 is not offered: WebCrypto does not implement it, and hand-rolling a broken
 * hash to print a legacy fingerprint is not a trade worth making.
 */
export async function certFingerprints(
  cert: Certificate
): Promise<{ sha256: string; sha1: string; spkiPin: string }> {
  const [sha256, sha1, spki] = await Promise.all([
    digest('SHA-256', cert.der),
    digest('SHA-1', cert.der),
    digest('SHA-256', cert.publicKey.spki),
  ]);
  return {
    sha256: toHexColon(sha256),
    sha1: toHexColon(sha1),
    spkiPin: toBase64(spki),
  };
}

/* ── OpenSSH public keys ───────────────────── */

export type SshField = { name: string; size: number };
export type SshPublicKey = {
  /** The algorithm name on the line. */
  algorithm: string;
  /** The algorithm name inside the blob; the two must agree. */
  blobAlgorithm: string;
  comment: string;
  options: string;
  bits: number | null;
  curve: string | null;
  fields: SshField[];
  blob: Uint8Array;
};

const SSH_ALGORITHMS = /^(ssh-(rsa|dss|ed25519|ed448)|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com|rsa-sha2-(256|512))$/;

function readSshString(blob: Uint8Array, at: number, where: string): { value: Uint8Array; next: number } {
  if (at + 4 > blob.length) throw new InspectError('ssh-truncated', where, at);
  const size = ((blob[at] << 24) | (blob[at + 1] << 16) | (blob[at + 2] << 8) | blob[at + 3]) >>> 0;
  const start = at + 4;
  if (size > blob.length - start) throw new InspectError('ssh-truncated', `${where} (${size} B)`, at);
  return { value: blob.subarray(start, start + size), next: start + size };
}

/**
 * One authorized_keys-style line: optional options, algorithm, base64 blob,
 * optional comment.
 *
 * The blob's own algorithm string is compared against the one on the line. They
 * disagree only in a mangled or hand-edited key, and a fingerprint computed over
 * a blob that is not what the line claims is worse than no fingerprint.
 */
export function parseSshPublicKey(text: string): SshPublicKey {
  const line = text.trim().split(/\r?\n/).find((candidate) => candidate.trim() !== '')?.trim() ?? '';
  if (line === '') throw new InspectError('ssh-bad-line', 'empty input');

  const tokens = line.split(/\s+/);
  const index = tokens.findIndex((token) => SSH_ALGORITHMS.test(token));
  if (index < 0 || tokens[index + 1] === undefined) {
    throw new InspectError('ssh-bad-line', 'no "<algorithm> <base64>" pair on the line');
  }

  const algorithm = tokens[index];
  const blob = fromBase64(tokens[index + 1], 'key blob');
  if (blob.length > MAX_SSH_BLOB) throw new InspectError('too-large', 'key blob', blob.length);

  const head = readSshString(blob, 0, 'blob.algorithm');
  const blobAlgorithm = decodeLatin1(head.value);
  if (blobAlgorithm !== algorithm) {
    throw new InspectError('ssh-blob-mismatch', `line says ${algorithm}, blob says ${blobAlgorithm}`);
  }

  const fields: SshField[] = [{ name: 'algorithm', size: head.value.length }];
  let bits: number | null = null;
  let curve: string | null = null;
  let at = head.next;

  if (algorithm === 'ssh-rsa' || algorithm === 'rsa-sha2-256' || algorithm === 'rsa-sha2-512') {
    const e = readSshString(blob, at, 'blob.e');
    const n = readSshString(blob, e.next, 'blob.n');
    fields.push({ name: 'e', size: e.value.length }, { name: 'n', size: n.value.length });
    bits = bitLength(n.value);
    at = n.next;
  } else if (algorithm === 'ssh-dss') {
    const p = readSshString(blob, at, 'blob.p');
    const q = readSshString(blob, p.next, 'blob.q');
    const g = readSshString(blob, q.next, 'blob.g');
    const y = readSshString(blob, g.next, 'blob.y');
    fields.push(
      { name: 'p', size: p.value.length },
      { name: 'q', size: q.value.length },
      { name: 'g', size: g.value.length },
      { name: 'y', size: y.value.length }
    );
    bits = bitLength(p.value);
    at = y.next;
  } else if (algorithm.startsWith('ecdsa-sha2-nistp') || algorithm.startsWith('sk-ecdsa-sha2-')) {
    const name = readSshString(blob, at, 'blob.curve');
    const point = readSshString(blob, name.next, 'blob.point');
    curve = decodeLatin1(name.value);
    const expected = algorithm.replace(/^sk-/, '').replace('ecdsa-sha2-', '').replace('@openssh.com', '');
    if (curve !== expected) {
      throw new InspectError('ssh-blob-mismatch', `curve ${curve} under ${algorithm}`);
    }
    bits = curve === 'nistp521' ? 521 : Number(curve.replace('nistp', ''));
    fields.push({ name: 'curve', size: name.value.length }, { name: 'point', size: point.value.length });
    at = point.next;
  } else if (algorithm === 'ssh-ed25519' || algorithm === 'sk-ssh-ed25519@openssh.com') {
    const key = readSshString(blob, at, 'blob.key');
    if (key.value.length !== 32) {
      throw new InspectError('ssh-truncated', `Ed25519 key is ${key.value.length} B, expected 32`, at);
    }
    fields.push({ name: 'key', size: key.value.length });
    bits = 256;
    at = key.next;
  } else if (algorithm === 'ssh-ed448') {
    const key = readSshString(blob, at, 'blob.key');
    fields.push({ name: 'key', size: key.value.length });
    bits = 456;
    at = key.next;
  }

  // Security keys append an application string; anything else left over is
  // reported as a field rather than ignored.
  while (at < blob.length) {
    const extra = readSshString(blob, at, 'blob.extra');
    fields.push({ name: 'extra', size: extra.value.length });
    at = extra.next;
  }

  const comment = tokens.slice(index + 2).join(' ');
  return {
    algorithm,
    blobAlgorithm,
    comment,
    options: tokens.slice(0, index).join(' '),
    bits,
    curve,
    fields,
    blob,
  };
}

/**
 * OpenSSH fingerprints: base64 of the digest over the blob, unpadded, the way
 * `ssh-keygen -lf` prints it. SHA-256 is the default since OpenSSH 6.8; SHA-512
 * is the other one it will print. MD5 (the `-E md5` colon form) is absent for
 * the reason given above `certFingerprints`.
 */
export async function sshFingerprint(blob: Uint8Array): Promise<{ sha256: string; sha512: string }> {
  const [sha256, sha512] = await Promise.all([digest('SHA-256', blob), digest('SHA-512', blob)]);
  return {
    sha256: `SHA256:${toBase64(sha256, false)}`,
    sha512: `SHA512:${toBase64(sha512, false)}`,
  };
}
