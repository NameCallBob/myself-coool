/**
 * SVG optimisation, done by parsing the file rather than by running regexes
 * over it.
 *
 * The reason for a real parser is that every interesting rule here is
 * structural. "Delete empty groups" needs to know what a group's children are
 * after the comments inside it are gone. "Delete redundant attributes" is only
 * true if no ancestor sets that property to something else, because the
 * presentation attributes involved are inherited. "Round the path numbers"
 * needs the path grammar, since the arc flags are single characters and the
 * commands repeat implicitly — a regex that rounds every number it sees will
 * happily turn `a1 1 0 0 1 5 5` into something that draws a different arc.
 *
 * Nothing here decodes entities or re-escapes text: every text node and
 * attribute value is carried through exactly as it was written, so the only
 * bytes that change are the ones a pass deliberately changed. What the tool
 * will not do is guess. Anything that could change what the file draws is
 * either left alone or put behind a switch with the risk written next to it.
 */

/* ── Tree ─────────────────────────────────── */

export type Quote = '"' | "'";
/**
 * `value` is the raw source text between the quotes: entities intact.
 * `pre` is the whitespace that stood in front of the name, kept so that a run
 * with every switch off returns the file unchanged, and collapsed to a single
 * space by the indentation pass — an editor that writes one attribute per line
 * is spending bytes on a layout nobody reads.
 */
export type Attr = { name: string; value: string; quote: Quote; pre: string };

export type ElementNode = {
  kind: 'element';
  name: string;
  attrs: Attr[];
  children: XmlNode[];
};

export type XmlNode =
  | ElementNode
  | { kind: 'text'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'cdata'; value: string }
  /** `<?xml version="1.0"?>` — value is everything between `<?` and `?>`. */
  | { kind: 'pi'; value: string }
  /** `<!DOCTYPE …>` — value is everything between `<!` and the closing `>`. */
  | { kind: 'doctype'; value: string };

export type XmlDoc = { children: XmlNode[] };

/* ── Limits ───────────────────────────────── */

/** 2 MB of markup. Past this the tab stops being a tool and starts being a
 *  hang, and an SVG that big is a bitmap someone traced by accident. */
export const MAX_SOURCE = 2_000_000;
export const MAX_NODES = 60_000;
/** The serialiser recurses, so nesting is capped well below the stack. */
export const MAX_DEPTH = 256;

/* ── Failure ──────────────────────────────── */

export type FailCode =
  | 'empty'
  | 'too-large'
  | 'too-many-nodes'
  | 'too-deep'
  | 'bad-tag'
  | 'stray-close'
  | 'mismatched-tag'
  | 'unclosed-tag'
  | 'unterminated'
  | 'bad-path';

/** 1-based line and column of an offset, for pointing at the problem. */
export function locate(source: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

export class SvgSyntaxError extends Error {
  /** Declared and assigned separately: Node's type-stripping test runner
   *  rejects TypeScript parameter properties. */
  readonly code: FailCode;
  readonly detail: string;
  readonly line: number;
  readonly column: number;

  constructor(code: FailCode, detail: string, source: string, offset: number) {
    const at = locate(source, offset);
    super(`${code}${detail ? ` (${detail})` : ''} at line ${at.line}, column ${at.column}`);
    this.name = 'SvgSyntaxError';
    this.code = code;
    this.detail = detail;
    this.line = at.line;
    this.column = at.column;
  }
}

/* ── Parser ───────────────────────────────── */

// Sticky regexes, so scanning a 2 MB document never slices it.
const NAME = /[^\s/>=<'"]+/y;
const WS = /\s*/y;
const DQ = /"([^"]*)"/y;
const SQ = /'([^']*)'/y;
const BARE = /[^\s>]+/y;

function skipWs(source: string, at: number): number {
  WS.lastIndex = at;
  WS.exec(source);
  return WS.lastIndex;
}

