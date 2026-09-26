/**
 * A hand-written expression evaluator: tokeniser, precedence-climbing parser,
 * tree walker. No `eval`, no `new Function`.
 *
 * The reason is not paranoia about this page in particular. `eval` on a string
 * a person typed gives that string the full authority of the page — reading
 * storage, reaching the network, rewriting the DOM — and the failure is silent
 * because a calculator built on it works perfectly for every expression anyone
 * tries by accident. A parser can only produce numbers, because numbers are
 * the only thing its grammar can express.
 *
 * Writing it out also buys the things `eval` cannot give: an error with a
 * character position instead of "Unexpected token", `^` as exponentiation
 * rather than xor, a degree mode, and a hard ceiling on recursion depth so a
 * pathological paste cannot exhaust the stack.
 */

export type AngleMode = 'rad' | 'deg';

/** Characters accepted in one expression. Longer input is a paste accident. */
export const MAX_EXPRESSION = 4000;

/** Nesting depth. Deep enough for real algebra, shallow enough to not overflow. */
export const MAX_DEPTH = 128;

/** Statements one run may contain. */
export const MAX_LINES = 200;

/** 170! is 7.26e306; 171! overflows a double, so it is refused rather than ∞. */
export const MAX_FACTORIAL = 170;

export class CalcError extends Error {
  /** Character offset the problem was found at, or -1 when it has no place. */
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'CalcError';
    this.pos = pos;
  }
}

/* ── Tokeniser ─────────────────────────────── */

export type TokenKind = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';
export type Token = { kind: TokenKind; text: string; value: number; pos: number };

/** `×`, `÷`, `−` and the full-width forms are normalised away before this. */
const OPERATORS = ['**', '+', '-', '*', '/', '%', '^', '=', '!'];

/** Full-width and typographic variants people paste from documents. */
const NORMALISE: Record<string, string> = {
  '　': ' ',
  '（': '(',
  '）': ')',
  '，': ',',
  '＋': '+',
  '－': '-',
  '−': '-',
  '×': '*',
  '·': '*',
  '＊': '*',
  '÷': '/',
  '／': '/',
  '＝': '=',
  '％': '%',
  '＾': '^',
  '！': '!',
  '。': '.',
  '．': '.',
};

function normalise(source: string): string {
  let out = '';
  for (const character of source) {
    if (character >= '０' && character <= '９') {
      out += String(character.charCodeAt(0) - 0xff10);
    } else {
      out += NORMALISE[character] ?? character;
    }
  }
  return out;
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_α-ωΑ-Ω]/.test(c);
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

/**
 * Splits an expression into tokens.
 *
 * Numbers accept the three prefixed bases (`0x`, `0b`, `0o`), underscores as
 * digit separators, and an exponent — but the exponent is only consumed when
 * digits actually follow, so `2e` is two-times-Euler's-number rather than a
 * malformed literal.
 */
