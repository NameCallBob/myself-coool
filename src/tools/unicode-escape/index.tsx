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
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  INSPECT_LIMIT,
  escapeUnicode,
  inspect,
  summarise,
  unescapeUnicode,
  type Scope,
  type Style,
} from './logic';

type Direction = 'escape' | 'unescape';

const SAMPLE = '台北 101​ — café \u{1F600}';

/** Rows the table shows at once; more than this and nobody reads it anyway. */
const ROW_LIMIT = 300;

export default function UnicodeEscape({ l }: ToolProps) {
  const [direction, setDirection] = useState<Direction>('escape');
  const [style, setStyle] = useState<Style>('u16');
  const [scope, setScope] = useState<Scope>('nonAscii');
  const [upper, setUpper] = useState(true);
  const [text, setText] = useState('');
  const [onlyOdd, setOnlyOdd] = useState(false);

  const result = useMemo((): { out: string; unknown: string[] } => {
    if (direction === 'escape') {
      return { out: escapeUnicode(text, { style, scope, upper }), unknown: [] };
    }
    const undone = unescapeUnicode(text);
    return { out: undone.text, unknown: undone.unknown };
  }, [direction, text, style, scope, upper]);

  /** The inspector always reads the decoded side, which is the interesting one. */
  const subject = direction === 'escape' ? text : result.out;
  const rows = useMemo(() => inspect(subject), [subject]);
  const summary = useMemo(() => summarise(subject), [subject]);
  const shown = useMemo(
    () => (onlyOdd ? rows.filter((row) => row.suspicious) : rows).slice(0, ROW_LIMIT),
    [rows, onlyOdd]
  );

  const displayOnly = style === 'codepoint' || style === 'css';

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'escape', label: t(l, '字元 → escape', 'characters to escapes') },
            { value: 'unescape', label: t(l, 'escape → 字元', 'escapes to characters') },
          ]}
        />
        {direction === 'escape' ? (
          <>
            <Select
              label={t(l, '寫法', 'Notation')}
              value={style}
              onChange={setStyle}
              options={[
                { value: 'u16', label: '\\uXXXX — JSON / Java / C#' },
                { value: 'brace', label: '\\u{XXXX} — ES2015 / Rust' },
                { value: 'x', label: '\\xNN + \\uXXXX — JS / C / PHP' },
                { value: 'python', label: '\\xNN / \\uXXXX / \\UXXXXXXXX — Python' },
                { value: 'css', label: '\\XXXX␠ — CSS' },
                { value: 'codepoint', label: 'U+XXXX — ' + t(l, '書寫用', 'for prose') },
              ]}
            />
            <Seg
              label={t(l, '轉哪些字元', 'Which characters')}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'nonAscii', label: t(l, '非 ASCII', 'non-ASCII') },
                { value: 'all', label: t(l, '全部', 'all') },
                { value: 'suspicious', label: t(l, '只轉看不見的', 'invisible only') },
              ]}
            />
            <Check2 label={t(l, '大寫十六進位', 'uppercase hex')} checked={upper} onChange={setUpper} />
          </>
        ) : null}
        <Btn onClick={() => setText(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
        <ResetButton l={l} onReset={() => setText('')} />
      </Row>

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{count(text.length)} {t(l, '碼元', 'units')}</span>}
        rightAside={<span className="inst-no">{count(result.out.length)} {t(l, '碼元', 'units')}</span>}
        left={
          <>
            <Area
              label={
                direction === 'escape'
                  ? t(l, '貼上文字', 'Paste text')
                  : t(l, '貼上含 escape 的字串', 'Paste a string with escapes')
              }
              value={text}
              onChange={setText}
              rows={8}
              placeholder={direction === 'escape' ? SAMPLE : '\\u53F0\\u5317 \\uD83D\\uDE00'}
            />
            {direction === 'escape' && displayOnly ? (
              <Note>
                {t(
                  l,
                  '這兩種是書寫用的寫法:每個 escape 後面帶一個空格當結束符,所以貼回程式碼裡不會被讀回原字元。要放進程式碼請選上面四種。',
                  'These two are display forms: each escape ends with a space, so they do not read back as characters. For code, pick one of the four above.'
                )}
              </Note>
            ) : null}
            {result.unknown.length > 0 ? (
              <Note>
                {t(
                  l,
                  `這些 escape 不認得,原樣保留:${result.unknown.join(' ')}。正規表達式裡的 \\d \\s \\w 就是這一類,保留才不會把你貼進來的東西改壞。`,
                  `Unrecognised escapes, passed through untouched: ${result.unknown.join(' ')}. A regular expression's \\d \\s \\w land here, and changing them would corrupt what you pasted.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={result.out} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '10rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              aria-live="polite"
            >
              {result.out || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
          </>
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '逐字檢視', 'PER-CHARACTER')}
          aside={
            <span className="inst-no">
              {count(summary.suspicious)} {t(l, '個可疑', 'suspicious')}
            </span>
          }
        >
          <Row>
            <Check2
              label={t(l, '只看看不見的字元', 'only the invisible ones')}
              checked={onlyOdd}
              onChange={setOnlyOdd}
            />
          </Row>

          {summary.suspicious > 0 ? (
            <Note error>
              {t(
                l,
                `這段文字裡有 ${count(summary.suspicious)} 個看不見或近乎看不見的字元。字串比對不相等、CSV 欄位對不上、搜尋找不到,通常就是它們。`,
                `This text holds ${count(summary.suspicious)} characters you cannot see. Comparisons that should match, CSV columns that will not line up, searches that find nothing — usually one of these.`
              )}
            </Note>
          ) : null}

          {shown.length === 0 ? (
            <Note>
              {onlyOdd && rows.length > 0
                ? t(l, '沒有看不見的字元。', 'No invisible characters.')
                : t(l, '輸入文字後會逐字列出。', 'Characters are listed here.')}
            </Note>
          ) : (
            <Table
              head={[
                '#',
                t(l, '字元', 'char'),
                t(l, '碼位', 'code point'),
                t(l, '名稱 / 類別', 'name / category'),
                'UTF-8',
                'UTF-16',
              ]}
              rows={shown.map((row) => [
                <span key={`i${row.index}`} className="inst-no">
                  {row.index}
                </span>,
                <span
                  key={`c${row.index}`}
                  style={{
                    fontSize: '1.1em',
                    color: row.suspicious ? 'var(--accent)' : undefined,
                  }}
                >
                  {row.suspicious ? '␣' : row.char}
                </span>,
                row.label,
                <span key={`n${row.index}`}>
                  {row.name ?? `${row.category}${row.script === '—' ? '' : ` · ${row.script}`}`}
                  {row.bidi ? ` · ${t(l, '雙向控制', 'bidi control')}` : ''}
                  {row.emoji ? ' · emoji' : ''}
                </span>,
                <span key={`u8${row.index}`} className="inst-no">
                  {row.utf8}
                </span>,
                <span key={`u16${row.index}`} className="inst-no">
                  {row.utf16}
                </span>,
              ])}
            />
          )}

          {rows.length > ROW_LIMIT ? (
            <Note>
              {t(
                l,
                `只列前 ${count(ROW_LIMIT)} 個字元(共 ${count(rows.length)} 個${rows.length >= INSPECT_LIMIT ? `,分析上限 ${count(INSPECT_LIMIT)}` : ''})。`,
                `Showing the first ${count(ROW_LIMIT)} of ${count(rows.length)} characters${rows.length >= INSPECT_LIMIT ? `; analysis stops at ${count(INSPECT_LIMIT)}` : ''}.`
              )}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              '可疑的字元在「字元」欄顯示為 ␣ 並標紅,因為顯示原字元的話你還是看不到它——那正是問題所在。',
              'Suspicious characters show as ␣ in red: rendering the character itself would show nothing, which is the problem in the first place.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '碼位數', 'code points'), v: count(summary.codePoints) },
          { k: t(l, 'UTF-16 碼元', 'UTF-16 units'), v: count(summary.codeUnits) },
          { k: 'UTF-8', v: bytes(summary.utf8Bytes) },
          {
            k: t(l, '字形叢集', 'graphemes'),
            v: summary.graphemes === null ? t(l, '此瀏覽器不支援', 'unsupported') : count(summary.graphemes),
          },
          { k: t(l, '需代理對', 'needs surrogates'), v: count(summary.astral) },
          { k: t(l, '看不見的字元', 'invisible'), v: count(summary.suspicious) },
        ]}
      />
    </div>
  );
}
