'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
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
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { read, remove, write } from '@/lib/tools/storage';
import {
  MAX_ENTRIES,
  billable,
  dailyTotals,
  durationOf,
  findOverlaps,
  formatClock,
  formatHm,
  formatHours,
  grandTotal,
  isRunning,
  localDateKey,
  makeId,
  projectTotals,
  removeEntry,
  sanitiseEntries,
  startEntry,
  stopEntry,
  toCsv,
  trimEntries,
  updateEntry,
  type Entry,
  type RoundMode,
} from './logic';

const SLUG = 'timesheet';

/** Read at chunk load so the first paint of a restored running entry is right. */
const LOADED_AT = Date.now();

const TODAY = localDateKey(LOADED_AT);
const ROW_LIMIT = 80;

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

/** `2026-09-28` + `09:30` → epoch milliseconds in this device's zone. */
function localInstant(date: string, clock: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const c = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!d || !c) return null;
  const hour = Number(c[1]);
  const minute = Number(c[2]);
  if (hour > 23 || minute > 59) return null;
  const made = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute, 0, 0);
  if (made.getMonth() + 1 !== Number(d[2]) || made.getDate() !== Number(d[3])) return null;
  return made.getTime();
}

export default function Timesheet({ l }: ToolProps) {
  const [entries, setEntries] = useState<Entry[]>(() => sanitiseEntries(read<unknown>(SLUG, 'entries', [])));
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<RoundMode>('exact');
  const [step, setStep] = useState('6');
  const [now, setNow] = useState(LOADED_AT);
  const [saveFailed, setSaveFailed] = useState(false);

  // Manual back-fill, for the block you forgot to start.
  const [manualDate, setManualDate] = useState(TODAY);
  const [manualFrom, setManualFrom] = useState('09:00');
  const [manualTo, setManualTo] = useState('10:00');

  const running = entries.filter(isRunning);
  const hasRunning = running.length > 0;

  // Only ticks while something is running, and sets state from the callback
  // rather than from the effect body.
  useEffect(() => {
    if (!hasRunning) return undefined;
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [hasRunning]);

  const persist = (next: Entry[]) => {
    setEntries(next);
    write(SLUG, 'entries', next);
  };

  const granularity = Number(step);
  const days = useMemo(() => dailyTotals(entries, now, mode, granularity), [entries, now, mode, granularity]);
  const projects = useMemo(() => projectTotals(entries, now, mode, granularity), [entries, now, mode, granularity]);
  const whole = useMemo(() => grandTotal(entries, now, mode, granularity), [entries, now, mode, granularity]);
  const overlaps = useMemo(() => findOverlaps(entries, now), [entries, now]);
  const csv = useMemo(() => toCsv(entries, now, mode, granularity), [entries, now, mode, granularity]);
  const today = days.find((day) => day.key === localDateKey(now));

  const onStart = () => {
    const at = Date.now();
    setNow(at);
    persist(startEntry(entries, { project, note, now: at, id: makeId(at, entries.length + 1) }));
    setNote('');
  };

  const onStopAll = () => {
    const at = Date.now();
    setNow(at);
    persist(entries.map((entry) => (isRunning(entry) ? { ...entry, end: at } : entry)));
  };

  const onManualAdd = () => {
    const from = localInstant(manualDate, manualFrom);
    const to = localInstant(manualDate, manualTo);
    if (from === null || to === null || from === to) return;
    const at = Date.now();
    // A range that ends before it starts is read as running past midnight.
    // Equal times never reach here — see `manualOk`.
    const end = to < from ? to + 86_400_000 : to;
    persist(
      trimEntries([
        ...entries,
        {
          id: makeId(at, entries.length + 101),
          project: project.trim() === '' ? '—' : project.trim(),
          note: note.trim(),
          start: from,
          end,
        },
      ])
    );
  };

  const recent = entries.slice().reverse().slice(0, ROW_LIMIT);
  const manualFromAt = localInstant(manualDate, manualFrom);
  const manualToAt = localInstant(manualDate, manualTo);
  // Equal times are rejected rather than read as running past midnight: an
  // accidental 09:00–09:00 silently became a twenty-four-hour block.
  const manualOk = manualFromAt !== null && manualToAt !== null && manualFromAt !== manualToAt;

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '計時', 'CLOCK')}</span>
            <span className="inst-no">
              {hasRunning ? t(l, '計時中', 'running') : t(l, '停止', 'stopped')}
            </span>
          </div>

          <Row>
            <Input
              label={t(l, '案子', 'Project')}
              value={project}
              onChange={setProject}
              placeholder={t(l, '例如 內部網站改版', 'e.g. site rebuild')}
            />
            <Input label={t(l, '註記', 'Note')} value={note} onChange={setNote} />
          </Row>

          <div className="inst-out" aria-live="polite" style={{ minHeight: 0 }}>
            {hasRunning ? (
              <>
                <div style={{ fontSize: '2.25rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {formatHm(durationOf(running[0], now))}
                </div>
                <div className="inst-no" style={{ marginTop: '0.4rem' }}>
                  {running[0].project} · {t(l, '從', 'since')} {formatClock(running[0].start)}
                  {running[0].note ? ` · ${running[0].note}` : ''}
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--fg-faint)' }}>
                {t(l, '填案子名稱然後按開始。按開始會自動停掉上一段。', 'Name a project and press start. Starting stops whatever was running.')}
              </span>
            )}
          </div>

          <Row>
            <Btn onClick={onStart} primary>
              {hasRunning ? t(l, '換到新的一段', 'switch task') : t(l, '開始', 'start')}
            </Btn>
            <Btn onClick={onStopAll} disabled={!hasRunning}>
              {t(l, '停止', 'stop')}
            </Btn>
          </Row>

          <div className="inst-field">
            <span className="inst-label">{t(l, '補登一段(忘記按開始的時候)', 'Back-fill a block')}</span>
            <div className="inst-toolbar">
              <Input label={t(l, '日期', 'Date')} type="date" value={manualDate} onChange={setManualDate} />
              <Input label={t(l, '從', 'From')} type="time" value={manualFrom} onChange={setManualFrom} />
              <Input label={t(l, '到', 'To')} type="time" value={manualTo} onChange={setManualTo} />
              <Btn onClick={onManualAdd} disabled={!manualOk}>
                {t(l, '補登', 'add')}
              </Btn>
            </div>
            <p className="inst-hint">
              {t(l, '結束時間比開始早,就當成跨夜到隔天;兩個時間一樣則不受理。用上面的案子與註記欄。', 'An end earlier than the start is read as running past midnight; two identical times are refused. It uses the project and note above.')}
            </p>
          </div>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '合計', 'TOTALS')}</span>
            <span className="inst-no">{localDateKey(now)}</span>
          </div>

          <div className="inst-out" style={{ minHeight: 0 }}>
            <div style={{ fontSize: '2.25rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {today ? formatHm(today.ms) : '0m'}
              <span className="inst-no" style={{ fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                {t(l, '今天', 'today')}
              </span>
            </div>
            <div className="inst-no" style={{ marginTop: '0.4rem' }}>
              {t(l, '可計費', 'billable')} {today ? formatHours(today.billableMs) : '0.00'} h ·{' '}
              {t(l, '全部', 'all time')} {formatHours(whole.ms)} h
            </div>
          </div>

          <Row>
            <Seg
              label={t(l, '計費取整', 'Billing rounding')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'exact', label: t(l, '實際', 'exact') },
                { value: 'nearest', label: t(l, '四捨五入', 'nearest') },
                { value: 'up', label: t(l, '進位', 'round up') },
              ]}
            />
            <Select
              label={t(l, '級距(分)', 'Increment (min)')}
              value={step}
              options={[
                { value: '1', label: '1' },
                { value: '6', label: '6' },
                { value: '15', label: '15' },
                { value: '30', label: '30' },
                { value: '60', label: '60' },
              ]}
              onChange={setStep}
            />
          </Row>

          {projects.length > 0 ? (
            <Table
              head={[t(l, '案子', 'project'), t(l, '時數', 'hours'), t(l, '計費', 'billable'), t(l, '筆數', 'entries')]}
              align={['left', 'right', 'right', 'right']}
              rows={projects.map((group) => [
                group.key,
                formatHm(group.ms),
                formatHours(group.billableMs),
                count(group.entries),
              ])}
            />
          ) : null}

          {overlaps.length > 0 ? (
            <Note error>
              {t(
                l,
                `有 ${overlaps.length} 組時間重疊(例如「${overlaps[0].a.project}」與「${overlaps[0].b.project}」重疊 ${formatHm(overlaps[0].ms)}),合計會算成兩份。`,
                `${overlaps.length} pairs of entries overlap (for example "${overlaps[0].a.project}" and "${overlaps[0].b.project}" by ${formatHm(overlaps[0].ms)}), so the total counts that time twice.`
              )}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              '取整是一筆一筆算,不是把總和取整——這兩種算法金額不同,只有前者對得上每一列。',
              'Rounding is applied per entry, never to the total: the two give different figures and only the first reconciles with the rows.'
            )}
          </Note>
        </section>
      </div>

      {days.length > 0 ? (
        <div className="mt-8">
          <Panel label={t(l, '每天', 'BY DAY')}>
            <Table
              head={[t(l, '日期', 'date'), t(l, '時數', 'hours'), t(l, '計費時數', 'billable hours'), t(l, '筆數', 'entries')]}
              align={['left', 'right', 'right', 'right']}
              rows={days
                .slice()
                .reverse()
                .slice(0, 31)
                .map((day) => [
                  <span key="d" className="inst-no" style={day.key === localDateKey(now) ? { color: 'var(--accent)' } : undefined}>
                    {day.key}
                  </span>,
                  formatHm(day.ms),
                  formatHours(day.billableMs),
                  count(day.entries),
                ])}
            />
          </Panel>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '每一段', 'ENTRIES')}
            aside={<span className="inst-no">{count(entries.length)} / {count(MAX_ENTRIES)}</span>}
          >
            <Table
              head={[
                t(l, '日期', 'date'),
                t(l, '起', 'from'),
                t(l, '迄', 'to'),
                t(l, '長度', 'length'),
                t(l, '計費', 'billable'),
                t(l, '案子', 'project'),
                t(l, '註記', 'note'),
                '',
              ]}
              align={['left', 'right', 'right', 'right', 'right', 'left', 'left', 'right']}
              rows={recent.map((entry) => {
                const ms = durationOf(entry, now);
                return [
                  <span key="d" className="inst-no">
                    {localDateKey(entry.start)}
                  </span>,
                  <span key="s" className="inst-no">
                    {formatClock(entry.start)}
                  </span>,
                  <span key="e" className="inst-no">
                    {entry.end === null ? t(l, '進行中', 'running') : formatClock(entry.end)}
                  </span>,
                  <span key="l" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {formatHm(ms)}
                  </span>,
                  <span key="b" className="inst-no">
                    {formatHours(billable(ms, mode, granularity))}
                  </span>,
                  entry.project,
                  <input
                    key="n"
                    className="inst-input"
                    value={entry.note}
                    aria-label={t(l, '註記', 'note')}
                    onChange={(event) => persist(updateEntry(entries, entry.id, { note: event.target.value }))}
                  />,
                  <span key="a" style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    {isRunning(entry) ? (
                      <Btn
                        onClick={() => {
                          const at = Date.now();
                          setNow(at);
                          persist(stopEntry(entries, entry.id, at));
                        }}
                      >
                        {t(l, '停止', 'stop')}
                      </Btn>
                    ) : null}
                    <Btn onClick={() => persist(removeEntry(entries, entry.id))}>{t(l, '刪除', 'delete')}</Btn>
                  </span>,
                ];
              })}
            />
            {entries.length > ROW_LIMIT ? (
              <Note>
                {t(
                  l,
                  `畫面只列最近 ${ROW_LIMIT} 筆,匯出的 CSV 是全部 ${entries.length} 筆。`,
                  `Only the most recent ${ROW_LIMIT} are shown; the CSV has all ${entries.length}.`
                )}
              </Note>
            ) : null}

            <Row>
              <CopyButton l={l} text={csv} label={t(l, '複製 CSV', 'copy CSV')} />
              <Btn onClick={() => setSaveFailed(!save(`timesheet-${localDateKey(now)}.csv`, csv, 'text/csv'))}>
                {t(l, '存成 CSV', 'save CSV')}
              </Btn>
              <Btn
                onClick={() => {
                  if (
                    window.confirm(
                      t(l, '刪掉這台裝置上所有工時記錄?這個動作沒有復原。', 'Delete every entry stored on this device? This cannot be undone.')
                    )
                  ) {
                    setEntries([]);
                    remove(SLUG, 'entries');
                  }
                }}
              >
                {t(l, '全部清除', 'clear everything')}
              </Btn>
            </Row>
            {saveFailed ? (
              <Note error>
                {t(l, '瀏覽器擋掉下載,用「複製 CSV」再自己貼進檔案。', 'The browser refused the download; use copy instead.')}
              </Note>
            ) : null}
            <Note>
              {t(
                l,
                `記錄存在這台裝置的瀏覽器裡,沒有帳號也沒有同步,換裝置或清瀏覽資料就不見了。最多留 ${MAX_ENTRIES} 筆,超過會從最舊的開始丟。`,
                `Entries live in this browser only — no account, no sync. Clearing site data deletes them. At most ${MAX_ENTRIES} are kept; the oldest are dropped.`
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '今天', 'today'), v: today ? formatHm(today.ms) : '0m' },
          { k: t(l, '今天計費', 'billable today'), v: `${today ? formatHours(today.billableMs) : '0.00'} h` },
          { k: t(l, '筆數', 'entries'), v: count(entries.length) },
          { k: t(l, '案子數', 'projects'), v: count(projects.length) },
          { k: t(l, '重疊', 'overlaps'), v: count(overlaps.length) },
        ]}
      />
    </div>
  );
}
