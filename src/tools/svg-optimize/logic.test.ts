import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ATTRS,
  DEFAULT_OPTIONS,
  EDITOR_PREFIXES,
  MAX_DEPTH,
  MAX_NODES,
  MAX_SOURCE,
  SvgSyntaxError,
  locate,
  optimizeSvg,
  parsePath,
  parseXml,
  roundNumber,
  serializePath,
  serializeXml,
  utf8Bytes,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULT_OPTIONS, ...patch });

/** Optimise and fail the test if the input did not even parse. */
function run(source: string, patch: Partial<Options> = {}) {
  const outcome = optimizeSvg(source, options(patch));
  assert.equal(outcome.ok, true, `expected a parse: ${JSON.stringify(outcome)}`);
  if (!outcome.ok) throw new Error('unreachable');
  return outcome;
}

/* ── locate ───────────────────────────────── */

test('locate reports 1-based line and column', () => {
  assert.deepEqual(locate('abc', 0), { line: 1, column: 1 });
  assert.deepEqual(locate('abc', 2), { line: 1, column: 3 });
  assert.deepEqual(locate('a\nbc', 2), { line: 2, column: 1 });
  assert.deepEqual(locate('a\r\nbc', 3), { line: 2, column: 1 });
  assert.deepEqual(locate('a\nb\nc', 4), { line: 3, column: 1 });
  // Out of range clamps rather than throwing.
  assert.deepEqual(locate('ab', 99), { line: 1, column: 3 });
  assert.deepEqual(locate('ab', -5), { line: 1, column: 1 });
});

/* ── parser ───────────────────────────────── */

test('parseXml reads elements, attributes and children', () => {
  const doc = parseXml('<svg width="10" height="20"><path d="M0 0"/></svg>');
  assert.equal(doc.children.length, 1);
  const svg = doc.children[0];
  assert.equal(svg.kind, 'element');
  if (svg.kind !== 'element') throw new Error('unreachable');
  assert.equal(svg.name, 'svg');
  assert.deepEqual(
    svg.attrs.map((a) => [a.name, a.value]),
    [
      ['width', '10'],
      ['height', '20'],
    ]
  );
  assert.equal(svg.children.length, 1);
});

test('parseXml keeps the pieces that are not elements', () => {
  const doc = parseXml(
    '<?xml version="1.0"?><!DOCTYPE svg><!--note--><svg><style><![CDATA[a{fill:red}]]></style>tail</svg>'
  );
  assert.deepEqual(
    doc.children.map((node) => node.kind),
    ['pi', 'doctype', 'comment', 'element']
  );
  const svg = doc.children[3];
  if (svg.kind !== 'element') throw new Error('unreachable');
  assert.deepEqual(
    svg.children.map((node) => node.kind),
    ['element', 'text']
  );
});

test('parseXml preserves quoting, entities, CJK and CRLF verbatim', () => {
  const source = '<svg data-a=\'he said "hi"\'>\r\n  <title>中文 &amp; emoji 😀</title>\r\n</svg>';
  const doc = parseXml(source);
  assert.equal(serializeXml(doc), source, 'parse then serialize must be byte-identical');
});

test('parseXml round-trips a realistic file byte for byte', () => {
  const source =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n' +
    '  <!-- drawn by hand -->\n' +
    '  <g fill="none" stroke="currentColor">\n' +
    '    <path d="M4 4h16v16H4z"/>\n' +
    '    <circle cx="12" cy="12" r="3"/>\n' +
    '  </g>\n' +
    '</svg>\n';
  assert.equal(serializeXml(parseXml(source)), source);
});

test('parseXml accepts a valueless attribute and re-emits it empty', () => {
  assert.equal(serializeXml(parseXml('<svg hidden></svg>')), '<svg hidden=""/>');
  assert.equal(serializeXml(parseXml('<svg a=b/>')), '<svg a="b"/>');
});

