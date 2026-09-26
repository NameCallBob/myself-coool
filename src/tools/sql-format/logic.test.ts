import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUSES,
  DEFAULTS,
  KEYWORDS,
  MAX_TOKENS,
  SqlTooBig,
  SqlUnterminated,
  format,
  layout,
  minify,
  statementCount,
  tokenize,
  type Options,
} from './logic.ts';

const fmt = (sql: string, patch: Partial<Options> = {}) => {
  const out = format(sql, { ...DEFAULTS, ...patch });
  assert.ok(out.ok, out.ok ? '' : out.message);
  return out.ok ? out.sql : '';
};

const kinds = (sql: string) => tokenize(sql).map((token) => `${token.kind}:${token.text}`);

/* ── Tokenizer ────────────────────────────── */

test('the tokenizer keeps literals whole', () => {
  assert.deepEqual(kinds(`'it''s'`), [`string:'it''s'`]);
  assert.deepEqual(kinds(`E'a\\'b'`), [`string:E'a\\'b'`]);
  assert.deepEqual(kinds(`"quoted id"`), ['ident:"quoted id"']);
  assert.deepEqual(kinds('`mysql id`'), ['ident:`mysql id`']);
  assert.deepEqual(kinds('[tsql id]'), ['ident:[tsql id]']);
  assert.deepEqual(kinds('$$body$$'), ['string:$$body$$']);
  assert.deepEqual(kinds('$tag$body$tag$'), ['string:$tag$body$tag$']);
});

test('the tokenizer reads numbers, parameters and operators', () => {
  assert.deepEqual(kinds('1 2.5 .5 1e10 0xFF'), [
    'number:1',
    'number:2.5',
    'number:.5',
    'number:1e10',
    'number:0xFF',
  ]);
  assert.deepEqual(kinds('$1 ? :name @var'), ['param:$1', 'param:?', 'param::name', 'param:@var']);
  assert.deepEqual(kinds('a->>b a::int c @> d'), [
    'word:a',
    'operator:->>',
    'word:b',
    'word:a',
    'operator:::',
    'word:int',
    'word:c',
    'operator:@>',
    'word:d',
  ]);
});

test('comments are tokens, not whitespace', () => {
  assert.deepEqual(kinds('a -- note\nb'), ['word:a', 'lineComment:-- note', 'word:b']);
  assert.deepEqual(kinds('a /* x */ b'), ['word:a', 'blockComment:/* x */', 'word:b']);
  assert.deepEqual(kinds('# mysql\na'), ['lineComment:# mysql', 'word:a']);
  // A `#>` operator mid-line is not a MySQL comment.
  assert.deepEqual(kinds(`a #> '{b}'`), ['word:a', 'operator:#>', `string:'{b}'`]);
});

test('CJK and underscored identifiers survive tokenizing', () => {
  assert.deepEqual(kinds('SELECT 訂單編號 FROM 訂單'), [
    'word:SELECT',
    'word:訂單編號',
    'word:FROM',
    'word:訂單',
  ]);
  assert.deepEqual(kinds('my_table_2'), ['word:my_table_2']);
});

test('an unterminated literal or comment is an error', () => {
  assert.throws(() => tokenize(`select 'x`), SqlUnterminated);
  assert.throws(() => tokenize('select "x'), SqlUnterminated);
  assert.throws(() => tokenize('select /* x'), SqlUnterminated);
  assert.throws(() => tokenize('select $$x'), SqlUnterminated);
  assert.throws(() => tokenize(`select ${'a,'.repeat(MAX_TOKENS)}`), SqlTooBig);
});

/* ── Layout ───────────────────────────────── */

test('a one-line query becomes one clause per line', () => {
  assert.equal(
    fmt(`select id, name from users where active = true order by id desc limit 10`),
    ['SELECT id, name', 'FROM users', 'WHERE active = TRUE', 'ORDER BY id DESC', 'LIMIT 10'].join('\n')
  );
});

