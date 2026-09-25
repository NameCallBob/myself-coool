import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DiffTooLarge,
  countStats,
  diffLines,
  diffTokens,
  diffWords,
  splitLines,
  splitWords,
  toRows,
  toUnified,
} from './logic.ts';

const render = (ops: { kind: string; value: string }[]) =>
  ops.map((op) => `${op.kind[0]}:${op.value}`).join('|');

/** Rebuilding both sides from the script is the property that has to hold. */
function reconstructs(a: string[], b: string[]) {
  const ops = diffTokens(a, b);
  const left = ops.filter((op) => op.kind !== 'insert').map((op) => op.value).join('');
  const right = ops.filter((op) => op.kind !== 'delete').map((op) => op.value).join('');
  assert.equal(left, a.join(''), 'left side does not reconstruct');
  assert.equal(right, b.join(''), 'right side does not reconstruct');
  return ops;
}

test('identical input produces a single equal run', () => {
  assert.equal(render(diffTokens(['a', 'b', 'c'], ['a', 'b', 'c'])), 'e:abc');
});

test('empty sides are pure insert or pure delete', () => {
  assert.equal(render(diffTokens([], ['a', 'b'])), 'i:ab');
  assert.equal(render(diffTokens(['a', 'b'], [])), 'd:ab');
  assert.deepEqual(diffTokens([], []), []);
});

test('the classic Myers example gives a minimal script', () => {
  // ABCABBA -> CBABAC, distance 5 (Myers 1986, figure 1).
  const a = [...'ABCABBA'];
  const b = [...'CBABAC'];
  const ops = reconstructs(a, b);
  const edits = ops
    .filter((op) => op.kind !== 'equal')
    .reduce((n, op) => n + op.value.length, 0);
  assert.equal(edits, 5);
});

test('a middle change keeps the shared head and tail intact', () => {
  const ops = reconstructs([...'the quick brown fox'], [...'the slow brown fox']);
  assert.ok(ops[0].kind === 'equal' && ops[0].value.startsWith('the '));
  assert.ok(ops[ops.length - 1].value.endsWith(' brown fox'));
});

test('line mode ignores CRLF and reports per line', () => {
  const ops = diffLines('one\r\ntwo\r\nthree', 'one\ntwo changed\nthree');
  assert.equal(countStats(ops, 'line').added, 1);
  assert.equal(countStats(ops, 'line').removed, 1);
  assert.equal(render(diffLines('a\nb', 'a\nb')), 'e:a\nb');
});

test('word mode splits CJK per character', () => {
  assert.deepEqual(splitWords('中文 abc'), ['中', '文', ' ', 'abc']);
  const ops = diffWords('這是一段中文', '這是兩段中文');
  const changed = ops.filter((op) => op.kind !== 'equal').map((op) => op.value);
  assert.deepEqual(changed.sort(), ['兩', '一'].sort());
});

test('splitLines treats an empty document as no lines', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a'), ['a']);
  assert.deepEqual(splitLines('a\n'), ['a', '']);
});

test('unified output marks every line and drops the trailing blank', () => {
  assert.equal(toUnified(diffLines('a\nb', 'a\nc')), ' a\n-b\n+c');
});

test('rows keep a deleted last line apart from what replaced it', () => {
  // The case that rendered as one run-together line: the deleted line is last
  // in the document, so it carries no newline of its own.
  const rows = toRows(diffLines('keep\nold line\ndrop me', 'keep\nnew line'));
  assert.deepEqual(rows, [
    { kind: 'equal', text: 'keep' },
    { kind: 'delete', text: 'old line' },
    { kind: 'delete', text: 'drop me' },
    { kind: 'insert', text: 'new line' },
  ]);
});

test('rows survive an empty line in the middle', () => {
  const rows = toRows(diffLines('a\n\nb', 'a\n\nc'));
  assert.equal(rows.filter((row) => row.text === '').length, 1);
});

test('a hopeless comparison reports instead of grinding', () => {
  const a = Array.from({ length: 7000 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 7000 }, (_, i) => `b${i}`);
  assert.throws(() => diffTokens(a, b), DiffTooLarge);
});

test('a large but similar comparison still runs', () => {
  const a = Array.from({ length: 20_000 }, (_, i) => `line ${i}\n`);
  const b = a.slice();
  b[10_000] = 'changed\n';
  const ops = reconstructs(a, b);
  assert.equal(countStats(ops, 'line').added, 1);
});
