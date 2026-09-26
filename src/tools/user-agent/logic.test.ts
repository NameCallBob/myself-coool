import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LENGTH,
  SAMPLES,
  androidModel,
  detectBot,
  detectBrowser,
  detectDevice,
  detectEngine,
  detectOS,
  detectReduced,
  parseUA,
  summarise,
  tokenise,
} from './logic.ts';

const ua = (label: string): string => {
  const hit = SAMPLES.find((sample) => sample.label === label);
  if (!hit) throw new Error(`no sample called ${label}`);
  return hit.ua;
};

/* ── Grammar ──────────────────────────────── */

test('products and comments come apart', () => {
  assert.deepEqual(tokenise('Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0'), [
    { kind: 'product', name: 'Mozilla', version: '5.0' },
    { kind: 'comment', text: 'Windows NT 10.0', parts: ['Windows NT 10.0'] },
    { kind: 'product', name: 'Chrome', version: '131.0.0.0' },
  ]);
});

test('a comment splits on semicolons with the spacing trimmed', () => {
  const tokens = tokenise('Mozilla/5.0 (Linux; Android 13; SM-S918B)');
  assert.deepEqual(tokens[1], {
    kind: 'comment',
    text: 'Linux; Android 13; SM-S918B',
    parts: ['Linux', 'Android 13', 'SM-S918B'],
  });
});

test('nested parentheses stay inside one comment', () => {
  const tokens = tokenise('A/1 (outer (inner) still outer) B/2');
  assert.equal(tokens.length, 3);
  assert.deepEqual(tokens[1], {
    kind: 'comment',
    text: 'outer (inner) still outer',
    parts: ['outer (inner) still outer'],
  });
  assert.deepEqual(tokens[2], { kind: 'product', name: 'B', version: '2' });
});

test('an unterminated comment takes the rest of the string', () => {
  const tokens = tokenise('A/1 (never closed');
  assert.deepEqual(tokens[1], { kind: 'comment', text: 'never closed', parts: ['never closed'] });
});

test('a product with no version, and extra whitespace', () => {
  assert.deepEqual(tokenise('  Mobile   Safari/604.1 '), [
    { kind: 'product', name: 'Mobile', version: '' },
    { kind: 'product', name: 'Safari', version: '604.1' },
  ]);
  assert.deepEqual(tokenise(''), []);
});

test('the tokeniser round-trips the products it found', () => {
  for (const sample of SAMPLES) {
    for (const token of tokenise(sample.ua)) {
      if (token.kind === 'product') {
        const written = token.version === '' ? token.name : `${token.name}/${token.version}`;
        assert.ok(sample.ua.includes(written), `${sample.label}: ${written}`);
      } else {
        assert.ok(sample.ua.includes(token.text), `${sample.label}: comment`);
      }
    }
  }
});

/* ── Browser, against real strings ────────── */

test('Chromium forks are not reported as Chrome', () => {
  assert.deepEqual(detectBrowser(ua('Edge 131 / Windows')), { name: 'Edge', version: '131.0.0.0' });
  assert.deepEqual(detectBrowser(ua('Samsung Internet / Galaxy')), {
    name: 'Samsung Internet',
    version: '23.0',
  });
  assert.deepEqual(
    detectBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
    ),
    { name: 'Opera', version: '106.0.0.0' }
  );
  assert.deepEqual(
    detectBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5'
    ),
    { name: 'Vivaldi', version: '6.5' }
  );
});

test('plain Chrome, Firefox and Safari', () => {
  assert.deepEqual(detectBrowser(ua('Chrome 131 / Windows')), { name: 'Chrome', version: '131.0.0.0' });
  assert.deepEqual(detectBrowser(ua('Firefox 133 / Linux')), { name: 'Firefox', version: '133.0' });
  assert.deepEqual(detectBrowser(ua('Safari 18 / macOS')), { name: 'Safari', version: '18.1' });
});

test("Safari's version comes from Version/, not from Safari/", () => {
  const found = detectBrowser(ua('Safari 18 / iPhone'));
  assert.deepEqual(found, { name: 'Safari', version: '18.1' });
  assert.notEqual(found?.version, '604.1');
});

test('the iOS browsers that are not Safari', () => {
  assert.deepEqual(
    detectBrowser(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1'
    ),
    { name: 'Chrome for iOS', version: '131.0.6778.73' }
  );
  assert.deepEqual(
    detectBrowser(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15'
    ),
    { name: 'Firefox for iOS', version: '133.0' }
  );
});

test('an in-app browser is named before the engine under it', () => {
  assert.deepEqual(detectBrowser(ua('WeChat in-app / iPhone')), {
    name: 'WeChat (MicroMessenger)',
    version: '8.0.49',
  });
});

