import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSENT,
  DEFAULT_EMIT,
  MAX_ROWS,
  TooMuchData,
  countCells,
  detectDelimiter,
  inferValue,
  insertsToText,
  parameterValue,
  parseDelimited,
  parseInserts,
  placeholder,
  quoteIdent,
  quoteString,
  renderValue,
  scanSql,
  tableFromDelimited,
  tableFromJson,
  toCsv,
  toInserts,
  toJson,
  type EmitOptions,
  type Table,
} from './logic.ts';

const emit = (table: Table, patch: Partial<EmitOptions> = {}) =>
  toInserts(table, { ...DEFAULT_EMIT, ...patch });

const sql = (table: Table, patch: Partial<EmitOptions> = {}) =>
  insertsToText(emit(table, patch).statements, patch.parameterised ?? false);

/* ── Reading delimited text ───────────────── */

test('the CSV reader follows RFC 4180', () => {
  assert.deepEqual(parseDelimited('a,b\n1,2', ','), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseDelimited('a,b\r\n1,2\r\n', ','), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseDelimited('"a,b",c', ','), [['a,b', 'c']]);
  assert.deepEqual(parseDelimited('"say ""hi""",x', ','), [['say "hi"', 'x']]);
  assert.deepEqual(parseDelimited('"two\nlines",x', ','), [['two\nlines', 'x']]);
  assert.deepEqual(parseDelimited('a,,c', ','), [['a', '', 'c']]);
  assert.deepEqual(parseDelimited('', ','), []);
  // A file that is only a line break holds no rows, not one empty row.
  assert.deepEqual(parseDelimited('\n', ','), []);
  assert.deepEqual(parseDelimited('a\n', ','), [['a']]);
  assert.deepEqual(parseDelimited('a\tb', '\t'), [['a', 'b']]);
});

test('a quote in the middle of an unquoted field is data', () => {
  assert.deepEqual(parseDelimited('5" pipe,x', ','), [['5" pipe', 'x']]);
});

test('the delimiter is detected from consistency, not frequency', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('a;b\n1;2'), ';');
  assert.equal(detectDelimiter('a|b\n1|2'), '|');
  assert.equal(detectDelimiter('single'), ',');
  // A comma inside a quoted field must not outvote the real delimiter.
  assert.equal(detectDelimiter('a\t"x,y,z"\nb\t"1,2,3"'), '\t');
});

test('a header row names the columns, and its absence numbers them', () => {
  assert.deepEqual(tableFromDelimited('id,name\n1,a', ',', true), {
    columns: ['id', 'name'],
    rows: [['1', 'a']],
  });
  assert.deepEqual(tableFromDelimited('1,a', ',', false), {
    columns: ['column_1', 'column_2'],
    rows: [['1', 'a']],
  });
  assert.deepEqual(tableFromDelimited('id,,x\n1,2,3', ',', true).columns, ['id', 'column_2', 'x']);
  assert.deepEqual(tableFromDelimited('', ',', true), { columns: [], rows: [] });
});

/* ── Reading JSON ─────────────────────────── */

test('an array of objects becomes a table, keeping every member', () => {
  const { table } = tableFromJson('[{"a":1,"b":"x"},{"b":"y","c":true}]');
  assert.deepEqual(table.columns, ['a', 'b', 'c']);
  assert.deepEqual(table.rows, [['1', 'x', ABSENT], [ABSENT, 'y', 'true']]);
});

test('null and a missing member both become NULL, and nested values become text', () => {
  const { table, problems } = tableFromJson('[{"a":null,"b":{"x":1}}]');
  assert.deepEqual(table.rows[0][0], ABSENT);
  assert.equal(table.rows[0][1], '{"x":1}');
  assert.match(problems[0].message, /nested/);
});

test('an array of arrays and a single object both work', () => {
  assert.deepEqual(tableFromJson('[[1,2],[3,4]]').table, {
    columns: ['column_1', 'column_2'],
    rows: [['1', '2'], ['3', '4']],
  });
  assert.deepEqual(tableFromJson('{"a":1}').table, { columns: ['a'], rows: [['1']] });
  assert.equal(tableFromJson('{oops').problems.length, 1);
});

