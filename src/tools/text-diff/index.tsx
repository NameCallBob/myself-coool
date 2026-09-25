'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Area, Bench, CopyButton, Note, Readout, ResetButton, Row, Seg } from '@/components/tools/bench';
import { count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  DiffTooLarge,
  countStats,
  diffLines,
  diffWords,
  toRows,
  toUnified,
  type Op,
} from './logic';

/**
 * Two texts, one script of changes.
 *
 * The result is built as React elements rather than an HTML string — the input
 * is someone else's text, and the one thing a diff viewer must never do is
 * interpret it.
 */
export default function TextDiff({ l }: ToolProps) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [unit, setUnit] = useState<'line' | 'word'>('line');

  /**
   * Derived in render, so the readout reports sizes and counts rather than
   * elapsed time — reading a clock during render is impure and React's lint
   * rejects it, correctly: the value would change on every re-render.
   */
  const result = useMemo(() => {
    if (!left && !right) return { ops: [] as Op[], error: null as string | null };
    try {
      const ops = unit === 'line' ? diffLines(left, right) : diffWords(left, right);
      return { ops, error: null };
    } catch (error) {
      const message =
        error instanceof DiffTooLarge
          ? t(
              l,
              `兩段文字的差異太大(${count(error.tokens)} 個片段),逐字比對會算到當掉。先縮小範圍再比。`,
              `Too much has changed (${count(error.tokens)} tokens) to diff without hanging. Compare a smaller range.`
            )
          : error instanceof Error
            ? error.message
            : String(error);
      return { ops: [] as Op[], error: message };
    }
  }, [left, right, unit, l]);

  const stats = useMemo(() => countStats(result.ops, unit), [result.ops, unit]);
  const unified = useMemo(
    () => (unit === 'line' ? toUnified(result.ops) : result.ops.map((op) => op.value).join('')),
    [result.ops, unit]
  );

  const unitName = unit === 'line' ? t(l, '行', 'lines') : t(l, '字', 'words');

  return (
    <div>
      <Bench
        leftLabel={t(l, '原始', 'ORIGINAL')}
        rightLabel={t(l, '修改後', 'CHANGED')}
        leftAside={<span className="inst-no">{count(utf8Length(left))} B</span>}
        rightAside={<span className="inst-no">{count(utf8Length(right))} B</span>}
        left={
          <Area
            label={t(l, '貼上原始版本', 'Paste the original')}
            value={left}
            onChange={setLeft}
            rows={14}
          />
        }
        right={
          <Area
            label={t(l, '貼上修改後版本', 'Paste the changed version')}
            value={right}
            onChange={setRight}
            rows={14}
          />
        }
      />

      <div className="mt-8">
        <div className="inst-pane-label">
          <span>{t(l, '差異', 'DIFF')}</span>
          <span className="inst-no">
            +{count(stats.added)} / −{count(stats.removed)} {unitName}
          </span>
        </div>

        <Row>
          <Seg
            label={t(l, '比對單位', 'Diff unit')}
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'line', label: t(l, '逐行', 'by line') },
              { value: 'word', label: t(l, '逐字', 'by word') },
            ]}
          />
          <CopyButton
            l={l}
            text={unified}
            label={unit === 'line' ? t(l, '複製 unified diff', 'copy unified diff') : t(l, '複製結果', 'copy result')}
          />
          <ResetButton
            l={l}
            onReset={() => {
              setLeft('');
              setRight('');
            }}
          />
        </Row>

        {result.error ? <Note error>{result.error}</Note> : null}

        <div className="inst-out mt-3" aria-live="polite">
          {result.ops.length === 0 && !result.error ? (
            <span style={{ color: 'var(--fg-faint)' }}>
              {left || right
                ? t(l, '兩邊完全相同。', 'The two sides are identical.')
                : t(l, '兩邊都貼上文字後會即時比對。', 'Paste both sides to compare.')}
            </span>
          ) : unit === 'line' ? (
            // One row per line, with the marker in its own column — the shape
            // a diff is actually read in.
            toRows(result.ops).map((row, index) => (
              <div
                key={index}
                className={row.kind === 'insert' ? 'inst-ins' : row.kind === 'delete' ? 'inst-del' : undefined}
                style={{ display: 'flex', gap: '0.75rem', textDecoration: 'none' }}
              >
                <span aria-hidden="true" style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>
                  {row.kind === 'insert' ? '+' : row.kind === 'delete' ? '\u2212' : '\u00b7'}
                </span>
                <span style={{ flex: 1 }}>{row.text || '\u00a0'}</span>
              </div>
            ))
          ) : (
            result.ops.map((op, index) => (
              <span
                key={index}
                className={op.kind === 'insert' ? 'inst-ins' : op.kind === 'delete' ? 'inst-del' : undefined}
              >
                {op.value}
              </span>
            ))
          )}
        </div>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '新增', 'added'), v: `${count(stats.added)} ${unitName}` },
          { k: t(l, '刪除', 'removed'), v: `${count(stats.removed)} ${unitName}` },
          { k: t(l, '未變', 'unchanged'), v: `${count(stats.unchanged)} ${unitName}` },
          { k: t(l, '片段', 'runs'), v: count(result.ops.length) },
        ]}
      />
    </div>
  );
}
