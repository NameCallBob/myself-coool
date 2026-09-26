import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConvertError,
  FORMATS,
  MAX_DEPTH,
  MAX_INPUT,
  convert,
  parse,
  parseCsv,
  parseJson,
  parseQuery,
  parseToml,
  parseXml,
  parseYaml,
  shape,
  sortDeep,
  stringify,
  stringifyCsv,
  stringifyJson,
  stringifyQuery,
  stringifyToml,
  stringifyXml,
  stringifyYaml,
  type Json,
} from './logic.ts';

/* ── The table of formats ─────────────────── */

test('the format list is the six formats, once each', () => {
  assert.deepEqual(FORMATS, ['json', 'yaml', 'toml', 'xml', 'csv', 'query']);
  assert.equal(new Set(FORMATS).size, FORMATS.length);
  assert.ok(MAX_INPUT > 0 && MAX_DEPTH > 0);
});

/* ── JSON ─────────────────────────────────── */

test('JSON parses, and a syntax error comes back with a line and column', () => {
  assert.deepEqual(parseJson('{"a":[1,2],"b":null}').value, { a: [1, 2], b: null });
  assert.deepEqual(parseJson('  "just a string"  ').value, 'just a string');
  assert.deepEqual(parseJson('[]').value, []);

  assert.throws(() => parseJson(''), ConvertError);
  try {
    parseJson('{\n  "a": 1,\n  "b": ,\n}');
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof ConvertError);
    assert.equal(error.format, 'json');
    // The offending comma is on line 3; the engine gives an offset, we give a line.
    assert.equal(error.line, 3);
    assert.ok((error.column ?? 0) > 0);
  }
});

test('the JSON position scanner finds each kind of syntax error', () => {
  const at = (source: string): [number, number] => {
    try {
      parseJson(source);
    } catch (error) {
      assert.ok(error instanceof ConvertError);
      return [error.line ?? 0, error.column ?? 0];
    }
    throw new Error('should have thrown');
  };
  assert.deepEqual(at('{"a" 1}'), [1, 6]); // missing colon
  assert.deepEqual(at('{a: 1}'), [1, 2]); // unquoted key
  assert.deepEqual(at('[1, 2,]'), [1, 7]); // trailing comma
  assert.deepEqual(at('{"a": 1} extra'), [1, 10]); // content after the document
  assert.deepEqual(at('"a\tb"'), [1, 3]); // a raw tab inside a string
  assert.deepEqual(at('"bad \\q"'), [1, 7]); // unknown escape
  assert.deepEqual(at('"bad \\u00zz"'), [1, 8]); // short \u
  assert.deepEqual(at('{"a": 01}'), [1, 8]); // leading zero
  assert.deepEqual(at('[1,\n 2\n'), [3, 1]); // unclosed array, reported at the end
  assert.deepEqual(at('"unclosed'), [1, 10]);
});

test('JSON output honours indent and key sorting, and refuses NaN', () => {
  assert.equal(stringifyJson({ b: 1, a: 2 }), '{\n  "b": 1,\n  "a": 2\n}');
  assert.equal(stringifyJson({ b: 1, a: 2 }, { sortKeys: true }), '{\n  "a": 2,\n  "b": 1\n}');
  assert.equal(stringifyJson([1], { indent: 0 }), '[1]');
  assert.equal(stringifyJson('中文 😀'), '"中文 😀"');
  assert.throws(() => stringifyJson({ a: Number.NaN }), ConvertError);
  assert.throws(() => stringifyJson({ a: [Infinity] }), ConvertError);
});

test('sortDeep sorts every level and leaves scalars and array order alone', () => {
  assert.deepEqual(sortDeep({ c: 1, a: { z: 1, y: [3, 1, 2] } }), {
    a: { y: [3, 1, 2], z: 1 },
    c: 1,
  });
  assert.equal(JSON.stringify(sortDeep({ b: 1, a: 2 })), '{"a":2,"b":1}');
  assert.deepEqual(sortDeep(null), null);
  assert.deepEqual(sortDeep([2, 1]), [2, 1]);
});

/* ── YAML ─────────────────────────────────── */

