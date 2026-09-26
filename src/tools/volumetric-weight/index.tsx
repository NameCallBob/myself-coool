'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  BATCH_LIMIT,
  DIVISORS,
  ROUNDING_STEPS,
  SIZE_CLASSES,
  batchTotals,
  breakEvenDensity,
  chargeableWeight,
  classFor,
  cubicMetres,
  formatSizeClasses,
  lengthPlusGirth,
  parseParcels,
  parseSizeClasses,
  revenueTons,
  sumOfSides,
  volume,
  volumetricWeight,
  type Divisor,
  type LengthUnit,
  type MassUnit,
} from './logic';

function divisorText(l: Loc, id: string): string {
  switch (id) {
    case 'express-5000':
      return t(l, '5000 — 國際快遞常見(cm³/kg)', '5000 — common for international express (cm³/kg)');
    case 'air-6000':
      return t(l, '6000 — IATA 空運一般貨(cm³/kg)', '6000 — IATA air cargo (cm³/kg)');
    case 'economy-4000':
      return t(l, '4000 — 部分經濟/貨櫃併櫃服務(cm³/kg)', '4000 — some economy services (cm³/kg)');
    case 'us-139':
      return t(l, '139 — 美國國內(in³/lb)', '139 — US domestic (in³/lb)');
    case 'us-166':
      return t(l, '166 — 美國零售櫃台(in³/lb)', '166 — US retail counter (in³/lb)');
    default:
      return id;
  }
}

const num = (text: string): number => {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : Number.NaN;
};

