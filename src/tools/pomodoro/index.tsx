'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, Check2, CopyButton, Input, Note, Panel, Readout, Row, Table } from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { read, remove, write } from '@/lib/tools/storage';
import { useOfflineCapable, useOnline } from '@/lib/tools/useClientFacts';
import {
  DEFAULT_CONFIG,
  IDLE,
  clampConfig,
  elapsed,
  formatClock,
  logToCsv,
  pause,
  phaseAt,
  planCycle,
  recentDays,
  recordWork,
  sanitiseLog,
  setLength,
  start,
  streak,
  tallyFor,
  totals,
  trimLog,
  type Config,
  type Log,
  type PhaseKind,
  type TimerState,
} from './logic';

const SLUG = 'pomodoro';

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Captured at chunk load; a session that spans midnight is re-read on each
 *  completed block, so this is only the initial label. */
const LOADED_DATE = todayIso();

const KIND_ZH: Record<PhaseKind, string> = { work: '工作', short: '休息', long: '長休息' };
const KIND_EN: Record<PhaseKind, string> = { work: 'work', short: 'break', long: 'long break' };

function chirp(times: number) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    osc.connect(gain);
    const at = ctx.currentTime;
    for (let i = 0; i < times; i += 1) {
      const from = at + i * 0.3;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(0.2, from + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.22);
    }
    osc.start(at);
    osc.stop(at + times * 0.3 + 0.1);
    osc.onended = () => void ctx.close();
  } catch {
    /* no audio output — the screen still changes */
  }
}

