import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIMITERS,
  MAX_CELLS,
  MAX_ROWS,
  WORKER_THRESHOLD,
  asNumber,
  columnStats,
  countCells,
  dedupe,
  detectDelimiter,
  filterRows,
  parseRows,
  raggedRows,
  selectColumns,
  sortRows,
  toCsv,
  toJson,
  toMarkdown,
  toTable,
  transpose,
  workerSource,
  type Table,
} from './logic.ts';

const parse = (text: string, delimiter = ',') => parseRows(text, delimiter, MAX_ROWS, MAX_CELLS);

/* ── Parsing ──────────────────────────────── */

test('quoted fields keep delimiters, quotes and line breaks', () => {
  assert.deepEqual(parse('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parse('"a,b",c'), [['a,b', 'c']]);
  assert.deepEqual(parse('"say ""hi""",x'), [['say "hi"', 'x']]);
  assert.deepEqual(parse('"two\nlines",x'), [['two\nlines', 'x']]);
  assert.deepEqual(parse('a,"",c'), [['a', '', 'c']]);
});

test('every line ending is accepted and none is left in a cell', () => {
  assert.deepEqual(parse('a\r\nb'), [['a'], ['b']]);
  assert.deepEqual(parse('a\rb'), [['a'], ['b']]);
  assert.deepEqual(parse('a\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('\n'), []);
});

test('unicode, emoji and CJK cells are untouched', () => {
  assert.deepEqual(parse('名稱,數量\n陳小美,3\n🔑,1'), [
    ['名稱', '數量'],
    ['陳小美', '3'],
    ['🔑', '1'],
  ]);
});

test('an unclosed quote takes the rest of the file rather than guessing', () => {
  // The honest reading: everything after the quote is one field.
  assert.deepEqual(parse('"unclosed,a\nb'), [['unclosed,a\nb']]);
});

test('the parser stops instead of filling memory', () => {
  assert.throws(() => parseRows('a\n'.repeat(20), ',', 5, MAX_CELLS), /too many rows/);
  assert.throws(() => parseRows('a,b,c,d\n', ',', MAX_ROWS, 3), /too many cells/);
});

test('the worker source carries this module s own parser', () => {
  const source = workerSource();
  assert.match(source, /^const parseRows = function parseRows\(/);
  assert.match(source, /onmessage = function \(event\)/);
  assert.match(source, /postMessage\(\{ value: parseRows\(/);
  // The parser must not reference anything outside itself, or it would throw a
  // ReferenceError inside the Worker. Nothing from this module may appear in it.
  const body = source.slice(0, source.indexOf('onmessage'));
  for (const name of ['MAX_ROWS', 'MAX_CELLS', 'DELIMITERS', 'detectDelimiter', 'asNumber']) {
    assert.equal(body.includes(name), false, `${name} leaked into the worker body`);
  }
  assert.ok(WORKER_THRESHOLD > 0);
});

test('delimiters are detected by consistency', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(detectDelimiter('a;b\n1;2'), ';');
  assert.equal(detectDelimiter('a|b\n1|2'), '|');
  assert.equal(detectDelimiter(''), ',');
  assert.equal(detectDelimiter('nothing to split'), ',');
  assert.equal(detectDelimiter('a\t"x,y"\nb\t"1,2"'), '\t');
  assert.deepEqual(DELIMITERS.map((entry) => entry.value), [',', '\t', ';', '|']);
});

test('a table takes its names from the header and pads short rows', () => {
  assert.deepEqual(toTable(parse('id,name\n1,a'), true), { columns: ['id', 'name'], rows: [['1', 'a']] });
  assert.deepEqual(toTable(parse('1,a'), false), { columns: ['column_1', 'column_2'], rows: [['1', 'a']] });
  assert.deepEqual(toTable(parse('id,,z\n1,2,3'), true).columns, ['id', 'column_2', 'z']);
  assert.deepEqual(toTable(parse('a,b,c\n1'), true).rows, [['1', '', '']]);
  assert.deepEqual(toTable([], true), { columns: [], rows: [] });
});

/* ── Numbers ──────────────────────────────── */

test('numbers are read the way a spreadsheet writes them', () => {
  assert.equal(asNumber('42'), 42);
  assert.equal(asNumber('-2.5'), -2.5);
  assert.equal(asNumber(' 1,234 '), 1234);
  assert.equal(asNumber('+7'), 7);
  assert.equal(asNumber('50%'), 0.5);
  assert.equal(asNumber('(30)'), -30);
  assert.equal(asNumber('1e3'), 1000);
  assert.equal(asNumber(''), null);
  assert.equal(asNumber('N/A'), null);
  assert.equal(asNumber('12 apples'), null);
  assert.equal(asNumber('1.2.3'), null);
  assert.equal(asNumber('NaN'), null);
  assert.equal(asNumber('Infinity'), null);
});

/* ── Operations ───────────────────────────── */

const TABLE: Table = {
  columns: ['name', 'qty', 'city'],
  rows: [
    ['b', '10', '台北'],
    ['a', '2', '台中'],
    ['c', '', '台北'],
    ['a', '2', '台中'],
  ],
};

test('sorting is numeric when the column is, and stable either way', () => {
  const byQty = sortRows(TABLE.rows, 1, 'asc').map((row) => row[1]);
  // Numeric, not lexical: 2 before 10. The blank sorts last.
  assert.deepEqual(byQty, ['2', '2', '10', '']);
  const desc = sortRows(TABLE.rows, 1, 'desc').map((row) => row[1]);
  assert.deepEqual(desc, ['10', '2', '2', '']);
  // The two equal rows keep their input order in both directions.
  assert.deepEqual(sortRows(TABLE.rows, 1, 'asc')[0], ['a', '2', '台中']);
});

test('sorting text uses locale order and leaves the input array alone', () => {
  const copy = TABLE.rows.map((row) => [...row]);
  const sorted = sortRows(TABLE.rows, 0, 'asc').map((row) => row[0]);
  assert.deepEqual(sorted, ['a', 'a', 'b', 'c']);
  assert.deepEqual(TABLE.rows, copy);
  // Natural order: item2 before item10.
  const natural = sortRows([['item10'], ['item2']], 0, 'asc').map((row) => row[0]);
  assert.deepEqual(natural, ['item2', 'item10']);
});

test('columns can be picked and reordered', () => {
  assert.deepEqual(selectColumns(TABLE, [2, 0]), {
    columns: ['city', 'name'],
    rows: [['台北', 'b'], ['台中', 'a'], ['台北', 'c'], ['台中', 'a']],
  });
  assert.deepEqual(selectColumns(TABLE, [9]).columns, []);
});

test('transposing twice returns the original shape', () => {
  const once = transpose(TABLE);
  assert.deepEqual(once.columns, ['column', 'row_1', 'row_2', 'row_3', 'row_4']);
  assert.deepEqual(once.rows[0], ['name', 'b', 'a', 'c', 'a']);
  // Transposing back puts the old column names in the first row rather than
  // throwing them away, so nothing is lost on the way out and back.
  const twice = transpose(once);
  assert.deepEqual(twice.rows[0], ['column', 'name', 'qty', 'city']);
  assert.deepEqual(twice.rows.slice(1).map((row) => row.slice(1)), TABLE.rows);
  assert.deepEqual(twice.rows.slice(1).map((row) => row[0]), ['row_1', 'row_2', 'row_3', 'row_4']);
});

test('dedupe drops later duplicates and counts them', () => {
  const all = dedupe(TABLE, []);
  assert.equal(all.removed, 1);
  assert.deepEqual(all.table.rows.length, 3);
  const byCity = dedupe(TABLE, [2]);
  assert.equal(byCity.removed, 2);
  assert.deepEqual(byCity.table.rows.map((row) => row[2]), ['台北', '台中']);
  // Cells that concatenate to the same text are still different rows.
  const tricky: Table = { columns: ['a', 'b'], rows: [['x', 'y'], ['xy', '']] };
  assert.equal(dedupe(tricky, []).removed, 0);
});

test('filtering matches any column, or one named column', () => {
  assert.equal(filterRows(TABLE, '台北', null).rows.length, 2);
  assert.equal(filterRows(TABLE, '台北', 0).rows.length, 0);
  assert.equal(filterRows(TABLE, '台北', 2).rows.length, 2);
  assert.equal(filterRows(TABLE, 'A', 0).rows.length, 2);
  assert.equal(filterRows(TABLE, '   ', null).rows.length, 4);
});

/* ── Statistics ───────────────────────────── */

test('a numeric column reports its distribution', () => {
  const stats = columnStats({ columns: ['n'], rows: [['1'], ['2'], ['3'], ['4']] }, 0);
  assert.equal(stats.count, 4);
  assert.equal(stats.numeric, 4);
  assert.equal(stats.min, 1);
  assert.equal(stats.max, 4);
  assert.equal(stats.sum, 10);
  assert.equal(stats.mean, 2.5);
  // Even count: the median is the mean of the middle two.
  assert.equal(stats.median, 2.5);
  const odd = columnStats({ columns: ['n'], rows: [['1'], ['5'], ['3']] }, 0);
  assert.equal(odd.median, 3);
});

test('a mixed column reports how many cells were numeric, not a verdict', () => {
  const stats = columnStats({ columns: ['n'], rows: [['1'], ['oops'], ['3'], ['']] }, 0);
  assert.equal(stats.count, 4);
  assert.equal(stats.numeric, 2);
  assert.equal(stats.blank, 1);
  assert.equal(stats.sum, 4);
  assert.equal(stats.distinct, 4);
  assert.equal(stats.shortest, 1);
  assert.equal(stats.longest, 4);
});

test('the most frequent values are reported, blanks excluded', () => {
  const stats = columnStats({ columns: ['c'], rows: [['a'], ['a'], ['b'], [''], ['']] }, 0);
  assert.deepEqual(stats.top, [{ value: 'a', n: 2 }, { value: 'b', n: 1 }]);
  assert.equal(stats.blank, 2);
  // A blank still counts as a distinct value of the column.
  assert.equal(stats.distinct, 3);
});

test('an empty column has no numeric summary at all', () => {
  const stats = columnStats({ columns: ['c'], rows: [[''], ['']] }, 0);
  assert.equal(stats.numeric, 0);
  assert.equal(stats.min, undefined);
  assert.equal(stats.mean, undefined);
  assert.equal(stats.shortest, undefined);
  assert.deepEqual(stats.top, []);
  assert.equal(columnStats({ columns: [], rows: [] }, 0).name, 'column_1');
});

/* ── Output ───────────────────────────────── */

test('CSV output round-trips through the parser', () => {
  const nasty: Table = {
    columns: ['a', 'b'],
    rows: [['x,y', 'say "hi"'], ['two\nlines', ''], ['中文', '🔑']],
  };
  const text = toCsv(nasty);
  assert.deepEqual(toTable(parse(text), true), nasty);
  assert.equal(toCsv({ columns: ['a', 'b'], rows: [['1', '2']] }, '\t'), 'a\tb\n1\t2');
});

test('JSON and Markdown output keep every cell', () => {
  const table: Table = { columns: ['a', 'b'], rows: [['1', 'x|y']] };
  assert.equal(toJson(table, 0), '[{"a":"1","b":"x|y"}]');
  assert.equal(toMarkdown(table), '| a | b |\n| --- | --- |\n| 1 | x\\|y |');
  assert.equal(toMarkdown({ columns: ['a'], rows: [['two\nlines']] }), '| a |\n| --- |\n| two lines |');
  assert.equal(toJson({ columns: [], rows: [] }, 0), '[]');
});

test('counts and ragged-row detection', () => {
  assert.equal(countCells(TABLE), 12);
  assert.equal(countCells({ columns: [], rows: [] }), 0);
  assert.deepEqual(raggedRows(parse('a,b\n1,2\n3\n4,5,6')), [3, 4]);
  assert.deepEqual(raggedRows(parse('a,b\n1,2')), []);
  assert.deepEqual(raggedRows([]), []);
});