export default function VolumetricWeight({ l }: ToolProps) {
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('cm');
  const [massUnit, setMassUnit] = useState<MassUnit>('kg');
  const [lengthText, setLengthText] = useState('40');
  const [widthText, setWidthText] = useState('30');
  const [heightText, setHeightText] = useState('20');
  const [weightText, setWeightText] = useState('2.5');
  const [divisorId, setDivisorId] = useState('express-5000');
  const [customDivisor, setCustomDivisor] = useState('5000');
  const [step, setStep] = useState('0.5');
  const [classText, setClassText] = useState(formatSizeClasses(SIZE_CLASSES));
  const [showClasses, setShowClasses] = useState(false);
  const [batch, setBatch] = useState('');

  const dims = {
    length: num(lengthText),
    width: num(widthText),
    height: num(heightText),
  };
  const actual = num(weightText);

  const divisor: Divisor = useMemo(() => {
    if (divisorId === 'custom') {
      return {
        id: 'custom',
        value: num(customDivisor),
        length: lengthUnit,
        mass: massUnit,
      };
    }
    return DIVISORS.find((entry) => entry.id === divisorId) ?? DIVISORS[0];
  }, [divisorId, customDivisor, lengthUnit, massUnit]);

  const parsedStep = num(step);
  const roundStep = Number.isFinite(parsedStep) ? parsedStep : 0;
  const dimWeight = volumetricWeight(dims, lengthUnit, divisor, massUnit);
  const verdict = dimWeight === null ? null : chargeableWeight(actual, dimWeight, roundStep);

  const cube = volume(dims, lengthUnit);
  const cbm = cubicMetres(dims, lengthUnit);
  const girth = lengthPlusGirth(dims);
  const sides = sumOfSides(dims);
  const classes = useMemo(() => parseSizeClasses(classText), [classText]);
  const sidesCm = sides === null ? null : lengthUnit === 'cm' ? sides : sides * 2.54;
  const sizeClass = sidesCm === null ? null : classFor(sidesCm, classes);
  const density = actual > 0 && cbm ? actual / cbm : null;
  const breakEven = breakEvenDensity(divisor);

  const parcels = useMemo(() => parseParcels(batch), [batch]);
  // Left unmemoised: it is a few multiplications over at most 500 rows, and the
  // React Compiler handles it better than a hand-written dependency list.
  const totals = batchTotals(parcels.parcels, lengthUnit, divisor, massUnit, roundStep);

  const mass = massUnit;
  const unit = lengthUnit;

  const copyText = verdict
    ? [
        `${dims.length}×${dims.width}×${dims.height} ${unit}`,
        `volume: ${cube === null ? '—' : fixed(cube, 0)} ${unit}³ (${cbm === null ? '—' : fixed(cbm, 4)} m³)`,
        `divisor: ${divisor.value} ${divisor.length}³/${divisor.mass}`,
        `actual: ${fixed(verdict.actual, 2)} ${mass}`,
        `volumetric: ${fixed(verdict.volumetric, 2)} ${mass}`,
        `chargeable: ${fixed(verdict.chargeable, 2)} ${mass} (${verdict.basis})`,
      ].join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '包裹', 'PARCEL')}
        rightLabel={t(l, '計費重', 'CHARGEABLE')}
        leftAside={
          <Row>
            <Seg
              label={t(l, '長度單位', 'length unit')}
              value={unit}
              onChange={setLengthUnit}
              options={[
                { value: 'cm', label: 'cm' },
                { value: 'in', label: 'in' },
              ]}
            />
            <Seg
              label={t(l, '重量單位', 'mass unit')}
              value={mass}
              onChange={setMassUnit}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
            />
          </Row>
        }
        rightAside={verdict ? <CopyButton l={l} text={copyText} /> : null}
        left={
          <>
            <Row>
              <Input label={t(l, `長 ${unit}`, `Length ${unit}`)} type="number" value={lengthText} onChange={setLengthText} min={0} step={0.1} />
              <Input label={t(l, `寬 ${unit}`, `Width ${unit}`)} type="number" value={widthText} onChange={setWidthText} min={0} step={0.1} />
              <Input label={t(l, `高 ${unit}`, `Height ${unit}`)} type="number" value={heightText} onChange={setHeightText} min={0} step={0.1} />
            </Row>
            <Row>
              <Input
                label={t(l, `實際重量 ${mass}`, `Actual weight ${mass}`)}
                type="number"
                value={weightText}
                onChange={setWeightText}
                min={0}
                step={0.01}
              />
            </Row>
            <Select
              label={t(l, '材積除數', 'Divisor')}
              value={divisorId}
              onChange={setDivisorId}
              options={[
                ...DIVISORS.map((entry) => ({ value: entry.id, label: divisorText(l, entry.id) })),
                { value: 'custom', label: t(l, '自訂', 'custom') },
              ]}
              hint={t(
                l,
                '這份清單是 2025-09 對照各家公告整理的常見值,不是任何一家的現行費率。談過約的帳號常有自己的除數,以報價單上寫的為準。',
                'A list of common values checked against published terms in 2025-09 — not any carrier’s current tariff. Negotiated accounts often have their own divisor; trust the quote.'
              )}
            />
            {divisorId === 'custom' ? (
              <Row>
                <Input
                  label={t(l, `自訂除數(${unit}³ / ${mass})`, `Custom divisor (${unit}³ / ${mass})`)}
                  type="number"
                  value={customDivisor}
                  onChange={setCustomDivisor}
                  min={1}
                />
              </Row>
            ) : null}
            <Seg
              label={t(l, '進位單位', 'rounding step')}
              value={step}
              onChange={setStep}
              options={ROUNDING_STEPS.map((value) => ({
                value: String(value),
                label: value === 0 ? t(l, '不進位', 'none') : `${value} ${mass}`,
              }))}
            />
            <p className="inst-hint">
              {t(
                l,
                '業者是「往上進位」而不是四捨五入:0.5 kg 級距下,4.01 kg 就以 4.5 kg 計。',
                'Carriers round up, not to nearest: on a 0.5 kg step, 4.01 kg is billed as 4.5 kg.'
              )}
            </p>
          </>
        }
        right={
          verdict ? (
            <div aria-live="polite">
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 32,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                }}
              >
                {fixed(verdict.chargeable, 2)}
                <span style={{ fontSize: 12, color: 'var(--fg-faint)', marginLeft: '0.5rem' }}>
                  {mass}
                </span>
              </div>
              <p className="inst-hint">
                {verdict.basis === 'volumetric'
                  ? t(l, '以材積重計費(體積比重量吃虧)', 'charged by volume — the box is bulkier than it is heavy')
                  : verdict.basis === 'actual'
                    ? t(l, '以實際重量計費', 'charged by actual weight')
                    : t(l, '兩者相同', 'the two are equal')}
              </p>
              <Table
                head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                rows={[
                  [t(l, '實際重量', 'actual'), `${fixed(verdict.actual, 2)} ${mass}`],
                  [t(l, '材積重', 'volumetric'), `${fixed(verdict.volumetric, 2)} ${mass}`],
                  [t(l, '取大者', 'greater of the two'), `${fixed(verdict.greater, 2)} ${mass}`],
                  [
                    t(l, '進位後', 'after rounding up'),
                    `${fixed(verdict.chargeable, 2)} ${mass}`,
                  ],
                  [
                    t(l, '體積', 'volume'),
                    cube === null ? '—' : `${fixed(cube, 0)} ${unit}³`,
                  ],
                  [t(l, '立方公尺', 'cubic metres'), cbm === null ? '—' : `${fixed(cbm, 4)} m³`],
                  [
                    t(l, '包裹密度', 'parcel density'),
                    density === null ? '—' : `${fixed(density, 0)} ${mass}/m³`,
                  ],
                  [
                    t(l, '這個除數的臨界密度', 'break-even density'),
                    `${fixed(breakEven, 0)} kg/m³`,
                  ],
                  [
                    t(l, '長 + 兩倍圍長', 'length + girth'),
                    girth === null ? '—' : `${fixed(girth, 1)} ${unit}`,
                  ],
                  [
                    t(l, '三邊合計', 'sum of sides'),
                    sides === null ? '—' : `${fixed(sides, 1)} ${unit}`,
                  ],
                  [
                    t(l, '尺寸級距(三邊合計)', 'size class (sum of sides)'),
                    sizeClass
                      ? `${sizeClass.label}${sizeClass.maxKg ? ` / ≤ ${sizeClass.maxKg} kg` : ''}`
                      : t(l, '超出表內級距', 'beyond the table'),
                  ],
                ]}
              />
              <Note>
                {t(
                  l,
                  `臨界密度 ${fixed(breakEven, 0)} kg/m³ 的意思是:比這個密度輕的包裹會按體積計費,重的按實重。水是 1000,所以幾乎所有裝了空氣的箱子都走材積。`,
                  `A break-even density of ${fixed(breakEven, 0)} kg/m³ means anything less dense is charged by volume and anything denser by mass. Water is 1000, so almost any box with air in it goes by volume.`
                )}
              </Note>
            </div>
          ) : (
            <Note>{t(l, '填入三邊長度。', 'Enter three dimensions.')}</Note>
          )
        }
      />

      <Panel
        label={t(l, '海運併櫃(W/M)', 'SEA FREIGHT LCL (W/M)')}
        aside={
          cbm !== null && Number.isFinite(actual) ? (
            <span className="inst-no">
              {fixed(revenueTons(cbm, massUnit === 'kg' ? actual : actual / 2.2046226218487757) ?? 0, 3)} R/T
            </span>
          ) : null
        }
      >
        <p className="inst-hint">
          {t(
            l,
            '併櫃海運算的是「重量或體積取大者」:一公噸與一立方公尺都算一個計費噸(R/T),所以臨界密度剛好是水的 1000 kg/m³。這跟快遞的除數是兩套完全不同的規則,不要混用。',
            'LCL sea freight charges weight-or-measure: one tonne and one cubic metre each count as one revenue ton, so the break-even is water at 1000 kg/m³. It is a different rule from the express divisor — do not mix them.'
          )}
        </p>
        <Table
          head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
          rows={[
            [t(l, '體積', 'volume'), cbm === null ? '—' : `${fixed(cbm, 4)} m³`],
            [
              t(l, '重量(公噸)', 'weight in tonnes'),
              Number.isFinite(actual)
                ? fixed((massUnit === 'kg' ? actual : actual / 2.2046226218487757) / 1000, 4)
                : '—',
            ],
            [
              t(l, '計費噸 R/T', 'revenue tons'),
              cbm === null || !Number.isFinite(actual)
                ? '—'
                : fixed(
                    revenueTons(cbm, massUnit === 'kg' ? actual : actual / 2.2046226218487757) ?? 0,
                    3
                  ),
            ],
          ]}
        />
      </Panel>

      <Panel
        label={t(l, '多件包裹', 'MULTIPLE PARCELS')}
        aside={
          parcels.parcels.length > 0 ? (
            <span className="inst-no">
              {count(totals.count)} {t(l, '件', 'pieces')} · {fixed(totals.chargeable, 2)} {mass}
            </span>
          ) : null
        }
      >
        <Area
          label={t(
            l,
            `一行一件:長x寬x高 重量 [x件數](最多 ${BATCH_LIMIT} 行)`,
            `One per line: LxWxH weight [xqty] (up to ${BATCH_LIMIT} lines)`
          )}
          value={batch}
          onChange={setBatch}
          rows={6}
          placeholder={'40x30x20 5.5\n60x40x40 12 x3'}
        />
        {parcels.truncated ? (
          <Note error>{t(l, `超過 ${BATCH_LIMIT} 行,只算前面的。`, `Over ${BATCH_LIMIT} lines — only the first were counted.`)}</Note>
        ) : null}
        {parcels.bad.length > 0 ? (
          <Note error>
            {t(l, '讀不懂這幾行:', 'These lines could not be read: ')}
            {parcels.bad.slice(0, 5).join(' / ')}
          </Note>
        ) : null}
        {parcels.parcels.length > 0 ? (
          <>
            <Table
              head={[
                t(l, '尺寸', 'size'),
                t(l, '件數', 'qty'),
                t(l, '實重', 'actual'),
                t(l, '材積重', 'volumetric'),
                t(l, '計費重', 'chargeable'),
              ]}
              rows={parcels.parcels.map((parcel, index) => {
                const dim = volumetricWeight(parcel.dims, unit, divisor, mass);
                const row = dim === null ? null : chargeableWeight(parcel.weight, dim, roundStep);
                return [
                  <span key={index} style={{ fontFamily: 'var(--font-mono)' }}>
                    {parcel.dims.length}×{parcel.dims.width}×{parcel.dims.height} {unit}
                  </span>,
                  String(parcel.quantity),
                  `${fixed(parcel.weight, 2)} ${mass}`,
                  dim === null ? '—' : `${fixed(dim, 2)} ${mass}`,
                  <span
                    key={`c${index}`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: row?.basis === 'volumetric' ? 'var(--accent)' : undefined,
                    }}
                  >
                    {row === null ? '—' : `${fixed(row.chargeable * parcel.quantity, 2)} ${mass}`}
                  </span>,
                ];
              })}
            />
            <Table
              head={[t(l, '合計', 'total'), t(l, '值', 'value')]}
              rows={[
                [t(l, '件數', 'pieces'), count(totals.count)],
                [t(l, '實重合計', 'actual total'), `${fixed(totals.actual, 2)} ${mass}`],
                [t(l, '材積重合計', 'volumetric total'), `${fixed(totals.volumetric, 2)} ${mass}`],
                [t(l, '計費重合計', 'chargeable total'), `${fixed(totals.chargeable, 2)} ${mass}`],
              ]}
            />
            <Note>
              {t(
                l,
                '進位是逐件做的,不是把總重進位一次——業者就是這樣算,先加總再進位會少算,件數多的時候可以差好幾公斤。',
                'Rounding is applied per parcel, not once on the total: that is how carriers bill it, and rounding the total instead understates the figure, sometimes by several kilograms.'
              )}
            </Note>
          </>
        ) : null}
      </Panel>

      <Panel
        label={t(l, '尺寸級距表', 'SIZE CLASS TABLE')}
        aside={
          <Btn onClick={() => setShowClasses(!showClasses)}>
            {showClasses ? t(l, '收起', 'hide') : t(l, '編輯', 'edit')}
          </Btn>
        }
      >
        <p className="inst-hint">
          {t(
            l,
            '台灣國內宅配用「三邊合計」分級距。這裡只放常見的級距刻度(60/80/100/120/140/160 cm),重量上限一律留空:每家業者、每種服務的上限與價格都不一樣,而且會調整。照你手上那家的公告自己填,格式是「上限:名稱:重量上限」。',
            'Taiwanese domestic couriers class parcels on the sum of the three sides. Only the common steps are here (60/80/100/120/140/160 cm); every weight cap is left blank, because caps and prices differ per carrier and per service and do change. Fill them in from the carrier’s own published table — the format is "limit:label:max kg".'
          )}
        </p>
        {showClasses ? (
          <>
            <Area label={t(l, '級距表', 'Size class table')} value={classText} onChange={setClassText} rows={8} />
            <Row>
              <Btn onClick={() => setClassText(formatSizeClasses(SIZE_CLASSES))}>
                {t(l, '還原內建級距', 'restore the built-in steps')}
              </Btn>
              <span className="inst-no">
                {count(classes.length)} {t(l, '級', 'classes')}
              </span>
            </Row>
          </>
        ) : (
          <Table
            head={[t(l, '級距', 'class'), t(l, '三邊合計上限 cm', 'max sum of sides, cm'), t(l, '重量上限', 'weight cap')]}
            rows={classes.map((entry) => [
              <span
                key={entry.label}
                style={{ color: sizeClass?.label === entry.label ? 'var(--accent)' : undefined }}
              >
                {entry.label}
              </span>,
              `≤ ${entry.limit}`,
              entry.maxKg === null ? t(l, '自己填', 'fill this in') : `≤ ${entry.maxKg} kg`,
            ])}
          />
        )}
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '體積', 'volume'), v: cbm === null ? '—' : `${fixed(cbm, 4)} m³` },
          { k: t(l, '材積重', 'volumetric'), v: dimWeight === null ? '—' : `${fixed(dimWeight, 2)} ${mass}` },
          {
            k: t(l, '計費重', 'chargeable'),
            v: verdict === null ? '—' : `${fixed(verdict.chargeable, 2)} ${mass}`,
          },
          { k: t(l, '除數', 'divisor'), v: `${divisor.value} ${divisor.length}³/${divisor.mass}` },
          { k: t(l, '多件合計', 'batch total'), v: parcels.parcels.length ? `${fixed(totals.chargeable, 2)} ${mass}` : '—' },
        ]}
      />
    </div>
  );
}
