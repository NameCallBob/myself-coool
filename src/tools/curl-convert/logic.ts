/**
 * curl command → fetch / axios / requests / httpie. Parsed, never executed.
 *
 * Two layers, because shell quoting is where these converters break: a
 * tokenizer that implements the parts of POSIX word splitting curl commands
 * actually use (single quotes literal, double quotes with a short escape set,
 * backslash-newline continuations, `$'...'` ANSI-C strings), and then a flag
 * parser over the resulting words. Nothing is evaluated: a `$(...)` or a
 * backtick stays the literal text it was, and is reported as a warning rather
 * than being expanded.
 *
 * The emitters try to be faithful rather than tidy. `curl -d` sends
 * `application/x-www-form-urlencoded` whether or not you asked for it, so the
 * generated code sets that header explicitly instead of inheriting a default
 * the reader cannot see. Where a target genuinely cannot express something
 * (`--insecure` in `fetch`), the code says so in a comment instead of quietly
 * dropping it.
 */

export type Header = { name: string; value: string };

export type BodyKind = 'none' | 'raw' | 'urlencoded' | 'multipart';

export type FormField = { name: string; value: string; isFile: boolean };

export type Request = {
  method: string;
  url: string;
  /** Explicit `?a=b` pairs added by `-G`, appended to the URL when emitted. */
  query: [string, string][];
  headers: Header[];
  cookies: string;
  auth: { user: string; password: string } | null;
  bodyKind: BodyKind;
  /** Raw or urlencoded body text. */
  body: string;
  form: FormField[];
  insecure: boolean;
  followRedirects: boolean;
  compressed: boolean;
  /** Seconds, from --max-time. */
  timeout: number | null;
  proxy: string;
  warnings: string[];
};

export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurlParseError';
  }
}

/** Words read before the tokenizer gives up. A curl command is one line. */
export const MAX_TOKENS = 5_000;

/* ── Shell tokenizer ──────────────────────── */

const ANSI_C: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  e: '\x1b',
};

/**
 * Splits a command line into words the way a shell would.
 *
 * Unbalanced quotes are an error: a converter that silently drops the rest of
 * the command would produce code that looks right and sends the wrong body.
 */
export function tokenizeShell(source: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;

  const push = () => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };

  while (i < source.length) {
    if (tokens.length > MAX_TOKENS) throw new CurlParseError(`more than ${MAX_TOKENS} words`);
    const ch = source[i];

    if (ch === '\\') {
      const next = source[i + 1];
      if (next === '\n') {
        i += 2;
        continue;
      }
      if (next === undefined) throw new CurlParseError('the command ends with a backslash');
      current += next;
      started = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = source.indexOf("'", i + 1);
      if (end === -1) throw new CurlParseError("unclosed single quote (')");
      current += source.slice(i + 1, end);
      started = true;
      i = end + 1;
      continue;
    }

    if (ch === '$' && source[i + 1] === "'") {
      // ANSI-C quoting: bash's $'\n' form, which appears in copied commands.
      let j = i + 2;
      let out = '';
      let closed = false;
      while (j < source.length) {
        if (source[j] === '\\') {
          const code = source[j + 1];
          if (code === 'x' && /^[0-9a-fA-F]{2}/.test(source.slice(j + 2, j + 4))) {
            out += String.fromCharCode(Number.parseInt(source.slice(j + 2, j + 4), 16));
            j += 4;
            continue;
          }
          out += ANSI_C[code] ?? `\\${code ?? ''}`;
          j += 2;
          continue;
        }
        if (source[j] === "'") {
          closed = true;
          break;
        }
        out += source[j];
        j += 1;
      }
      if (!closed) throw new CurlParseError("unclosed $'...' string");
      current += out;
      started = true;
      i = j + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let out = '';
      let closed = false;
      while (j < source.length) {
        if (source[j] === '\\') {
          const next = source[j + 1];
          if (next === '\n') {
            j += 2;
            continue;
          }
          // Inside double quotes a backslash only escapes these four.
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            out += next;
            j += 2;
            continue;
          }
          out += '\\';
          j += 1;
          continue;
        }
        if (source[j] === '"') {
          closed = true;
          break;
        }
        out += source[j];
        j += 1;
      }
      if (!closed) throw new CurlParseError('unclosed double quote (")');
      current += out;
      started = true;
      i = j + 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      push();
      i += 1;
      continue;
    }

    // A pipe or a semicolon ends the curl command; anything after it belongs to
    // another program and is not ours to translate.
    if (ch === '|' || ch === ';' || ch === '&') break;

    current += ch;
    started = true;
    i += 1;
  }

  push();
  return tokens;
}

