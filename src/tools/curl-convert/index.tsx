'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { DEFAULT_EMIT, convert, type Target } from './logic';

const SAMPLE = `curl -X POST 'https://api.example.com/v1/orders?draft=1' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer eyJhbGciOi...' \\
  -d '{"sku":"X1","qty":2,"note":"加急","express":true}'`;

const TARGETS: { value: Target; label: string }[] = [
  { value: 'fetch', label: 'fetch' },
  { value: 'axios', label: 'axios' },
  { value: 'requests', label: 'requests' },
  { value: 'httpie', label: 'httpie' },
];

export default function CurlConvert({ l }: ToolProps) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState<Target>('fetch');
  const [awaitStyle, setAwaitStyle] = useState(true);

  const outcome = useMemo(
    () => convert(source, target, { ...DEFAULT_EMIT, awaitStyle }),
    [source, target, awaitStyle]
  );

  const failed = !outcome.ok && source.trim() !== '';
  const request = outcome.ok ? outcome.request : null;

  return (
    <div>
      <Note>
        {t(
          l,
          '這件工具只解析文字,不會發出任何請求,也不寫 localStorage 或 URL。指令裡的 token 留在這個分頁裡。',
          'This only parses text. No request is ever made, and nothing is written to localStorage or the URL.'
        )}
      </Note>

      <Bench
        leftLabel={t(l, 'curl 指令', 'CURL COMMAND')}
        rightLabel={t(l, '程式碼', 'CODE')}
        leftAside={source ? <span className="inst-no">{bytes(new Blob([source]).size)}</span> : null}
        rightAside={request ? <span className="inst-no">{request.method}</span> : null}
        left={
          <>
            <Area
              label={t(l, '貼上一整條 curl(可以含換行接續)', 'Paste a curl command (line continuations are fine)')}
              value={source}
              onChange={setSource}
              rows={12}
              placeholder={SAMPLE}
              invalid={failed}
            />
            <Row>
              <ResetButton l={l} onReset={() => setSource('')} />
              <button type="button" className="inst-btn" onClick={() => setSource(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>
            {failed ? (
              <Note error>{t(l, `解析不了:${outcome.message}`, `Could not parse: ${outcome.message}`)}</Note>
            ) : null}

            {request ? (
              <div className="mt-6">
                <div className="inst-pane-label">
                  <span>{t(l, '解析結果', 'PARSED')}</span>
                </div>
                <Table
                  head={[t(l, '項目', 'item'), t(l, '內容', 'value')]}
                  rows={[
                    [t(l, '方法', 'method'), request.method],
                    [t(l, '網址', 'url'), request.url],
                    ...(request.query.length > 0
                      ? [[t(l, '查詢參數', 'query'), request.query.map(([k, v]) => `${k}=${v}`).join('  ')]]
                      : []),
                    ...request.headers.map((header) => [`${t(l, '標頭', 'header')} ${header.name}`, header.value]),
                    ...(request.cookies ? [[t(l, 'Cookie', 'cookie'), request.cookies]] : []),
                    ...(request.auth
                      ? [[t(l, '基本驗證', 'basic auth'), `${request.auth.user}:${'•'.repeat(request.auth.password.length)}`]]
                      : []),
                    ...(request.bodyKind !== 'none'
                      ? [
                          [
                            t(l, '主體', 'body'),
                            request.bodyKind === 'multipart'
                              ? request.form
                                  .map((field) => `${field.name}${field.isFile ? '@' : '='}${field.value}`)
                                  .join('  ')
                              : request.body.length > 300
                                ? `${request.body.slice(0, 300)}…`
                                : request.body,
                          ],
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Seg label={t(l, '輸出目標', 'Target')} value={target} onChange={setTarget} options={TARGETS} />
              {target === 'fetch' || target === 'axios' ? (
                <Check2 label={t(l, '用 await', 'use await')} checked={awaitStyle} onChange={setAwaitStyle} />
              ) : null}
              <CopyButton l={l} text={outcome.ok ? outcome.code : ''} />
            </Row>
            <div className="inst-out mt-3" style={{ minHeight: '20rem' }} aria-live="polite">
              {outcome.ok ? (
                outcome.code
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上 curl 指令就會出現程式碼。', 'Paste a curl command and the code appears here.')}
                </span>
              )}
            </div>

            {request && request.warnings.length > 0 ? (
              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '轉不過去的地方', 'WHAT DID NOT CARRY OVER')}</span>
                  <span className="inst-no">{count(request.warnings.length)}</span>
                </div>
                {request.warnings.map((warning, index) => (
                  <Note key={index} error>
                    {warning}
                  </Note>
                ))}
              </div>
            ) : null}

            <Note>
              {target === 'fetch'
                ? t(
                    l,
                    'fetch 版把 curl 預設會送的 Content-Type 明寫出來,-u 用 btoa 當場編碼,好讓你看得出用了哪組帳密。',
                    'The fetch version states the Content-Type curl would send by default, and encodes -u with btoa so the credentials stay readable.'
                  )
                : target === 'axios'
                  ? t(
                      l,
                      'axios 版用 auth 物件而不是自己組 Authorization 標頭;瀏覽器端沒有 --insecure 的對應寫法。',
                      'axios uses its auth option rather than a hand-built Authorization header. There is no browser equivalent of --insecure.'
                    )
                  : target === 'requests'
                    ? t(
                        l,
                        'requests 預設會跟隨轉址,curl 不加 -L 不會;差異會寫成註解提醒。JSON 主體用 json= 而不是 data=。',
                        'requests follows redirects by default and curl does not; the difference is noted as a comment. A JSON body uses json=.'
                      )
                    : t(
                        l,
                        'httpie 的請求項目本身就是主體:JSON 物件轉成 key=value 與 key:=json,不是 JSON 的原始主體改用 stdin 導入。',
                        'httpie request items carry the body: a JSON object becomes key=value / key:=json items, and a raw body is piped in on stdin.'
                      )}
            </Note>
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '方法', 'method'), v: request?.method ?? '—' },
          { k: t(l, '標頭', 'headers'), v: request ? count(request.headers.length) : '—' },
          {
            k: t(l, '主體', 'body'),
            v: request
              ? request.bodyKind === 'none'
                ? t(l, '無', 'none')
                : request.bodyKind === 'multipart'
                  ? `multipart ${count(request.form.length)}`
                  : bytes(new Blob([request.body]).size)
              : '—',
          },
          { k: t(l, '提醒', 'notes'), v: request ? count(request.warnings.length) : '—' },
          { k: t(l, '發送', 'sent'), v: t(l, '不發送', 'never') },
        ]}
      />
    </div>
  );
}
