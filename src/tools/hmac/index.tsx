'use client';

import { useCallback, useRef, useState } from 'react';
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
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  InvalidInput,
  LEGACY,
  MAC_ALGOS,
  MAC_LABEL,
  blockBytes,
  compareSignature,
  decodeInput,
  hmac,
  keyIsFolded,
  toBase64,
  toHex,
  type Comparison,
  type Encoding,
  type MacAlgo,
} from './logic';

type Fields = {
  algo: MacAlgo;
  keyText: string;
  keyEnc: Encoding;
  message: string;
  messageEnc: Encoding;
  signature: string;
};

type Result = {
  mac: Uint8Array;
  keyBytes: number;
  messageBytes: number;
};

const ENCODINGS: { value: Encoding; label: string }[] = [
  { value: 'utf8', label: 'text' },
  { value: 'hex', label: 'hex' },
  { value: 'base64', label: 'base64' },
];

/**
 * Sensitive tool: the key is a secret, so nothing here is written to
 * localStorage, no state goes into the URL, and a reload starts empty.
 *
 * The MAC is computed in the change handlers rather than in an effect — the
 * house rule (no setState inside an effect) and the fact that
 * `crypto.subtle.sign` is async, which rules out a `useMemo`.
 */
export default function Hmac({ l }: ToolProps) {
  const [fields, setFields] = useState<Fields>({
    algo: 'sha256',
    keyText: '',
    keyEnc: 'utf8',
    message: '',
    messageEnc: 'utf8',
    signature: '',
  });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const run = useRef(0);

  const recompute = useCallback(async (next: Fields) => {
    const ticket = run.current + 1;
    run.current = ticket;
    try {
      const key = decodeInput(next.keyText, next.keyEnc, 'key');
      const message = decodeInput(next.message, next.messageEnc, 'message');
      const mac = await hmac(next.algo, key, message);
      // A later keystroke may have landed while subtle was working.
      if (run.current !== ticket) return;
      setError(null);
      setResult({ mac, keyBytes: key.length, messageBytes: message.length });
    } catch (problem) {
      if (run.current !== ticket) return;
      setResult(null);
      setError(
        problem instanceof InvalidInput
          ? { field: problem.field, message: problem.message }
          : { field: 'key', message: problem instanceof Error ? problem.message : String(problem) }
      );
    }
  }, []);

  // Both the new state and the new MAC come from one place. The updater form
  // of setState is deliberately not used: kicking off work inside it would be
  // a side effect in a function React is allowed to call twice.
  const apply = useCallback(
    (patch: Partial<Fields>) => {
      const next = { ...fields, ...patch };
      setFields(next);
      void recompute(next);
    },
    [fields, recompute]
  );

  const comparison: Comparison = result ? compareSignature(fields.signature, result.mac) : { kind: 'empty' };
  const folded = result ? keyIsFolded(fields.algo, result.keyBytes) : false;

  return (
    <div>
      <Bench
        leftLabel={t(l, '密鑰與訊息', 'KEY AND MESSAGE')}
        rightLabel={t(l, 'MAC', 'MAC')}
        leftAside={
          <span className="inst-no">
            {t(l, '不儲存', 'nothing stored')}
          </span>
        }
        rightAside={<span className="inst-no">{MAC_LABEL[fields.algo]}</span>}
        left={
          <>
            <Row>
              <Select
                label={t(l, '演算法', 'Algorithm')}
                value={fields.algo}
                onChange={(algo) => apply({ algo })}
                options={MAC_ALGOS.map((algo) => ({
                  value: algo,
                  label: LEGACY.includes(algo) ? `${MAC_LABEL[algo]} (legacy)` : MAC_LABEL[algo],
                }))}
              />
            </Row>

            <Area
              label={t(l, '密鑰', 'Key')}
              hint={t(
                l,
                '選錯編碼是 HMAC 對不上的第一名原因:同一把 32 位元組的鑰匙,當文字讀是 64 個字元。',
                'The wrong encoding is the commonest cause of a mismatch: a 32-byte key read as text is 64 characters.'
              )}
              value={fields.keyText}
              onChange={(keyText) => apply({ keyText })}
              rows={2}
              invalid={error?.field === 'key'}
              placeholder={t(l, 'whsec_…', 'whsec_…')}
            />
            <Row>
              <Seg
                label={t(l, '密鑰編碼', 'Key encoding')}
                value={fields.keyEnc}
                onChange={(keyEnc) => apply({ keyEnc })}
                options={ENCODINGS}
              />
            </Row>

            <Area
              label={t(l, '訊息', 'Message')}
              hint={t(
                l,
                '要一模一樣的原始 body:格式化過、少了或多了結尾換行,算出來就不一樣。',
                'Must be the exact raw body — reformatted JSON or a changed trailing newline gives a different MAC.'
              )}
              value={fields.message}
              onChange={(message) => apply({ message })}
              rows={8}
              invalid={error?.field === 'message'}
              placeholder='{"id":"evt_1","type":"charge.succeeded"}'
            />
            <Row>
              <Seg
                label={t(l, '訊息編碼', 'Message encoding')}
                value={fields.messageEnc}
                onChange={(messageEnc) => apply({ messageEnc })}
                options={ENCODINGS}
              />
            </Row>

            {error ? (
              <Note error>
                {t(
                  l,
                  `${error.field === 'key' ? '密鑰' : '訊息'}讀不出來:${error.message}`,
                  `Could not read the ${error.field}: ${error.message}`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            {result ? (
              <>
                <Table
                  head={[t(l, '格式', 'form'), t(l, '值', 'value'), '']}
                  rows={[
                    [
                      'hex',
                      <span key="h" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                        {toHex(result.mac)}
                      </span>,
                      <CopyButton key="hc" l={l} text={toHex(result.mac)} />,
                    ],
                    [
                      'base64',
                      <span key="b" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                        {toBase64(result.mac)}
                      </span>,
                      <CopyButton key="bc" l={l} text={toBase64(result.mac)} />,
                    ],
                    [
                      t(l, 'GitHub 風格', 'GitHub style'),
                      <span key="g" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                        {`sha256=${toHex(result.mac)}`}
                      </span>,
                      <CopyButton key="gc" l={l} text={`sha256=${toHex(result.mac)}`} />,
                    ],
                  ]}
                />
                {folded ? (
                  <Note>
                    {t(
                      l,
                      `密鑰 ${result.keyBytes} 位元組,超過 ${blockBytes(fields.algo)} 位元組的區塊長度,HMAC 會先把它雜湊成一個摘要再用。再長也不會更強。`,
                      `The key is ${result.keyBytes} bytes, past the ${blockBytes(fields.algo)}-byte block size, so HMAC hashes it down first. Extra length adds nothing.`
                    )}
                  </Note>
                ) : null}
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '填入密鑰與訊息,MAC 會即時算出來。空密鑰也是合法的 HMAC(RFC 2104 會補零)。',
                  'Enter a key and a message; the MAC appears as you type. An empty key is legal HMAC — RFC 2104 pads it.'
                )}
              </Note>
            )}

            <div className="mt-3">
              <Area
                label={t(l, '對方送來的簽章(貼整段也行)', 'The signature you received')}
                hint={t(
                  l,
                  'sha256=… 或 t=…,v1=… 這種 header 直接貼,會自己抓出值;hex 與 base64 兩種都比。',
                  'Paste the whole header — sha256=… or t=…,v1=… — and it finds the value. Hex and base64 are both compared.'
                )}
                value={fields.signature}
                onChange={(signature) => setFields({ ...fields, signature })}
                rows={2}
                placeholder="sha256=…"
              />
              <div aria-live="polite">
                {comparison.kind === 'match' ? (
                  <Note>
                    <span style={{ color: 'var(--data-teal)' }}>
                      {t(
                        l,
                        `符合(以 ${comparison.form} 比對)。這個訊息確實是用這把密鑰簽的。`,
                        `Match, compared as ${comparison.form}. This message was signed with this key.`
                      )}
                    </span>
                  </Note>
                ) : null}
                {comparison.kind === 'mismatch' ? (
                  <Note error>
                    {t(
                      l,
                      '不符合。依序檢查:密鑰編碼對嗎?訊息是原始 body 嗎(不是格式化過的)?演算法對嗎?有些服務簽的是「時間戳 + 分隔符 + body」而不是 body 本身。',
                      'No match. In order: is the key encoding right? Is the message the raw body rather than a reformatted one? Is the algorithm right? Some senders sign "timestamp + separator + body" rather than the body alone.'
                    )}
                  </Note>
                ) : null}
                {comparison.kind === 'unreadable' ? (
                  <Note error>
                    {t(
                      l,
                      '這串簽章既不是 hex 也不是 base64,看不出來要跟什麼比。',
                      'That signature is neither hex nor base64, so there is nothing to compare.'
                    )}
                  </Note>
                ) : null}
              </div>
            </div>

            <Row>
              <Btn
                onClick={() => {
                  setFields({
                    algo: fields.algo,
                    keyText: '',
                    keyEnc: fields.keyEnc,
                    message: '',
                    messageEnc: fields.messageEnc,
                    signature: '',
                  });
                  setResult(null);
                  setError(null);
                }}
              >
                {t(l, '清空密鑰與訊息', 'clear key and message')}
              </Btn>
            </Row>
          </>
        }
      />

      <Panel label={t(l, '常見的簽章組法', 'HOW SENDERS BUILD THE MESSAGE')}>
        <Table
          head={[t(l, '送法', 'sender style'), t(l, '被簽的內容', 'what is signed'), t(l, 'header', 'header')]}
          rows={[
            [
              'GitHub',
              t(l, '原始 body', 'the raw body'),
              'X-Hub-Signature-256: sha256=<hex>',
            ],
            [
              'Stripe',
              t(l, '時間戳 + "." + 原始 body', 'timestamp + "." + raw body'),
              'Stripe-Signature: t=…,v1=<hex>',
            ],
            [
              'Shopify',
              t(l, '原始 body,MAC 用 base64', 'the raw body, MAC in base64'),
              'X-Shopify-Hmac-SHA256: <base64>',
            ],
            [
              'Slack',
              t(l, '"v0:" + 時間戳 + ":" + body', '"v0:" + timestamp + ":" + body'),
              'X-Slack-Signature: v0=<hex>',
            ],
          ]}
        />
        <Note>
          {t(
            l,
            '表格是常見做法的備忘,不是規格;各家都改過格式,實作前請看對方目前的文件。要試 Stripe 或 Slack 那種組法,把時間戳與分隔符一起貼進「訊息」欄位即可。',
            'A reminder, not a specification — every one of these has changed format at some point, so check the current docs. To try the Stripe or Slack shape, paste the timestamp and separator into the message field yourself.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '密鑰', 'key'), v: result ? fmtBytes(result.keyBytes) : '—' },
          { k: t(l, '訊息', 'message'), v: result ? fmtBytes(result.messageBytes) : '—' },
          { k: t(l, '區塊', 'block'), v: `${blockBytes(fields.algo)} B` },
          { k: 'MAC', v: result ? `${result.mac.length * 8} bits` : '—' },
          { k: t(l, '實作', 'implementation'), v: 'crypto.subtle' },
        ]}
      />
    </div>
  );
}