test('YAML reads the block shapes configuration files actually use', () => {
  const source = [
    '# a comment',
    '---',
    'name: hex viewer',
    'port: 8080',
    'debug: true',
    'empty:',
    'nested:',
    '  deep:',
    '    key: "v: 1"',
    'indented:',
    '  - a',
    '  - b',
    'same-indent:',
    '- 1',
    '- 2',
    'records:',
    '  - id: 1',
    '    tag: x',
    '  - id: 2',
    '    tag: y',
    'trailing: value   # note',
  ].join('\n');
  assert.deepEqual(parseYaml(source).value, {
    name: 'hex viewer',
    port: 8080,
    debug: true,
    empty: null,
    nested: { deep: { key: 'v: 1' } },
    indented: ['a', 'b'],
    'same-indent': [1, 2],
    records: [
      { id: 1, tag: 'x' },
      { id: 2, tag: 'y' },
    ],
    trailing: 'value',
  });
});

test('YAML scalar typing is narrow on purpose', () => {
  const value = parseYaml(
    [
      'a: ~',
      'b: null',
      'c: NULL',
      'd: true',
      'e: False',
      'f: 42',
      'g: -7',
      'h: 3.5',
      'i: 1.5e3',
      'j: 0x1f',
      'k: yes',
      'l: "007"',
      'm: 007',
      'n: 2026-09-26',
      'o: don%27t',
      "p: it's fine",
      "q: 'quoted ''inner'''",
      'r: "tab\\there\\nnewline \\u4e2d"',
      's: 😀 中文',
    ].join('\n')
  ).value;
  assert.deepEqual(value, {
    a: null,
    b: null,
    c: null,
    d: true,
    e: false,
    f: 42,
    g: -7,
    h: 3.5,
    i: 1500,
    j: 31,
    // YAML 1.1's yes/no stay strings: guessing there is how a country code
    // becomes a boolean.
    k: 'yes',
    l: '007',
    m: 7,
    n: '2026-09-26',
    o: 'don%27t',
    p: "it's fine",
    q: "quoted 'inner'",
    r: 'tab\there\nnewline 中',
    s: '😀 中文',
  });
});

test('YAML flow collections parse, nested and empty', () => {
  assert.deepEqual(parseYaml('a: [1, 2, three]\nb: {x: 1, y: "two"}\n').value, {
    a: [1, 2, 'three'],
    b: { x: 1, y: 'two' },
  });
  assert.deepEqual(parseYaml('a: []\nb: {}\nc: [[1, 2], {d: [3]}]\n').value, {
    a: [],
    b: {},
    c: [[1, 2], { d: [3] }],
  });
  assert.throws(() => parseYaml('a: [1, 2\n'), ConvertError);
  assert.throws(() => parseYaml('a: [1] extra\n'), ConvertError);
});

test('YAML sequences nest, and a bare scalar document is a value', () => {
  assert.deepEqual(parseYaml('- - 1\n  - 2\n- 3\n').value, [[1, 2], 3]);
  assert.deepEqual(parseYaml('- a\n- b\n').value, ['a', 'b']);
  assert.deepEqual(parseYaml('42\n').value, 42);
  assert.deepEqual(parseYaml('').value, null);
  assert.deepEqual(parseYaml('# only a comment\n').value, null);
  assert.deepEqual(parseYaml('a:\n  - x\nb: 1\n').value, { a: ['x'], b: 1 });
});

test('YAML handles CRLF the same as LF', () => {
  assert.deepEqual(parseYaml('a: 1\r\nb:\r\n  - x\r\n').value, { a: 1, b: ['x'] });
});

test('YAML refuses every construct outside the subset, by name', () => {
  const cases: [string, RegExp][] = [
    ['a: |\n  block\n', /區塊純量/],
    ['a: >\n  folded\n', /區塊純量/],
    ['a: &anchor 1\n', /錨點/],
    ['a: *ref\n', /錨點/],
    ['a: !!str 1\n', /標籤/],
    ['a: 1\n---\nb: 2\n', /多份文件/],
    ['a:\n\tb: 1\n', /tab/],
    ['? a\n: b\n', /複合鍵/],
    ['<<: x\n', /合併鍵/],
    ['a: 1\na: 2\n', /兩次/],
    ['a: "unclosed\n', /引號/],
    ['a: 1\n    b: 2\n', /縮排/],
  ];
  for (const [source, pattern] of cases) {
    assert.throws(
      () => parseYaml(source),
      (error: unknown) =>
        error instanceof ConvertError && error.format === 'yaml' && pattern.test(error.message),
      `expected ${pattern} for ${JSON.stringify(source)}`
    );
  }
});

