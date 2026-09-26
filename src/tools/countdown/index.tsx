'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, Check2, CopyButton, Input, Note, Panel, Readout, Row, Seg, Table } from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  IDLE,
  addLap,
  elapsed,
  formatDuration,
  lapStats,
  lapsToCsv,
  parseDuration,
  pause,
  progress,
  remaining,
  start,
  type Lap,
  type TimerState,
} from './logic';

/** Short square-wave chirps. No file is fetched: the tone is synthesised. */
function chirp() {
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
    osc.type = 'square';
    osc.frequency.value = 880;
    osc.connect(gain);
    const at = ctx.currentTime;
    // Three pulses, shaped so there is no click at the edges.
    for (let i = 0; i < 3; i += 1) {
      const from = at + i * 0.22;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(0.18, from + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.16);
    }
    osc.start(at);
    osc.stop(at + 0.7);
    osc.onended = () => void ctx.close();
  } catch {
    /* no audio output available — the visual alert still fires */
  }
}

function wallClock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const PRESETS = ['1m', '3m', '5m', '10m', '25m', '1h'];

export default function Countdown({ l }: ToolProps) {
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [duration, setDuration] = useState('5m');
  const [timer, setTimer] = useState<TimerState>(IDLE);
  const [now, setNow] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [rang, setRang] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [notify, setNotify] = useState(false);
  const [permission, setPermission] = useState<'unsupported' | 'default' | 'granted' | 'denied'>(
    'default'
  );

  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const deadline = useRef<number | null>(null);
  const notifyRef = useRef(false);

  const target = parseDuration(duration);
  const broken = mode === 'countdown' && target === null;

  const fire = useCallback(() => {
    setRang(true);
    chirp();
    if (notifyRef.current && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(t(l, '時間到', 'Time is up'), {
          body: t(l, `倒數 ${duration} 結束。`, `The ${duration} countdown finished.`),
          tag: 'tools-countdown',
        });
      } catch {
        /* some browsers refuse constructed notifications outside a worker */
      }
    }
  }, [duration, l]);

  const tick = useCallback(() => {
    const at = Date.now();
    setNow(at);
    if (deadline.current !== null && at >= deadline.current) {
      deadline.current = null;
      fire();
    }
  }, [fire]);

  const run = useCallback(() => {
    if (ticker.current !== undefined) return;
    // 60 ms is smooth in the foreground; in the background the browser clamps
    // it and the reading stays correct because it is a subtraction.
    ticker.current = setInterval(tick, 60);
  }, [tick]);

  const halt = useCallback(() => {
    clearInterval(ticker.current);
    ticker.current = undefined;
  }, []);

  // Cleanup only: no state is set from inside an effect.
  useEffect(() => () => clearInterval(ticker.current), []);

  const onStart = () => {
    const at = Date.now();
    const next = start(timer, at);
    setTimer(next);
    setNow(at);
    setRang(false);
    if (mode === 'countdown' && target !== null) {
      const left = target - elapsed(next, at);
      deadline.current = left > 0 ? at + left : null;
      setEndsAt(left > 0 ? at + left : at);
      if (left <= 0) fire();
    }
    run();
  };

  const onPause = () => {
    const at = Date.now();
    setTimer(pause(timer, at));
    setNow(at);
    deadline.current = null;
    setEndsAt(null);
    halt();
  };

  const onReset = () => {
    setTimer(IDLE);
    setLaps([]);
    setRang(false);
    setEndsAt(null);
    deadline.current = null;
    halt();
  };

  const onLap = () => {
    const at = Date.now();
    setNow(at);
    setLaps((previous) => addLap(previous, elapsed(timer, at)));
  };

  const askToNotify = (wanted: boolean) => {
    if (!wanted) {
      setNotify(false);
      notifyRef.current = false;
      return;
    }
    if (!('Notification' in window)) {
      setPermission('unsupported');
      setNotify(false);
      return;
    }
    if (Notification.permission === 'granted') {
      setNotify(true);
      notifyRef.current = true;
      setPermission('granted');
      return;
    }
    // Requested from inside the click, which is the only place a browser
    // will consider the prompt.
    void Notification.requestPermission().then((result) => {
      setPermission(result === 'granted' ? 'granted' : 'denied');
      setNotify(result === 'granted');
      notifyRef.current = result === 'granted';
    });
  };

  const ran = elapsed(timer, now);
  const left = mode === 'countdown' && target !== null ? remaining(timer, target, now) : 0;
  const bar = mode === 'countdown' && target !== null ? progress(timer, target, now) : 0;
  const overtime = mode === 'countdown' && left < 0;
  const stats = lapStats(laps);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '模式', 'Mode')}
          value={mode}
          onChange={(next) => {
            setMode(next);
            onReset();
          }}
          options={[
            { value: 'countdown', label: t(l, '倒數', 'countdown') },
            { value: 'stopwatch', label: t(l, '碼表', 'stopwatch') },
          ]}
        />
        {mode === 'countdown' ? (
          <Input
            label={t(l, '倒數多久', 'Count down')}
            value={duration}
            onChange={(next) => {
              setDuration(next);
              deadline.current = null;
              setEndsAt(null);
            }}
            invalid={broken}
            hint={t(l, '25 = 25 分鐘;也接受 90s、1h30m、1:30、1:30:00', '25 means 25 minutes; 90s, 1h30m, 1:30 and 1:30:00 also read')}
          />
        ) : null}
      </Row>

      {mode === 'countdown' ? (
        <Row>
          {PRESETS.map((preset) => (
            <Btn
              key={preset}
              onClick={() => {
                setDuration(preset);
                deadline.current = null;
                setEndsAt(null);
              }}
            >
              {preset}
            </Btn>
          ))}
        </Row>
      ) : null}

      <div className="mt-8">
        <Panel
          label={mode === 'countdown' ? t(l, '剩餘', 'REMAINING') : t(l, '經過', 'ELAPSED')}
          aside={
            <span className="inst-no">
              {timer.running ? t(l, '計時中', 'running') : ran > 0 ? t(l, '暫停', 'paused') : t(l, '待機', 'idle')}
              {endsAt !== null && timer.running ? ` · ${t(l, '到點', 'ends')} ${wallClock(endsAt)}` : ''}
            </span>
          }
        >
          {/* Not a live region: these digits change ten times a second, and a
              screen reader announcing each change would never stop talking. The
              "time is up" line below is the announcement, via role="status". */}
          <div className="inst-out" aria-live="off" style={{ minHeight: 0 }}>
            <div
              style={{
                fontSize: 'clamp(2.75rem, 12vw, 5rem)',
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                color: overtime || rang ? 'var(--accent)' : 'var(--fg)',
              }}
            >
              {mode === 'countdown'
                ? target === null
                  ? '--:--'
                  : formatDuration(left, Math.abs(left) < 60_000)
                : formatDuration(ran, true)}
            </div>
            {mode === 'countdown' && target !== null ? (
              <div
                aria-hidden="true"
                style={{ height: '2px', background: 'var(--border-2)', marginTop: '0.75rem' }}
              >
                <div
                  style={{
                    width: `${(bar * 100).toFixed(2)}%`,
                    height: '2px',
                    background: overtime ? 'var(--accent)' : 'var(--data-teal)',
                  }}
                />
              </div>
            ) : null}
            {rang ? (
              <p className="inst-hint" role="status" style={{ color: 'var(--accent)' }}>
                {t(l, '時間到。', 'Time is up.')}
                {overtime ? ` ${t(l, '已超過', 'over by')} ${formatDuration(-left)}` : ''}
              </p>
            ) : null}
          </div>

          <Row>
            {timer.running ? (
              <Btn onClick={onPause} primary>
                {t(l, '暫停', 'pause')}
              </Btn>
            ) : (
              <Btn onClick={onStart} primary disabled={broken}>
                {ran > 0 ? t(l, '繼續', 'resume') : t(l, '開始', 'start')}
              </Btn>
            )}
            {mode === 'stopwatch' ? (
              <Btn onClick={onLap} disabled={!timer.running}>
                {t(l, '分段', 'lap')}
              </Btn>
            ) : null}
            <Btn onClick={onReset} disabled={ran === 0 && !timer.running && laps.length === 0}>
              {t(l, '歸零', 'reset')}
            </Btn>
            <Check2
              label={t(l, '時間到時發通知', 'notify when done')}
              checked={notify}
              onChange={askToNotify}
            />
          </Row>

          {broken ? (
            <Note error>{t(l, '讀不懂這個長度。試 25、90s、1h30m、1:30:00。上限一百小時。', 'Cannot read that length. Try 25, 90s, 1h30m or 1:30:00. The ceiling is a hundred hours.')}</Note>
          ) : null}

          {permission === 'denied' ? (
            <Note error>
              {t(l, '瀏覽器拒絕了通知權限,時間到時只會有聲音與畫面變色。', 'The browser refused notification permission; the alert will be sound and colour only.')}
            </Note>
          ) : null}
          {permission === 'unsupported' ? (
            <Note error>{t(l, '這個瀏覽器沒有通知功能。', 'This browser has no notification support.')}</Note>
          ) : null}

          {timer.running && mode === 'countdown' && endsAt === null ? (
            <Note>
              {t(
                l,
                '倒數長度在計時中被改過,到點提示已經取消。按暫停再按開始,新的長度才會重新設定鬧鈴。',
                'The length changed while the clock was running, so the alarm was cleared. Pause and start again to set it against the new length.'
              )}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              '時間是用時間戳相減算的,不是累加每個 tick,所以切到別的分頁再回來還是準的——只是背景時畫面更新會被瀏覽器降頻。計時中改長度會取消到點提示,要重新按一次開始。',
              'Time is measured by subtracting timestamps rather than by counting ticks, so a background tab stays accurate; only the on-screen refresh is throttled. Changing the length mid-run clears the alarm, so start it again.'
            )}
          </Note>
        </Panel>
      </div>

      {mode === 'stopwatch' && laps.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '分段', 'LAPS')}
            aside={<span className="inst-no">{count(laps.length)}</span>}
          >
            <Table
              head={['#', t(l, '分段時間', 'split'), t(l, '累計', 'total'), '']}
              align={['right', 'right', 'right', 'left']}
              rows={laps
                .slice()
                .reverse()
                .map((lap) => [
                  <span key="i" className="inst-no">
                    {lap.index}
                  </span>,
                  <span key="s" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {formatDuration(lap.split, true)}
                  </span>,
                  <span key="t" className="inst-no">
                    {formatDuration(lap.at, true)}
                  </span>,
                  <span key="m" className="inst-no">
                    {stats && lap.split === stats.fastest ? t(l, '最快', 'fastest') : ''}
                    {stats && lap.split === stats.slowest && stats.fastest !== stats.slowest
                      ? t(l, '最慢', 'slowest')
                      : ''}
                  </span>,
                ])}
            />
            <Row>
              <CopyButton l={l} text={lapsToCsv(laps)} label={t(l, '複製 CSV', 'copy CSV')} />
            </Row>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          mode === 'countdown'
            ? { k: t(l, '剩餘', 'remaining'), v: target === null ? '—' : formatDuration(left, true) }
            : { k: t(l, '經過', 'elapsed'), v: formatDuration(ran, true) },
          { k: t(l, '設定', 'set to'), v: mode === 'countdown' && target !== null ? formatDuration(target) : '—' },
          { k: t(l, '分段', 'laps'), v: count(laps.length) },
          { k: t(l, '最快分段', 'fastest lap'), v: stats ? formatDuration(stats.fastest, true) : '—' },
          { k: t(l, '通知', 'notify'), v: notify ? t(l, '開', 'on') : t(l, '關', 'off') },
        ]}
      />
    </div>
  );
}