test('parseXml refuses markup that would draw the wrong thing', () => {
  const bad: [string, string][] = [
    ['<svg><g></svg>', 'mismatched-tag'],
    ['<svg></g></svg>', 'mismatched-tag'],
    ['</svg>', 'stray-close'],
    ['<svg><g>', 'unclosed-tag'],
    ['<svg><!-- open', 'unterminated'],
    ['<svg><![CDATA[open', 'unterminated'],
    ['<svg><?pi open', 'unterminated'],
    ['<!DOCTYPE open', 'unterminated'],
    ['<svg a="open>', 'unterminated'],
    ['<svg /x>', 'bad-tag'],
    ['<svg', 'unterminated'],
  ];
  for (const [source, code] of bad) {
    assert.throws(
      () => parseXml(source),
      (error: unknown) => error instanceof SvgSyntaxError && error.code === code,
      `${source} should fail as ${code}`
    );
  }
});

test('parseXml errors carry a position', () => {
  try {
    parseXml('<svg>\n  <g>\n</svg>');
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof SvgSyntaxError);
    assert.equal(error.code, 'mismatched-tag');
    assert.equal(error.line, 3);
    assert.equal(error.column, 1);
  }
});

test('parseXml enforces its ceilings instead of hanging', () => {
  assert.throws(
    () => parseXml('x'.repeat(MAX_SOURCE + 1)),
    (error: unknown) => error instanceof SvgSyntaxError && error.code === 'too-large'
  );
  assert.throws(
    () => parseXml('<a/>'.repeat(MAX_NODES + 1)),
    (error: unknown) => error instanceof SvgSyntaxError && error.code === 'too-many-nodes'
  );
  assert.throws(
    () => parseXml('<g>'.repeat(MAX_DEPTH + 1)),
    (error: unknown) => error instanceof SvgSyntaxError && error.code === 'too-deep'
  );
  // Just inside the ceilings is fine.
  assert.equal(parseXml('<a/>'.repeat(10)).children.length, 10);
});

test('serializeXml collapses an empty pair and picks a quote that survives', () => {
  assert.equal(serializeXml(parseXml('<svg><g></g></svg>')), '<svg><g/></svg>');
  // A double quote in the value forces single quotes.
  assert.equal(serializeXml(parseXml(`<svg a='he said "hi"'/>`)), `<svg a='he said "hi"'/>`);
  // Both quote characters at once cannot come out of a parse — XML has no way
  // to write it — so the escaping branch is checked on a hand-built node.
  const doc = {
    children: [
      {
        kind: 'element' as const,
        name: 'svg',
        attrs: [{ name: 'a', value: `mixed " and '`, quote: '"' as const, pre: ' ' }],
        children: [],
      },
    ],
  };
  assert.equal(serializeXml(doc), `<svg a="mixed &quot; and '"/>`);
});

/* ── numbers ──────────────────────────────── */

test('roundNumber trims, drops the leading zero, and never prints -0', () => {
  assert.equal(roundNumber(1.23456, 2), '1.23');
  assert.equal(roundNumber(0.5, 2), '.5');
  assert.equal(roundNumber(-0.5, 2), '-.5');
  assert.equal(roundNumber(1, 2), '1');
  assert.equal(roundNumber(1.0001, 2), '1');
  assert.equal(roundNumber(0.125, 2), '.13');
  assert.equal(roundNumber(1.5, 0), '2');
  assert.equal(roundNumber(-0.004, 2), '0');
  assert.equal(roundNumber(0, 4), '0');
  assert.equal(roundNumber(-0, 4), '0');
  assert.equal(roundNumber(12345.6789, 0), '12346');
  // Past 1e15 the value is printed as JavaScript writes it, with no rounding
  // left to do: there are no decimals in that magnitude anyway.
  assert.equal(roundNumber(1e16, 2), '10000000000000000');
  assert.throws(() => roundNumber(Number.NaN, 2), RangeError);
  assert.throws(() => roundNumber(Number.POSITIVE_INFINITY, 2), RangeError);
  assert.throws(() => roundNumber(1, -1), RangeError);
  assert.throws(() => roundNumber(1, 9), RangeError);
  assert.throws(() => roundNumber(1, 1.5), RangeError);
});