test('YAML output quotes exactly what has to be quoted', () => {
  assert.equal(
    stringifyYaml({
      plain: 'text',
      empty: '',
      numberish: '1',
      boolish: 'true',
      norway: 'no',
      colon: 'a: b',
      hash: 'a #b',
      dash: '-x',
      space: ' pad ',
      newline: 'a\nb',
      cjk: '中文',
    }),
    [
      'plain: text',
      'empty: ""',
      'numberish: "1"',
      'boolish: "true"',
      'norway: "no"',
      'colon: "a: b"',
      'hash: "a #b"',
      'dash: "-x"',
      'space: " pad "',
      'newline: "a\\nb"',
      'cjk: 中文',
      '',
    ].join('\n')
  );
  assert.equal(stringifyYaml({ a: [], b: {} }), 'a: []\nb: {}\n');
  assert.equal(stringifyYaml([1, [2]]), '- 1\n- - 2\n');
  assert.equal(stringifyYaml(null), 'null\n');
  assert.throws(() => stringifyYaml({ a: Infinity }), ConvertError);
});

test('YAML survives a round trip through its own output', () => {
  const value: Json = {
    a: 1,
    b: ['x', { y: 2, z: [1, 2] }],
    c: null,
    d: 'yes',
    e: '',
    f: '1',
    g: 'a: b',
    h: { i: { j: [] } },
    k: '中文 😀',
  };
  assert.deepEqual(parseYaml(stringifyYaml(value)).value, value);
});

/* ── TOML ─────────────────────────────────── */

test('TOML reads tables, dotted keys, arrays of tables and typed values', () => {
  const source = [
    '# comment',
    'title = "TOML demo"',
    'n = 1_000',
    'hex = 0xFF',
    'oct = 0o17',
    'bin = 0b101',
    'f = 3.14',
    'sci = 1e3',
    'neg = -0.5',
    'b = true',
    'lit = \'C:\\path\\n\'',
    'esc = "tab\\there \\u4e2d"',
    'arr = [1, 2, 3]',
    'multi = [',
    '  "a", # inline note',
    '  "b",',
    ']',
    'inline = { x = 1, y = "z" }',
    'when = 1979-05-27T07:32:00Z',
    'day = 1979-05-27',
    'dotted.a.b = 5',
    '',
    '[server]',
    'host = "localhost"',
    'ports = [80, 443]',
    '',
    '[server.tls]',
    'on = false',
    '',
    '[[fruit]]',
    'name = "apple"',
    '',
    '[[fruit]]',
    'name = "banana"',
  ].join('\n');
  const result = parseToml(source);
  assert.deepEqual(result.value, {
    title: 'TOML demo',
    n: 1000,
    hex: 255,
    oct: 15,
    bin: 5,
    f: 3.14,
    sci: 1000,
    neg: -0.5,
    b: true,
    lit: 'C:\\path\\n',
    esc: 'tab\there 中',
    arr: [1, 2, 3],
    multi: ['a', 'b'],
    inline: { x: 1, y: 'z' },
    when: '1979-05-27T07:32:00Z',
    day: '1979-05-27',
    dotted: { a: { b: 5 } },
    server: { host: 'localhost', ports: [80, 443], tls: { on: false } },
    fruit: [{ name: 'apple' }, { name: 'banana' }],
  });
  // Dates have nowhere to live in the JSON model, so the loss is reported.
  assert.ok(result.warnings.some((line) => line.includes('日期')));
});

