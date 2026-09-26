/**
 * HTML entities, both directions, with the legacy rules that browsers still
 * apply and most converters quietly do not.
 *
 * Two of those rules matter in practice. First, a numeric reference in the
 * range 128–159 does not mean the C1 control character it names: HTML has
 * always remapped that range through Windows-1252, so `&#151;` is an em dash
 * and not U+0097. Data exported from an old CMS is full of them. Second, a
 * named reference without its semicolon is still resolved by a real parser for
 * a specific legacy list, which is why `&amptest` and `&ampere` do not mean the
 * same thing. Both are handled here, the second only when you ask for it.
 *
 * The table is HTML 4.01's — the 252 entities every browser, XML tool and
 * template engine agrees on — plus HTML5's `apos`. HTML5 defines about two
 * thousand more, mostly mathematical aliases; shipping all of them would cost
 * more than this drawer's page budget and would encode text that fewer
 * consumers can read back.
 */

export const TABLE_VERSION = 'HTML 4.01 named entities + HTML5 apos';

/** name (no `&`, no `;`) → code point. */
export const NAMED_CP: Record<string, number> = {
  /* Special characters (HTML 4.01 §24.4) */
  quot: 0x22,
  amp: 0x26,
  apos: 0x27, // HTML5 only; XML has always had it, HTML 4 never did.
  lt: 0x3c,
  gt: 0x3e,
  OElig: 0x152,
  oelig: 0x153,
  Scaron: 0x160,
  scaron: 0x161,
  Yuml: 0x178,
  circ: 0x2c6,
  tilde: 0x2dc,
  ensp: 0x2002,
  emsp: 0x2003,
  thinsp: 0x2009,
  zwnj: 0x200c,
  zwj: 0x200d,
  lrm: 0x200e,
  rlm: 0x200f,
  ndash: 0x2013,
  mdash: 0x2014,
  lsquo: 0x2018,
  rsquo: 0x2019,
  sbquo: 0x201a,
  ldquo: 0x201c,
  rdquo: 0x201d,
  bdquo: 0x201e,
  dagger: 0x2020,
  Dagger: 0x2021,
  permil: 0x2030,
  lsaquo: 0x2039,
  rsaquo: 0x203a,
  euro: 0x20ac,

  /* Latin-1 supplement (HTML 4.01 §24.2) */
  nbsp: 0xa0,
  iexcl: 0xa1,
  cent: 0xa2,
  pound: 0xa3,
  curren: 0xa4,
  yen: 0xa5,
  brvbar: 0xa6,
  sect: 0xa7,
  uml: 0xa8,
  copy: 0xa9,
  ordf: 0xaa,
  laquo: 0xab,
  not: 0xac,
  shy: 0xad,
  reg: 0xae,
  macr: 0xaf,
  deg: 0xb0,
  plusmn: 0xb1,
  sup2: 0xb2,
  sup3: 0xb3,
  acute: 0xb4,
  micro: 0xb5,
  para: 0xb6,
  middot: 0xb7,
  cedil: 0xb8,
  sup1: 0xb9,
  ordm: 0xba,
  raquo: 0xbb,
  frac14: 0xbc,
  frac12: 0xbd,
  frac34: 0xbe,
  iquest: 0xbf,
  Agrave: 0xc0,
  Aacute: 0xc1,
  Acirc: 0xc2,
  Atilde: 0xc3,
  Auml: 0xc4,
  Aring: 0xc5,
  AElig: 0xc6,
  Ccedil: 0xc7,
  Egrave: 0xc8,
  Eacute: 0xc9,
  Ecirc: 0xca,
  Euml: 0xcb,
  Igrave: 0xcc,
  Iacute: 0xcd,
  Icirc: 0xce,
  Iuml: 0xcf,
  ETH: 0xd0,
  Ntilde: 0xd1,
  Ograve: 0xd2,
  Oacute: 0xd3,
  Ocirc: 0xd4,
  Otilde: 0xd5,
  Ouml: 0xd6,
  times: 0xd7,
  Oslash: 0xd8,
  Ugrave: 0xd9,
  Uacute: 0xda,
  Ucirc: 0xdb,
  Uuml: 0xdc,
  Yacute: 0xdd,
  THORN: 0xde,
  szlig: 0xdf,
  agrave: 0xe0,
  aacute: 0xe1,
  acirc: 0xe2,
  atilde: 0xe3,
  auml: 0xe4,
  aring: 0xe5,
  aelig: 0xe6,
  ccedil: 0xe7,
  egrave: 0xe8,
  eacute: 0xe9,
  ecirc: 0xea,
  euml: 0xeb,
  igrave: 0xec,
  iacute: 0xed,
  icirc: 0xee,
  iuml: 0xef,
  eth: 0xf0,
  ntilde: 0xf1,
  ograve: 0xf2,
  oacute: 0xf3,
  ocirc: 0xf4,
  otilde: 0xf5,
  ouml: 0xf6,
  divide: 0xf7,
  oslash: 0xf8,
  ugrave: 0xf9,
  uacute: 0xfa,
  ucirc: 0xfb,
  uuml: 0xfc,
  yacute: 0xfd,
  thorn: 0xfe,
  yuml: 0xff,

  /* Symbols, mathematics and Greek (HTML 4.01 §24.3) */
  fnof: 0x192,
  Alpha: 0x391,
  Beta: 0x392,
  Gamma: 0x393,
  Delta: 0x394,
  Epsilon: 0x395,
  Zeta: 0x396,
  Eta: 0x397,
  Theta: 0x398,
  Iota: 0x399,
  Kappa: 0x39a,
  Lambda: 0x39b,
  Mu: 0x39c,
  Nu: 0x39d,
  Xi: 0x39e,
  Omicron: 0x39f,
  Pi: 0x3a0,
  Rho: 0x3a1,
  Sigma: 0x3a3,
  Tau: 0x3a4,
  Upsilon: 0x3a5,
  Phi: 0x3a6,
  Chi: 0x3a7,
  Psi: 0x3a8,
  Omega: 0x3a9,
  alpha: 0x3b1,
  beta: 0x3b2,
  gamma: 0x3b3,
  delta: 0x3b4,
  epsilon: 0x3b5,
  zeta: 0x3b6,
  eta: 0x3b7,
  theta: 0x3b8,
  iota: 0x3b9,
  kappa: 0x3ba,
  lambda: 0x3bb,
  mu: 0x3bc,
  nu: 0x3bd,
  xi: 0x3be,
  omicron: 0x3bf,
  pi: 0x3c0,
  rho: 0x3c1,
  sigmaf: 0x3c2,
  sigma: 0x3c3,
  tau: 0x3c4,
  upsilon: 0x3c5,
  phi: 0x3c6,
  chi: 0x3c7,
  psi: 0x3c8,
  omega: 0x3c9,
  thetasym: 0x3d1,
  upsih: 0x3d2,
  piv: 0x3d6,
  bull: 0x2022,
  hellip: 0x2026,
  prime: 0x2032,
  Prime: 0x2033,
  oline: 0x203e,
  frasl: 0x2044,
  weierp: 0x2118,
  image: 0x2111,
  real: 0x211c,
  trade: 0x2122,
  alefsym: 0x2135,
  larr: 0x2190,
  uarr: 0x2191,
  rarr: 0x2192,
  darr: 0x2193,
  harr: 0x2194,
  crarr: 0x21b5,
  lArr: 0x21d0,
  uArr: 0x21d1,
  rArr: 0x21d2,
  dArr: 0x21d3,
  hArr: 0x21d4,
  forall: 0x2200,
  part: 0x2202,
  exist: 0x2203,
  empty: 0x2205,
  nabla: 0x2207,
  isin: 0x2208,
  notin: 0x2209,
  ni: 0x220b,
  prod: 0x220f,
  sum: 0x2211,
  minus: 0x2212,
  lowast: 0x2217,
  radic: 0x221a,
  prop: 0x221d,
  infin: 0x221e,
  ang: 0x2220,
  and: 0x2227,
  or: 0x2228,
  cap: 0x2229,
  cup: 0x222a,
  int: 0x222b,
  there4: 0x2234,
  sim: 0x223c,
  cong: 0x2245,
  asymp: 0x2248,
  ne: 0x2260,
  equiv: 0x2261,
  le: 0x2264,
  ge: 0x2265,
  sub: 0x2282,
  sup: 0x2283,
  nsub: 0x2284,
  sube: 0x2286,
  supe: 0x2287,
  oplus: 0x2295,
  otimes: 0x2297,
  perp: 0x22a5,
  sdot: 0x22c5,
  lceil: 0x2308,
  rceil: 0x2309,
  lfloor: 0x230a,
  rfloor: 0x230b,
  lang: 0x2329,
  rang: 0x232a,
  loz: 0x25ca,
  spades: 0x2660,
  clubs: 0x2663,
  hearts: 0x2665,
  diams: 0x2666,
};