export function tokenize(source: string): Token[] {
  if (source.length > MAX_EXPRESSION) {
    throw new CalcError(`expression longer than ${MAX_EXPRESSION} characters`, MAX_EXPRESSION);
  }
  const text = normalise(source);
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
      continue;
    }

    if (c === '#') {
      // Comment to end of line: a worked calculation wants annotations.
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }

    if (c === '\n') {
      throw new CalcError('a newline cannot appear inside one expression', i);
    }

    if (c === '(') {
      tokens.push({ kind: 'lparen', text: '(', value: 0, pos: i });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', text: ')', value: 0, pos: i });
      i += 1;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', text: ',', value: 0, pos: i });
      i += 1;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(text[i + 1] ?? ''))) {
      const start = i;

      // Prefixed bases. Parsed with BigInt-free arithmetic because the result
      // has to land in a double anyway.
      const two = text.slice(i, i + 2).toLowerCase();
      const base = two === '0x' ? 16 : two === '0b' ? 2 : two === '0o' ? 8 : 0;
      if (base !== 0) {
        i += 2;
        let digits = '';
        while (i < text.length && /[0-9a-zA-Z_]/.test(text[i])) {
          if (text[i] !== '_') digits += text[i];
          i += 1;
        }
        if (digits === '') throw new CalcError(`"${two}" needs digits after it`, start);
        // parseInt stops at the first digit it does not recognise and returns
        // what it read so far, so the literal is validated before parsing —
        // otherwise 0b102 would quietly evaluate to 2.
        const legal = base === 16 ? /^[0-9a-fA-F]+$/ : base === 8 ? /^[0-7]+$/ : /^[01]+$/;
        if (!legal.test(digits)) {
          throw new CalcError(`"${two}${digits}" is not a base-${base} number`, start);
        }
        tokens.push({
          kind: 'num',
          text: text.slice(start, i),
          value: Number.parseInt(digits, base),
          pos: start,
        });
        continue;
      }

      let body = '';
      while (i < text.length && (isDigit(text[i]) || text[i] === '_')) {
        if (text[i] !== '_') body += text[i];
        i += 1;
      }
      if (text[i] === '.') {
        body += '.';
        i += 1;
        while (i < text.length && (isDigit(text[i]) || text[i] === '_')) {
          if (text[i] !== '_') body += text[i];
          i += 1;
        }
      }
      // Exponent, only when digits follow — otherwise `e` is the constant.
      if (text[i] === 'e' || text[i] === 'E') {
        const sign = text[i + 1] === '+' || text[i + 1] === '-' ? 1 : 0;
        if (isDigit(text[i + 1 + sign] ?? '')) {
          body += 'e';
          i += 1;
          if (sign) {
            body += text[i];
            i += 1;
          }
          while (i < text.length && isDigit(text[i])) {
            body += text[i];
            i += 1;
          }
        }
      }
      tokens.push({ kind: 'num', text: text.slice(start, i), value: Number(body), pos: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < text.length && isIdentPart(text[i])) i += 1;
      tokens.push({ kind: 'ident', text: text.slice(start, i), value: 0, pos: start });
      continue;
    }

    const two = text.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      tokens.push({ kind: 'op', text: two, value: 0, pos: i });
      i += 2;
      continue;
    }
    if (OPERATORS.includes(c)) {
      tokens.push({ kind: 'op', text: c, value: 0, pos: i });
      i += 1;
      continue;
    }

    throw new CalcError(`"${c}" is not something this calculator understands`, i);
  }

  tokens.push({ kind: 'eof', text: '', value: 0, pos: text.length });
  return tokens;
}

/* ── Names ─────────────────────────────────── */

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  tau: Math.PI * 2,
  τ: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  φ: (1 + Math.sqrt(5)) / 2,
  inf: Number.POSITIVE_INFINITY,
};

export type FunctionDef = {
  /** Fixed argument count, or -1 for variadic (min one argument). */
  arity: number;
  apply: (args: number[], angle: AngleMode) => number;
  /** One line of help, shown in the reference panel. */
  zh: string;
  en: string;
};

const toRadians = (value: number, angle: AngleMode) =>
  angle === 'deg' ? (value * Math.PI) / 180 : value;
const fromRadians = (value: number, angle: AngleMode) =>
  angle === 'deg' ? (value * 180) / Math.PI : value;

function requireInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new CalcError(`${name} needs whole numbers, got ${value}`, -1);
  }
  return value;
}

function gcd2(a: number, b: number): number {
  let x = Math.abs(requireInteger(a, 'gcd'));
  let y = Math.abs(requireInteger(b, 'gcd'));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new CalcError('factorial is only defined on whole numbers from 0 up', -1);
  }
  if (n > MAX_FACTORIAL) {
    throw new CalcError(`${n}! is larger than a double can hold (limit ${MAX_FACTORIAL}!)`, -1);
  }
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

