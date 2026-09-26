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
  Seg,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { DEFAULTS, format, minify, statementCount, tokenize, type Casing } from './logic';

const SAMPLE =
  `select o.id, o.created_at, u.email, sum(i.qty * i.price) as total from orders o join users u on u.id = o.user_id left join order_items i on i.order_id = o.id where o.status in ('paid','shipped') and o.created_at >= '2026-01-01' group by o.id, o.created_at, u.email having sum(i.qty * i.price) > 1000 order by total desc limit 50`;

export default function SqlFormat({ l }: ToolProps) {
  const [input, setInput] = useState('');
  const [casing, setCasing] = useState<Casing>('upper');
  const [indent, setIndent] = useState<'2' | '4' | '0'>('2');
  const [width, setWidth] = useState('76');
  const [commaFirst, setCommaFirst] = useState(false);
  const [mode, setMode] = useState<'format' | 'minify'>('format');

  const outcome = useMemo(() => {
    const parsedWidth = Number.parseInt(width, 10);
    return mode === 'minify'
      ? minify(input)
      : format(input, {
          ...DEFAULTS,
          casing,
          indent: Number(indent),
          width: Number.isFinite(parsedWidth) && parsedWidth >= 20 ? parsedWidth : DEFAULTS.width,
          commaFirst,
        });
  }, [input, casing, indent, width, commaFirst, mode]);

  const facts = useMemo(() => {
    if (input.trim() === '') return null;
    try {
      const tokens = tokenize(input);
      return { tokens: tokens.length, statements: statementCount(tokens) };
    } catch {
      return null;
    }
  }, [input]);

  const failed = !outcome.ok && input.trim() !== '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={input ? <span className="inst-no">{bytes(new Blob([input]).size)}</span> : null}
        rightAside={
          outcome.ok ? <span className="inst-no">{count(outcome.sql.split('\n').length)} {t(l, '行', 'lines')}</span> : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上 SQL(可以是一整行)', 'Paste SQL (one long line is fine)')}
              value={input}
              onChange={setInput}
              rows={16}
              placeholder={SAMPLE}
              invalid={failed}
            />
            <Row>
              <ResetButton l={l} onReset={() => setInput('')} />
              <button type="button" className="inst-btn" onClick={() => setInput(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
              <button
                type="button"
                className="inst-btn"
                onClick={() => {
                  if (outcome.ok) setInput(outcome.sql);
                }}
                disabled={!outcome.ok}
              >
                {t(l, '把輸出換回輸入', 'send output back to input')}
              </button>
            </Row>
            {failed ? (
              <Note error>
                {t(l, `讀不完這段 SQL:${outcome.message}`, `Could not read this SQL: ${outcome.message}`)}
              </Note>
            ) : null}
            <Note>
              {t(
                l,
                '這是逐詞排版,不是語法剖析:它認得字串、註解、引號識別字與括號層次,但不判斷 SQL 對不對。遇到沒見過的方言語法只會排得不漂亮,不會改掉內容——輸出的 token 與輸入完全相同,只有空白與關鍵字大小寫變了。',
                'This lays out tokens; it does not parse SQL. It knows strings, comments, quoted identifiers and nesting, but not whether the query is valid. Unfamiliar dialect syntax comes out awkwardly indented, never rewritten: the output holds exactly the input tokens, with only whitespace and keyword casing changed.'
              )}
            </Note>
          </>
        }
        right={
          <>
            <Row>
              <Seg
                label={t(l, '模式', 'Mode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'format', label: t(l, '攤開', 'format') },
                  { value: 'minify', label: t(l, '壓成一行', 'one line') },
                ]}
              />
              <CopyButton l={l} text={outcome.ok ? outcome.sql : ''} />
            </Row>
            {mode === 'format' ? (
              <Row>
                <Seg
                  label={t(l, '關鍵字大小寫', 'Keyword case')}
                  value={casing}
                  onChange={setCasing}
                  options={[
                    { value: 'upper', label: 'UPPER' },
                    { value: 'lower', label: 'lower' },
                    { value: 'preserve', label: t(l, '照原樣', 'as typed') },
                  ]}
                />
                <Seg
                  label={t(l, '縮排', 'Indent')}
                  value={indent}
                  onChange={setIndent}
                  options={[
                    { value: '2', label: '2' },
                    { value: '4', label: '4' },
                    { value: '0', label: 'tab' },
                  ]}
                />
                <Input
                  label={t(l, '換行寬度', 'Wrap width')}
                  value={width}
                  onChange={setWidth}
                  type="number"
                  min={20}
                  max={200}
                />
                <Check2 label={t(l, '逗號放行首', 'comma first')} checked={commaFirst} onChange={setCommaFirst} />
              </Row>
            ) : (
              <Note>
                {t(
                  l,
                  '壓成一行會丟掉註解——註解會吃掉它後面的整行,留著就沒辦法接成一行。',
                  'Minifying drops comments: a comment swallows the rest of its line, so it cannot survive being joined.'
                )}
              </Note>
            )}
            <div className="inst-out mt-3" style={{ minHeight: '22rem' }} aria-live="polite">
              {outcome.ok ? (
                outcome.sql
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上 SQL 就會即時排版。', 'Paste SQL and it is laid out as you type.')}
                </span>
              )}
            </div>
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '語句', 'statements'), v: facts ? count(facts.statements) : '—' },
          { k: t(l, '詞元', 'tokens'), v: facts ? count(facts.tokens) : '—' },
          { k: t(l, '輸出行數', 'lines out'), v: outcome.ok ? count(outcome.sql.split('\n').length) : '—' },
          { k: t(l, '輸入', 'in'), v: input ? bytes(new Blob([input]).size) : '—' },
          { k: t(l, '輸出', 'out'), v: outcome.ok ? bytes(new Blob([outcome.sql]).size) : '—' },
        ]}
      />
    </div>
  );
}
