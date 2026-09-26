import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CurlParseError,
  DEFAULT_EMIT,
  MAX_TOKENS,
  convert,
  emitAxios,
  emitFetch,
  emitHttpie,
  emitRequests,
  jsString,
  jsonBody,
  parseCurl,
  pyString,
  shellWord,
  toJsLiteral,
  parseProxy,
  toPythonLiteral,
  tokenize,
  tokenizeShell,
} from './logic.ts';

/* ── Tokenizer ────────────────────────────── */

test('words split the way a shell splits them', () => {
  assert.deepEqual(tokenizeShell('curl http://x'), ['curl', 'http://x']);
  assert.deepEqual(tokenizeShell('  curl   http://x  '), ['curl', 'http://x']);
  assert.deepEqual(tokenizeShell("curl -H 'A: 1' http://x"), ['curl', '-H', 'A: 1', 'http://x']);
  assert.deepEqual(tokenizeShell('curl -H "A: 1"'), ['curl', '-H', 'A: 1']);
  assert.deepEqual(tokenizeShell('curl -d a=1\\&b=2'), ['curl', '-d', 'a=1&b=2']);
});

test('quotes concatenate, and each quote type keeps its own rules', () => {
  assert.deepEqual(tokenizeShell(`curl 'a'"b"c`), ['curl', 'abc']);
  // Single quotes are literal, including backslashes.
  assert.deepEqual(tokenizeShell(`curl 'a\\nb'`), ['curl', 'a\\nb']);
  // Double quotes: only " \\ $ ` are escapable.
  assert.deepEqual(tokenizeShell('curl "a\\"b"'), ['curl', 'a"b']);
  assert.deepEqual(tokenizeShell('curl "a\\nb"'), ['curl', 'a\\nb']);
  assert.deepEqual(tokenizeShell('curl "cost \\$5"'), ['curl', 'cost $5']);
  // $'...' is bash's ANSI-C form.
  assert.deepEqual(tokenizeShell(`curl $'a\\nb'`), ['curl', 'a\nb']);
  assert.deepEqual(tokenizeShell(`curl $'\\x41'`), ['curl', 'A']);
});

test('a multi-line command joined with backslashes is one command', () => {
  const src = `curl -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{"a":1}' \\\n  https://api.example.com/v1/items`;
  assert.deepEqual(tokenizeShell(src), [
    'curl',
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '-d',
    '{"a":1}',
    'https://api.example.com/v1/items',
  ]);
});

test('an empty value and an empty string are kept apart', () => {
  assert.deepEqual(tokenizeShell(`curl -d '' http://x`), ['curl', '-d', '', 'http://x']);
  assert.deepEqual(tokenizeShell('curl'), ['curl']);
  assert.deepEqual(tokenizeShell('   '), []);
});

test('a pipeline ends the command rather than being swallowed', () => {
  assert.deepEqual(tokenizeShell('curl http://x | jq .'), ['curl', 'http://x']);
  assert.deepEqual(tokenizeShell('curl http://x ; echo done'), ['curl', 'http://x']);
});

test('unbalanced quotes are an error, not a truncated command', () => {
  assert.throws(() => tokenizeShell(`curl 'unclosed`), CurlParseError);
  assert.throws(() => tokenizeShell('curl "unclosed'), CurlParseError);
  assert.throws(() => tokenizeShell(`curl $'unclosed`), CurlParseError);
  assert.throws(() => tokenizeShell('curl http://x \\'), CurlParseError);
  assert.throws(() => tokenizeShell(`curl ${'a '.repeat(MAX_TOKENS + 10)}`), CurlParseError);
});

/* ── Flags ────────────────────────────────── */

test('the simplest command is a GET', () => {
  const request = parseCurl('curl https://example.com/a');
  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://example.com/a');
  assert.deepEqual(request.headers, []);
  assert.equal(request.bodyKind, 'none');
});

test('a body makes it a POST, and -d gets the header curl really sends', () => {
  const request = parseCurl(`curl -d 'a=1' https://x`);
  assert.equal(request.method, 'POST');
  assert.equal(request.bodyKind, 'urlencoded');
  assert.deepEqual(request.headers, [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }]);
  assert.equal(request.body, 'a=1');
});

