'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  LoanError,
  MAX_MONTHS,
  buildSchedule,
  byYear,
  effectiveAnnualRate,
  money,
  prepaymentSaving,
  termText,
  type LoanInput,
  type Method,
  type PrepaymentEffect,
  type Schedule,
} from './logic';

type Draft = {
  principal: string;
  rate: string;
  twoStage: boolean;
  stageMonths: string;
  rateAfter: string;
  years: string;
  extraMonths: string;
  graceMonths: string;
  method: Method;
  effect: PrepaymentEffect;
  roundPayment: boolean;
  prepayments: { month: string; amount: string }[];
};

const INITIAL: Draft = {
  principal: '10000000',
  rate: '2.1',
  twoStage: false,
  stageMonths: '24',
  rateAfter: '2.6',
  years: '30',
  extraMonths: '0',
  graceMonths: '0',
  method: 'equal-payment',
  effect: 'term',
  roundPayment: false,
  prepayments: [],
};

const num = (text: string): number => {
  const cleaned = text.replace(/[,\s_]/g, '');
  if (cleaned === '') return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
};

const whole = (text: string): number => {
  const value = num(text);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
};

export default function Loan({ l }: ToolProps) {
  const [d, setD] = useState<Draft>(INITIAL);
  const [showAll, setShowAll] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((previous) => ({ ...previous, [key]: value }));

  const input: LoanInput = useMemo(
    () => ({
      principal: num(d.principal),
      rate: num(d.rate),
      stageMonths: d.twoStage ? whole(d.stageMonths) : 0,
      rateAfter: d.twoStage ? num(d.rateAfter) : num(d.rate),
      months: whole(d.years) * 12 + whole(d.extraMonths),
      graceMonths: whole(d.graceMonths),
      method: d.method,
      prepayments: d.prepayments
        .map((entry) => ({ month: whole(entry.month), amount: num(entry.amount) }))
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0 && entry.month >= 1),
      prepaymentEffect: d.effect,
      roundPayment: d.roundPayment,
    }),
    [d]
  );

  const outcome = useMemo((): { schedule: Schedule | null; error: string | null } => {
    try {
      return { schedule: buildSchedule(input), error: null };
    } catch (problem) {
      return {
        schedule: null,
        error: problem instanceof LoanError ? problem.message : String(problem),
      };
    }
  }, [input]);

  const schedule = outcome.schedule;
  const years = schedule ? byYear(schedule) : [];
  const saving = useMemo(() => {
    if (!schedule || input.prepayments.length === 0) return null;
    try {
      return prepaymentSaving(input);
    } catch {
      return null;
    }
  }, [schedule, input]);
  const effective = useMemo(() => {
    if (!schedule) return Number.NaN;
    try {
      return effectiveAnnualRate(input);
    } catch {
      return Number.NaN;
    }
  }, [schedule, input]);

  const monthly = schedule ? (showAll ? schedule.periods : schedule.periods.slice(0, 24)) : [];

  const csv = schedule
    ? [
        'month,rate,payment,interest,principal,extra,balance',
        ...schedule.periods.map((period) =>
          [
            period.month,
            period.annualRate,
            period.payment.toFixed(2),
            period.interest.toFixed(2),
            period.principal.toFixed(2),
            period.extra.toFixed(2),
            period.balance.toFixed(2),
          ].join(',')
        ),
      ].join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '條件', 'TERMS')}
        rightLabel={t(l, '試算', 'RESULT')}
        rightAside={
          schedule ? (
            <span className="inst-no">{termText(schedule.actualMonths, l)}</span>
          ) : null
        }
        left={
          <>
            <Row>
              <Input
                label={t(l, '貸款金額', 'Principal')}
                value={d.principal}
                onChange={(value) => set('principal', value)}
              />
              <Input
                label={t(l, '年利率 %', 'Annual rate %')}
                value={d.rate}
                onChange={(value) => set('rate', value)}
              />
            </Row>
            <Row>
              <Input
                label={t(l, '年限(年)', 'Term (years)')}
                value={d.years}
                onChange={(value) => set('years', value)}
              />
              <Input
                label={t(l, '再加幾個月', 'Plus months')}
                value={d.extraMonths}
                onChange={(value) => set('extraMonths', value)}
              />
              <Input
                label={t(l, '寬限期(月)', 'Grace (months)')}
                value={d.graceMonths}
                onChange={(value) => set('graceMonths', value)}
                hint={t(l, '只還利息的月數。', 'Months paying interest only.')}
              />
            </Row>

            <Row>
              <Seg
                label={t(l, '攤還方式', 'Method')}
                value={d.method}
                onChange={(value) => set('method', value)}
                options={[
                  { value: 'equal-payment', label: t(l, '本息平均', 'equal payment') },
                  { value: 'equal-principal', label: t(l, '本金平均', 'equal principal') },
                ]}
              />
              <Check2
                label={t(l, '月付進位到整數', 'round instalment up')}
                checked={d.roundPayment}
                onChange={(value) => set('roundPayment', value)}
              />
            </Row>

            <Row>
              <Check2
                label={t(l, '前後兩段利率', 'two-stage rate')}
                checked={d.twoStage}
                onChange={(value) => set('twoStage', value)}
              />
            </Row>
            {d.twoStage ? (
              <Row>
                <Input
                  label={t(l, '前段月數', 'First stage months')}
                  value={d.stageMonths}
                  onChange={(value) => set('stageMonths', value)}
                />
                <Input
                  label={t(l, '後段年利率 %', 'Rate after %')}
                  value={d.rateAfter}
                  onChange={(value) => set('rateAfter', value)}
                />
              </Row>
            ) : null}

            <div className="inst-field">
              <span className="inst-label">{t(l, '提前還款', 'Prepayments')}</span>
              {d.prepayments.map((entry, index) => (
                <Row key={index}>
                  <Input
                    label={t(l, '第幾個月', 'Month')}
                    value={entry.month}
                    onChange={(value) =>
                      set(
                        'prepayments',
                        d.prepayments.map((item, i) => (i === index ? { ...item, month: value } : item))
                      )
                    }
                  />
                  <Input
                    label={t(l, '金額', 'Amount')}
                    value={entry.amount}
                    onChange={(value) =>
                      set(
                        'prepayments',
                        d.prepayments.map((item, i) => (i === index ? { ...item, amount: value } : item))
                      )
                    }
                  />
                  <Btn
                    onClick={() =>
                      set('prepayments', d.prepayments.filter((_, i) => i !== index))
                    }
                  >
                    {t(l, '刪除', 'remove')}
                  </Btn>
                </Row>
              ))}
              <Row>
                <Btn
                  onClick={() =>
                    set('prepayments', [...d.prepayments, { month: '13', amount: '500000' }])
                  }
                >
                  {t(l, '加一筆', 'add one')}
                </Btn>
                {d.prepayments.length > 0 ? (
                  <Seg
                    label={t(l, '提前還款之後', 'After prepaying')}
                    value={d.effect}
                    onChange={(value) => set('effect', value)}
                    options={[
                      { value: 'term', label: t(l, '縮短年限', 'shorten term') },
                      { value: 'payment', label: t(l, '降低月付', 'lower instalment') },
                    ]}
                  />
                ) : null}
              </Row>
            </div>

            {outcome.error ? <Note error>{outcome.error}</Note> : null}
            <Note>
              {t(
                l,
                '這是逐月模擬,採每月計息、期初餘額計息。實際帳單會因銀行的計息基準日、天期算法與手續費而不同,以對帳單為準。',
                'This is a month-by-month simulation charging interest on the opening balance. A real statement differs by the bank’s day-count basis, value dates and fees — the statement is authoritative.'
              )}
            </Note>
          </>
        }
        right={
          !schedule ? (
            <Note>{t(l, '把條件填完整。', 'Fill in the terms.')}</Note>
          ) : (
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'item'), t(l, '金額', 'amount')]}
                align={['left', 'right']}
                rows={[
                  [
                    d.method === 'equal-payment'
                      ? t(l, '每月應付', 'monthly instalment')
                      : t(l, '首月應付(之後遞減)', 'first instalment (falls after)'),
                    money(schedule.periods.find((period) => !period.grace)?.payment ?? Number.NaN),
                  ],
                  [t(l, '月付最高', 'highest instalment'), money(schedule.maxPayment)],
                  [t(l, '總利息', 'total interest'), money(schedule.totalInterest)],
                  [t(l, '本息合計', 'total paid'), money(schedule.totalPaid)],
                  [
                    t(l, '利息佔本金', 'interest as % of principal'),
                    `${((schedule.totalInterest / input.principal) * 100).toFixed(2)}%`,
                  ],
                  [t(l, '實際期數', 'periods'), `${count(schedule.actualMonths)} · ${termText(schedule.actualMonths, l)}`],
                  [
                    t(l, '有效年利率', 'effective annual rate'),
                    Number.isFinite(effective) ? `${effective.toFixed(4)}%` : '—',
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

              {schedule.stagePayments.length > 1 ? (
                <div className="mt-3">
                  <div className="inst-pane-label">
                    <span>{t(l, '月付變動的時點', 'WHERE THE INSTALMENT CHANGES')}</span>
                  </div>
                  <Table
                    head={[t(l, '自第幾月', 'from month'), t(l, '年利率', 'rate'), t(l, '月付', 'instalment')]}
                    align={['right', 'right', 'right']}
                    rows={schedule.stagePayments.map((stage) => [
                      <span key="m" className="inst-no">
                        {stage.fromMonth}
                      </span>,
                      <span key="r" className="inst-no">
                        {stage.annualRate}%
                      </span>,
                      <span key="p" className="inst-no" style={{ color: 'var(--fg)' }}>
                        {money(stage.payment)}
                      </span>,
                    ])}
                  />
                </div>
              ) : null}

              {saving ? (
                <Note>
                  {t(
                    l,
                    `提前還款省下利息 ${money(saving.saved)},${d.effect === 'term' ? `期數少 ${saving.monthsSaved} 個月` : '期數不變'}。沒提前還款的話總利息是 ${money(saving.interestWithout)}。`,
                    `Prepaying saves ${money(saving.saved)} of interest${d.effect === 'term' ? `, ${saving.monthsSaved} months shorter` : ' with the same term'}. Without it the total interest is ${money(saving.interestWithout)}.`
                  )}
                </Note>
              ) : null}

              <Note>
                {t(
                  l,
                  '很多銀行的提前還款在綁約期內要付違約金,這裡沒有算進去。有效年利率也沒有含開辦費與帳管費。',
                  'Many banks charge a penalty for prepaying inside a lock-in period; that is not modelled here, and the effective rate excludes arrangement and account fees.'
                )}
              </Note>
            </div>
          )
        }
      />

      {schedule ? (
        <>
          <div className="mt-8">
            <Panel
              label={t(l, '逐年攤還', 'BY YEAR')}
              aside={
                <span className="inst-no">
                  {count(years.length)} {t(l, '年', 'years')}
                </span>
              }
            >
              <Table
                head={[
                  t(l, '年', 'year'),
                  t(l, '利息', 'interest'),
                  t(l, '本金', 'principal'),
                  t(l, '額外還款', 'extra'),
                  t(l, '年末餘額', 'balance'),
                ]}
                align={['right', 'right', 'right', 'right', 'right']}
                rows={years.map((row) => [
                  <span key="y" className="inst-no">
                    {row.year}
                  </span>,
                  <span key="i" className="inst-no">
                    {money(row.interest)}
                  </span>,
                  <span key="p" className="inst-no">
                    {money(row.principal)}
                  </span>,
                  <span key="e" className="inst-no">
                    {row.extra > 0 ? money(row.extra) : '—'}
                  </span>,
                  <span key="b" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {money(row.balance)}
                  </span>,
                ])}
              />
            </Panel>
          </div>

          <div className="mt-8">
            <Panel
              label={t(l, '逐月攤還表', 'BY MONTH')}
              aside={
                <span className="inst-no">
                  {count(monthly.length)} / {count(schedule.periods.length)}
                </span>
              }
            >
              <Row>
                <Btn onClick={() => setShowAll((value) => !value)}>
                  {showAll
                    ? t(l, '只看前兩年', 'show first 24 months')
                    : t(l, `展開全部 ${schedule.periods.length} 期`, `show all ${schedule.periods.length} periods`)}
                </Btn>
                <CopyButton l={l} text={csv} label={t(l, '複製 CSV', 'copy CSV')} />
              </Row>
              <Table
                head={[
                  t(l, '期', 'no'),
                  t(l, '利率', 'rate'),
                  t(l, '月付', 'payment'),
                  t(l, '利息', 'interest'),
                  t(l, '本金', 'principal'),
                  t(l, '額外', 'extra'),
                  t(l, '餘額', 'balance'),
                ]}
                align={['right', 'right', 'right', 'right', 'right', 'right', 'right']}
                rows={monthly.map((period) => [
                  <span key="n" className="inst-no">
                    {period.month}
                    {period.grace ? '*' : ''}
                  </span>,
                  <span key="r" className="inst-no">
                    {period.annualRate}%
                  </span>,
                  <span key="p" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {money(period.payment, 2)}
                  </span>,
                  <span key="i" className="inst-no">
                    {money(period.interest, 2)}
                  </span>,
                  <span key="pr" className="inst-no">
                    {money(period.principal, 2)}
                  </span>,
                  <span key="e" className="inst-no">
                    {period.extra > 0 ? money(period.extra) : '—'}
                  </span>,
                  <span key="b" className="inst-no">
                    {money(period.balance, 2)}
                  </span>,
                ])}
              />
              {schedule.periods.some((period) => period.grace) ? (
                <Note>{t(l, '* 寬限期,只付利息,本金不動。', '* Grace period: interest only, principal untouched.')}</Note>
              ) : null}
            </Panel>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '期數', 'periods'), v: schedule ? count(schedule.actualMonths) : '—' },
          { k: t(l, '月付', 'instalment'), v: schedule ? money(schedule.maxPayment) : '—' },
          { k: t(l, '總利息', 'interest'), v: schedule ? money(schedule.totalInterest) : '—' },
          {
            k: t(l, '有效年利率', 'effective APR'),
            v: Number.isFinite(effective) ? `${effective.toFixed(3)}%` : '—',
          },
          { k: t(l, '上限', 'max term'), v: `${MAX_MONTHS} ${t(l, '期', 'mo')}` },
        ]}
      />
    </div>
  );
}
