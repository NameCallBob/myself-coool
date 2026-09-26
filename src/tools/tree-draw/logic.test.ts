import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DEPTH,
  MAX_LINES,
  TreeError,
  countNodes,
  looksLikeTree,
  parseIndented,
  parseTreeDrawing,
  renderTree,
  toIndented,
  type Node,
} from './logic.ts';

const LIST = ['project', '  src', '    a.ts', '    b.ts', '  README.md'].join('\n');

/** The exact shape GNU tree prints for the same structure. */
const DRAWN = [
  'project',
  '├── src',
  '│   ├── a.ts',
  '│   └── b.ts',
  '└── README.md',
].join('\n');

const shape = (nodes: readonly Node[]): string =>
  nodes
    .map((node) =>
      node.children.length > 0
        ? `${node.name}(${shape(node.children)})`
        : node.isDir
          ? `${node.name}/`
          : node.name
    )
    .join(',');

test('parseIndented reads depth from the smallest non-zero indent', () => {
  const two = parseIndented(LIST);
  assert.equal(two.unit, 2);
  assert.equal(shape(two.roots), 'project(src(a.ts,b.ts),README.md)');

  const four = parseIndented('a\n    b\n        c\n    d');
  assert.equal(four.unit, 4);
  assert.equal(shape(four.roots), 'a(b(c),d)');

  // A flat list has no indent to measure and is all roots.
  assert.equal(shape(parseIndented('a\nb\nc').roots), 'a,b,c');
  assert.deepEqual(parseIndented('').roots, []);
  assert.deepEqual(parseIndented('\n  \n\t\n').roots, []);
});

test('parseIndented expands tabs at tab stops and ignores CRLF', () => {
  const tabs = parseIndented('root\r\n\tchild\r\n\t\tleaf\r\n', { tabWidth: 4 });
  assert.equal(tabs.unit, 4);
  assert.equal(shape(tabs.roots), 'root(child(leaf))');

  // A nonsense tab width falls back to four rather than throwing a RangeError.
  assert.equal(shape(parseIndented('root\n\tchild', { tabWidth: Number.NaN }).roots), 'root(child)');
  // tabWidth 2 gives the same structure with a different measured unit.
  assert.equal(parseIndented('root\n\tchild', { tabWidth: 2 }).unit, 2);
  // A tab after two spaces advances to the next stop, not by a full width.
  assert.equal(shape(parseIndented('root\n  \tchild', { tabWidth: 4 }).roots), 'root(child)');
});

test('parseIndented strips a common leading indent', () => {
  const inside = ['    project', '      src', '        a.ts'].join('\n');
  assert.equal(shape(parseIndented(inside).roots), 'project(src(a.ts))');
});

test('parseIndented marks directories from slash and [D]/[F] labels', () => {
  const marked = parseIndented('src/\n  empty/\n  a.ts\n[F] top.txt');
  assert.equal(shape(marked.roots), 'src(empty/,a.ts),top.txt');
  assert.equal(marked.roots[0].isDir, true);
  assert.equal(marked.roots[0].children[0].isDir, true);
  assert.equal(marked.roots[0].children[1].isDir, false);
  assert.equal(shape(parseIndented('[D] bin\n  [F] run.sh').roots), 'bin(run.sh)');
  // Windows-style trailing backslash counts too.
  assert.equal(parseIndented('src\\').roots[0].isDir, true);
});

test('parseIndented keeps Unicode, emoji and CJK names intact', () => {
  const list = ['文件', '  企劃書.docx', '  圖片', '    圖 1.png', '  🙈 secret'].join('\n');
  const parsed = parseIndented(list);
  assert.equal(shape(parsed.roots), '文件(企劃書.docx,圖片(圖 1.png),🙈 secret)');
});

test('parseIndented refuses what it cannot account for', () => {
  assert.throws(() => parseIndented('a\n   b\n  c'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'indent-misaligned');
    assert.equal(error.line, 2);
    return true;
  });
  assert.throws(() => parseIndented('a\n  b\n      c'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'indent-jump');
    assert.equal(error.line, 3);
    return true;
  });
  assert.throws(() => parseIndented('  a\nb'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'root-indented');
    return true;
  });
  assert.throws(() => parseIndented('a\n'.repeat(MAX_LINES + 1)), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'too-many-lines');
    return true;
  });
  const deep = Array.from({ length: MAX_DEPTH + 2 }, (_, i) => `${' '.repeat(i * 2)}n${i}`).join('\n');
  assert.throws(() => parseIndented(deep), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'too-deep');
    return true;
  });
});