function readName(source: string, at: number): string | null {
  NAME.lastIndex = at;
  const m = NAME.exec(source);
  return m === null || m[0] === '' ? null : m[0];
}

/**
 * Parses XML well enough for SVG: elements, attributes, text, comments, CDATA,
 * processing instructions and the doctype. Strict about tag nesting, because a
 * mismatched tag is the one error where guessing produces a file that looks
 * fine and draws wrong.
 */
export function parseXml(source: string): XmlDoc {
  if (source.length > MAX_SOURCE) {
    throw new SvgSyntaxError('too-large', String(source.length), source, 0);
  }

  const root: XmlNode[] = [];
  const stack: ElementNode[] = [];
  let nodes = 0;
  let i = 0;

  const push = (node: XmlNode, at: number) => {
    nodes += 1;
    if (nodes > MAX_NODES) throw new SvgSyntaxError('too-many-nodes', String(nodes), source, at);
    const parent = stack.length === 0 ? root : stack[stack.length - 1].children;
    parent.push(node);
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      push({ kind: 'text', value: source.slice(i) }, i);
      break;
    }
    if (lt > i) push({ kind: 'text', value: source.slice(i, lt) }, i);

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end < 0) throw new SvgSyntaxError('unterminated', '<!--', source, lt);
      push({ kind: 'comment', value: source.slice(lt + 4, end) }, lt);
      i = end + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end < 0) throw new SvgSyntaxError('unterminated', '<![CDATA[', source, lt);
      push({ kind: 'cdata', value: source.slice(lt + 9, end) }, lt);
      i = end + 3;
      continue;
    }

    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      if (end < 0) throw new SvgSyntaxError('unterminated', '<?', source, lt);
      push({ kind: 'pi', value: source.slice(lt + 2, end) }, lt);
      i = end + 2;
      continue;
    }

    if (source.startsWith('<!', lt)) {
      // The internal subset is bracketed and may contain '>' characters.
      let j = lt + 2;
      let depth = 0;
      while (j < source.length) {
        const c = source[j];
        if (c === '[') depth += 1;
        else if (c === ']') depth -= 1;
        else if (c === '>' && depth <= 0) break;
        j += 1;
      }
      if (j >= source.length) throw new SvgSyntaxError('unterminated', '<!', source, lt);
      push({ kind: 'doctype', value: source.slice(lt + 2, j) }, lt);
      i = j + 1;
      continue;
    }

    if (source.startsWith('</', lt)) {
      const name = readName(source, lt + 2);
      if (name === null) throw new SvgSyntaxError('bad-tag', '</', source, lt);
      let j = skipWs(source, lt + 2 + name.length);
      if (source[j] !== '>') throw new SvgSyntaxError('bad-tag', `</${name}`, source, j);
      j += 1;
      const open = stack.pop();
      if (open === undefined) throw new SvgSyntaxError('stray-close', name, source, lt);
      if (open.name !== name) {
        throw new SvgSyntaxError('mismatched-tag', `</${name}> ≠ <${open.name}>`, source, lt);
      }
      i = j;
      continue;
    }

    const tag = parseTag(source, lt);
    push(tag.node, lt);
    if (!tag.selfClosed) {
      if (stack.length + 1 > MAX_DEPTH) {
        throw new SvgSyntaxError('too-deep', String(stack.length + 1), source, lt);
      }
      stack.push(tag.node);
    }
    i = tag.end;
  }

  if (stack.length > 0) {
    throw new SvgSyntaxError('unclosed-tag', stack[stack.length - 1].name, source, source.length);
  }
  return { children: root };
}

