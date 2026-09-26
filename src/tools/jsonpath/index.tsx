'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { SUPPORTED, evaluate, formatMatches, type Shape } from './logic';

const SAMPLE = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "isbn": "0-553-21311-3", "price": 8.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

export default function JsonPath({ l }: ToolProps) {
  const [json, setJson] = useState('');
  const [path, setPath] = useState('$..book[?(@.price < 10)].author');
  const [shape, setShape] = useState<Shape>('values');
  const [indent, setIndent] = useState<'0' | '2'>('2');

  const outcome = useMemo(() => {
    if (json.trim() === '') return null;
    return evaluate(json, path);
  }, [json, path]);

  const output = useMemo(() => {
    if (!outcome || !outcome.ok) return '';
    return formatMatches(outcome.matches, shape, indent === '0' ? 0 : 2);
  }, [outcome, shape, indent]);

  const failed = outcome !== null && !outcome.ok;

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '結果', 'RESULT')}
        leftAside={json ? <span className="inst-no">{bytes(new Blob([json]).size)}</span> : null}
        rightAside={
          outcome?.ok ? (
            <span className="inst-no">
              {count(outcome.matches.length)} {t(l, '筆', 'matches')}
            </span>
          ) : null
        }
        left={
          <>
            <Input
              label={t(l, '查詢路徑', 'Query')}
              value={path}
              onChange={setPath}
              placeholder="$..book[?(@.price < 10)].author"
              invalid={failed && outcome !== null && !outcome.ok && outcome.at !== undefined}
            />
            <Area
              label={t(l, '貼上 JSON', 'Paste JSON')}
              value={json}
              onChange={setJson}
              rows={14}
              placeholder={SAMPLE}
              invalid={failed && outcome !== null && !outcome.ok && outcome.at === undefined}
            />
            <Row>
              <ResetButton
                l={l}
                onReset={() => {
                  setJson('');
                  setPath('$');
                }}
              />
              <button type="button" className="inst-btn" onClick={() => setJson(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>

            {failed && outcome !== null && !outcome.ok ? (
              <div className="mt-3">
                <Note error>
                  {outcome.at === undefined
                    ? t(l, `JSON 讀不進來:${outcome.message}`, `The JSON did not parse: ${outcome.message}`)
                    : t(
                        l,
                        `查詢第 ${outcome.at + 1} 字:${outcome.message}`,
                        `Query offset ${outcome.at}: ${outcome.message}`
                      )}
                </Note>
                {outcome.at !== undefined ? (
                  <pre className="inst-out mt-2" style={{ minHeight: 0 }}>
                    {path}
                    {'\n'}
                    {`${' '.repeat(Math.max(0, Math.min(outcome.at, path.length)))}^`}
                  </pre>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6">
              <div className="inst-pane-label">
                <span>{t(l, '支援的語法', 'SUPPORTED SYNTAX')}</span>
              </div>
              <ul
                className="inst-no"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
                  gap: '0.15rem 1rem',
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  lineHeight: 1.8,
                }}
              >
                {SUPPORTED.map((line) => (
                  <li key={line}>
                    <button
                      type="button"
                      onClick={() => setPath((current) => (current === '$' ? line.split(' ')[0] : current))}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        color: 'var(--fg-muted)',
                        fontFamily: 'inherit',
                      }}
                      title={t(l, '查詢為 $ 時點一下填入', 'Click to fill in when the query is $')}
                    >
                      {line}
                    </button>
                  </li>
                ))}
              </ul>
              <Note>
                {t(
                  l,
                  '不支援的部分:算術運算、正規表達式比對(=~)、自訂函式、括號內的陣列或物件常值。鍵名含連字號時,篩選式裡要寫成 [\'content-type\']。',
                  'Not supported: arithmetic, regex match (=~), custom functions, array/object literals. Inside a filter, a hyphenated key must be written [\'content-type\'].'
                )}
              </Note>
            </div>
          </>
        }
        right={
          <>
            <Row>
              <Seg
                label={t(l, '輸出形式', 'Output shape')}
                value={shape}
                onChange={setShape}
                options={[
                  { value: 'values', label: t(l, '值', 'values') },
                  { value: 'paths', label: t(l, '路徑', 'paths') },
                  { value: 'entries', label: t(l, '路徑+值', 'both') },
                ]}
              />
              <Seg
                label={t(l, '縮排', 'Indent')}
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: '2' },
                  { value: '0', label: t(l, '壓縮', 'min') },
                ]}
              />
              <CopyButton l={l} text={output} />
            </Row>
            <div className="inst-out mt-3" style={{ minHeight: '22rem' }} aria-live="polite">
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {outcome?.ok
                    ? t(l, '這個路徑沒有命中任何節點。', 'This path matched nothing.')
                    : t(l, '貼上 JSON 並輸入路徑。', 'Paste JSON and type a path.')}
                </span>
              )}
            </div>
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '命中', 'matches'), v: outcome?.ok ? count(outcome.matches.length) : '—' },
          { k: t(l, '輸入', 'in'), v: json ? bytes(new Blob([json]).size) : '—' },
          { k: t(l, '輸出', 'out'), v: output ? bytes(new Blob([output]).size) : '—' },
          { k: t(l, '求值器', 'evaluator'), v: t(l, '自寫,無 eval', 'hand-written, no eval') },
        ]}
      />
    </div>
  );
}
