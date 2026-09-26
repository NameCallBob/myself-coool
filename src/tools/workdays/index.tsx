'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
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
import { read, write } from '@/lib/tools/storage';
import {
  SpanTooLong,
  StepTooFar,
  TAIWAN_SEED,
  TAIWAN_SEED_VERSION,
  addWorkdays,
  buildCalendar,
  countWorkdays,
  formatIso,
  listDays,
  monthlyTotals,
  parseIso,
  parseTable,
  weekdayOf,
  type DayKind,
} from './logic';

const SLUG = 'workdays';

/** Today's date, read once when the chunk loads — never during a render. */
const TODAY = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const WEEKDAY_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const KIND_ZH: Record<DayKind, string> = {
  work: '上班',
  weekend: '例假',
  holiday: '放假',
  makeup: '補班',
};
const KIND_EN: Record<DayKind, string> = {
  work: 'work',
  weekend: 'weekend',
  holiday: 'holiday',
  makeup: 'makeup',
};

export default function Workdays({ l }: ToolProps) {
  const [mode, setMode] = useState<'span' | 'step'>('span');
  const [from, setFrom] = useState(TODAY);
  const [to, setTo] = useState(TODAY);
  const [steps, setSteps] = useState('10');
  const [weekend, setWeekend] = useState<number[]>(() => {
    const stored = read<number[]>(SLUG, 'weekend', [0, 6]);
    return Array.isArray(stored) ? stored.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [0, 6];
  });
  const [table, setTable] = useState(() => read<string>(SLUG, 'table', TAIWAN_SEED));

  const parsed = useMemo(() => parseTable(table), [table]);
  const calendar = useMemo(() => buildCalendar(parsed.entries, weekend), [parsed.entries, weekend]);

  const fromDay = parseIso(from);
  const toDay = parseIso(to);
  const stepCount = /^-?\d{1,5}$/.test(steps.trim()) ? Number(steps.trim()) : null;

  const spanResult = useMemo(() => {
    if (mode !== 'span' || fromDay === null || toDay === null) return null;
    try {
      return { tally: countWorkdays(fromDay, toDay, calendar), error: null as string | null };
    } catch (problem) {
      return {
        tally: null,
        error:
          problem instanceof SpanTooLong
            ? t(l, `這個區間有 ${count(problem.days)} 天,超過一百年,請縮短。`, `That span is ${count(problem.days)} days — over a century. Shorten it.`)
            : String(problem),
      };
    }
  }, [mode, fromDay, toDay, calendar, l]);

  const stepResult = useMemo(() => {
    if (mode !== 'step' || fromDay === null || stepCount === null) return null;
    try {
      return { day: addWorkdays(fromDay, stepCount, calendar), error: null as string | null };
    } catch (problem) {
      return {
        day: null,
        error:
          problem instanceof StepTooFar
            ? t(l, '照這個設定沒有任何一天算上班,推不出結果。檢查例假日與假日表。', 'Nothing counts as a working day under these settings, so there is no answer. Check the weekend and the holiday table.')
            : String(problem),
      };
    }
  }, [mode, fromDay, stepCount, calendar, l]);

  const days = useMemo(() => {
    if (mode !== 'span' || fromDay === null || toDay === null) return [];
    const span = Math.abs(toDay - fromDay) + 1;
    if (span > 62) return [];
    return listDays(fromDay, toDay, calendar, 62);
  }, [mode, fromDay, toDay, calendar]);

  const months = useMemo(() => {
    if (mode !== 'span' || fromDay === null || toDay === null) return [];
    const span = Math.abs(toDay - fromDay) + 1;
    if (span <= 31 || span > 3700) return [];
    try {
      return monthlyTotals(fromDay, toDay, calendar);
    } catch {
      return [];
    }
  }, [mode, fromDay, toDay, calendar]);

  const workdays = spanResult?.tally ? spanResult.tally.work + spanResult.tally.makeup : 0;
  const dateBroken = (mode === 'span' && (fromDay === null || toDay === null)) || (mode === 'step' && fromDay === null);

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '要算什麼', 'QUESTION')}</span>
          </div>

          <Row>
            <Seg
              label={t(l, '算法', 'Mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'span', label: t(l, '兩日期之間', 'between dates') },
                { value: 'step', label: t(l, '往後推 N 個工作日', 'N working days out') },
              ]}
            />
          </Row>

          <Row>
            <Input
              label={mode === 'span' ? t(l, '起', 'from') : t(l, '起算日', 'start')}
              type="date"
              value={from}
              onChange={setFrom}
              invalid={fromDay === null}
            />
            {mode === 'span' ? (
              <Input
                label={t(l, '迄', 'to')}
                type="date"
                value={to}
                onChange={setTo}
                invalid={toDay === null}
              />
            ) : (
              <Input
                label={t(l, '幾個工作日(可填負數)', 'Working days (negative allowed)')}
                type="text"
                value={steps}
                onChange={setSteps}
                invalid={stepCount === null}
                hint={t(l, '從隔天開始算,契約上的「五個工作日內」就是這樣數。', 'Counting starts the next day, the way a contract means it.')}
              />
            )}
          </Row>

          <div className="inst-field">
            <span className="inst-label">{t(l, '哪幾天是例假', 'Which weekdays are off')}</span>
            <div className="inst-toolbar">
              {[1, 2, 3, 4, 5, 6, 0].map((index) => (
                <Check2
                  key={index}
                  label={l === 'en' ? WEEKDAY_EN[index] : WEEKDAY_ZH[index]}
                  checked={weekend.includes(index)}
                  onChange={(on) => {
                    const next = on ? [...weekend, index] : weekend.filter((day) => day !== index);
                    setWeekend(next);
                    write(SLUG, 'weekend', next);
                  }}
                />
              ))}
            </div>
            <p className="inst-hint">
              {t(l, '勾起來的是不上班的。做六休一就只勾週日。', 'Ticked days are off. A six-day week ticks Sunday only.')}
            </p>
          </div>

          {dateBroken ? (
            <Note error>{t(l, '日期讀不到,格式要是 YYYY-MM-DD。', 'Could not read the date; it must be YYYY-MM-DD.')}</Note>
          ) : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '結果', 'RESULT')}</span>
            {mode === 'span' && fromDay !== null && toDay !== null ? (
              <span className="inst-no">
                {formatIso(Math.min(fromDay, toDay))} → {formatIso(Math.max(fromDay, toDay))}
              </span>
            ) : null}
          </div>

          <div className="inst-out" aria-live="polite">
            {mode === 'span' ? (
              spanResult?.error ? (
                <Note error>{spanResult.error}</Note>
              ) : spanResult?.tally ? (
                <>
                  <div style={{ fontSize: '2rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                    {count(workdays)}
                    <span className="inst-no" style={{ fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                      {t(l, '個工作日', 'working days')}
                    </span>
                  </div>
                  <div className="inst-no" style={{ marginTop: '0.5rem' }}>
                    {t(l, '含頭含尾', 'both ends included')} · {t(l, '日曆天', 'calendar days')}{' '}
                    {count(spanResult.tally.total)}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>{t(l, '填兩個日期。', 'Enter two dates.')}</span>
              )
            ) : stepResult?.error ? (
              <Note error>{stepResult.error}</Note>
            ) : stepResult?.day !== null && stepResult?.day !== undefined ? (
              <>
                <div style={{ fontSize: '2rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                  {formatIso(stepResult.day)}
                </div>
                <div className="inst-no" style={{ marginTop: '0.5rem' }}>
                  {l === 'en' ? WEEKDAY_EN[weekdayOf(stepResult.day)] : WEEKDAY_ZH[weekdayOf(stepResult.day)]} ·{' '}
                  {t(l, '日曆天差', 'calendar days apart')} {count(Math.abs(stepResult.day - (fromDay ?? 0)))}
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--fg-faint)' }}>{t(l, '填起算日與天數。', 'Enter a start date and a count.')}</span>
            )}
          </div>

          {spanResult?.tally ? (
            <div className="mt-3">
              <Table
                head={[t(l, '分類', 'kind'), t(l, '天數', 'days')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '上班(平日)', 'work (weekday)'), count(spanResult.tally.work)],
                  [t(l, '補班(例假日上班)', 'makeup (weekend worked)'), count(spanResult.tally.makeup)],
                  [t(l, '例假', 'weekend'), count(spanResult.tally.weekend)],
                  [t(l, '放假(假日表)', 'holiday (from the table)'), count(spanResult.tally.holiday)],
                ]}
              />
            </div>
          ) : null}

          {months.length > 0 ? (
            <div className="mt-3">
              <Table
                head={[t(l, '月份', 'month'), t(l, '工作日', 'working'), t(l, '日曆天', 'days')]}
                align={['left', 'right', 'right']}
                rows={months.map((month) => [month.month, count(month.work), count(month.total)])}
              />
            </div>
          ) : null}

          {/* Past ten years neither breakdown is rendered, so say so rather than
              leaving the total sitting there with nothing under it. */}
          {spanResult?.tally && spanResult.tally.total > 3700 ? (
            <Note>
              {t(
                l,
                '這個區間超過十年,不列逐日也不列月份統計——上面的總數還是逐日算出來的。',
                'Over ten years: neither the day-by-day list nor the monthly breakdown is rendered. The total above is still counted day by day.'
              )}
            </Note>
          ) : null}
        </section>
      </div>

      {days.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '逐日', 'DAY BY DAY')}
            aside={<span className="inst-no">{count(days.length)} {t(l, '天', 'days')}</span>}
          >
            <Table
              head={[t(l, '日期', 'date'), t(l, '星期', 'weekday'), t(l, '分類', 'kind'), t(l, '名稱', 'name')]}
              rows={days.map((row) => [
                <span key="d" className="inst-no">
                  {row.iso}
                </span>,
                l === 'en' ? WEEKDAY_EN[row.weekday] : WEEKDAY_ZH[row.weekday],
                <span
                  key="k"
                  style={row.kind === 'holiday' || row.kind === 'makeup' ? { color: 'var(--accent)' } : undefined}
                >
                  {l === 'en' ? KIND_EN[row.kind] : KIND_ZH[row.kind]}
                </span>,
                row.name,
              ])}
            />
            <Note>{t(l, '逐日清單只在 62 天以內列出,更長的區間改看月份統計。', 'The day-by-day list only appears for spans of 62 days or fewer; longer spans use the monthly totals.')}</Note>
          </Panel>
        </div>
      ) : null}

      <div className="mt-8">
        <Panel
          label={t(l, '假日表', 'HOLIDAY TABLE')}
          aside={<span className="inst-no">v{TAIWAN_SEED_VERSION} · {count(parsed.entries.length)} {t(l, '筆', 'rows')}</span>}
        >
          <Area
            label={t(l, '一行一筆:日期 名稱。行首加 + 代表那天照上班(補班)。# 之後是註解。', 'One per line: date then name. A leading + means that day is worked. # starts a comment.')}
            value={table}
            onChange={(next) => {
              setTable(next);
              write(SLUG, 'table', next);
            }}
            rows={12}
            invalid={parsed.problems.length > 0}
          />
          <Row>
            <Btn
              onClick={() => {
                setTable(TAIWAN_SEED);
                write(SLUG, 'table', TAIWAN_SEED);
              }}
            >
              {t(l, '回到種子表', 'restore the seed table')}
            </Btn>
            <CopyButton l={l} text={table} label={t(l, '複製假日表', 'copy the table')} />
          </Row>

          {parsed.problems.length > 0 ? (
            <Note error>
              {t(l, '這幾行讀不懂,已跳過:', 'These lines were skipped:')}{' '}
              {parsed.problems
                .slice(0, 8)
                .map((problem) => `${t(l, '第', 'line ')}${problem.line}${t(l, ' 行', '')}`)
                .join('、')}
              {parsed.problems.length > 8 ? '…' : ''}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              `種子表版本 ${TAIWAN_SEED_VERSION},只放了日期固定的國定假日與 2026 年的農曆節日。調整放假(補假)與補班日每年由行政院人事行政總處公告,這裡不替你猜——請照公告自行增修,一切以公告為準。表格存在這台裝置。`,
              `Seed table ${TAIWAN_SEED_VERSION} holds only fixed-date national holidays plus 2026 lunar dates. Bridge days and makeup Saturdays are announced yearly and are deliberately not guessed here: add them from the official calendar, which is what governs. The table stays on this device.`
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '工作日', 'working days'), v: mode === 'span' ? count(workdays) : '—' },
          { k: t(l, '日曆天', 'calendar days'), v: spanResult?.tally ? count(spanResult.tally.total) : '—' },
          { k: t(l, '假日表', 'table rows'), v: count(parsed.entries.length) },
          { k: t(l, '例假', 'weekend days'), v: count(weekend.length) },
          { k: t(l, '表格版本', 'table version'), v: TAIWAN_SEED_VERSION },
        ]}
      />
    </div>
  );
}