test('TOML refuses what it does not implement, and what the spec forbids', () => {
  const cases: [string, RegExp][] = [
    ['a = """\nmulti\n"""\n', /多行字串/],
    ["a = '''\nmulti\n'''\n", /多行字串/],
    ['a = 007\n', /前導零/],
    ['a = 1\na = 2\n', /重複/],
    ['[x]\ny = 1\n[x]\nz = 2\n', /重複/],
    ['a = 1\n[a]\nb = 2\n', /不能再當表/],
    ['a = \n', /沒有值/],
    ['just a line\n', /key = value/],
    ['a = [1, 2\n', /沒有收尾/],
    ['a = "x" trailing\n', /多餘/],
    ['a = 1 # ok\nb = @\n', /讀不出/],
    ['a = { x = 1 }\na.y = 2\n', /行內表/],
    ['[a\nb = 1\n', /表頭/],
  ];
  for (const [source, pattern] of cases) {
    assert.throws(
      () => parseToml(source),
      (error: unknown) =>
        error instanceof ConvertError && error.format === 'toml' && pattern.test(error.message),
      `expected ${pattern} for ${JSON.stringify(source)}`
    );
  }
});

test('TOML records the line a problem is on', () => {
  try {
    parseToml('a = 1\nb = 2\nc = 007\n');
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof ConvertError);
    assert.equal(error.line, 3);
  }
});

test('TOML output puts scalars before tables and quotes keys when needed', () => {
  assert.equal(
    stringifyToml({
      a: 1,
      s: 'x"y',
      'needs quote': true,
      arr: [1, 2],
      t: { b: true, deep: { c: 'd' } },
      tables: [{ n: 1 }, { n: 2 }],
      empty: {},
      mixed: [1, { x: 2 }],
    }),
    [
      'a = 1',
      's = "x\\"y"',
      '"needs quote" = true',
      'arr = [1, 2]',
      'mixed = [1, { x = 2 }]',
      '',
      '[t]',
      'b = true',
      '',
      '[t.deep]',
      'c = "d"',
      '',
      '[[tables]]',
      'n = 1',
      '',
      '[[tables]]',
      'n = 2',
      '',
      '[empty]',
      '',
    ].join('\n')
  );
  assert.equal(stringifyToml({ inf: Infinity, nan: Number.NaN }), 'inf = inf\nnan = nan\n');
  assert.throws(() => stringifyToml({ a: null }), /null/);
  assert.throws(() => stringifyToml([1, 2]), /最外層/);
  assert.throws(() => stringifyToml('x'), /最外層/);
});

test('TOML survives a round trip through its own output', () => {
  const value: Json = {
    a: 1,
    b: 'x"y\n中',
    c: true,
    d: [1, 2.5],
    e: { f: { g: 'h' } },
    list: [{ n: 1 }, { n: 2 }],
  };
  assert.deepEqual(parseToml(stringifyToml(value)).value, value);
});

/* ── XML ──────────────────────────────────── */

test('XML reads elements, attributes, CDATA, comments and entities', () => {
  const source = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- a comment -->',
    '<root id="7" flag="a&amp;b">',
    '  <item>1</item>',
    '  <item>2</item>',
    '  <only>text</only>',
    '  <empty/>',
    '  <mixed k="v">inner</mixed>',
    '  <cd><![CDATA[<raw> & stuff]]></cd>',
    '  <num>&#20013;&#x6587;</num>',
    '</root>',
  ].join('\n');
  assert.deepEqual(parseXml(source).value, {
    root: {
      '@id': '7',
      '@flag': 'a&b',
      item: ['1', '2'],
      only: 'text',
      empty: '',
      mixed: { '@k': 'v', '#text': 'inner' },
      cd: '<raw> & stuff',
      num: '中文',
    },
  });
  // The one-element-or-list ambiguity is stated rather than hidden.
  assert.ok(parseXml('<a><b/></a>').warnings.length > 0);
});

test('XML text stays text unless coercion is asked for', () => {
  assert.deepEqual(parseXml('<a><n>12</n><b>true</b><z>007</z></a>').value, {
    a: { n: '12', b: 'true', z: '007' },
  });
  assert.deepEqual(parseXml('<a><n>12</n><b>true</b><z>007</z></a>', { coerce: true }).value, {
    a: { n: 12, b: true, z: '007' },
  });
});