test('Internet Explorer 11 hides behind Trident', () => {
  assert.deepEqual(detectBrowser(ua('Internet Explorer 11')), {
    name: 'Internet Explorer',
    version: '11.0',
  });
  assert.deepEqual(
    detectBrowser('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)'),
    { name: 'Internet Explorer', version: '10.0' }
  );
});

test('a bare WebKit build is reported as exactly that', () => {
  assert.deepEqual(
    detectBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'),
    { name: 'WebKit-based (no browser token)', version: '605.1.15' }
  );
});

test('an unrecognisable string gives null rather than a guess', () => {
  assert.equal(detectBrowser('totally made up'), null);
  assert.equal(detectBrowser(''), null);
});

/* ── Engine ───────────────────────────────── */

test('Blink is decided by the Chromium brand, not by AppleWebKit/537.36', () => {
  assert.deepEqual(detectEngine(ua('Chrome 131 / Windows')), { name: 'Blink', version: '131.0.0.0' });
  assert.deepEqual(detectEngine(ua('Edge 131 / Windows')), { name: 'Blink', version: '131.0.0.0' });
});

test('WebKit, Gecko, Trident', () => {
  assert.deepEqual(detectEngine(ua('Safari 18 / macOS')), { name: 'WebKit', version: '605.1.15' });
  assert.deepEqual(detectEngine(ua('Firefox 133 / Linux')), { name: 'Gecko', version: '133.0' });
  assert.deepEqual(detectEngine(ua('Internet Explorer 11')), { name: 'Trident', version: '7.0' });
});

test('"like Gecko" is not Gecko', () => {
  const engine = detectEngine(ua('Chrome 131 / Windows'));
  assert.notEqual(engine?.name, 'Gecko');
});

test('an engineless string gives null', () => {
  assert.equal(detectEngine('curl/8.7.1'), null);
});

/* ── Operating system ─────────────────────── */

test('Windows versions map from the NT number', () => {
  assert.deepEqual(detectOS(ua('Chrome 131 / Windows')), {
    name: 'Windows',
    version: '10 / 11',
    exact: false,
  });
  assert.deepEqual(detectOS('Mozilla/5.0 (Windows NT 6.1; Win64; x64)'), {
    name: 'Windows',
    version: '7',
    exact: true,
  });
  assert.deepEqual(detectOS('Mozilla/5.0 (Windows NT 6.3)'), {
    name: 'Windows',
    version: '8.1',
    exact: true,
  });
  assert.deepEqual(detectOS('Mozilla/5.0 (Windows NT 99.0)'), {
    name: 'Windows',
    version: 'NT 99.0',
    exact: true,
  });
});

test('macOS is inexact exactly when Safari has frozen it', () => {
  assert.deepEqual(detectOS(ua('Safari 18 / macOS')), {
    name: 'macOS',
    version: '10.15.7',
    exact: false,
  });
  assert.deepEqual(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6)'), {
    name: 'macOS',
    version: '10.14.6',
    exact: true,
  });
});

test('iOS and iPadOS come from the CPU comment', () => {
  assert.deepEqual(detectOS(ua('Safari 18 / iPhone')), { name: 'iOS', version: '18.1', exact: true });
  assert.deepEqual(
    detectOS('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1'),
    { name: 'iPadOS', version: '17.5', exact: true }
  );
});

test('Android 10 is flagged inexact because the reduced UA reuses it', () => {
  assert.deepEqual(detectOS(ua('Chrome 131 / Android (reduced)')), {
    name: 'Android',
    version: '10',
    exact: false,
  });
  assert.deepEqual(detectOS(ua('Samsung Internet / Galaxy')), {
    name: 'Android',
    version: '13',
    exact: true,
  });
});

