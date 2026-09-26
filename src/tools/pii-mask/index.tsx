'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bench,
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
import type { ToolProps } from '../types';
import {
  DETECTORS,
  InputTooLarge,
  MAX_INPUT,
  STANDARD_DETECTORS,
  redact,
  segments,
  type DetectorId,
  type Mode,
} from './logic';

const NAMES: Record<DetectorId, { zh: string; en: string }> = {
  email: { zh: 'Email', en: 'Email' },
  card: { zh: '信用卡號(檢查 Luhn)', en: 'Card number (Luhn-checked)' },
  twId: { zh: '身分證字號(檢查碼)', en: 'TW ID (checksum)' },
  twBusiness: { zh: '統一編號(誤判率高)', en: 'TW business no. (noisy)' },
  mobileTw: { zh: '手機號碼', en: 'Mobile number' },
  landlineTw: { zh: '市話號碼', en: 'Landline' },
  ipv4: { zh: 'IPv4', en: 'IPv4' },
  ipv6: { zh: 'IPv6', en: 'IPv6' },
  mac: { zh: 'MAC 位址', en: 'MAC address' },
  jwt: { zh: 'JWT', en: 'JWT' },
  apiKey: { zh: 'API 金鑰(sk-、AKIA、ghp_…)', en: 'API keys (sk-, AKIA, ghp_…)' },
  authHeader: { zh: 'Authorization 標頭', en: 'Authorization header' },
  urlCredentials: { zh: '網址內的帳密', en: 'Credentials in a URL' },
  querySecret: { zh: 'password= / token= 參數', en: 'password= / token= parameters' },
  hexToken: { zh: '長十六進位字串(雜湊)', en: 'Long hex strings (hashes)' },
  base64Token: { zh: '長 base64 字串(誤判率高)', en: 'Long base64 runs (noisy)' },
};

const SAMPLE = `2024-03-02T10:14:22Z WARN  user ann.lee@example.com (id A123456789) login failed
  ip=203.0.113.42  ua="Mozilla/5.0"  phone 0912-345-678
  card 4111 1111 1111 1111  token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij
  retry via postgres://admin:hunter2@db.internal:5432/app`;

/** Highlighting a whole log file costs more than it explains. */
const PREVIEW_CHARS = 6000;

/**
 * Redaction before pasting. Registered as `sensitive`, which is why there is no
 * "remember my detectors": nothing here is written to localStorage, to
 * IndexedDB, or to the URL. Close the tab and it is gone.
 */