export const NAMED_COUNT = Object.keys(NAMED_CP).length;

/**
 * code point → the name to write when encoding.
 *
 * Built in declaration order so the first name listed for a code point wins;
 * nothing in the HTML 4 table collides, but the rule is stated because the
 * moment someone adds an alias it decides the output.
 */
export const NAME_OF: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [name, cp] of Object.entries(NAMED_CP)) {
    if (!(cp in out)) out[cp] = name;
  }
  return out;
})();

/**
 * The Windows-1252 remapping HTML applies to numeric references 0x80–0x9F.
 *
 * Not a convenience: it is in the HTML5 parsing spec, every browser does it,
 * and without it `&#150;` renders as an invisible control character instead of
 * the en dash whoever exported the data meant.
 */
export const CP1252: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

export const REPLACEMENT = '�';

/** Longest name in the table, the bound on how far a lenient scan may look. */
const LONGEST_NAME = Object.keys(NAMED_CP).reduce((n, name) => Math.max(n, name.length), 0);

/* ── Encoding ─────────────────────────────── */

export type Scope =
  /** Only what a parser could mistake for markup: `& < > " '`. */
  | 'minimal'
  /** The minimal set plus every character above U+007F. */
  | 'nonAscii';

export type Prefer = 'named' | 'decimal' | 'hex';