test('parseIndented accepts a 2-space list that only jumps one level at a time', () => {
  // Guard against the previous assertion passing for the wrong reason.
  assert.equal(shape(parseIndented('a\n    b').roots), 'a(b)');
});

test('renderTree matches what GNU tree prints', () => {
  assert.equal(renderTree(parseIndented(LIST).roots), DRAWN);
});

test('renderTree honours charset, width and markers', () => {
  const roots = parseIndented(LIST).roots;
  assert.equal(
    renderTree(roots, { charset: 'ascii' }),
    ['project', '|-- src', '|   |-- a.ts', '|   `-- b.ts', '`-- README.md'].join('\n')
  );
  assert.equal(
    renderTree(roots, { indent: 2 }),
    ['project', '├ src', '│ ├ a.ts', '│ └ b.ts', '└ README.md'].join('\n')
  );
  assert.equal(
    renderTree(roots, { indent: 6 }),
    ['project', '├──── src', '│     ├──── a.ts', '│     └──── b.ts', '└──── README.md'].join('\n')
  );
  assert.equal(
    renderTree(roots, { marker: 'slash' }),
    ['project/', '├── src/', '│   ├── a.ts', '│   └── b.ts', '└── README.md'].join('\n')
  );
  assert.equal(
    renderTree(roots, { marker: 'ascii' }).split('\n')[1],
    '├── [D] src'
  );
  assert.equal(renderTree([]), '');
  assert.equal(renderTree([{ name: 'solo', isDir: false, children: [] }]), 'solo');
});

test('renderTree rejects widths it cannot draw or read back', () => {
  const roots = parseIndented('a\n  b').roots;
  for (const indent of [1, 9, 0, -4, Number.NaN]) {
    assert.throws(() => renderTree(roots, { indent }), (error: unknown) => {
      assert.ok(error instanceof TreeError);
      assert.equal(error.code, 'bad-indent-width');
      return true;
    });
  }
  // ASCII at width 2 would print `| b`, which reads back as a vertical bar.
  assert.throws(() => renderTree(roots, { indent: 2, charset: 'ascii' }), TreeError);
  assert.equal(renderTree(roots, { indent: 3, charset: 'ascii' }), 'a\n`- b');
  // A fractional width is truncated, not rejected: 4.9 columns is 4.
  assert.equal(renderTree(roots, { indent: 4.9 }), renderTree(roots, { indent: 4 }));
});

test('renderTree caps runaway depth instead of recursing forever', () => {
  let node: Node = { name: 'leaf', isDir: false, children: [] };
  for (let i = 0; i < MAX_DEPTH + 2; i += 1) node = { name: `n${i}`, isDir: true, children: [node] };
  assert.throws(() => renderTree([node]), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'too-deep');
    return true;
  });
});

test('parseTreeDrawing reads GNU tree output back', () => {
  const parsed = parseTreeDrawing(DRAWN);
  assert.equal(parsed.unit, 4);
  assert.equal(shape(parsed.roots), 'project(src(a.ts,b.ts),README.md)');
});

test('parseTreeDrawing reads the ASCII and Windows dialects', () => {
  const ascii = ['project', '|-- src', '|   |-- a.ts', '|   `-- b.ts', '`-- README.md'].join('\n');
  assert.equal(shape(parseTreeDrawing(ascii).roots), 'project(src(a.ts,b.ts),README.md)');

  // Windows `tree /f` and `tree /f /a`.
  const win = ['C:.', '├───src', '│   │   a.ts', '│   └───lib'].join('\n');
  assert.throws(() => parseTreeDrawing(win), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'unknown-prefix');
    assert.equal(error.line, 3);
    return true;
  });
  const winAscii = ['C:.', '+---src', '|   \\---lib'].join('\n');
  assert.equal(shape(parseTreeDrawing(winAscii).roots), 'C:.(src(lib))');

  // Three-column drawings occur too; the width is measured, not assumed.
  const narrow = ['root', '├─ a', '│  └─ b', '└─ c'].join('\n');
  const parsed = parseTreeDrawing(narrow);
  assert.equal(parsed.unit, 3);
  assert.equal(shape(parsed.roots), 'root(a(b),c)');
});

