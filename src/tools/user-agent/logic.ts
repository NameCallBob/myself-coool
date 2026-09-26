/**
 * User-Agent parsing, and an honest account of how much it can tell you.
 *
 * A UA string has a grammar (RFC 7231 §5.5.3: products, versions, and nested
 * comments) but no semantics. Every browser lies in it, on purpose, for
 * compatibility: Chrome claims to be Safari, which claims to be KHTML, which
 * claims to be Gecko. So the structure below is parsed properly, and the
 * *meaning* is a list of ordered heuristics with the order written down —
 * because `Edg/` must be tested before `Chrome/`, and if you get that wrong
 * every Edge user is reported as Chrome and nothing looks broken.
 *
 * Nothing here is a security control. A UA string is client-supplied text and
 * can say anything at all.
 */

/* ── Grammar ──────────────────────────────── */

export type Token =
  | { kind: 'product'; name: string; version: string }
  | { kind: 'comment'; text: string; parts: string[] };

/**
 * Splits a UA into products and comments, with nested parentheses handled.
 *
 * Nesting matters: `(KHTML, like Gecko (really))` is one comment, and a parser
 * that stops at the first `)` splits it into nonsense. An unterminated `(`
 * takes the rest of the string, which is what a lenient reader should do.
 */
export function tokenise(ua: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < ua.length) {
    const ch = ua[i];
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      let depth = 0;
      const start = i + 1;
      while (i < ua.length) {
        if (ua[i] === '(') depth += 1;
        else if (ua[i] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        i += 1;
      }
      const text = ua.slice(start, i);
      i += 1; // past ')' (or past the end, when unterminated)
      tokens.push({
        kind: 'comment',
        text,
        parts: text
          .split(';')
          .map((part) => part.trim())
          .filter((part) => part !== ''),
      });
      continue;
    }
    let end = i;
    while (end < ua.length && ua[end] !== ' ' && ua[end] !== '\t' && ua[end] !== '(') end += 1;
    const raw = ua.slice(i, end);
    i = end;
    const slash = raw.indexOf('/');
    tokens.push(
      slash === -1
        ? { kind: 'product', name: raw, version: '' }
        : { kind: 'product', name: raw.slice(0, slash), version: raw.slice(slash + 1) }
    );
  }
  return tokens;
}

/* ── Bots ─────────────────────────────────── */

/**
 * Anything that says it is a robot, plus the HTTP clients that do not pretend
 * to be browsers. The list is deliberately short: a crawler that wants to look
 * like Chrome will, and no string test finds it.
 */
const BOT_RULES: { name: string; re: RegExp }[] = [
  { name: 'Googlebot', re: /\bGooglebot(?:-\w+)?\/?([\d.]*)/i },
  { name: 'Google APIs / AdsBot', re: /\b(?:AdsBot-Google|APIs-Google|Mediapartners-Google)\b/i },
  { name: 'Bingbot', re: /\bbingbot\/([\d.]+)/i },
  { name: 'BingPreview', re: /\bBingPreview\/([\d.]+)/i },
  { name: 'DuckDuckBot', re: /\bDuckDuckBot\b/i },
  { name: 'YandexBot', re: /\bYandex(?:Bot|Images)\/([\d.]+)/i },
  { name: 'Baiduspider', re: /\bBaiduspider\b/i },
  { name: 'Applebot', re: /\bApplebot\/([\d.]+)/i },
  { name: 'PetalBot', re: /\bPetalBot\b/i },
  { name: 'Facebook crawler', re: /\bfacebookexternalhit\/([\d.]+)/i },
  { name: 'Twitterbot', re: /\bTwitterbot\/([\d.]+)/i },
  { name: 'Slackbot', re: /\bSlackbot(?:-LinkExpanding)?\/?([\d.]*)/i },
  { name: 'Discordbot', re: /\bDiscordbot\/([\d.]+)/i },
  { name: 'AhrefsBot', re: /\bAhrefsBot\/([\d.]+)/i },
  { name: 'SemrushBot', re: /\bSemrushBot\/([\d.~]+)/i },
  { name: 'GPTBot', re: /\bGPTBot\/([\d.]+)/i },
  { name: 'ClaudeBot', re: /\bClaude(?:Bot|-Web)\/([\d.]+)/i },
  { name: 'curl', re: /\bcurl\/([\d.]+)/i },
  { name: 'Wget', re: /\bWget\/([\d.]+)/i },
  { name: 'python-requests', re: /\bpython-requests\/([\d.]+)/i },
  { name: 'Go http client', re: /\bGo-http-client\/([\d.]+)/i },
  { name: 'OkHttp', re: /\bokhttp\/([\d.]+)/i },
  { name: 'Postman', re: /\bPostmanRuntime\/([\d.]+)/i },
  { name: 'Java', re: /\bJava\/([\d._]+)/i },
  // No leading \b: the interesting case is `SomeVendorBot/1.0`, where the word
  // boundary falls *after* "Bot", not before it.
  { name: 'generic crawler', re: /(?:bot|crawler|spider)\b/i },
];

