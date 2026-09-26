import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EMIT,
  MAX_FIELDS,
  MAX_MEMBERS,
  SampleTooBig,
  countFields,
  emitGo,
  emitPydantic,
  emitTypeScript,
  emitZod,
  generate,
  goFieldName,
  infer,
  mergeSchema,
  pascalCase,
  pyFieldName,
  schemaKey,
  singular,
  warningsFor,
  type Schema,
} from './logic.ts';

const ts = (value: unknown, name = 'Root') =>
  emitTypeScript(infer(value), { ...DEFAULT_EMIT, rootName: name });

test('scalars infer to the obvious schema', () => {
  assert.deepEqual(infer('a'), { k: 'string' });
  assert.deepEqual(infer(1), { k: 'number', int: true });
  assert.deepEqual(infer(1.5), { k: 'number', int: false });
  assert.deepEqual(infer(true), { k: 'boolean' });
  assert.deepEqual(infer(null), { k: 'null' });
  assert.deepEqual(infer([]), { k: 'array', item: { k: 'unknown' } });
  assert.throws(() => infer(undefined), TypeError);
});

test('array elements are merged, so a member missing anywhere is optional', () => {
  const schema = infer([{ a: 1, note: 'x' }, { a: 2 }]);
  assert.equal(schemaKey(schema), '[{a:int,note?:string}]');
  assert.match(ts([{ a: 1, note: 'x' }, { a: 2 }], 'Rows'), /note\?: string;/);
});

test('an integer sample stays an integer, a mixed one becomes fractional', () => {
  assert.equal(schemaKey(infer([1, 2, 3])), '[int]');
  assert.equal(schemaKey(infer([1, 2.5])), '[float]');
  assert.match(emitGo(infer({ n: 1 })), /int64/);
  assert.match(emitGo(infer({ n: 1.5 })), /float64/);
});

test('null merges into nullability rather than into a type', () => {
  assert.equal(schemaKey(infer([{ a: null }, { a: 1 }])), '[{a:(int|null)}]');
  assert.match(ts([{ a: null }, { a: 1 }], 'Rows'), /a: number \| null;/);
  // A member seen only as null cannot say what it holds: `unknown`, not `any`
  // guess, and no redundant `.nullable()` on top of it.
  assert.match(emitZod(infer({ a: null })), /a: z\.unknown\(\),/);
});

test('a member that is always null is unknown, not string', () => {
  assert.match(ts({ note: null }), /note: unknown;/);
  assert.match(emitGo(infer({ note: null })), /Note {1,}any/);
  assert.match(emitPydantic(infer({ note: null })), /note: Any$/m);
});

test('an empty array cannot say what it holds and does not pretend to', () => {
  assert.match(ts({ tags: [] }), /tags: unknown\[\];/);
  assert.match(emitZod(infer({ tags: [] })), /z\.array\(z\.unknown\(\)\)/);
  assert.match(emitPydantic(infer({ tags: [] })), /tags: list\[Any\]/);
  assert.deepEqual(warningsFor(infer({ tags: [] })), ['empty-array']);
});