test('utf8Bytes counts bytes, not characters', () => {
  assert.equal(utf8Bytes(''), 0);
  assert.equal(utf8Bytes('abc'), 3);
  assert.equal(utf8Bytes('é'), 2);
  assert.equal(utf8Bytes('中'), 3);
  assert.equal(utf8Bytes('中文'), 6);
  assert.equal(utf8Bytes('😀'), 4);
  assert.equal(utf8Bytes('a\r\nb'), 4);
  assert.equal(utf8Bytes('a😀中'), 8);
  // Matches what the platform would write out.
  assert.equal(utf8Bytes('中文 😀 ok'), Buffer.byteLength('中文 😀 ok', 'utf8'));
});

/* ── path data ────────────────────────────── */

test('parsePath reads commands, separators and implicit repetition', () => {
  assert.deepEqual(parsePath('M0 0L10 10'), [
    { command: 'M', params: [0, 0] },
    { command: 'L', params: [10, 10] },
  ]);
  // A repeated moveto is a lineto — the reason a regex cannot do this job.
  assert.deepEqual(parsePath('M0 0 10 10'), [
    { command: 'M', params: [0, 0] },
    { command: 'L', params: [10, 10] },
  ]);
  assert.deepEqual(parsePath('m0 0 10 10'), [
    { command: 'm', params: [0, 0] },
    { command: 'l', params: [10, 10] },
  ]);
  assert.deepEqual(parsePath('M0,0 L-1-1'), [
    { command: 'M', params: [0, 0] },
    { command: 'L', params: [-1, -1] },
  ]);
  assert.deepEqual(parsePath('  M 0 0 Z  '), [
    { command: 'M', params: [0, 0] },
    { command: 'Z', params: [] },
  ]);
  assert.deepEqual(parsePath('M1e2 1e-2'), [{ command: 'M', params: [100, 0.01] }]);
  assert.deepEqual(parsePath('M.5.5'), [{ command: 'M', params: [0.5, 0.5] }]);
  assert.deepEqual(parsePath('M1. 2.'), [{ command: 'M', params: [1, 2] }]);
  assert.deepEqual(parsePath('H10 20'), [
    { command: 'H', params: [10] },
    { command: 'H', params: [20] },
  ]);
  assert.deepEqual(parsePath('C1 2 3 4 5 6 7 8 9 10 11 12'), [
    { command: 'C', params: [1, 2, 3, 4, 5, 6] },
    { command: 'C', params: [7, 8, 9, 10, 11, 12] },
  ]);
});

test('parsePath treats arc flags as single characters', () => {
  assert.deepEqual(parsePath('A5 5 0 0 1 10 10'), [{ command: 'A', params: [5, 5, 0, 0, 1, 10, 10] }]);
  // The compact form real files contain: flags glued to the next number.
  assert.deepEqual(parsePath('a5 5 0 0110 10'), [{ command: 'a', params: [5, 5, 0, 0, 1, 10, 10] }]);
  assert.deepEqual(parsePath('a5 5 0 1 0-10 10'), [{ command: 'a', params: [5, 5, 0, 1, 0, -10, 10] }]);
});

test('parsePath rejects what it cannot read', () => {
  for (const bad of ['X0 0', 'M', 'M0', 'M0 0 L', 'A5 5 0 2 1 10 10', 'M0 0 5', '1 2']) {
    assert.throws(
      () => parsePath(bad),
      (error: unknown) => error instanceof SvgSyntaxError && error.code === 'bad-path',
      `${bad} should be rejected`
    );
  }
  assert.deepEqual(parsePath(''), []);
  assert.deepEqual(parsePath('   '), []);
});