test('repeated -d joins with &, and --data-urlencode encodes its value', () => {
  assert.equal(parseCurl(`curl -d a=1 -d b=2 https://x`).body, 'a=1&b=2');
  assert.equal(parseCurl(`curl --data-urlencode 'q=a b&c' https://x`).body, 'q=a%20b%26c');
  assert.equal(parseCurl(`curl --data-urlencode 'plain value' https://x`).body, 'plain%20value');
});

test('-X wins over the inferred method, and -I means HEAD', () => {
  assert.equal(parseCurl('curl -X put https://x').method, 'PUT');
  assert.equal(parseCurl('curl -XDELETE https://x').method, 'DELETE');
  assert.equal(parseCurl('curl -I https://x').method, 'HEAD');
  assert.equal(parseCurl('curl -X POST -d a=1 https://x').method, 'POST');
});

test('-G moves the data into the query string', () => {
  const request = parseCurl(`curl -G -d 'q=hello world' -d page=2 https://x/search`);
  assert.equal(request.method, 'GET');
  assert.equal(request.bodyKind, 'none');
  assert.deepEqual(request.query, [['q', 'hello world'], ['page', '2']]);
  assert.match(emitFetch(request), /https:\/\/x\/search\?q=hello%20world&page=2/);
});

test('headers, cookies, user-agent and referer all land as headers', () => {
  const request = parseCurl(
    `curl -H 'Accept: application/json' -H 'X-Trace: 1' -A 'my-agent' -e 'https://ref' -b 'a=1; b=2' https://x`
  );
  assert.deepEqual(request.headers, [
    { name: 'Accept', value: 'application/json' },
    { name: 'X-Trace', value: '1' },
    { name: 'User-Agent', value: 'my-agent' },
    { name: 'Referer', value: 'https://ref' },
  ]);
  assert.equal(request.cookies, 'a=1; b=2');
  assert.match(emitFetch(request), /'Cookie': 'a=1; b=2'/);
});

test('-H with the value glued on, and --flag=value, both parse', () => {
  assert.deepEqual(parseCurl(`curl -H'Accept: x' https://y`).headers, [{ name: 'Accept', value: 'x' }]);
  assert.equal(parseCurl(`curl --request=PATCH https://y`).method, 'PATCH');
  assert.equal(parseCurl(`curl --data-raw='{"a":1}' --header='Content-Type: application/json' https://y`).body, '{"a":1}');
});

test('combined short flags expand', () => {
  const request = parseCurl('curl -skL https://x');
  assert.ok(request.insecure);
  assert.ok(request.followRedirects);
  const withValue = parseCurl(`curl -sLH 'A: 1' https://x`);
  assert.deepEqual(withValue.headers, [{ name: 'A', value: '1' }]);
});

test('--json sets both headers and the body', () => {
  const request = parseCurl(`curl --json '{"a":1}' https://x`);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.headers.map((h) => h.name).sort(), ['Accept', 'Content-Type']);
  assert.deepEqual(jsonBody(request), { a: 1 });
});

test('-u becomes basic auth, kept as the credentials rather than base64', () => {
  const request = parseCurl(`curl -u 'user:pa ss' https://x`);
  assert.deepEqual(request.auth, { user: 'user', password: 'pa ss' });
  assert.match(emitFetch(request), /btoa\('user:pa ss'\)/);
  assert.match(emitAxios(request), /username: 'user', password: 'pa ss'/);
  assert.match(emitRequests(request), /auth=\('user', 'pa ss'\)/);
  assert.match(emitHttpie(request), /-a 'user:pa ss'/);
  assert.deepEqual(parseCurl('curl -u justuser https://x').auth, { user: 'justuser', password: '' });
});

test('-F builds a multipart form and marks file fields', () => {
  const request = parseCurl(`curl -F 'name=value' -F 'photo=@/tmp/a.png;type=image/png' https://x`);
  assert.equal(request.bodyKind, 'multipart');
  assert.deepEqual(request.form, [
    { name: 'name', value: 'value', isFile: false },
    { name: 'photo', value: '/tmp/a.png', isFile: true },
  ]);
  assert.match(emitFetch(request), /form\.append\('name', 'value'\)/);
  assert.match(emitRequests(request), /files=\{'photo': open\('\/tmp\/a\.png', 'rb'\)\}/);
  assert.match(emitHttpie(request), /photo@\/tmp\/a\.png/);
  assert.equal(parseCurl(`curl --form-string 'a=@notafile' https://x`).form[0].isFile, false);
});