export const FUNCTIONS: Record<string, FunctionDef> = {
  sqrt: { arity: 1, apply: ([x]) => Math.sqrt(x), zh: '平方根', en: 'square root' },
  cbrt: { arity: 1, apply: ([x]) => Math.cbrt(x), zh: '立方根', en: 'cube root' },
  abs: { arity: 1, apply: ([x]) => Math.abs(x), zh: '絕對值', en: 'absolute value' },
  sign: { arity: 1, apply: ([x]) => Math.sign(x), zh: '正負號', en: 'sign' },
  floor: { arity: 1, apply: ([x]) => Math.floor(x), zh: '向下取整', en: 'round down' },
  ceil: { arity: 1, apply: ([x]) => Math.ceil(x), zh: '向上取整', en: 'round up' },
  trunc: { arity: 1, apply: ([x]) => Math.trunc(x), zh: '去掉小數', en: 'drop the fraction' },
  round: {
    arity: -1,
    apply: (args) => {
      const [x, places = 0] = args;
      if (args.length > 2) throw new CalcError('round takes one or two arguments', -1);
      const scale = 10 ** requireInteger(places, 'round');
      return Math.round(x * scale) / scale;
    },
    zh: '四捨五入,第二個參數是小數位',
    en: 'round, optional decimal places',
  },
  exp: { arity: 1, apply: ([x]) => Math.exp(x), zh: 'e 的次方', en: 'e to the power' },
  ln: { arity: 1, apply: ([x]) => Math.log(x), zh: '自然對數', en: 'natural log' },
  log: {
    arity: -1,
    apply: (args) => {
      if (args.length === 1) return Math.log10(args[0]);
      if (args.length === 2) return Math.log(args[1]) / Math.log(args[0]);
      throw new CalcError('log takes log(x) for base 10 or log(base, x)', -1);
    },
    zh: 'log(x) 是常用對數,log(底, x) 指定底',
    en: 'log(x) base 10, or log(base, x)',
  },
  log2: { arity: 1, apply: ([x]) => Math.log2(x), zh: '二為底的對數', en: 'log base 2' },
  sin: { arity: 1, apply: ([x], a) => Math.sin(toRadians(x, a)), zh: '正弦', en: 'sine' },
  cos: { arity: 1, apply: ([x], a) => Math.cos(toRadians(x, a)), zh: '餘弦', en: 'cosine' },
  tan: { arity: 1, apply: ([x], a) => Math.tan(toRadians(x, a)), zh: '正切', en: 'tangent' },
  asin: { arity: 1, apply: ([x], a) => fromRadians(Math.asin(x), a), zh: '反正弦', en: 'arcsine' },
  acos: { arity: 1, apply: ([x], a) => fromRadians(Math.acos(x), a), zh: '反餘弦', en: 'arccosine' },
  atan: { arity: 1, apply: ([x], a) => fromRadians(Math.atan(x), a), zh: '反正切', en: 'arctangent' },
  atan2: {
    arity: 2,
    apply: ([y, x], a) => fromRadians(Math.atan2(y, x), a),
    zh: 'atan2(y, x),回傳象限正確的角度',
    en: 'atan2(y, x), quadrant-correct angle',
  },
  sinh: { arity: 1, apply: ([x]) => Math.sinh(x), zh: '雙曲正弦', en: 'hyperbolic sine' },
  cosh: { arity: 1, apply: ([x]) => Math.cosh(x), zh: '雙曲餘弦', en: 'hyperbolic cosine' },
  tanh: { arity: 1, apply: ([x]) => Math.tanh(x), zh: '雙曲正切', en: 'hyperbolic tangent' },
  hypot: {
    arity: -1,
    apply: (args) => Math.hypot(...args),
    zh: '直角三角形斜邊,可給多個邊',
    en: 'hypotenuse of any number of legs',
  },
  min: { arity: -1, apply: (args) => Math.min(...args), zh: '最小值', en: 'minimum' },
  max: { arity: -1, apply: (args) => Math.max(...args), zh: '最大值', en: 'maximum' },
  sum: { arity: -1, apply: (args) => args.reduce((a, b) => a + b, 0), zh: '加總', en: 'sum' },
  avg: {
    arity: -1,
    apply: (args) => args.reduce((a, b) => a + b, 0) / args.length,
    zh: '平均',
    en: 'mean',
  },
  pow: { arity: 2, apply: ([a, b]) => a ** b, zh: 'pow(底, 次方)', en: 'pow(base, exponent)' },
  mod: {
    arity: 2,
    apply: ([a, b]) => a - b * Math.floor(a / b),
    zh: '取模,結果跟除數同號(與 % 不同)',
    en: 'modulo, sign follows the divisor (unlike %)',
  },
  gcd: {
    arity: -1,
    apply: (args) => args.reduce((a, b) => gcd2(a, b)),
    zh: '最大公因數',
    en: 'greatest common divisor',
  },
  lcm: {
    arity: -1,
    apply: (args) =>
      args.reduce((a, b) => {
        const g = gcd2(a, b);
        return g === 0 ? 0 : Math.abs(a / g * b);
      }),
    zh: '最小公倍數',
    en: 'least common multiple',
  },
  fact: { arity: 1, apply: ([x]) => factorial(x), zh: '階乘,也可以寫 5!', en: 'factorial, also 5!' },
  deg: {
    arity: 1,
    apply: ([x]) => (x * 180) / Math.PI,
    zh: '弧度轉角度',
    en: 'radians to degrees',
  },
  rad: {
    arity: 1,
    apply: ([x]) => (x * Math.PI) / 180,
    zh: '角度轉弧度',
    en: 'degrees to radians',
  },
};