export type Named = { name: string; version: string };

export function detectBot(ua: string): Named | null {
  for (const rule of BOT_RULES) {
    const hit = rule.re.exec(ua);
    if (hit) return { name: rule.name, version: hit[1] ?? '' };
  }
  return null;
}

/* ── Browser ──────────────────────────────── */

/**
 * Order is the whole algorithm. Every Chromium-based browser carries
 * `Chrome/`, and Chrome itself carries `Safari/`, so the specific brands come
 * first and the generic engines last. Move a row up and you will silently
 * misreport a whole vendor.
 */
const BROWSER_RULES: { name: string; re: RegExp }[] = [
  // In-app browsers: these are the ones whose bugs get reported as "your site
  // is broken", so they are identified before the engine underneath.
  { name: 'WeChat (MicroMessenger)', re: /\bMicroMessenger\/([\d.]+)/ },
  { name: 'LINE', re: /\bLine\/([\d.]+)/ },
  { name: 'Facebook app', re: /\bFBAV\/([\d.]+)/ },
  { name: 'Instagram app', re: /\bInstagram ([\d.]+)/ },
  { name: 'Electron', re: /\bElectron\/([\d.]+)/ },
  // Chromium forks.
  { name: 'Edge', re: /\bEdg(?:A|iOS)?\/([\d.]+)/ },
  { name: 'Edge (EdgeHTML)', re: /\bEdge\/([\d.]+)/ },
  { name: 'Opera', re: /\bOP(?:R|iOS|T)\/([\d.]+)/ },
  { name: 'Samsung Internet', re: /\bSamsungBrowser\/([\d.]+)/ },
  { name: 'Vivaldi', re: /\bVivaldi\/([\d.]+)/ },
  { name: 'Brave', re: /\bBrave\/([\d.]+)/ },
  { name: 'Yandex Browser', re: /\bYaBrowser\/([\d.]+)/ },
  { name: 'UC Browser', re: /\bUCBrowser\/([\d.]+)/ },
  { name: 'MIUI Browser', re: /\bMiuiBrowser\/([\d.]+)/ },
  { name: 'Huawei Browser', re: /\bHuaweiBrowser\/([\d.]+)/ },
  { name: 'QQ Browser', re: /\b(?:QQBrowser|MQQBrowser)\/([\d.]+)/ },
  // Firefox and Chrome on iOS are WebKit underneath, but they are the browser.
  { name: 'Firefox for iOS', re: /\bFxiOS\/([\d.]+)/ },
  { name: 'Chrome for iOS', re: /\bCriOS\/([\d.]+)/ },
  { name: 'Firefox Focus', re: /\bFocus\/([\d.]+)/ },
  { name: 'Firefox', re: /\bFirefox\/([\d.]+)/ },
  { name: 'Chromium', re: /\bChromium\/([\d.]+)/ },
  { name: 'Chrome', re: /\bChrome\/([\d.]+)/ },
  // Safari's real version is in `Version/`; `Safari/` holds a WebKit build.
  { name: 'Safari', re: /\bVersion\/([\d.]+)(?=.*\bSafari\/)/ },
  { name: 'Internet Explorer', re: /\bMSIE ([\d.]+)/ },
  { name: 'Internet Explorer', re: /\bTrident\/[\d.]+.*\brv:([\d.]+)/ },
  { name: 'Opera (Presto)', re: /\bOpera[ /]([\d.]+)/ },
  // Last resort: a WebKit build number, which is all an in-app WebView gives.
  { name: 'WebKit-based (no browser token)', re: /\bAppleWebKit\/([\d.]+)/ },
  { name: 'Gecko-based (no browser token)', re: /\brv:([\d.]+)\).*Gecko\// },
];