test('nested objects become their own declarations, named after the member', () => {
  const code = ts({ order: { id: 'A', items: [{ sku: 'X', qty: 1 }] } });
  assert.match(code, /export interface Root \{/);
  assert.match(code, /order: Order;/);
  assert.match(code, /export interface Order \{/);
  assert.match(code, /items: Item\[\];/);
  assert.match(code, /export interface Item \{/);
  // Declarations must not be emitted twice for one shape.
  assert.equal(code.match(/export interface Item /g)?.length, 1);
});

test('an array at the root gets an element type and an alias that compile', () => {
  const code = ts([{ a: 1 }]);
  assert.match(code, /export interface RootItem \{/);
  assert.match(code, /export type Root = RootItem\[\];/);
  assert.equal(code.includes('export type Root = Root[]'), false);

  const users = ts([{ a: 1 }], 'Users');
  assert.match(users, /export interface User \{/);
  assert.match(users, /export type Users = User\[\];/);

  const go = emitGo(infer([{ a: 1 }]));
  assert.match(go, /type RootItem struct/);
  assert.match(go, /type Root \[\]RootItem/);
  const py = emitPydantic(infer([{ a: 1 }]));
  assert.match(py, /Root = list\[RootItem\]/);
  const zod = emitZod(infer([{ a: 1 }]));
  assert.match(zod, /export const rootSchema = z\.array\(rootItem\);/);
});

test('keys that are not identifiers are quoted, aliased or tagged', () => {
  const value = { 'content-type': 'json', '2fa': true, 'class': 1, '訂單編號': 'A' };
  const code = ts(value);
  assert.match(code, /"content-type": string;/);
  assert.match(code, /"2fa": boolean;/);
  assert.match(code, /"訂單編號": string;/);

  const go = emitGo(infer(value));
  assert.match(go, /ContentType string `json:"content-type"`/);
  assert.match(go, /json:"訂單編號"/);

  const py = emitPydantic(infer(value));
  assert.match(py, /content_type: str = Field\(alias="content-type"\)/);
  assert.match(py, /f_2fa: bool = Field\(alias="2fa"\)/);
  assert.match(py, /class_: int = Field\(alias="class"\)/);
  assert.match(py, /populate_by_name=True/);
});

test('Go initialisms follow the style guide', () => {
  assert.equal(goFieldName('user_id'), 'UserID');
  assert.equal(goFieldName('apiURL'), 'APIURL');
  assert.equal(goFieldName('html_body'), 'HTMLBody');
  assert.equal(goFieldName('plainName'), 'PlainName');
  assert.equal(goFieldName('2way'), 'F2way');
  assert.equal(goFieldName('訂單'), 'F訂單');
});

test('Python field names avoid keywords and leading digits', () => {
  assert.deepEqual(pyFieldName('ok_name'), { name: 'ok_name', alias: null });
  assert.deepEqual(pyFieldName('class'), { name: 'class_', alias: 'class' });
  assert.deepEqual(pyFieldName('a-b'), { name: 'a_b', alias: 'a-b' });
  assert.deepEqual(pyFieldName('1st'), { name: 'f_1st', alias: '1st' });
});

test('optional members are marked in every target, and can be turned off', () => {
  const schema = infer([{ a: 1, b: 2 }, { a: 1 }]);
  const options = { ...DEFAULT_EMIT, rootName: 'Rows' };
  assert.match(emitTypeScript(schema, options), /b\?: number;/);
  assert.match(emitZod(schema, options), /b: z\.number\(\)\.int\(\)\.optional\(\)/);
  assert.match(emitGo(schema, options), /json:"b,omitempty"/);
  assert.match(emitPydantic(schema, options), /b: Optional\[int\] = Field\(default=None\)/);

  const strict = { ...options, markOptional: false };
  assert.match(emitTypeScript(schema, strict), /b: number;/);
  assert.equal(emitGo(schema, strict).includes('omitempty'), false);
});

test('mixed scalar types come out as a union in every target', () => {
  const schema = infer([{ v: 1 }, { v: 'x' }]);
  assert.match(emitTypeScript(schema, DEFAULT_EMIT), /v: number \| string;/);
  assert.match(emitZod(schema, DEFAULT_EMIT), /z\.union\(\[z\.number\(\)\.int\(\), z\.string\(\)\]\)/);
  assert.match(emitGo(schema, DEFAULT_EMIT), /V {1,}any/);
  assert.match(emitPydantic(schema, DEFAULT_EMIT), /v: Union\[int, str\]/);
  assert.ok(warningsFor(schema).includes('mixed-union'));
});

test('mergeSchema is associative enough for the cases that occur', () => {
  const a: Schema = { k: 'object', fields: [{ name: 'x', schema: { k: 'number', int: true }, optional: false }] };
  const b: Schema = { k: 'object', fields: [{ name: 'y', schema: { k: 'string' }, optional: false }] };
  const c: Schema = { k: 'null' };
  assert.equal(schemaKey(mergeSchema(mergeSchema(a, b), c)), schemaKey(mergeSchema(a, mergeSchema(b, c))));
  assert.equal(schemaKey(mergeSchema({ k: 'unknown' }, a)), schemaKey(a));
  assert.equal(schemaKey(mergeSchema(a, { k: 'unknown' })), schemaKey(a));
});

test('an array of arrays keeps its depth', () => {
  assert.equal(schemaKey(infer([[[1]]])), '[[[int]]]');
  assert.match(ts({ grid: [[1, 2]] }), /grid: number\[\]\[\];/);
});

test('deeply nested and very wide samples report instead of grinding', () => {
  let deep: unknown = 1;
  for (let i = 0; i < 80; i += 1) deep = { n: deep };
  assert.throws(() => infer(deep), SampleTooBig);

  const wide = Object.fromEntries(Array.from({ length: MAX_FIELDS + 10 }, (_, i) => [`k${i}`, i]));
  assert.throws(() => infer(wide), SampleTooBig);
});

test('pascalCase and singular behave on the names that occur', () => {
  assert.equal(pascalCase('user_id'), 'UserId');
  assert.equal(pascalCase('order-items'), 'OrderItems');
  assert.equal(pascalCase('alreadyPascal'), 'AlreadyPascal');
  assert.equal(pascalCase('2fa'), 'N2fa');
  assert.equal(pascalCase('訂單編號'), '訂單編號');
  assert.equal(singular('items'), 'item');
  assert.equal(singular('categories'), 'category');
  assert.equal(singular('boxes'), 'box');
  assert.equal(singular('address'), 'address');
  assert.equal(singular('data'), 'data');
});

test('countFields counts every member once', () => {
  assert.equal(countFields(infer({ a: 1, b: { c: 1, d: [{ e: 1 }] } })), 5);
  assert.equal(countFields(infer([1, 2])), 0);
});

test('warningsFor reports what the sample could not say', () => {
  assert.deepEqual(warningsFor(infer({ a: 1 })), ['integer-guess']);
  assert.deepEqual(warningsFor(infer({ a: 'x' })), []);
  assert.ok(warningsFor(infer({ a: null })).includes('always-null'));
});

test('generate() reports parse failures and emits every target', () => {
  assert.equal(generate('', 'ts').ok, false);
  assert.equal(generate('{oops', 'ts').ok, false);
  for (const target of ['ts', 'zod', 'go', 'py'] as const) {
    const out = generate('{"a":{"b":[1]}}', target);
    assert.ok(out.ok, target);
    if (out.ok) {
      assert.ok(out.code.length > 10, target);
      assert.equal(out.fields, 2);
    }
  }
  const zod = generate('{"a":1}', 'zod');
  assert.ok(zod.ok && zod.code.startsWith("import { z } from 'zod';"));
  const py = generate('{"a":1}', 'py');
  assert.ok(py.ok && py.code.startsWith('from pydantic import BaseModel'));
});

test('a tab indent is available for people who use one', () => {
  const code = emitTypeScript(infer({ a: 1 }), { ...DEFAULT_EMIT, indent: 0 });
  assert.match(code, /\ta: number;/);
});

/* ── Regressions found while writing the "how it works" note ─── */

test('[25] a long array of small records infers rather than hitting the ceiling', () => {
  const rows = Array.from({ length: 3_000 }, (_, i) => ({ id: i, name: 'x' }));
  const schema = infer(rows);
  assert.equal(schemaKey(schema), '[{id:int,name:string}]');
  assert.equal(countFields(schema), 2);
  const out = generate(JSON.stringify(rows), 'ts');
  assert.ok(out.ok);
  if (out.ok) assert.equal(out.fields, 2);
});

test('[25] the ceilings bound the work and name what they counted', () => {
  // One object wider than the distinct-member ceiling is still refused.
  const wide = Object.fromEntries(Array.from({ length: MAX_FIELDS + 10 }, (_, i) => [`k${i}`, i]));
  assert.throws(() => infer(wide), SampleTooBig);

  // So is an array whose records share no keys: merging those is what costs,
  // and the merged object crosses the same ceiling.
  const heterogeneous = Array.from({ length: MAX_FIELDS + 10 }, (_, i) => ({ [`k${i}`]: i }));
  const started = performance.now();
  assert.throws(() => infer(heterogeneous), SampleTooBig);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3_000, `refusing took ${elapsed.toFixed(0)}ms`);

  // Sheer length is bounded separately, and by a number that counts occurrences.
  const many = Array.from({ length: MAX_MEMBERS + 10 }, () => ({ a: 1 }));
  assert.throws(() => infer(many), SampleTooBig);
  assert.match(new SampleTooBig('fields').message, /5,?000|5000/);
  assert.match(new SampleTooBig('members').message, /read/);
});

test('[26] shapes are deduplicated by structure, which shares one name (a trade-off)', () => {
  // Documented rather than fixed: naming by key instead would emit one
  // identical interface per key, and a shape used in fifty places fifty times.
  const code = ts({ from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0 } });
  assert.match(code, /export interface From \{/);
  assert.match(code, /to: From;/);
  assert.equal(code.match(/lat: number;/g)?.length, 1);
});

test('[27] the integer guess is reported only where the output encodes it', () => {
  const schema = infer({ total: 1 });
  // TypeScript writes `number` whether the sample was 1 or 1.0, so there is no
  // guess in the output and nothing to warn about.
  assert.deepEqual(warningsFor(schema, 'ts'), []);
  for (const target of ['go', 'py', 'zod'] as const) {
    assert.deepEqual(warningsFor(schema, target), ['integer-guess'], target);
  }
  const tsOut = generate('{"total":1}', 'ts');
  assert.ok(tsOut.ok && tsOut.warnings.length === 0);
  const goOut = generate('{"total":1}', 'go');
  assert.ok(goOut.ok && goOut.warnings.includes('integer-guess'));
  // The other three are about the sample, not the target, and stay put.
  assert.deepEqual(warningsFor(infer({ tags: [] }), 'ts'), ['empty-array']);
  assert.deepEqual(warningsFor(infer({ note: null }), 'ts'), ['always-null']);
  assert.ok(warningsFor(infer([{ v: 1 }, { v: 'x' }]), 'ts').includes('mixed-union'));
});
