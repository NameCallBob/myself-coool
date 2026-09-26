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
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_YEARS,
  PlanError,
  money,
  percent,
  project,
  requiredContribution,
  yearsToTarget,
  type Plan,
  type Projection,
  type Timing,
} from './logic';

type Draft = {
  initial: string;
  contribution: string;
  contributionsPerYear: string;
  contributionGrowth: string;
  annualRate: string;
  compoundsPerYear: string;
  feePercent: string;
  inflationPercent: string;
  years: string;
  timing: Timing;
  target: string;
};

const INITIAL: Draft = {
  initial: '300000',
  contribution: '10000',
  contributionsPerYear: '12',
  contributionGrowth: '0',
  annualRate: '6',
  compoundsPerYear: '12',
  feePercent: '0.5',
  inflationPercent: '2',
  years: '25',
  timing: 'end',
  target: '10000000',
};

const num = (text: string): number => {
  const cleaned = text.replace(/[,\s_%]/g, '');
  if (cleaned === '') return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
};

export default function CompoundInterest({ l }: ToolProps) {
  const [d, setD] = useState<Draft>(INITIAL);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((previous) => ({ ...previous, [key]: value }));

  const plan: Plan = useMemo(
    () => ({
      initial: num(d.initial),
      contribution: num(d.contribution),
      contributionsPerYear: Math.trunc(num(d.contributionsPerYear)) || 12,
      contributionGrowth: num(d.contributionGrowth),
      annualRate: num(d.annualRate),
      compoundsPerYear: Math.trunc(num(d.compoundsPerYear)) || 12,
      feePercent: num(d.feePercent),
      inflationPercent: num(d.inflationPercent),
      years: Math.trunc(num(d.years)),
      timing: d.timing,
    }),
    [d]
  );

  const outcome = useMemo((): { result: Projection | null; error: string | null } => {
    try {
      return { result: project(plan), error: null };
    } catch (problem) {
      return {
        result: null,
        error: problem instanceof PlanError ? problem.message : String(problem),
      };
    }
  }, [plan]);

  const result = outcome.result;
  const target = num(d.target);

  const needed = useMemo(() => {
    if (!result || !Number.isFinite(target) || target <= 0) return Number.NaN;
    try {
      return requiredContribution(plan, target);
    } catch {
      return Number.NaN;
    }
  }, [plan, result, target]);

  const reachIn = useMemo(() => {
    if (!result || !Number.isFinite(target) || target <= 0) return null;
    try {
      return yearsToTarget(plan, target);
    } catch {
      return null;
    }
  }, [plan, result, target]);

  const tallest = result
    ? result.yearly.reduce((max, year) => Math.max(max, year.balance), 0)
    : 0;

  const csv = result
    ? [
        'year,contribution,growth,balance,real_balance,contributed_to_date',
        ...result.yearly.map((year) =>
          [
            year.year,
            year.contribution.toFixed(2),
            year.growth.toFixed(2),
            year.balance.toFixed(2),
            year.realBalance.toFixed(2),
            year.contributedToDate.toFixed(2),
          ].join(',')
        ),
      ].join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '條件', 'PLAN')}
        rightLabel={t(l, '結果', 'RESULT')}
        rightAside={
          result ? (
            <span className="inst-no">
              {t(l, '淨年報酬', 'net annual')} {percent(result.netAnnualRate)}
            </span>
          ) : null
        }
        left={
          <>
            <Row>
              <Input
                label={t(l, '起始金額', 'Starting amount')}
                value={d.initial}
                onChange={(value) => set('initial', value)}
              />
              <Input
                label={t(l, '每期投入', 'Each contribution')}
                value={d.contribution}
                onChange={(value) => set('contribution', value)}
              />
            </Row>
            <Row>
              <Select
                label={t(l, '投入頻率', 'Contribution frequency')}
                value={d.contributionsPerYear}
                options={[
                  { value: '12', label: t(l, '每月', 'monthly') },
                  { value: '4', label: t(l, '每季', 'quarterly') },
                  { value: '2', label: t(l, '每半年', 'half-yearly') },
                  { value: '1', label: t(l, '每年', 'yearly') },
                ]}
                onChange={(value) => set('contributionsPerYear', value)}
              />
              <Seg
                label={t(l, '投入時點', 'Paid at')}
                value={d.timing}
                onChange={(value) => set('timing', value)}
                options={[
                  { value: 'begin', label: t(l, '期初', 'start') },
                  { value: 'end', label: t(l, '期末', 'end') },
                ]}
              />
            </Row>
            <Row>
              <Input
                label={t(l, '年限(年)', 'Years')}
                value={d.years}
                onChange={(value) => set('years', value)}
              />
              <Input
                label={t(l, '每年調高投入 %', 'Contribution rises % a year')}
                value={d.contributionGrowth}
                onChange={(value) => set('contributionGrowth', value)}
                hint={t(l, '薪水漲、扣款跟著漲。', 'For a contribution that tracks your salary.')}
              />
            </Row>
            <Row>
              <Input
                label={t(l, '名目年報酬 %', 'Nominal return % a year')}
                value={d.annualRate}
                onChange={(value) => set('annualRate', value)}
              />
              <Select
                label={t(l, '複利頻率', 'Compounding')}
                value={d.compoundsPerYear}
                options={[
                  { value: '1', label: t(l, '每年', 'yearly') },
                  { value: '2', label: t(l, '每半年', 'half-yearly') },
                  { value: '4', label: t(l, '每季', 'quarterly') },
                  { value: '12', label: t(l, '每月', 'monthly') },
                  { value: '365', label: t(l, '每日', 'daily') },
                ]}
                onChange={(value) => set('compoundsPerYear', value)}
              />
            </Row>
            <Row>
              <Input
                label={t(l, '年費用率 %', 'Annual fee %')}
                value={d.feePercent}
                onChange={(value) => set('feePercent', value)}
                hint={t(l, '基金的經理費、保管費、平台費加總。', 'Management, custody and platform fees combined.')}
              />
              <Input
                label={t(l, '年通膨 %', 'Inflation % a year')}
                value={d.inflationPercent}
                onChange={(value) => set('inflationPercent', value)}
              />
            </Row>
            {outcome.error ? <Note error>{outcome.error}</Note> : null}
            <Note>
              {t(
                l,
                '報酬率在這裡是一個固定數字,真實市場不是。同樣的平均年化報酬,順序不同(前幾年跌、後幾年漲)得到的結果差很多,定期定額尤其明顯。這張表算的是「如果每年剛好都這個報酬」,不是預測。',
                'The return here is one fixed number; markets are not. The same average annual return in a different order — bad years first, good years last — gives a very different result, especially when contributing regularly. This is arithmetic under a constant rate, not a forecast.'
              )}
            </Note>
          </>
        }
        right={
          !result ? (
            <Note>{t(l, '把條件填完整。', 'Fill in the plan.')}</Note>
          ) : (
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'item'), t(l, '金額', 'amount')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '期末金額(名目)', 'final balance (nominal)'), money(result.finalBalance)],
                  [
                    t(l, '期末金額(今天的購買力)', 'final balance in today’s money'),
                    money(result.finalRealBalance),
                  ],
                  [t(l, '自己投入的本金', 'you paid in'), money(result.totalContributed)],
                  [t(l, '複利長出來的部分', 'growth'), money(result.totalGrowth)],
                  [
                    t(l, '複利佔期末比例', 'growth as % of final'),
                    `${((result.totalGrowth / result.finalBalance) * 100).toFixed(1)}%`,
                  ],
                  [t(l, '費用吃掉的金額', 'taken by fees'), money(result.feeCost)],
                  [t(l, '有效年報酬(含複利頻率)', 'effective annual return'), percent(result.effectiveAnnualRate)],
                  [t(l, '扣費後年報酬', 'after fees'), percent(result.netAnnualRate)],
                  [t(l, '扣通膨後實質年報酬', 'real return after inflation'), percent(result.realAnnualRate)],
                  [
                    t(l, '複利超過投入的那一年', 'year growth first beats contributions'),
                    result.crossoverYear === null
                      ? t(l, '期間內沒有發生', 'not inside the term')
                      : t(l, `第 ${result.crossoverYear} 年`, `year ${result.crossoverYear}`),
                  ],
                ].map(([k, v]) => [
                  <span key="k" style={{ fontSize: '0.8125rem' }}>
                    {k}
                  </span>,
                  <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {v}
                  </span>,
                ])}
              />

              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '反推:要存到一個目標', 'WORKING BACK FROM A TARGET')}</span>
                </div>
                <Input
                  label={t(l, '目標金額', 'Target amount')}
                  value={d.target}
                  onChange={(value) => set('target', value)}
                />
                <Table
                  head={[t(l, '問題', 'question'), t(l, '答案', 'answer')]}
                  align={['left', 'right']}
                  rows={[
                    [
                      t(l, '每期要投入多少', 'contribution needed each period'),
                      Number.isFinite(needed) ? money(needed) : '—',
                    ],
                    [
                      t(l, '照目前的投入,幾年會到', 'years to get there at the current contribution'),
                      reachIn === null
                        ? t(l, `${MAX_YEARS} 年內到不了`, `not within ${MAX_YEARS} years`)
                        : t(l, `第 ${reachIn} 年`, `year ${reachIn}`),
                    ],
                    [
                      t(l, '目標在今天值多少', 'the target in today’s money'),
                      Number.isFinite(target)
                        ? money(target / (1 + plan.inflationPercent / 100) ** plan.years)
                        : '—',
                    ],
                  ].map(([k, v]) => [
                    <span key="k" style={{ fontSize: '0.8125rem' }}>
                      {k}
                    </span>,
                    <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                      {v}
                    </span>,
                  ])}
                />
              </div>

              <Note>
                {t(
                  l,
                  `費用率 ${d.feePercent}% 看起來很小,但它每年是從整個資產收,連本來會繼續複利的那一塊一起收走——這就是上面「費用吃掉的金額」比「本金 × 費率 × 年數」大得多的原因。`,
                  `A ${d.feePercent}% fee looks small, but it is charged on the whole pot every year, including the part that would have gone on compounding — which is why the figure above is far larger than principal × rate × years.`
                )}
              </Note>
            </div>
          )
        }
      />

      {result ? (
        <div className="mt-8">
          <Panel
            label={t(l, '逐年', 'BY YEAR')}
            aside={
              <span className="inst-no">
                {count(result.yearly.length)} {t(l, '年', 'years')}
              </span>
            }
          >
            <Row>
              <CopyButton l={l} text={csv} label={t(l, '複製 CSV', 'copy CSV')} />
            </Row>
            <Table
              head={[
                t(l, '年', 'year'),
                t(l, '當年投入', 'paid in'),
                t(l, '當年複利', 'growth'),
                t(l, '累計投入', 'paid to date'),
                t(l, '年末金額', 'balance'),
                t(l, '今天的購買力', 'in today’s money'),
                '',
              ]}
              align={['right', 'right', 'right', 'right', 'right', 'right', 'left']}
              rows={result.yearly.map((year) => [
                <span key="y" className="inst-no">
                  {year.year}
                </span>,
                <span key="c" className="inst-no">
                  {money(year.contribution)}
                </span>,
                <span
                  key="g"
                  className="inst-no"
                  style={year.growth > year.contribution ? { color: 'var(--data-teal)' } : undefined}
                >
                  {money(year.growth)}
                </span>,
                <span key="d" className="inst-no">
                  {money(year.contributedToDate)}
                </span>,
                <span key="b" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {money(year.balance)}
                </span>,
                <span key="r" className="inst-no">
                  {money(year.realBalance)}
                </span>,
                <span
                  key="bar"
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    height: '0.5rem',
                    width: tallest === 0 ? 0 : `${(year.balance / tallest) * 100}%`,
                    minWidth: '1px',
                    background: 'var(--accent)',
                    opacity: 0.6,
                  }}
                />,
              ])}
            />
            <Note>
              {t(
                l,
                '「當年複利」超過「當年投入」的年份標成青色。那一年之後,錢賺的比你存的多。',
                'Years where growth exceeds the amount paid in are marked in teal. After that point the pot earns more than you add.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '期末', 'final'), v: result ? money(result.finalBalance) : '—' },
          { k: t(l, '實質', 'real'), v: result ? money(result.finalRealBalance) : '—' },
          { k: t(l, '本金', 'paid in'), v: result ? money(result.totalContributed) : '—' },
          { k: t(l, '費用成本', 'fee cost'), v: result ? money(result.feeCost) : '—' },
          { k: t(l, '期數', 'periods'), v: result ? count(result.periods.length) : '—' },
        ]}
      />
    </div>
  );
}