test('serializePath rounds, merges repeats, and keeps movetos apart', () => {
  assert.equal(serializePath(parsePath('M0 0 L10 10 L20 20'), 0), 'M0 0L10 10 20 20');
  assert.equal(serializePath(parsePath('M0 0M1 1'), 0), 'M0 0M1 1');
  assert.equal(serializePath(parsePath('M0.12345 0.9999'), 2), 'M.12 1');
  assert.equal(serializePath(parsePath('M0 0L-1 -1'), 0), 'M0 0L-1-1');
  assert.equal(serializePath(parsePath('a5 5 0 0110 10'), 0), 'a5 5 0 0 1 10 10');
  assert.equal(serializePath(parsePath('M0 0Z'), 0), 'M0 0Z');
  assert.equal(serializePath([], 2), '');
});

test('serializePath output always parses back to the same commands', () => {
  const samples = [
    'M0 0 10 10 20 20Z',
    'm.5.5c0 0 .1.2.3.4s1 1 2 2z',
    'M100.123456 200.987654L-0.5-0.25',
    'A5.5 5.5 0 1 0 10.123 10.456',
    'a1 1 0 0110 10 1 1 0 0 1-10-10z',
    'M1e2 1e-2H50V-50',
    'M0 0Q1 1 2 2T3 3',
  ];
  for (const d of samples) {
    const commands = parsePath(d);
    for (const digits of [0, 2, 4, 6]) {
      const text = serializePath(commands, digits);
      const again = parsePath(text);
      assert.equal(again.length, commands.length, `${d} at ${digits}: command count changed (${text})`);
      for (let i = 0; i < commands.length; i += 1) {
        assert.equal(again[i].command, commands[i].command, `${d} at ${digits}: command changed (${text})`);
        assert.equal(again[i].params.length, commands[i].params.length, `${d} at ${digits}: arity changed`);
        for (let k = 0; k < commands[i].params.length; k += 1) {
          const tolerance = 0.5 * 10 ** -digits + 1e-9;
          assert.ok(
            Math.abs(again[i].params[k] - commands[i].params[k]) <= tolerance,
            `${d} at ${digits}: param ${k} moved too far (${text})`
          );
        }
      }
    }
  }
});

/* ── optimiser ────────────────────────────── */

const MESSY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generator: some editor -->',
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
  '     width="24" height="24" inkscape:version="1.1">',
  '  <metadata><rdf:RDF/></metadata>',
  '  <g inkscape:label="Layer 1" fill-opacity="1">',
  '    <path d="M1.000001 2.5000004L10.123456 20.987654Z" stroke-width="1"/>',
  '  </g>',
  '  <g/>',
  '</svg>',
].join('\n');

test('optimizeSvg strips the editor droppings and reports the byte difference', () => {
  const out = run(MESSY);
  assert.equal(out.counts.comments, 1);
  assert.equal(out.counts.prolog, 1);
  assert.equal(out.counts.editorElements, 1, 'the <metadata> block should go');
  assert.ok(out.counts.editorAttrs >= 2, 'inkscape:* attributes and their xmlns should go');
  assert.equal(out.counts.emptyContainers, 1, 'the empty <g> should go');
  assert.equal(out.counts.defaultAttrs, 2, 'fill-opacity="1" and stroke-width="1" are defaults');
  assert.ok(out.counts.whitespace > 0);
  assert.equal(out.counts.paths, 1);
  assert.ok(out.after < out.before, `${out.after} should be smaller than ${out.before}`);
  assert.equal(out.before, utf8Bytes(MESSY));
  assert.equal(out.after, utf8Bytes(out.svg));

  assert.ok(!out.svg.includes('inkscape'), out.svg);
  assert.ok(!out.svg.includes('<!--'));
  assert.ok(!out.svg.includes('metadata'));
  assert.ok(!out.svg.includes('<?xml'));
  assert.ok(out.svg.includes('d="M1 2.5L10.12 20.99Z"'), out.svg);
  // Still parses, and still has the drawing in it.
  const again = parseXml(out.svg);
  assert.equal(again.children.length, 1);
  assert.equal(out.addedViewBox, true);
  assert.ok(out.svg.includes('viewBox="0 0 24 24"'));
});