test('joins and aggregates land on their own lines', () => {
  const out = fmt(
    `SELECT u.id, count(o.id) AS orders FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id HAVING count(o.id) > 3`
  );
  assert.equal(
    out,
    [
      'SELECT u.id, count(o.id) AS orders',
      'FROM users u',
      'LEFT JOIN orders o ON o.user_id = u.id',
      'GROUP BY u.id',
      'HAVING count(o.id) > 3',
    ].join('\n')
  );
});

test('a function call keeps its parenthesis tight; a column list does not', () => {
  assert.match(fmt('select count(*) from t'), /count\(\*\)/);
  assert.match(fmt(`insert into t (a,b) values (1,2)`), /INSERT INTO t \(a, b\)/);
  assert.match(fmt('create table t (id int)'), /CREATE TABLE t \(id int\)/);
});

test('a subquery opens out even when it would fit', () => {
  assert.equal(
    fmt('select * from t where id in (select id from u where flag = 1)'),
    ['SELECT *', 'FROM t', 'WHERE id IN (', '  SELECT id', '  FROM u', '  WHERE flag = 1', ')'].join('\n')
  );
});

test('a CTE indents its body and closes at the margin', () => {
  const out = fmt(`with recent as (select id from orders where created_at > now()) select * from recent`);
  assert.equal(
    out,
    [
      'WITH recent AS (',
      '  SELECT id',
      '  FROM orders',
      '  WHERE created_at > now()',
      ')',
      'SELECT *',
      'FROM recent',
    ].join('\n')
  );
});

test('a long clause gets one item per line, a short one does not', () => {
  const short = fmt('select a, b, c from t');
  assert.match(short, /^SELECT a, b, c$/m);

  const long = fmt(
    'select first_column, second_column, third_column, fourth_column, fifth_column, sixth_column from t'
  );
  assert.match(long, /^SELECT\n {2}first_column,\n {2}second_column,/);

  // The width is the only thing that decides it.
  assert.match(fmt('select a, b, c from t', { width: 8 }), /^SELECT\n {2}a,\n {2}b,\n {2}c$/m);
});

test('AND and OR break only when the clause is broken', () => {
  assert.match(fmt('select a from t where x = 1 and y = 2'), /^WHERE x = 1 AND y = 2$/m);
  const long = fmt(
    `select a from t where first_condition = 1 and second_condition = 2 and third_condition_here = 3`
  );
  assert.match(long, /^WHERE\n {2}first_condition = 1\n {2}AND second_condition = 2/m);
});

test('CASE lays out one branch per line and END returns to its column', () => {
  const out = fmt(`select case when a > 1 then 'big' else 'small' end as size from t`);
  assert.equal(
    out,
    [
      'SELECT',
      '  CASE',
      "    WHEN a > 1 THEN 'big'",
      "    ELSE 'small'",
      '  END AS size',
      'FROM t',
    ].join('\n')
  );
});

test('keyword casing is applied to keywords only', () => {
  assert.match(fmt('select Id as MyId from MyTable', { casing: 'upper' }), /SELECT Id AS MyId\nFROM MyTable/);
  assert.match(fmt('SELECT Id FROM MyTable', { casing: 'lower' }), /select Id\nfrom MyTable/);
  assert.match(fmt('SeLeCt a FROM t', { casing: 'preserve' }), /SeLeCt a\nFROM t/);
  // A column named `key` or `value` is still a column.
  assert.match(fmt('select "select", count from t', { casing: 'upper' }), /SELECT "select", count/);
});

test('strings and comments are never rewritten', () => {
  const sql = `select 'select from where' as s, 'it''s' as q from t -- keep this AS IS\nwhere x = 1`;
  const out = fmt(sql);
  assert.ok(out.includes(`'select from where'`));
  assert.ok(out.includes(`'it''s'`));
  assert.ok(out.includes('-- keep this AS IS'));
  // Nothing after a line comment may end up on the comment's line.
  const lines = out.split('\n');
  const commentLine = lines.findIndex((line) => line.includes('--'));
  assert.ok(lines[commentLine].trim().endsWith('AS IS'));
  assert.match(lines[commentLine + 1], /WHERE x = 1/);
});

