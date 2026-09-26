'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, CopyButton, Input, Note, Panel, Readout, Row, Table } from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { factsFor, formatIso, parseAny, versionStamps, type ParseHit } from './logic';

/** Today, read once at chunk load rather than during a render. */
const TODAY = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FORMAT_ZH: Record<ParseHit['format'], string> = {
  iso: '西元年月日',
  'iso-compact': '西元八碼',
  roc: '民國年月日',
  'roc-compact': '民國七碼',
  'roc-chinese': '民國中文',
  chinese: '西元中文',
  'iso-week': 'ISO 週次',
  ordinal: '年積日',
};
const FORMAT_EN: Record<ParseHit['format'], string> = {
  iso: 'Gregorian Y-M-D',
  'iso-compact': 'Gregorian YYYYMMDD',
  roc: 'ROC Y/M/D',
  'roc-compact': 'ROC YYYMMDD',
  'roc-chinese': 'ROC in Chinese',
  chinese: 'Gregorian in Chinese',
  'iso-week': 'ISO week',
  ordinal: 'ordinal day',
};

export default function RocDate({ l }: ToolProps) {
  const [input, setInput] = useState(TODAY);

  const hit = useMemo(() => parseAny(input), [input]);
  const facts = useMemo(() => (hit ? factsFor(hit.day) : null), [hit]);
  const stamps = useMemo(() => (facts ? versionStamps(facts) : []), [facts]);

  const failed = input.trim() !== '' && hit === null;
  const step = (days: number) => {
    if (hit) setInput(formatIso(hit.day + days));
  };

  const rows: [string, string][] = facts
    ? [
        [t(l, '西元', 'Gregorian'), facts.iso],
        [t(l, '民國', 'ROC'), facts.rocText],
        [t(l, '民國七碼', 'ROC stamp'), facts.rocCompact],
        [t(l, '星期', 'weekday'), l === 'en' ? WEEKDAY_EN[facts.weekday] : WEEKDAY_ZH[facts.weekday]],
        [t(l, 'ISO 週次', 'ISO week'), facts.isoWeekText],
        [
          t(l, '週年度', 'week-numbering year'),
          `${facts.isoWeek.year}${facts.isoWeek.year === facts.year ? '' : t(l, '(與西元年不同)', ' (differs from the calendar year)')}`,
        ],
        [t(l, '年積日', 'ordinal day'), `${facts.ordinal} / ${facts.daysInYear}`],
        [t(l, '季', 'quarter'), `Q${facts.quarter}`],
        [t(l, '當月天數', 'days in month'), String(facts.daysInMonth)],
        [t(l, '該 ISO 年共幾週', 'weeks in the ISO year'), String(facts.weeksInIsoYear)],
        [t(l, '閏年', 'leap year'), facts.leap ? t(l, '是', 'yes') : t(l, '否', 'no')],
      ]
    : [];

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '輸入', 'INPUT')}</span>
            {hit ? (
              <span className="inst-no">
                {t(l, '讀成', 'read as')} {l === 'en' ? FORMAT_EN[hit.format] : FORMAT_ZH[hit.format]}
              </span>
            ) : null}
          </div>

          <Input
            label={t(l, '任何一種寫法都可以', 'Any of these shapes')}
            value={input}
            onChange={setInput}
            invalid={failed}
            placeholder="2026-09-26"
            hint={t(
              l,
              '2026-09-26、20260926、115/09/26、1150926、民國115年9月26日、2026-W39-6、2026-269',
              '2026-09-26, 20260926, 115/09/26, 1150926, 民國115年9月26日, 2026-W39-6, 2026-269'
            )}
          />

          <Row>
            <Btn onClick={() => setInput(TODAY)}>{t(l, '今天', 'today')}</Btn>
            <Btn onClick={() => step(-1)} disabled={!hit}>
              −1 {t(l, '天', 'day')}
            </Btn>
            <Btn onClick={() => step(1)} disabled={!hit}>
              +1 {t(l, '天', 'day')}
            </Btn>
            <Btn onClick={() => step(-7)} disabled={!hit}>
              −1 {t(l, '週', 'week')}
            </Btn>
            <Btn onClick={() => step(7)} disabled={!hit}>
              +1 {t(l, '週', 'week')}
            </Btn>
          </Row>

          {failed ? (
            <Note error>
              {t(
                l,
                '看不懂這個寫法。四位數開頭當西元、三位數以下當民國;2026-02-30 這種不存在的日期會被擋掉,不會硬算。',
                'Not a shape this reads. A four-digit lead is Gregorian, shorter is ROC, and a date that does not exist is refused rather than rolled over.'
              )}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              '民國 1 年是西元 1912 年;沒有民國 0 年,1911 年寫成民國前 1 年。ISO 週次以「含 1 月 4 日的那一週」為第一週,所以 12 月底有可能已經算進下一年的第 1 週。',
              'ROC year 1 is 1912, and there is no year zero: 1911 is 民國前 1 年. An ISO week belongs to the year containing its Thursday, so late December can already be week 1 of the next year.'
            )}
          </Note>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '對照', 'CONVERSIONS')}</span>
            {facts ? <span className="inst-no">{facts.iso}</span> : null}
          </div>

          <div aria-live="polite">
            {facts ? (
              <Table
                head={[t(l, '欄位', 'field'), t(l, '值', 'value'), '']}
                rows={rows.map(([label, value]) => [
                  label,
                  <span key="v" className="inst-no" style={{ fontSize: '0.875rem', color: 'var(--fg)' }}>
                    {value}
                  </span>,
                  <CopyButton key="c" l={l} text={value} label={t(l, '複製', 'copy')} />,
                ])}
              />
            ) : (
              <div className="inst-out">
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '填一個看得懂的日期,這裡就會同時列出所有寫法。', 'Enter a date it can read and every representation appears here.')}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {stamps.length > 0 ? (
        <div className="mt-8">
          <Panel label={t(l, '版本號與檔名戳記', 'VERSION AND FILENAME STAMPS')}>
            <Table
              head={[t(l, '格式', 'pattern'), t(l, '今天會是', 'for this date'), '']}
              rows={stamps.map((stamp) => [
                <span key="p" className="inst-no">
                  {stamp.label}
                </span>,
                <span key="v" className="inst-no" style={{ fontSize: '0.875rem', color: 'var(--fg)' }}>
                  {stamp.value}
                </span>,
                <CopyButton key="c" l={l} text={stamp.value} label={t(l, '複製', 'copy')} />,
              ])}
            />
            <Note>
              {t(
                l,
                'YYDDD 是年份後兩碼加年積日,主機系統與備份檔常用;它到 2100 年前都不會重複,但跨世紀會。',
                'YYDDD is the two-digit year plus the ordinal day — common on mainframes and backup files. It is unique until 2100 and not beyond.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '西元', 'gregorian'), v: facts ? facts.iso : '—' },
          { k: t(l, '民國', 'roc'), v: facts ? facts.rocCompact : '—' },
          { k: t(l, '週次', 'iso week'), v: facts ? facts.isoWeekText : '—' },
          { k: t(l, '年積日', 'ordinal'), v: facts ? count(facts.ordinal) : '—' },
          { k: t(l, '讀成', 'parsed as'), v: hit ? (l === 'en' ? FORMAT_EN[hit.format] : FORMAT_ZH[hit.format]) : '—' },
        ]}
      />
    </div>
  );
}
