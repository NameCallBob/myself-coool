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
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { DEFAULT_EMIT, convert, factsFor, type From, type Quoting, type To } from './logic';

const SAMPLE = `# 應用設定
NODE_ENV=production
PORT=3000
DATABASE_URL='postgres://user:pa$$word@db:5432/app'
GREETING="第一行\\n第二行"
EMPTY=
FEATURE_FLAGS=a,b,c   # 以逗號分隔`;

export default function DotenvConvert({ l }: ToolProps) {
  const [input, setInput] = useState('');
  const [from, setFrom] = useState<From>('env');
  const [to, setTo] = useState<To>('json');
  const [quoting, setQuoting] = useState<Quoting>('auto');
  const [exportPrefix, setExportPrefix] = useState(false);
  const [sort, setSort] = useState(false);
  const [mask, setMask] = useState(false);

  const result = useMemo(
    () => convert(input, from, to, { ...DEFAULT_EMIT, quoting, exportPrefix, sort, indent: 2 }),
    [input, from, to, quoting, exportPrefix, sort]
  );

  const facts = useMemo(() => factsFor(result.entries), [result.entries]);
  const hidden = '•'.repeat(8);

  return (
    <div>
      <Note>
        {t(
          l,
          '這件工具不寫 localStorage、不寫 URL、不發任何請求。關掉分頁就什麼都不剩;要更保險就開下面的遮蔽顯示。',
          'Nothing is written to localStorage or the URL, and no request is made. Close the tab and nothing remains.'
        )}
      </Note>

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={input ? <span className="inst-no">{bytes(new Blob([input]).size)}</span> : null}
        rightAside={
          result.entries.length > 0 ? (
            <span className="inst-no">
              {count(result.entries.length)} {t(l, '個變數', 'vars')}
            </span>
          ) : null
        }
        left={
          <>
            <Row>
              <Select
                label={t(l, '輸入格式', 'From')}
                value={from}
                onChange={setFrom}
                options={[
                  { value: 'env', label: '.env' },
                  { value: 'json', label: 'JSON' },
                  { value: 'yaml', label: t(l, 'YAML / compose 區塊', 'YAML / compose block') },
                ]}
              />
              <ResetButton l={l} onReset={() => setInput('')} />
              <button type="button" className="inst-btn" onClick={() => setInput(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>
            <Area
              label={
                from === 'env'
                  ? t(l, '貼上 .env 內容', 'Paste .env contents')
                  : from === 'json'
                    ? t(l, '貼上 JSON 物件', 'Paste a JSON object')
                    : t(l, '貼上 environment 區塊', 'Paste an environment block')
              }
              value={input}
              onChange={setInput}
              rows={16}
              placeholder={from === 'env' ? SAMPLE : from === 'json' ? '{ "PORT": "3000" }' : 'environment:\n  PORT: "3000"'}
            />
            {result.problems.length > 0 ? (
              <div className="mt-2">
                {result.problems.slice(0, 12).map((problem, index) => (
                  <Note key={`${problem.line}-${index}`} error>
                    {t(l, `第 ${problem.line} 行:${problem.message}`, `Line ${problem.line}: ${problem.message}`)}
                  </Note>
                ))}
                {result.problems.length > 12 ? (
                  <Note error>
                    {t(l, `還有 ${result.problems.length - 12} 個問題未列出。`, `${result.problems.length - 12} more problems not listed.`)}
                  </Note>
                ) : null}
              </div>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Select
                label={t(l, '輸出格式', 'To')}
                value={to}
                onChange={setTo}
                options={[
                  { value: 'env', label: '.env' },
                  { value: 'json', label: 'JSON' },
                  { value: 'yaml', label: 'YAML' },
                  { value: 'compose-map', label: t(l, 'compose(對映)', 'compose (map)') },
                  { value: 'compose-list', label: t(l, 'compose(清單)', 'compose (list)') },
                  { value: 'shell', label: 'shell export' },
                ]}
              />
              <CopyButton l={l} text={result.output} />
            </Row>
            <Row>
              {to === 'env' ? (
                <Select
                  label={t(l, '引號', 'Quoting')}
                  value={quoting}
                  onChange={setQuoting}
                  options={[
                    { value: 'auto', label: t(l, '需要時才加', 'only when needed') },
                    { value: 'always', label: t(l, '一律加', 'always') },
                    { value: 'never', label: t(l, '一律不加', 'never') },
                  ]}
                />
              ) : null}
              {to === 'env' ? (
                <Check2 label={t(l, '加上 export', 'export prefix')} checked={exportPrefix} onChange={setExportPrefix} />
              ) : null}
              <Check2 label={t(l, '依名稱排序', 'sort by name')} checked={sort} onChange={setSort} />
              <Check2 label={t(l, '遮蔽畫面上的值', 'mask values on screen')} checked={mask} onChange={setMask} />
            </Row>
            <div className="inst-out mt-3" style={{ minHeight: '18rem' }} aria-live="polite">
              {result.output ? (
                mask ? (
                  <span style={{ color: 'var(--fg-faint)' }}>
                    {t(
                      l,
                      `已遮蔽:${count(result.entries.length)} 個變數,${bytes(new Blob([result.output]).size)}。複製按鈕仍會複製真實內容。`,
                      `Masked: ${count(result.entries.length)} variables, ${bytes(new Blob([result.output]).size)}. Copy still copies the real text.`
                    )}
                  </span>
                ) : (
                  result.output
                )
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上內容就會即時轉換。', 'Paste something and it converts as you type.')}
                </span>
              )}
            </div>
            <Note>
              {to === 'shell'
                ? t(
                    l,
                    'shell 輸出一律用單引號並把值裡的單引號拆開跳脫,這是 POSIX shell 唯一不會再解讀內容的寫法。',
                    'Shell output always single-quotes and splits embedded quotes — the only POSIX form with nothing left to interpret.'
                  )
                : to === 'env'
                  ? t(
                      l,
                      '值裡有 $、空白、井號或換行時會加引號;有 $ 時用單引號,避免載入器把它當變數展開。',
                      'Values holding $, spaces, # or newlines get quoted; a $ takes single quotes so no loader expands it.'
                    )
                  : t(
                      l,
                      'YAML 會把看起來像數字、布林、日期的值加上引號,否則讀回來就不是字串了。',
                      'YAML quotes anything that would read back as a number, boolean or date instead of a string.'
                    )}
            </Note>
          </>
        }
      />

      {result.entries.length > 0 ? (
        <div className="mt-6">
          <div className="inst-pane-label">
            <span>{t(l, '變數清單', 'VARIABLES')}</span>
            <span className="inst-no">{count(result.entries.length)}</span>
          </div>
          <Table
            head={[
              t(l, '名稱', 'name'),
              t(l, '原始引號', 'source quoting'),
              t(l, '長度', 'length'),
              t(l, '值', 'value'),
            ]}
            align={['left', 'left', 'right', 'left']}
            rows={result.entries.slice(0, 200).map((entry) => [
              entry.key,
              entry.quoted === 'none' ? '—' : entry.quoted === 'single' ? "' '" : '" "',
              count(entry.value.length),
              mask ? hidden : entry.value.includes('\n') ? entry.value.replace(/\n/g, '\\n') : entry.value,
            ])}
          />
          {result.entries.length > 200 ? (
            <Note>{t(l, '表格只列前 200 筆。', 'Only the first 200 rows are listed.')}</Note>
          ) : null}
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '變數', 'vars'), v: count(facts.count) },
          { k: t(l, '空值', 'empty'), v: count(facts.empty) },
          { k: t(l, '含換行', 'multiline'), v: count(facts.multiline) },
          { k: t(l, '含 $', 'with $'), v: count(facts.withDollar) },
          { k: t(l, '最長值', 'longest'), v: count(facts.longest) },
          { k: t(l, '保存', 'stored'), v: t(l, '不保存', 'nothing') },
        ]}
      />
    </div>
  );
}