/* ── Quoting ──────────────────────────────── */

test('identifiers are quoted per dialect, and always when they need it', () => {
  assert.equal(quoteIdent('id', 'postgres'), 'id');
  assert.equal(quoteIdent('Id', 'postgres'), '"Id"');
  assert.equal(quoteIdent('order by', 'postgres'), '"order by"');
  assert.equal(quoteIdent('a"b', 'postgres'), '"a""b"');
  assert.equal(quoteIdent('Id', 'mysql'), '`Id`');
  assert.equal(quoteIdent('a`b', 'mysql'), '`a``b`');
  assert.equal(quoteIdent('id', 'mssql'), '[id]');
  assert.equal(quoteIdent('a]b', 'mssql'), '[a]]b]');
  assert.equal(quoteIdent('訂單', 'postgres'), '"訂單"');
});

test('a backslash is an escape in MySQL and a character everywhere else', () => {
  assert.equal(quoteString('C:\\path', 'postgres'), `'C:\\path'`);
  assert.equal(quoteString('C:\\path', 'mysql'), `'C:\\\\path'`);
  assert.equal(quoteString("it's", 'postgres'), `'it''s'`);
  assert.equal(quoteString("it's", 'mysql'), `'it''s'`);
  assert.equal(quoteString('a\nb', 'postgres'), `'a\nb'`);
  assert.equal(quoteString('a\nb', 'mysql'), `'a\\nb'`);
  assert.equal(quoteString('', 'postgres'), `''`);
});

test('SQL Server gets an N prefix exactly when the text needs one', () => {
  assert.equal(quoteString('plain', 'mssql'), `'plain'`);
  assert.equal(quoteString('訂單', 'mssql'), `N'訂單'`);
  assert.equal(quoteString('emoji 🔑', 'mssql'), `N'emoji 🔑'`);
});

test('a quote-injection attempt comes out as data, in every dialect', () => {
  const attack = `x' OR 1=1; DROP TABLE users; --`;
  for (const dialect of ['postgres', 'mysql', 'sqlite', 'mssql', 'ansi'] as const) {
    const quoted = quoteString(attack, dialect);
    // Every apostrophe in the payload is doubled, so the literal never closes
    // early: the number of lone quotes inside the body must be zero.
    const body = quoted.slice(quoted.indexOf("'") + 1, -1);
    assert.equal(body.replace(/''/g, '').includes("'"), false, dialect);
  }
  // The MySQL backslash trick cannot escape the closing quote either.
  assert.equal(quoteString("a\\' OR 1=1", 'mysql'), `'a\\\\'' OR 1=1'`);
});

/* ── Typing ───────────────────────────────── */

test('inference is timid where being wrong would change the value', () => {
  assert.deepEqual(inferValue('1', 'auto', true), { kind: 'number', text: '1' });
  assert.deepEqual(inferValue('-2.5', 'auto', true), { kind: 'number', text: '-2.5' });
  assert.deepEqual(inferValue('1e3', 'auto', true), { kind: 'number', text: '1e3' });
  // A leading zero is never decoration.
  assert.deepEqual(inferValue('007', 'auto', true), { kind: 'string', text: '007' });
  // Nineteen digits do not survive a double.
  assert.deepEqual(inferValue('1234567890123456789', 'auto', true), {
    kind: 'string',
    text: '1234567890123456789',
  });
  assert.deepEqual(inferValue('+1', 'auto', true), { kind: 'string', text: '+1' });
  assert.deepEqual(inferValue('1,000', 'auto', true), { kind: 'string', text: '1,000' });
  assert.deepEqual(inferValue('2026-09-26', 'auto', true), { kind: 'string', text: '2026-09-26' });
});