test('--max-time, -k, -L, --compressed and --proxy are all kept', () => {
  const request = parseCurl('curl --max-time 2.5 -k -L --compressed -x http://proxy:8080 https://x');
  assert.equal(request.timeout, 2.5);
  assert.ok(request.insecure && request.followRedirects && request.compressed);
  assert.equal(request.proxy, 'http://proxy:8080');
  assert.match(emitRequests(request), /verify=False/);
  assert.match(emitRequests(request), /timeout=2\.5/);
  assert.match(emitHttpie(request), /--verify=no/);
  assert.match(emitFetch(request), /setTimeout\(\(\) => controller\.abort\(\), 2500\)/);
  // fetch cannot skip certificate checks, and says so instead of dropping it.
  assert.match(emitFetch(request), /cannot/);
});

test('flags with no code equivalent are reported, not silently dropped', () => {
  const request = parseCurl('curl -o out.json -w "%{http_code}" --retry 3 https://x');
  assert.equal(request.warnings.length >= 3, true);
  assert.ok(request.warnings.some((w) => w.includes('-o')));
  assert.equal(request.url, 'https://x');
});

test('an unknown flag is a warning and does not eat the URL', () => {
  const request = parseCurl('curl --totally-made-up https://x');
  assert.match(request.warnings.join('\n'), /not recognised/);
  assert.equal(request.url, 'https://x');
});

test('a missing URL and a missing flag value are errors', () => {
  assert.throws(() => parseCurl('curl -X POST'), CurlParseError);
  assert.throws(() => parseCurl('curl https://x -H'), CurlParseError);
  assert.throws(() => parseCurl(''), CurlParseError);
});

test('shell substitution is reported and left as text, never evaluated', () => {
  const request = parseCurl(`curl -H "Authorization: Bearer $(cat token)" https://x`);
  assert.equal(request.headers[0].value, 'Authorization: Bearer $(cat token)'.slice('Authorization: '.length));
  assert.match(request.warnings.join('\n'), /substitution/);
  const backticks = parseCurl('curl https://x/`whoami`');
  assert.match(backticks.warnings.join('\n'), /substitution/);
});

test('@file arguments are reported because a browser cannot read them', () => {
  const request = parseCurl('curl -d @payload.json https://x');
  assert.match(request.warnings.join('\n'), /local file/);
  assert.equal(request.body, '@payload.json');
});

test('a command without the curl word still parses, with a warning', () => {
  const request = parseCurl('https://x -H "A: 1"');
  assert.equal(request.url, 'https://x');
  assert.match(request.warnings.join('\n'), /does not start with curl/);
  assert.equal(parseCurl('/usr/bin/curl https://x').url, 'https://x');
  assert.equal(parseCurl('$ curl https://x').url, 'https://x');
});

/* ── Emitters ─────────────────────────────── */

const JSON_POST = `curl -X POST 'https://api.example.com/v1/items?draft=1' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer abc.def' \\
  -d '{"name":"燈具","qty":2,"tags":["a"],"active":true,"note":null}'`;

