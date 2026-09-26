'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, CopyButton, Input, Note, Panel, Readout, Row, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import { useHydrated } from '@/lib/tools/useClientFacts';
import {
  describe,
  formatColor,
  parseColor,
  toGamut,
  toHex,
  type Color,
  type Space,
} from './logic';

const SPACE_LABEL: Record<Space, string> = {
  hex: 'hex',
  rgb: 'rgb()',
  hsl: 'hsl()',
  hwb: 'hwb()',
  oklch: 'oklch()',
  oklab: 'oklab()',
  lch: 'lch()',
  lab: 'lab()',
  p3: 'color(display-p3)',
};

/** The browser's screen picker, where it exists. Not in TypeScript's DOM lib. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** A labelled range control. Sliders are not in the bench kit because only the
 *  colour tools need them; the markup is kept to one place here. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span
        className="inst-no"
        style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--fg-muted)' }}>{format(value)}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor: 'var(--accent)', width: '100%' }}
      />
    </label>
  );
}

export default function ColorConvert({ l }: ToolProps) {
  const [text, setText] = useState('#3366cc');
  const hydrated = useHydrated();

  const color = useMemo(() => parseColor(text), [text]);
  const report = useMemo(() => (color ? describe(color) : null), [color]);

  /** Every edit goes back through the text field, so there is one source of
   *  truth and the notation you typed is the notation that stays on screen. */
  const setColor = useCallback((next: Color, space: Space) => {
    setText(formatColor(next, space));
  }, []);

  const eyeDropper = hydrated
    ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
    : undefined;

  const pick = useCallback(async () => {
    if (!eyeDropper) return;
    try {
      const result = await new eyeDropper().open();
      setText(result.sRGBHex);
    } catch {
      // The picker was dismissed with Escape. Nothing to report.
    }
  }, [eyeDropper]);

  const swatch = report ? toHex({ rgb: toGamut(report.color.rgb), alpha: 1 }) : 'transparent';
  const oklch = report?.oklch;

  return (
    <div>
      <Panel
        label={t(l, '顏色', 'COLOUR')}
        aside={report?.name ? <span className="inst-no">{report.name}</span> : null}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 7.5rem',
            gap: '1rem',
            alignItems: 'end',
          }}
        >
          <Input
            label={t(l, '任何 CSS 顏色寫法', 'Any CSS colour notation')}
            hint={t(
              l,
              'hex、rgb()、hsl()、hwb()、lab()、lch()、oklab()、oklch()、color(srgb|display-p3)、顏色名稱。',
              'hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(srgb|display-p3), and named colours.'
            )}
            value={text}
            onChange={setText}
            invalid={text.trim() !== '' && !color}
            placeholder="#3366cc"
          />
          <div
            aria-hidden="true"
            style={{
              background: swatch,
              border: '1px solid var(--border-3)',
              height: '2.5rem',
              // Checkerboard behind the swatch so alpha is visible rather than
              // silently rendered against whatever the page background is.
              backgroundImage:
                report && report.color.alpha < 1
                  ? `linear-gradient(${swatch}, ${swatch}), repeating-conic-gradient(var(--border-2) 0% 25%, transparent 0% 50%)`
                  : undefined,
              backgroundSize: report && report.color.alpha < 1 ? 'auto, 12px 12px' : undefined,
              opacity: report ? Math.max(report.color.alpha, 0.08) : 1,
            }}
          />
        </div>

        <Row>
          <label className="inst-status" style={{ cursor: 'pointer', gap: '0.4rem' }}>
            <input
              type="color"
              value={report ? toHex({ rgb: toGamut(report.color.rgb), alpha: 1 }) : '#000000'}
              onChange={(event) => setText(event.target.value)}
              style={{ width: '2rem', height: '1.4rem', padding: 0, border: '1px solid var(--border-3)', background: 'none' }}
              aria-label={t(l, '用系統色盤選色', 'Choose with the system picker')}
            />
            <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
              {t(l, '系統色盤', 'system picker')}
            </span>
          </label>
          {eyeDropper ? (
            <Btn onClick={pick}>{t(l, '螢幕取色', 'pick from screen')}</Btn>
          ) : (
            <span className="inst-no">
              {hydrated
                ? t(l, '此瀏覽器沒有 EyeDropper,螢幕取色不可用', 'No EyeDropper in this browser — screen picking unavailable')
                : ''}
            </span>
          )}
          {(['hex', 'rgb', 'oklch'] as Space[]).map((space) => (
            <Btn
              key={space}
              onClick={() => report && setColor(report.color, space)}
              disabled={!report}
              title={t(l, `改寫成 ${SPACE_LABEL[space]}`, `Rewrite as ${SPACE_LABEL[space]}`)}
            >
              {SPACE_LABEL[space]}
            </Btn>
          ))}
        </Row>

        {text.trim() !== '' && !color ? (
          <Note error>
            {t(
              l,
              '看不懂這個寫法。支援的是上面那幾種;color(rec2020 …) 與相對顏色語法還沒做。',
              'Not a notation this tool reads. color(rec2020 …) and relative colour syntax are not implemented.'
            )}
          </Note>
        ) : null}
      </Panel>

      {report && oklch ? (
        <>
          <div className="mt-8">
            <Panel label={t(l, 'OKLCH 微調', 'OKLCH ADJUST')}>
              <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '32rem' }}>
                <Slider
                  label={t(l, '明度 L', 'lightness L')}
                  value={oklch.l}
                  min={0}
                  max={1}
                  step={0.001}
                  format={(v) => v.toFixed(3)}
                  onChange={(v) =>
                    setText(`oklch(${v} ${oklch.c.toFixed(4)} ${oklch.h.toFixed(2)}${alphaSuffix(report.color)})`)
                  }
                />
                <Slider
                  label={t(l, '彩度 C', 'chroma C')}
                  value={oklch.c}
                  min={0}
                  max={0.4}
                  step={0.001}
                  format={(v) => v.toFixed(3)}
                  onChange={(v) => setText(`oklch(${oklch.l.toFixed(4)} ${v} ${oklch.h.toFixed(2)}${alphaSuffix(report.color)})`)}
                />
                <Slider
                  label={t(l, '色相 H', 'hue H')}
                  value={oklch.h}
                  min={0}
                  max={360}
                  step={0.5}
                  format={(v) => `${v.toFixed(1)}°`}
                  onChange={(v) => setText(`oklch(${oklch.l.toFixed(4)} ${oklch.c.toFixed(4)} ${v}${alphaSuffix(report.color)})`)}
                />
                <Slider
                  label={t(l, '透明度 α', 'alpha')}
                  value={report.color.alpha}
                  min={0}
                  max={1}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) =>
                    setText(
                      `oklch(${oklch.l.toFixed(4)} ${oklch.c.toFixed(4)} ${oklch.h.toFixed(2)}${v >= 1 ? '' : ` / ${v}`})`
                    )
                  }
                />
              </div>
              <Note>
                {t(
                  l,
                  '拖動會改寫成 oklch() 寫法。L 與 H 固定、C 拉高到螢幕做不到的地方時,下面的 hex/rgb 會是壓進 sRGB 之後的結果,oklch 那一列仍是你要的值。',
                  'Dragging rewrites the input as oklch(). Push chroma past what a screen can show and the hex/rgb rows report the gamut-mapped result while the oklch row keeps the value you asked for.'
                )}
              </Note>
            </Panel>
          </div>

          <div className="mt-8">
            <Panel
              label={t(l, '各種寫法', 'NOTATIONS')}
              aside={
                report.outOfSrgb ? (
                  <span className="inst-no" style={{ color: 'var(--accent)' }}>
                    {report.outOfP3
                      ? t(l, '△ 超出 sRGB 與 Display-P3', '△ outside sRGB and Display-P3')
                      : t(l, '△ 超出 sRGB,Display-P3 內', '△ outside sRGB, inside Display-P3')}
                  </span>
                ) : (
                  <span className="inst-no">{t(l, 'sRGB 可顯示', 'displayable in sRGB')}</span>
                )
              }
            >
              <div aria-live="polite">
                <Table
                  head={[t(l, '寫法', 'notation'), t(l, '值', 'value'), '']}
                  align={['left', 'left', 'right']}
                  rows={report.notations.map((row) => [
                    <span key="k" className="inst-no">
                      {SPACE_LABEL[row.space]}
                    </span>,
                    <span key="v" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                      {row.value}
                    </span>,
                    <CopyButton key="c" l={l} text={row.value} label={t(l, '複製', 'copy')} />,
                  ])}
                />
              </div>
              {report.outOfSrgb ? (
                <Note>
                  {t(
                    l,
                    '超出 sRGB 的顏色,hex / rgb / hsl / hwb 四列是照 CSS Color 4 的色域壓縮演算法算的:固定明度與色相,把彩度降到剛好能顯示為止。不是把每個通道各自截斷——那會讓色相跑掉。color(display-p3) 那一列用同一套演算法,但壓的是 P3 的邊界,所以 P3 裝得下的顏色會原樣印出來。',
                    'For colours outside sRGB, the hex / rgb / hsl / hwb rows use the CSS Color 4 gamut mapping: hold lightness and hue, reduce chroma until it fits. Not per-channel clipping, which shifts the hue. The color(display-p3) row runs the same algorithm against the P3 boundary instead, so a colour that fits P3 is printed as it is.'
                  )}
                </Note>
              ) : null}
            </Panel>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={
          report
            ? [
                { k: 'OKLCH L', v: report.oklch.l.toFixed(4) },
                { k: 'OKLCH C', v: report.oklch.c.toFixed(4) },
                { k: 'OKLCH H', v: `${report.oklch.h.toFixed(2)}°` },
                { k: 'CIE L*', v: report.lab.l.toFixed(2) },
                { k: t(l, '色域', 'gamut'), v: report.outOfSrgb ? (report.outOfP3 ? '> P3' : 'P3') : 'sRGB' },
              ]
            : [{ k: t(l, '狀態', 'status'), v: text.trim() === '' ? '—' : t(l, '無法解析', 'unparsed') }]
        }
      />
    </div>
  );
}

function alphaSuffix(color: Color): string {
  return color.alpha >= 1 ? '' : ` / ${color.alpha}`;
}
