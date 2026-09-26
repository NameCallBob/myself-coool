'use client';

import { useSyncExternalStore } from 'react';
import type { ToolProps } from '../types';
import { Btn, CopyButton, Note, Panel, Readout, Row, Table } from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  FEATURE_IDS,
  buildReport,
  caveatsFor,
  megapixels,
  orientationOf,
  physicalPixels,
  ratioOf,
  supportedCount,
  type CaveatId,
  type Facts,
  type FeatureResult,
} from './logic';

/* ── Collecting the facts ─────────────────── */

function ask(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function has(object: unknown, key: string): boolean {
  try {
    return object !== null && object !== undefined && key in (object as object);
  } catch {
    return false;
  }
}

function supportsCss(declaration: string): boolean {
  try {
    return typeof CSS !== 'undefined' && CSS.supports(declaration);
  } catch {
    return false;
  }
}

function canvasContext(kind: string): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext(kind) !== null;
  } catch {
    return false;
  }
}

/**
 * Every check is wrapped: probing an API can throw outright when a permissions
 * policy blocks it, and one throw would take the whole report with it.
 */
function detectFeatures(): FeatureResult[] {
  const nav = navigator as Navigator & Record<string, unknown>;
  const tests: Record<string, () => boolean> = {
    WebAssembly: () => has(window, 'WebAssembly'),
    WebGL: () => canvasContext('webgl'),
    'WebGL 2': () => canvasContext('webgl2'),
    WebGPU: () => has(nav, 'gpu'),
    OffscreenCanvas: () => has(window, 'OffscreenCanvas'),
    'Web Worker': () => has(window, 'Worker'),
    SharedArrayBuffer: () => has(window, 'SharedArrayBuffer'),
    'Service Worker': () => has(nav, 'serviceWorker'),
    'Cache Storage': () => has(window, 'caches'),
    IndexedDB: () => has(window, 'indexedDB'),
    localStorage: () => {
      try {
        return window.localStorage !== null;
      } catch {
        // Throws outright when site data is blocked, which is the answer.
        return false;
      }
    },
    'Web Crypto': () => has(window, 'crypto') && has(window.crypto, 'subtle'),
    'Clipboard write': () => has(nav, 'clipboard') && has(nav.clipboard, 'writeText'),
    'File System Access': () => has(window, 'showOpenFilePicker'),
    'Web Share': () => has(nav, 'share'),
    Notifications: () => has(window, 'Notification'),
    Geolocation: () => has(nav, 'geolocation'),
    'Media Devices': () => has(nav, 'mediaDevices') && has(nav.mediaDevices, 'getUserMedia'),
    'Speech Synthesis': () => has(window, 'speechSynthesis'),
    WebRTC: () => has(window, 'RTCPeerConnection'),
    'Payment Request': () => has(window, 'PaymentRequest'),
    'Web Bluetooth': () => has(nav, 'bluetooth'),
    WebUSB: () => has(nav, 'usb'),
    Gamepad: () => has(nav, 'getGamepads'),
    Vibration: () => has(nav, 'vibrate'),
    'Wake Lock': () => has(nav, 'wakeLock'),
    'Intl.Segmenter': () => has(Intl, 'Segmenter'),
    'Intl.DurationFormat': () => has(Intl, 'DurationFormat'),
    structuredClone: () => typeof structuredClone === 'function',
    createImageBitmap: () => typeof createImageBitmap === 'function',
    WebCodecs: () => has(window, 'VideoDecoder'),
    'CSS :has()': () => supportsCss('selector(:has(*))'),
    'CSS container queries': () => supportsCss('container-type: inline-size'),
    'CSS nesting': () => supportsCss('selector(&)'),
    'CSS color-mix()': () => supportsCss('color: color-mix(in oklab, red, blue)'),
    'CSS oklch()': () => supportsCss('color: oklch(50% 0.1 200)'),
    'View Transitions': () => has(document, 'startViewTransition'),
    Popover: () => has(window.HTMLElement?.prototype, 'popover'),
    '<dialog>': () => has(window.HTMLDialogElement?.prototype, 'showModal'),
  };

  return FEATURE_IDS.map((id) => {
    const probe = tests[id];
    if (!probe) return { id, ok: false };
    try {
      return { id, ok: probe() };
    } catch {
      return { id, ok: false };
    }
  });
}