test('parseTreeDrawing handles rootless fragments, blank lines and CRLF', () => {
  const fragment = ['├── a', '│   └── a1', '└── b'].join('\r\n');
  assert.equal(shape(parseTreeDrawing(fragment).roots), 'a(a1),b');
  assert.equal(shape(parseTreeDrawing('root\n\n├── a\n\n└── b\n').roots), 'root(a,b)');
  assert.deepEqual(parseTreeDrawing('').roots, []);
  assert.equal(shape(parseTreeDrawing('just-a-name').roots), 'just-a-name');
});

test('parseTreeDrawing does not mistake a filename for a connector', () => {
  const drawn = ['routes', '├── +page.svelte', '└── `odd`.txt'].join('\n');
  assert.equal(shape(parseTreeDrawing(drawn).roots), 'routes(+page.svelte,`odd`.txt)');
  assert.equal(shape(parseTreeDrawing('a\n└── -dash.txt').roots), 'a(-dash.txt)');
});

test('parseTreeDrawing reports prefixes it cannot account for', () => {
  assert.throws(() => parseTreeDrawing('root\n    plain'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'unknown-prefix');
    assert.equal(error.line, 2);
    return true;
  });
  assert.throws(() => parseTreeDrawing('root\n|   name'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'unknown-prefix');
    return true;
  });
  assert.throws(() => parseTreeDrawing('root\n├── a\n  ├── b'), (error: unknown) => {
    assert.ok(error instanceof TreeError);
    assert.equal(error.code, 'indent-misaligned');
    assert.equal(error.line, 3);
    return true;
  });
  assert.throws(() => parseTreeDrawing('x\n'.repeat(MAX_LINES + 1)), TreeError);
});

test('drawing and list round-trip through each other', () => {
  const source = ['project/', '  src/', '    a.ts', '    deep/', '      x.ts', '  empty/', '  README.md'].join('\n');
  const roots = parseIndented(source).roots;
  const drawn = renderTree(roots, { marker: 'slash' });
  const back = parseTreeDrawing(drawn);
  assert.equal(toIndented(back.roots, { indent: 2, marker: 'slash' }), source);
  // And once more through the ASCII charset at another width.
  const ascii = renderTree(back.roots, { charset: 'ascii', indent: 5, marker: 'slash' });
  assert.equal(toIndented(parseTreeDrawing(ascii).roots, { indent: 2, marker: 'slash' }), source);
  // Drawing is stable under a re-parse.
  assert.equal(renderTree(parseTreeDrawing(drawn).roots, { marker: 'slash' }), drawn);
});

test('toIndented writes the width and marker it is given', () => {
  const roots = parseIndented(LIST).roots;
  assert.equal(toIndented(roots, { marker: 'none' }), ['project', '  src', '    a.ts', '    b.ts', '  README.md'].join('\n'));
  assert.equal(toIndented(roots, { indent: 4, marker: 'none' }), ['project', '    src', '        a.ts', '        b.ts', '    README.md'].join('\n'));
  assert.equal(toIndented(roots).split('\n')[0], 'project/');
  assert.equal(toIndented(roots, { marker: 'ascii' }).split('\n')[2], '    [F] a.ts');
  assert.equal(toIndented([]), '');
  assert.throws(() => toIndented(roots, { indent: 0 }), TreeError);
  assert.throws(() => toIndented(roots, { indent: 99 }), TreeError);
  assert.throws(() => toIndented(roots, { indent: Number.NaN }), TreeError);
});

test('countNodes counts kinds and depth', () => {
  const roots = parseIndented(LIST).roots;
  assert.deepEqual(countNodes(roots), { total: 5, dirs: 2, files: 3, depth: 3 });
  assert.deepEqual(countNodes([]), { total: 0, dirs: 0, files: 0, depth: 0 });
  assert.deepEqual(countNodes(parseIndented('a\nb').roots), { total: 2, dirs: 0, files: 2, depth: 1 });
  // The root itself counts, and a slash-marked leaf counts as a directory.
  assert.deepEqual(countNodes(parseIndented('a/\n  b/').roots), { total: 2, dirs: 2, files: 0, depth: 2 });
});

test('looksLikeTree spots a drawing without parsing it', () => {
  assert.equal(looksLikeTree(DRAWN), true);
  assert.equal(looksLikeTree('a\n|-- b'), true);
  assert.equal(looksLikeTree('a\n`-- b'), true);
  assert.equal(looksLikeTree('root\n+--- x'), true);
  assert.equal(looksLikeTree(LIST), false);
  assert.equal(looksLikeTree(''), false);
  assert.equal(looksLikeTree('a\n  +page.svelte'), false);
});