function parseTag(
  source: string,
  start: number
): { node: ElementNode; selfClosed: boolean; end: number } {
  const name = readName(source, start + 1);
  if (name === null) throw new SvgSyntaxError('bad-tag', '<', source, start);
  const node: ElementNode = { kind: 'element', name, attrs: [], children: [] };
  let i = start + 1 + name.length;

  for (;;) {
    const gap = i;
    i = skipWs(source, i);
    // XML requires whitespace here; if a file omits it, one space goes back in.
    const pre = i > gap ? source.slice(gap, i) : ' ';
    if (i >= source.length) throw new SvgSyntaxError('unterminated', `<${name}`, source, start);

    const c = source[i];
    if (c === '>') return { node, selfClosed: false, end: i + 1 };
    if (c === '/') {
      if (source[i + 1] !== '>') throw new SvgSyntaxError('bad-tag', name, source, i);
      return { node, selfClosed: true, end: i + 2 };
    }

    const attr = readName(source, i);
    if (attr === null) throw new SvgSyntaxError('bad-tag', name, source, i);
    i = skipWs(source, i + attr.length);

    if (source[i] !== '=') {
      // XML requires a value. Keep the attribute as empty rather than drop it.
      node.attrs.push({ name: attr, value: '', quote: '"', pre });
      continue;
    }
    i = skipWs(source, i + 1);

    const quote = source[i];
    if (quote === '"' || quote === "'") {
      const re = quote === '"' ? DQ : SQ;
      re.lastIndex = i;
      const m = re.exec(source);
      if (m === null) throw new SvgSyntaxError('unterminated', attr, source, i);
      node.attrs.push({ name: attr, value: m[1], quote, pre });
      i = re.lastIndex;
      continue;
    }

    BARE.lastIndex = i;
    const bare = BARE.exec(source);
    if (bare === null) throw new SvgSyntaxError('bad-tag', attr, source, i);
    // An unquoted value runs to whitespace or '>', which swallows the slash of
    // a self-closing tag: `<svg a=b/>` is a="b" and a close, not a="b/".
    const trailingSlash = bare[0].endsWith('/') && source[BARE.lastIndex] === '>';
    const value = trailingSlash ? bare[0].slice(0, -1) : bare[0];
    if (value === '') throw new SvgSyntaxError('bad-tag', attr, source, i);
    node.attrs.push({ name: attr, value, quote: '"', pre });
    i = trailingSlash ? BARE.lastIndex - 1 : BARE.lastIndex;
  }
}

/* ── Serialiser ───────────────────────────── */

function quoted(attr: Attr): string {
  const hasDouble = attr.value.includes('"');
  const hasSingle = attr.value.includes("'");
  if (!hasDouble) return `"${attr.value}"`;
  if (!hasSingle) return `'${attr.value}'`;
  return `"${attr.value.replace(/"/g, '&quot;')}"`;
}

/**
 * Writes the tree back out. Adds no whitespace of its own: what comes out is
 * what the passes left behind, so a byte count means something. The one thing
 * not carried through is a run of whitespace directly before a tag's closing
 * bracket (`<g  >`), which no file depends on.
 */
export function serializeXml(doc: XmlDoc): string {
  const out: string[] = [];

  const write = (node: XmlNode) => {
    if (node.kind === 'text') {
      out.push(node.value);
      return;
    }
    if (node.kind === 'comment') {
      out.push(`<!--${node.value}-->`);
      return;
    }
    if (node.kind === 'cdata') {
      out.push(`<![CDATA[${node.value}]]>`);
      return;
    }
    if (node.kind === 'pi') {
      out.push(`<?${node.value}?>`);
      return;
    }
    if (node.kind === 'doctype') {
      out.push(`<!${node.value}>`);
      return;
    }
    out.push(`<${node.name}`);
    for (const attr of node.attrs) out.push(`${attr.pre}${attr.name}=${quoted(attr)}`);
    if (node.children.length === 0) {
      out.push('/>');
      return;
    }
    out.push('>');
    for (const child of node.children) write(child);
    out.push(`</${node.name}>`);
  };

  for (const node of doc.children) write(node);
  return out.join('');
}

/* ── Numbers ──────────────────────────────── */

/**
 * A number with at most `digits` decimals, trailing zeros trimmed, and the
 * leading zero of `0.5` dropped — `.5` is a valid number in both the attribute
 * and the path grammar, and it is one byte shorter in a file where that number
 * appears a thousand times.
 */
