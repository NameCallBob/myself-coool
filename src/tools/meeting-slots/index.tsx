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
  DEFAULT_PEOPLE,
  buildGrid,
  formatMinutes,
  gridToCsv,
  isValidZone,
  parseIsoDate,
  parsePeople,
  runsOf,
  type Slot,
  type Status,
} from './logic';

const SLUG = 'meeting-slots';

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

/** Status is never colour alone: each one has its own mark. */
const MARK: Record<Status, string> = { work: '●', awake: '○', asleep: '·' };
const STATUS_ZH: Record<Status, string> = { work: '上班', awake: '醒著', asleep: '睡覺' };
const STATUS_EN: Record<Status, string> = { work: 'working', awake: 'awake', asleep: 'asleep' };

function cellColour(status: Status): string {
  if (status === 'work') return 'var(--fg)';
  if (status === 'awake') return 'var(--fg-muted)';
  return 'var(--fg-faint)';
}

export default function MeetingSlots({ l }: ToolProps) {
  const [text, setText] = useState(() => read<string>(SLUG, 'people', DEFAULT_PEOPLE));
  const [date, setDate] = useState(TODAY);
  const [reference, setReference] = useState(() => {
    const stored = read<string>(SLUG, 'reference', HERE);
    return typeof stored === 'string' && isValidZone(stored) ? stored : HERE;
  });

  const parsed = useMemo(() => parsePeople(text), [text]);
  const parsedDate = parseIsoDate(date);

  // `reference` is included deliberately: it is restored from storage and can
  // also name a person who has since been deleted from the list. Leaving it out
  // left the picker showing someone else's zone while the grid used this one.
  const zoneOptions = useMemo(() => {
    const zones = new Set<string>([reference, HERE, 'UTC', ...parsed.people.map((person) => person.zone)]);
    return [...zones].map((zone) => ({ value: zone, label: zone }));
  }, [parsed.people, reference]);

  const grid: Slot[] = useMemo(
    () => (parsedDate ? buildGrid(parsedDate, reference, parsed.people) : []),
    [parsedDate, reference, parsed.people]
  );

  const fullRuns = useMemo(() => runsOf(grid, (slot) => slot.everyone), [grid]);
  const awakeRuns = useMemo(
    () => runsOf(grid, (slot) => parsed.people.length > 0 && slot.awakeCount === parsed.people.length),
    [grid, parsed.people.length]
  );

  const sharedHours = grid.filter((slot) => slot.everyone).length;
  const longest = fullRuns.length > 0 ? fullRuns[0] : null;

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '參加的人', 'PEOPLE')}</span>
            <span className="inst-no">{count(parsed.people.length)}</span>
          </div>

          <Area
            label={t(l, '一行一個人:名字, IANA 時區, 上班時間', 'One per line: name, IANA zone, working hours')}
            value={text}
            onChange={(next) => {
              setText(next);
              write(SLUG, 'people', next);
            }}
            rows={9}
            invalid={parsed.problems.length > 0}
          />

          <Row>
            <Btn
              onClick={() => {
                setText(DEFAULT_PEOPLE);
                write(SLUG, 'people', DEFAULT_PEOPLE);
              }}
            >
              {t(l, '回到範例', 'restore the example')}
            </Btn>
            <CopyButton l={l} text={text} label={t(l, '複製名單', 'copy the list')} />
          </Row>

          {parsed.problems.length > 0 ? (
            <Note error>
              {parsed.problems
                .slice(0, 5)
                .map((problem) =>
                  problem.reason === 'zone'
                    ? t(l, `第 ${problem.line} 行:時區名稱瀏覽器不認得`, `Line ${problem.line}: the browser does not know that zone`)
                    : problem.reason === 'hours'
                      ? t(l, `第 ${problem.line} 行:上班時間要像 9-18,而且結束要晚於開始`, `Line ${problem.line}: hours must look like 9-18, ending after they start`)
                      : t(l, `第 ${problem.line} 行:至少要有名字與時區`, `Line ${problem.line}: a name and a zone are the minimum`)
                )
                .join(' / ')}
            </Note>
          ) : null}

          <Row>
            <Input
              label={t(l, '哪一天', 'Which day')}
              type="date"
              value={date}
              onChange={setDate}
              invalid={parsedDate === null}
            />
            <Select
              label={t(l, '用誰的時間當基準', 'Rows are in')}
              value={reference}
              options={zoneOptions}
              onChange={(next) => {
                setReference(next);
                write(SLUG, 'reference', next);
              }}
            />
          </Row>

          <Note>
            {t(
              l,
              '每一格都是真實的那個時刻換算過去的,不是加減時差,所以日光節約的日子也對。換到別的日期,重疊時段可能就少一小時。',
              'Every cell converts a real instant rather than adding an offset, so days around a clock change are right. Move the date and the overlap can shift by an hour.'
            )}
          </Note>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '大家都在上班的時段', 'WHEN EVERYONE IS AT WORK')}</span>
            <span className="inst-no">
              {count(sharedHours)} {t(l, '小時', 'h')}
            </span>
          </div>

          <div className="inst-out" aria-live="polite" style={{ minHeight: 0 }}>
            {parsed.people.length === 0 ? (
              <span style={{ color: 'var(--fg-faint)' }}>{t(l, '左邊填至少一個人。', 'Add at least one person.')}</span>
            ) : fullRuns.length > 0 ? (
              <>
                <div style={{ fontSize: '1.75rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                  {fullRuns[0].label}
                </div>
                <div className="inst-no" style={{ marginTop: '0.4rem' }}>
                  {reference} · {t(l, '連續', 'a run of')} {count(fullRuns[0].length)} {t(l, '小時', 'h')}
                </div>
                {fullRuns.length > 1 ? (
                  <p className="inst-hint">
                    {t(l, '其他:', 'also:')}{' '}
                    {fullRuns
                      .slice(1)
                      .map((run) => run.label)
                      .join('、')}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.25rem', lineHeight: 1.4 }}>
                  {t(l, '沒有任何一小時所有人都在上班。', 'There is no hour when everyone is at work.')}
                </div>
                {awakeRuns.length > 0 ? (
                  <p className="inst-hint">
                    {t(l, '所有人至少都醒著的時段:', 'Everyone at least awake:')}{' '}
                    {awakeRuns
                      .slice(0, 3)
                      .map((run) => `${run.label} (${run.length}h)`)
                      .join('、')}
                  </p>
                ) : (
                  <p className="inst-hint">
                    {t(l, '連「都醒著」的時段也沒有,這組時區只能非同步。', 'Not even a shared waking hour: this set has to work asynchronously.')}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="inst-field">
            <span className="inst-label">{t(l, '符號', 'Marks')}</span>
            <p className="inst-hint">
              {MARK.work} {l === 'en' ? STATUS_EN.work : STATUS_ZH.work} · {MARK.awake}{' '}
              {l === 'en' ? STATUS_EN.awake : STATUS_ZH.awake} (07:00–23:00) · {MARK.asleep}{' '}
              {l === 'en' ? STATUS_EN.asleep : STATUS_ZH.asleep}
            </p>
          </div>
        </section>
      </div>

      {grid.length > 0 && parsed.people.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '二十四小時對照', 'THE TWENTY-FOUR HOURS')}
            aside={<span className="inst-no">{date} · {reference}</span>}
          >
            <Table
              head={[reference, ...parsed.people.map((person) => `${person.name} ${formatMinutes(person.start)}–${formatMinutes(person.end)}`)]}
              rows={grid.map((slot) => [
                <span
                  key="h"
                  className="inst-no"
                  style={slot.everyone ? { color: 'var(--accent)', fontSize: '0.875rem' } : { fontSize: '0.875rem' }}
                >
                  {slot.label}
                  {slot.everyone ? ` ${t(l, '全員', 'all')}` : ''}
                </span>,
                ...slot.cells.map((cell, index) => (
                  <span
                    key={index}
                    className="inst-no"
                    style={{ color: cellColour(cell.status), fontSize: '0.875rem' }}
                    title={l === 'en' ? STATUS_EN[cell.status] : STATUS_ZH[cell.status]}
                  >
                    {MARK[cell.status]} {cell.label}
                    {cell.dayShift === 0 ? '' : cell.dayShift > 0 ? ' +1d' : ' −1d'}
                  </span>
                )),
              ])}
            />
            <Row>
              <CopyButton l={l} text={gridToCsv(grid, reference)} label={t(l, '複製 CSV', 'copy CSV')} />
            </Row>
            <Note>
              {t(
                l,
                '一列是基準時區的一個整點。半小時制的時區(印度、尼泊爾、南澳)會顯示成 :30 或 :45,那是對的。',
                'Each row is one whole hour in the reference zone. Half-hour zones read :30 or :45, which is correct.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '人數', 'people'), v: count(parsed.people.length) },
          { k: t(l, '共同上班時數', 'shared work hours'), v: count(sharedHours) },
          { k: t(l, '最長連續', 'longest run'), v: longest ? `${count(longest.length)} h` : '0 h' },
          { k: t(l, '基準時區', 'reference'), v: reference },
          { k: t(l, '日期', 'date'), v: date },
        ]}
      />
    </div>
  );
}
