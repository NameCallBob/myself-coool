'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Area, Bench, CopyButton, Note, Readout, ResetButton, Row, Seg } from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { parseJson, render, sortDeep, toLines, type Indent } from './logic';

const SAMPLE = '{"order":{"id":"A-1029","items":[{"sku":"X1","qty":2}],"paid":true,"note":null}}';

export default function JsonFormat({ l }: ToolProps) {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState<Indent>('2');
  const [sorted, setSorted] = useState(false);
  const [lines, setLines] = useState(false);

  const outcome = useMemo(() => parseJson(input), [input]);

  const output = useMemo(() => {
    if (!outcome.ok) return '';
    const value = sorted ? sortDeep(outcome.value) : outcome.value;
    return lines ? toLines(value) : render(value, indent);
  }, [outcome, indent, sorted, lines]);

  const failed = !outcome.ok && input.trim() !== '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={
          input ? <span className="inst-no">{bytes(new Blob([input]).size)}</span> : null
        }
        rightAside={output ? <span className="inst-no">{bytes(new Blob([output]).size)}</span> : null}
        left={
          <>
            <Area
              label={t(l, '貼上 JSON', 'Paste JSON')}
              value={input}
              onChange={setInput}
              rows={16}
              invalid={failed}
              placeholder={SAMPLE}
            />
            <Row>
              <ResetButton l={l} onReset={() => setInput('')} />
              <button type="button" className="inst-btn" onClick={() => setInput(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>

            {failed && !outcome.ok ? (
              <div className="mt-3">
                <Note error>
                  {outcome.error.line
                    ? t(
                        l,
                        `第 ${outcome.error.line} 行第 ${outcome.error.column} 字:${outcome.error.message}`,
                        `Line ${outcome.error.line}, column ${outcome.error.column}: ${outcome.error.message}`
                      )
                    : outcome.error.message}
                </Note>
                {outcome.error.excerpt ? (
                  <pre className="inst-out mt-2" style={{ minHeight: 0 }}>
                    {outcome.error.excerpt}
                    {'\n'}
                    {`${' '.repeat(Math.max(0, (outcome.error.column ?? 1) - 1))}^`}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Seg
                label={t(l, '縮排', 'Indent')}
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: '2' },
                  { value: '4', label: '4' },
                  { value: 'tab', label: 'tab' },
                  { value: 'min', label: t(l, '壓縮', 'min') },
                ]}
              />
              <CopyButton l={l} text={output} />
            </Row>
            <Row>
              <label className="inst-status" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sorted}
                  onChange={(event) => setSorted(event.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
                  {t(l, '鍵值排序', 'sort keys')}
                </span>
              </label>
              <label className="inst-status" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={lines}
                  onChange={(event) => setLines(event.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
                  {t(l, '每列一筆 (JSONL)', 'one per line (JSONL)')}
                </span>
              </label>
            </Row>
            <div className="inst-out mt-3" style={{ minHeight: '20rem' }} aria-live="polite">
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上有效的 JSON 就會出現在這裡。', 'Valid JSON appears here.')}
                </span>
              )}
            </div>
          </>
        }
      />

      <Readout
        l={l}
        items={
          outcome.ok
            ? [
                { k: t(l, '鍵', 'keys'), v: count(outcome.stats.keys) },
                { k: t(l, '物件', 'objects'), v: count(outcome.stats.objects) },
                { k: t(l, '陣列', 'arrays'), v: count(outcome.stats.arrays) },
                { k: t(l, '巢狀深度', 'depth'), v: count(outcome.stats.depth) },
                { k: t(l, '大小', 'size'), v: bytes(outcome.stats.bytes) },
              ]
            : [{ k: t(l, '狀態', 'status'), v: failed ? t(l, '語法錯誤', 'invalid') : '—' }]
        }
      />
    </div>
  );
}