function collect(): Facts {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const gamut = ask('(color-gamut: rec2020)')
    ? 'rec2020'
    : ask('(color-gamut: p3)')
      ? 'p3'
      : ask('(color-gamut: srgb)')
        ? 'srgb'
        : 'unknown';
  const colorScheme = ask('(prefers-color-scheme: dark)')
    ? 'dark'
    : ask('(prefers-color-scheme: light)')
      ? 'light'
      : 'unknown';
  const pointer = ask('(pointer: fine)')
    ? 'fine'
    : ask('(pointer: coarse)')
      ? 'coarse'
      : ask('(pointer: none)')
        ? 'none'
        : 'unknown';

  return {
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    availWidth: window.screen?.availWidth ?? 0,
    availHeight: window.screen?.availHeight ?? 0,
    colorDepth: window.screen?.colorDepth ?? 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memoryGiB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    maxTouchPoints: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
    languages: Array.from(nav.languages ?? []),
    timeZone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      } catch {
        return '';
      }
    })(),
    gamut,
    colorScheme,
    reducedMotion: ask('(prefers-reduced-motion: reduce)'),
    pointer,
    hover: ask('(hover: hover)'),
    online: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
    userAgent: nav.userAgent,
    features: detectFeatures(),
  };
}

/**
 * The house pattern (`src/lib/tools/useClientFacts.ts`): a store with a cached
 * snapshot rather than an effect that calls setState. The snapshot has to be
 * referentially stable between notifications or `useSyncExternalStore` loops,
 * so it is built once and only replaced when something actually changes.
 */
let cached: Facts | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Facts {
  if (cached === null) cached = collect();
  return cached;
}

function refresh(): void {
  cached = collect();
  for (const listener of listeners) listener();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('resize', refresh);
    window.removeEventListener('orientationchange', refresh);
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
  };
}

/** Rendered at build time, where none of this exists. Stable reference. */
const SERVER: Facts = {
  screenWidth: 0,
  screenHeight: 0,
  availWidth: 0,
  availHeight: 0,
  colorDepth: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  dpr: 0,
  cores: null,
  memoryGiB: null,
  maxTouchPoints: 0,
  languages: [],
  timeZone: '',
  gamut: 'unknown',
  colorScheme: 'unknown',
  reducedMotion: false,
  pointer: 'unknown',
  hover: false,
  online: true,
  cookieEnabled: false,
  userAgent: '',
  features: [],
};

const serverSnapshot = () => SERVER;

/* ── Copy ─────────────────────────────────── */

function caveatText(l: Loc, id: CaveatId): string {
  switch (id) {
    case 'dpr-fractional':
      return t(
        l,
        '像素比不是整數。這代表 1px 的邊框會落在實體像素中間,瀏覽器只能做抗鋸齒,所以細線看起來會偏灰或粗細不一——這不是你的 CSS 寫錯。',
        'The device pixel ratio is not an integer, so a 1px border lands between physical pixels and gets anti-aliased. Hairlines will look grey or uneven; that is not your CSS.'
      );
    case 'memory-quantised':
      return t(
        l,
        'deviceMemory 是刻意粗化過的:規格只允許回報 0.25、0.5、1、2、4、8 這幾個值,而且上限就是 8。看到 8 只能理解成「8 GB 以上」,不是「剛好 8 GB」。',
        'deviceMemory is deliberately coarse: the spec allows only 0.25, 0.5, 1, 2, 4 and 8, and caps at 8. A reading of 8 means "8 GB or more", not "exactly 8".'
      );
    case 'memory-missing':
      return t(
        l,
        '這個瀏覽器不提供 deviceMemory(Safari 與 Firefox 都沒有實作)。',
        'This browser does not expose deviceMemory — neither Safari nor Firefox implements it.'
      );
    case 'cores-missing':
      return t(
        l,
        'hardwareConcurrency 沒有值。部分瀏覽器在防指紋模式下會隱藏或固定回報它。',
        'hardwareConcurrency is absent. Some browsers hide or pin it in anti-fingerprinting modes.'
      );
    case 'touch-desktop':
      return t(
        l,
        '這台同時有精確指標與觸控點。用 maxTouchPoints > 0 判斷「是手機」在這種機器上會判斷錯,要改用 pointer/hover 媒體查詢。',
        'This machine reports both a fine pointer and touch points. Treating maxTouchPoints > 0 as "is a phone" misfires here; use the pointer and hover media queries instead.'
      );
    case 'viewport-vs-screen':
      return t(
        l,
        '可視區域比螢幕寬。通常是頁面被縮小顯示,或作業系統做了顯示縮放。',
        'The viewport is wider than the screen — usually page zoom below 100%, or OS display scaling.'
      );
  }
}