export default function Pomodoro({ l }: ToolProps) {
  const online = useOnline();
  const offlineCapable = useOfflineCapable();

  const [config, setConfig] = useState<Config>(() => clampConfig(read<Config>(SLUG, 'config', DEFAULT_CONFIG)));
  const [log, setLog] = useState<Log>(() => sanitiseLog(read<unknown>(SLUG, 'log', [])));
  const [auto, setAuto] = useState<boolean>(() => read<boolean>(SLUG, 'auto', true) !== false);
  const [index, setIndex] = useState(0);
  const [timer, setTimer] = useState<TimerState>(IDLE);
  const [now, setNow] = useState(0);
  const [today, setToday] = useState(LOADED_DATE);
  const [notify, setNotify] = useState(false);
  const [permission, setPermission] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('default');

  // Mirrors for the interval callback, all written from event handlers.
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const deadline = useRef<number | null>(null);
  const indexRef = useRef(0);
  const configRef = useRef(config);
  const autoRef = useRef(auto);
  const logRef = useRef(log);
  const notifyRef = useRef(false);

  const announce = useCallback(
    (kind: PhaseKind) => {
      chirp(kind === 'work' ? 2 : 3);
      if (notifyRef.current && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(
            kind === 'work' ? t(l, '工作段結束', 'Work block done') : t(l, '休息結束', 'Break over'),
            {
              body:
                kind === 'work'
                  ? t(l, '去走一走。', 'Go and stand up.')
                  : t(l, '回來繼續。', 'Back to it.'),
              tag: 'tools-pomodoro',
            }
          );
        } catch {
          /* constructed notifications are refused in some browsers */
        }
      }
    },
    [l]
  );

  const halt = useCallback(() => {
    clearInterval(ticker.current);
    ticker.current = undefined;
  }, []);

  const complete = useCallback(
    (at: number) => {
      const phase = phaseAt(indexRef.current, configRef.current);
      if (phase.kind === 'work') {
        const date = todayIso();
        const next = trimLog(recordWork(logRef.current, date, phase.minutes));
        logRef.current = next;
        setLog(next);
        setToday(date);
        write(SLUG, 'log', next);
      }
      announce(phase.kind);

      const nextIndex = indexRef.current + 1;
      indexRef.current = nextIndex;
      setIndex(nextIndex);

      if (autoRef.current) {
        setTimer(start(IDLE, at));
        setNow(at);
        deadline.current = at + phaseAt(nextIndex, configRef.current).ms;
      } else {
        setTimer(IDLE);
        deadline.current = null;
        halt();
      }
    },
    [announce, halt]
  );

  const tick = useCallback(() => {
    const at = Date.now();
    setNow(at);
    if (deadline.current !== null && at >= deadline.current) complete(at);
  }, [complete]);

  const run = useCallback(() => {
    if (ticker.current !== undefined) return;
    ticker.current = setInterval(tick, 250);
  }, [tick]);

  useEffect(() => () => clearInterval(ticker.current), []);

  const phase = phaseAt(index, config);
  const left = phase.ms - elapsed(timer, now);

  const onStart = () => {
    const at = Date.now();
    const next = start(timer, at);
    setTimer(next);
    setNow(at);
    deadline.current = at + (phase.ms - elapsed(next, at));
    run();
  };

  const onPause = () => {
    const at = Date.now();
    setTimer(pause(timer, at));
    setNow(at);
    deadline.current = null;
    halt();
  };

  const onSkip = () => {
    // Skipping is not finishing: nothing is recorded.
    const nextIndex = index + 1;
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    setTimer(IDLE);
    deadline.current = null;
    halt();
  };

  const onReset = () => {
    indexRef.current = 0;
    setIndex(0);
    setTimer(IDLE);
    deadline.current = null;
    halt();
  };

  const changeConfig = (key: keyof Config, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const next = clampConfig({ ...config, [key]: parsed });
    setConfig(next);
    configRef.current = next;
    write(SLUG, 'config', next);
    if (!timer.running) {
      setTimer(IDLE);
      deadline.current = null;
      return;
    }
    // Still running: the deadline has to move with the new length. Leaving it
    // where it was made the digits count down to the new length while the
    // alarm still fired at the old one — a clock and a bell disagreeing.
    const at = Date.now();
    setNow(at);
    deadline.current = at + (phaseAt(index, next).ms - elapsed(timer, at));
  };

  const askToNotify = (wanted: boolean) => {
    if (!wanted) {
      setNotify(false);
      notifyRef.current = false;
      return;
    }
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      setNotify(true);
      notifyRef.current = true;
      setPermission('granted');
      return;
    }
    void Notification.requestPermission().then((result) => {
      setPermission(result === 'granted' ? 'granted' : 'denied');
      setNotify(result === 'granted');
      notifyRef.current = result === 'granted';
    });
  };

  const day = tallyFor(log, today);
  const whole = totals(log);
  const strip = recentDays(log, today, 7);
  const upcoming = planCycle(config, index + 6).slice(index, index + 6);
  const kindName = l === 'en' ? KIND_EN[phase.kind] : KIND_ZH[phase.kind];

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '現在', 'NOW')}</span>
            <span className="inst-no">
              {t(l, '第', 'block')} {count(phase.round)} {t(l, '段', '')} · {kindName} · {phase.minutes} min
            </span>
          </div>

          {/* Not a live region: the digits change every second, and a screen
              reader announcing them would never stop talking. The phase line
              below carries role="status" instead, so what is announced is the
              thing that actually changes — work to break and back. */}
          <div className="inst-out" aria-live="off" style={{ minHeight: 0 }}>
            <div
              style={{
                fontSize: 'clamp(2.75rem, 12vw, 5rem)',
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                color: phase.kind === 'work' ? 'var(--fg)' : 'var(--data-teal)',
              }}
            >
              {formatClock(left)}
            </div>
            <div
              aria-hidden="true"
              style={{ height: '2px', background: 'var(--border-2)', marginTop: '0.75rem' }}
            >
              <div
                style={{
                  width: `${(Math.min(1, Math.max(0, elapsed(timer, now) / phase.ms)) * 100).toFixed(2)}%`,
                  height: '2px',
                  background: phase.kind === 'work' ? 'var(--accent)' : 'var(--data-teal)',
                }}
              />
            </div>
            <p className="inst-hint" role="status">
              {phase.kind === 'work'
                ? t(l, '工作中。這一段結束才會計入次數。', 'Working. The tally only counts a block you finish.')
                : t(l, '休息中。休息不計入次數。', 'On a break. Breaks are not counted.')}
            </p>
          </div>

          <Row>
            {timer.running ? (
              <Btn onClick={onPause} primary>
                {t(l, '暫停', 'pause')}
              </Btn>
            ) : (
              <Btn onClick={onStart} primary>
                {elapsed(timer, now) > 0 ? t(l, '繼續', 'resume') : t(l, '開始', 'start')}
              </Btn>
            )}
            <Btn onClick={onSkip}>{t(l, '跳過這段', 'skip')}</Btn>
            <Btn onClick={onReset} disabled={index === 0 && elapsed(timer, now) === 0}>
              {t(l, '回到第一段', 'back to the first block')}
            </Btn>
          </Row>

          <Row>
            <Check2
              label={t(l, '自動接下一段', 'roll into the next block')}
              checked={auto}
              onChange={(value) => {
                setAuto(value);
                autoRef.current = value;
                write(SLUG, 'auto', value);
              }}
            />
            <Check2 label={t(l, '換段時發通知', 'notify on change')} checked={notify} onChange={askToNotify} />
          </Row>

          {permission === 'denied' ? (
            <Note error>{t(l, '通知權限被拒絕,換段時只會有聲音。', 'Notification permission was refused; the change will be a sound only.')}</Note>
          ) : null}
          {permission === 'unsupported' ? (
            <Note error>{t(l, '這個瀏覽器沒有通知功能。', 'This browser has no notification support.')}</Note>
          ) : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '長度設定', 'LENGTHS')}</span>
            <span className="inst-no">
              {t(l, '一輪', 'one set')} {Math.round(setLength(config) / 60_000)} min
            </span>
          </div>

          <Row>
            <Input
              label={t(l, '工作(分)', 'Work (min)')}
              type="number"
              min={1}
              max={180}
              value={config.work}
              onChange={(value) => changeConfig('work', value)}
            />
            <Input
              label={t(l, '休息(分)', 'Break (min)')}
              type="number"
              min={1}
              max={180}
              value={config.short}
              onChange={(value) => changeConfig('short', value)}
            />
          </Row>
          <Row>
            <Input
              label={t(l, '長休息(分)', 'Long break (min)')}
              type="number"
              min={1}
              max={180}
              value={config.long}
              onChange={(value) => changeConfig('long', value)}
            />
            <Input
              label={t(l, '每幾段一次長休息', 'Long break every')}
              type="number"
              min={2}
              max={12}
              value={config.longEvery}
              onChange={(value) => changeConfig('longEvery', value)}
            />
          </Row>

          <div className="inst-field">
            <span className="inst-label">{t(l, '接下來的順序', 'What comes next')}</span>
            <div className="inst-toolbar">
              {upcoming.map((item) => (
                <span
                  key={item.index}
                  className="inst-flag"
                  data-kind={item.index === index ? 'sensitive' : undefined}
                >
                  {l === 'en' ? KIND_EN[item.kind] : KIND_ZH[item.kind]} {item.minutes}
                </span>
              ))}
            </div>
          </div>

          <Note>
            {offlineCapable
              ? t(
                  l,
                  '這頁存進瀏覽器快取後,離線也能跑;次數與設定存在這台裝置的 localStorage,沒有帳號、不上傳。',
                  'Once cached this page runs offline. The tally and settings live in this device’s localStorage — no account, no upload.'
                )
              : t(l, '這個瀏覽器不支援離線快取,但計時本身不需要網路。', 'This browser cannot cache for offline use, but the timer itself needs no network.')}
            {online ? '' : ` ${t(l, '目前離線中,照樣運作。', 'Currently offline, and still working.')}`}
          </Note>
        </section>
      </div>

      <div className="mt-8">
        <Panel
          label={t(l, '完成次數', 'TALLY')}
          aside={
            <span className="inst-no">
              {today} · {t(l, '連續', 'streak')} {count(streak(log, today))} {t(l, '天', 'd')}
            </span>
          }
        >
          <Table
            head={[t(l, '日期', 'date'), t(l, '完成段數', 'blocks'), t(l, '專注分鐘', 'focused minutes')]}
            align={['left', 'right', 'right']}
            rows={strip.map((entry) => [
              <span key="d" className="inst-no" style={entry.date === today ? { color: 'var(--accent)' } : undefined}>
                {entry.date}
              </span>,
              count(entry.completed),
              count(entry.minutes),
            ])}
          />
          <Row>
            <CopyButton l={l} text={logToCsv(log)} label={t(l, '複製 CSV', 'copy CSV')} />
            <Btn
              onClick={() => {
                setLog([]);
                logRef.current = [];
                remove(SLUG, 'log');
              }}
              disabled={log.length === 0}
            >
              {t(l, '清除記錄', 'clear the tally')}
            </Btn>
          </Row>
          <Note>
            {t(
              l,
              '只保留最近 120 天。清除之後拿不回來,這台裝置上沒有備份。',
              'Only the last 120 days are kept. Clearing is final — there is no copy anywhere.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '本段剩餘', 'left in block'), v: formatClock(left) },
          { k: t(l, '今天完成', 'today'), v: count(day.completed) },
          { k: t(l, '今天專注', 'focused today'), v: `${count(day.minutes)} min` },
          { k: t(l, '連續天數', 'streak'), v: count(streak(log, today)) },
          { k: t(l, '累計段數', 'blocks all time'), v: count(whole.completed) },
        ]}
      />
    </div>
  );
}