export type EncodeOptions = { scope?: Scope; prefer?: Prefer };

/** The five a parser can misread. `'` matters inside single-quoted attributes. */
const MARKUP = new Set([0x26, 0x3c, 0x3e, 0x22, 0x27]);

function reference(cp: number, prefer: Prefer): string {
  if (prefer === 'named') {
    const name = NAME_OF[cp];
    // `&apos;` is HTML5-only: an XHTML 1.0 or HTML 4 consumer reads it as
    // literal text, so the numeric form is written instead.
    if (name && name !== 'apos') return `&${name};`;
    return `&#${cp};`;
  }
  if (prefer === 'hex') return `&#x${cp.toString(16).toUpperCase()};`;
  return `&#${cp};`;
}

/**
 * Replaces characters with entity references.
 *
 * Iteration is by code point, not by code unit: an emoji is one reference
 * (`&#128512;`), never two references for its surrogate halves — a pair of
 * surrogate references is what produces the two grey boxes people report.
 */
export function encodeEntities(text: string, options: EncodeOptions = {}): string {
  const scope = options.scope ?? 'minimal';
  const prefer = options.prefer ?? 'named';
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    // U+0080–U+009F cannot be written as a numeric reference at all: HTML reads
    // `&#133;` as U+2026, not U+0085 (see CP1252 above). The literal character
    // is the only form that survives, so it is left alone and counted for the
    // UI to warn about.
    if (cp >= 0x80 && cp <= 0x9f) {
      out += ch;
      continue;
    }
    const needed = MARKUP.has(cp) || (scope === 'nonAscii' && cp > 0x7f);
    out += needed ? reference(cp, prefer) : ch;
  }
  return out;
}

/**
 * C1 control characters present in the text.
 *
 * These are the one class of character this tool cannot escape, because HTML's
 * own remapping rule makes every numeric reference for them mean something
 * else. Usually they are a symptom: text that was decoded as latin-1 when it
 * was really Windows-1252.
 */
export function countC1(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0x80 && cp <= 0x9f) n += 1;
  }
  return n;
}

/* ── Decoding ─────────────────────────────── */