/* ── Flag parsing ─────────────────────────── */

/** Flags that take a value we use. */
const VALUE_FLAGS = new Set([
  '-X', '--request',
  '-H', '--header',
  '-d', '--data', '--data-raw', '--data-ascii', '--data-binary', '--data-urlencode',
  '--json',
  '-F', '--form', '--form-string',
  '-u', '--user',
  '-b', '--cookie',
  '-A', '--user-agent',
  '-e', '--referer',
  '--url',
  '-m', '--max-time',
  '-x', '--proxy',
  '-T', '--upload-file',
]);

/** Flags that take a value we deliberately ignore, listed so their argument
 *  is not mistaken for the URL. */
const IGNORED_VALUE_FLAGS = new Set([
  '-o', '--output',
  '-w', '--write-out',
  '--connect-timeout',
  '--retry', '--retry-delay', '--retry-max-time',
  '--cert', '--key', '--cacert', '--capath', '--pass',
  '--limit-rate',
  '-c', '--cookie-jar',
  '--resolve',
  '--interface',
  '-E',
  '--proxy-user',
  '--http1.1', '--http2-prior-knowledge',
]);

const BOOLEAN_FLAGS = new Set([
  '-k', '--insecure',
  '-L', '--location',
  '--compressed',
  '-I', '--head',
  '-s', '--silent',
  '-S', '--show-error',
  '-v', '--verbose',
  '-i', '--include',
  '-f', '--fail',
  '-O', '--remote-name',
  '-g', '--globoff',
  '-N', '--no-buffer',
  '--http1.0', '--http2', '--http3',
  '-4', '-6',
  '--no-progress-meter', '--progress-bar', '-#',
  '--tlsv1.2', '--tlsv1.3',
  '--path-as-is',
]);

function splitPair(text: string): [string, string] {
  const index = text.indexOf('=');
  if (index === -1) return [text, ''];
  return [text.slice(0, index), text.slice(index + 1)];
}

