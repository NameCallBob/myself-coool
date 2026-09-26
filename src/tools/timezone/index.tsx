'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
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
import { read, write } from '@/lib/tools/storage';
import {
  CITY_ZONES,
  allZones,
  formatCivil,
  formatIsoDate,
  formatOffset,
  isValidZone,
  nextTransition,
  parseLocalInput,
  readZones,
  resolveZoned,
  zoneOffset,
  zoneParts,
  type ZoneReading,
} from './logic';

/**
 * A ticking clock as an external store.
 *
 * The house rule is that no component reads `Date.now()` while rendering: the
 * value would differ between two renders of the same state, which is exactly
 * what React 19's purity checks reject. A store solves it properly — the
 * timestamp is captured in the interval callback, cached in module scope, and
 * every render of every subscriber reads the same number.
 */
let tick = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === undefined) {
    tick = Date.now();
    timer = setInterval(() => {
      tick = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const snapshot = () => tick;

function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

const SLUG = 'timezone';
const HERE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const DEFAULT_ZONES = [...new Set([HERE, 'Asia/Taipei', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles'])];

const LABELS = new Map(CITY_ZONES.map((entry) => [entry.zone, entry]));

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clock(reading: ZoneReading): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(reading.parts.hour)}:${pad(reading.parts.minute)}:${pad(reading.parts.second)}`;
}

export default function Timezone({ l }: ToolProps) {
  const now = useNow();
  const [zones, setZones] = useState<string[]>(() => {
    const stored = read<string[]>(SLUG, 'zones', DEFAULT_ZONES);
    const kept = Array.isArray(stored) ? stored.filter((zone) => typeof zone === 'string' && isValidZone(zone)) : [];
    return kept.length > 0 ? kept : DEFAULT_ZONES;
  });
  const [reference, setReference] = useState(() => {
    const stored = read<string>(SLUG, 'reference', HERE);
    return typeof stored === 'string' && isValidZone(stored) ? stored : HERE;
  });
  const [mode, setMode] = useState<'now' | 'pinned'>('now');
  const [wall, setWall] = useState('');
  const [adding, setAdding] = useState('');

  const everyZone = useMemo(() => allZones(), []);

  const persistZones = (next: string[]) => {
    setZones(next);
    write(SLUG, 'zones', next);
  };

  const pinned = useMemo(() => (mode === 'pinned' ? parseLocalInput(wall) : null), [mode, wall]);
  const resolution = useMemo(
    () => (pinned ? resolveZoned(pinned, reference) : null),
    [pinned, reference]
  );

  const instant = resolution ? resolution.instant : now;
  const rows = useMemo(() => readZones(instant, zones, reference), [instant, zones, reference]);

  const transitions = useMemo(
    () =>
      rows
        .map((row) => {
          const at = nextTransition(instant, row.zone);
          if (at === null) return null;
          return {
            zone: row.zone,
            at,
            from: zoneOffset(at - 1000, row.zone),
            to: zoneOffset(at, row.zone),
            local: zoneParts(at, row.zone),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => a.at - b.at),
    [rows, instant]
  );

  const offsets = rows.map((row) => row.offset);
  const spread = offsets.length > 1 ? Math.max(...offsets) - Math.min(...offsets) : 0;
  const days = new Set(rows.map((row) => row.shift)).size;

  const asText = rows
    .map((row) => {
      const name = LABELS.get(row.zone);
      const label = name ? (l === 'en' ? name.en : name.zh) : row.zone;
      return [
        label.padEnd(12, ' '),
        formatCivil(row.parts, true),
        formatOffset(row.offset),
        row.abbrev,
        row.daylight ? 'DST' : '',
      ]
        .join('  ')
        .trimEnd();
    })
    .join('\n');

  const pinFailed = mode === 'pinned' && wall.trim() !== '' && pinned === null;

  return (
    <div>
      <Panel
        label={t(l, '時刻', 'MOMENT')}
        aside={<span className="inst-no">{formatCivil(zoneParts(instant, reference), true)}</span>}
      >
        <Row>
          <Seg
            label={t(l, '要看哪個時刻', 'Which moment')}
            value={mode}
            onChange={(next) => {
              if (next === 'pinned' && wall === '') {
                // Seeding from the clock happens here, in an event handler,
                // never while rendering.
                const here = zoneParts(Date.now(), reference);
                setWall(formatCivil(here).replace(' ', 'T'));
              }
              setMode(next);
            }}
            options={[
              { value: 'now', label: t(l, '現在', 'now') },
              { value: 'pinned', label: t(l, '指定時刻', 'a set time') },
            ]}
          />
          <Select
            label={t(l, '這個時刻屬於', 'Read as local time in')}
            value={reference}
            options={everyZone.map((zone) => ({ value: zone, label: zone }))}
            onChange={(next) => {
              setReference(next);
              write(SLUG, 'reference', next);
            }}
          />
          {mode === 'pinned' ? (
            <Input
              label={t(l, '當地日期時間', 'Local date and time')}
              type="datetime-local"
              value={wall}
              onChange={setWall}
              invalid={pinFailed}
            />
          ) : null}
        </Row>

        {pinFailed ? (
          <Note error>
            {t(l, '看不懂這個日期時間,格式要像 2026-09-26T14:30。', 'Could not read that date and time; it should look like 2026-09-26T14:30.')}
          </Note>
        ) : null}

        {resolution?.kind === 'gap' ? (
          <Note error>
            {t(
              l,
              `這個當地時間在 ${reference} 不存在——那天時鐘往前跳,這一小時被跳過了。下面顯示的是跳完之後的第一個時刻。`,
              `That local time does not exist in ${reference}: clocks jumped forward and the hour was skipped. Shown below is the first instant after the jump.`
            )}
          </Note>
        ) : null}
        {resolution?.kind === 'ambiguous' ? (
          <Note>
            {t(
              l,
              `這個當地時間在 ${reference} 出現兩次——那天時鐘往後撥。下面取的是第一次(偏移 ${formatOffset(resolution.offset)})。`,
              `That local time happens twice in ${reference}: clocks went back. Taking the first pass (offset ${formatOffset(resolution.offset)}).`
            )}
          </Note>
        ) : null}
      </Panel>

      <div className="mt-8">
        <Panel
          label={t(l, '各地時間', 'AROUND THE WORLD')}
          aside={<span className="inst-no">{count(rows.length)} zones</span>}
        >
          <Table
            head={[
              t(l, '地點', 'place'),
              t(l, '時間', 'time'),
              t(l, '日期', 'date'),
              t(l, '偏移', 'offset'),
              t(l, '標記', 'flags'),
              '',
            ]}
            align={['left', 'right', 'left', 'right', 'left', 'right']}
            rows={rows.map((row) => {
              const name = LABELS.get(row.zone);
              const weekday = l === 'en' ? WEEKDAY_EN[row.parts.weekday] : WEEKDAY_ZH[row.parts.weekday];
              return [
                <span key="name">
                  {name ? (l === 'en' ? name.en : name.zh) : row.zone}
                  <span className="inst-no" style={{ display: 'block' }}>
                    {row.zone}
                  </span>
                </span>,
                <span key="time" className="inst-no" style={{ fontSize: '0.9375rem', color: 'var(--fg)' }}>
                  {clock(row)}
                </span>,
                <span key="date" className="inst-no">
                  {formatIsoDate(row.parts)} ({weekday})
                  {row.shift === 0 ? null : (
                    <b style={{ color: 'var(--accent)' }}>{row.shift > 0 ? ` +${row.shift}d` : ` ${row.shift}d`}</b>
                  )}
                </span>,
                <span key="offset" className="inst-no">
                  {formatOffset(row.offset)}
                </span>,
                <span key="flags" className="inst-no">
                  {row.abbrev}
                  {row.daylight ? ` · ${t(l, '日光節約中', 'on DST')}` : ''}
                </span>,
                <Btn key="drop" onClick={() => persistZones(zones.filter((zone) => zone !== row.zone))}>
                  {t(l, '移除', 'remove')}
                </Btn>,
              ];
            })}
          />

          <Row>
            <Select
              label={t(l, '加入時區', 'Add a zone')}
              value={adding}
              options={[
                { value: '', label: t(l, '選一個…', 'choose…') },
                ...everyZone
                  .filter((zone) => !zones.includes(zone))
                  .map((zone) => {
                    const name = LABELS.get(zone);
                    return { value: zone, label: name ? `${zone} — ${l === 'en' ? name.en : name.zh}` : zone };
                  }),
              ]}
              onChange={(zone) => {
                setAdding('');
                if (zone !== '' && !zones.includes(zone)) persistZones([...zones, zone]);
              }}
            />
            <CopyButton l={l} text={asText} label={t(l, '複製整張表', 'copy the table')} />
            <Btn onClick={() => persistZones(DEFAULT_ZONES)}>{t(l, '回到預設', 'reset zones')}</Btn>
          </Row>
          <Note>
            {t(
              l,
              '時區資料來自瀏覽器內建的 IANA 資料庫,沒有另外打包一份表。所選的城市清單留在這台裝置。',
              'Zone data comes from the browser’s built-in IANA database; no table is bundled here. Your city list stays on this device.'
            )}
          </Note>
        </Panel>
      </div>

      {transitions.length > 0 ? (
        <div className="mt-8">
          <Panel label={t(l, '接下來一年內的偏移變更', 'OFFSET CHANGES IN THE NEXT YEAR')}>
            <Table
              head={[t(l, '時區', 'zone'), t(l, '當地時間', 'local time'), t(l, '偏移', 'offset')]}
              align={['left', 'left', 'right']}
              rows={transitions.map((entry) => [
                <span key="z" className="inst-no">
                  {entry.zone}
                </span>,
                <span key="w" className="inst-no">
                  {formatCivil(entry.local, false)}
                </span>,
                <span key="o" className="inst-no">
                  {formatOffset(entry.from)} → {formatOffset(entry.to)}
                </span>,
              ])}
            />
            <Note>
              {t(
                l,
                '往後掃 400 天,只找第一次變更。時鐘往前跳的那一小時不存在,排在那個範圍的會議會被行事曆自己挪掉。',
                'Scanned 400 days ahead for the first change only. The skipped hour does not exist, and calendars move meetings placed in it.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '時區', 'zones'), v: count(rows.length) },
          { k: t(l, '最大時差', 'spread'), v: `${(spread / 60).toFixed(spread % 60 === 0 ? 0 : 2)} h` },
          { k: t(l, '橫跨日期', 'calendar days'), v: count(days) },
          { k: t(l, '日光節約中', 'on DST'), v: count(rows.filter((row) => row.daylight).length) },
          { k: t(l, '資料來源', 'zone data'), v: 'Intl / IANA' },
        ]}
      />
    </div>
  );
}