export function roundNumber(value: number, digits: number): string {
  if (!Number.isFinite(value)) throw new RangeError('roundNumber needs a finite number');
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) {
    throw new RangeError('digits must be an integer in 0..8');
  }
  // toFixed switches to exponent notation past 1e21, and coordinates that
  // large have no meaning left to lose.
  if (Math.abs(value) >= 1e15) return String(value);
  let s = value.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace(/^(-?)0\./, '$1.');
}

/** UTF-8 byte length. The file size is bytes, not characters — one CJK glyph
 *  in a `<title>` is three of them. */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.codePointAt(i)!;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else {
      n += 4;
      i += 1;
    }
  }
  return n;
}

/* ── Path data ────────────────────────────── */

export type PathCommand = { command: string; params: number[] };

const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

const SEP = /[\s,]*/y;
const NUM = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/y;
const FLAG = /[01]/y;

function startsNumber(d: string, at: number): boolean {
  const c = d[at];
  if (c === undefined) return false;
  return (c >= '0' && c <= '9') || c === '.' || c === '-' || c === '+';
}

/**
 * Path data to commands. Handles what the grammar actually allows and tools
 * actually emit: implicit repetition (`M0 0 10 10` is a moveto then a lineto,
 * which is why a repeated `M` becomes `L` here), single-character arc flags,
 * and separators that may be commas, whitespace, or nothing at all.
 */
export function parsePath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  let i = 0;

  const skip = () => {
    SEP.lastIndex = i;
    SEP.exec(d);
    i = SEP.lastIndex;
  };

  const readNumber = (): number => {
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (m === null) throw new SvgSyntaxError('bad-path', 'expected a number', d, i);
    i = NUM.lastIndex;
    return Number(m[0]);
  };

  const readFlag = (): number => {
    FLAG.lastIndex = i;
    const m = FLAG.exec(d);
    if (m === null) throw new SvgSyntaxError('bad-path', 'expected a 0 or 1 arc flag', d, i);
    i = FLAG.lastIndex;
    return Number(m[0]);
  };

  skip();
  while (i < d.length) {
    const letter = d[i];
    const lower = letter.toLowerCase();
    const arity = ARITY[lower];
    if (arity === undefined) throw new SvgSyntaxError('bad-path', letter, d, i);
    i += 1;

    if (arity === 0) {
      out.push({ command: letter, params: [] });
      skip();
      continue;
    }

    let first = true;
    for (;;) {
      skip();
      if (!startsNumber(d, i)) {
        if (first) throw new SvgSyntaxError('bad-path', `${letter} without parameters`, d, i);
        break;
      }
      const params: number[] = [];
      for (let k = 0; k < arity; k += 1) {
        if (k > 0) skip();
        params.push(lower === 'a' && (k === 3 || k === 4) ? readFlag() : readNumber());
      }
      // A repeated moveto is a lineto; every other command repeats as itself.
      const command = first ? letter : lower === 'm' ? (letter === 'M' ? 'L' : 'l') : letter;
      out.push({ command, params });
      first = false;
    }
  }

  return out;
}

/**
 * Commands back to path data, with the numbers rounded.
 *
 * Two byte-saving tricks are taken and one is refused. Repeated command
 * letters are dropped, except for moveto (where the implicit repeat means
 * lineto, so dropping the letter would redraw the shape). A space before a
 * negative number is dropped, since the sign is its own separator. The refused
 * one is writing `1.5.5` for `1.5 .5`: it is legal, and lenient parsers in the
 * wild get it wrong, and it saves a byte.
 */
