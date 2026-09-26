'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { read, write } from '@/lib/tools/storage';
import {
  DEFAULT_PATTERN,
  DEFAULT_SHIFTS,
  LIMITS,
  RosterTooBig,
  formatIso,
  generate,
  isValidZone,
  parseIso,
  parsePattern,
  parsePeople,
  parseShiftTable,
  restGaps,
  serializeShiftTable,
  shiftOf,
  statsFor,
  toCsv,
  toIcs,
  weekdayOf,
  type Roster,
} from './logic';

const SLUG = 'shift-roster';

const HERE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const TODAY = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

/** DTSTAMP for the calendar file: when this chunk loaded. Read here rather
 *  than in the component, because a clock read during render is impure and the
 *  value has no business changing between two renders of the same roster. */
const LOADED_AT = Date.now();

const DEFAULT_PEOPLE = ['甲', '乙', '丙', '丁'].join('\n');
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROW_LIMIT = 120;

/**
 * Hands the file to the browser without a network request: the bytes are a
 * blob made in this tab. Some policies refuse script-started downloads, which
 * is why the copy buttons sit next to it rather than behind it.
 */
function save(name: string, text: string, mime: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export default function ShiftRoster({ l }: ToolProps) {
  const [peopleText, setPeopleText] = useState(() => read<string>(SLUG, 'people', DEFAULT_PEOPLE));
  const [patternText, setPatternText] = useState(() => read<string>(SLUG, 'pattern', DEFAULT_PATTERN.join(' ')));
  const [shiftText, setShiftText] = useState(() => read<string>(SLUG, 'shifts', serializeShiftTable(DEFAULT_SHIFTS)));
  const [startText, setStartText] = useState(TODAY);
  const [daysText, setDaysText] = useState('28');
  const [staggerText, setStaggerText] = useState('');
  const [zone, setZone] = useState(() => {
    const stored = read<string>(SLUG, 'zone', HERE);
    return typeof stored === 'string' && isValidZone(stored) ? stored : HERE;
  });
  const [only, setOnly] = useState('all');
  const [saveFailed, setSaveFailed] = useState(false);

  const people = useMemo(() => parsePeople(peopleText), [peopleText]);
  const pattern = useMemo(() => parsePattern(patternText), [patternText]);
  const shiftTable = useMemo(() => parseShiftTable(shiftText), [shiftText]);
  const startDay = parseIso(startText);
  const days = /^\d{1,3}$/.test(daysText.trim()) ? Number(daysText.trim()) : null;
  const staggerTyped = staggerText.trim();
  const stagger = staggerTyped === '' ? undefined : Number(staggerTyped);
  // Anything that is not a positive whole number falls back to the automatic
  // spread. Saying so beats silently ignoring what was typed.
  const staggerBroken = staggerTyped !== '' && !(Number.isInteger(stagger) && (stagger as number) > 0);

  const built = useMemo(() => {
    if (startDay === null || days === null) return { roster: null as Roster | null, error: null as string | null };
    try {
      return {
        roster: generate({
          people,
          shifts: shiftTable.shifts,
          pattern,
          startDay,
          days,
          stagger: Number.isFinite(stagger) ? stagger : undefined,
        }),
        error: null,
      };
    } catch (problem) {
      const message =
        problem instanceof RosterTooBig
          ? problem.what === 'days'
            ? t(l, `天數要在 1 到 ${LIMITS.maxDays} 之間。`, `Days must be between 1 and ${LIMITS.maxDays}.`)
            : problem.what === 'people'
              ? t(l, `人數上限 ${LIMITS.maxPeople}。`, `At most ${LIMITS.maxPeople} people.`)
              : t(l, `循環長度上限 ${LIMITS.maxPattern}。`, `A pattern of at most ${LIMITS.maxPattern}.`)
          : problem instanceof Error
            ? /undefined shift/.test(problem.message)
              ? t(
                  l,
                  `循環裡用到班別表沒有的代號:${problem.message.split(': ')[1]}`,
                  `The pattern uses a shift the table does not define: ${problem.message.split(': ')[1]}`
                )
              : people.length === 0
                ? t(l, '至少要有一個人。', 'At least one person is needed.')
                : t(l, '循環不能是空的。', 'The pattern cannot be empty.')
            : String(problem);
      return { roster: null, error: message };
    }
  }, [people, pattern, shiftTable.shifts, startDay, days, stagger, l]);

  const roster = built.roster;
  const stats = useMemo(() => (roster ? statsFor(roster) : []), [roster]);
  const gaps = useMemo(() => (roster ? restGaps(roster, 11) : []), [roster]);
  const csv = useMemo(() => (roster ? toCsv(roster) : ''), [roster]);

  const ics = useMemo(
    () =>
      roster
        ? toIcs(roster, {
            timeZone: zone,
            name: t(l, '輪班表', 'Shift roster'),
            stamp: LOADED_AT,
            onlyPerson: only === 'all' ? undefined : Number(only),
          })
        : '',
    [roster, zone, only, l]
  );

  const visible = roster ? roster.cells.slice(0, ROW_LIMIT) : [];
  const codes = roster ? roster.shifts.map((shift) => shift.code) : [];

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '人與循環', 'PEOPLE AND ROTATION')}</span>
            <span className="inst-no">
              {count(people.length)} {t(l, '人', 'people')} · {count(pattern.length)} {t(l, '格循環', 'slot cycle')}
            </span>
          </div>

          <Area
            label={t(l, '名單(一行一人)', 'People, one per line')}
            value={peopleText}
            onChange={(next) => {
              setPeopleText(next);
              write(SLUG, 'people', next);
            }}
            rows={5}
          />

          <Input
            label={t(l, '循環(班別代號,照順序)', 'Pattern of shift codes, in order')}
            value={patternText}
            onChange={(next) => {
              setPatternText(next);
              write(SLUG, 'pattern', next);
            }}
            hint={t(
              l,
              '例如 D D E E N N X X。每個人從循環的不同位置起算,所以每天每個班都有人。',
              'For example D D E E N N X X. Each person starts at a different point, so every shift is covered every day.'
            )}
          />

          <Row>
            <Input
              label={t(l, '起始日', 'Start date')}
              type="date"
              value={startText}
              onChange={setStartText}
              invalid={startDay === null}
            />
            <Input
              label={t(l, '產生幾天', 'How many days')}
              type="number"
              min={1}
              max={LIMITS.maxDays}
              value={daysText}
              onChange={setDaysText}
              invalid={days === null}
            />
            <Input
              label={t(l, '錯開幾格(空白=自動)', 'Stagger (blank = auto)')}
              value={staggerText}
              onChange={setStaggerText}
              invalid={staggerBroken}
              hint={
                staggerBroken
                  ? t(l, '要填正整數,目前這個值被忽略,改用自動', 'Needs a positive whole number; this value is ignored and the automatic spread is used')
                  : roster
                    ? `${t(l, '目前', 'now')} ${roster.stagger}`
                    : ''
              }
            />
          </Row>

          {built.error ? <Note error>{built.error}</Note> : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '班別表', 'SHIFTS')}</span>
            <span className="inst-no">{count(shiftTable.shifts.length)}</span>
          </div>

          <Area
            label={t(l, '代號, 名稱, 開始時間, 時數', 'code, name, start time, hours')}
            value={shiftText}
            onChange={(next) => {
              setShiftText(next);
              write(SLUG, 'shifts', next);
            }}
            rows={6}
            invalid={shiftTable.problems.length > 0}
          />
          <Row>
            <Btn
              onClick={() => {
                const seed = serializeShiftTable(DEFAULT_SHIFTS);
                setShiftText(seed);
                write(SLUG, 'shifts', seed);
              }}
            >
              {t(l, '回到預設班別', 'restore the default shifts')}
            </Btn>
          </Row>
          {shiftTable.problems.length > 0 ? (
            <Note error>
              {t(l, '這幾行讀不懂或代號重複:', 'Unreadable or duplicated on these lines:')}{' '}
              {shiftTable.problems.join('、')}
            </Note>
          ) : null}
          <Note>
            {t(
              l,
              '時數 0 代表休假。開始時間是當地時間,跨夜的班會自己延伸到隔天。這張表是你的,不是法規——班別長度與休息時數請對照勞基法與公司規章。',
              'Zero hours means a day off. Start times are local and a shift may run past midnight. This table is yours, not a statute: check lengths and rest against the law and your own rules.'
            )}
          </Note>
        </section>
      </div>

      {roster ? (
        <>
          <div className="mt-8">
            <Panel
              label={t(l, '每個人的量', 'PER PERSON')}
              aside={<span className="inst-no">{count(roster.days)} {t(l, '天', 'days')}</span>}
            >
              <Table
                head={[
                  t(l, '人', 'person'),
                  ...codes,
                  t(l, '上班天數', 'work days'),
                  t(l, '時數', 'hours'),
                  t(l, '最長連上', 'longest run'),
                ]}
                align={['left', ...codes.map(() => 'right' as const), 'right', 'right', 'right']}
                rows={stats.map((person) => [
                  person.name,
                  ...codes.map((code) => count(person.byCode[code] ?? 0)),
                  count(person.workDays),
                  count(person.hours),
                  count(person.longestStretch),
                ])}
              />
              {gaps.length > 0 ? (
                <Note error>
                  {t(
                    l,
                    `有 ${gaps.length} 處交接之間休息不到 11 小時,例如 ${gaps[0].person} 在 ${gaps[0].iso} 的 ${gaps[0].from} 接 ${gaps[0].to},只隔 ${gaps[0].hours} 小時。`,
                    `${gaps.length} changeovers leave under 11 hours of rest — for example ${gaps[0].person} on ${gaps[0].iso}, ${gaps[0].from} into ${gaps[0].to}, a gap of ${gaps[0].hours} hours.`
                  )}
                </Note>
              ) : (
                <Note>
                  {t(l, '沒有休息不足 11 小時的交接。', 'No changeover leaves under 11 hours of rest.')}
                </Note>
              )}
            </Panel>
          </div>

          <div className="mt-8">
            <Panel
              label={t(l, '班表', 'ROSTER')}
              aside={
                <span className="inst-no">
                  {formatIso(roster.startDay)} → {formatIso(roster.startDay + roster.days - 1)}
                </span>
              }
            >
              <Table
                head={[t(l, '日期', 'date'), t(l, '星期', 'day'), ...roster.people]}
                rows={visible.map((row, dayIndex) => {
                  const day = roster.startDay + dayIndex;
                  return [
                    <span key="d" className="inst-no">
                      {formatIso(day)}
                    </span>,
                    <span key="w" className="inst-no">
                      {l === 'en' ? WEEKDAY_EN[weekdayOf(day)] : WEEKDAY_ZH[weekdayOf(day)]}
                    </span>,
                    ...row.map((code, personIndex) => {
                      const shift = shiftOf(roster, code);
                      return (
                        <span
                          key={personIndex}
                          className="inst-no"
                          style={{ color: shift.hours > 0 ? 'var(--fg)' : 'var(--fg-faint)', fontSize: '0.875rem' }}
                          title={shift.label}
                        >
                          {code}
                        </span>
                      );
                    }),
                  ];
                })}
              />
              {roster.days > ROW_LIMIT ? (
                <Note>
                  {t(
                    l,
                    `畫面只列前 ${ROW_LIMIT} 天,匯出的檔案是完整 ${roster.days} 天。`,
                    `Only the first ${ROW_LIMIT} days are shown; the exported file has all ${roster.days}.`
                  )}
                </Note>
              ) : null}

              <Row>
                <Select
                  label={t(l, '行事曆時區', 'Calendar zone')}
                  value={zone}
                  // `zone` first: it is restored from storage and may name a
                  // zone this device is no longer in, which left the picker
                  // showing a different zone from the one the file used.
                  options={[...new Set([zone, HERE, 'Asia/Taipei', 'UTC'])].map((value) => ({ value, label: value }))}
                  onChange={(next) => {
                    setZone(next);
                    write(SLUG, 'zone', next);
                  }}
                />
                <Select
                  label={t(l, '行事曆只要誰的班', 'Calendar covers')}
                  value={only}
                  options={[
                    { value: 'all', label: t(l, '全部的人', 'everyone') },
                    ...roster.people.map((name, index) => ({ value: String(index), label: name })),
                  ]}
                  onChange={setOnly}
                />
              </Row>
              <Row>
                <CopyButton l={l} text={csv} label={t(l, '複製 CSV', 'copy CSV')} />
                <Btn
                  onClick={() => setSaveFailed(!save(`roster-${formatIso(roster.startDay)}.csv`, csv, 'text/csv'))}
                >
                  {t(l, '存成 CSV', 'save CSV')}
                </Btn>
                <CopyButton l={l} text={ics} label={t(l, '複製 ICS', 'copy ICS')} />
                <Btn
                  primary
                  onClick={() =>
                    setSaveFailed(
                      !save(`roster-${formatIso(roster.startDay)}.ics`, ics, 'text/calendar;charset=utf-8')
                    )
                  }
                >
                  {t(l, '存成 ICS 行事曆', 'save ICS')}
                </Btn>
              </Row>
              {saveFailed ? (
                <Note error>
                  {t(
                    l,
                    '瀏覽器擋掉了下載。用「複製」把內容貼進一個檔案,存成 .ics 或 .csv 也一樣能匯入。',
                    'The browser refused the download. Copy the text into a file and save it as .ics or .csv instead.'
                  )}
                </Note>
              ) : null}
              <Note>
                {t(
                  l,
                  'ICS 的時間寫成 UTC 絕對時刻(結尾 Z),由瀏覽器的時區資料換算,匯入任何行事曆都不會差一小時。休假日不產生事件。',
                  'The ICS writes absolute UTC instants (ending in Z), converted through the browser’s own zone data, so no calendar imports it an hour off. Days off create no events.'
                )}
              </Note>
            </Panel>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '人數', 'people'), v: count(people.length) },
          { k: t(l, '天數', 'days'), v: roster ? count(roster.days) : '—' },
          { k: t(l, '循環', 'cycle'), v: `${count(pattern.length)} / ${t(l, '錯開', 'stagger')} ${roster ? roster.stagger : '—'}` },
          { k: t(l, '總班次', 'shifts'), v: count(stats.reduce((sum, person) => sum + person.workDays, 0)) },
          { k: t(l, '休息不足', 'tight rests'), v: count(gaps.length) },
        ]}
      />
    </div>
  );
}