/* ── Parser ────────────────────────────────── */

export type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string; pos: number }
  | { type: 'unary'; op: '-' | '+'; arg: Node }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[]; pos: number }
  | { type: 'fact'; arg: Node; pos: number }
  | { type: 'assign'; name: string; value: Node; pos: number };

/** Binary precedence. `^` is right-associative; the rest bind left. */
const BINARY: Record<string, { precedence: number; right: boolean }> = {
  '+': { precedence: 1, right: false },
  '-': { precedence: 1, right: false },
  '*': { precedence: 2, right: false },
  '/': { precedence: 2, right: false },
  '%': { precedence: 2, right: false },
  '^': { precedence: 4, right: true },
};

/** Unary minus sits below `^`, so -2^2 is -(2^2) — the mathematical reading. */
const UNARY_PRECEDENCE = 3;

/**
 * Precedence climbing over the token list.
 *
 * Implicit multiplication is accepted in exactly the places where it cannot be
 * ambiguous: after a number or a closing parenthesis, when the next token opens
 * a group or names something. `2pi`, `3(4+5)` and `(1+2)(3+4)` all work; `x y`
 * does too, and is the one case worth knowing about, because it means a typo
 * between two variables reads as a product rather than an error.
 */
export function parse(source: string): Node {
  const tokens = tokenize(source);
  let index = 0;
  let depth = 0;

  const peek = () => tokens[index];
  const next = () => tokens[index++];

  const expect = (kind: TokenKind, what: string): Token => {
    const token = peek();
    if (token.kind !== kind) throw new CalcError(`expected ${what}`, token.pos);
    return next();
  };

  function parsePrimary(): Node {
    const token = peek();

    if (token.kind === 'num') {
      next();
      return { type: 'num', value: token.value };
    }

    if (token.kind === 'lparen') {
      next();
      const inner = parseExpression(0);
      expect('rparen', 'a closing parenthesis');
      return inner;
    }

    if (token.kind === 'ident') {
      next();
      if (peek().kind === 'lparen') {
        next();
        const args: Node[] = [];
        if (peek().kind !== 'rparen') {
          for (;;) {
            args.push(parseExpression(0));
            if (peek().kind === 'comma') {
              next();
              continue;
            }
            break;
          }
        }
        expect('rparen', 'a closing parenthesis');
        return { type: 'call', name: token.text, args, pos: token.pos };
      }
      return { type: 'var', name: token.text, pos: token.pos };
    }

    if (token.kind === 'op' && (token.text === '-' || token.text === '+')) {
      next();
      return { type: 'unary', op: token.text, arg: parseExpression(UNARY_PRECEDENCE) };
    }

    if (token.kind === 'eof') throw new CalcError('the expression ends too soon', token.pos);
    throw new CalcError(`"${token.text}" cannot start a value`, token.pos);
  }

  function parsePostfix(node: Node): Node {
    let out = node;
    while (peek().kind === 'op' && peek().text === '!') {
      const token = next();
      out = { type: 'fact', arg: out, pos: token.pos };
    }
    return out;
  }

  function climb(minPrecedence: number): Node {
    let left = parsePostfix(parsePrimary());

    for (;;) {
      const token = peek();

      // Implicit multiplication, allowed only where it cannot be a missing
      // operator: the next token opens a group or names something. A number
      // directly after a number (`2 3`) is a typo, so it stays an error.
      if (
        (token.kind === 'ident' || token.kind === 'lparen') &&
        BINARY['*'].precedence >= minPrecedence
      ) {
        const right = parseExpression(BINARY['*'].precedence + 1);
        left = { type: 'binary', op: '*', left, right };
        continue;
      }

      if (token.kind !== 'op') break;
      const text = token.text === '**' ? '^' : token.text;
      const rule = BINARY[text];
      if (!rule || rule.precedence < minPrecedence) break;

      next();
      const right = parseExpression(rule.right ? rule.precedence : rule.precedence + 1);
      left = { type: 'binary', op: text as '+' | '-' | '*' | '/' | '%' | '^', left, right };
      left = parsePostfix(left);
    }

    return left;
  }

  /**
   * Depth is counted here rather than at parentheses because parentheses are
   * not the only way to nest: `----1` and `2^2^2^2` recurse just as deep, and
   * 4 000 leading minus signs would exhaust the stack — which in a browser is
   * a dead tab, not an exception.
   */
  function parseExpression(minPrecedence: number): Node {
    depth += 1;
    if (depth > MAX_DEPTH) {
      throw new CalcError(`nested deeper than ${MAX_DEPTH} levels`, peek().pos);
    }
    const node = climb(minPrecedence);
    depth -= 1;
    return node;
  }

  function parseStatement(): Node {
    // An assignment is `name = expression`, found by lookahead so that a bare
    // `=` anywhere else stays an error instead of being quietly ignored.
    const after = tokens[index + 1];
    if (peek().kind === 'ident' && after?.kind === 'op' && after.text === '=') {
      const name = next();
      next();
      return { type: 'assign', name: name.text, value: parseExpression(0), pos: name.pos };
    }
    return parseExpression(0);
  }

  const node = parseStatement();
  const trailing = peek();
  if (trailing.kind !== 'eof') {
    throw new CalcError(`"${trailing.text}" is left over at the end`, trailing.pos);
  }
  return node;
}

