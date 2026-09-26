'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import {
  DIMENSIONS,
  convert,
  convertAll,
  dimension,
  formatQuantity,
  parseAmount,
  type DimensionId,
  type Unit,
} from './logic';

/** Sensible opening pair per dimension — the conversion people arrive wanting. */
const DEFAULT_PAIR: Record<DimensionId, [string, string]> = {
  length: ['cm', 'in'],
  mass: ['kg', 'jin'],
  temperature: ['C', 'F'],
  area: ['m2', 'ping'],
  volume: ['mL', 'floz_us'],
  speed: ['km_h', 'mph'],
  pressure: ['psi', 'kgf_cm2'],
  data: ['GB', 'GiB'],
  energy: ['kWh', 'kcal'],
};

const unitLabel = (u: Unit, l: 'zh' | 'en') =>
  l === 'en' ? `${u.en} (${u.id})` : `${u.zh} ${u.id}`;

export default function UnitConvert({ l }: ToolProps) {
  const [dim, setDim] = useState<DimensionId>('length');
  const [amount, setAmount] = useState('1');
  const [pair, setPair] = useState<Record<DimensionId, [string, string]>>(DEFAULT_PAIR);

  const [from, to] = pair[dim];
  const value = parseAmount(amount);
  const active = dimension(dim);

  const rows = useMemo(
    () => (Number.isNaN(value) ? [] : convertAll(dim, from, value)),
    [dim, from, value]
  );

  const result = Number.isNaN(value) ? Number.NaN : convert(dim, from, to, value);
  const fromUnit = active.units.find((u) => u.id === from)!;
  const toUnit = active.units.find((u) => u.id === to)!;

  const setPairFor = (next: [string, string]) =>
    setPair((previous) => ({ ...previous, [dim]: next }));

  const options = active.units.map((u) => ({ value: u.id, label: unitLabel(u, l) }));

  const approximate = fromUnit.approx || toUnit.approx;

  return (
    <div>
      <div className="inst-field">
        <span className="inst-label">{t(l, '量的種類', 'Quantity')}</span>
        <div className="inst-toolbar">
          {DIMENSIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="inst-btn"
              aria-pressed={entry.id === dim}
              data-primary={entry.id === dim ? 'true' : undefined}
              onClick={() => setDim(entry.id)}
            >
              {l === 'en' ? entry.en : entry.zh}
            </button>
          ))}
        </div>
      </div>

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '結果', 'RESULT')}
        rightAside={
          approximate ? (
            <span className="inst-no" style={{ color: 'var(--accent)' }}>
              {t(l, '定義為約定值', 'nominal definition')}
            </span>
          ) : (
            <span className="inst-no">{t(l, '比值為定義值', 'exact by definition')}</span>
          )
        }
        left={
          <>
            <Input
              label={t(l, '數量', 'Amount')}
              value={amount}
              onChange={setAmount}
              placeholder="1"
              invalid={amount.trim() !== '' && Number.isNaN(value)}
              hint={t(
                l,
                '可以貼千分位、全形數字或 1.5e3 這種寫法。逗號與空白只認三位一組的千分位,「1 2」會被當成打錯而不是 12。',
                'Thousands separators, full-width digits and 1.5e3 all parse. A comma or space is only read as grouping in threes, so "1 2" is refused rather than read as 12.'
              )}
            />
            <Select
              label={t(l, '從', 'From')}
              value={from}
              options={options}
              onChange={(next) => setPairFor([next, to])}
            />
            <Select
              label={t(l, '到', 'To')}
              value={to}
              options={options}
              onChange={(next) => setPairFor([from, next])}
            />
            <Row>
              <button
                type="button"
                className="inst-btn"
                onClick={() => setPairFor([to, from])}
              >
                {t(l, '對調兩邊', 'swap')}
              </button>
              <CopyButton l={l} text={Number.isFinite(result) ? formatQuantity(result) : ''} />
            </Row>
            {amount.trim() !== '' && Number.isNaN(value) ? (
              <Note error>{t(l, '這串字看不出是數字。', 'That is not a number.')}</Note>
            ) : null}
          </>
        }
        right={
          <>
            <div
              className="inst-out"
              aria-live="polite"
              style={{ fontSize: '1.375rem', lineHeight: 1.4 }}
            >
              {Number.isFinite(result) ? (
                <>
                  {formatQuantity(result, true)}{' '}
                  <span style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem' }}>
                    {l === 'en' ? toUnit.en : toUnit.zh}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--fg-faint)', fontSize: '0.8125rem' }}>
                  {fromUnit.reciprocal && value <= 0
                    ? t(l, '配速要大於零才對應到一個速度。', 'A pace must be greater than zero.')
                    : t(l, '填一個數量。', 'Enter an amount.')}
                </span>
              )}
            </div>
            <Note>
              1 {l === 'en' ? fromUnit.en : fromUnit.zh} ={' '}
              {formatQuantity(convert(dim, from, to, 1))} {l === 'en' ? toUnit.en : toUnit.zh}
              {fromUnit.reciprocal || toUnit.reciprocal
                ? t(l, '(配速與速度成反比,不是倍數關係)', ' (pace is inverse to speed, not a multiple)')
                : ''}
            </Note>
            {dim === 'temperature' ? (
              <Note>
                {t(
                  l,
                  '溫度是位移加縮放,不是倍數。20°C 不是 10°C 的兩倍熱,所以溫差要用「差值」換算:差 1°C 等於差 1.8°F。',
                  'Temperature is affine, not proportional: 20°C is not twice 10°C. A difference of 1°C is a difference of 1.8°F.'
                )}
              </Note>
            ) : null}
            {dim === 'data' ? (
              <Note>
                {t(
                  l,
                  '硬碟標示用 10 的次方(GB),作業系統多半用 2 的次方(GiB)顯示,這就是 1 TB 的碟看起來只有 931 GB 的原因。',
                  'Drive labels use powers of ten (GB) while operating systems mostly report powers of two (GiB) — which is why a 1 TB disk shows as 931 GB.'
                )}
              </Note>
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '同一量的所有單位', 'THE WHOLE DIMENSION')}
          aside={
            <span className="inst-no">
              {t(l, '基準', 'base')} {active.base}
            </span>
          }
        >
          {rows.length === 0 ? (
            <Note>{t(l, '填入數量後這張表會一起更新。', 'Enter an amount to fill this table.')}</Note>
          ) : (
            <Table
              head={[t(l, '單位', 'unit'), t(l, '數值', 'value'), t(l, '符號', 'symbol'), '']}
              align={['left', 'right', 'left', 'left']}
              rows={rows.map((row) => [
                <span
                  key="n"
                  style={{
                    color: row.unit.id === to ? 'var(--accent)' : undefined,
                    fontWeight: row.unit.id === to ? 500 : undefined,
                  }}
                >
                  {l === 'en' ? row.unit.en : row.unit.zh}
                </span>,
                <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {formatQuantity(row.value, true)}
                </span>,
                <span key="s" className="inst-no">
                  {row.unit.id}
                </span>,
                <span key="f" className="inst-no">
                  {row.unit.id === from ? t(l, '來源', 'source') : ''}
                  {row.unit.approx ? t(l, '約定值', 'nominal') : ''}
                </span>,
              ])}
            />
          )}
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '量', 'quantity'), v: l === 'en' ? active.en : active.zh },
          { k: t(l, '換算', 'pair'), v: `${from} → ${to}` },
          {
            k: t(l, '比值', 'ratio'),
            v:
              fromUnit.factor !== undefined && toUnit.factor !== undefined
                ? formatQuantity(fromUnit.factor / toUnit.factor)
                : t(l, '非倍數關係', 'not a ratio'),
          },
          { k: t(l, '單位數', 'units'), v: String(active.units.length) },
        ]}
      />
    </div>
  );
}