export function detectBrowser(ua: string): Named | null {
  for (const rule of BROWSER_RULES) {
    const hit = rule.re.exec(ua);
    if (hit) return { name: rule.name, version: hit[1] ?? '' };
  }
  return null;
}

/* ── Engine ───────────────────────────────── */

/**
 * `AppleWebKit/537.36` is a frozen lie in every Chromium UA — 537.36 was the
 * fork point in 2013 — so Blink is decided by the presence of a Chromium brand
 * token, not by the WebKit number.
 */
export function detectEngine(ua: string): Named | null {
  const edgeHtml = /\bEdge\/([\d.]+)/.exec(ua);
  if (edgeHtml) return { name: 'EdgeHTML', version: edgeHtml[1] };
  const trident = /\bTrident\/([\d.]+)/.exec(ua);
  if (trident) return { name: 'Trident', version: trident[1] };
  const presto = /\bPresto\/([\d.]+)/.exec(ua);
  if (presto) return { name: 'Presto', version: presto[1] };
  const gecko = /\brv:([\d.]+)\).*\bGecko\//.exec(ua);
  if (gecko && !/\blike Gecko\b/.test(ua)) return { name: 'Gecko', version: gecko[1] };
  const blink = /\b(?:Chrome|Chromium|CriOS|Edg|EdgA|OPR|SamsungBrowser)\/([\d.]+)/.exec(ua);
  if (blink && /\bAppleWebKit\//.test(ua)) return { name: 'Blink', version: blink[1] };
  const webkit = /\bAppleWebKit\/([\d.]+)/.exec(ua);
  if (webkit) return { name: 'WebKit', version: webkit[1] };
  const goanna = /\bGoanna\/([\d.]+)/.exec(ua);
  if (goanna) return { name: 'Goanna', version: goanna[1] };
  return null;
}

/* ── Operating system ─────────────────────── */

const WINDOWS_NAMES: Record<string, string> = {
  '10.0': '10 / 11',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.2': 'XP x64 / Server 2003',
  '5.1': 'XP',
};

export type OsResult = Named & {
  /** False when the string genuinely cannot pin the version down. */
  exact: boolean;
};

/**
 * Two cases here are not solvable, and both are reported as inexact rather
 * than guessed:
 *
 *  - Windows 11 reports `Windows NT 10.0`, identically to Windows 10. The
 *    distinction is only available through Client Hints.
 *  - Safari on macOS has reported `Mac OS X 10_15_7` since Big Sur, whatever
 *    the real version is. Chrome froze it the same way.
 */
