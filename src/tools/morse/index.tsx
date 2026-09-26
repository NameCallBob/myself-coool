'use client';

import { useMemo, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count, ms } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MORSE,
  PROSIGNS,
  ditSeconds,
  durationSeconds,
  fromMorse,
  fromNato,
  morseUnits,
  timing,
  toMorse,
  toNato,
} from './logic';

type Mode = 'morse' | 'nato';
type Direction = 'encode' | 'decode';

/** Longer than this and nobody is listening to the end of it. */
const MAX_PLAY_SECONDS = 90;

/** Tone pitch. 600 Hz is the usual sidetone; it cuts through without hurting. */
const TONE_HZ = 600;

export default function Morse({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('morse');
  const [direction, setDirection] = useState<Direction>('encode');
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(15);
  const [icao, setIcao] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const session = useRef<{ ctx: AudioContext; osc: OscillatorNode } | null>(null);

  const result = useMemo(() => {
    if (mode === 'morse') {
      return direction === 'encode' ? toMorse(text) : { code: '', ...fromMorse(text) };
    }
    return direction === 'encode'
      ? { words: toNato(text, { icao }).words, unknown: toNato(text, { icao }).unknown }
      : fromNato(text);
  }, [mode, direction, text, icao]);

  const output = useMemo(() => {
    if (mode === 'morse') {
      return direction === 'encode'
        ? (result as { code: string }).code
        : (result as { text: string }).text;
    }
    return direction === 'encode'
      ? (result as { words: string[] }).words.join(' ')
      : (result as { text: string }).text;
  }, [mode, direction, result]);

  /** The morse string, whichever side of the bench it is on. */
  const code = mode === 'morse' ? (direction === 'encode' ? output : text) : '';
  const segments = useMemo(() => (mode === 'morse' ? timing(code) : []), [mode, code]);
  const units = useMemo(() => morseUnits(code), [code]);
  const seconds = useMemo(() => durationSeconds(code, wpm), [code, wpm]);

  const stop = () => {
    const active = session.current;
    session.current = null;
    setPlaying(false);
    if (!active) return;
    try {
      active.osc.stop();
      void active.ctx.close();
    } catch {
      /* already stopped — nothing to undo */
    }
  };

  /**
   * Schedules the whole message as one oscillator with a gain envelope.
   *
   * Scheduled rather than driven by timers: a `setTimeout` per element drifts
   * audibly at 20 wpm, where a unit is 60 ms and the event loop's jitter is a
   * meaningful fraction of that. The Web Audio clock does not drift.
   */
  const play = () => {
    stop();
    if (segments.length === 0) return;
    if (seconds > MAX_PLAY_SECONDS) {
      setAudioError(
        t(
          l,
          `這段訊息在 ${wpm} wpm 要播 ${Math.round(seconds)} 秒,超過 ${MAX_PLAY_SECONDS} 秒上限。提高速度或縮短訊息。`,
          `At ${wpm} wpm this runs ${Math.round(seconds)} seconds, over the ${MAX_PLAY_SECONDS}-second limit. Raise the speed or shorten the message.`
        )
      );
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setAudioError(
        t(
          l,
          '這個瀏覽器沒有 Web Audio,無法發聲。上面的時序圖與秒數仍然是對的。',
          'This browser has no Web Audio, so there is no tone. The timing diagram and duration above are still correct.'
        )
      );
      return;
    }

    setAudioError(null);
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = TONE_HZ;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const unit = ditSeconds(wpm);
    // A 5 ms ramp on each edge: a hard gate on a sine wave clicks.
    const edge = Math.min(0.005, unit / 4);
    let at = ctx.currentTime + 0.06;
    for (const segment of segments) {
      const length = segment.units * unit;
      if (segment.on) {
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.22, at + edge);
        gain.gain.setValueAtTime(0.22, at + length - edge);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      }
      at += length;
    }

    osc.onended = () => {
      if (session.current?.osc === osc) stop();
    };
    osc.start();
    osc.stop(at + 0.05);
    session.current = { ctx, osc };
    setPlaying(true);
  };

  const unknown = (result as { unknown: string[] }).unknown ?? [];
  const totalUnits = segments.length > 0 ? units : 0;

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '編碼', 'Code')}
          value={mode}
          onChange={(next) => {
            stop();
            setMode(next);
          }}
          options={[
            { value: 'morse', label: t(l, 'Morse 電碼', 'Morse') },
            { value: 'nato', label: t(l, 'NATO 拼讀', 'NATO spelling') },
          ]}
        />
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: t(l, '文字 → 碼', 'text to code') },
            { value: 'decode', label: t(l, '碼 → 文字', 'code to text') },
          ]}
        />
        {mode === 'nato' ? (
          <Check2
            label={t(l, '用航空唸法 (Tree / Fower / Niner)', 'aviation digits (Tree / Fower / Niner)')}
            checked={icao}
            onChange={setIcao}
          />
        ) : null}
        <Btn onClick={() => setText(mode === 'morse' ? (direction === 'encode' ? 'SOS 台北 101' : '... --- ...') : direction === 'encode' ? 'A1-b2' : 'Alfa Bravo Charlie')}>
          {t(l, '放入範例', 'load sample')}
        </Btn>
        <ResetButton
          l={l}
          onReset={() => {
            stop();
            setText('');
          }}
        />
      </Row>

      <Bench
        leftLabel={direction === 'encode' ? t(l, '文字', 'TEXT') : mode === 'morse' ? t(l, '電碼', 'CODE') : t(l, '拼讀', 'SPELLING')}
        rightLabel={direction === 'encode' ? (mode === 'morse' ? t(l, '電碼', 'CODE') : t(l, '拼讀', 'SPELLING')) : t(l, '文字', 'TEXT')}
        leftAside={<span className="inst-no">{count(text.length)}</span>}
        rightAside={<span className="inst-no">{count(output.length)}</span>}
        left={
          <>
            <Area
              label={
                direction === 'encode'
                  ? t(l, '要轉換的文字', 'Text to convert')
                  : mode === 'morse'
                    ? t(l, '貼上電碼(點與劃,/ 或 | 分詞)', 'Paste morse (dots and dashes, / or | between words)')
                    : t(l, '貼上拼讀字(Alfa Bravo …)', 'Paste the spelling words (Alfa Bravo …)')
              }
              value={text}
              onChange={setText}
              rows={9}
            />
            {unknown.length > 0 ? (
              <Note>
                {mode === 'morse' && direction === 'encode'
                  ? t(
                      l,
                      `這些字元沒有電碼,已略過:${unknown.slice(0, 12).join(' ')}。Morse 只有拉丁字母、數字與少數標點,漢字與 emoji 傳不出去。`,
                      `No morse exists for these, so they are dropped: ${unknown.slice(0, 12).join(' ')}. Morse covers Latin letters, digits and a little punctuation — nothing else.`
                    )
                  : t(
                      l,
                      `這些不在表裡,以 � 標示:${unknown.slice(0, 12).join(' ')}`,
                      `Not in the table, shown as �: ${unknown.slice(0, 12).join(' ')}`
                    )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '11rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              aria-live="polite"
            >
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
          </>
        }
      />

      {mode === 'morse' && segments.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '時序', 'TIMING')}
            aside={
              <span className="inst-no">
                {count(totalUnits)} {t(l, '單位', 'units')} · {ms(seconds * 1000)}
              </span>
            }
          >
            <Row>
              <div className="inst-field" style={{ minWidth: '12rem' }}>
                <label className="inst-label" htmlFor="morse-wpm">
                  {t(l, `速度 ${wpm} wpm`, `Speed ${wpm} wpm`)}
                </label>
                <input
                  id="morse-wpm"
                  type="range"
                  min={5}
                  max={40}
                  value={wpm}
                  onChange={(event) => {
                    stop();
                    setWpm(Number(event.target.value));
                  }}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <p className="inst-hint">
                  {t(
                    l,
                    `一個點 ${Math.round(ditSeconds(wpm) * 1000)} ms。業餘無線電考試以 5 wpm 為底,熟手 20 到 30。`,
                    `One dit is ${Math.round(ditSeconds(wpm) * 1000)} ms. Licence exams start at 5 wpm; an experienced operator runs 20 to 30.`
                  )}
                </p>
              </div>
              <Btn onClick={playing ? stop : play} primary={!playing}>
                {playing ? t(l, '停止', 'stop') : t(l, '播放', 'play')}
              </Btn>
            </Row>

            {audioError ? <Note error>{audioError}</Note> : null}

            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'stretch',
                height: '1.5rem',
                marginTop: '0.75rem',
                borderTop: '1px solid var(--border-2)',
                borderBottom: '1px solid var(--border-2)',
                overflow: 'hidden',
              }}
            >
              {segments.slice(0, 600).map((segment, index) => (
                <div
                  key={index}
                  style={{
                    flexGrow: segment.units,
                    flexBasis: 0,
                    minWidth: '1px',
                    background: segment.on ? 'var(--accent)' : 'transparent',
                  }}
                />
              ))}
            </div>
            <Note>
              {t(
                l,
                '點 1 單位、劃 3 單位、字元內間隔 1、字元間 3、字間 7。這組比例就是 PARIS 這個字剛好 50 單位的原因,也是「每分鐘幾字」有明確定義的原因。',
                'A dit is one unit, a dah three, the gap inside a character one, between characters three, between words seven. Those ratios are why the word PARIS is exactly fifty units, and why words-per-minute has a definition at all.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <div className="mt-8">
        <Panel label={t(l, '對照表', 'REFERENCE')}>
          {mode === 'morse' ? (
            <>
              <Table
                head={[t(l, '字元', 'char'), t(l, '電碼', 'code'), t(l, '字元', 'char'), t(l, '電碼', 'code')]}
                rows={(() => {
                  const entries = Object.entries(MORSE);
                  const half = Math.ceil(entries.length / 2);
                  return Array.from({ length: half }, (_, i) => [
                    entries[i][0],
                    <span key={`a${i}`} className="inst-no">
                      {entries[i][1]}
                    </span>,
                    entries[i + half]?.[0] ?? '',
                    <span key={`b${i}`} className="inst-no">
                      {entries[i + half]?.[1] ?? ''}
                    </span>,
                  ]);
                })()}
              />
              <div className="mt-6">
                <Table
                  head={[t(l, '略碼', 'prosign'), t(l, '電碼', 'code'), t(l, '意思', 'meaning')]}
                  rows={PROSIGNS.map((entry) => [
                    entry.name,
                    <span key={entry.code} className="inst-no">
                      {entry.code}
                    </span>,
                    t(l, entry.meaning.zh, entry.meaning.en),
                  ])}
                />
              </div>
              <Note>
                {t(
                  l,
                  '略碼是兩個字母連在一起發、中間不留間隔的一個符號。所以 ...---... 跟 ... --- ... 聽起來不一樣,雖然解出來都是 SOS。',
                  'A prosign is two letters keyed as one symbol with no gap between them. That is why ...---... and ... --- ... sound different even though both decode to SOS.'
                )}
              </Note>
            </>
          ) : (
            <Table
              head={[t(l, '字元', 'char'), t(l, '唸法', 'word'), t(l, '字元', 'char'), t(l, '唸法', 'word')]}
              rows={(() => {
                const entries = Object.entries(toNato('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', { icao }).words.reduce<Record<string, string>>(
                  (out, word, index) => {
                    out['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[index]] = word;
                    return out;
                  },
                  {}
                ));
                const half = Math.ceil(entries.length / 2);
                return Array.from({ length: half }, (_, i) => [
                  entries[i][0],
                  entries[i][1],
                  entries[i + half]?.[0] ?? '',
                  entries[i + half]?.[1] ?? '',
                ]);
              })()}
            />
          )}
        </Panel>
      </div>

      <Readout
        l={l}
        items={
          mode === 'morse'
            ? [
                { k: t(l, '輸入字元', 'in chars'), v: count(text.length) },
                { k: t(l, '電碼長度', 'code chars'), v: count(code.length) },
                { k: t(l, '單位', 'units'), v: count(totalUnits) },
                { k: t(l, `${wpm} wpm 耗時`, `at ${wpm} wpm`), v: ms(seconds * 1000) },
                { k: t(l, '一個點', 'one dit'), v: ms(ditSeconds(wpm) * 1000) },
              ]
            : [
                { k: t(l, '輸入字元', 'in chars'), v: count(text.length) },
                { k: t(l, '唸出的詞', 'spoken words'), v: count(direction === 'encode' ? (result as { words: string[] }).words.length : 0) },
                { k: t(l, '無法處理', 'unhandled'), v: count(unknown.length) },
                { k: t(l, '數字唸法', 'digits'), v: icao ? 'ICAO' : 'NATO' },
              ]
        }
      />
    </div>
  );
}