export function serializePath(commands: PathCommand[], digits: number): string {
  let out = '';
  let last = '';
  let previousWasNumber = false;

  for (const cmd of commands) {
    const lower = cmd.command.toLowerCase();
    const repeatable = lower !== 'm' && lower !== 'z';
    if (!(repeatable && cmd.command === last && out !== '')) {
      out += cmd.command;
      last = cmd.command;
      previousWasNumber = false;
    }
    for (let k = 0; k < cmd.params.length; k += 1) {
      const isFlag = lower === 'a' && (k === 3 || k === 4);
      const text = isFlag ? (cmd.params[k] ? '1' : '0') : roundNumber(cmd.params[k], digits);
      if (previousWasNumber && !text.startsWith('-')) out += ' ';
      out += text;
      previousWasNumber = true;
    }
  }

  return out;
}

/* ── Optimiser ────────────────────────────── */

export type WarningCode =
  | 'no-svg-root'
  | 'no-xmlns'
  | 'style-element'
  | 'script-element'
  | 'use-element'
  | 'foreign-object'
  | 'viewbox-needs-size'
  | 'size-needs-viewbox'
  | 'bad-path';

export type Options = {
  /** Drop `<!-- … -->`. */
  comments: boolean;
  /** Drop `<metadata>`, editor-namespaced elements, and prefixed attributes. */
  editorData: boolean;
  /** Drop `<g>`, `<defs>` and `<metadata>` left with no children. */
  emptyContainers: boolean;
  /** Drop presentation attributes that are already the initial value. */
  defaultAttrs: boolean;
  /** Drop whitespace-only text between elements (never inside text content). */
  indentation: boolean;
  /** Drop the `<?xml …?>` declaration and the doctype. */
  prolog: boolean;
  /** Decimals to keep in path data and numeric attributes. null leaves them. */
  digits: number | null;
  /** Add `viewBox="0 0 w h"` when it is missing and width/height allow it. */
  addViewBox: boolean;
  /** Drop width/height so the SVG scales to its container. Needs a viewBox. */
  stripSize: boolean;
  /** Namespace prefixes treated as editor droppings. */
  prefixes: string[];
};

/**
 * Prefixes that carry editor state rather than drawing instructions. `xlink`
 * is deliberately absent: `xlink:href` is how older files reference things,
 * and dropping it breaks `<use>`.
 */
export const EDITOR_PREFIXES = [
  'inkscape',
  'sodipodi',
  'sketch',
  'figma',
  'serif',
  'vectornator',
  'krita',
  'dc',
  'cc',
  'rdf',
  'i',
  'x',
  'graph',
];

/**
 * Presentation attributes whose listed value is the property's initial value,
 * so setting it explicitly changes nothing — provided no ancestor sets the
 * same property, which is checked per element because all of these inherit.
 * Values are from the SVG 1.1 / SVG 2 property tables.
 */
export const DEFAULT_ATTRS: { name: string; value: string }[] = [
  { name: 'opacity', value: '1' },
  { name: 'fill-opacity', value: '1' },
  { name: 'stroke-opacity', value: '1' },
  { name: 'stroke', value: 'none' },
  { name: 'stroke-width', value: '1' },
  { name: 'stroke-linecap', value: 'butt' },
  { name: 'stroke-linejoin', value: 'miter' },
  { name: 'stroke-miterlimit', value: '4' },
  { name: 'stroke-dasharray', value: 'none' },
  { name: 'stroke-dashoffset', value: '0' },
  { name: 'fill-rule', value: 'nonzero' },
  { name: 'clip-rule', value: 'nonzero' },
  { name: 'font-style', value: 'normal' },
  { name: 'font-weight', value: 'normal' },
  { name: 'font-stretch', value: 'normal' },
  { name: 'font-variant', value: 'normal' },
  { name: 'visibility', value: 'visible' },
  { name: 'display', value: 'inline' },
];

export const DEFAULT_OPTIONS: Options = {
  comments: true,
  editorData: true,
  emptyContainers: true,
  defaultAttrs: true,
  indentation: true,
  prolog: true,
  digits: 2,
  addViewBox: true,
  stripSize: false,
  prefixes: EDITOR_PREFIXES,
};

