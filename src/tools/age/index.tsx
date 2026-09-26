'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Input, Note, Panel, Readout, Row, Seg, Table } from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  ageOn,
  formatIso,
  milestones,
  parseIso,
  spanBetween,
  upcomingBirthdays,
  weekdayOf,
  type LeapPolicy,
} from './logic';

/** Today, captured when the chunk loads — not while rendering. */
const TODAY = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Age({ l }: ToolProps) {
  const [mode, setMode] = useState<'age' | 'span'>('age');
  const [birth, setBirth] = useState('1990-05-15');
  const [asOf, setAsOf] = useState(TODAY);
  const [from, setFrom] = useState(TODAY);
  const [to, setTo] = useState('2027-01-01');
  const [policy, setPolicy] = useState<LeapPolicy>('mar01');

  const birthDay = parseIso(birth);
  const asOfDay = parseIso(asOf);
  const fromDay = parseIso(from);
  const toDay = parseIso(to);

  const age = useMemo(() => {
    if (birthDay === null || asOfDay === null || asOfDay < birthDay) return null;
    return ageOn(birthDay, asOfDay, policy);
  }, [birthDay, asOfDay, policy]);

  const birthdays = useMemo(
    () => (birthDay !== null && asOfDay !== null ? upcomingBirthdays(birthDay, asOfDay, policy, 6) : []),
    [birthDay, asOfDay, policy]
  );

  const marks = useMemo(
    () => (birthDay !== null && asOfDay !== null && asOfDay >= birthDay ? milestones(birthDay, asOfDay, policy, 6) : []),
    [birthDay, asOfDay, policy]
  );

  const span = useMemo(
    () => (fromDay !== null && toDay !== null ? spanBetween(fromDay, toDay) : null),
    [fromDay, toDay]
  );

  const weekdayName = (day: number) => (l === 'en' ? WEEKDAY_EN[weekdayOf(day)] : WEEKDAY_ZH[weekdayOf(day)]);
  const backwards = birthDay !== null && asOfDay !== null && asOfDay < birthDay;

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '輸入', 'INPUT')}</span>
          </div>

          <Row>
            <Seg
              label={t(l, '要算什麼', 'Mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'age', label: t(l, '年齡與生日', 'age & birthday') },
                { value: 'span', label: t(l, '兩日期相隔', 'span between dates') },
              ]}
            />
          </Row>

          {mode === 'age' ? (
            <>
              <Row>
                <Input
                  label={t(l, '出生日期', 'Date of birth')}
                  type="date"
                  value={birth}
                  onChange={setBirth}
                  invalid={birthDay === null}
                />
                <Input
                  label={t(l, '算到哪一天', 'As of')}
                  type="date"
                  value={asOf}
                  onChange={setAsOf}
                  invalid={asOfDay === null}
                />
              </Row>
              <Row>
                <Seg
                  label={t(l, '2 月 29 日出生,平年的生日算哪天', 'For a 29 February birth, in a common year')}
                  value={policy}
                  onChange={setPolicy}
                  options={[
                    { value: 'mar01', label: t(l, '3 月 1 日', '1 March') },
                    { value: 'feb28', label: t(l, '2 月 28 日', '28 February') },
                  ]}
                />
              </Row>
              {backwards ? (
                <Note error>{t(l, '基準日在出生日之前,先把兩個日期對調。', 'The reference date is before the birth date.')}</Note>
              ) : null}
            </>
          ) : (
            <Row>
              <Input
                label={t(l, '起', 'From')}
                type="date"
                value={from}
                onChange={setFrom}
                invalid={fromDay === null}
              />
              <Input label={t(l, '迄', 'To')} type="date" value={to} onChange={setTo} invalid={toDay === null} />
            </Row>
          )}

          <Note>
            {t(
              l,
              '足歲是完整過完的年數,滿一歲才算一歲。虛歲這裡用西元年差 + 1 概算,傳統上是以農曆年為界,所以農曆年前後那幾週會差一歲。',
              'Completed years only: you are one when a full year has passed. The nominal (虛歲) figure here is a calendar-year approximation; the traditional count turns over at lunar new year.'
            )}
          </Note>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '結果', 'RESULT')}</span>
            {mode === 'age' && birthDay !== null ? (
              <span className="inst-no">{weekdayName(birthDay)}</span>
            ) : null}
          </div>

          <div className="inst-out" aria-live="polite">
            {mode === 'age' ? (
              age ? (
                <>
                  <div style={{ fontSize: '2rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                    {count(age.years)}
                    <span className="inst-no" style={{ fontSize: '0.875rem', margin: '0 0.5rem' }}>
                      {t(l, '歲', 'y')}
                    </span>
                    {count(age.months)}
                    <span className="inst-no" style={{ fontSize: '0.875rem', margin: '0 0.5rem' }}>
                      {t(l, '個月', 'm')}
                    </span>
                    {count(age.days)}
                    <span className="inst-no" style={{ fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                      {t(l, '天', 'd')}
                    </span>
                  </div>
                  <div className="inst-no" style={{ marginTop: '0.5rem' }}>
                    {t(l, '下一個生日還有', 'next birthday in')} {count(age.daysToNext)} {t(l, '天', 'days')} ·{' '}
                    {formatIso(age.nextBirthday)} {weekdayName(age.nextBirthday)} · {t(l, '滿', 'turning')}{' '}
                    {count(age.turningNext)}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>{t(l, '填出生日期。', 'Enter a date of birth.')}</span>
              )
            ) : span ? (
              <>
                <div style={{ fontSize: '2rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                  {count(span.days)}
                  <span className="inst-no" style={{ fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                    {t(l, '天', 'days')}
                  </span>
                </div>
                <div className="inst-no" style={{ marginTop: '0.5rem' }}>
                  {count(span.ymd.years)} {t(l, '年', 'y')} {count(span.ymd.months)} {t(l, '個月', 'm')}{' '}
                  {count(span.ymd.days)} {t(l, '天', 'd')}
                  {span.backwards ? ` · ${t(l, '方向相反', 'reversed')}` : ''}
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--fg-faint)' }}>{t(l, '填兩個日期。', 'Enter two dates.')}</span>
            )}
          </div>

          {mode === 'age' && age ? (
            <div className="mt-3">
              <Table
                head={[t(l, '欄位', 'field'), t(l, '值', 'value')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '活過的天數', 'days lived'), count(age.totalDays)],
                  [t(l, '週數', 'weeks'), `${count(age.totalWeeks)} + ${count(age.totalDays % 7)} ${t(l, '天', 'd')}`],
                  [t(l, '小時', 'hours'), count(age.totalDays * 24)],
                  [t(l, '出生是星期', 'born on a'), birthDay === null ? '—' : weekdayName(birthDay)],
                  [t(l, '上一個生日', 'last birthday'), formatIso(age.lastBirthday)],
                  [t(l, '虛歲(概算)', 'nominal age (approx.)'), count(age.nominal)],
                ]}
              />
            </div>
          ) : null}

          {mode === 'span' && span ? (
            <div className="mt-3">
              <Table
                head={[t(l, '欄位', 'field'), t(l, '值', 'value')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '日曆天', 'calendar days'), count(span.days)],
                  [t(l, '週', 'weeks'), `${count(span.weeks)} + ${count(span.weekRemainder)} ${t(l, '天', 'd')}`],
                  [t(l, '總月數', 'whole months'), count(span.totalMonths)],
                  [t(l, '小時', 'hours'), count(span.hours)],
                  [t(l, '分鐘', 'minutes'), count(span.minutes)],
                  [t(l, '週一到週五的天數', 'Mon–Fri days'), count(span.weekdays)],
                ]}
              />
              <Note>
                {t(
                  l,
                  '週一到週五的天數不含結束日,也不扣國定假日。要扣假日請用 F02 工作日計算。',
                  'The Mon–Fri figure excludes the end date and ignores public holidays; use F02 for those.'
                )}
              </Note>
            </div>
          ) : null}
        </section>
      </div>

      {mode === 'age' && !backwards && birthdays.length > 0 ? (
        <div className="mt-8">
          <Panel label={t(l, '接下來的生日', 'UPCOMING BIRTHDAYS')}>
            <Table
              head={[t(l, '日期', 'date'), t(l, '星期', 'weekday'), t(l, '滿幾歲', 'turning'), t(l, '還有幾天', 'days away')]}
              align={['left', 'left', 'right', 'right']}
              rows={birthdays.map((entry) => [
                <span key="d" className="inst-no">
                  {entry.iso}
                </span>,
                l === 'en' ? WEEKDAY_EN[entry.weekday] : WEEKDAY_ZH[entry.weekday],
                count(entry.turning),
                count(entry.daysAway),
              ])}
            />
          </Panel>
        </div>
      ) : null}

      {mode === 'age' && marks.length > 0 ? (
        <div className="mt-8">
          <Panel label={t(l, '接下來的整數關卡', 'ROUND NUMBERS AHEAD')}>
            <Table
              head={[t(l, '關卡', 'mark'), t(l, '日期', 'date'), t(l, '還有幾天', 'days away')]}
              align={['left', 'left', 'right']}
              rows={marks.map((mark) => [
                <span key="m" className="inst-no">
                  {mark.label}
                </span>,
                <span key="d" className="inst-no">
                  {mark.iso}
                </span>,
                count(mark.daysAway),
              ])}
            />
            <Note>{t(l, '天數關卡是從出生當天算起的累計天數,不是週年。', 'Day marks count from the day of birth, not from an anniversary.')}</Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={
          mode === 'age'
            ? [
                { k: t(l, '足歲', 'age'), v: age ? count(age.years) : '—' },
                { k: t(l, '天數', 'days'), v: age ? count(age.totalDays) : '—' },
                { k: t(l, '下個生日', 'next birthday'), v: age ? `${count(age.daysToNext)} d` : '—' },
                { k: t(l, '虛歲', 'nominal'), v: age ? count(age.nominal) : '—' },
                { k: t(l, '2/29 規則', 'leap rule'), v: policy === 'mar01' ? '03-01' : '02-28' },
              ]
            : [
                { k: t(l, '天數', 'days'), v: span ? count(span.days) : '—' },
                { k: t(l, '年月日', 'y/m/d'), v: span ? `${span.ymd.years}/${span.ymd.months}/${span.ymd.days}` : '—' },
                { k: t(l, '週', 'weeks'), v: span ? count(span.weeks) : '—' },
                { k: t(l, '平日', 'weekdays'), v: span ? count(span.weekdays) : '—' },
              ]
        }
      />
    </div>
  );
}