test('XML refuses malformed input and the constructs it does not implement', () => {
  const cases: [string, RegExp][] = [
    ['<!DOCTYPE note><a/>', /DOCTYPE/],
    ['<a><b></c></a>', /結尾標籤/],
    ['<a>&nbsp;</a>', /實體/],
    ['<a/><b/>', /一個根元素/],
    ['<a', /沒有收尾/],
    ['<a b=c/>', /引號/],
    ['<a b/>', /少了 =/],
    ['<1a/>', /不合法/],
    ['', /沒有內容/],
    ['<a><!-- open</a>', /註解/],
    ['<a x="1" x="2"/>', /重複/],
  ];
  for (const [source, pattern] of cases) {
    assert.throws(
      () => parseXml(source),
      (error: unknown) =>
        error instanceof ConvertError && error.format === 'xml' && pattern.test(error.message),
      `expected ${pattern} for ${JSON.stringify(source)}`
    );
  }
});

test('XML output escapes, nests, and picks the root from a single top key', () => {
  assert.equal(
    stringifyXml({ root: { '@id': '7', item: [1, 2], nested: { a: 'x<y' }, e: null } }),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root id="7">',
      '  <item>1</item>',
      '  <item>2</item>',
      '  <nested>',
      '    <a>x&lt;y</a>',
      '  </nested>',
      '  <e/>',
      '</root>',
      '',
    ].join('\n')
  );
  assert.equal(
    stringifyXml([1, 2]),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <item>1</item>\n  <item>2</item>\n</root>\n'
  );
  assert.equal(
    stringifyXml({ a: 1, b: 2 }, { xmlRoot: 'doc' }),
    '<?xml version="1.0" encoding="UTF-8"?>\n<doc>\n  <a>1</a>\n  <b>2</b>\n</doc>\n'
  );
  assert.ok(stringifyXml({ q: 'a"b & c' }).includes('a"b &amp; c'));
  assert.throws(() => stringifyXml({ '1bad': 1 }), /元素名稱/);
  assert.throws(() => stringifyXml({ a: { '@x': { deep: 1 } } }), /屬性/);
});

test('XML survives a round trip for the shapes it can represent', () => {
  const source = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<root id="7">',
    '  <item>1</item>',
    '  <item>2</item>',
    '  <nested>',
    '    <a>x</a>',
    '  </nested>',
    '</root>',
    '',
  ].join('\n');
  assert.equal(stringifyXml(parseXml(source).value), source);
});

/* ── CSV ──────────────────────────────────── */

test('CSV follows RFC 4180 on quotes, embedded delimiters and CRLF', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"x,y","line\nbreak"\n2,"he said ""hi""",\n').value, [
    { a: '1', b: 'x,y', c: 'line\nbreak' },
    { a: '2', b: 'he said "hi"', c: '' },
  ]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n').value, [{ a: '1', b: '2' }]);
  assert.deepEqual(parseCsv('\uFEFFa\n1\n').value, [{ a: '1' }]);
  assert.deepEqual(parseCsv('a;b\n1;2\n', { csvDelimiter: ';' }).value, [{ a: '1', b: '2' }]);
  assert.deepEqual(parseCsv('1,2\n3,4\n', { csvHeader: false }).value, [
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.deepEqual(parseCsv('').value, []);
  assert.deepEqual(parseCsv('a,b\n中文,😀\n').value, [{ a: '中文', b: '😀' }]);
  assert.throws(() => parseCsv('a\n"unclosed\n'), ConvertError);
});

test('CSV says out loud when it had to guess', () => {
  const ragged = parseCsv('a,b\n1\n1,2,3\n');
  assert.deepEqual(ragged.value, [
    { a: '1', b: '' },
    { a: '1', b: '2', column_3: '3' },
  ]);
  assert.equal(ragged.warnings.length, 1);

  const duplicate = parseCsv('a,a,\n1,2,3\n');
  assert.deepEqual(duplicate.value, [{ a: '1', a_2: '2', column_3: '3' }]);
  assert.equal(duplicate.warnings.length, 2);

  assert.deepEqual(parseCsv('a,b\n1,true\n', { coerce: true }).value, [{ a: 1, b: true }]);
  assert.deepEqual(parseCsv('a\n007\n', { coerce: true }).value, [{ a: '007' }]);
});

