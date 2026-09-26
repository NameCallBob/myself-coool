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
import { count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  TARGETS,
  caveatsFor,
  escapeFor,
  unescapeFrom,
  type Quote,
  type Target,
} from './logic';

type Direction = 'escape' | 'unescape';

const ORDER = Object.keys(TARGETS) as Target[];

const SAMPLE = `O'Brien said "hi" — path C:\\tmp\\新建.txt\ntab\there`;

export default function StringEscape({ l }: ToolProps) {
  const [direction, setDirection] = useState<Direction>('escape');
  const [target, setTarget] = useState<Target>('json');
  const [quote, setQuote] = useState<Quote>('double');
  const [asciiOnly, setAsciiOnly] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [text, setText] = useState('');

  const info = TARGETS[target];
  const effectiveQuote = info.quotes.includes(quote) ? quote : info.quotes[0];

  const output = useMemo(
    () =>
      direction === 'escape'
        ? escapeFor(text, target, { quote: effectiveQuote, asciiOnly, wrap })
        : unescapeFrom(text, target),
    [direction, text, target, effectiveQuote, asciiOnly, wrap]
  );

  /** Same text, every target: what you want when you are porting a fixture. */
  const allRows = useMemo(
    () =>
      ORDER.map((entry) => ({
        target: entry,
        value: escapeFor(text, entry, { asciiOnly: asciiOnly && TARGETS[entry].ascii, wrap: true }),
      })),
    [text, asciiOnly]
  );

  const caveats = caveatsFor(target);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'escape', label: t(l, '文字 → 字串常值', 'text to literal') },
            { value: 'unescape', label: t(l, '字串常值 → 文字', 'literal to text') },
          ]}
        />
        <Select
          label={t(l, '目標語言', 'Target')}
          value={target}
          onChange={setTarget}
          options={ORDER.map((entry) => ({ value: entry, label: TARGETS[entry].label }))}
        />
        {direction === 'escape' && info.quotes.length > 1 ? (
          <Seg
            label={t(l, '引號', 'Quote')}
            value={effectiveQuote}
            onChange={setQuote}
            options={info.quotes.map((entry) => ({
              value: entry,
              label: entry === 'single' ? "'…'" : '"…"',
            }))}
          />
        ) : null}
        {direction === 'escape' ? (
          <>
            {info.ascii ? (
              <Check2
                label={t(l, '非 ASCII 全部跳脫', 'escape all non-ASCII')}
                checked={asciiOnly}
                onChange={setAsciiOnly}
              />
            ) : null}
            <Check2 label={t(l, '含外層引號', 'include quotes')} checked={wrap} onChange={setWrap} />
          </>
        ) : null}
        <Btn onClick={() => setText(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
        <ResetButton l={l} onReset={() => setText('')} />
      </Row>

      <Bench
        leftLabel={direction === 'escape' ? t(l, '原始文字', 'TEXT') : t(l, '字串常值', 'LITERAL')}
        rightLabel={direction === 'escape' ? info.label.toUpperCase() : t(l, '原始文字', 'TEXT')}
        leftAside={<span className="inst-no">{count(utf8Length(text))} B</span>}
        rightAside={<span className="inst-no">{count(output.length)} ch</span>}
        left={
          <Area
            label={
              direction === 'escape'
                ? t(l, '貼上要放進程式碼的文字', 'Paste the text you need in code')
                : t(l, '貼上程式碼裡的字串常值(含不含引號都可以)', 'Paste a string literal, with or without its quotes')
            }
            value={text}
            onChange={setText}
            rows={11}
            placeholder={SAMPLE}
          />
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '14rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              aria-live="polite"
            >
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
            {caveats.map((caveat) => (
              <Note key={caveat.en} error={target === 'sql' || target === 'sql-mysql'}>
                {t(l, caveat.zh, caveat.en)}
              </Note>
            ))}
          </>
        }
      />

      {text !== '' && direction === 'escape' ? (
        <div className="mt-8">
          <Panel label={t(l, '同一段文字,每個語言的寫法', 'THE SAME TEXT IN EVERY TARGET')}>
            <Table
              head={[t(l, '語言', 'target'), t(l, '長度', 'chars'), t(l, '字串常值', 'literal')]}
              rows={allRows.map((row) => [
                <button
                  key={`t${row.target}`}
                  type="button"
                  className="inst-btn"
                  aria-pressed={row.target === target}
                  data-primary={row.target === target ? 'true' : undefined}
                  onClick={() => setTarget(row.target)}
                >
                  {TARGETS[row.target].label}
                </button>,
                <span key={`n${row.target}`} className="inst-no">
                  {count(row.value.length)}
                </span>,
                <span key={`v${row.target}`} className="inst-wrap" style={{ whiteSpace: 'pre-wrap' }}>
                  {row.value.length > 400 ? `${row.value.slice(0, 400)}…` : row.value}
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
          { k: t(l, '輸入', 'in'), v: `${count(utf8Length(text))} B` },
          { k: t(l, '輸出字元', 'out chars'), v: count(output.length) },
          {
            k: t(l, '增加', 'growth'),
            v: text.length > 0 ? `+${count(Math.max(0, output.length - text.length))}` : '—',
          },
          { k: t(l, '目標', 'target'), v: info.label },
          { k: t(l, '引號', 'quote'), v: effectiveQuote === 'single' ? "'" : '"' },
        ]}
      />
    </div>
  );
}