test('desktop unixes and ChromeOS', () => {
  assert.deepEqual(detectOS(ua('Firefox 133 / Linux')), { name: 'Linux', version: '', exact: false });
  assert.deepEqual(detectOS('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), {
    name: 'Ubuntu',
    version: '',
    exact: false,
  });
  assert.deepEqual(
    detectOS('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
    { name: 'ChromeOS', version: '14541.0.0', exact: true }
  );
  assert.equal(detectOS('curl/8.7.1'), null);
});

/* ── Device ───────────────────────────────── */

test('device kinds', () => {
  assert.deepEqual(detectDevice(ua('Chrome 131 / Windows')), { kind: 'desktop', model: '' });
  assert.deepEqual(detectDevice(ua('Safari 18 / iPhone')), { kind: 'mobile', model: 'iPhone' });
  assert.deepEqual(
    detectDevice('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1'),
    { kind: 'tablet', model: 'iPad' }
  );
  assert.deepEqual(detectDevice(ua('Samsung Internet / Galaxy')), {
    kind: 'mobile',
    model: 'SM-S918B',
  });
  assert.equal(detectDevice('curl/8.7.1').kind, 'unknown');
});

test('an Android tablet is an Android without the Mobile token', () => {
  const tablet =
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert.deepEqual(detectDevice(tablet), { kind: 'tablet', model: 'SM-X710' });
});

test('TVs and consoles are separated from desktops', () => {
  assert.equal(
    detectDevice('Mozilla/5.0 (Linux; Android 9; BRAVIA 4K GB ) AppleWebKit/537.36 Chrome/76.0.3809.111 Safari/537.36').kind,
    'tv'
  );
  assert.deepEqual(
    detectDevice('Mozilla/5.0 (PlayStation 5 3.01) AppleWebKit/605.1.15 (KHTML, like Gecko)'),
    { kind: 'console', model: 'PlayStation 5' }
  );
});

test('the Android model is read from the comment and cleaned up', () => {
  assert.equal(androidModel(ua('Samsung Internet / Galaxy')), 'SM-S918B');
  assert.equal(androidModel(ua('Android WebView')), 'Pixel 7', 'Build/… is stripped');
  assert.equal(androidModel(ua('Chrome 131 / Android (reduced)')), '', 'the literal K is not a model');
  assert.equal(androidModel('Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36'), '');
  assert.equal(androidModel(ua('Chrome 131 / Windows')), '');
});

/* ── Reduced strings ──────────────────────── */

test('the reduced-UA markers are each reported', () => {
  assert.deepEqual(detectReduced(ua('Chrome 131 / Android (reduced)')), ['android-k', 'zeroed-minor']);
  assert.deepEqual(detectReduced(ua('Chrome 131 / Windows')), ['zeroed-minor', 'windows-ambiguous']);
  assert.deepEqual(detectReduced(ua('Safari 18 / macOS')), ['mac-frozen']);
  assert.deepEqual(detectReduced(ua('Firefox 133 / Linux')), []);
  assert.deepEqual(
    detectReduced(ua('Samsung Internet / Galaxy')),
    ['zeroed-minor'],
    "Samsung's embedded Chrome version is reduced too, even though its own is not"
  );
});

/* ── Bots ─────────────────────────────────── */

test('crawlers and HTTP clients are identified', () => {
  assert.deepEqual(detectBot(ua('Googlebot')), { name: 'Googlebot', version: '2.1' });
  assert.deepEqual(detectBot(ua('curl')), { name: 'curl', version: '8.7.1' });
  assert.deepEqual(detectBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), {
    name: 'Bingbot',
    version: '2.0',
  });
  assert.deepEqual(detectBot('facebookexternalhit/1.1'), {
    name: 'Facebook crawler',
    version: '1.1',
  });
  assert.equal(detectBot('SomeUnknownBot/1.0')?.name, 'generic crawler');
});

test('a browser is not a bot', () => {
  for (const label of ['Chrome 131 / Windows', 'Safari 18 / iPhone', 'Firefox 133 / Linux']) {
    assert.equal(detectBot(ua(label)), null, label);
  }
});

/* ── The whole thing ──────────────────────── */

test('parseUA fills every field for a normal browser', () => {
  const parsed = parseUA(ua('Samsung Internet / Galaxy'));
  assert.equal(parsed.browser?.name, 'Samsung Internet');
  assert.equal(parsed.engine?.name, 'Blink');
  assert.equal(parsed.os?.name, 'Android');
  assert.equal(parsed.device.kind, 'mobile');
  assert.equal(parsed.bot, null);
  assert.equal(parsed.webView, false);
});

test('an Android WebView is marked as one', () => {
  const parsed = parseUA(ua('Android WebView'));
  assert.equal(parsed.webView, true);
  assert.equal(parsed.device.model, 'Pixel 7');
});

test('parseUA caps the input length', () => {
  const parsed = parseUA('Chrome/1.0 '.repeat(1000));
  assert.equal(parsed.ua.length, MAX_LENGTH);
});

test('parseUA on an empty string does not throw', () => {
  const parsed = parseUA('');
  assert.deepEqual(parsed.tokens, []);
  assert.equal(parsed.browser, null);
  assert.equal(summarise(parsed), '');
});

test('summarise produces one pasteable line', () => {
  assert.equal(
    summarise(parseUA(ua('Safari 18 / iPhone'))),
    'Safari 18.1 · WebKit 605.1.15 · iOS 18.1 · iPhone'
  );
  assert.equal(
    summarise(parseUA(ua('curl'))),
    'curl 8.7.1',
    'an unknown device contributes nothing rather than the word "unknown"'
  );
});

test('every shipped sample parses to something', () => {
  for (const sample of SAMPLES) {
    const parsed = parseUA(sample.ua);
    assert.ok(parsed.browser || parsed.bot, `${sample.label} identified nothing`);
  }
});