test('optimizeSvg leaves everything alone when every switch is off', () => {
  const out = run(MESSY, {
    comments: false,
    editorData: false,
    emptyContainers: false,
    defaultAttrs: false,
    indentation: false,
    prolog: false,
    digits: null,
    addViewBox: false,
    stripSize: false,
  });
  assert.equal(out.svg, MESSY, 'a no-op run must be byte-identical');
  // With only the indentation pass on, the attribute layout inside the tag
  // collapses too, and nothing else moves.
  const tidied = run(MESSY, {
    comments: false,
    editorData: false,
    emptyContainers: false,
    defaultAttrs: false,
    prolog: false,
    digits: null,
    addViewBox: false,
    stripSize: false,
  });
  assert.ok(tidied.svg.includes('inkscape" width="24"'), tidied.svg);
  assert.ok(tidied.after < tidied.before);
  assert.equal(out.after, out.before);
  assert.equal(out.addedViewBox, false);
});

test('optimizeSvg keeps a default-valued attribute an ancestor overrides', () => {
  const kept = run('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><g stroke-width="2"><path stroke-width="1" d="M0 0"/></g></svg>');
  assert.ok(kept.svg.includes('stroke-width="1"'), kept.svg);
  assert.equal(kept.counts.defaultAttrs, 0);

  const shadowedByStyle = run('<svg viewBox="0 0 2 2"><g style="stroke-width:2"><path stroke-width="1" d="M0 0"/></g></svg>');
  assert.ok(shadowedByStyle.svg.includes('stroke-width="1"'));

  const removed = run('<svg viewBox="0 0 2 2"><g><path stroke-width="1" d="M0 0"/></g></svg>');
  assert.ok(!removed.svg.includes('stroke-width'), removed.svg);
  assert.equal(removed.counts.defaultAttrs, 1);
});

test('optimizeSvg stands down from the default-attribute pass when it cannot reason', () => {
  const withStyle = run('<svg viewBox="0 0 2 2"><style>path{stroke:red}</style><path stroke="none" d="M0 0"/></svg>');
  assert.ok(withStyle.svg.includes('stroke="none"'));
  assert.equal(withStyle.counts.defaultAttrs, 0);
  assert.ok(withStyle.warnings.includes('style-element'));

  const withUse = run('<svg viewBox="0 0 2 2"><path id="a" stroke="none" d="M0 0"/><use href="#a"/></svg>');
  assert.ok(withUse.svg.includes('stroke="none"'));
  assert.ok(withUse.warnings.includes('use-element'));

  const inDefs = run('<svg viewBox="0 0 2 2"><defs><path stroke="none" d="M0 0"/></defs></svg>');
  assert.ok(inDefs.svg.includes('stroke="none"'), inDefs.svg);
  assert.equal(inDefs.counts.defaultAttrs, 0);
});

test('optimizeSvg never touches whitespace that is text content', () => {
  const out = run('<svg viewBox="0 0 2 2">\n  <text x="0" y="0">  hello  <tspan> spaced </tspan></text>\n</svg>');
  assert.ok(out.svg.includes('>  hello  <'), out.svg);
  assert.ok(out.svg.includes('<tspan> spaced </tspan>'));
  assert.ok(!out.svg.includes('\n  <text'), 'indentation outside text should still go');
});

test('optimizeSvg rounds magnitudes without switching them off', () => {
  // A stroke width of 0.4 must not become 0 just because 0 decimals were asked for.
  const out = run('<svg viewBox="0 0 2 2"><path stroke-width="0.4" d="M0.4 0.4" transform="scale(0.00001)"/></svg>', {
    digits: 0,
  });
  assert.ok(out.svg.includes('stroke-width="0.4"'), out.svg);
  assert.ok(out.svg.includes('transform="scale(0.00001)"'), out.svg);
  assert.ok(out.svg.includes('d="M0 0"'), out.svg);

  // Units survive rounding.
  const units = run('<svg viewBox="0 0 2 2"><rect x="10.98765px" width="50.5%" height="2.00001"/></svg>', {
    digits: 2,
  });
  assert.ok(units.svg.includes('x="10.99px"'), units.svg);
  assert.ok(units.svg.includes('width="50.5%"'), units.svg);
  assert.ok(units.svg.includes('height="2"'), units.svg);
});

