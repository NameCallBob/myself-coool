/**
 * JSON sample → type declaration, in four languages.
 *
 * Inference from a sample is guessing, and the guessing is where these tools go
 * wrong. Two things are done deliberately here:
 *
 *  - Array elements are *merged*, not sampled. If the first element has `note`
 *    and the second does not, `note` comes out optional rather than required —
 *    a single-element read would have produced a type that rejects real data.
 *  - Nothing is invented. An empty array cannot say what it holds, and a
 *    member that is always `null` cannot say what it would hold when set; both
 *    come out as the target language's "unknown", never as `string`.
 *
 * `number` splits into integer and fractional because Go and Python have to
 * choose, and JSON does not tell them: a sample of `1` is reported as an
 * integer with a warning rather than silently becoming a float everywhere.
 */

export type Schema =
  | { k: 'unknown' }
  | { k: 'null' }
  | { k: 'boolean' }
  | { k: 'number'; int: boolean }
  | { k: 'string' }
  | { k: 'array'; item: Schema }
  | { k: 'object'; fields: Field[] }
  | { k: 'union'; options: Schema[] };

export type Field = { name: string; schema: Schema; optional: boolean };

/** Nesting levels inferred before giving up. */
export const MAX_DEPTH = 64;
/** Distinct members across the whole document before giving up. */
export const MAX_FIELDS = 5_000;

export class SampleTooBig extends Error {
  readonly reason: 'depth' | 'fields';

  constructor(reason: 'depth' | 'fields') {
    super(reason === 'depth' ? `nesting deeper than ${MAX_DEPTH}` : `more than ${MAX_FIELDS} members`);
    this.name = 'SampleTooBig';
    this.reason = reason;
  }
}

/* ── Inference ────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Structural identity, used to keep unions from collecting duplicates. */
export function schemaKey(schema: Schema): string {
  switch (schema.k) {
    case 'number':
      return schema.int ? 'int' : 'float';
    case 'array':
      return `[${schemaKey(schema.item)}]`;
    case 'object':
      return `{${schema.fields.map((f) => `${f.name}${f.optional ? '?' : ''}:${schemaKey(f.schema)}`).join(',')}}`;
    case 'union':
      return `(${schema.options.map(schemaKey).sort().join('|')})`;
    default:
      return schema.k;
  }
}

function flatten(schema: Schema): Schema[] {
  return schema.k === 'union' ? schema.options : [schema];
}

function union(options: Schema[]): Schema {
  const seen = new Map<string, Schema>();
  for (const option of options) {
    if (option.k === 'unknown') continue;
    seen.set(schemaKey(option), option);
  }
  const list = [...seen.values()];
  if (list.length === 0) return { k: 'unknown' };
  if (list.length === 1) return list[0];
  return { k: 'union', options: list };
}

/**
 * Least schema accepting both inputs.
 *
 * Objects merge member-wise, so a member missing on either side becomes
 * optional. Anything else that does not match collapses to a union, which the
 * emitters render as the target language's union or as its "anything" type.
 */
export function mergeSchema(a: Schema, b: Schema): Schema {
  if (a.k === 'unknown') return b;
  if (b.k === 'unknown') return a;
  if (a.k === 'union' || b.k === 'union') {
    const parts = [...flatten(a), ...flatten(b)];
    // Merge same-kind members of the two unions rather than piling up
    // `{a:1} | {a:2}`, which is never what a type declaration wants.
    const byKind = new Map<string, Schema>();
    for (const part of parts) {
      const kind = part.k === 'number' ? 'number' : part.k;
      const held = byKind.get(kind);
      byKind.set(kind, held ? mergeSchema(held, part) : part);
    }
    return union([...byKind.values()]);
  }
  if (a.k !== b.k) return union([a, b]);

  if (a.k === 'number' && b.k === 'number') return { k: 'number', int: a.int && b.int };
  if (a.k === 'array' && b.k === 'array') return { k: 'array', item: mergeSchema(a.item, b.item) };
  if (a.k === 'object' && b.k === 'object') {
    const fields: Field[] = [];
    const bByName = new Map(b.fields.map((field) => [field.name, field]));
    for (const field of a.fields) {
      const other = bByName.get(field.name);
      if (other) {
        fields.push({
          name: field.name,
          schema: mergeSchema(field.schema, other.schema),
          optional: field.optional || other.optional,
        });
      } else {
        fields.push({ ...field, optional: true });
      }
    }
    const aNames = new Set(a.fields.map((field) => field.name));
    for (const field of b.fields) {
      if (!aNames.has(field.name)) fields.push({ ...field, optional: true });
    }
    return { k: 'object', fields };
  }
  return a;
}

