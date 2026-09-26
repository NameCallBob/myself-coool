'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  breakdown,
  elapsed,
  formatIso,
  formatRfc2822,
  formatUnix,
  parseAny,
  type ParseNote,
  type Unit,
  type Zone,
} from './logic';

/* ── The clock, as a store ────────────────── */
/**
 * "Now" has to come from somewhere other than render: `Date.now()` during render
 * is impure and React 19's rules reject it. A store's snapshot changes only when
 * the interval writes a new one, which is also what stops the relative reading
 * from disagreeing with itself between two renders of the same frame.
 */
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(notify: () => void): () => void {
  clockListeners.add(notify);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const listener of clockListeners) listener();
    }, 1000);
  }
  return () => {
    clockListeners.delete(notify);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const readClock = () => clockNow;
const serverClock = () => 0;

const WEEKDAY = {
  zh: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
} as const;

const UNIT_LABEL: Record<Exclude<Unit, 'auto'>, string> = {
  s: 'Unix s',
  ms: 'Unix ms',
  us: 'Unix µs',
  ns: 'Unix ns',
};

function offsetLabel(minutes: number): string {
  if (minutes === 0) return 'UTC+00:00';
  const sign = minutes < 0 ? '-' : '+';
  const hours = String(Math.trunc(Math.abs(minutes) / 60)).padStart(2, '0');
  return `UTC${sign}${hours}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}

function noteText(note: ParseNote, l: 'zh' | 'en'): string {
  switch (note) {
    case 'unit-guessed':
      return t(
        l,
        '單位是照數值大小猜的:小於 1e11 當秒、小於 1e14 當毫秒、小於 1e17 當微秒,再上去是奈秒。真實日期都落在明確的區間裡,但如果你的資料本來就怪,請直接指定單位。',
        'The unit was guessed by magnitude: under 1e11 is seconds, under 1e14 milliseconds, under 1e17 microseconds, above that nanoseconds. Real dates fall in unambiguous ranges, but state the unit if your data is unusual.'
      );
    case 'assumed-zone':
      return t(
        l,
        '這個字串沒有寫時區。ISO 8601 說沒寫就是當地時間,但 Date.parse 自己的規則是矛盾的(只有日期時當 UTC,有時間時當本地),所以這裡讓你自己選,並照你選的算。',
        'The string carries no offset. ISO 8601 says that means local time, but Date.parse contradicts itself (UTC for a date, local for a date-time), so the assumption is yours and is applied as chosen.'
      );
    case 'sub-millisecond-dropped':
      return t(
        l,
        '輸入的精度比毫秒細。JavaScript 的 Date 只到毫秒,所以毫秒以下的位數被單獨留著顯示,不會混進日期運算。',
        'The input is finer than a millisecond. A JavaScript Date stops at milliseconds, so the extra digits are kept separately rather than folded into the date arithmetic.'
      );
    case 'leap-second':
      return t(
        l,
        '第 60 秒是閏秒。ISO 8601 允許這樣寫,但 JavaScript 沒有閏秒概念,它會變成下一秒。',
        'Second 60 is a leap second. ISO 8601 allows it; JavaScript has no concept of one, so it becomes the following second.'
      );
    case 'two-digit-year':
      return t(
        l,
        '兩位數年份按 RFC 5322:00–49 是 2000–2049,50–99 是 1950–1999。',
        'A two-digit year follows RFC 5322: 00–49 means 2000–2049 and 50–99 means 1950–1999.'
      );
    case 'obsolete-zone':
      return t(
        l,
        '用了字母時區(GMT、EST 之類)。RFC 5322 已經把它們列為過時:不認得的字母時區一律當成 -0000,意思是「偏移不明」,不等於 UTC。',
        'An alphabetic zone (GMT, EST…) was used. RFC 5322 marks these obsolete and requires any unrecognised one to be read as -0000, meaning "offset unknown" rather than UTC.'
      );
    case 'date-only':
      return t(l, '只有日期沒有時間,時間部分當成當天 00:00:00。', 'Date only; the time is taken as 00:00:00 that day.');
    case 'out-of-range':
      return t(
        l,
        '這個數值超出 JavaScript Date 能表示的範圍(epoch 前後各約 2.7 億年),所以下面的日期欄位都是空的。',
        'The value is outside what a JavaScript Date can hold (about ±273 000 years from the epoch), so the date fields below are empty.'
      );
    default:
      return note;
  }
}

const SAMPLES = [
  '1645557742',
  '1645557742000',
  '2022-02-22T19:22:22Z',
  '2022-02-22 19:22:22',
  'Tue, 22 Feb 2022 19:22:22 GMT',
];

/**
 * One instant, every spelling of it.
 *
 * The parser is the interesting half. `Date.parse` is not used anywhere here:
 * its rules for a string without an offset differ depending on whether the
 * string has a time in it, and a converter whose answer silently depends on that
 * is worse than no converter.
 */
export default function Timestamp({ l }: ToolProps) {
  const now = useSyncExternalStore(subscribeClock, readClock, serverClock);

  const [text, setText] = useState('');
  const [unit, setUnit] = useState<Unit>('auto');
  const [assume, setAssume] = useState<Zone>('local');

  const parsed = useMemo(() => parseAny(text, unit, assume), [text, unit, assume]);
  const local = useMemo(() => breakdown(parsed.ms, 'local'), [parsed.ms]);
  const utc = useMemo(() => breakdown(parsed.ms, 'utc'), [parsed.ms]);

  const gap = useMemo(() => {
    if (parsed.kind === 'none' || !Number.isFinite(parsed.ms)) return null;
    const parts = elapsed(now, parsed.ms);
    const unitName = (name: string) =>
      ({
        day: t(l, '天', 'd'),
        hour: t(l, '小時', 'h'),
        minute: t(l, '分', 'm'),
        second: t(l, '秒', 's'),
      })[name] ?? name;
    const body = parts.map((part) => `${part.value}${unitName(part.unit)}`).join(' ');
    return parsed.ms >= now ? t(l, `${body} 之後`, `in ${body}`) : t(l, `${body} 之前`, `${body} ago`);
  }, [parsed, now, l]);

  const kindLabel =
    parsed.kind === 'unix'
      ? `${t(l, 'Unix 數值', 'Unix number')} (${parsed.unit ?? '?'})`
      : parsed.kind === 'iso8601'
        ? 'ISO 8601'
        : parsed.kind === 'rfc2822'
          ? 'RFC 2822'
          : t(l, '認不出來', 'unrecognised');

  const rows: [string, string][] =
    parsed.kind === 'none'
      ? []
      : [
          [UNIT_LABEL.s, formatUnix(parsed.ms, parsed.subMs, 's')],
          [UNIT_LABEL.ms, formatUnix(parsed.ms, parsed.subMs, 'ms')],
          [UNIT_LABEL.us, formatUnix(parsed.ms, parsed.subMs, 'us')],
          [UNIT_LABEL.ns, formatUnix(parsed.ms, parsed.subMs, 'ns')],
          [t(l, 'ISO 8601(本地)', 'ISO 8601 (local)'), formatIso(parsed.ms, 'local')],
          [t(l, 'ISO 8601(UTC)', 'ISO 8601 (UTC)'), formatIso(parsed.ms, 'utc')],
          [t(l, 'RFC 2822(本地)', 'RFC 2822 (local)'), formatRfc2822(parsed.ms, 'local')],
          [t(l, 'RFC 2822(UTC)', 'RFC 2822 (UTC)'), formatRfc2822(parsed.ms, 'utc')],
        ];

  const allText = rows.map(([label, value]) => `${label}\t${value}`).join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '同一個時刻的每一種寫法', 'THE SAME INSTANT, EVERY SPELLING')}
        leftAside={<span className="inst-no">{kindLabel}</span>}
        rightAside={gap ? <span className="inst-no">{gap}</span> : null}
        left={
          <>
            <Input
              label={t(l, 'Unix 數值、ISO 8601 或 RFC 2822', 'A Unix number, ISO 8601, or RFC 2822')}
              hint={t(
                l,
                '貼什麼都可以,三種格式會依序試。純數字一律當 Unix 數值,不會被當成 ISO 的緊縮寫法。',
                'Paste any of the three; they are tried in order. A bare number is always a Unix value, never ISO basic format.'
              )}
              value={text}
              onChange={setText}
              invalid={parsed.kind === 'none' && text.trim() !== ''}
              placeholder="1645557742"
            />

            <Row>
              <Seg
                label={t(l, '數值單位', 'Number unit')}
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'auto', label: t(l, '自動', 'auto') },
                  { value: 's', label: 's' },
                  { value: 'ms', label: 'ms' },
                  { value: 'us', label: 'µs' },
                  { value: 'ns', label: 'ns' },
                ]}
              />
              <Seg
                label={t(l, '沒寫時區時當成', 'No offset means')}
                value={assume}
                onChange={setAssume}
                options={[
                  { value: 'local', label: t(l, '本地', 'local') },
                  { value: 'utc', label: 'UTC' },
                ]}
              />
            </Row>

            <Row>
              <Btn onClick={() => setText(String(Date.now()))} primary>
                {t(l, '填入現在', 'use now')}
              </Btn>
              <ResetButton l={l} onReset={() => setText('')} />
            </Row>

            <div className="inst-field">
              <span className="inst-label">{t(l, '試試這些', 'Try these')}</span>
              <div className="inst-toolbar">
                {SAMPLES.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="inst-btn"
                    onClick={() => setText(sample)}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {text.trim() !== '' && parsed.kind === 'none' ? (
              <Note error>
                {t(
                  l,
                  '這串讀不出來。支援的是:純數字的 Unix 數值(可帶小數)、ISO 8601(2024-01-31T09:00:00+08:00 或去掉分隔符的緊縮形式)、RFC 2822(Wed, 31 Jan 2024 09:00:00 +0800)。週次日期(2024-W05-3)與序數日期(2024-031)不支援。',
                  'This cannot be read. Supported: a bare Unix number (a decimal point is fine), ISO 8601 (2024-01-31T09:00:00+08:00, or the basic form without separators), and RFC 2822 (Wed, 31 Jan 2024 09:00:00 +0800). Week dates (2024-W05-3) and ordinal dates (2024-031) are not.'
                )}
              </Note>
            ) : null}

            {parsed.notes.map((note) => (
              <Note key={note} error={note === 'out-of-range'}>
                {noteText(note, l)}
              </Note>
            ))}

            <Panel label={t(l, '現在', 'NOW')}>
              <Table
                head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                rows={[
                  [
                    'Unix ms',
                    <span key="n" className="inst-no">
                      {now === 0 ? '—' : now}
                    </span>,
                  ],
                  [
                    t(l, 'ISO(本地)', 'ISO (local)'),
                    <span key="i" className="inst-no">
                      {now === 0 ? '—' : formatIso(now, 'local')}
                    </span>,
                  ],
                  [
                    t(l, '本地時區偏移', 'local offset'),
                    <span key="o" className="inst-no">
                      {now === 0 ? '—' : offsetLabel(breakdown(now, 'local')?.offsetMinutes ?? 0)}
                    </span>,
                  ],
                ]}
              />
            </Panel>
          </>
        }
        right={
          <>
            <div aria-live="polite">
              {rows.length === 0 ? (
                <Note>{t(l, '輸入之後這裡會列出全部格式。', 'Every format appears here once something is entered.')}</Note>
              ) : (
                <Table
                  head={[t(l, '格式', 'format'), t(l, '值', 'value')]}
                  rows={rows.map(([label, value]) => [
                    label,
                    <span key={label} className="inst-no inst-wrap">
                      {value}
                    </span>,
                  ])}
                />
              )}
            </div>

            {rows.length > 0 ? (
              <Row>
                <CopyButton l={l} text={allText} label={t(l, '全部複製', 'copy all')} />
                <CopyButton
                  l={l}
                  text={formatIso(parsed.ms, 'utc')}
                  label={t(l, '複製 ISO UTC', 'copy ISO UTC')}
                />
              </Row>
            ) : null}

            {local && utc ? (
              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '日曆讀數', 'CALENDAR READINGS')}</span>
                  <span className="inst-no">{offsetLabel(local.offsetMinutes)}</span>
                </div>
                <Table
                  head={[t(l, '項目', 'field'), t(l, '本地', 'local'), 'UTC']}
                  rows={[
                    [
                      t(l, '日期', 'date'),
                      `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
                      `${utc.year}-${String(utc.month).padStart(2, '0')}-${String(utc.day).padStart(2, '0')}`,
                    ],
                    [
                      t(l, '時間', 'time'),
                      `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second).padStart(2, '0')}.${String(local.millis).padStart(3, '0')}`,
                      `${String(utc.hour).padStart(2, '0')}:${String(utc.minute).padStart(2, '0')}:${String(utc.second).padStart(2, '0')}.${String(utc.millis).padStart(3, '0')}`,
                    ],
                    [t(l, '星期', 'weekday'), WEEKDAY[l][local.weekday], WEEKDAY[l][utc.weekday]],
                    [t(l, '年內第幾天', 'day of year'), String(local.dayOfYear), String(utc.dayOfYear)],
                    [
                      t(l, 'ISO 週', 'ISO week'),
                      `${local.isoWeekYear}-W${String(local.isoWeek).padStart(2, '0')}`,
                      `${utc.isoWeekYear}-W${String(utc.isoWeek).padStart(2, '0')}`,
                    ],
                    [t(l, '季', 'quarter'), `Q${local.quarter}`, `Q${utc.quarter}`],
                    [
                      t(l, '當月天數', 'days in month'),
                      String(local.daysInMonth),
                      String(utc.daysInMonth),
                    ],
                    [
                      t(l, '閏年', 'leap year'),
                      local.leapYear ? t(l, '是', 'yes') : t(l, '否', 'no'),
                      utc.leapYear ? t(l, '是', 'yes') : t(l, '否', 'no'),
                    ],
                    [
                      t(l, '當日第幾秒', 'second of day'),
                      String(local.secondOfDay),
                      String(utc.secondOfDay),
                    ],
                  ]}
                />
                {parsed.subMs !== 0 ? (
                  <Note>
                    {t(
                      l,
                      `毫秒以下另外有 ${parsed.subMs} 奈秒,不在上面的時間欄位裡。`,
                      `A further ${parsed.subMs} nanoseconds sit below the millisecond and are not in the time field above.`
                    )}
                  </Note>
                ) : null}
                {local.isoWeekYear !== local.year ? (
                  <Note>
                    {t(
                      l,
                      `ISO 週年是 ${local.isoWeekYear},和日曆年 ${local.year} 不同。ISO 8601 的第一週是含有一月第一個星期四的那一週,所以年初年末幾天會被算進鄰年。`,
                      `The ISO week-year is ${local.isoWeekYear}, not the calendar year ${local.year}. ISO 8601 week 1 is the week containing the first Thursday of January, so a few days at each end of a year belong to the neighbouring one.`
                    )}
                  </Note>
                ) : null}
              </div>
            ) : null}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '判定格式', 'read as'), v: kindLabel },
          { k: 'Unix ms', v: parsed.kind === 'none' ? '—' : formatUnix(parsed.ms, parsed.subMs, 'ms') },
          {
            k: t(l, '毫秒以下', 'sub-ms'),
            v: parsed.subMs === 0 ? '0 ns' : `${parsed.subMs} ns`,
          },
          {
            k: t(l, '時區偏移', 'offset'),
            v: local ? offsetLabel(local.offsetMinutes) : '—',
          },
          { k: t(l, '距現在', 'from now'), v: gap ?? '—' },
        ]}
      />
    </div>
  );
}
