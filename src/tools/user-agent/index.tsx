'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import { SAMPLES, parseUA, summarise, type DeviceKind } from './logic';

/* ── Reading this browser's own facts ─────── */

type UAData = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
};

/** No subscription: none of these values change while the page is open. */
const noSubscribe = () => () => {};
const emptyString = () => '';

function uaDataOf(): UAData | undefined {
  return (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
}

function useOwnUA(): string {
  return useSyncExternalStore(noSubscribe, () => navigator.userAgent, emptyString);
}

function useOwnBrands(): string {
  return useSyncExternalStore(
    noSubscribe,
    () =>
      (uaDataOf()?.brands ?? [])
        .map((entry) => `${entry.brand} ${entry.version}`)
        .join(', '),
    emptyString
  );
}

function useOwnPlatform(): string {
  return useSyncExternalStore(noSubscribe, () => uaDataOf()?.platform ?? '', emptyString);
}

function useOwnMobile(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const data = uaDataOf();
      return data === undefined || data.mobile === undefined ? '' : String(data.mobile);
    },
    emptyString
  );
}

/* ── Labels ───────────────────────────────── */

function deviceText(l: Loc, kind: DeviceKind): string {
  const table: Record<DeviceKind, [string, string]> = {
    desktop: ['桌機', 'desktop'],
    mobile: ['手機', 'phone'],
    tablet: ['平板', 'tablet'],
    tv: ['電視', 'TV'],
    console: ['遊戲主機', 'games console'],
    watch: ['手錶', 'watch'],
    unknown: ['看不出來', 'not stated'],
  };
  return t(l, table[kind][0], table[kind][1]);
}

function reducedText(l: Loc, id: string): string {
  switch (id) {
    case 'android-k':
      return t(
        l,
        'Android 版本寫 10、機型寫 K:這是 Chrome 從 110 版起的固定寫法,不代表這台真的是 Android 10。',
        'Android 10 with the model "K" is Chrome 110+ refusing to say — the device is almost certainly not Android 10.'
      );
    case 'zeroed-minor':
      return t(
        l,
        'Chrome 次版號被歸零成 0.0.0,只剩主版號是真的。',
        'The Chrome minor version is zeroed to 0.0.0; only the major version is real.'
      );
    case 'mac-frozen':
      return t(
        l,
        'macOS 寫 10.15.7:Big Sur 之後 Safari 與 Chrome 都凍在這個數字,真實版本看不出來。',
        'macOS 10.15.7 has been frozen since Big Sur in both Safari and Chrome; the real version is not in the string.'
      );
    case 'windows-ambiguous':
      return t(
        l,
        'Windows 11 與 Windows 10 都報 NT 10.0,字串裡分不出來。',
        'Windows 11 and Windows 10 both report NT 10.0; the string cannot separate them.'
      );
    default:
      return id;
  }
}

