'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  BASE58_CEILING,
  BaseError,
  decodeBytes,
  encodeBytes,
  expansion,
  guessFormat,
  type Format,
} from './logic';

const ORDER: Format[] = [
  'utf8',
  'hex',
  'base32',
  'base32hex',
  'base32crockford',
  'base58',
  'base64',
  'base64url',
  'decimal',
  'binary',
];

function label(l: 'zh' | 'en', format: Format): string {
  switch (format) {
    case 'utf8':
      return t(l, '文字 (UTF-8)', 'text (UTF-8)');
    case 'hex':
      return t(l, 'Hex 十六進位', 'hex');
    case 'base32':
      return 'Base32 (RFC 4648)';
    case 'base32hex':
      return 'Base32 hex-extended';
    case 'base32crockford':
      return 'Base32 Crockford';
    case 'base58':
      return 'Base58 (Bitcoin)';
    case 'base64':
      return 'Base64';
    case 'base64url':
      return 'Base64url';
    case 'decimal':
      return t(l, '十進位位元組', 'decimal bytes');
    case 'binary':
      return t(l, '二進位位元組', 'binary bytes');
    default:
      return format;
  }
}

export default function BaseX({ l }: ToolProps) {
  const [from, setFrom] = useState<Format>('utf8');
  const [to, setTo] = useState<Format>('hex');
  const [pad, setPad] = useState(true);
  const [text, setText] = useState('');

  const decoded = useMemo(() => {
    if (text.trim() === '') return { data: new Uint8Array(), error: null as string | null, at: -1 };
    try {
      return { data: decodeBytes(text, from), error: null, at: -1 };
    } catch (problem) {
      return {
        data: null,
        error: problem instanceof Error ? problem.message : String(problem),
        at: problem instanceof BaseError ? problem.index : -1,
      };
    }
  }, [text, from]);

  const output = useMemo(() => {
    if (!decoded.data) return { text: '', error: null as string | null };
    try {
      return { text: encodeBytes(decoded.data, to, { pad }), error: null };
    } catch (problem) {
      return { text: '', error: problem instanceof Error ? problem.message : String(problem) };
    }
  }, [decoded.data, to, pad]);

  /** Every format at once: usually the reason you opened this tool. */
  const allRows = useMemo(() => {
    if (!decoded.data) return [];
    return ORDER.map((format) => {
      try {
        return { format, value: encodeBytes(decoded.data as Uint8Array, format, { pad }) };
      } catch (problem) {
        return { format, value: `— ${problem instanceof Error ? problem.message : ''}` };
      }
    });
  }, [decoded.data, pad]);

  const guess = useMemo(() => guessFormat(text), [text]);
  const size = decoded.data?.length ?? 0;
  const padded = to === 'base32' || to === 'base32hex' || to === 'base64';

  return (
    <div>
      <Row>
        <Select
          label={t(l, '輸入格式', 'Read as')}
          value={from}
          onChange={setFrom}
          options={ORDER.map((format) => ({ value: format, label: label(l, format) }))}
        />
        <Select
          label={t(l, '輸出格式', 'Write as')}
          value={to}
          onChange={setTo}
          options={ORDER.map((format) => ({ value: format, label: label(l, format) }))}
        />
        {padded ? (
          <Check2 label={t(l, '補 = 號', 'add = padding')} checked={pad} onChange={setPad} />
        ) : null}
        <Btn
          onClick={() => {
            setFrom(to);
            setTo(from);
            if (output.text) setText(output.text);
          }}
        >
          {t(l, '對調', 'swap')}
        </Btn>
        <ResetButton l={l} onReset={() => setText('')} />
      </Row>

      <Bench
        leftLabel={label(l, from).toUpperCase()}
        rightLabel={label(l, to).toUpperCase()}
        leftAside={<span className="inst-no">{bytes(size)}</span>}
        rightAside={<span className="inst-no">{count(output.text.length)} ch</span>}
        left={
          <>
            <Area
              label={t(l, `以 ${label(l, from)} 讀取`, `Read as ${label(l, from)}`)}
              value={text}
              onChange={setText}
              rows={10}
              invalid={Boolean(decoded.error)}
              placeholder={from === 'utf8' ? '台北 101' : from === 'hex' ? 'de ad be ef' : ''}
            />
            {decoded.error ? (
              <Note error>
                {decoded.at >= 0
                  ? t(l, `第 ${decoded.at + 1} 個字元:${decoded.error}`, `At character ${decoded.at + 1}: ${decoded.error}`)
                  : decoded.error}
              </Note>
            ) : null}
            {guess && guess.format !== from && text.trim() !== '' ? (
              <Note>
                {t(
                  l,
                  `這串看起來像 ${label(l, guess.format)}(判斷依據:${guess.reason})。目前以 ${label(l, from)} 讀取。`,
                  `This looks like ${label(l, guess.format)} — ${guess.reason}. It is currently being read as ${label(l, from)}.`
                )}
                {'  '}
                <button
                  type="button"
                  className="inst-btn"
                  onClick={() => setFrom(guess.format)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {t(l, '改用這個', 'use that')}
                </button>
              </Note>
            ) : null}
            {from === 'base58' || to === 'base58' ? (
              <Note>
                {t(
                  l,
                  `Base58 是大整數換底,不是切位元組,所以長度每加一倍運算量變四倍——這裡上限 ${count(BASE58_CEILING)} 位元組。它也把 0、O、I、l 排除掉,因為手抄地址時這四個會抄錯。`,
                  `Base58 is a radix conversion on one big integer, not a bit-group split, so cost grows with the square of the length — the ceiling here is ${count(BASE58_CEILING)} bytes. It also omits 0, O, I and l, the four characters people mis-copy.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={output.text} />
            </Row>
            {output.error ? <Note error>{output.error}</Note> : null}
            <div
              className="inst-out mt-3"
              style={{ minHeight: '12rem', wordBreak: 'break-all' }}
              aria-live="polite"
            >
              {output.text || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
          </>
        }
      />

      {allRows.length > 0 && size > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '同一批位元組的所有寫法', 'THE SAME BYTES IN EVERY FORMAT')}
            aside={<span className="inst-no">{bytes(size)}</span>}
          >
            <Table
              head={[t(l, '格式', 'format'), t(l, '長度', 'chars'), t(l, '內容', 'value')]}
              rows={allRows.map((row) => [
                <button
                  key={`f${row.format}`}
                  type="button"
                  className="inst-btn"
                  onClick={() => setTo(row.format)}
                  aria-pressed={row.format === to}
                  data-primary={row.format === to ? 'true' : undefined}
                >
                  {label(l, row.format)}
                </button>,
                <span key={`n${row.format}`} className="inst-no">
                  {count(row.value.length)}
                </span>,
                <span key={`v${row.format}`} className="inst-wrap">
                  {row.value.length > 300 ? `${row.value.slice(0, 300)}…` : row.value}
                </span>,
              ])}
              align={['left', 'right', 'left']}
            />
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '位元組', 'bytes'), v: bytes(size) },
          { k: t(l, '輸出字元', 'out chars'), v: count(output.text.length) },
          {
            k: t(l, '實際膨脹', 'measured'),
            v: size > 0 ? `${(output.text.length / size).toFixed(2)}×` : '—',
          },
          { k: t(l, '理論膨脹', 'theoretical'), v: `${expansion(to).toFixed(2)}×` },
          { k: t(l, '字母表大小', 'alphabet'), v: to === 'base58' ? '58' : to === 'hex' ? '16' : to.startsWith('base32') ? '32' : to.startsWith('base64') ? '64' : '—' },
        ]}
      />
    </div>
  );
}
