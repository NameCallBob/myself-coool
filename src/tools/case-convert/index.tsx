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
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  CASE_STYLES,
  NAMING_STYLES,
  SMALL_WORDS,
  convertAll,
  splitWords,
  type CaseStyle,
  type Options,
} from './logic';

const SAMPLE = 'parse HTTP response';

/** Label and example per style. The example is what the style looks like. */
const SHAPE: Record<CaseStyle, string> = {
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  kebab: 'kebab-case',
  constant: 'CONSTANT_CASE',
  dot: 'dot.case',
  path: 'path/case',
  train: 'Train-Case',
  lower: 'lower case',
  upper: 'UPPER CASE',
  sentence: 'Sentence case',
  title: 'Title Case',
};

export default function CaseConvert({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [splitDigits, setSplitDigits] = useState(false);
  const [preserveAcronyms, setPreserveAcronyms] = useState(true);
  const [smallWords, setSmallWords] = useState(SMALL_WORDS.join(' '));

  const options: Options = useMemo(
    () => ({
      splitDigits,
      preserveAcronyms,
      smallWords: smallWords.split(/[\s,]+/).filter((word) => word !== ''),
    }),
    [splitDigits, preserveAcronyms, smallWords]
  );

  const results = useMemo(() => convertAll(text, options), [text, options]);
  const words = useMemo(() => splitWords(text.split('\n')[0] ?? '', options), [text, options]);

  const naming = results.filter((entry) => NAMING_STYLES.includes(entry.style));
  const prose = results.filter((entry) => !NAMING_STYLES.includes(entry.style));

  const rowsFor = (entries: typeof results) =>
    entries.map((entry) => [
      <span key={`${entry.style}-shape`} className="inst-no">
        {SHAPE[entry.style]}
      </span>,
      <span key={`${entry.style}-text`} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
        {entry.text || ' '}
      </span>,
      <CopyButton key={`${entry.style}-copy`} l={l} text={entry.text} />,
    ]);

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '命名式', 'NAMING STYLES')}
        leftAside={
          words.length > 0 ? (
            <span className="inst-no">
              {count(words.length)} {t(l, '詞', 'words')}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上文字或識別字', 'Paste text or an identifier')}
              value={text}
              onChange={setText}
              rows={8}
              placeholder={SAMPLE}
              hint={t(
                l,
                '一行一筆:命名式會逐行轉換,不會把整段黏成一個識別字。',
                'One item per line — naming styles convert line by line.'
              )}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button type="button" className="inst-btn" onClick={() => setText(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>

            <div className="inst-pane-label mt-6">
              <span>{t(l, '斷詞方式', 'WORD SPLITTING')}</span>
            </div>
            <Row>
              <Check2
                label={t(
                  l,
                  '保留原有大寫(HTTP 不變成 Http,iPhone 不變成 Iphone)',
                  'keep the capitals as typed (HTTP not Http, iPhone not Iphone)'
                )}
                checked={preserveAcronyms}
                onChange={setPreserveAcronyms}
              />
            </Row>
            <Row>
              <Check2
                label={t(l, '數字自成一詞(utf8 → utf_8)', 'digits are their own word (utf8 → utf_8)')}
                checked={splitDigits}
                onChange={setSplitDigits}
              />
            </Row>
            {text ? (
              <Note>
                {t(l, '第一行斷詞結果:', 'First line splits as: ')}
                <span className="inst-no">{words.join(' · ') || t(l, '(沒有詞)', '(no words)')}</span>
              </Note>
            ) : null}

            <div className="inst-pane-label mt-6">
              <span>{t(l, '標題式小寫詞', 'TITLE CASE SMALL WORDS')}</span>
              <span className="inst-no">{count(options.smallWords?.length ?? 0)}</span>
            </div>
            <Input
              label={t(l, '這些詞在標題中不大寫(首尾除外)', 'Left lowercase in a title, unless first or last')}
              value={smallWords}
              onChange={setSmallWords}
              hint={t(
                l,
                'AP、Chicago 與各家報社的規則本來就不一致,預設是 AP 風格,改成貴公司的就好。',
                'AP, Chicago and every newspaper disagree. This is the AP-ish list — edit it to your house style.'
              )}
            />
            <Row>
              <button
                type="button"
                className="inst-btn"
                onClick={() => setSmallWords(SMALL_WORDS.join(' '))}
              >
                {t(l, '還原預設清單', 'restore default list')}
              </button>
            </Row>
          </>
        }
        right={
          <div aria-live="polite">
            <Table
              head={[t(l, '樣式', 'style'), t(l, '結果', 'result'), '']}
              rows={rowsFor(naming)}
            />

            <div className="inst-pane-label mt-6">
              <span>{t(l, '文句式', 'PROSE STYLES')}</span>
            </div>
            <Table
              head={[t(l, '樣式', 'style'), t(l, '結果', 'result'), '']}
              rows={rowsFor(prose)}
            />
            <Note>
              {t(
                l,
                '文句式保留標點與換行,只改字母;命名式會把標點當成分隔符丟掉。',
                'Prose styles keep punctuation and line breaks; naming styles treat punctuation as a delimiter and drop it.'
              )}
            </Note>
          </div>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入行', 'lines'), v: count(text === '' ? 0 : text.split('\n').length) },
          { k: t(l, '首行詞數', 'words in line 1'), v: count(words.length) },
          { k: t(l, '輸出樣式', 'styles'), v: count(CASE_STYLES.length) },
          {
            k: t(l, '小寫詞表', 'small words'),
            v: count(options.smallWords?.length ?? 0),
          },
        ]}
      />
    </div>
  );
}