export function detectOS(ua: string): OsResult | null {
  const windows = /\bWindows NT ([\d.]+)/.exec(ua);
  if (windows) {
    const label = WINDOWS_NAMES[windows[1]];
    return {
      name: 'Windows',
      version: label ?? `NT ${windows[1]}`,
      exact: windows[1] !== '10.0',
    };
  }
  if (/\bWindows Phone\b/.test(ua)) {
    const version = /\bWindows Phone (?:OS )?([\d.]+)/.exec(ua);
    return { name: 'Windows Phone', version: version?.[1] ?? '', exact: Boolean(version) };
  }
  const android = /\bAndroid[ /]([\d.]+)/.exec(ua);
  if (android) {
    // Chrome's reduced UA reports "Android 10" for everything from 10 up.
    return { name: 'Android', version: android[1], exact: android[1] !== '10' };
  }
  const ios = /\b(?:iPhone OS|CPU OS|iPhone\/|iOS) ?([\d_]+)/.exec(ua);
  if (ios) {
    const tablet = /\biPad\b/.test(ua);
    return { name: tablet ? 'iPadOS' : 'iOS', version: ios[1].replace(/_/g, '.'), exact: true };
  }
  if (/\bCrOS\b/.test(ua)) {
    const version = /\bCrOS \S+ ([\d.]+)/.exec(ua);
    return { name: 'ChromeOS', version: version?.[1] ?? '', exact: Boolean(version) };
  }
  const mac = /\bMac OS X ([\d_.]+)/.exec(ua);
  if (mac) {
    const version = mac[1].replace(/_/g, '.');
    return { name: 'macOS', version, exact: version !== '10.15.7' };
  }
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return { name: 'macOS', version: '', exact: false };
  for (const [re, name] of [
    [/\bUbuntu\b/, 'Ubuntu'],
    [/\bFedora\b/, 'Fedora'],
    [/\bDebian\b/, 'Debian'],
    [/\bArch\b/, 'Arch Linux'],
    [/\bFreeBSD\b/, 'FreeBSD'],
    [/\bOpenBSD\b/, 'OpenBSD'],
    [/\bLinux\b/, 'Linux'],
  ] as [RegExp, string][]) {
    if (re.test(ua)) return { name, version: '', exact: false };
  }
  return null;
}

/* ── Device ───────────────────────────────── */

export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'tv' | 'console' | 'watch' | 'unknown';

export type DeviceResult = { kind: DeviceKind; model: string };

/**
 * `Mobile` is the only token a browser is actually required to be honest about
 * — it changes which layout it asks for — so the classification leans on it.
 * The model name is only present when the vendor felt like putting it there,
 * and desktop browsers never do.
 */
export function detectDevice(ua: string): DeviceResult {
  if (/\bSmart-?TV\b|\bAppleTV\b|\bGoogleTV\b|\bHbbTV\b|\bBRAVIA\b|\bAndroid TV\b|\bTizen\b.*\bTV\b/i.test(ua)) {
    return { kind: 'tv', model: /\bBRAVIA\b/.test(ua) ? 'BRAVIA' : '' };
  }
  if (/\bPlayStation\b|\bXbox\b|\bNintendo\b/i.test(ua)) {
    const hit = /\b(PlayStation \d|Xbox(?: One| Series [SX])?|Nintendo \w+)\b/i.exec(ua);
    return { kind: 'console', model: hit?.[1] ?? '' };
  }
  if (/\bwatchOS\b|\bApple Watch\b/i.test(ua)) return { kind: 'watch', model: 'Apple Watch' };

  if (/\biPad\b/.test(ua)) return { kind: 'tablet', model: 'iPad' };
  if (/\biPhone\b/.test(ua)) return { kind: 'mobile', model: 'iPhone' };
  if (/\biPod\b/.test(ua)) return { kind: 'mobile', model: 'iPod touch' };

  if (/\bAndroid\b/.test(ua)) {
    const model = androidModel(ua);
    // Android tablets simply omit "Mobile"; that is the documented signal.
    return { kind: /\bMobile\b/.test(ua) ? 'mobile' : 'tablet', model };
  }
  if (/\bMobile\b/.test(ua)) return { kind: 'mobile', model: '' };
  if (/\bWindows NT\b|\bMacintosh\b|\bCrOS\b|\bX11\b|\bWindows\b/.test(ua)) {
    return { kind: 'desktop', model: '' };
  }
  return { kind: 'unknown', model: '' };
}

