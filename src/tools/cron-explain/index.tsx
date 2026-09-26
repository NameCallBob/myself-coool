'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
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
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  CronError,
  describe,
  detectDialect,
  nextRuns,
  parseCron,
  unionInEffect,
  type Cron,
  type Dialect,
  type Zone,
} from './logic';

/* ── The clock, as a store ────────────────── */
/**
 * `Date.now()` during render is impure — React 19 rejects it, and rightly: the
 * value would differ between the render and its replay. The current instant
 * therefore arrives through `useSyncExternalStore`, whose snapshot only changes
 * when the interval writes a new one.
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
/** Zero at build time: a statically rendered page has no "now". */
const serverClock = () => 0;

/* ── Formatting ───────────────────────────── */

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function stamp(ms: number, zone: Zone): string {
  const date = new Date(ms);
  const [y, mo, d, h, mi, s] =
    zone === 'utc'
      ? [
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
        ]
      : [
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          date.getHours(),
          date.getMinutes(),
          date.getSeconds(),
        ];
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

const WEEKDAY = {
  zh: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

function weekdayOf(ms: number, zone: Zone, l: 'zh' | 'en'): string {
  const date = new Date(ms);
  return WEEKDAY[l][zone === 'utc' ? date.getUTCDay() : date.getDay()];
}

/** Coarse gap, for "in about six hours". Deliberately not precise. */
function until(ms: number, fromMs: number, l: 'zh' | 'en'): string {
  const seconds = Math.round((ms - fromMs) / 1000);
  if (seconds < 60) return t(l, `${seconds} 秒後`, `in ${seconds}s`);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(l, `${minutes} 分後`, `in ${minutes}m`);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t(l, `${hours} 小時 ${minutes % 60} 分後`, `in ${hours}h ${minutes % 60}m`);
  const days = Math.floor(hours / 24);
  return t(l, `${days} 天 ${hours % 24} 小時後`, `in ${days}d ${hours % 24}h`);
}

const RUN_COUNT = 8;

const PRESETS: { label: string; text: string; dialect: Dialect }[] = [
  { label: '*/5 * * * *', text: '*/5 * * * *', dialect: 'unix' },
  { label: '0 3 * * *', text: '0 3 * * *', dialect: 'unix' },
  { label: '30 9 * * 1-5', text: '30 9 * * 1-5', dialect: 'unix' },
  { label: '0 0 1 * *', text: '0 0 1 * *', dialect: 'unix' },
  { label: '0 0 1 * MON', text: '0 0 1 * MON', dialect: 'unix' },
  { label: '@daily', text: '@daily', dialect: 'unix' },
  { label: '0 0 12 L * ?', text: '0 0 12 L * ?', dialect: 'quartz' },
  { label: '0 0 9 ? * 6#3', text: '0 0 9 ? * 6#3', dialect: 'quartz' },
];

function errorText(error: CronError, l: 'zh' | 'en'): string {
  const field = error.field ?? '';
  const token = error.token;
  switch (error.code) {
    case 'empty':
      return t(l, '還沒有輸入。', 'Nothing entered yet.');
    case 'field-count':
      return t(
        l,
        `欄位數不對:讀到 ${token} 欄。Unix 要 5 欄,Quartz 要 6 或 7 欄。上面的方言切換選錯了嗎?`,
        `Wrong field count: ${token}. Unix takes 5, Quartz takes 6 or 7. Is the dialect switch set right?`
      );
    case 'unknown-macro':
      return t(
        l,
        `不認得 ${token}。可用的有 @yearly、@annually、@monthly、@weekly、@daily、@midnight、@hourly、@reboot。`,
        `Unknown macro ${token}. Supported: @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly, @reboot.`
      );
    case 'empty-field':
      return t(l, `${field} 欄位是空的。`, `The ${field} field is empty.`);
    case 'bad-value':
      return t(l, `${field} 欄位讀不懂「${token}」。`, `Cannot read "${token}" in the ${field} field.`);
    case 'out-of-range':
      return t(l, `${field} 欄位的「${token}」超出範圍。`, `"${token}" is out of range for ${field}.`);
    case 'bad-step':
      return t(l, `步進值要是正整數:「${token}」。`, `A step must be a positive integer: "${token}".`);
    case 'quartz-only':
      return t(
        l,
        `「${token}」是 Quartz 的語法(?、L、#),Unix cron 不認。把方言切到 Quartz,或改寫成 Unix 能接受的形式。`,
        `"${token}" is Quartz syntax (?, L, #) and Unix cron does not accept it. Switch the dialect, or rewrite it.`
      );
    case 'question-placement':
      return t(l, '? 只能出現在日或週欄位。', '? is only allowed in the day-of-month or day-of-week field.');
    case 'list-with-special':
      return t(l, 'L 與 # 不能和逗號清單混用。', 'L and # cannot be combined with a comma list.');
    case 'unsupported':
      return token === 'H'
        ? t(
            l,
            'H 是 Jenkins 的雜湊排程,不是 cron。它的實際時刻取決於任務名稱的雜湊值,在這裡算不出來。',
            'H is Jenkins hash scheduling, not cron. The actual time depends on a hash of the job name and cannot be computed here.'
          )
        : t(
            l,
            'W(最近工作日)需要一份「工作日」的定義,Quartz 自己也只是近似。這裡不猜。',
            'W (nearest weekday) needs a definition of "working day" that even Quartz only approximates. This tool will not guess.'
          );
    default:
      return error.message;
  }
}

/**
 * A cron string, what it actually means, and when it actually fires.
 *
 * The dialect is a switch rather than a guess: the same six fields mean
 * different days under Quartz and Unix numbering, and silently picking one would
 * be the exact class of quietly-wrong answer this bench is supposed to avoid.
 */
export default function CronExplain({ l }: ToolProps) {
  const now = useSyncExternalStore(subscribeClock, readClock, serverClock);

  const [text, setText] = useState('0 3 * * *');
  const [dialect, setDialect] = useState<Dialect>('unix');
  const [zone, setZone] = useState<Zone>('local');
  const [reference, setReference] = useState('');

  const parsed = useMemo((): { cron: Cron; error: null } | { cron: null; error: CronError } => {
    try {
      return { cron: parseCron(text, dialect), error: null };
    } catch (error) {
      return {
        cron: null,
        error: error instanceof CronError ? error : new CronError('bad-value', null, String(error)),
      };
    }
  }, [text, dialect]);

  const reading = useMemo(
    () => (parsed.cron ? describe(parsed.cron, l) : null),
    [parsed.cron, l]
  );

  /** `datetime-local` is wall-clock text; parsing it as local is what it means. */
  const fromMs = useMemo(() => {
    if (reference === '') return now;
    const parsedReference = Date.parse(reference);
    return Number.isNaN(parsedReference) ? now : parsedReference;
  }, [reference, now]);

  const runs = useMemo(
    () => (parsed.cron ? nextRuns(parsed.cron, fromMs, RUN_COUNT, zone) : []),
    [parsed.cron, fromMs, zone]
  );

  const suggestedDialect = detectDialect(text);
  const mismatch = !text.trim().startsWith('@') && suggestedDialect !== dialect;

  return (
    <div>
      <Bench
        leftLabel={t(l, 'CRON 字串', 'CRON STRING')}
        rightLabel={t(l, '接下來幾次', 'NEXT RUNS')}
        leftAside={<span className="inst-no">{dialect === 'unix' ? '5' : '6–7'} fields</span>}
        rightAside={<span className="inst-no">{zone === 'utc' ? 'UTC' : t(l, '本地', 'local')}</span>}
        left={
          <>
            <Input
              label={t(l, 'Cron 表達式', 'Cron expression')}
              hint={t(
                l,
                'Unix 五欄:分 時 日 月 週。Quartz 六欄多一個秒在最前面,第七欄是年。',
                'Unix five fields: minute hour day month weekday. Quartz puts seconds first and takes an optional year seventh.'
              )}
              value={text}
              onChange={setText}
              invalid={parsed.error !== null && text.trim() !== ''}
              placeholder="*/15 9-18 * * 1-5"
            />

            <Row>
              <Seg
                label={t(l, '方言', 'Dialect')}
                value={dialect}
                onChange={setDialect}
                options={[
                  { value: 'unix', label: t(l, 'Unix 五欄', 'Unix 5') },
                  { value: 'quartz', label: t(l, 'Quartz 六欄', 'Quartz 6') },
                ]}
              />
              <Seg
                label={t(l, '時區', 'Zone')}
                value={zone}
                onChange={setZone}
                options={[
                  { value: 'local', label: t(l, '本地', 'local') },
                  { value: 'utc', label: 'UTC' },
                ]}
              />
              <CopyButton l={l} text={text} />
            </Row>

            {mismatch ? (
              <Note>
                {t(
                  l,
                  `這串有 ${count(text.trim().split(/\s+/).filter(Boolean).length)} 欄,看起來是 ${suggestedDialect === 'quartz' ? 'Quartz' : 'Unix'} 格式。`,
                  `This has ${count(text.trim().split(/\s+/).filter(Boolean).length)} fields, which looks like ${suggestedDialect === 'quartz' ? 'Quartz' : 'Unix'}.`
                )}{' '}
                <button
                  type="button"
                  className="inst-btn"
                  onClick={() => setDialect(suggestedDialect)}
                >
                  {t(l, '切到那個方言', 'switch dialect')}
                </button>
              </Note>
            ) : null}

            <div className="inst-field">
              <span className="inst-label">{t(l, '常見寫法', 'Common shapes')}</span>
              <div className="inst-toolbar">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="inst-btn"
                    onClick={() => {
                      setText(preset.text);
                      setDialect(preset.dialect);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {parsed.error !== null && text.trim() !== '' ? (
              <Note error>{errorText(parsed.error, l)}</Note>
            ) : null}

            {reading ? (
              <div className="inst-out mt-3" aria-live="polite">
                {reading.summary}
              </div>
            ) : null}

            {reading && reading.fields.length > 0 ? (
              <div className="mt-3">
                <Table
                  head={[t(l, '欄位', 'field'), t(l, '寫的', 'written'), t(l, '意思', 'means')]}
                  rows={reading.fields.map((field) => [
                    field.label,
                    <span key="raw" className="inst-no">
                      {field.raw}
                    </span>,
                    <span key="read" className="inst-wrap">
                      {field.reading}
                    </span>,
                  ])}
                />
              </div>
            ) : null}
          </>
        }
        right={
          <>
            <Input
              label={t(l, '起算時刻(留空 = 現在)', 'Reference instant (blank = now)')}
              hint={t(
                l,
                '輸入的是本地掛鐘時間。想看某個特定時間點之後的排程就填這裡。',
                'Entered as local wall-clock time. Fill it in to see the schedule after some particular moment.'
              )}
              type="datetime-local"
              value={reference}
              onChange={setReference}
            />

            <div aria-live="polite">
              {parsed.cron?.reboot ? (
                <Note>
                  {t(
                    l,
                    '@reboot 在開機時執行一次,它不是一個時刻,所以沒有「接下來幾次」可以列。',
                    '@reboot runs once at boot. It is an event rather than a time, so there is no list of next runs.'
                  )}
                </Note>
              ) : runs.length === 0 ? (
                <Note>
                  {parsed.cron
                    ? t(
                        l,
                        '未來八年內沒有符合的時刻。年份限制或不存在的日期(例如 2 月 30 日)會造成這種結果。',
                        'No matching instant within the next eight years. A year restriction or an impossible date (30 February) does that.'
                      )
                    : t(l, '先把上面的表達式修好。', 'Fix the expression first.')}
                </Note>
              ) : (
                <Table
                  head={[
                    '#',
                    t(l, '時刻', 'instant'),
                    t(l, '星期', 'day'),
                    t(l, '距離', 'from now'),
                  ]}
                  align={['right', 'left', 'left', 'right']}
                  rows={runs.map((run, index) => [
                    String(index + 1),
                    <span key="s" className="inst-no">
                      {stamp(run, zone)}
                    </span>,
                    weekdayOf(run, zone, l),
                    <span key="u" style={{ color: 'var(--fg-muted)' }}>
                      {until(run, fromMs, l)}
                    </span>,
                  ])}
                />
              )}
            </div>

            {runs.length > 0 ? (
              <Row>
                <CopyButton
                  l={l}
                  text={runs.map((run) => stamp(run, zone)).join('\n')}
                  label={t(l, '複製時刻', 'copy instants')}
                />
              </Row>
            ) : null}

            {zone === 'local' ? (
              <Note>
                {t(
                  l,
                  '本地時區的日光節約:春天往前跳掉的那一小時內的排程會被跳過,秋天重複的那一小時這裡只算一次。真實的 cron 在這兩天的行為各家實作不同,以你的 crontab(5) 說明為準。',
                  'Around a daylight-saving change: runs inside the hour that does not exist are skipped, and the repeated hour is counted once. Real cron implementations differ on both days — check your own crontab(5).'
                )}
              </Note>
            ) : null}
          </>
        }
      />

      {reading && reading.notes.length > 0 ? (
        <Panel label={t(l, '要注意的地方', 'WORTH KNOWING')}>
          {reading.notes.map((note) => (
            <Note key={note}>{note}</Note>
          ))}
        </Panel>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '方言', 'dialect'), v: dialect === 'unix' ? 'Unix 5' : 'Quartz 6/7' },
          {
            k: t(l, '欄位', 'fields'),
            v: parsed.cron ? count(parsed.cron.present.length) : '—',
          },
          {
            k: t(l, '日/週規則', 'day rule'),
            v: parsed.cron
              ? unionInEffect(parsed.cron)
                ? t(l, '聯集', 'union')
                : t(l, '單一欄位', 'single field')
              : '—',
          },
          { k: t(l, '列出次數', 'runs listed'), v: count(runs.length) },
          { k: t(l, '時區', 'zone'), v: zone === 'utc' ? 'UTC' : t(l, '本地', 'local') },
        ]}
      />
    </div>
  );
}
