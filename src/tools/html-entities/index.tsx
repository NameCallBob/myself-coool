'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  NAMED_COUNT,
  TABLE_VERSION,
  countC1,
  decodeEntities,
  encodeEntities,
  entityRows,
  inspectEntities,
  type Prefer,
  type Scope,
} from './logic';

type Direction = 'encode' | 'decode';

const SAMPLE = '<p class="note">Ben &amp; Jerry&rsquo;s — caf&eacute; 100&nbsp;% 台北</p>';

/** Rows shown before the reference table asks you to narrow it down. */
const TABLE_LIMIT = 40;

export default function HtmlEntities({ l }: ToolProps) {
  const [direction, setDirection] = useState<Direction>('encode');
  const [scope, setScope] = useState<Scope>('minimal');
  const [prefer, setPrefer] = useState<Prefer>('named');
  const [lenient, setLenient] = useState(false);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');

  const output = useMemo(
    () =>
      direction === 'encode'
        ? encodeEntities(text, { scope, prefer })
        : decodeEntities(text, { lenient }),
    [direction, text, scope, prefer, lenient]
  );

  const report = useMemo(() => inspectEntities(text), [text]);
  const c1 = useMemo(() => countC1(text), [text]);

  const rows = useMemo(() => {
    const all = entityRows();
    const needle = filter.trim().toLowerCase();
    if (needle === '') return { list: all.slice(0, TABLE_LIMIT), total: all.length };
    const hit = all.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.char === filter.trim() ||
        row.cp.toString(16).includes(needle.replace(/^(0x|u\+)/, ''))
    );
    return { list: hit.slice(0, TABLE_LIMIT), total: hit.length };
  }, [filter]);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: t(l, '文字 → 實體', 'text to entities') },
            { value: 'decode', label: t(l, '實體 → 文字', 'entities to text') },
          ]}
        />
        {direction === 'encode' ? (
          <>
            <Seg
              label={t(l, '範圍', 'Scope')}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'minimal', label: t(l, '最小必要', 'minimal') },
                { value: 'nonAscii', label: t(l, '全部非 ASCII', 'all non-ASCII') },
              ]}
            />
            <Seg
              label={t(l, '偏好寫法', 'Prefer')}
              value={prefer}
              onChange={setPrefer}
              options={[
                { value: 'named', label: t(l, '具名', 'named') },
                { value: 'decimal', label: '&#10;' },
                { value: 'hex', label: '&#x0A;' },
              ]}
            />
          </>
        ) : (
          <Check2
            label={t(l, '容忍缺少分號', 'resolve names without a semicolon')}
            checked={lenient}
            onChange={setLenient}
          />
        )}
        <Btn onClick={() => setText(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
        <ResetButton l={l} onReset={() => setText('')} />
      </Row>

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{count(utf8Length(text))} B</span>}
        rightAside={<span className="inst-no">{count(utf8Length(output))} B</span>}
        left={
          <>
            <Area
              label={
                direction === 'encode'
                  ? t(l, '要轉成實體的文字', 'Text to escape')
                  : t(l, '含實體的 HTML 片段', 'HTML containing entities')
              }
              value={text}
              onChange={setText}
              rows={12}
              placeholder={SAMPLE}
            />

            {direction === 'encode' ? (
              <Note>
                {scope === 'minimal'
                  ? t(
                      l,
                      '最小必要只動 & < > " \' 這五個。頁面已宣告 UTF-8 的話,其餘字元寫成實體只是讓檔案變大而且難讀。',
                      'Minimal touches only & < > " and \'. On a UTF-8 page, escaping anything else just makes the file bigger and harder to read.'
                    )
                  : t(
                      l,
                      '全部非 ASCII 是給「不確定對方用什麼編碼」的場合,例如老系統的 email 模板。代價是中文一個字變六到八個字元。',
                      'Escaping every non-ASCII character is for when you cannot trust the consumer’s encoding — an old email template, say. The cost is six to eight characters per ideograph.'
                    )}
              </Note>
            ) : null}

            {c1 > 0 ? (
              <Note error>
                {t(
                  l,
                  `輸入裡有 ${count(c1)} 個 U+0080–U+009F 控制字元。這些字元沒有任何實體寫法能表達(HTML 會把 &#151; 讀成破折號),所以會原樣留下。通常代表這段文字被當成 latin-1 解碼,其實是 Windows-1252。`,
                  `The input holds ${count(c1)} characters in U+0080–U+009F. No entity can express them — HTML reads &#151; as an em dash — so they are left as they are. Usually it means the text was decoded as latin-1 when it was really Windows-1252.`
                )}
              </Note>
            ) : null}

            {report.unknown.length > 0 ? (
              <Note error>
                {t(
                  l,
                  `這些看起來是實體但表裡沒有,會被當成字面文字:${report.unknown.slice(0, 8).join(' ')}`,
                  `These look like entities but are not in the table, so they stay as literal text: ${report.unknown.slice(0, 8).join(' ')}`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '15rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              aria-live="polite"
            >
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
            {text !== '' ? (
              <Table
                head={[t(l, '輸入裡有', 'found in input'), t(l, '數量', 'count')]}
                rows={[
                  [t(l, '具名實體', 'named references'), count(report.named)],
                  [t(l, '數值實體', 'numeric references'), count(report.numeric)],
                  [t(l, '缺分號', 'missing semicolon'), count(report.missingSemicolon)],
                  [t(l, 'Windows-1252 範圍', 'Windows-1252 range'), count(report.cp1252)],
                ]}
                align={['left', 'right']}
              />
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '實體對照表', 'ENTITY TABLE')}
          aside={
            <span className="inst-no">
              {count(rows.total)} / {count(NAMED_COUNT)}
            </span>
          }
        >
          <Input
            label={t(l, '搜尋名稱、字元或碼位', 'Search by name, character or code point')}
            value={filter}
            onChange={setFilter}
            placeholder="dash, 2014, —"
          />
          {rows.list.length === 0 ? (
            <Note>{t(l, '表裡沒有符合的項目。', 'Nothing in the table matches.')}</Note>
          ) : (
            <Table
              head={[t(l, '字元', 'char'), t(l, '具名', 'named'), t(l, '十進位', 'decimal'), t(l, '十六進位', 'hex')]}
              rows={rows.list.map((row) => [
                <span key={`c${row.cp}`} style={{ fontSize: '1.05em' }}>
                  {row.char}
                </span>,
                `&${row.name};`,
                `&#${row.cp};`,
                `&#x${row.cp.toString(16).toUpperCase()};`,
              ])}
            />
          )}
          {rows.total > rows.list.length ? (
            <Note>
              {t(
                l,
                `還有 ${count(rows.total - rows.list.length)} 筆沒顯示,縮小搜尋條件。`,
                `${count(rows.total - rows.list.length)} more not shown — narrow the search.`
              )}
            </Note>
          ) : null}
          <Note>
            {t(
              l,
              `表格版本:${TABLE_VERSION}。HTML5 另外定義了約兩千個別名(多半是數學符號),這裡沒收——收了會讓這一頁的體積翻倍,而且轉出來的實體反而更少工具讀得懂。`,
              `Table: ${TABLE_VERSION}. HTML5 adds about two thousand more aliases, mostly mathematical; they are not included, because they would double this page and fewer consumers read them back.`
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入', 'in'), v: `${count(utf8Length(text))} B` },
          { k: t(l, '輸出', 'out'), v: `${count(utf8Length(output))} B` },
          { k: t(l, '實體', 'references'), v: count(report.named + report.numeric) },
          { k: t(l, '無法解析', 'unresolved'), v: count(report.unknown.length) },
          { k: t(l, '表內項目', 'table size'), v: count(NAMED_COUNT) },
        ]}
      />
    </div>
  );
}