/** Parses a tokenized curl command into a request. */
export function parseCurl(source: string): Request {
  const tokens = tokenizeShell(source.trim().replace(/^\s*[$#>]\s+/, ''));
  const request: Request = {
    method: '',
    url: '',
    query: [],
    headers: [],
    cookies: '',
    auth: null,
    bodyKind: 'none',
    body: '',
    form: [],
    insecure: false,
    followRedirects: false,
    compressed: false,
    timeout: null,
    proxy: '',
    warnings: [],
  };

  if (tokens.length === 0) throw new CurlParseError('nothing to parse');
  let start = 0;
  if (tokens[0] === 'curl') start = 1;
  else if (/(^|\/)curl(\.exe)?$/.test(tokens[0])) start = 1;
  else request.warnings.push('the command does not start with curl; parsed as if it did');

  const dataParts: string[] = [];
  let getWithData = false;
  let head = false;
  let jsonFlag = false;

  const noteFileArgument = (flag: string, value: string) => {
    if (value.startsWith('@') || value.startsWith('<')) {
      request.warnings.push(
        `${flag} ${value} reads a local file; a browser cannot, so the generated code leaves it as text`
      );
    }
  };

  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];

    // Combined short booleans such as -sL, and -H with its value attached.
    if (/^-[a-zA-Z]{2,}$/.test(token) && !VALUE_FLAGS.has(token) && !IGNORED_VALUE_FLAGS.has(token)) {
      const letters = token.slice(1).split('');
      const expanded = letters.map((letter) => `-${letter}`);
      if (expanded.every((flag) => BOOLEAN_FLAGS.has(flag))) {
        tokens.splice(i, 1, ...expanded);
        i -= 1;
        continue;
      }
      const last = expanded[expanded.length - 1];
      if (expanded.slice(0, -1).every((flag) => BOOLEAN_FLAGS.has(flag)) && VALUE_FLAGS.has(last)) {
        tokens.splice(i, 1, ...expanded);
        i -= 1;
        continue;
      }
    }

    if (token === '--') continue;

    let flag = token;
    let inlineValue: string | null = null;
    if (/^--[a-z0-9-]+=/i.test(token)) {
      const [name, value] = splitPair(token);
      flag = name;
      inlineValue = value;
    } else if (/^-[XHdFubAe]./.test(token)) {
      // `-H'Accept: x'` and `-XPOST`: the value is glued to the flag.
      flag = token.slice(0, 2);
      inlineValue = token.slice(2);
    }

    const takeValue = (): string => {
      if (inlineValue !== null) return inlineValue;
      const next = tokens[i + 1];
      if (next === undefined) throw new CurlParseError(`${flag} needs a value`);
      i += 1;
      return next;
    };

    if (BOOLEAN_FLAGS.has(flag)) {
      if (flag === '-k' || flag === '--insecure') request.insecure = true;
      else if (flag === '-L' || flag === '--location') request.followRedirects = true;
      else if (flag === '--compressed') request.compressed = true;
      else if (flag === '-I' || flag === '--head') head = true;
      continue;
    }

    if (IGNORED_VALUE_FLAGS.has(flag)) {
      const value = takeValue();
      request.warnings.push(`${flag} ${value.slice(0, 40)} has no equivalent in code and was dropped`);
      continue;
    }

    if (flag === '-G' || flag === '--get') {
      getWithData = true;
      continue;
    }

    if (VALUE_FLAGS.has(flag)) {
      const value = takeValue();
      switch (flag) {
        case '-X':
        case '--request':
          request.method = value.toUpperCase();
          break;
        case '-H':
        case '--header': {
          const colon = value.indexOf(':');
          if (colon === -1) {
            // `-H 'X-Thing;'` removes a header in curl; there is nothing to send.
            if (value.endsWith(';')) request.warnings.push(`${flag} ${value} removes a header and was dropped`);
            else request.warnings.push(`${flag} ${value} is not 'Name: value' and was dropped`);
            break;
          }
          request.headers.push({ name: value.slice(0, colon).trim(), value: value.slice(colon + 1).trim() });
          break;
        }
        case '-d':
        case '--data':
        case '--data-raw':
        case '--data-ascii':
        case '--data-binary':
          noteFileArgument(flag, value);
          dataParts.push(value);
          if (request.bodyKind === 'none') request.bodyKind = 'raw';
          break;
        case '--data-urlencode': {
          noteFileArgument(flag, value);
          const eq = value.indexOf('=');
          dataParts.push(
            eq === -1
              ? encodeURIComponent(value)
              : `${value.slice(0, eq)}=${encodeURIComponent(value.slice(eq + 1))}`
          );
          if (request.bodyKind === 'none') request.bodyKind = 'raw';
          break;
        }
        case '--json':
          jsonFlag = true;
          dataParts.push(value);
          request.bodyKind = 'raw';
          break;
        case '-F':
        case '--form':
        case '--form-string': {
          const [name, raw] = splitPair(value);
          const isFile = flag !== '--form-string' && raw.startsWith('@');
          request.form.push({ name, value: isFile ? raw.slice(1).split(';')[0] : raw, isFile });
          request.bodyKind = 'multipart';
          break;
        }
        case '-u':
        case '--user': {
          const colon = value.indexOf(':');
          request.auth =
            colon === -1
              ? { user: value, password: '' }
              : { user: value.slice(0, colon), password: value.slice(colon + 1) };
          break;
        }
        case '-b':
        case '--cookie':
          noteFileArgument(flag, value);
          request.cookies = request.cookies ? `${request.cookies}; ${value}` : value;
          break;
        case '-A':
        case '--user-agent':
          request.headers.push({ name: 'User-Agent', value });
          break;
        case '-e':
        case '--referer':
          request.headers.push({ name: 'Referer', value });
          break;
        case '--url':
          request.url = value;
          break;
        case '-m':
        case '--max-time': {
          const seconds = Number(value);
          request.timeout = Number.isFinite(seconds) ? seconds : null;
          break;
        }
        case '-x':
        case '--proxy':
          request.proxy = value;
          break;
        case '-T':
        case '--upload-file':
          request.warnings.push(`${flag} uploads a local file; the generated code cannot read it`);
          request.body = '';
          request.bodyKind = 'raw';
          if (request.method === '') request.method = 'PUT';
          break;
      }
      continue;
    }

    if (token.startsWith('-')) {
      request.warnings.push(`${token} is not recognised and was ignored`);
      continue;
    }

    if (request.url === '') request.url = token;
    else request.warnings.push(`more than one URL given; ${token.slice(0, 40)} was ignored`);
  }

  if (request.url === '') throw new CurlParseError('no URL in the command');
  // Substitution survives tokenizing as literal text — which is the point. Say
  // so wherever it appears, because the generated code will send the dollar
  // signs rather than whatever the shell would have put there.
  if (tokens.some((token) => /\$\(|\$\{|`/.test(token))) {
    request.warnings.push('the command contains shell substitution, which is kept as literal text');
  }

  const joined = dataParts.join('&');
  if (getWithData && joined !== '') {
    for (const part of joined.split('&')) {
      const [name, value] = splitPair(part);
      request.query.push([name, value]);
    }
    request.bodyKind = 'none';
    request.body = '';
  } else if (request.bodyKind === 'raw') {
    request.body = joined;
  }

  const hasContentType = request.headers.some((header) => header.name.toLowerCase() === 'content-type');
  if (jsonFlag) {
    if (!hasContentType) request.headers.unshift({ name: 'Content-Type', value: 'application/json' });
    if (!request.headers.some((header) => header.name.toLowerCase() === 'accept')) {
      request.headers.unshift({ name: 'Accept', value: 'application/json' });
    }
  } else if (request.bodyKind === 'raw' && request.body !== '' && !hasContentType) {
    // What curl actually sends for -d, stated rather than inherited.
    request.headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    request.bodyKind = 'urlencoded';
  }

  if (request.method === '') {
    request.method = head ? 'HEAD' : request.bodyKind === 'none' ? 'GET' : 'POST';
  }
  if (request.insecure) {
    request.warnings.push('--insecure cannot be expressed in browser fetch; the comment in the output says so');
  }

  return request;
}

/* ── Emitting ─────────────────────────────── */

export type Target = 'fetch' | 'axios' | 'requests' | 'httpie';

export type EmitOptions = { indent: number; awaitStyle: boolean };

export const DEFAULT_EMIT: EmitOptions = { indent: 2, awaitStyle: true };

/** Single-quoted JavaScript string. */
export function jsString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

/** Python string literal, single-quoted, with the same escapes. */
export function pyString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

/** Shell word for httpie output: quoted only when it has to be. */
export function shellWord(value: string): string {
  if (value !== '' && !/[\s'"$`\\|&;<>()*?#~]/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A JSON value as a Python literal, for `json=` in requests. */
export function toPythonLiteral(value: unknown, indent: number, level = 1): string {
  const pad = ' '.repeat(indent * level);
  const closing = ' '.repeat(indent * (level - 1));
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return pyString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${pad}${toPythonLiteral(item, indent, level + 1)}`).join(',\n')}\n${closing}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  return `{\n${entries
    .map(([key, member]) => `${pad}${pyString(key)}: ${toPythonLiteral(member, indent, level + 1)}`)
    .join(',\n')}\n${closing}}`;
}

/** The body as parsed JSON, when it is JSON and is declared as JSON. */
export function jsonBody(request: Request): unknown | undefined {
  const contentType = request.headers.find((header) => header.name.toLowerCase() === 'content-type');
  if (!contentType || !/json/i.test(contentType.value)) return undefined;
  if (request.body.trim() === '') return undefined;
  try {
    return JSON.parse(request.body) as unknown;
  } catch {
    return undefined;
  }
}

function urlWithQuery(request: Request): string {
  if (request.query.length === 0) return request.url;
  const search = request.query
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  return request.url.includes('?') ? `${request.url}&${search}` : `${request.url}?${search}`;
}

function headersWithAuth(request: Request, encodeBasic: boolean): Header[] {
  const headers = [...request.headers];
  if (request.cookies) headers.push({ name: 'Cookie', value: request.cookies });
  if (request.auth && encodeBasic) {
    headers.push({
      name: 'Authorization',
      // btoa is left in the generated code on purpose: a base64 constant in a
      // snippet hides which credentials are in it.
      value: `__BASIC__${request.auth.user}:${request.auth.password}`,
    });
  }
  return headers;
}

export function emitFetch(request: Request, options: EmitOptions = DEFAULT_EMIT): string {
  const pad = ' '.repeat(options.indent);
  const lines: string[] = [];
  const headers = headersWithAuth(request, true);
  const body = jsonBody(request);

  if (request.insecure) {
    lines.push('// curl --insecure skips certificate checks. fetch() cannot: a browser');
    lines.push('// always verifies, and there is no option to turn it off.');
  }
  if (request.proxy) lines.push(`// curl --proxy ${request.proxy} has no fetch equivalent.`);
  if (request.timeout !== null) {
    lines.push(`const controller = new AbortController();`);
    lines.push(`const timer = setTimeout(() => controller.abort(), ${request.timeout * 1000});`);
  }

  if (request.bodyKind === 'multipart') {
    lines.push('const form = new FormData();');
    for (const field of request.form) {
      if (field.isFile) {
        lines.push(`// ${field.name}: pick a File from an <input type="file">; ${field.value} is a local path.`);
        lines.push(`form.append(${jsString(field.name)}, file);`);
      } else {
        lines.push(`form.append(${jsString(field.name)}, ${jsString(field.value)});`);
      }
    }
  }

  const init: string[] = [`method: ${jsString(request.method)}`];
  if (headers.length > 0) {
    const rows = headers.map((header) => {
      const value = header.value.startsWith('__BASIC__')
        ? `'Basic ' + btoa(${jsString(header.value.slice('__BASIC__'.length))})`
        : jsString(header.value);
      return `${pad}${pad}${jsString(header.name)}: ${value},`;
    });
    init.push(`headers: {\n${rows.join('\n')}\n${pad}}`);
  }
  if (request.bodyKind === 'multipart') init.push('body: form');
  else if (request.bodyKind !== 'none' && request.body !== '') {
    init.push(body === undefined ? `body: ${jsString(request.body)}` : `body: JSON.stringify(${toJsLiteral(body, options.indent, 1)})`);
  }
  if (request.timeout !== null) init.push('signal: controller.signal');
  if (request.followRedirects) init.push(`redirect: 'follow'`);

  const call = `fetch(${jsString(urlWithQuery(request))}, {\n${init.map((row) => `${pad}${row},`).join('\n')}\n})`;

  if (options.awaitStyle) {
    lines.push(`const response = await ${call};`);
    if (request.timeout !== null) lines.push('clearTimeout(timer);');
    lines.push('const data = await response.json();');
  } else {
    lines.push(`${call}\n${pad}.then((response) => response.json())\n${pad}.then((data) => console.log(data));`);
  }
  return lines.join('\n');
}

/** A JSON value as a JavaScript object literal. Same shape as the Python one. */
export function toJsLiteral(value: unknown, indent: number, level = 1): string {
  const pad = ' '.repeat(indent * level);
  const closing = ' '.repeat(indent * (level - 1));
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return jsString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${pad}${toJsLiteral(item, indent, level + 1)}`).join(',\n')}\n${closing}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  return `{\n${entries
    .map(([key, member]) => `${pad}${jsString(key)}: ${toJsLiteral(member, indent, level + 1)}`)
    .join(',\n')}\n${closing}}`;
}

export function emitAxios(request: Request, options: EmitOptions = DEFAULT_EMIT): string {
  const pad = ' '.repeat(options.indent);
  const lines: string[] = [`import axios from 'axios';`, ''];
  const headers = headersWithAuth(request, false);
  const body = jsonBody(request);

  if (request.insecure) {
    lines.push('// --insecure needs an https.Agent({ rejectUnauthorized: false }) on Node,');
    lines.push('// and is impossible in the browser.');
  }

  if (request.bodyKind === 'multipart') {
    lines.push('const form = new FormData();');
    for (const field of request.form) {
      if (field.isFile) lines.push(`// ${field.name}: ${field.value} is a local path — supply a File or a stream.`);
      lines.push(`form.append(${jsString(field.name)}, ${field.isFile ? 'file' : jsString(field.value)});`);
    }
    lines.push('');
  }

  const config: string[] = [
    `method: ${jsString(request.method.toLowerCase())}`,
    `url: ${jsString(urlWithQuery(request))}`,
  ];
  if (headers.length > 0) {
    config.push(
      `headers: {\n${headers.map((header) => `${pad}${pad}${jsString(header.name)}: ${jsString(header.value)},`).join('\n')}\n${pad}}`
    );
  }
  if (request.auth) {
    config.push(
      `auth: { username: ${jsString(request.auth.user)}, password: ${jsString(request.auth.password)} }`
    );
  }
  if (request.bodyKind === 'multipart') config.push('data: form');
  else if (request.bodyKind !== 'none' && request.body !== '') {
    config.push(body === undefined ? `data: ${jsString(request.body)}` : `data: ${toJsLiteral(body, options.indent, 1)}`);
  }
  if (request.timeout !== null) config.push(`timeout: ${request.timeout * 1000}`);

  const call = `axios({\n${config.map((row) => `${pad}${row},`).join('\n')}\n})`;
  if (options.awaitStyle) lines.push(`const { data } = await ${call};`);
  else lines.push(`${call}\n${pad}.then(({ data }) => console.log(data));`);
  return lines.join('\n');
}

export function emitRequests(request: Request, options: EmitOptions = DEFAULT_EMIT): string {
  const pad = ' '.repeat(options.indent);
  const lines: string[] = ['import requests', ''];
  const headers = [...request.headers];
  if (request.cookies) headers.push({ name: 'Cookie', value: request.cookies });
  const body = jsonBody(request);

  const args: string[] = [pyString(urlWithQuery(request))];
  if (headers.length > 0) {
    args.push(
      `headers={\n${headers.map((header) => `${pad}${pad}${pyString(header.name)}: ${pyString(header.value)},`).join('\n')}\n${pad}}`
    );
  }
  if (request.auth) args.push(`auth=(${pyString(request.auth.user)}, ${pyString(request.auth.password)})`);
  if (request.bodyKind === 'multipart') {
    const files = request.form.filter((field) => field.isFile);
    const fields = request.form.filter((field) => !field.isFile);
    if (fields.length > 0) {
      args.push(`data={${fields.map((field) => `${pyString(field.name)}: ${pyString(field.value)}`).join(', ')}}`);
    }
    if (files.length > 0) {
      args.push(
        `files={${files
          .map((field) => `${pyString(field.name)}: open(${pyString(field.value)}, 'rb')`)
          .join(', ')}}`
      );
    }
  } else if (request.bodyKind !== 'none' && request.body !== '') {
    if (body === undefined) args.push(`data=${pyString(request.body)}`);
    else args.push(`json=${toPythonLiteral(body, options.indent, 1)}`);
  }
  if (request.timeout !== null) args.push(`timeout=${request.timeout}`);
  if (request.insecure) args.push('verify=False');
  if (request.proxy) args.push(`proxies={'http': ${pyString(request.proxy)}, 'https': ${pyString(request.proxy)}}`);
  if (!request.followRedirects && request.method !== 'GET' && request.method !== 'HEAD') {
    // requests follows redirects by default for every method; curl does not
    // follow any without -L. Saying so beats a silent difference in behaviour.
    lines.push('# curl without -L does not follow redirects; requests does. Pass');
    lines.push('# allow_redirects=False to match the command exactly.');
  }

  const method = request.method.toLowerCase();
  const known = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  const call = known.includes(method)
    ? `requests.${method}(\n${args.map((row) => `${pad}${row},`).join('\n')}\n)`
    : `requests.request(\n${pad}${pyString(request.method)},\n${args.map((row) => `${pad}${row},`).join('\n')}\n)`;

  lines.push(`response = ${call}`);
  lines.push('response.raise_for_status()');
  lines.push('print(response.json())');
  return lines.join('\n');
}

/**
 * httpie form. The request items carry the body, so a JSON object becomes
 * `key=value` / `key:=json` items rather than a quoted blob; anything else is
 * piped in on stdin, which is the only faithful way to send raw bytes.
 */
export function emitHttpie(request: Request): string {
  const parts: string[] = ['http'];
  const body = jsonBody(request);
  const jsonObject =
    body !== undefined && body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  const pipeBody =
    request.bodyKind === 'raw' && request.body !== '' && jsonObject === undefined ? request.body : '';

  if (request.insecure) parts.push('--verify=no');
  if (request.followRedirects) parts.push('--follow');
  if (request.timeout !== null) parts.push(`--timeout=${request.timeout}`);
  if (request.proxy) parts.push(`--proxy=all:${shellWord(request.proxy)}`);
  if (request.auth) parts.push('-a', shellWord(`${request.auth.user}:${request.auth.password}`));
  if (request.bodyKind === 'multipart' || request.bodyKind === 'urlencoded') parts.push('--form');

  parts.push(request.method);
  parts.push(shellWord(urlWithQuery(request)));

  for (const header of request.headers) {
    // httpie writes Content-Type itself once it knows the body is form or JSON.
    const isContentType = header.name.toLowerCase() === 'content-type';
    if (isContentType && (jsonObject !== undefined || request.bodyKind !== 'raw')) continue;
    parts.push(shellWord(`${header.name}:${header.value}`));
  }
  if (request.cookies) parts.push(shellWord(`Cookie:${request.cookies}`));

  if (request.bodyKind === 'multipart') {
    for (const field of request.form) {
      parts.push(shellWord(`${field.name}${field.isFile ? '@' : '='}${field.value}`));
    }
  } else if (request.bodyKind === 'urlencoded') {
    for (const pair of request.body.split('&').filter(Boolean)) {
      const [name, value] = splitPair(pair);
      // The body was already percent-encoded for the wire; httpie encodes its
      // own items, so it goes back to plain text here.
      parts.push(shellWord(`${decodeMaybe(name)}=${decodeMaybe(value)}`));
    }
  } else if (jsonObject !== undefined) {
    for (const [name, value] of Object.entries(jsonObject)) {
      parts.push(
        typeof value === 'string'
          ? shellWord(`${name}=${value}`)
          : shellWord(`${name}:=${JSON.stringify(value) ?? 'null'}`)
      );
    }
  }

  const command = parts.join(' ');
  return pipeBody === '' ? command : `echo ${shellWord(pipeBody)} | ${command}`;
}

/** `%20` back to a space, leaving anything that is not valid encoding alone. */
function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export type Outcome =
  | { ok: true; request: Request; code: string }
  | { ok: false; message: string };

export function convert(source: string, target: Target, options: EmitOptions = DEFAULT_EMIT): Outcome {
  if (source.trim() === '') return { ok: false, message: 'empty input' };
  let request: Request;
  try {
    request = parseCurl(source);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const code =
    target === 'fetch'
      ? emitFetch(request, options)
      : target === 'axios'
        ? emitAxios(request, options)
        : target === 'requests'
          ? emitRequests(request, options)
          : emitHttpie(request);
  return { ok: true, request, code };
}