test('CSV output unions the columns and quotes what needs it', () => {
  assert.equal(stringifyCsv([{ a: 1, b: 'x,y' }, { a: 2, c: true }]), 'a,b,c\n1,"x,y",\n2,,true\n');
  assert.equal(stringifyCsv([{ a: 'he "said"' }]), 'a\n"he ""said"""\n');
  assert.equal(stringifyCsv([{ a: ' pad ' }]), 'a\n" pad "\n');
  assert.equal(stringifyCsv([{ a: { n: 1 } }]), 'a\n"{""n"":1}"\n');
  assert.equal(stringifyCsv([[1, 2], [3, 4]]), '1,2\n3,4\n');
  assert.equal(stringifyCsv(['x', 1, null]), 'value\nx\n1\n\n');
  assert.equal(stringifyCsv([{ a: 1 }], { csvHeader: false }), '1\n');
  assert.equal(stringifyCsv([]), '');
  assert.throws(() => stringifyCsv({ a: 1 }), /最外層/);
  assert.throws(() => stringifyCsv([1, { a: 2 }]), /一致/);
});

test('CSV survives a round trip for flat rows', () => {
  const rows: Json = [
    { a: '1', b: 'x,y' },
    { a: '2', b: 'he "said"' },
  ];
  assert.deepEqual(parseCsv(stringifyCsv(rows)).value, rows);
});

/* ── Query strings ────────────────────────── */

test('query strings parse repeated keys, brackets and percent encoding', () => {
  assert.deepEqual(
    parseQuery('?a=1&b=hello+world&c=%E4%B8%AD&a=2&d[e]=3&d[f]=4&g[]=x&g[]=y&h[0]=z').value,
    {
      a: ['1', '2'],
      b: 'hello world',
      c: '中',
      d: { e: '3', f: '4' },
      g: ['x', 'y'],
      h: ['z'],
    }
  );
  assert.deepEqual(parseQuery('').value, {});
  assert.deepEqual(parseQuery('a=').value, { a: '' });
  assert.deepEqual(parseQuery('a%5Bb%5D=1').value, { 'a[b]': '1' });
  const bare = parseQuery('flag');
  assert.deepEqual(bare.value, { flag: '' });
  assert.equal(bare.warnings.length, 1);
  assert.throws(() => parseQuery('a=%E4%B8'), /百分比/);
  assert.throws(() => parseQuery('=1'), /沒有鍵/);
  assert.throws(() => parseQuery('a=1&a[b]=2'), /容器/);
});

test('query string output uses numeric indices and escapes literal brackets', () => {
  assert.equal(
    stringifyQuery({ a: ['1', '2'], b: { c: 'd e' }, n: null, 'k[x]': 1 }),
    'a[0]=1&a[1]=2&b[c]=d%20e&n=&k%5Bx%5D=1'
  );
  assert.equal(stringifyQuery({}), '');
  assert.equal(stringifyQuery(['x']), '0=x');
  assert.equal(stringifyQuery({ q: '中 文' }), 'q=%E4%B8%AD%20%E6%96%87');
  assert.throws(() => stringifyQuery('x'), /最外層/);
  assert.throws(() => stringifyQuery({ a: Infinity }), /無限值/);
});

test('query strings survive a round trip', () => {
  const value: Json = { a: ['1', '2'], b: { c: 'd e' }, plain: '中' };
  assert.deepEqual(parseQuery(stringifyQuery(value)).value, value);
});

/* ── Dispatcher, limits, measurements ─────── */

test('parse and stringify dispatch to every format', () => {
  assert.deepEqual(parse('{"a":1}', 'json').value, { a: 1 });
  assert.deepEqual(parse('a: 1\n', 'yaml').value, { a: 1 });
  assert.deepEqual(parse('a = 1\n', 'toml').value, { a: 1 });
  assert.deepEqual(parse('<r><a>1</a></r>', 'xml').value, { r: { a: '1' } });
  assert.deepEqual(parse('a\n1\n', 'csv').value, [{ a: '1' }]);
  assert.deepEqual(parse('a=1', 'query').value, { a: '1' });

  assert.equal(stringify({ a: 1 }, 'json', { indent: 0 }), '{"a":1}');
  assert.equal(stringify({ a: 1 }, 'yaml'), 'a: 1\n');
  assert.equal(stringify({ a: 1 }, 'toml'), 'a = 1\n');
  assert.ok(stringify({ a: 1 }, 'xml').includes('<a>1</a>'));
  assert.equal(stringify([{ a: 1 }], 'csv'), 'a\n1\n');
  assert.equal(stringify({ a: 1 }, 'query'), 'a=1');
});

