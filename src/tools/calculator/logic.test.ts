import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTANTS,
  CalcError,
  FUNCTIONS,
  MAX_DEPTH,
  MAX_EXPRESSION,
  MAX_FACTORIAL,
  MAX_LINES,
  evaluate,
  factorial,
  formatResult,
  integerViews,
  parse,
  run,
  tokenize,
  type Env,
} from './logic.ts';

/** One expression, one number. The workhorse of this file. */
const ev = (source: string, angle: 'rad' | 'deg' = 'rad', env: Env = {}) =>
  evaluate(parse(source), env, angle);

const near = (actual: number, expected: number, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

test('arithmetic follows the usual precedence', () => {
  assert.equal(ev('1+2'), 3);
  assert.equal(ev('2+3*4'), 14);
  assert.equal(ev('(2+3)*4'), 20);
  assert.equal(ev('10-4-3'), 3, 'subtraction is left-associative');
  assert.equal(ev('100/10/2'), 5, 'division is left-associative');
  assert.equal(ev('7%3'), 1);
  assert.equal(ev('-7%3'), -1, '% keeps the sign of the dividend, like JS');
  assert.equal(ev('2*3+4*5'), 26);
});

test('exponentiation is right-associative and binds tighter than unary minus', () => {
  assert.equal(ev('2^10'), 1024);
  assert.equal(ev('2^3^2'), 512, '2^(3^2), not (2^3)^2');
  assert.equal(ev('-2^2'), -4, 'the mathematical reading: -(2^2)');
  assert.equal(ev('(-2)^2'), 4);
  assert.equal(ev('2^-3'), 0.125);
  assert.equal(ev('2**10'), 1024, '** is accepted as an alias');
  near(ev('2^0.5'), Math.SQRT2);
});

test('unary signs stack without changing the answer', () => {
  assert.equal(ev('-5'), -5);
  assert.equal(ev('--5'), 5);
  assert.equal(ev('+-+5'), -5);
  assert.equal(ev('3 - -2'), 5);
  assert.equal(ev('3*-2'), -6);
});

test('number literals: separators, bases, exponents, leading point', () => {
  assert.equal(ev('1_000_000'), 1_000_000);
  assert.equal(ev('0xff'), 255);
  assert.equal(ev('0b1011'), 11);
  assert.equal(ev('0o17'), 15);
  assert.equal(ev('1e3'), 1000);
  assert.equal(ev('1.5e-3'), 0.0015);
  assert.equal(ev('.5'), 0.5);
  assert.equal(ev('2.'), 2);
  // `2e` is not a broken literal: `e` is Euler's number, so this is 2 × e.
  near(ev('2e'), 2 * Math.E);
});

test('malformed base literals are refused instead of half-read', () => {
  // parseInt('102', 2) returns 2; that silent truncation is the bug being tested.
  assert.throws(() => parse('0b102'), /not a base-2 number/);
  assert.throws(() => parse('0xg1'), /not a base-16 number/);
  assert.throws(() => parse('0o8'), /not a base-8 number/);
  assert.throws(() => parse('0x'), /needs digits after it/);
});

test('constants are available by name and by symbol', () => {
  near(ev('pi'), Math.PI);
  near(ev('π'), Math.PI);
  near(ev('tau'), Math.PI * 2);
  near(ev('e'), Math.E);
  near(ev('phi'), (1 + Math.sqrt(5)) / 2);
  assert.equal(ev('inf'), Number.POSITIVE_INFINITY);
  assert.equal(Object.keys(CONSTANTS).length > 5, true);
});

test('implicit multiplication works where it cannot be ambiguous', () => {
  near(ev('2pi'), 2 * Math.PI);
  assert.equal(ev('3(4+5)'), 27);
  assert.equal(ev('(1+2)(3+4)'), 21);
  assert.equal(ev('2(3)(4)'), 24);
  near(ev('2sqrt(9)'), 6);
  // A number straight after a number is a missing operator, not a product.
  assert.throws(() => parse('2 3'), /left over at the end/);
});

test('functions: arity, variadics and the optional-argument cases', () => {
  assert.equal(ev('sqrt(16)'), 4);
  assert.equal(ev('abs(-3)'), 3);
  assert.equal(ev('max(1, 7, 3)'), 7);
  assert.equal(ev('min(1, 7, 3)'), 1);
  assert.equal(ev('sum(1,2,3,4)'), 10);
  assert.equal(ev('avg(2,4,9)'), 5);
  assert.equal(ev('hypot(3,4)'), 5);
  assert.equal(ev('round(2.345, 2)'), 2.35);
  assert.equal(ev('round(2.5)'), 3);
  assert.equal(ev('log(1000)'), 3, 'log is base 10');
  assert.equal(ev('log(2, 8)'), 3, 'log(base, x)');
  assert.equal(ev('log2(1024)'), 10);
  near(ev('ln(e)'), 1);
  assert.equal(ev('gcd(12, 18)'), 6);
  assert.equal(ev('gcd(12, 18, 27)'), 3);
  assert.equal(ev('lcm(4, 6)'), 12);
  assert.equal(ev('pow(2, 8)'), 256);
  assert.equal(ev('floor(-1.5)'), -2);
  assert.equal(ev('ceil(-1.5)'), -1);
  assert.equal(ev('trunc(-1.9)'), -1);
  assert.equal(ev('sign(-4)'), -1);
});

test('mod() and % disagree on negative numbers, deliberately', () => {
  assert.equal(ev('-7 % 3'), -1, '% is the JS remainder');
  assert.equal(ev('mod(-7, 3)'), 2, 'mod() follows the divisor, like Python');
  assert.equal(ev('mod(7, -3)'), -2);
});

test('trigonometry respects the angle mode', () => {
  near(ev('sin(0)'), 0);
  near(ev('sin(pi/2)'), 1);
  near(ev('sin(90)', 'deg'), 1);
  near(ev('cos(180)', 'deg'), -1);
  near(ev('tan(45)', 'deg'), 1);
  near(ev('asin(1)', 'deg'), 90);
  near(ev('atan2(1, 1)', 'deg'), 45);
  near(ev('deg(pi)'), 180, 'deg() converts regardless of mode');
  near(ev('rad(180)'), Math.PI);
  // The same expression must give different answers in the two modes.
  assert.ok(Math.abs(ev('sin(1)') - ev('sin(1)', 'deg')) > 0.8);
});

test('factorial works as a postfix operator and as a function', () => {
  assert.equal(ev('5!'), 120);
  assert.equal(ev('0!'), 1);
  assert.equal(ev('fact(6)'), 720);
  assert.equal(ev('(2+3)!'), 120);
  assert.equal(ev('3!!'), 720, '(3!)! = 6! = 720');
  assert.equal(ev('2^3!'), 64, '2^(3!)');
  assert.equal(ev('-3!'), -6, '-(3!)');
  assert.equal(factorial(0), 1);
  assert.equal(factorial(1), 1);
  assert.equal(factorial(20), 2432902008176640000);
  assert.ok(Number.isFinite(factorial(MAX_FACTORIAL)));
});

test('factorial refuses what it cannot answer', () => {
  assert.throws(() => factorial(-1), /whole numbers from 0/);
  assert.throws(() => factorial(2.5), /whole numbers from 0/);
  assert.throws(() => ev('171!'), /larger than a double/);
  assert.throws(() => ev('(-1)!'), CalcError);
});

test('variables and assignment', () => {
  const env: Env = {};
  assert.equal(evaluate(parse('x = 5'), env), 5);
  assert.equal(env.x, 5);
  assert.equal(evaluate(parse('x * 3'), env), 15);
  assert.equal(evaluate(parse('y = x^2'), env), 25);
  assert.equal(evaluate(parse('x + y'), env), 30);
  // Names with digits and underscores.
  assert.equal(evaluate(parse('rate_2024 = 1.5'), env), 1.5);
  assert.equal(evaluate(parse('rate_2024 * 2'), env), 3);
});

test('built-in names cannot be reassigned or used bare', () => {
  assert.throws(() => ev('pi = 3'), /built in/);
  assert.throws(() => ev('sqrt = 2'), /built in/);
  assert.throws(() => ev('ans = 1'), /built in/);
  assert.throws(() => ev('sqrt'), /is a function/);
  assert.throws(() => ev('unknownThing'), /has no value yet/);
  assert.throws(() => ev('nope(2)'), /no function called nope/);
});

test('argument counts are checked, with the count in the message', () => {
  assert.throws(() => ev('sqrt(1, 2)'), /takes 1 argument, got 2/);
  assert.throws(() => ev('atan2(1)'), /takes 2 arguments, got 1/);
  assert.throws(() => ev('max()'), /at least one argument/);
  assert.throws(() => ev('log(1,2,3)'), /log\(x\) for base 10/);
  assert.throws(() => ev('round(1,2,3)'), /one or two arguments/);
  assert.throws(() => ev('gcd(1.5, 2)'), /whole numbers/);
});

test('errors carry the character position of the problem', () => {
  assert.throws(() => parse('1 + @'), (error: unknown) => {
    assert.ok(error instanceof CalcError);
    assert.equal(error.pos, 4);
    return true;
  });
  assert.throws(() => parse('(1+2'), (error: unknown) => {
    assert.ok(error instanceof CalcError);
    assert.match(error.message, /closing parenthesis/);
    return true;
  });
  assert.throws(() => parse('1 +'), /ends too soon/);
  assert.throws(() => parse('*5'), /cannot start a value/);
  assert.throws(() => parse(''), /ends too soon/);
  assert.throws(() => parse('1 2 3'), /left over/);
});

test('full-width and typographic characters are normalised', () => {
  assert.equal(ev('１＋２'), 3);
  assert.equal(ev('（２＋３）×４'), 20);
  assert.equal(ev('10÷4'), 2.5);
  assert.equal(ev('2−1'), 1, 'U+2212 minus sign');
  assert.equal(ev('３．５＋０．５'), 4);
});

test('comments are ignored to the end of the line', () => {
  assert.equal(ev('1 + 2 # three'), 3);
  assert.equal(run('# just a note\n40 + 2').value, 42);
});

test('runaway input is refused rather than allowed to hang', () => {
  assert.throws(() => tokenize('1'.repeat(MAX_EXPRESSION + 1)), /longer than/);
  // Deeply nested parentheses and long unary chains both recurse.
  assert.throws(() => parse('('.repeat(MAX_DEPTH + 5) + '1'), /nested deeper/);
  assert.throws(() => parse('-'.repeat(MAX_DEPTH + 5) + '1'), /nested deeper/);
  // Just inside the limit still parses.
  assert.equal(ev('-'.repeat(20) + '1'), 1);
  assert.throws(() => run('1\n'.repeat(MAX_LINES + 1)), /more than/);
});

test('a newline inside one expression is an error, not a silent join', () => {
  assert.throws(() => tokenize('1 +\n2'), /newline cannot appear/);
});

test('run evaluates a sheet, threading ans and variables', () => {
  const result = run('a = 3\nb = 4\nsqrt(a^2 + b^2)\nans * 2');
  assert.equal(result.lines.length, 4);
  assert.equal(result.lines[2].value, 5);
  assert.equal(result.lines[3].value, 10);
  assert.equal(result.value, 10);
  assert.equal(result.env.a, 3);
  assert.equal(result.lines[0].assigned, 'a');
  assert.equal(result.lines[2].assigned, undefined);
});

test('run keeps going after a bad line instead of losing the sheet', () => {
  const result = run('1 + 1\nnot a thing (\n10 * 10');
  assert.equal(result.lines.length, 3);
  assert.equal(result.lines[0].value, 2);
  assert.ok(result.lines[1].error instanceof CalcError);
  assert.ok(Number.isNaN(result.lines[1].value));
  assert.equal(result.lines[2].value, 100);
  assert.equal(result.value, 100, 'the last good line is the answer');
});

test('run skips blank lines and comment lines without numbering them', () => {
  const result = run('\n  \n# note\n7\n');
  assert.equal(result.lines.length, 1);
  assert.equal(result.value, 7);
});

test('run honours the angle mode and a seeded environment', () => {
  near(run('sin(90)', 'deg').value, 1);
  assert.equal(run('base * 2', 'rad', { base: 21 }).value, 42);
});

test('every declared function is callable at its declared arity', () => {
  for (const [name, def] of Object.entries(FUNCTIONS)) {
    const count = def.arity === -1 ? 2 : def.arity;
    const args = Array.from({ length: count }, () => '1').join(', ');
    const value = ev(`${name}(${args})`);
    assert.equal(typeof value, 'number', `${name} did not return a number`);
  }
});

test('division by zero reports infinity rather than throwing', () => {
  assert.equal(ev('1/0'), Number.POSITIVE_INFINITY);
  assert.equal(ev('-1/0'), Number.NEGATIVE_INFINITY);
  assert.ok(Number.isNaN(ev('0/0')));
  assert.ok(Number.isNaN(ev('sqrt(-1)')));
});

test('tokenize labels each piece with its offset', () => {
  const tokens = tokenize('12 + ab(3)');
  assert.deepEqual(
    tokens.map((token) => [token.kind, token.text, token.pos]),
    [
      ['num', '12', 0],
      ['op', '+', 3],
      ['ident', 'ab', 5],
      ['lparen', '(', 7],
      ['num', '3', 8],
      ['rparen', ')', 9],
      ['eof', '', 10],
    ]
  );
});

test('formatResult keeps a double honest', () => {
  assert.equal(formatResult(3), '3');
  assert.equal(formatResult(1234567), '1,234,567');
  assert.equal(formatResult(1234567, false), '1234567');
  // The headline case: 0.1 + 0.2 must not read as 0.30000000000000004.
  assert.equal(formatResult(0.1 + 0.2), '0.3');
  assert.equal(formatResult(1 / 3), '0.333333333333333');
  assert.equal(formatResult(-0.5), '-0.5');
  assert.equal(formatResult(Number.NaN), 'NaN');
  assert.equal(formatResult(Number.POSITIVE_INFINITY), '∞');
  assert.equal(formatResult(Number.NEGATIVE_INFINITY), '-∞');
  assert.equal(formatResult(0), '0');
  assert.ok(formatResult(1e20).includes('e+'));
  assert.ok(formatResult(1e-9).includes('e-'));
});

test('integerViews only offers itself for exact integers', () => {
  assert.deepEqual(integerViews(255), { hex: '0xff', bin: '0b11111111', oct: '0o377' });
  assert.deepEqual(integerViews(-16), { hex: '-0x10', bin: '-0b10000', oct: '-0o20' });
  assert.deepEqual(integerViews(0), { hex: '0x0', bin: '0b0', oct: '0o0' });
  assert.equal(integerViews(1.5), null);
  assert.equal(integerViews(2 ** 60), null);
  assert.equal(integerViews(Number.NaN), null);
});

test('worked examples, checked by hand', () => {
  // Compound interest on 100 at 5% for 10 years.
  near(ev('100 * 1.05^10'), 162.889462677744);
  // The 30-60-90 triangle.
  near(ev('sin(30)', 'deg'), 0.5);
  // A 16:9 frame 1920 wide.
  assert.equal(ev('1920 * 9 / 16'), 1080);
  // Bytes in 4 GiB.
  assert.equal(ev('4 * 1024^3'), 4294967296);
  // Combinations: 49 choose 6.
  assert.equal(ev('49! / (6! * 43!)'), 13983816);
  // A quadratic root: x^2 - 5x + 6, larger root.
  near(ev('(5 + sqrt(5^2 - 4*6)) / 2'), 3);
});