test('a JSON POST comes out readable in every target', () => {
  const request = parseCurl(JSON_POST);
  const fetchCode = emitFetch(request);
  assert.match(fetchCode, /method: 'POST'/);
  assert.match(fetchCode, /'Authorization': 'Bearer abc\.def'/);
  assert.match(fetchCode, /body: JSON\.stringify\(\{/);
  assert.match(fetchCode, /'name': '燈具'/);
  assert.match(fetchCode, /'active': true/);
  assert.match(fetchCode, /'note': null/);
  assert.match(fetchCode, /^const response = await fetch\('https:\/\/api\.example\.com\/v1\/items\?draft=1', \{$/m);

  const axiosCode = emitAxios(request);
  assert.match(axiosCode, /^import axios from 'axios';$/m);
  assert.match(axiosCode, /method: 'post'/);
  assert.match(axiosCode, /data: \{/);

  const py = emitRequests(request);
  assert.match(py, /^import requests$/m);
  assert.match(py, /requests\.post\(/);
  assert.match(py, /json=\{/);
  assert.match(py, /'active': True/);
  assert.match(py, /'note': None/);
  assert.match(py, /'qty': 2/);

  const httpie = emitHttpie(request);
  assert.match(httpie, /^http POST 'https:\/\/api\.example\.com\/v1\/items\?draft=1'/);
  assert.match(httpie, /'Authorization:Bearer abc\.def'/);
  assert.match(httpie, /name=燈具/);
  assert.match(httpie, /qty:=2/);
  assert.match(httpie, /tags:=\["a"\]/);
  // httpie writes Content-Type itself for a JSON body.
  assert.equal(httpie.includes('Content-Type'), false);
});

test('a form POST becomes form items, not a quoted blob', () => {
  const request = parseCurl(`curl -d 'user=a b' -d 'pass=x&y' https://x/login`);
  assert.match(emitFetch(request), /body: 'user=a b&pass=x&y'/);
  assert.match(emitRequests(request), /data='user=a b&pass=x&y'/);
  const httpie = emitHttpie(request);
  assert.match(httpie, /--form/);
  assert.match(httpie, /'user=a b'/);
});

test('a non-JSON raw body is piped into httpie rather than mangled', () => {
  const request = parseCurl(`curl -H 'Content-Type: text/plain' -d 'plain text' https://x`);
  const httpie = emitHttpie(request);
  assert.match(httpie, /^echo 'plain text' \| http POST/);
  // A header item with no shell metacharacters needs no quoting.
  assert.match(httpie, /Content-Type:text\/plain/);
});

test('an unusual method uses requests.request', () => {
  const request = parseCurl('curl -X PURGE https://x');
  assert.match(emitRequests(request), /requests\.request\(\n\s+'PURGE',/);
});

test('the callback style is available for people who prefer it', () => {
  const request = parseCurl('curl https://x');
  const code = emitFetch(request, { ...DEFAULT_EMIT, awaitStyle: false });
  assert.match(code, /\.then\(\(response\) => response\.json\(\)\)/);
  assert.match(emitAxios(request, { ...DEFAULT_EMIT, awaitStyle: false }), /\.then\(\(\{ data \}\) => console\.log\(data\)\)/);
});

test('string escaping keeps generated code valid', () => {
  assert.equal(jsString("it's"), "'it\\'s'");
  assert.equal(jsString('a\nb'), "'a\\nb'");
  assert.equal(jsString('back\\slash'), "'back\\\\slash'");
  assert.equal(pyString("it's\n"), "'it\\'s\\n'");
  assert.equal(shellWord('plain'), 'plain');
  assert.equal(shellWord('two words'), "'two words'");
  assert.equal(shellWord("it's"), `'it'\\''s'`);
  assert.equal(shellWord(''), "''");
});

test('literal printers cover every JSON shape', () => {
  assert.equal(toPythonLiteral({}, 2), '{}');
  assert.equal(toPythonLiteral([], 2), '[]');
  assert.equal(toPythonLiteral(null, 2), 'None');
  assert.equal(toPythonLiteral(true, 2), 'True');
  assert.equal(toPythonLiteral(1.5, 2), '1.5');
  assert.equal(toPythonLiteral('x', 2), "'x'");
  assert.equal(toPythonLiteral({ a: [1, { b: null }] }, 2), "{\n  'a': [\n    1,\n    {\n      'b': None\n    }\n  ]\n}");
  assert.equal(toJsLiteral({ a: [1, true] }, 2), "{\n  'a': [\n    1,\n    true\n  ]\n}");
  assert.equal(toJsLiteral(null, 2), 'null');
});

test('jsonBody only reports JSON when the request says it is JSON', () => {
  assert.deepEqual(jsonBody(parseCurl(`curl -H 'Content-Type: application/json' -d '{"a":1}' https://x`)), { a: 1 });
  assert.equal(jsonBody(parseCurl(`curl -d '{"a":1}' https://x`)), undefined);
  assert.equal(jsonBody(parseCurl(`curl -H 'Content-Type: application/json' -d 'not json' https://x`)), undefined);
});

test('convert() reports failures and emits every target', () => {
  assert.equal(convert('', 'fetch').ok, false);
  assert.equal(convert('curl', 'fetch').ok, false);
  for (const target of ['fetch', 'axios', 'requests', 'httpie'] as const) {
    const out = convert(JSON_POST, target);
    assert.ok(out.ok, target);
    if (out.ok) {
      assert.ok(out.code.length > 20, target);
      assert.equal(out.request.method, 'POST');
    }
  }
});

test('no emitter ever produces a request-sending side effect of its own', () => {
  // The output is text. This asserts the tool never grew an execute path.
  const out = convert('curl https://x', 'fetch');
  assert.ok(out.ok);
  if (out.ok) assert.equal(typeof out.code, 'string');
});

/* ── Regressions found while writing the "how it works" note ─── */

test('[22] an unquoted & cuts the command, and that is said out loud', () => {
  const request = parseCurl('curl http://x/?a=1&b=2');
  // The shell would have done this too — but silently producing code that
  // requests half a query string is the failure worth naming.
  assert.equal(request.url, 'http://x/?a=1');
  assert.match(request.warnings.join('\n'), /&/);
  assert.match(request.warnings.join('\n'), /quote/i);

  const piped = parseCurl('curl http://x | jq .');
  assert.equal(piped.url, 'http://x');
  assert.match(piped.warnings.join('\n'), /\|/);

  const chained = parseCurl('curl http://x ; echo done');
  assert.match(chained.warnings.join('\n'), /;/);

  // Quoted, there is nothing to warn about and nothing is lost.
  const quoted = parseCurl(`curl 'http://x/?a=1&b=2'`);
  assert.equal(quoted.url, 'http://x/?a=1&b=2');
  assert.deepEqual(quoted.warnings, []);
});

test('[23] --proxy reaches the axios output instead of vanishing', () => {
  const code = emitAxios(parseCurl('curl -x http://user:pw@proxy.example:8080 https://x'));
  assert.match(code, /proxy: \{/);
  assert.match(code, /protocol: 'http'/);
  assert.match(code, /host: 'proxy\.example'/);
  assert.match(code, /port: 8080/);
  assert.match(code, /username: 'user', password: 'pw'/);
  // axios only honours a proxy on Node, so the output has to say so.
  assert.match(code, /Node/);

  const bare = emitAxios(parseCurl('curl -x proxy.local https://x'));
  assert.match(bare, /host: 'proxy\.local'/);
  assert.match(bare, /1080/); // curl's default proxy port, named rather than guessed at
  // A port that was given is not reported as the default, even with a trailing path.
  const withPath = emitAxios(parseCurl('curl -x http://proxy.local:3128/ https://x'));
  assert.match(withPath, /port: 3128/);
  assert.equal(withPath.includes('default of 1080'), false);

  // Something that is not a proxy URL at all still leaves a trace.
  assert.match(emitAxios(parseCurl('curl -x "http://[bad" https://x')), /--proxy/);
});

test('[24] a header value shaped like the Basic sentinel is still data', () => {
  const plain = emitFetch(parseCurl(`curl -H 'X-Foo: __BASIC__a:b' https://x`));
  assert.match(plain, /'X-Foo': '__BASIC__a:b'/);
  assert.equal(plain.includes('btoa'), false);

  const authed = emitFetch(parseCurl(`curl -u 'u:p' -H 'X-Foo: __BASIC__a:b' https://x`));
  assert.match(authed, /'Authorization': 'Basic ' \+ btoa\('u:p'\)/);
  assert.match(authed, /'X-Foo': '__BASIC__a:b'/);
});

test('[22] tokenize() reports where it stopped, and on what', () => {
  assert.deepEqual(tokenize('curl http://x'), { tokens: ['curl', 'http://x'], stop: null });
  const cut = tokenize('curl http://x/?a=1&b=2');
  assert.deepEqual(cut.tokens, ['curl', 'http://x/?a=1']);
  assert.deepEqual(cut.stop, { at: '&', inWord: true, rest: '&b=2' });
  // At a word boundary it is an ordinary pipeline, not a mangled word.
  assert.deepEqual(tokenize('curl http://x | jq .').stop, { at: '|', inWord: false, rest: '| jq .' });
});

test('[23] parseProxy fills in the parts curl leaves implicit', () => {
  assert.deepEqual(parseProxy('http://user:pw@proxy.example:8080'), {
    protocol: 'http',
    host: 'proxy.example',
    port: 8080,
    portGiven: true,
    user: 'user',
    password: 'pw',
  });
  // No scheme means http, no port means curl's documented default of 1080.
  assert.deepEqual(parseProxy('proxy.local'), {
    protocol: 'http',
    host: 'proxy.local',
    port: 1080,
    portGiven: false,
    user: '',
    password: '',
  });
  assert.equal(parseProxy('socks5://127.0.0.1:1080')?.protocol, 'socks5');
  assert.equal(parseProxy(''), null);
  assert.equal(parseProxy('http://[bad'), null);
});