test('optimizeSvg leaves viewBox and multi-value coordinates untouched', () => {
  const out = run('<svg viewBox="0 0 0.5 0.5"><text x="1.11111 2.22222">hi</text></svg>', { digits: 0 });
  assert.ok(out.svg.includes('viewBox="0 0 0.5 0.5"'), 'rounding the viewBox would rescale the drawing');
  assert.ok(out.svg.includes('x="1.11111 2.22222"'), 'a list in x is not a single number');
});

test('optimizeSvg reports a path it could not read instead of mangling it', () => {
  const out = run('<svg viewBox="0 0 2 2"><path d="M0 0 potato 5"/></svg>');
  assert.ok(out.svg.includes('d="M0 0 potato 5"'), out.svg);
  assert.ok(out.warnings.includes('bad-path'));
  assert.equal(out.counts.paths, 0);
});

test('optimizeSvg adds a viewBox only when the size allows it', () => {
  const added = run('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><path d="M0 0"/></svg>');
  assert.equal(added.addedViewBox, true);
  assert.ok(added.svg.includes('viewBox="0 0 48 32"'));

  const px = run('<svg width="48px" height="32px"><path d="M0 0"/></svg>');
  assert.ok(px.svg.includes('viewBox="0 0 48 32"'));

  const relative = run('<svg width="100%" height="100%"><path d="M0 0"/></svg>');
  assert.equal(relative.addedViewBox, false);
  assert.ok(relative.warnings.includes('viewbox-needs-size'));

  const already = run('<svg viewBox="0 0 10 10" width="48" height="32"><path d="M0 0"/></svg>');
  assert.equal(already.addedViewBox, false);
  assert.ok(already.svg.includes('viewBox="0 0 10 10"'));
});

test('optimizeSvg only drops width/height when a viewBox is there to replace them', () => {
  const stripped = run('<svg viewBox="0 0 10 10" width="48" height="32"><path d="M0 0"/></svg>', {
    stripSize: true,
  });
  assert.equal(stripped.removedSize, true);
  assert.ok(!stripped.svg.includes('width='), stripped.svg);

  const refused = run('<svg width="100%" height="100%"><path d="M0 0"/></svg>', { stripSize: true });
  assert.equal(refused.removedSize, false);
  assert.ok(refused.svg.includes('width="100%"'));
  assert.ok(refused.warnings.includes('size-needs-viewbox'));

  // Adding the viewBox in the same run is enough to allow the removal.
  const both = run('<svg width="48" height="32"><path d="M0 0"/></svg>', { stripSize: true });
  assert.equal(both.addedViewBox, true);
  assert.equal(both.removedSize, true);
  assert.ok(both.svg.includes('viewBox="0 0 48 32"'));
  assert.ok(!both.svg.includes('height="32"'));
});

test('optimizeSvg warns about what it found rather than acting on it', () => {
  const noRoot = run('<not-svg><g/></not-svg>');
  assert.ok(noRoot.warnings.includes('no-svg-root'));
  const noXmlns = run('<svg viewBox="0 0 2 2"><path d="M0 0"/></svg>');
  assert.ok(noXmlns.warnings.includes('no-xmlns'));
  const script = run('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><script>alert(1)</script></svg>');
  assert.ok(script.warnings.includes('script-element'));
  assert.ok(script.svg.includes('alert(1)'), 'the script is not ours to edit');
  const foreign = run('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><foreignObject><b> x </b></foreignObject></svg>');
  assert.ok(foreign.warnings.includes('foreign-object'));
  assert.ok(foreign.svg.includes('<b> x </b>'), 'HTML whitespace inside foreignObject is content');
});