export function infer(value: unknown, depth = 0, budget = { fields: 0 }): Schema {
  if (depth > MAX_DEPTH) throw new SampleTooBig('depth');
  if (value === null) return { k: 'null' };
  if (Array.isArray(value)) {
    let item: Schema = { k: 'unknown' };
    for (const element of value) item = mergeSchema(item, infer(element, depth + 1, budget));
    return { k: 'array', item };
  }
  if (isRecord(value)) {
    const fields: Field[] = [];
    for (const [name, member] of Object.entries(value)) {
      budget.fields += 1;
      if (budget.fields > MAX_FIELDS) throw new SampleTooBig('fields');
      fields.push({ name, schema: infer(member, depth + 1, budget), optional: false });
    }
    return { k: 'object', fields };
  }
  const t = typeof value;
  if (t === 'boolean') return { k: 'boolean' };
  if (t === 'string') return { k: 'string' };
  if (t === 'number') return { k: 'number', int: Number.isInteger(value) };
  throw new TypeError(`not a JSON value: ${t}`);
}

/** Splits a union into its nullable part and the rest. */
function withoutNull(schema: Schema): { schema: Schema; nullable: boolean } {
  if (schema.k === 'null') return { schema: { k: 'unknown' }, nullable: true };
  if (schema.k !== 'union') return { schema, nullable: false };
  const rest = schema.options.filter((option) => option.k !== 'null');
  if (rest.length === schema.options.length) return { schema, nullable: false };
  return { schema: rest.length === 0 ? { k: 'unknown' } : union(rest), nullable: true };
}

/* ── Naming ───────────────────────────────── */

export function pascalCase(raw: string): string {
  // Split on anything that is not a letter or a digit in any script: a key
  // written in Chinese must still produce a usable type name rather than an
  // empty one, and two such keys must not collapse onto the same name.
  const parts = raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const joined = parts
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  // A name has to start with a letter in all four targets.
  return /^\p{L}/u.test(joined) ? joined : `N${joined}`;
}

