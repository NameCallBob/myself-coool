'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, Check2, Input, Note, Panel, Readout, Row, Seg } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import { read, write } from '@/lib/tools/storage';
import {
  IDLE,
  clockFields,
  elapsed,
  formatBig,
  formatClockFields,
  parseDuration,
  pause,
  phaseFor,
  start,
  usedFraction,
  type Phase,
  type TimerState,
} from './logic';

const SLUG = 'stage-clock';

/** Captured at chunk load so the first frame is not 1970. */
const LOADED_AT = Date.now();

/** Phase colours. Each also carries a word, because a colour alone is not a
 *  status — and the person at the back of the room may not see it either way. */
const PHASE_COLOUR: Record<Phase, string> = {
  calm: 'var(--fg)',
  warn: 'var(--data-teal)',
  danger: 'var(--accent)',
  over: 'var(--accent)',
};

const PHASE_ZH: Record<Phase, string> = { calm: '時間充裕', warn: '快到了', danger: '剩不到', over: '超時' };
const PHASE_EN: Record<Phase, string> = { calm: 'plenty', warn: 'wrapping up', danger: 'nearly done', over: 'over time' };

export default function StageClock({ l }: ToolProps) {
  const [mode, setMode] = useState<'clock' | 'countdown' | 'countup'>('countdown');
  const [talk, setTalk] = useState(() => read<string>(SLUG, 'talk', '20'));
  const [warnText, setWarnText] = useState(() => read<string>(SLUG, 'warn', '5'));
  const [dangerText, setDangerText] = useState(() => read<string>(SLUG, 'danger', '1'));
  const [message, setMessage] = useState(() => read<string>(SLUG, 'message', ''));
  const [seconds, setSeconds] = useState(true);
  const [hour12, setHour12] = useState(false);
  const [timer, setTimer] = useState<TimerState>(IDLE);
  const [now, setNow] = useState(LOADED_AT);
  const [wakeHeld, setWakeHeld] = useState(false);

  const stage = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<{ release: () => Promise<void> } | null>(null);

  // Ticks every 200 ms in every mode: the wall clock needs it as much as the
  // countdown does. setState happens in the callback, not in the effect body.
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(ticker);
  }, []);

  const total = parseDuration(talk);
  const warnMs = (parseDuration(warnText) ?? 0);
  const dangerMs = (parseDuration(dangerText) ?? 0);
  const ran = elapsed(timer, now);
  const remaining = total === null ? 0 : total - ran;

  const phase: Phase =
    mode === 'countdown' && total !== null
      ? phaseFor(remaining, warnMs, dangerMs)
      : mode === 'countup' && total !== null
        ? phaseFor(total - ran, warnMs, dangerMs)
        : 'calm';

  const big =
    mode === 'clock'
      ? formatClockFields(clockFields(now, hour12), seconds)
      : mode === 'countdown'
        ? formatBig(remaining, seconds)
        : formatBig(ran, seconds);

  const release = useCallback(async () => {
    const held = sentinel.current;
    sentinel.current = null;
    setWakeHeld(false);
    if (held) {
      try {
        await held.release();
      } catch {
        /* already gone */
      }
    }
  }, []);

  useEffect(() => () => void sentinel.current?.release().catch(() => undefined), []);

  const keepAwake = () => {
    if (sentinel.current) {
      void release();
      return;
    }
    const api = (
      navigator as unknown as { wakeLock?: { request: (kind: 'screen') => Promise<{ release: () => Promise<void> }> } }
    ).wakeLock;
    if (!api) {
      setWakeHeld(false);
      return;
    }
    void api
      .request('screen')
      .then((held) => {
        sentinel.current = held;
        setWakeHeld(true);
      })
      .catch(() => setWakeHeld(false));
  };

  const fullscreen = () => {
    const node = stage.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof node.requestFullscreen === 'function') {
      void node.requestFullscreen().catch(() => undefined);
    }
  };

  const wakeLockAvailable = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '顯示什麼', 'Show')}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setTimer(IDLE);
          }}
          options={[
            { value: 'countdown', label: t(l, '倒數', 'countdown') },
            { value: 'countup', label: t(l, '正數', 'count up') },
            { value: 'clock', label: t(l, '現在時間', 'time of day') },
          ]}
        />
        {mode === 'clock' ? (
          <Check2 label={t(l, '十二小時制', '12-hour')} checked={hour12} onChange={setHour12} />
        ) : (
          <Input
            label={t(l, '講多久', 'Slot length')}
            value={talk}
            onChange={(next) => {
              setTalk(next);
              write(SLUG, 'talk', next);
            }}
            invalid={total === null}
            hint={t(l, '20 = 20 分鐘;也接受 45:00、1h30m', '20 means 20 minutes; 45:00 and 1h30m also read')}
          />
        )}
        <Check2 label={t(l, '顯示秒', 'seconds')} checked={seconds} onChange={setSeconds} />
      </Row>

      {mode !== 'clock' ? (
        <Row>
          <Input
            label={t(l, '剩多少開始變色', 'Amber at')}
            value={warnText}
            onChange={(next) => {
              setWarnText(next);
              write(SLUG, 'warn', next);
            }}
            invalid={parseDuration(warnText) === null}
          />
          <Input
            label={t(l, '剩多少變紅', 'Red at')}
            value={dangerText}
            onChange={(next) => {
              setDangerText(next);
              write(SLUG, 'danger', next);
            }}
            invalid={parseDuration(dangerText) === null}
          />
          <Input
            label={t(l, '底下要顯示的字', 'Line under the clock')}
            value={message}
            onChange={(next) => {
              setMessage(next);
              write(SLUG, 'message', next);
            }}
            placeholder={t(l, '例如 講者姓名', 'e.g. the speaker’s name')}
          />
        </Row>
      ) : null}

      <div className="mt-8">
        <Panel
          label={t(l, '講台畫面', 'STAGE')}
          aside={
            <span className="inst-no">
              {mode === 'clock' ? t(l, '時鐘', 'clock') : l === 'en' ? PHASE_EN[phase] : PHASE_ZH[phase]}
            </span>
          }
        >
          {/* The stage surface itself: this element goes full screen, so the
              layout has to hold at both a panel size and a whole monitor. */}
          <div
            ref={stage}
            style={{
              background: 'var(--bg-deep)',
              border: '1px solid var(--border-2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: 'clamp(1.5rem, 6vh, 5rem) 1rem',
              minHeight: '40vh',
            }}
          >
            <div
              aria-live="off"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(3.5rem, 22vw, 22rem)',
                lineHeight: 0.95,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.03em',
                color: PHASE_COLOUR[phase],
              }}
            >
              {mode === 'countdown' && total === null ? '--:--' : big}
            </div>

            {mode !== 'clock' && phase === 'over' ? (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(1rem, 3vw, 2rem)',
                  letterSpacing: '0.08em',
                  color: 'var(--accent)',
                }}
              >
                {t(l, '超時', 'OVER TIME')}
              </div>
            ) : null}

            {message !== '' ? (
              <div
                style={{
                  fontSize: 'clamp(0.875rem, 2.5vw, 1.75rem)',
                  color: 'var(--fg-muted)',
                  textAlign: 'center',
                }}
              >
                {message}
              </div>
            ) : null}

            {mode !== 'clock' && total !== null ? (
              <div
                aria-hidden="true"
                style={{ width: 'min(100%, 60rem)', height: '3px', background: 'var(--border-2)', marginTop: '1rem' }}
              >
                <div
                  style={{
                    width: `${(usedFraction(ran, total) * 100).toFixed(2)}%`,
                    height: '3px',
                    background: PHASE_COLOUR[phase],
                  }}
                />
              </div>
            ) : null}
          </div>

          <Row>
            {mode !== 'clock' ? (
              timer.running ? (
                <Btn
                  primary
                  onClick={() => {
                    const at = Date.now();
                    setNow(at);
                    setTimer(pause(timer, at));
                  }}
                >
                  {t(l, '暫停', 'pause')}
                </Btn>
              ) : (
                <Btn
                  primary
                  onClick={() => {
                    const at = Date.now();
                    setNow(at);
                    setTimer(start(timer, at));
                  }}
                  disabled={total === null}
                >
                  {ran > 0 ? t(l, '繼續', 'resume') : t(l, '開始', 'start')}
                </Btn>
              )
            ) : null}
            {mode !== 'clock' ? (
              <Btn onClick={() => setTimer(IDLE)} disabled={ran === 0 && !timer.running}>
                {t(l, '歸零', 'reset')}
              </Btn>
            ) : null}
            <Btn onClick={fullscreen}>{t(l, '全螢幕', 'full screen')}</Btn>
            {wakeLockAvailable ? (
              <Btn onClick={keepAwake}>
                {wakeHeld ? t(l, '允許螢幕休眠', 'allow sleep') : t(l, '螢幕不要休眠', 'keep the screen on')}
              </Btn>
            ) : null}
          </Row>

          {!wakeLockAvailable ? (
            <Note>
              {t(
                l,
                '這個瀏覽器沒有螢幕喚醒鎖,請自己把系統睡眠關掉。',
                'This browser has no screen wake lock; turn off system sleep yourself.'
              )}
            </Note>
          ) : null}

          <Note>
            {t(
              l,
              '全螢幕之後把這個視窗拖到第二個螢幕。時間是用時間戳相減的,筆電睡著再醒來也不會少算。變色之外還有文字,因為投影機的顏色常常不能信。',
              'Go full screen and drag the window to the second display. Time is measured by subtracting timestamps, so a sleeping laptop loses nothing. The state is spelled out in words as well as colour, because a projector’s colour cannot be trusted.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          mode === 'clock'
            ? { k: t(l, '現在', 'now'), v: formatClockFields(clockFields(now, hour12), true) }
            : { k: t(l, '剩餘', 'remaining'), v: total === null ? '—' : formatBig(remaining) },
          { k: t(l, '已用', 'elapsed'), v: formatBig(ran) },
          { k: t(l, '時段', 'slot'), v: total === null ? '—' : formatBig(total, false) },
          { k: t(l, '狀態', 'state'), v: l === 'en' ? PHASE_EN[phase] : PHASE_ZH[phase] },
          { k: t(l, '螢幕鎖', 'wake lock'), v: wakeHeld ? t(l, '開', 'held') : t(l, '關', 'off') },
        ]}
      />
    </div>
  );
}