export type Counts = {
  comments: number;
  editorElements: number;
  editorAttrs: number;
  emptyContainers: number;
  defaultAttrs: number;
  whitespace: number;
  prolog: number;
  numericAttrs: number;
  paths: number;
};

export type OptimizeOk = {
  ok: true;
  svg: string;
  before: number;
  after: number;
  elements: number;
  counts: Counts;
  addedViewBox: boolean;
  removedSize: boolean;
  warnings: WarningCode[];
};

export type OptimizeFail = {
  ok: false;
  code: FailCode;
  detail: string;
  line: number;
  column: number;
};

export type Outcome = OptimizeOk | OptimizeFail;

/** Text content where whitespace is content, not indentation. */
const TEXTISH = new Set([
  'text',
  'tspan',
  'textPath',
  'tref',
  'altGlyph',
  'title',
  'desc',
  'style',
  'script',
  'foreignObject',
  'pre',
]);

/** Containers worth deleting when nothing is left inside them. */
const DROPPABLE_WHEN_EMPTY = new Set(['g', 'defs', 'metadata']);

/** Sub-trees a `<use>` can instantiate somewhere else, where the ancestors at
 *  the point of use are not the ancestors in the file. The inherited-value
 *  reasoning behind the default-attribute pass does not hold in here. */
const INDIRECT = new Set(['defs', 'symbol', 'marker', 'pattern', 'clipPath', 'mask']);

/** Attributes holding a single number, optionally with a unit. viewBox is not
 *  in the list on purpose: rounding it rescales everything inside it. */
const NUMERIC_SINGLE = new Set([
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'fr',
  'offset',
  'stroke-width',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'font-size',
  'letter-spacing',
  'word-spacing',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
  'startOffset',
  'textLength',
  'pathLength',
]);

/** Attributes holding a list of numbers: `points` is positions, everything
 *  else here is magnitudes. */
const NUMERIC_LIST = new Set(['points', 'stroke-dasharray']);

/** Attributes holding transform functions: numbers rounded in place, the
 *  function names and brackets left exactly as they are. */
const TRANSFORMS = new Set(['transform', 'gradientTransform', 'patternTransform']);

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
}

function prefixOf(name: string): string | null {
  const colon = name.indexOf(':');
  return colon <= 0 ? null : name.slice(0, colon);
}

function isElement(node: XmlNode): node is ElementNode {
  return node.kind === 'element';
}

function walk(nodes: XmlNode[], visit: (element: ElementNode) => void): void {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    visit(node);
    walk(node.children, visit);
  }
}