test('null, empty and booleans behave as configured', () => {
  assert.deepEqual(inferValue(ABSENT, 'auto', false), { kind: 'null' });
  assert.deepEqual(inferValue('', 'auto', true), { kind: 'null' });
  assert.deepEqual(inferValue('', 'auto', false), { kind: 'string', text: '' });
  assert.deepEqual(inferValue('NULL', 'auto', false), { kind: 'null' });
  assert.deepEqual(inferValue('true', 'auto', true), { kind: 'boolean', value: true });
  assert.deepEqual(inferValue('FALSE', 'auto', true), { kind: 'boolean', value: false });
  // Text mode touches nothing but the empty cell.
  assert.deepEqual(inferValue('1', 'text', true), { kind: 'string', text: '1' });
  assert.deepEqual(inferValue('NULL', 'text', true), { kind: 'string', text: 'NULL' });
  assert.deepEqual(inferValue(ABSENT, 'text', true), { kind: 'null' });
});

test('booleans render as the dialect can accept them', () => {
  assert.equal(renderValue({ kind: 'boolean', value: true }, 'postgres'), 'TRUE');
  assert.equal(renderValue({ kind: 'boolean', value: true }, 'mysql'), '1');
  assert.equal(renderValue({ kind: 'boolean', value: false }, 'mssql'), '0');
  assert.equal(renderValue({ kind: 'null' }, 'postgres'), 'NULL');
  assert.equal(renderValue({ kind: 'number', text: '1.5' }, 'postgres'), '1.5');
});

test('placeholders and parameter values match their dialect', () => {
  assert.equal(placeholder(3, 'postgres'), '$3');
  assert.equal(placeholder(3, 'mysql'), '?');
  assert.equal(placeholder(3, 'sqlite'), '?');
  assert.equal(placeholder(3, 'mssql'), '@p3');
  assert.equal(parameterValue({ kind: 'number', text: '2' }), 2);
  assert.equal(parameterValue({ kind: 'null' }), null);
  assert.equal(parameterValue({ kind: 'boolean', value: false }), false);
  assert.equal(parameterValue({ kind: 'string', text: 'x' }), 'x');
});

/* ── INSERT output ────────────────────────── */

const TABLE: Table = {
  columns: ['id', 'name', 'qty', 'note'],
  rows: [
    ['1', "O'Brien", '2', ABSENT],
    ['2', '陳小美', '007', ''],
  ],
};

test('a batch of rows becomes one statement with one tuple per line', () => {
  const out = sql(TABLE);
  assert.equal(
    out,
    [
      'INSERT INTO my_table (id, name, qty, note)',
      'VALUES',
      "  (1, 'O''Brien', 2, NULL),",
      "  (2, '陳小美', '007', NULL);",
    ].join('\n')
  );
});

test('one row per statement is available', () => {
  const { statements } = emit(TABLE, { batch: 1 });
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /^INSERT INTO my_table \(id, name, qty, note\)\nVALUES \(1, /);
});