/** Applies HTML's rules for what a numeric reference actually denotes. */
export function charFromCodePoint(cp: number): string {
  if (cp === 0) return REPLACEMENT;
  if (cp in CP1252) return String.fromCodePoint(CP1252[cp]);
  if (cp > 0x10ffff) return REPLACEMENT;
  if (cp >= 0xd800 && cp <= 0xdfff) return REPLACEMENT; // lone surrogate
  return String.fromCodePoint(cp);
}

export type DecodeOptions = {
  /**
   * Resolve a named reference that is missing its semicolon, longest match
   * first. A real parser does this only for a legacy subset; doing it for the
   * whole table is more aggressive, so it is off by default.
   */
  lenient?: boolean;
};

export function decodeEntities(text: string, options: DecodeOptions = {}): string {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const amp = text.indexOf('&', i);
    if (amp === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, amp);

    if (text[amp + 1] === '#') {
      const hex = text[amp + 2] === 'x' || text[amp + 2] === 'X';
      const start = amp + (hex ? 3 : 2);
      const pattern = hex ? /^[0-9a-fA-F]+/ : /^[0-9]+/;
      const digits = pattern.exec(text.slice(start, start + 10))?.[0];
      if (digits) {
        const end = start + digits.length;
        const closed = text[end] === ';';
        if (closed || options.lenient) {
          out += charFromCodePoint(Number.parseInt(digits, hex ? 16 : 10));
          i = end + (closed ? 1 : 0);
          continue;
        }
      }
      out += '&';
      i = amp + 1;
      continue;
    }

    const name = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(amp + 1, amp + 1 + LONGEST_NAME))?.[0];
    if (name) {
      if (text[amp + 1 + name.length] === ';' && name in NAMED_CP) {
        out += String.fromCodePoint(NAMED_CP[name]);
        i = amp + name.length + 2;
        continue;
      }
      if (options.lenient) {
        // Longest match wins: `&notin` is U+2209, not `¬in`.
        for (let len = name.length; len >= 2; len -= 1) {
          const candidate = name.slice(0, len);
          if (candidate in NAMED_CP) {
            out += String.fromCodePoint(NAMED_CP[candidate]);
            i = amp + 1 + len;
            break;
          }
        }
        if (i > amp) continue;
      }
    }

    out += '&';
    i = amp + 1;
  }

  return out;
}

export type Inspection = {
  named: number;
  numeric: number;
  /** References that look like names but are not in the table. */
  unknown: string[];
  /** Named references written without a closing semicolon. */
  missingSemicolon: number;
  /** Numeric references in 0x80–0x9F, which get the Windows-1252 treatment. */
  cp1252: number;
};

/**
 * Counts what is in the input without changing it.
 *
 * The useful failure this surfaces is an unknown name: `&rsquo;` works,
 * `&rsquot;` silently stays as literal text and shows up in production as a
 * stray ampersand followed by six letters.
 */
export function inspectEntities(text: string): Inspection {
  let named = 0;
  let numeric = 0;
  let missingSemicolon = 0;
  let cp1252 = 0;
  const unknown = new Set<string>();

  const pattern = /&(#[xX]?[0-9a-fA-F]+;?|[A-Za-z][A-Za-z0-9]*;?)/g;
  for (const match of text.matchAll(pattern)) {
    const body = match[1];
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const digits = body.replace(/^#[xX]?/, '').replace(/;$/, '');
      const cp = Number.parseInt(digits, hex ? 16 : 10);
      if (Number.isNaN(cp)) continue;
      numeric += 1;
      if (cp >= 0x80 && cp <= 0x9f) cp1252 += 1;
      if (!body.endsWith(';')) missingSemicolon += 1;
      continue;
    }
    const name = body.replace(/;$/, '');
    if (name in NAMED_CP) {
      named += 1;
      if (!body.endsWith(';')) missingSemicolon += 1;
    } else if (body.endsWith(';')) {
      unknown.add(`&${body}`);
    }
  }

  return { named, numeric, unknown: [...unknown], missingSemicolon, cp1252 };
}

/** Rows for the reference table in the UI. */
export function entityRows(): { name: string; cp: number; char: string }[] {
  return Object.entries(NAMED_CP)
    .map(([name, cp]) => ({ name, cp, char: String.fromCodePoint(cp) }))
    .sort((a, b) => a.cp - b.cp || a.name.localeCompare(b.name));
}