/** The model sits in the comment, right after the Android version. */
export function androidModel(ua: string): string {
  const comment = tokenise(ua).find((token) => token.kind === 'comment' && /\bAndroid\b/.test(token.text));
  if (!comment || comment.kind !== 'comment') return '';
  const index = comment.parts.findIndex((part) => /^Android\b/.test(part));
  if (index === -1) return '';
  for (const part of comment.parts.slice(index + 1)) {
    const cleaned = part.replace(/\s*Build\/.*$/i, '').trim();
    // 'wv' marks a WebView, 'U' is a legacy security token: neither is a model.
    if (cleaned === '' || cleaned === 'wv' || cleaned === 'U') continue;
    // Chrome's reduced UA substitutes the literal 'K' for the model.
    if (cleaned === 'K') return '';
    return cleaned;
  }
  return '';
}

/* ── Reduced / frozen strings ─────────────── */

/**
 * Chrome (and Chromium at large) froze the UA in stages from version 110: the
 * minor version became `0.0.0`, desktop platform versions were pinned, and the
 * Android model became the literal `K`. So a UA that says `Android 10; K` is
 * not an Android 10 device — it is a modern Chrome refusing to say.
 */
export function detectReduced(ua: string): string[] {
  const reasons: string[] = [];
  if (/\bAndroid 10; K\b/.test(ua)) reasons.push('android-k');
  if (/\bChrom(?:e|ium)\/\d+\.0\.0\.0\b/.test(ua)) reasons.push('zeroed-minor');
  if (/\bMac OS X 10_15_7\b/.test(ua)) reasons.push('mac-frozen');
  if (/\bWindows NT 10\.0\b/.test(ua)) reasons.push('windows-ambiguous');
  return reasons;
}

/* ── The whole thing ──────────────────────── */

export type Parsed = {
  ua: string;
  tokens: Token[];
  bot: Named | null;
  browser: Named | null;
  engine: Named | null;
  os: OsResult | null;
  device: DeviceResult;
  reduced: string[];
  /** True when the string carries a `; wv)` Android WebView marker. */
  webView: boolean;
};

export const MAX_LENGTH = 2048;

export function parseUA(ua: string): Parsed {
  // A UA header longer than this is not a UA; capping keeps the regexes cheap.
  const text = ua.slice(0, MAX_LENGTH);
  return {
    ua: text,
    tokens: tokenise(text),
    bot: detectBot(text),
    browser: detectBrowser(text),
    engine: detectEngine(text),
    os: detectOS(text),
    device: detectDevice(text),
    reduced: detectReduced(text),
    webView: /;\s*wv[;)]/.test(text),
  };
}

/** One line, for pasting into a bug report. */
export function summarise(parsed: Parsed): string {
  const bits: string[] = [];
  if (parsed.bot) bits.push(`${parsed.bot.name} ${parsed.bot.version}`.trim());
  if (parsed.browser) bits.push(`${parsed.browser.name} ${parsed.browser.version}`.trim());
  if (parsed.engine) bits.push(`${parsed.engine.name} ${parsed.engine.version}`.trim());
  if (parsed.os) bits.push(`${parsed.os.name} ${parsed.os.version}`.trim());
  const device = parsed.device.model || parsed.device.kind;
  if (device !== 'unknown') bits.push(device);
  return bits.join(' · ');
}

/* ── Reference strings ────────────────────── */

/**
 * Real strings, kept as examples so the parser can be checked against
 * something other than itself. Versions here are whatever the string said when
 * it was collected (2025) — they are samples, not a current-version table.
 */
export const SAMPLES: { label: string; ua: string }[] = [
  {
    label: 'Chrome 131 / Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    label: 'Chrome 131 / Android (reduced)',
    ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
  {
    label: 'Safari 18 / iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Safari 18 / macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  },
  {
    label: 'Firefox 133 / Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  },
  {
    label: 'Edge 131 / Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  },
  {
    label: 'Samsung Internet / Galaxy',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  },
  {
    label: 'WeChat in-app / iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003128) NetType/WIFI Language/zh_TW',
  },
  {
    label: 'Android WebView',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36',
  },
  {
    label: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  {
    label: 'curl',
    ua: 'curl/8.7.1',
  },
  {
    label: 'Internet Explorer 11',
    ua: 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
  },
];