const NUMBER_TOKEN = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;
const SINGLE_NUMBER = /^\s*([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)\s*([a-z%]*)\s*$/;

/**
 * Rounds every number inside a value, leaving the rest of the string alone.
 *
 * `keepNonZero` is the difference between a position and a magnitude. Rounding
 * a path coordinate to 0 is fine — 0 is a place. Rounding a stroke width, a
 * dash length or a transform's scale factor to 0 is not: those values switch
 * the thing off. Where a value is a magnitude, a number that would collapse to
 * zero is left exactly as it was written.
 */
function roundTokens(value: string, digits: number, keepNonZero: boolean): string {
  return value.replace(NUMBER_TOKEN, (token) => {
    const n = Number(token);
    if (!Number.isFinite(n)) return token;
    const rounded = roundNumber(n, digits);
    if (keepNonZero && n !== 0 && Number(rounded) === 0) return token;
    return rounded;
  });
}

function roundSingle(value: string, digits: number): string | null {
  const m = SINGLE_NUMBER.exec(value);
  if (m === null) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const rounded = roundNumber(n, digits);
  // Every single-number attribute in the list is a magnitude or a coordinate
  // with a unit; none of them wants to be quietly turned off.
  if (n !== 0 && Number(rounded) === 0) return null;
  return `${rounded}${m[2]}`;
}

function plainSize(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = SINGLE_NUMBER.exec(value);
  if (m === null) return null;
  if (m[2] !== '' && m[2] !== 'px') return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function attrOf(element: ElementNode, name: string): Attr | undefined {
  return element.attrs.find((attr) => attr.name === name);
}

/**
 * One pass over an SVG source, returning the optimised text with the byte
 * counts and a list of what was skipped and why.
 */
export function optimizeSvg(source: string, options: Options): Outcome {
  if (source.trim() === '') {
    return { ok: false, code: 'empty', detail: '', line: 1, column: 1 };
  }

  let doc: XmlDoc;
  try {
    doc = parseXml(source);
  } catch (problem) {
    if (problem instanceof SvgSyntaxError) {
      return {
        ok: false,
        code: problem.code,
        detail: problem.detail,
        line: problem.line,
        column: problem.column,
      };
    }
    throw problem;
  }

  const counts: Counts = {
    comments: 0,
    editorElements: 0,
    editorAttrs: 0,
    emptyContainers: 0,
    defaultAttrs: 0,
    whitespace: 0,
    prolog: 0,
    numericAttrs: 0,
    paths: 0,
  };
  const warnings = new Set<WarningCode>();

  // What is in the file decides which passes are safe to run at all.
  let hasStyle = false;
  let hasUse = false;
  walk(doc.children, (element) => {
    const name = localName(element.name);
    if (name === 'style') hasStyle = true;
    if (name === 'use') hasUse = true;
    if (name === 'script') warnings.add('script-element');
    if (name === 'foreignObject') warnings.add('foreign-object');
  });
  if (hasStyle) warnings.add('style-element');
  if (hasUse) warnings.add('use-element');

  const root = doc.children.find(
    (node): node is ElementNode => isElement(node) && localName(node.name) === 'svg'
  );
  if (root === undefined) warnings.add('no-svg-root');
  else if (attrOf(root, 'xmlns') === undefined) warnings.add('no-xmlns');

  const prefixes = new Set(options.prefixes.map((p) => p.trim()).filter((p) => p !== ''));

  /** One recursive rewrite: the removal passes all decide per node, and the
   *  empty-container test has to run after the children are done. */
  const rewrite = (nodes: XmlNode[], preserveText: boolean, indirect: boolean, ancestors: ElementNode[]): XmlNode[] => {
    const kept: XmlNode[] = [];

    for (const node of nodes) {
      if (node.kind === 'comment') {
        if (options.comments) {
          counts.comments += 1;
          continue;
        }
        kept.push(node);
        continue;
      }

      if (node.kind === 'text') {
        if (options.indentation && !preserveText && node.value.trim() === '') {
          counts.whitespace += 1;
          continue;
        }
        kept.push(node);
        continue;
      }

      if (node.kind === 'pi' || node.kind === 'doctype') {
        const isDeclaration = node.kind === 'doctype' || /^xml\s/i.test(node.value) || /^xml$/i.test(node.value);
        if (options.prolog && isDeclaration) {
          counts.prolog += 1;
          continue;
        }
        kept.push(node);
        continue;
      }

      if (node.kind !== 'element') {
        kept.push(node);
        continue;
      }

      const name = localName(node.name);
      const prefix = prefixOf(node.name);

      if (options.editorData && (name === 'metadata' || (prefix !== null && prefixes.has(prefix)))) {
        counts.editorElements += 1;
        continue;
      }

      if (options.editorData) {
        const before = node.attrs.length;
        node.attrs = node.attrs.filter((attr) => {
          const attrPrefix = prefixOf(attr.name);
          if (attrPrefix !== null && attrPrefix !== 'xmlns' && prefixes.has(attrPrefix)) return false;
          // xmlns:inkscape and friends: the declaration goes with the last user.
          if (attrPrefix === 'xmlns' && prefixes.has(localName(attr.name))) return false;
          return true;
        });
        counts.editorAttrs += before - node.attrs.length;
      }

      if (options.indentation) {
        for (const attr of node.attrs) {
          if (attr.pre !== ' ') attr.pre = ' ';
        }
      }

      const insideIndirect = indirect || INDIRECT.has(name);

      if (options.defaultAttrs && !hasStyle && !hasUse && !insideIndirect) {
        const before = node.attrs.length;
        node.attrs = node.attrs.filter((attr) => {
          const fallback = DEFAULT_ATTRS.find((entry) => entry.name === attr.name);
          if (fallback === undefined) return true;
          if (attr.value.trim() !== fallback.value) return true;
          // Inherited: only redundant when nothing above sets it.
          const shadowed = ancestors.some(
            (ancestor) =>
              ancestor.attrs.some((other) => other.name === attr.name) ||
              ancestor.attrs.some(
                (other) => other.name === 'style' && other.value.includes(`${attr.name}:`)
              )
          );
          return shadowed;
        });
        counts.defaultAttrs += before - node.attrs.length;
      }

      if (options.digits !== null) {
        const digits = options.digits;
        for (const attr of node.attrs) {
          const attrName = attr.name;
          if (attrName === 'd' && name === 'path') {
            try {
              const next = serializePath(parsePath(attr.value), digits);
              if (next !== attr.value) {
                attr.value = next;
                attr.quote = '"';
                counts.paths += 1;
              }
            } catch (problem) {
              if (problem instanceof SvgSyntaxError) warnings.add('bad-path');
              else throw problem;
            }
            continue;
          }
          let next: string | null = null;
          if (NUMERIC_SINGLE.has(attrName)) next = roundSingle(attr.value, digits);
          else if (attrName === 'points') next = roundTokens(attr.value, digits, false);
          else if (NUMERIC_LIST.has(attrName)) next = roundTokens(attr.value, digits, true);
          else if (TRANSFORMS.has(attrName)) {
            // Transforms get three more decimals than the geometry, the way
            // SVGO splits them: a matrix entry is a multiplier, and rounding
            // 1e-5 off a scale factor does not move a shape, it erases it.
            next = roundTokens(attr.value, Math.min(digits + 3, 8), true);
          }
          if (next !== null && next !== attr.value) {
            attr.value = next;
            attr.quote = '"';
            counts.numericAttrs += 1;
          }
        }
      }

      node.children = rewrite(
        node.children,
        preserveText || TEXTISH.has(name),
        insideIndirect,
        [...ancestors, node]
      );

      if (options.emptyContainers && node.children.length === 0 && DROPPABLE_WHEN_EMPTY.has(name)) {
        counts.emptyContainers += 1;
        continue;
      }

      kept.push(node);
    }

    return kept;
  };

  doc.children = rewrite(doc.children, false, false, []);

  let addedViewBox = false;
  let removedSize = false;

  if (root !== undefined) {
    const viewBox = attrOf(root, 'viewBox');
    if (viewBox === undefined && options.addViewBox) {
      const w = plainSize(attrOf(root, 'width')?.value);
      const h = plainSize(attrOf(root, 'height')?.value);
      if (w !== null && h !== null) {
        root.attrs.push({
          name: 'viewBox',
          value: `0 0 ${roundNumber(w, 4)} ${roundNumber(h, 4)}`,
          quote: '"',
          pre: ' ',
        });
        addedViewBox = true;
      } else {
        warnings.add('viewbox-needs-size');
      }
    }
    if (options.stripSize) {
      if (viewBox !== undefined || addedViewBox) {
        const before = root.attrs.length;
        root.attrs = root.attrs.filter((attr) => attr.name !== 'width' && attr.name !== 'height');
        removedSize = root.attrs.length < before;
      } else {
        warnings.add('size-needs-viewbox');
      }
    }
  }

  const svg = serializeXml(doc);
  let elements = 0;
  walk(doc.children, () => {
    elements += 1;
  });

  return {
    ok: true,
    svg,
    before: utf8Bytes(source),
    after: utf8Bytes(svg),
    elements,
    counts,
    addedViewBox,
    removedSize,
    warnings: [...warnings],
  };
}