export default function DeviceInfo({ l }: ToolProps) {
  const facts = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const ready = facts.userAgent !== '';

  const [physicalW, physicalH] = physicalPixels(facts.screenWidth, facts.screenHeight, facts.dpr);
  const caveats = ready ? caveatsFor(facts) : [];
  const ok = supportedCount(facts.features);

  const screenRows: [string, string][] = [
    [
      t(l, '螢幕(CSS 像素)', 'screen (CSS px)'),
      `${count(facts.screenWidth)} × ${count(facts.screenHeight)}  ${ratioOf(facts.screenWidth, facts.screenHeight)}`,
    ],
    [
      t(l, '螢幕(實體像素)', 'screen (device px)'),
      `${count(physicalW)} × ${count(physicalH)}  ${fixed(megapixels(facts.screenWidth, facts.screenHeight, facts.dpr), 2)} MP`,
    ],
    [
      t(l, '可用區域(扣掉工作列)', 'available area'),
      `${count(facts.availWidth)} × ${count(facts.availHeight)}`,
    ],
    [
      t(l, '可視區域', 'viewport'),
      `${count(facts.viewportWidth)} × ${count(facts.viewportHeight)}  ${t(
        l,
        orientationOf(facts.viewportWidth, facts.viewportHeight) === 'portrait' ? '直向' : orientationOf(facts.viewportWidth, facts.viewportHeight) === 'landscape' ? '橫向' : '正方',
        orientationOf(facts.viewportWidth, facts.viewportHeight)
      )}`,
    ],
    [t(l, '像素比', 'device pixel ratio'), String(facts.dpr)],
    [t(l, '色彩深度', 'colour depth'), `${facts.colorDepth}-bit`],
    [t(l, '色域', 'colour gamut'), facts.gamut],
  ];

  const systemRows: [string, string][] = [
    [
      t(l, '邏輯核心數', 'logical cores'),
      facts.cores === null ? t(l, '不提供', 'not exposed') : String(facts.cores),
    ],
    [
      t(l, '記憶體', 'memory'),
      facts.memoryGiB === null
        ? t(l, '不提供', 'not exposed')
        : t(l, `${facts.memoryGiB} GB 以上`, `${facts.memoryGiB} GB or more`),
    ],
    [t(l, '最大觸控點', 'max touch points'), String(facts.maxTouchPoints)],
    [
      t(l, '指標裝置', 'pointer'),
      `${facts.pointer}${facts.hover ? t(l, ',可以 hover', ', hover available') : t(l, ',沒有 hover', ', no hover')}`,
    ],
    [t(l, '偏好配色', 'preferred scheme'), facts.colorScheme],
    [
      t(l, '偏好減少動態', 'prefers reduced motion'),
      facts.reducedMotion ? t(l, '是', 'yes') : t(l, '否', 'no'),
    ],
    [t(l, '語言偏好', 'languages'), facts.languages.join(', ') || '—'],
    [t(l, '時區', 'time zone'), facts.timeZone || '—'],
    [
      t(l, '網路狀態', 'network'),
      facts.online ? t(l, '連線中', 'online') : t(l, '離線', 'offline'),
    ],
    [t(l, 'Cookie', 'cookies'), facts.cookieEnabled ? t(l, '開啟', 'enabled') : t(l, '關閉', 'disabled')],
  ];

  const report = ready ? buildReport(facts) : '';

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '螢幕與顯示', 'DISPLAY')}</span>
            <span className="inst-no">{facts.dpr ? `@${facts.dpr}x` : '—'}</span>
          </div>
          <div aria-live="polite">
            <Table
              head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
              rows={screenRows.map(([key, value]) => [
                key,
                <span key={key} style={{ fontFamily: 'var(--font-mono)' }}>
                  {ready ? value : '—'}
                </span>,
              ])}
            />
          </div>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '系統與偏好', 'SYSTEM & PREFERENCES')}</span>
            <Btn onClick={refresh}>{t(l, '重新讀取', 'read again')}</Btn>
          </div>
          <Table
            head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
            rows={systemRows.map(([key, value]) => [
              key,
              <span key={key} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                {ready ? value : '—'}
              </span>,
            ])}
          />
        </section>
      </div>

      {caveats.length > 0 ? (
        <Panel label={t(l, '這些數字不能照字面看', 'WHAT THESE NUMBERS DO NOT MEAN')}>
          {caveats.map((id) => (
            <Note key={id}>{caveatText(l, id)}</Note>
          ))}
        </Panel>
      ) : null}

      <Panel
        label={t(l, '瀏覽器能力', 'BROWSER CAPABILITIES')}
        aside={
          <span className="inst-no">
            {count(ok)} / {count(facts.features.length)}
          </span>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
            gap: '0.1rem 1.5rem',
          }}
        >
          {facts.features.map((feature) => (
            <div
              key={feature.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.25rem 0',
                borderBottom: '1px solid var(--border-1)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--fg-muted)' }}>{feature.id}</span>
              <span style={{ color: feature.ok ? 'var(--data-teal)' : 'var(--fg-faint)' }}>
                {feature.ok ? t(l, '✓ 有', '✓ yes') : t(l, '× 沒有', '× no')}
              </span>
            </div>
          ))}
        </div>
        <p className="inst-hint">
          {t(
            l,
            '這裡刻意沒有「支援 AVIF / WebP 解碼」:那件事沒有同步的檢測方法。canvas.toDataURL 測的是編碼器,而 Safari 能解 AVIF 卻不能編,用它會得到錯的「不支援」。留一個誠實的空白,比給一個看起來很肯定的錯答案好。',
            'Image codec support is deliberately absent: there is no synchronous test for it. canvas.toDataURL tests the encoder, and Safari decodes AVIF without being able to encode it, so that check reports a false "no". An honest gap beats a confident wrong answer.'
          )}
        </p>
      </Panel>

      <Panel
        label={t(l, '貼進 issue 的版本', 'PASTE INTO AN ISSUE')}
        aside={<CopyButton l={l} text={report} />}
      >
        <pre className="inst-out" style={{ minHeight: 0, whiteSpace: 'pre-wrap' }}>
          {report || t(l, '(還在讀取)', '(reading)')}
        </pre>
        <Row>
          <p className="inst-hint">
            {t(
              l,
              '上面這段只在你按「複製」時進入剪貼簿。這一頁不送出任何東西,也不寫入任何儲存空間——它只是把瀏覽器願意講的話唸給你聽。',
              'That block only reaches your clipboard when you press copy. This page sends nothing and stores nothing; it reads back what the browser is willing to say.'
            )}
          </p>
        </Row>
      </Panel>

      <Readout
        l={l}
        items={[
          {
            k: t(l, '螢幕', 'screen'),
            v: ready ? `${facts.screenWidth}×${facts.screenHeight}` : '—',
          },
          { k: t(l, '像素比', 'dpr'), v: ready ? String(facts.dpr) : '—' },
          { k: t(l, '核心', 'cores'), v: facts.cores === null ? '—' : String(facts.cores) },
          { k: t(l, '色域', 'gamut'), v: facts.gamut },
          { k: t(l, '能力通過', 'features'), v: `${count(ok)}/${count(facts.features.length)}` },
        ]}
      />
    </div>
  );
}