test('optimizeSvg honours a custom prefix list', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2" acme:note="x" inkscape:label="y"><path d="M0 0"/></svg>';
  const out = run(source, { prefixes: ['acme'] });
  assert.ok(!out.svg.includes('acme:note'), out.svg);
  assert.ok(out.svg.includes('inkscape:label'), 'a prefix off the list stays');
  const none = run(source, { prefixes: [] });
  assert.ok(none.svg.includes('acme:note'));
  assert.equal(none.counts.editorAttrs, 0);
});

test('optimizeSvg keeps xlink, which is not editor noise', () => {
  const out = run(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 2 2"><use xlink:href="#a"/></svg>'
  );
  assert.ok(out.svg.includes('xlink:href="#a"'), out.svg);
  assert.ok(out.svg.includes('xmlns:xlink'));
});

test('optimizeSvg empties nested containers from the inside out', () => {
  const out = run('<svg viewBox="0 0 2 2"><g><g><!-- nothing but a comment --></g></g><defs>\n</defs></svg>');
  assert.equal(out.counts.emptyContainers, 3);
  assert.equal(out.svg, '<svg viewBox="0 0 2 2"/>');
});

test('optimizeSvg preserves entities and CJK, and counts their bytes', () => {
  const source = '<svg viewBox="0 0 2 2"><title>中文 &amp; 符號</title><desc>a &lt; b</desc></svg>';
  const out = run(source);
  assert.ok(out.svg.includes('&amp;'), 'entities are not decoded');
  assert.ok(out.svg.includes('a &lt; b'));
  assert.ok(out.svg.includes('中文'));
  assert.equal(out.before, utf8Bytes(source));
  assert.equal(out.after, utf8Bytes(out.svg));
});

test('optimizeSvg returns a located failure for input it cannot parse', () => {
  const broken = optimizeSvg('<svg>\n  <g>\n</svg>', options());
  assert.equal(broken.ok, false);
  if (broken.ok) throw new Error('unreachable');
  assert.equal(broken.code, 'mismatched-tag');
  assert.equal(broken.line, 3);
  assert.equal(broken.column, 1);

  const empty = optimizeSvg('   \n  ', options());
  assert.equal(empty.ok, false);
  if (empty.ok) throw new Error('unreachable');
  assert.equal(empty.code, 'empty');

  const huge = optimizeSvg('x'.repeat(MAX_SOURCE + 1), options());
  assert.equal(huge.ok, false);
  if (huge.ok) throw new Error('unreachable');
  assert.equal(huge.code, 'too-large');
});

test('optimizeSvg output is stable: optimising twice changes nothing more', () => {
  const once = run(MESSY);
  const twice = run(once.svg);
  assert.equal(twice.svg, once.svg, 'the passes must reach a fixed point');
  assert.equal(twice.after, once.after);
});

test('optimizeSvg counts the elements that survived', () => {
  const out = run('<svg viewBox="0 0 2 2"><g><path d="M0 0"/><circle cx="1" cy="1" r="1"/></g></svg>');
  assert.equal(out.elements, 4);
});

/* ── tables ───────────────────────────────── */

test('the option and table constants are sane', () => {
  assert.equal(DEFAULT_OPTIONS.digits, 2);
  assert.equal(DEFAULT_OPTIONS.stripSize, false, 'removing the size changes layout, so it is opt-in');
  assert.deepEqual(DEFAULT_OPTIONS.prefixes, EDITOR_PREFIXES);

  assert.ok(!EDITOR_PREFIXES.includes('xlink'), 'dropping xlink breaks <use>');
  assert.ok(!EDITOR_PREFIXES.includes('xmlns'));
  assert.ok(EDITOR_PREFIXES.includes('inkscape'));
  assert.equal(new Set(EDITOR_PREFIXES).size, EDITOR_PREFIXES.length, 'no duplicate prefixes');

  const names = DEFAULT_ATTRS.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, 'no duplicate default attributes');
  for (const entry of DEFAULT_ATTRS) {
    assert.ok(entry.name.length > 0 && entry.value.length > 0);
  }
  // fill has no entry: its initial value is black, and "black" is what an
  // icon that relies on currentColor must not be rewritten into.
  assert.ok(!names.includes('fill'));
});