test('the parameterised form puts nothing in the statement', () => {
  const { statements } = emit(TABLE, { parameterised: true, batch: 2 });
  assert.equal(statements.length, 1);
  assert.equal(
    statements[0].sql,
    [
      'INSERT INTO my_table (id, name, qty, note)',
      'VALUES',
      '  ($1, $2, $3, $4),',
      '  ($5, $6, $7, $8);',
    ].join('\n')
  );
  assert.deepEqual(statements[0].params, [1, "O'Brien", 2, null, 2, '陳小美', '007', null]);
  // No apostrophe from the data can reach the statement text at all.
  assert.equal(statements[0].sql.includes("'"), false);
  assert.match(insertsToText(statements, true), /-- params: \[1,"O'Brien"/);
});

test('MySQL placeholders are all question marks, in order', () => {
  const { statements } = emit(TABLE, { parameterised: true, dialect: 'mysql', batch: 1 });
  assert.match(statements[0].sql, /VALUES \(\?, \?, \?, \?\)/);
  assert.equal(statements[0].params.length, 4);
});

test('the table name is quoted a part at a time', () => {
  assert.match(sql(TABLE, { table: 'public.orders' }), /INSERT INTO public\.orders \(/);
  assert.match(sql(TABLE, { table: 'My Schema.My Table' }), /INSERT INTO "My Schema"\."My Table"/);
  assert.match(sql(TABLE, { table: '' }), /INSERT INTO my_table/);
  assert.match(sql(TABLE, { table: 'orders', dialect: 'mysql' }), /INSERT INTO orders \(/);
});

test('upsert clauses are only emitted where the dialect has one', () => {
  assert.match(sql(TABLE, { conflict: 'ignore', conflictKey: 'id' }), /ON CONFLICT \(id\) DO NOTHING;/);
  assert.match(
    sql(TABLE, { conflict: 'update', conflictKey: 'id' }),
    /ON CONFLICT \(id\) DO UPDATE SET name = EXCLUDED\.name, qty = EXCLUDED\.qty, note = EXCLUDED\.note;/
  );
  assert.match(sql(TABLE, { conflict: 'ignore', dialect: 'mysql' }), /^INSERT IGNORE INTO/);
  assert.match(
    sql(TABLE, { conflict: 'update', dialect: 'mysql' }),
    /ON DUPLICATE KEY UPDATE name = VALUES\(name\), qty = VALUES\(qty\)/
  );
  // No MERGE is invented for SQL Server.
  assert.equal(sql(TABLE, { conflict: 'update', dialect: 'mssql' }).includes('MERGE'), false);
  assert.equal(sql(TABLE, { conflict: 'update', dialect: 'ansi' }).includes('ON CONFLICT'), false);
});

test('a short row is padded with NULL and reported', () => {
  const ragged: Table = { columns: ['a', 'b'], rows: [['1']] };
  const { statements, problems } = emit(ragged);
  assert.match(statements[0].sql, /VALUES \(1, NULL\);/);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].row, 1);
});

test('a NUL byte in a value is reported rather than emitted quietly', () => {
  const nasty: Table = { columns: ['a'], rows: [['x\u0000y']] };
  const { problems } = emit(nasty);
  assert.match(problems[0].message, /NUL/);
});

test('an empty table produces nothing and says why', () => {
  const { statements, problems } = emit({ columns: [], rows: [] });
  assert.deepEqual(statements, []);
  assert.match(problems[0].message, /no columns/);
  assert.equal(emit({ columns: ['a'], rows: [] }).statements.length, 0);
});

/* ── Reading INSERT statements ────────────── */

test('a pasted INSERT comes back as a table', () => {
  const { tables, problems } = parseInserts(
    `INSERT INTO public.orders (id, name, paid) VALUES (1, 'O''Brien', TRUE), (2, NULL, FALSE);`
  );
  assert.deepEqual(problems, []);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].table, 'public.orders');
  assert.deepEqual(tables[0].data.columns, ['id', 'name', 'paid']);
  assert.deepEqual(tables[0].data.rows, [
    ['1', "O'Brien", 'TRUE'],
    ['2', ABSENT, 'FALSE'],
  ]);
});

test('quoted identifiers, backticks and brackets all name columns', () => {
  const out = parseInserts('INSERT INTO `t` (`a`, "b", [c]) VALUES (1,2,3)');
  assert.deepEqual(out.tables[0].data.columns, ['a', 'b', 'c']);
  assert.equal(out.tables[0].table, 't');
});

test('escapes inside literals are undone', () => {
  const out = parseInserts(`INSERT INTO t (a) VALUES (E'line\\nbreak'), ('it''s'), (N'訂單')`);
  assert.deepEqual(out.tables[0].data.rows, [['line\nbreak'], ["it's"], ['訂單']]);
});

test('an expression in VALUES is kept as text, not evaluated', () => {
  const out = parseInserts('INSERT INTO t (a, b) VALUES (now(), 1 + 1)');
  assert.deepEqual(out.tables[0].data.rows, [['now ( )', '1 + 1']]);
});

test('several statements for one table are collected together', () => {
  const out = parseInserts(
    `insert into t (a) values (1); insert into t (a) values (2);\n-- comment\ninsert into t (a) values (3);`
  );
  assert.equal(out.tables.length, 1);
  assert.deepEqual(out.tables[0].data.rows, [['1'], ['2'], ['3']]);
});

test('statements for different tables stay apart', () => {
  const out = parseInserts(`insert into a (x) values (1); insert into b (y) values (2);`);
  assert.deepEqual(out.tables.map((entry) => entry.table), ['a', 'b']);
});