/* ── Evaluation ────────────────────────────── */

export type Env = Record<string, number>;

const RESERVED = new Set([...Object.keys(CONSTANTS), ...Object.keys(FUNCTIONS), 'ans']);

export function evaluate(node: Node, env: Env, angle: AngleMode = 'rad'): number {
  switch (node.type) {
    case 'num':
      return node.value;

    case 'var': {
      if (node.name in env) return env[node.name];
      const constant = CONSTANTS[node.name];
      if (constant !== undefined) return constant;
      if (FUNCTIONS[node.name]) {
        throw new CalcError(`${node.name} is a function — write ${node.name}(…)`, node.pos);
      }
      throw new CalcError(`${node.name} has no value yet`, node.pos);
    }

    case 'unary': {
      const value = evaluate(node.arg, env, angle);
      return node.op === '-' ? -value : value;
    }

    case 'binary': {
      const left = evaluate(node.left, env, angle);
      const right = evaluate(node.right, env, angle);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '^':
          return left ** right;
      }
      // No default: the switch covers every operator the parser can build, and
      // TypeScript narrows `node.op` to never here — adding one without a case
      // is a compile error rather than a silent zero.
    }

    case 'fact':
      return factorial(evaluate(node.arg, env, angle));

    case 'call': {
      const def = FUNCTIONS[node.name];
      if (!def) {
        throw new CalcError(`there is no function called ${node.name}`, node.pos);
      }
      const args = node.args.map((argument) => evaluate(argument, env, angle));
      if (def.arity === -1) {
        if (args.length === 0) {
          throw new CalcError(`${node.name} needs at least one argument`, node.pos);
        }
      } else if (args.length !== def.arity) {
        throw new CalcError(
          `${node.name} takes ${def.arity} argument${def.arity === 1 ? '' : 's'}, got ${args.length}`,
          node.pos
        );
      }
      try {
        return def.apply(args, angle);
      } catch (problem) {
        if (problem instanceof CalcError && problem.pos === -1) {
          throw new CalcError(problem.message, node.pos);
        }
        throw problem;
      }
    }

    case 'assign': {
      if (RESERVED.has(node.name)) {
        throw new CalcError(`${node.name} is built in and cannot be reassigned`, node.pos);
      }
      const value = evaluate(node.value, env, angle);
      env[node.name] = value;
      return value;
    }
  }
}