test('parse refuses an input over the ceiling instead of freezing', () => {
  const huge = `a: ${'x'.repeat(MAX_INPUT)}`;
  assert.throws(
    () => parse(huge, 'yaml'),
    (error: unknown) => error instanceof ConvertError && /上限/.test(error.message)
  );
});

test('nesting past the depth ceiling is refused for input and output', () => {
  const deepJson = `${'['.repeat(MAX_DEPTH + 5)}1${']'.repeat(MAX_DEPTH + 5)}`;
  assert.throws(() => stringify(parse(deepJson, 'json').value, 'yaml'), /巢狀/);
  let query = 'a';
  for (let i = 0; i < MAX_DEPTH + 5; i += 1) query += '[k]';
  assert.throws(() => parse(`${query}=1`, 'query'), /巢狀/);
});

test('convert carries the value and the warnings through', () => {
  assert.equal(convert('{"a":[1,{"b":"x"}]}', 'json', 'yaml').text, 'a:\n  - 1\n  - b: x\n');
  assert.equal(convert('a: 1\nb:\n  c: x\n', 'yaml', 'toml').text, 'a = 1\n\n[b]\nc = "x"\n');
  assert.equal(convert('a,b\n1,2\n', 'csv', 'query').text, '0[a]=1&0[b]=2');
  assert.deepEqual(convert('a=1&b[c]=2', 'query', 'json', { indent: 0 }).value, {
    a: '1',
    b: { c: '2' },
  });
  const withWarning = convert('a,a\n1,2\n', 'csv', 'json');
  assert.ok(withWarning.warnings.length > 0);
  // Failures keep the format of the side that failed, so the UI can point at it.
  assert.throws(
    () => convert('a: [1', 'yaml', 'json'),
    (error: unknown) => error instanceof ConvertError && error.format === 'yaml'
  );
  assert.throws(
    () => convert('[1,2]', 'json', 'toml'),
    (error: unknown) => error instanceof ConvertError && error.format === 'toml'
  );
});

test('shape measures kind, keys, nodes, leaves and depth', () => {
  assert.deepEqual(shape({ a: [1, 2, { b: null }] }), {
    kind: 'object',
    keys: 2,
    nodes: 6,
    leaves: 3,
    depth: 4,
  });
  assert.deepEqual(shape(null), { kind: 'null', keys: 0, nodes: 1, leaves: 1, depth: 1 });
  assert.deepEqual(shape('x'), { kind: 'string', keys: 0, nodes: 1, leaves: 1, depth: 1 });
  assert.deepEqual(shape(1), { kind: 'number', keys: 0, nodes: 1, leaves: 1, depth: 1 });
  assert.deepEqual(shape(true), { kind: 'boolean', keys: 0, nodes: 1, leaves: 1, depth: 1 });
  assert.deepEqual(shape([]), { kind: 'array', keys: 0, nodes: 1, leaves: 0, depth: 1 });
});

test('a key named __proto__ stays a key and never touches the prototype', () => {
  for (const [source, format] of [
    ['__proto__: 1\nsafe: 2\n', 'yaml'],
    ['__proto__ = 1\nsafe = 2\n', 'toml'],
    ['__proto__=1&safe=2', 'query'],
  ] as [string, 'yaml' | 'toml' | 'query'][]) {
    const value = parse(source, format).value as { [key: string]: Json };
    assert.deepEqual(Object.keys(value).sort(), ['__proto__', 'safe']);
    assert.ok(Object.prototype.hasOwnProperty.call(value, '__proto__'));
    assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  }
  const csv = parseCsv('__proto__\n1\n').value as { [key: string]: Json }[];
  assert.ok(Object.prototype.hasOwnProperty.call(csv[0], '__proto__'));
});