export default function PiiMask({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('label');
  const [enabled, setEnabled] = useState<DetectorId[]>([...STANDARD_DETECTORS]);

  const toggle = (id: DetectorId) =>
    setEnabled((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );

  const outcome = useMemo(() => {
    try {
      return { ...redact(text, enabled, mode), error: null as string | null };
    } catch (error) {
      return {
        text: '',
        matches: [],
        counts: {} as Record<string, number>,
        distinct: {} as Record<string, number>,
        truncated: false,
        error:
          error instanceof InputTooLarge
            ? t(
                l,
                `文字有 ${count(error.length)} 字元,超過 ${count(MAX_INPUT)} 的上限。log 太大請切成幾段貼。`,
                `The input is ${count(error.length)} characters, over the ${count(MAX_INPUT)} limit. Paste a log in parts.`
              )
            : String(error),
      };
    }
  }, [text, enabled, mode, l]);

  const previewText = text.slice(0, PREVIEW_CHARS);
  const parts = useMemo(
    () =>
      segments(
        previewText,
        outcome.matches.filter((match) => match.at + match.length <= previewText.length)
      ),
    [previewText, outcome.matches]
  );

  const findings = DETECTORS.filter((detector) => (outcome.counts[detector.id] ?? 0) > 0);

  return (
    <div>
      <Note>
        {t(
          l,
          '這個工具不寫 localStorage、不寫 IndexedDB、不把內容放進網址。貼進來的東西只存在這個分頁的記憶體裡,重新整理就沒了。',
          'Nothing here is written to localStorage, IndexedDB or the URL. What you paste lives in this tab’s memory and is gone on reload.'
        )}
      </Note>

      <Bench
        leftLabel={t(l, '原始 log', 'INPUT')}
        rightLabel={t(l, '遮蔽後', 'REDACTED')}
        leftAside={<span className="inst-no">{bytes(new Blob([text]).size)}</span>}
        rightAside={
          <span className="inst-no">
            {count(outcome.matches.length)} {t(l, '處', 'found')}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '貼上要給別人看的內容', 'Paste what you are about to share')}
              value={text}
              onChange={setText}
              rows={14}
              placeholder={SAMPLE}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button type="button" className="inst-btn" onClick={() => setText(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>
            {outcome.error ? <Note error>{outcome.error}</Note> : null}

            <div className="inst-pane-label mt-6">
              <span>{t(l, '命中位置', 'WHAT WAS FOUND')}</span>
            </div>
            <div className="inst-out" aria-live="polite">
              {parts.length === 0 ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '還沒有命中。', 'Nothing found yet.')}
                </span>
              ) : (
                parts.map((part, index) => (
                  <span key={index} className={part.id ? 'inst-del' : undefined} style={part.id ? { textDecoration: 'none' } : undefined}>
                    {part.text}
                  </span>
                ))
              )}
            </div>
            {text.length > PREVIEW_CHARS ? (
              <Note>
                {t(
                  l,
                  `標記只畫前 ${count(PREVIEW_CHARS)} 字元;遮蔽仍然是整份文字。`,
                  `The highlight covers the first ${count(PREVIEW_CHARS)} characters; redaction covers all of it.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Seg
                label={t(l, '遮蔽方式', 'Masking')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'label', label: t(l, '編號標記', 'labelled') },
                  { value: 'partial', label: t(l, '部分保留', 'partial') },
                  { value: 'fixed', label: t(l, '一律 [REDACTED]', 'fixed') },
                ]}
              />
            </Row>
            <pre className="inst-out" aria-live="polite" style={{ minHeight: '12rem', margin: 0 }}>
              {outcome.text || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊貼上內容。', 'Paste on the left.')}
                </span>
              )}
            </pre>
            <Row>
              <CopyButton l={l} text={outcome.text} label={t(l, '複製遮蔽後', 'copy redacted')} />
            </Row>
            <Note>
              {t(
                l,
                '「編號標記」會把同一個值換成同一個編號([EMAIL_1] 出現兩次代表是同一個人),所以 log 的因果還讀得出來,但原值不會外流。「部分保留」留下網域、後四碼、網段這些排查時真的需要的部分。',
                'Labelled mode gives each distinct value a stable number, so the log still reads as a story; partial mode keeps the domain, the last four digits, the network prefix — the parts debugging actually needs.'
              )}
            </Note>

            {findings.length > 0 ? (
              <>
                <div className="inst-pane-label mt-6">
                  <span>{t(l, '統計', 'SUMMARY')}</span>
                </div>
                <Table
                  head={[t(l, '類型', 'type'), t(l, '處', 'found'), t(l, '不同值', 'distinct')]}
                  rows={findings.map((detector) => [
                    t(l, NAMES[detector.id].zh, NAMES[detector.id].en),
                    <span key={`${detector.id}-n`} className="inst-no">
                      {count(outcome.counts[detector.id] ?? 0)}
                    </span>,
                    <span key={`${detector.id}-d`} className="inst-no">
                      {count(outcome.distinct[detector.id] ?? 0)}
                    </span>,
                  ])}
                  align={['left', 'right', 'right']}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <div className="inst-pane-label">
          <span>{t(l, '要找什麼', 'DETECTORS')}</span>
          <span className="inst-no">
            {count(enabled.length)} / {count(DETECTORS.length)}
          </span>
        </div>
        <div className="inst-toolbar">
          {DETECTORS.map((detector) => (
            <button
              key={detector.id}
              type="button"
              className="inst-btn"
              aria-pressed={enabled.includes(detector.id)}
              data-primary={enabled.includes(detector.id) ? 'true' : undefined}
              onClick={() => toggle(detector.id)}
            >
              {t(l, NAMES[detector.id].zh, NAMES[detector.id].en)}
            </button>
          ))}
        </div>
        <Row>
          <button type="button" className="inst-btn" onClick={() => setEnabled([...STANDARD_DETECTORS])}>
            {t(l, '還原預設組合', 'restore the default set')}
          </button>
          <button type="button" className="inst-btn" onClick={() => setEnabled(DETECTORS.map((detector) => detector.id))}>
            {t(l, '全部打開', 'enable all')}
          </button>
        </Row>
        <Note error>
          {t(
            l,
            '這是過濾器,不是保證。它不知道 order-8891 是客戶編號、不知道你的內部主機名是機密、也不認得自訂格式的工號。送出前自己再看一遍——尤其是「統一編號」與「長 base64」這兩個預設關閉的偵測器,打開會誤判一堆正常數字。',
            'This is a filter, not a guarantee. It cannot know that order-8891 is a customer reference or that an internal hostname is confidential. Read the output before you send it — especially with the two noisy detectors turned on.'
          )}
        </Note>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '命中', 'found'), v: count(outcome.matches.length) },
          {
            k: t(l, '不同值', 'distinct'),
            v: count(Object.values(outcome.distinct).reduce((sum, n) => sum + n, 0)),
          },
          { k: t(l, '偵測器', 'detectors'), v: `${count(enabled.length)}/${count(DETECTORS.length)}` },
          { k: t(l, '方式', 'mode'), v: mode },
          { k: t(l, '輸入', 'in'), v: bytes(new Blob([text]).size) },
          { k: t(l, '保存', 'stored'), v: t(l, '無', 'nothing') },
        ]}
      />
    </div>
  );
}