/** English plural → singular, for naming the element type of a list. */
export function singular(name: string): string {
  if (/ies$/i.test(name) && name.length > 4) return `${name.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/i.test(name)) return name.slice(0, -2);
  if (/ss$/i.test(name)) return name;
  if (/s$/i.test(name) && name.length > 2) return name.slice(0, -1);
  return name;
}

type Naming = { taken: Set<string>; byShape: Map<string, string> };

/** One declared name per distinct object shape, deduplicated by structure. */
function nameFor(schema: Schema, hint: string, naming: Naming): string {
  const shape = schemaKey(schema);
  const held = naming.byShape.get(shape);
  if (held) return held;
  const base = pascalCase(hint) || 'Root';
  let name = base;
  let n = 2;
  while (naming.taken.has(name)) {
    name = `${base}${n}`;
    n += 1;
  }
  naming.taken.add(name);
  naming.byShape.set(shape, name);
  return name;
}

/**
 * Hint for the element type when the document's root is an array.
 *
 * `Root` would otherwise name both the alias and the element type, and the
 * emitted code would redeclare it.
 */
function rootHint(schema: Schema, rootName: string): string {
  if (schema.k !== 'array') return rootName;
  return singular(rootName) === rootName ? `${rootName}Item` : rootName;
}

export type Target = 'ts' | 'zod' | 'go' | 'py';

export type EmitOptions = {
  rootName: string;
  /** Space count, or 0 for a tab. Go always uses a tab, as gofmt does. */
  indent: number;
  /** Emit `?`/`omitempty`/`NotRequired` for members absent from some samples. */
  markOptional: boolean;
};

export const DEFAULT_EMIT: EmitOptions = { rootName: 'Root', indent: 2, markOptional: true };

function pad(options: EmitOptions, level: number): string {
  const unit = options.indent === 0 ? '\t' : ' '.repeat(options.indent);
  return unit.repeat(level);
}

/* ── TypeScript ───────────────────────────── */

const TS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function tsKey(name: string): string {
  return TS_IDENT.test(name) ? name : JSON.stringify(name);
}

function tsType(schema: Schema, hint: string, naming: Naming, out: string[], options: EmitOptions): string {
  const { schema: bare, nullable } = withoutNull(schema);
  const suffix = nullable ? ' | null' : '';
  switch (bare.k) {
    case 'unknown':
      // `unknown` already admits null; adding `| null` would only be noise.
      return 'unknown';
    case 'boolean':
      return `boolean${suffix}`;
    case 'number':
      return `number${suffix}`;
    case 'string':
      return `string${suffix}`;
    case 'null':
      return 'null';
    case 'array': {
      const item = tsType(bare.item, singular(hint), naming, out, options);
      const wrapped = /[ |]/.test(item) ? `(${item})[]` : `${item}[]`;
      return `${wrapped}${suffix}`;
    }
    case 'union':
      return `${bare.options.map((option) => tsType(option, hint, naming, out, options)).join(' | ')}${suffix}`;
    case 'object': {
      const name = nameFor(bare, hint, naming);
      if (!out.some((block) => block.startsWith(`export interface ${name} `))) {
        const body = bare.fields
          .map((field) => {
            const mark = options.markOptional && field.optional ? '?' : '';
            const type = tsType(field.schema, field.name, naming, out, options);
            return `${pad(options, 1)}${tsKey(field.name)}${mark}: ${type};`;
          })
          .join('\n');
        out.push(`export interface ${name} {\n${body || `${pad(options, 1)}[key: string]: unknown;`}\n}`);
      }
      return `${name}${suffix}`;
    }
  }
}

export function emitTypeScript(schema: Schema, options: EmitOptions = DEFAULT_EMIT): string {
  const naming: Naming = { taken: new Set(), byShape: new Map() };
  const blocks: string[] = [];
  const root = tsType(schema, rootHint(schema, options.rootName), naming, blocks, options);
  const declared = blocks.some((block) => block.startsWith(`export interface ${pascalCase(options.rootName)} `));
  const alias = declared && root === pascalCase(options.rootName) ? '' : `export type ${pascalCase(options.rootName)} = ${root};`;
  // Interfaces come out innermost-first; reversing reads top-down like the JSON.
  return [...blocks.reverse(), alias].filter(Boolean).join('\n\n');
}

/* ── Zod ──────────────────────────────────── */

function zodType(schema: Schema, hint: string, naming: Naming, out: string[], options: EmitOptions, level: number): string {
  const { schema: bare, nullable } = withoutNull(schema);
  const suffix = nullable ? '.nullable()' : '';
  switch (bare.k) {
    case 'unknown':
      return 'z.unknown()';
    case 'boolean':
      return `z.boolean()${suffix}`;
    case 'number':
      return `z.number()${bare.int ? '.int()' : ''}${suffix}`;
    case 'string':
      return `z.string()${suffix}`;
    case 'null':
      return 'z.null()';
    case 'array':
      return `z.array(${zodType(bare.item, singular(hint), naming, out, options, level)})${suffix}`;
    case 'union':
      return `z.union([${bare.options.map((o) => zodType(o, hint, naming, out, options, level)).join(', ')}])${suffix}`;
    case 'object': {
      const name = nameFor(bare, hint, naming);
      const variable = name.charAt(0).toLowerCase() + name.slice(1);
      if (!out.some((block) => block.startsWith(`export const ${variable} `))) {
        const body = bare.fields
          .map((field) => {
            const type = zodType(field.schema, field.name, naming, out, options, 1);
            const mark = options.markOptional && field.optional ? '.optional()' : '';
            return `${pad(options, 1)}${tsKey(field.name)}: ${type}${mark},`;
          })
          .join('\n');
        out.push(`export const ${variable} = z.object({\n${body}\n});`);
      }
      return `${variable}${suffix}`;
    }
  }
}

export function emitZod(schema: Schema, options: EmitOptions = DEFAULT_EMIT): string {
  const naming: Naming = { taken: new Set(), byShape: new Map() };
  const blocks: string[] = [];
  const root = zodType(schema, rootHint(schema, options.rootName), naming, blocks, options, 0);
  const rootName = pascalCase(options.rootName);
  const variable = rootName.charAt(0).toLowerCase() + rootName.slice(1);
  const tail =
    root === variable
      ? `export type ${rootName} = z.infer<typeof ${variable}>;`
      : `export const ${variable}Schema = ${root};\nexport type ${rootName} = z.infer<typeof ${variable}Schema>;`;
  return [`import { z } from 'zod';`, ...blocks.reverse(), tail].join('\n\n');
}

/* ── Go ───────────────────────────────────── */

const GO_INITIALISMS = new Set(['id', 'url', 'uri', 'api', 'http', 'https', 'json', 'html', 'xml', 'sql', 'db', 'ip', 'uuid']);

/** Exported Go field name. `user_id` → `UserID`, following the style guide. */
export function goFieldName(raw: string): string {
  const parts = raw
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])/));
  const joined = parts
    .map((part) =>
      GO_INITIALISMS.has(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('');
  // Go identifiers may hold any Unicode letter, but an exported one must start
  // with an upper-case letter — which a CJK name has no notion of, so it keeps
  // the `F` prefix rather than silently becoming unexported.
  return /^\p{Lu}/u.test(joined) ? joined : `F${joined}`;
}

function goType(schema: Schema, hint: string, naming: Naming, out: string[], options: EmitOptions): string {
  const { schema: bare, nullable } = withoutNull(schema);
  const pointer = (type: string) => (nullable && !type.startsWith('[]') && type !== 'any' ? `*${type}` : type);
  switch (bare.k) {
    case 'unknown':
      return 'any';
    case 'boolean':
      return pointer('bool');
    case 'number':
      return pointer(bare.int ? 'int64' : 'float64');
    case 'string':
      return pointer('string');
    case 'null':
      return 'any';
    case 'array':
      return `[]${goType(bare.item, singular(hint), naming, out, options)}`;
    case 'union':
      // Go has no sum type worth generating; `any` is the honest rendering.
      return 'any';
    case 'object': {
      const name = nameFor(bare, hint, naming);
      if (!out.some((block) => block.startsWith(`type ${name} struct`))) {
        const rows = bare.fields.map((field) => {
          const type = goType(field.schema, field.name, naming, out, options);
          const omit = options.markOptional && field.optional ? ',omitempty' : '';
          return {
            name: goFieldName(field.name),
            type,
            tag: '`json:"' + field.name + omit + '"`',
          };
        });
        const nameWidth = Math.max(0, ...rows.map((row) => row.name.length));
        const typeWidth = Math.max(0, ...rows.map((row) => row.type.length));
        const body = rows
          .map((row) => `\t${row.name.padEnd(nameWidth)} ${row.type.padEnd(typeWidth)} ${row.tag}`)
          .join('\n');
        out.push(`type ${name} struct {\n${body}\n}`);
      }
      return pointer(name);
    }
  }
}

export function emitGo(schema: Schema, options: EmitOptions = DEFAULT_EMIT): string {
  const naming: Naming = { taken: new Set(), byShape: new Map() };
  const blocks: string[] = [];
  const root = goType(schema, rootHint(schema, options.rootName), naming, blocks, options);
  const rootName = pascalCase(options.rootName);
  const alias = blocks.some((block) => block.startsWith(`type ${rootName} struct`)) && root === rootName
    ? ''
    : `type ${rootName} ${root}`;
  return [...blocks.reverse(), alias].filter(Boolean).join('\n\n');
}

/* ── Pydantic ─────────────────────────────── */

const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while',
  'with', 'yield',
]);

const PY_IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** A Python attribute name, plus the alias needed when the JSON key differs. */
export function pyFieldName(raw: string): { name: string; alias: string | null } {
  if (PY_IDENT.test(raw) && !PY_KEYWORDS.has(raw)) return { name: raw, alias: null };
  const cleaned = raw.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^(?=\p{N})/u, 'f_');
  const safe = PY_KEYWORDS.has(cleaned) || cleaned === '' ? `${cleaned || 'field'}_` : cleaned;
  return { name: safe, alias: raw };
}

function pyType(schema: Schema, hint: string, naming: Naming, out: string[], options: EmitOptions): string {
  const { schema: bare, nullable } = withoutNull(schema);
  const wrap = (type: string) => (nullable ? `Optional[${type}]` : type);
  switch (bare.k) {
    case 'unknown':
      return 'Any';
    case 'boolean':
      return wrap('bool');
    case 'number':
      return wrap(bare.int ? 'int' : 'float');
    case 'string':
      return wrap('str');
    case 'null':
      return 'Any';
    case 'array':
      return wrap(`list[${pyType(bare.item, singular(hint), naming, out, options)}]`);
    case 'union':
      return wrap(`Union[${bare.options.map((o) => pyType(o, hint, naming, out, options)).join(', ')}]`);
    case 'object': {
      const name = nameFor(bare, hint, naming);
      if (!out.some((block) => block.startsWith(`class ${name}(BaseModel)`))) {
        const rows = bare.fields.map((field) => {
          const type = pyType(field.schema, field.name, naming, out, options);
          const { name: attribute, alias } = pyFieldName(field.name);
          const optional = options.markOptional && field.optional;
          const inner = optional && !type.startsWith('Optional[') ? `Optional[${type}]` : type;
          const parts: string[] = [];
          if (alias !== null) parts.push(`alias=${JSON.stringify(alias)}`);
          if (optional) parts.push('default=None');
          const assignment = parts.length > 0 ? ` = Field(${parts.join(', ')})` : '';
          return `${pad(options, 1)}${attribute}: ${inner}${assignment}`;
        });
        const config = bare.fields.some((field) => pyFieldName(field.name).alias !== null)
          ? `${pad(options, 1)}model_config = ConfigDict(populate_by_name=True)\n\n`
          : '';
        out.push(`class ${name}(BaseModel):\n${config}${rows.join('\n') || `${pad(options, 1)}pass`}`);
      }
      return wrap(name);
    }
  }
}

export function emitPydantic(schema: Schema, options: EmitOptions = DEFAULT_EMIT): string {
  const naming: Naming = { taken: new Set(), byShape: new Map() };
  const blocks: string[] = [];
  const root = pyType(schema, rootHint(schema, options.rootName), naming, blocks, options);
  const rootName = pascalCase(options.rootName);
  const body = [...blocks.reverse()];
  const alias = body.some((block) => block.startsWith(`class ${rootName}(BaseModel)`)) && root === rootName
    ? ''
    : `${rootName} = ${root}`;
  const needs = (token: string) => body.join('\n').includes(token) || root.includes(token) || alias.includes(token);
  const typing = ['Any', 'Optional', 'Union'].filter(needs);
  const imports = [
    typing.length > 0 ? `from typing import ${typing.join(', ')}` : '',
    `from pydantic import BaseModel${
      body.join('\n').includes('Field(') ? ', Field' : ''
    }${body.join('\n').includes('ConfigDict') ? ', ConfigDict' : ''}`,
  ].filter(Boolean);
  return [imports.join('\n'), ...body, alias].filter(Boolean).join('\n\n');
}

/* ── Entry point ──────────────────────────── */

export type Warning = 'empty-array' | 'always-null' | 'mixed-union' | 'integer-guess';

/** What the sample could not tell us. Shown on the page, not hidden. */
export function warningsFor(schema: Schema, seen: Set<Warning> = new Set()): Warning[] {
  const visit = (node: Schema) => {
    switch (node.k) {
      case 'unknown':
        seen.add('empty-array');
        break;
      case 'null':
        seen.add('always-null');
        break;
      case 'number':
        if (node.int) seen.add('integer-guess');
        break;
      case 'array':
        visit(node.item);
        break;
      case 'union':
        seen.add('mixed-union');
        node.options.forEach(visit);
        break;
      case 'object':
        node.fields.forEach((field) => visit(field.schema));
        break;
    }
  };
  visit(schema);
  return [...seen];
}

export function countFields(schema: Schema): number {
  if (schema.k === 'object') {
    return schema.fields.reduce((total, field) => total + 1 + countFields(field.schema), 0);
  }
  if (schema.k === 'array') return countFields(schema.item);
  if (schema.k === 'union') return schema.options.reduce((total, option) => total + countFields(option), 0);
  return 0;
}

export type Outcome =
  | { ok: true; schema: Schema; code: string; warnings: Warning[]; fields: number }
  | { ok: false; message: string };

export function generate(json: string, target: Target, options: EmitOptions = DEFAULT_EMIT): Outcome {
  if (json.trim() === '') return { ok: false, message: 'empty input' };
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  try {
    const schema = infer(value);
    const emit =
      target === 'ts' ? emitTypeScript : target === 'zod' ? emitZod : target === 'go' ? emitGo : emitPydantic;
    return {
      ok: true,
      schema,
      code: emit(schema, options),
      warnings: warningsFor(schema),
      fields: countFields(schema),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
