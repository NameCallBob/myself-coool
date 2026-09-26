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
import { DEFAULT_EMIT, generate, type Target, type Warning } from './logic';

const SAMPLE = `{
  "id": "A-1029",
  "customer": { "name": "陳小美", "vip": true },
  "items": [
    { "sku": "X1", "qty": 2, "note": "加急" },
    { "sku": "X2", "qty": 1 }
  ],
  "total": 1350,
  "shipped_at": null,
  "tags": []
}`;

const TARGETS: { value: Target; label: string }[] = [
  { value: 'ts', label: 'TypeScript' },
  { value: 'zod', label: 'Zod' },
  { value: 'go', label: 'Go' },
  { value: 'py', label: 'Pydantic' },
];

export default function JsonToTypes({ l }: ToolProps) {
  const [json, setJson] = useState('');
  const [target, setTarget] = useState<Target>('ts');
  const [rootName, setRootName] = useState('Root');
  const [indent, setIndent] = useState<'2' | '4' | '0'>('2');
  const [markOptional, setMarkOptional] = useState(true);

  const outcome = useMemo(
    () =>
      generate(json, target, {
        ...DEFAULT_EMIT,
        rootName: rootName.trim() === '' ? 'Root' : rootName.trim(),
        indent: Number(indent),
        markOptional,
      }),
    [json, target, rootName, indent, markOptional]
  );

  const explain: Record<Warning, string> = {
    'empty-array': t(
      l,
      '樣本裡有空陣列:JSON 沒辦法說空陣列裝什麼,所以元素型別是 unknown / any,請自己補。',
      'The sample has an empty array. JSON cannot say what it holds, so the element type is unknown — fill it in.'
    ),
    'always-null': t(
      l,
      '有欄位在整份樣本裡都是 null:同樣無從得知它有值時是什麼型別,不會替你猜成字串。',
      'A member is null throughout the sample. Its real type is unknowable here and is not guessed as string.'
    ),
    'integer-guess': t(
      l,
      '整數是從樣本推的:JSON 的數字沒有整數與浮點之分,1 與 1.0 寫起來一樣。金額或比率請自己改成浮點。',
      'Integers are inferred: JSON does not distinguish 1 from 1.0. Change money and ratios to a float yourself.'
    ),
    'mixed-union': t(
      l,
      '同一個欄位出現了不同型別,已輸出成聯集(Go 只能給 any)。通常這代表上游資料不一致。',
      'A member appeared with more than one type and became a union (Go gets `any`). Usually the upstream data is inconsistent.'
    ),
  };

  const failed = !outcome.ok && json.trim() !== '';

  return (
    <div>
      <Bench
        leftLabel={t(l, 'JSON 樣本', 'JSON SAMPLE')}
        rightLabel={t(l, '型別宣告', 'DECLARATION')}
        leftAside={json ? <span className="inst-no">{bytes(new Blob([json]).size)}</span> : null}
        rightAside={
          outcome.ok ? (
            <span className="inst-no">
              {count(outcome.fields)} {t(l, '個欄位', 'members')}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上一份代表性的 JSON', 'Paste a representative JSON sample')}
              hint={t(
                l,
                '陣列裡的每一筆都會合併推論:某筆缺的欄位會標成選填,而不是只看第一筆。形狀相同的物件共用一個型別名稱,所以 from 與 to 這種同形狀的欄位會宣告成同一個型別。',
                'Every array element is merged: a member missing from any of them comes out optional. Objects with the same shape share one declared name, so same-shaped members like from and to come out as the same type.'
              )}
              value={json}
              onChange={setJson}
              rows={18}
              placeholder={SAMPLE}
              invalid={failed}
            />
            <Row>
              <ResetButton l={l} onReset={() => setJson('')} />
              <button type="button" className="inst-btn" onClick={() => setJson(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>
            {failed ? (
              <Note error>
                {t(l, `JSON 讀不進來:${outcome.message}`, `The JSON did not parse: ${outcome.message}`)}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Seg label={t(l, '輸出語言', 'Target')} value={target} onChange={setTarget} options={TARGETS} />
              <CopyButton l={l} text={outcome.ok ? outcome.code : ''} />
            </Row>
            <Row>
              <Input label={t(l, '根型別名稱', 'Root name')} value={rootName} onChange={setRootName} placeholder="Root" />
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
              <Check2
                label={t(l, '標記選填欄位', 'mark optional members')}
                checked={markOptional}
                onChange={setMarkOptional}
              />
            </Row>
            <div className="inst-out mt-3" style={{ minHeight: '24rem' }} aria-live="polite">
              {outcome.ok ? (
                outcome.code
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上 JSON 就會出現型別宣告。', 'Paste JSON and the declaration appears here.')}
                </span>
              )}
            </div>
            {target === 'go' ? (
              <Note>
                {t(
                  l,
                  'Go 的欄位名依官方風格把 id、url、api 之類縮寫全大寫;可為 null 的純量給指標,聯集只能給 any。',
                  'Go field names upper-case known initialisms (id, url, api…). Nullable scalars become pointers; unions become `any`.'
                )}
              </Note>
            ) : null}
            {target === 'py' ? (
              <Note>
                {t(
                  l,
                  '輸出的是 Pydantic v2 寫法:鍵名不是合法 Python 名稱時用 Field(alias=...),並打開 populate_by_name。',
                  'Pydantic v2: keys that are not valid Python names get Field(alias=…) with populate_by_name enabled.'
                )}
              </Note>
            ) : null}
            {outcome.ok && outcome.warnings.length > 0 ? (
              <div className="mt-3">
                {outcome.warnings.map((warning) => (
                  <Note key={warning}>{explain[warning]}</Note>
                ))}
              </div>
            ) : null}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '欄位', 'members'), v: outcome.ok ? count(outcome.fields) : '—' },
          { k: t(l, '待確認', 'caveats'), v: outcome.ok ? count(outcome.warnings.length) : '—' },
          { k: t(l, '輸入', 'in'), v: json ? bytes(new Blob([json]).size) : '—' },
          { k: t(l, '輸出', 'out'), v: outcome.ok ? bytes(new Blob([outcome.code]).size) : '—' },
        ]}
      />
    </div>
  );
}