test('an INSERT without a column list numbers the columns', () => {
  const out = parseInserts(`INSERT INTO t VALUES (1, 'x')`);
  assert.deepEqual(out.tables[0].data.columns, ['column_1', 'column_2']);
});

test('what is not an INSERT is reported rather than half-read', () => {
  assert.match(parseInserts('SELECT 1').problems[0].message, /no INSERT statement/);
  assert.match(parseInserts(`INSERT INTO t (a) VALUES ('unclosed`).problems[0].message, /unterminated/);
  assert.match(parseInserts('INSERT INTO t (a)').problems[0].message, /no VALUES/);
  assert.equal(parseInserts('').problems.length, 1);
});

test('a comment between statements does not break the reader', () => {
  const out = parseInserts(`/* header */ INSERT INTO t (a) VALUES (1) -- trailing\n;`);
  assert.deepEqual(out.tables[0].data.rows, [['1']]);
});

test('the round trip data → INSERT → data keeps every value', () => {
  const original: Table = {
    columns: ['id', 'text', 'n'],
    rows: [
      ['1', "it's a \\ test", '5'],
      ['2', 'two\nlines', '0'],
      ['3', '中文 🔑', '-1'],
    ],
  };
  for (const dialect of ['postgres', 'mysql', 'sqlite', 'ansi'] as const) {
    const text = sql(original, { dialect, table: 't' });
    const back = parseInserts(text);
    assert.deepEqual(back.tables[0].data.columns, original.columns, dialect);
    const expected = original.rows.map((row) =>
      // MySQL escapes newlines in the literal; reading it back through the
      // ANSI rules keeps the backslash-n, so that dialect is checked apart.
      dialect === 'mysql' ? row.map((cell) => cell.replace(/\n/g, '\\n').replace(/\\/g, '\\\\').replace(/\\\\n/g, '\\n')) : row
    );
    if (dialect !== 'mysql') assert.deepEqual(back.tables[0].data.rows, expected, dialect);
  }
});

test('the scanner skips comments and keeps literals intact', () => {
  assert.deepEqual(scanSql(`-- x\n'a''b'`), [{ kind: 'string', text: "a'b" }]);
  assert.deepEqual(scanSql('/* x */ 1'), [{ kind: 'number', text: '1' }]);
  assert.deepEqual(scanSql('-1.5'), [{ kind: 'number', text: '-1.5' }]);
  assert.deepEqual(scanSql('a.b'), [{ kind: 'word', text: 'a.b' }]);
  assert.deepEqual(scanSql('('), [{ kind: 'punct', text: '(' }]);
});

/* ── Table output ─────────────────────────── */

test('CSV output quotes what it must and writes NULL as empty', () => {
  const out = toCsv({ columns: ['a', 'b'], rows: [['x,y', ABSENT], ['say "hi"', 'plain']] });
  assert.equal(out, 'a,b\n"x,y",\n"say ""hi""",plain');
  assert.match(toCsv({ columns: ['a'], rows: [['two\nlines']] }), /"two\nlines"/);
  assert.equal(toCsv({ columns: ['a', 'b'], rows: [['1', '2']] }, '\t'), 'a\tb\n1\t2');
});

test('JSON output applies the same typing as the INSERT path', () => {
  const out = toJson({ columns: ['id', 'ok', 'note'], rows: [['1', 'true', ABSENT]] }, 'auto', true, 0);
  assert.equal(out, '[{"id":1,"ok":true,"note":null}]');
  const asText = toJson({ columns: ['id'], rows: [['1']] }, 'text', true, 0);
  assert.equal(asText, '[{"id":"1"}]');
});

test('countCells counts what is there, ragged rows included', () => {
  assert.equal(countCells({ columns: ['a', 'b'], rows: [['1', '2'], ['3']] }), 3);
  assert.equal(countCells({ columns: [], rows: [] }), 0);
});

test('oversized input reports instead of filling memory', () => {
  const rows = `${'a\n'.repeat(MAX_ROWS + 10)}`;
  assert.throws(() => parseDelimited(rows, ','), TooMuchData);
  assert.throws(() => tableFromJson(JSON.stringify(Array.from({ length: MAX_ROWS + 10 }, () => 1))), TooMuchData);
});