export default function UserAgent({ l }: ToolProps) {
  const ownUA = useOwnUA();
  const brands = useOwnBrands();
  const platform = useOwnPlatform();
  const mobile = useOwnMobile();

  const [text, setText] = useState('');
  const active = text === '' ? ownUA : text;
  const parsed = useMemo(() => parseUA(active), [active]);

  const rows: [string, string][] = [
    [
      t(l, '瀏覽器', 'browser'),
      parsed.browser ? `${parsed.browser.name} ${parsed.browser.version}`.trim() : '—',
    ],
    [
      t(l, '排版引擎', 'engine'),
      parsed.engine ? `${parsed.engine.name} ${parsed.engine.version}`.trim() : '—',
    ],
    [
      t(l, '作業系統', 'os'),
      parsed.os
        ? `${parsed.os.name} ${parsed.os.version}`.trim() +
          (parsed.os.exact ? '' : t(l, '(字串無法確定)', ' (not pinned down by the string)'))
        : '—',
    ],
    [t(l, '裝置類型', 'device'), deviceText(l, parsed.device.kind)],
    [t(l, '機型', 'model'), parsed.device.model || '—'],
    [
      t(l, 'WebView', 'WebView'),
      parsed.webView ? t(l, '是(App 內嵌瀏覽器)', 'yes — embedded in an app') : t(l, '否', 'no'),
    ],
    [t(l, '機器人', 'bot'), parsed.bot ? `${parsed.bot.name} ${parsed.bot.version}`.trim() : '—'],
  ];

  return (
    <div>
      <Bench
        leftLabel={t(l, 'User-Agent 字串', 'USER-AGENT STRING')}
        rightLabel={t(l, '解讀', 'READING')}
        leftAside={<span className="inst-no">{count(active.length)} ch</span>}
        rightAside={<CopyButton l={l} text={summarise(parsed)} label={t(l, '複製摘要', 'copy summary')} />}
        left={
          <>
            <Area
              label={t(l, '貼上字串(留空就用你自己的)', 'Paste a string (blank uses your own)')}
              value={text}
              onChange={setText}
              rows={5}
              placeholder={ownUA || 'Mozilla/5.0 …'}
            />
            <Row>
              <Btn onClick={() => setText('')} disabled={text === ''}>
                {t(l, '用我自己的', 'use mine')}
              </Btn>
              <CopyButton l={l} text={active} label={t(l, '複製字串', 'copy string')} />
            </Row>
            <Select
              label={t(l, '放入參考字串', 'Load a reference string')}
              value=""
              onChange={(value) => {
                const hit = SAMPLES.find((sample) => sample.label === value);
                if (hit) setText(hit.ua);
              }}
              options={[
                { value: '', label: t(l, '— 選一個 —', '— pick one —') },
                ...SAMPLES.map((sample) => ({ value: sample.label, label: sample.label })),
              ]}
              hint={t(
                l,
                '這些是 2025 年收集的真實字串,只是樣本,不是最新版本對照表。',
                'Real strings collected in 2025 — samples, not a current-version table.'
              )}
            />
          </>
        }
        right={
          <div aria-live="polite">
            <Table
              head={[t(l, '項目', 'field'), t(l, '判斷', 'reading')]}
              rows={rows.map(([key, value]) => [
                key,
                <span key={key} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                  {value}
                </span>,
              ])}
            />
            {parsed.reduced.length > 0 ? (
              <div className="mt-3">
                {parsed.reduced.map((id) => (
                  <Note key={id}>{reducedText(l, id)}</Note>
                ))}
              </div>
            ) : null}
          </div>
        }
      />

      <Panel
        label={t(l, '字串結構', 'STRING STRUCTURE')}
        aside={
          <span className="inst-no">
            {count(parsed.tokens.length)} {t(l, '個語彙', 'tokens')}
          </span>
        }
      >
        <p className="inst-hint">
          {t(
            l,
            'RFC 7231 只規定寫法:product/version,後面可以跟括號註解,註解可以巢狀。它沒有規定任何一個字代表什麼,所以下面是照文法拆的,上面才是靠經驗猜的。',
            'RFC 7231 specifies only the shape — product/version, optionally followed by parenthesised comments, which may nest. It says nothing about what any of it means, so the table below is grammar and the table above is guesswork.'
          )}
        </p>
        <Table
          head={[t(l, '種類', 'kind'), t(l, '名稱', 'name'), t(l, '版本 / 內容', 'version / content')]}
          rows={parsed.tokens.map((token, index) =>
            token.kind === 'product'
              ? [
                  t(l, '產品', 'product'),
                  <span key={index} style={{ fontFamily: 'var(--font-mono)' }}>
                    {token.name}
                  </span>,
                  <span key={`v${index}`} style={{ fontFamily: 'var(--font-mono)' }}>
                    {token.version || '—'}
                  </span>,
                ]
              : [
                  t(l, '註解', 'comment'),
                  '( )',
                  <span key={index} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {token.parts.join('  ·  ')}
                  </span>,
                ]
          )}
        />
      </Panel>

      <Panel label={t(l, '你這台瀏覽器主動說的部分', 'WHAT YOUR BROWSER VOLUNTEERS')}>
        <Table
          head={[t(l, '來源', 'source'), t(l, '值', 'value')]}
          rows={[
            [
              'navigator.userAgent',
              <span key="ua" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                {ownUA || t(l, '(還沒讀到)', '(not read yet)')}
              </span>,
            ],
            [
              'userAgentData.brands',
              <span key="b" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                {brands || t(l, '這個瀏覽器沒有(非 Chromium)', 'not available — this is not Chromium')}
              </span>,
            ],
            ['userAgentData.platform', platform || '—'],
            [
              'userAgentData.mobile',
              mobile === '' ? '—' : mobile === 'true' ? t(l, '是', 'yes') : t(l, '否', 'no'),
            ],
          ]}
        />
        <p className="inst-hint">
          {t(
            l,
            'Chromium 把細節從 UA 字串搬到了 Client Hints:高精度欄位(完整版本、實際機型)要用 getHighEntropyValues() 非同步索取,而且會被權限政策擋。這裡只讀同步就拿得到的部分,不發出任何請求。',
            'Chromium moved the detail out of the UA string and into Client Hints: the high-entropy fields (full version, real model) require an async getHighEntropyValues() call and can be blocked by permissions policy. Only the synchronously available values are read here, and nothing is sent anywhere.'
          )}
        </p>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '瀏覽器', 'browser'), v: parsed.browser?.name ?? '—' },
          { k: t(l, '引擎', 'engine'), v: parsed.engine?.name ?? '—' },
          { k: t(l, '系統', 'os'), v: parsed.os?.name ?? '—' },
          { k: t(l, '裝置', 'device'), v: deviceText(l, parsed.device.kind) },
          { k: t(l, '語彙數', 'tokens'), v: count(parsed.tokens.length) },
        ]}
      />
    </div>
  );
}
