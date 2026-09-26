'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  DEFAULT_RATES,
  analyze,
  formatDuration,
  frequency,
  readingTime,
} from './logic';

/**
 * Counts and a reading time, with the two writing systems kept apart.
 *
 * The rates are inputs rather than constants: every published reading-speed
 * figure disagrees with the next one, so the number that matters is the one the
 * reader sets for themselves.
 */
export default function TextStats({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [cjkRate, setCjkRate] = useState(String(DEFAULT_RATES.cjkPerMinute));
  const [wordRate, setWordRate] = useState(String(DEFAULT_RATES.wordsPerMinute));
  const [showFrequency, setShowFrequency] = useState(false);
  const [foldCase, setFoldCase] = useState(true);

  const counts = useMemo(() => analyze(text), [text]);

  const rates = {
    cjkPerMinute: Number(cjkRate) > 0 ? Number(cjkRate) : DEFAULT_RATES.cjkPerMinute,
    wordsPerMinute: Number(wordRate) > 0 ? Number(wordRate) : DEFAULT_RATES.wordsPerMinute,
  };
  const reading = readingTime(counts, rates);

  const top = useMemo(
    () => (showFrequency ? frequency(text, { limit: 20, ignoreCase: foldCase }) : []),
    [showFrequency, foldCase, text]
  );

  const zh = l !== 'en';
  const words = counts.latinWords + counts.numbers;

  /** The count table. Labels say which definition of "character" is meant. */
  const rows: [string, string, string][] = [
    [
      t(l, '字元(字面)', 'Characters (graphemes)'),
      count(counts.graphemes),
      t(l, '使用者看到的一個字,emoji 家族算一個', 'What a reader sees; an emoji family is one'),
    ],
    [
      t(l, '字元(碼點)', 'Characters (code points)'),
      count(counts.codePoints),
      t(l, 'Unicode 碼點數', 'Unicode code points'),
    ],
    [
      t(l, '長度(UTF-16)', 'Length (UTF-16)'),
      count(counts.utf16),
      t(l, 'JavaScript 的 .length,多數資料庫欄位上限講的是這個', 'JavaScript .length — usually what a column limit means'),
    ],
    [t(l, 'UTF-8 位元組', 'UTF-8 bytes'), bytes(counts.utf8Bytes), t(l, '傳輸與儲存的實際大小', 'Real size on the wire')],
    [t(l, '不含空白', 'Without whitespace'), count(counts.visible), t(l, '扣掉空白與換行的碼點', 'Code points minus whitespace')],
    [t(l, '中日韓字', 'CJK characters'), count(counts.cjk), t(l, '漢字、假名、諺文,逐字計算', 'Han, kana, hangul — counted per character')],
    [t(l, '全形標點', 'CJK punctuation'), count(counts.cjkPunct), t(l, '與「字」分開算', 'Counted apart from 字')],
    [t(l, '英文字', 'Latin words'), count(counts.latinWords), t(l, '以空白分隔的詞', 'Whitespace-delimited tokens')],
    [t(l, '數字', 'Numbers'), count(counts.numbers), t(l, '純數字的詞,含 3.14 與 1,000', 'Numeric tokens, 3.14 and 1,000 included')],
    [t(l, '行', 'Lines'), count(counts.lines), t(l, 'CRLF 與 LF 視為相同', 'CRLF and LF treated alike')],
    [t(l, '空行', 'Blank lines'), count(counts.blankLines), ''],
    [t(l, '段', 'Paragraphs'), count(counts.paragraphs), t(l, '以空行分隔的區塊', 'Blocks separated by a blank line')],
    [t(l, '句', 'Sentences'), count(counts.sentences), t(l, '句末標點的數量,見下方說明', 'Terminator count — see the note below')],
  ];

  const summary = rows.map(([k, v]) => `${k}\t${v}`).join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '計數', 'COUNTS')}
        leftAside={text ? <span className="inst-no">{bytes(counts.utf8Bytes)}</span> : null}
        rightAside={
          text ? (
            <span className="inst-no">
              {t(l, '約', 'about')} {formatDuration(reading.seconds, zh)}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上文字', 'Paste text')}
              value={text}
              onChange={setText}
              rows={18}
              placeholder={t(l, '中英混排也可以,兩種文字會分開計算。', 'Mixed CJK and Latin is fine — they are counted separately.')}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <CopyButton l={l} text={summary} label={t(l, '複製計數', 'copy counts')} />
            </Row>
            {counts.truncated ? (
              <Note error>
                {t(
                  l,
                  '文字超過 200 萬字元,只計算前 200 萬。再往下算會讓分頁沒反應。',
                  'Over two million characters — only the first two million are counted, to keep the tab responsive.'
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'measure'), t(l, '數', 'value'), t(l, '定義', 'definition')]}
                rows={rows.map(([k, v, note]) => [
                  k,
                  <span key={k} className="inst-no">
                    {v}
                  </span>,
                  <span key={`${k}-note`} style={{ color: 'var(--fg-faint)' }}>
                    {note}
                  </span>,
                ])}
                align={['left', 'right', 'left']}
              />
            </div>

            <div className="inst-pane-label mt-6">
              <span>{t(l, '閱讀時間', 'READING TIME')}</span>
              <span className="inst-no">{formatDuration(reading.seconds, zh)}</span>
            </div>
            <Row>
              <Input
                label={t(l, '中文 字/分', 'CJK chars/min')}
                type="number"
                min={1}
                max={2000}
                value={cjkRate}
                onChange={setCjkRate}
              />
              <Input
                label={t(l, '英文 詞/分', 'Latin words/min')}
                type="number"
                min={1}
                max={2000}
                value={wordRate}
                onChange={setWordRate}
              />
            </Row>
            <Table
              head={[t(l, '文字', 'script'), t(l, '量', 'amount'), t(l, '速率', 'rate'), t(l, '時間', 'time')]}
              rows={[
                [
                  t(l, '中日韓', 'CJK'),
                  <span key="cjk-n" className="inst-no">{count(counts.cjk)}</span>,
                  <span key="cjk-r" className="inst-no">{count(rates.cjkPerMinute)}/min</span>,
                  <span key="cjk-t" className="inst-no">{formatDuration(reading.cjkSeconds, zh)}</span>,
                ],
                [
                  t(l, '英文與數字', 'Latin & numbers'),
                  <span key="lat-n" className="inst-no">{count(words)}</span>,
                  <span key="lat-r" className="inst-no">{count(rates.wordsPerMinute)}/min</span>,
                  <span key="lat-t" className="inst-no">{formatDuration(reading.latinSeconds, zh)}</span>,
                ],
              ]}
              align={['left', 'right', 'right', 'right']}
            />
            <Note>
              {t(
                l,
                '預設 300 字/分與 200 詞/分是保守的默讀速度。朗讀大約是這個的六成,改上面的數字即可。',
                'The defaults are conservative silent-reading rates. Reading aloud is roughly 60% of that — change the numbers above.'
              )}
            </Note>

            <div className="inst-pane-label mt-6">
              <span>{t(l, '詞頻', 'FREQUENCY')}</span>
            </div>
            <Row>
              <Check2
                label={t(l, '計算前 20 名', 'top 20 tokens')}
                checked={showFrequency}
                onChange={setShowFrequency}
              />
              <Check2
                label={t(l, '不分大小寫', 'fold case')}
                checked={foldCase}
                onChange={setFoldCase}
              />
            </Row>
            {showFrequency ? (
              top.length === 0 ? (
                <Note>{t(l, '沒有可計算的詞。', 'Nothing to count yet.')}</Note>
              ) : (
                <Table
                  head={[t(l, '詞', 'token'), t(l, '次', 'n'), t(l, '占比', 'share')]}
                  rows={top.map((entry) => [
                    <span key={entry.token} className="inst-wrap">{entry.token}</span>,
                    <span key={`${entry.token}-n`} className="inst-no">{count(entry.n)}</span>,
                    <span key={`${entry.token}-s`} className="inst-no">
                      {(entry.share * 100).toFixed(1)}%
                    </span>,
                  ])}
                  align={['left', 'right', 'right']}
                />
              )
            ) : (
              <Note>
                {t(
                  l,
                  '中文沒有分詞表可用,所以中文以單字計,英文以詞計。',
                  'No segmentation dictionary here, so CJK is counted per character and Latin per word.'
                )}
              </Note>
            )}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '字元', 'chars'), v: count(counts.graphemes) },
          { k: t(l, '中日韓', 'cjk'), v: count(counts.cjk) },
          { k: t(l, '英文字', 'words'), v: count(words) },
          { k: t(l, '行', 'lines'), v: count(counts.lines) },
          { k: 'UTF-8', v: bytes(counts.utf8Bytes) },
          { k: t(l, '閱讀', 'reading'), v: formatDuration(reading.seconds, zh) },
        ]}
      />
    </div>
  );
}