export type Line = {
  /** Source as typed, trimmed. */
  source: string;
  /** Result, or NaN when the line failed. */
  value: number;
  /** Variable assigned by this line, if any. */
  assigned?: string;
  error?: CalcError;
};

export type RunResult = {
  lines: Line[];
  env: Env;
  /** Value of the last line that produced one. */
  value: number;
};

/**
 * Evaluates a sheet of expressions, one per line.
 *
 * `ans` holds the previous line's value, so a calculation can be built up in
 * steps the way it is on paper. A line that fails is reported in place and the
 * rest still run: losing everything below a typo is the behaviour that makes
 * people stop using a multi-line calculator.
 */
export function run(source: string, angle: AngleMode = 'rad', seed: Env = {}): RunResult {
  const env: Env = { ...seed };
  const lines: Line[] = [];
  let last = Number.NaN;

  const raw = source.split('\n');
  if (raw.length > MAX_LINES) {
    throw new CalcError(`more than ${MAX_LINES} lines`, -1);
  }

  for (const text of raw) {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    try {
      const node = parse(trimmed);
      const value = evaluate(node, env, angle);
      env.ans = value;
      last = value;
      lines.push({
        source: trimmed,
        value,
        assigned: node.type === 'assign' ? node.name : undefined,
      });
    } catch (problem) {
      const error =
        problem instanceof CalcError ? problem : new CalcError(String(problem), -1);
      lines.push({ source: trimmed, value: Number.NaN, error });
    }
  }

  return { lines, env, value: last };
}

/**
 * Result formatting.
 *
 * Fifteen significant digits, because that is where a double stops being
 * trustworthy: printing the sixteenth and seventeenth turns 0.1 + 0.2 into
 * 0.30000000000000004 and makes the calculator look broken while being right.
 * Integers below 2^53 print in full, with grouping.
 */
export function formatResult(value: number, group = true): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '∞';
  if (value === Number.NEGATIVE_INFINITY) return '-∞';
  if (Number.isInteger(value) && Math.abs(value) < 2 ** 53) {
    return group ? value.toLocaleString('en-US') : String(value);
  }

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return value.toExponential(9);

  let text = value.toPrecision(15);
  if (text.includes('e')) return value.toExponential(9);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  if (!group) return text;

  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [whole, fraction] = body.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

/** Hex / binary views of an integer result, for the dev-shaped use of this. */
export function integerViews(value: number): { hex: string; bin: string; oct: string } | null {
  if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  return {
    hex: `${sign}0x${magnitude.toString(16)}`,
    bin: `${sign}0b${magnitude.toString(2)}`,
    oct: `${sign}0o${magnitude.toString(8)}`,
  };
}