test('several statements are separated by a blank line', () => {
  assert.equal(fmt('select 1; select 2;'), 'SELECT 1;\n\nSELECT 2;');
  assert.equal(fmt('select 1'), 'SELECT 1');
});

test('the indent unit is configurable, including tabs', () => {
  assert.match(fmt('select * from t where id in (select id from u)', { indent: 4 }), /^ {4}SELECT id$/m);
  assert.match(fmt('select * from t where id in (select id from u)', { indent: 0 }), /^\tSELECT id$/m);
});

test('comma-first style puts the comma at the start of the line', () => {
  const out = fmt('select a, b, c from t', { width: 8, commaFirst: true });
  assert.equal(out, ['SELECT', '  a', '  , b', '  , c', 'FROM t'].join('\n'));
});

test('formatting is idempotent: formatting the output changes nothing', () => {
  const samples = [
    `select id, name from users where a = 1 and b = 2 order by id`,
    `SELECT u.id FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.total > 100`,
    `insert into t (a,b) values (1,2),(3,4) returning id`,
    `with x as (select 1) select * from x`,
    `select case when a then 'b' else 'c' end from t`,
    `update t set a = 1 where id = $1`,
    `select a from t -- note\nwhere b = 1`,
  ];
  for (const sample of samples) {
    const once = fmt(sample);
    assert.equal(fmt(once), once, sample);
  }
});

test('every token survives formatting', () => {
  const samples = [
    `select a,b from t where c in (1,2,3) and d like '%x%' order by a`,
    `insert into "T" ("a") values (E'x\\ny') on conflict (a) do nothing`,
    `select t.*, (select count(*) from u where u.t = t.id) as n from t`,
  ];
  for (const sample of samples) {
    const before = tokenize(sample).map((token) => token.text.toUpperCase());
    const after = tokenize(fmt(sample)).map((token) => token.text.toUpperCase());
    assert.deepEqual(after, before, sample);
  }
});

test('an unbalanced parenthesis still produces output', () => {
  // Not valid SQL, but a formatter must not throw on it or lose the text.
  const out = fmt('select * from t where (a = 1');
  assert.ok(out.includes('a = 1'));
  const extra = fmt('select * from t)');
  assert.ok(extra.includes(')'));
});

test('minify puts a statement on one line and drops comments', () => {
  const out = minify(`select a,\n  b -- note\nfrom t /* x */ where c = 1`);
  assert.ok(out.ok);
  if (out.ok) assert.equal(out.sql, 'select a, b from t where c = 1');
  assert.equal(minify('').ok, false);
  assert.equal(minify(`select 'x`).ok, false);
});

test('minify preserves string contents exactly', () => {
  const out = minify(`select 'a  b', 'it''s'`);
  assert.ok(out.ok);
  if (out.ok) assert.equal(out.sql, `select 'a  b', 'it''s'`);
});

test('format() reports failures rather than throwing', () => {
  assert.equal(format('').ok, false);
  const bad = format(`select 'unclosed`);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /unterminated string literal/);
  const big = format(`select ${'a,'.repeat(MAX_TOKENS)}`);
  assert.equal(big.ok, false);
});

test('statementCount ignores comments and empty statements', () => {
  assert.equal(statementCount(tokenize('select 1')), 1);
  assert.equal(statementCount(tokenize('select 1;')), 1);
  assert.equal(statementCount(tokenize('select 1; select 2;')), 2);
  assert.equal(statementCount(tokenize('-- only a comment')), 0);
  assert.equal(statementCount(tokenize('')), 0);
  assert.equal(statementCount(tokenize('select (1);')), 1);
});

test('layout() on an empty token list is an empty string', () => {
  assert.equal(layout([]), '');
});

test('the clause and keyword tables agree with each other', () => {
  for (const clause of CLAUSES) {
    for (const word of clause) assert.ok(KEYWORDS.has(word), `${word} missing from KEYWORDS`);
  }
});
