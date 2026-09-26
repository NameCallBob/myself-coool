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
import { DEFAULTS, DiffTooBig, compare, formatChanges, type ArrayMode, type Change } from './logic';

const LEFT_SAMPLE = `{
  "id": "A-1029",
  "paid": true,
  "total": 1200,
  "items": [
    { "sku": "X1", "qty": 2 },
    { "sku": "X2", "qty": 1 }
  ],
  "note": null
}`;

const RIGHT_SAMPLE = `{
  "id": "A-1029",
  "paid": "true",
  "total": 1350,
  "items": [
    { "sku": "X1", "qty": 3 },
    { "sku": "X2", "qty": 1 },
    { "sku": "X9", "qty": 1 }
  ],
  "shipped": "2026-09-01"
}`;

const MARK: Record<Change['kind'], string> = { add: '+', remove: '−', retype: '!', change: '~' };

/** Colour is never the only signal: every row carries its mark and its kind. */
const TONE: Record<Change['kind'], string | undefined> = {
  add: 'var(--data-teal)',
  remove: 'var(--accent)',
  retype: 'var(--accent)',
  change: undefined,
};

function show(value: unknown): string {
  const text = JSON.stringify(value) ?? '—';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export default function JsonDiff({ l }: ToolProps) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [arrayMode, setArrayMode] = useState<ArrayMode>('index');
  const [keyField, setKeyField] = useState(DEFAULTS.keyField);
  const [tolerance, setTolerance] = useState('0');
  const [nullIsAbsent, setNullIsAbsent] = useState(false);

  const result = useMemo(() => {
    if (left.trim() === '' && right.trim() === '') return null;
    const parsed = Number(tolerance);
    try {
      return compare(left, right, {
        arrayMode,
        keyField: keyField.trim() === '' ? DEFAULTS.keyField : keyField.trim(),
        tolerance: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
        nullIsAbsent,
      });
    } catch (error) {
      return {
        ok: false as const,
        side: 'both' as const,
        message:
          error instanceof DiffTooBig
            ? t(
                l,
                error.reason === 'depth'
                  ? '兩份文件的巢狀太深,超過 300 層就停下來了。'
                  : '差異超過兩萬筆,已停止比對。先縮小輸入或改用「集合」模式。',
                error.message
              )
            : String(error),
      };
    }
  }, [left, right, arrayMode, keyField, tolerance, nullIsAbsent, l]);

  const changes = result?.ok ? result.changes : [];
  const kindName: Record<Change['kind'], string> = {
    add: t(l, '新增', 'added'),
    remove: t(l, '刪除', 'removed'),
    retype: t(l, '型別改變', 'retyped'),
    change: t(l, '值改變', 'changed'),
  };

  return (
    <div>
      <Bench
        leftLabel={t(l, '左邊(舊)', 'LEFT (OLD)')}
        rightLabel={t(l, '右邊(新)', 'RIGHT (NEW)')}
        leftAside={left ? <span className="inst-no">{bytes(new Blob([left]).size)}</span> : null}
        rightAside={right ? <span className="inst-no">{bytes(new Blob([right]).size)}</span> : null}
        left={
          <Area
            label={t(l, '貼上舊版 JSON', 'Paste the old JSON')}
            value={left}
            onChange={setLeft}
            rows={16}
            placeholder={LEFT_SAMPLE}
            invalid={result !== null && !result.ok && (result.side === 'left' || result.side === 'both')}
          />
        }
        right={
          <Area
            label={t(l, '貼上新版 JSON', 'Paste the new JSON')}
            value={right}
            onChange={setRight}
            rows={16}
            placeholder={RIGHT_SAMPLE}
            invalid={result !== null && !result.ok && (result.side === 'right' || result.side === 'both')}
          />
        }
      />

      <Row>
        <Seg
          label={t(l, '陣列比對方式', 'Array comparison')}
          value={arrayMode}
          onChange={setArrayMode}
          options={[
            { value: 'index', label: t(l, '依位置', 'by index') },
            { value: 'key', label: t(l, '依鍵值', 'by key') },
            { value: 'bag', label: t(l, '當集合', 'as a bag') },
          ]}
        />
        {arrayMode === 'key' ? (
          <Input label={t(l, '配對欄位', 'Key field')} value={keyField} onChange={setKeyField} placeholder="id" />
        ) : null}
        <Input
          label={t(l, '數值容差', 'Number tolerance')}
          value={tolerance}
          onChange={setTolerance}
          type="text"
          placeholder="0"
        />
        <Check2
          label={t(l, 'null 等於沒有這個欄位', 'null counts as absent')}
          checked={nullIsAbsent}
          onChange={setNullIsAbsent}
        />
        <button
          type="button"
          className="inst-btn"
          onClick={() => {
            setLeft(LEFT_SAMPLE);
            setRight(RIGHT_SAMPLE);
          }}
        >
          {t(l, '放入範例', 'load sample')}
        </button>
        <CopyButton l={l} text={formatChanges(changes)} label={t(l, '複製差異', 'copy diff')} />
        <ResetButton
          l={l}
          onReset={() => {
            setLeft('');
            setRight('');
          }}
        />
      </Row>

      <Note>
        {arrayMode === 'index'
          ? t(
              l,
              '依位置:第 n 個對第 n 個。在開頭插入一筆會讓後面每一筆都被報成改變,這是位置比對的實話。',
              'By index: element n against element n. Inserting at the front reports everything after it.'
            )
          : arrayMode === 'key'
            ? t(
                l,
                `依鍵值:用 ${keyField || 'id'} 配對,搬動位置不算改變。沒有這個欄位的元素改回依位置比。`,
                `By key: paired on ${keyField || 'id'}; moved elements are not changes. Elements without the field fall back to position.`
              )
            : t(
                l,
                '當集合:只看多了什麼、少了什麼,順序完全不看,也不會報告元素內部的差異。',
                'As a bag: only what appeared or vanished. Order is ignored and inner differences are not reported.'
              )}
      </Note>

      {result !== null && !result.ok ? (
        <Note error>
          {result.side === 'both'
            ? result.message
            : t(
                l,
                `${result.side === 'left' ? '左邊' : '右邊'}不是有效的 JSON:${result.message}`,
                `The ${result.side} side is not valid JSON: ${result.message}`
              )}
        </Note>
      ) : null}

      <div className="mt-6">
        <div className="inst-pane-label">
          <span>{t(l, '差異', 'DIFFERENCES')}</span>
          <span className="inst-no">
            {result?.ok
              ? `+${count(result.summary.add)} −${count(result.summary.remove)} !${count(result.summary.retype)} ~${count(result.summary.change)}`
              : '—'}
          </span>
        </div>
        <div className="inst-out" style={{ minHeight: '12rem' }} aria-live="polite">
          {changes.length === 0 ? (
            <span style={{ color: 'var(--fg-faint)' }}>
              {result?.ok
                ? t(l, '兩份文件在結構上完全相同。', 'The two documents are structurally identical.')
                : t(l, '兩邊都貼上 JSON 後會即時比對。', 'Paste JSON on both sides to compare.')}
            </span>
          ) : (
            changes.map((change, index) => (
              <div key={`${change.path}-${index}`} style={{ display: 'flex', gap: '0.75rem' }}>
                <span aria-hidden="true" style={{ color: TONE[change.kind] ?? 'var(--fg-faint)', userSelect: 'none' }}>
                  {MARK[change.kind]}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ color: 'var(--fg-muted)' }}>{change.path}</span>{' '}
                  <span className="inst-no">[{kindName[change.kind]}]</span>{' '}
                  {change.kind === 'add' ? (
                    show(change.right)
                  ) : change.kind === 'remove' ? (
                    show(change.left)
                  ) : (
                    <>
                      {show(change.left)} <span style={{ color: 'var(--fg-faint)' }}>{'→'}</span>{' '}
                      {show(change.right)}
                      {change.kind === 'retype' ? (
                        <span className="inst-no">
                          {' '}
                          ({change.leftType} {'→'} {change.rightType})
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '新增', 'added'), v: result?.ok ? count(result.summary.add) : '—' },
          { k: t(l, '刪除', 'removed'), v: result?.ok ? count(result.summary.remove) : '—' },
          { k: t(l, '型別改變', 'retyped'), v: result?.ok ? count(result.summary.retype) : '—' },
          { k: t(l, '值改變', 'changed'), v: result?.ok ? count(result.summary.change) : '—' },
        ]}
      />
    </div>
  );
}
