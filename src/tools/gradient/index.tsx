'use client';

import { useMemo, useState } from 'react';
import { Btn, CopyButton, Input, Note, Panel, Readout, Row, Seg, Select, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  MAX_STOPS,
  defaultGradient,
  measureChroma,
  parseColor,
  rgbToOklch,
  sample,
  toCss,
  toCssBlock,
  toCssFallback,
  toHex,
  type Gradient,
  type HueArc,
  type Space,
  type Stop,
} from './logic';

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
      <span className="inst-no" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
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

/** A bar drawn from pre-sampled sRGB stops, so it looks the same in every
 *  browser — including the ones that would not interpolate in OKLCH at all. */
function Bar({ gradient, height }: { gradient: Gradient; height: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        border: '1px solid var(--border-3)',
        backgroundImage: toCssFallback(gradient, 48),
      }}
    />
  );
}

const FALLBACK_STEPS = 17;

export default function GradientTool({ l }: ToolProps) {
  const [gradient, setGradient] = useState<Gradient>(defaultGradient);
  const [texts, setTexts] = useState<string[]>(() =>
    defaultGradient().stops.map((stop) => toHex(stop.color))
  );

  const patch = (next: Partial<Gradient>) => setGradient((g) => ({ ...g, ...next }));

  const setStop = (index: number, next: Partial<Stop>) =>
    setGradient((g) => ({
      ...g,
      stops: g.stops.map((stop, i) => (i === index ? { ...stop, ...next } : stop)),
    }));

  const setText = (index: number, value: string) => {
    setTexts((current) => current.map((text, i) => (i === index ? value : text)));
    const parsed = parseColor(value);
    if (parsed) setStop(index, { color: parsed });
  };

  const addStop = () => {
    if (gradient.stops.length >= MAX_STOPS) return;
    const last = gradient.stops[gradient.stops.length - 1];
    const previous = gradient.stops[gradient.stops.length - 2] ?? last;
    const position = Math.min(100, (previous.position + last.position) / 2 + 10);
    const colour = sample(gradient, position);
    setGradient((g) => ({
      ...g,
      stops: [...g.stops, { color: colour, position, midpoint: 0.5 }],
    }));
    setTexts((current) => [...current, toHex(colour)]);
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return;
    setGradient((g) => ({ ...g, stops: g.stops.filter((_, i) => i !== index) }));
    setTexts((current) => current.filter((_, i) => i !== index));
  };

  const comparison = useMemo(
    () => ({
      chosen: measureChroma(gradient),
      srgb: measureChroma({ ...gradient, space: 'srgb' }),
    }),
    [gradient]
  );

  const css = useMemo(() => toCss(gradient), [gradient]);
  const block = useMemo(() => toCssBlock(gradient, FALLBACK_STEPS), [gradient]);
  const middle = useMemo(() => rgbToOklch(sample(gradient, 50)), [gradient]);

  return (
    <div>
      <Panel label={t(l, '預覽', 'PREVIEW')}>
        <Bar gradient={gradient} height="7rem" />
        <div className="mt-3" style={{ display: 'grid', gap: '0.5rem' }}>
          <span className="inst-no">{t(l, '同兩個色標,在 sRGB 裡插值', 'The same two stops, interpolated in sRGB')}</span>
          <Bar gradient={{ ...gradient, space: 'srgb' }} height="2.25rem" />
        </div>
        <Note>
          {t(
            l,
            '兩條都是用預先取樣好的 sRGB 色標畫的,所以在任何瀏覽器上看起來一樣——用新語法畫預覽的話,只有已經支援 OKLCH 插值的瀏覽器才看得出差別,而那正是不需要被說服的那一批。',
            'Both bars are drawn from pre-sampled sRGB stops so they look identical everywhere. A preview written in the modern syntax would only show the difference in browsers that already do OKLCH interpolation — the ones that need no convincing.'
          )}
        </Note>
      </Panel>

      <div className="mt-8">
        <Panel label={t(l, '幾何', 'GEOMETRY')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: '1rem 1.5rem',
              maxWidth: '48rem',
              alignItems: 'end',
            }}
          >
            <Seg
              label={t(l, '類型', 'Type')}
              value={gradient.kind}
              onChange={(kind) => patch({ kind })}
              options={[
                { value: 'linear', label: t(l, '線性', 'linear') },
                { value: 'radial', label: t(l, '放射', 'radial') },
              ]}
            />
            {gradient.kind === 'linear' ? (
              <Slider
                label={t(l, '角度(0 朝上)', 'angle (0 points up)')}
                value={gradient.angle}
                min={0}
                max={360}
                step={1}
                format={(v) => `${v}°`}
                onChange={(angle) => patch({ angle })}
              />
            ) : (
              <>
                <Seg
                  label={t(l, '形狀', 'Shape')}
                  value={gradient.shape}
                  onChange={(shape) => patch({ shape })}
                  options={[
                    { value: 'circle', label: t(l, '圓', 'circle') },
                    { value: 'ellipse', label: t(l, '橢圓', 'ellipse') },
                  ]}
                />
                <Slider
                  label={t(l, '圓心 X', 'centre X')}
                  value={gradient.cx}
                  min={0}
                  max={100}
                  step={1}
                  format={(v) => `${v}%`}
                  onChange={(cx) => patch({ cx })}
                />
                <Slider
                  label={t(l, '圓心 Y', 'centre Y')}
                  value={gradient.cy}
                  min={0}
                  max={100}
                  step={1}
                  format={(v) => `${v}%`}
                  onChange={(cy) => patch({ cy })}
                />
              </>
            )}
            <Select
              label={t(l, '插值色彩空間', 'Interpolation space')}
              value={gradient.space}
              onChange={(space: Space) => patch({ space })}
              options={[
                { value: 'oklch', label: 'oklch' },
                { value: 'oklab', label: 'oklab' },
                { value: 'srgb', label: 'srgb' },
                { value: 'srgb-linear', label: 'srgb-linear' },
              ]}
            />
            {gradient.space === 'oklch' ? (
              <Select
                label={t(l, '色相走法', 'Hue arc')}
                value={gradient.arc}
                onChange={(arc: HueArc) => patch({ arc })}
                options={[
                  { value: 'shorter', label: t(l, 'shorter(近路)', 'shorter') },
                  { value: 'longer', label: t(l, 'longer(繞遠路,會經過整圈)', 'longer') },
                  { value: 'increasing', label: 'increasing' },
                  { value: 'decreasing', label: 'decreasing' },
                ]}
              />
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          label={t(l, '色標', 'STOPS')}
          aside={<span className="inst-no">{gradient.stops.length} / {MAX_STOPS}</span>}
        >
          <Table
            head={[
              t(l, '顏色', 'colour'),
              t(l, '位置', 'position'),
              t(l, '中繼點', 'midpoint'),
              '',
            ]}
            rows={gradient.stops.map((stop, index) => [
              <span key="c" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: '1rem',
                    height: '1rem',
                    background: toHex(stop.color),
                    border: '1px solid var(--border-3)',
                    display: 'inline-block',
                    flex: 'none',
                  }}
                />
                <span style={{ width: '9rem' }}>
                  <Input
                    value={texts[index] ?? toHex(stop.color)}
                    onChange={(value) => setText(index, value)}
                    invalid={!parseColor(texts[index] ?? '')}
                  />
                </span>
              </span>,
              <span key="p" style={{ display: 'inline-block', minWidth: '10rem' }}>
                <Slider
                  label={t(l, '位置', 'position')}
                  value={stop.position}
                  min={0}
                  max={100}
                  step={0.5}
                  format={(v) => `${v}%`}
                  onChange={(position) => setStop(index, { position })}
                />
              </span>,
              <span key="m" style={{ display: 'inline-block', minWidth: '10rem' }}>
                {index < gradient.stops.length - 1 ? (
                  <Slider
                    label={t(l, '到下一標的中繼點', 'midpoint to next')}
                    value={stop.midpoint}
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(midpoint) => setStop(index, { midpoint })}
                  />
                ) : (
                  <span className="inst-no">—</span>
                )}
              </span>,
              <Btn key="x" onClick={() => removeStop(index)} disabled={gradient.stops.length <= 2}>
                {t(l, '刪除', 'remove')}
              </Btn>,
            ])}
          />
          <Row>
            <Btn onClick={addStop} disabled={gradient.stops.length >= MAX_STOPS}>
              {t(l, '加一個色標', 'add a stop')}
            </Btn>
            <Btn
              onClick={() => {
                const fresh = defaultGradient();
                setGradient(fresh);
                setTexts(fresh.stops.map((stop) => toHex(stop.color)));
              }}
            >
              {t(l, '回到預設', 'defaults')}
            </Btn>
          </Row>
          <Note>
            {t(
              l,
              '中繼點就是 CSS 的 colour hint:寫成兩個顏色之間的一個百分比。它不是插一個色標,而是把整段的權重重算,讓 50/50 的混色落在那個位置——指數是 ln(0.5)/ln(位置)。',
              'The midpoint is a CSS colour hint: a bare percentage between two colours. It does not insert a stop, it reweights the whole segment so the 50/50 mix lands there, with an exponent of ln(0.5)/ln(position).'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, 'CSS', 'CSS')}>
          <div aria-live="polite">
            <p className="inst-no" style={{ marginBottom: '0.35rem' }}>
              {t(l, '新語法(短,需要較新的瀏覽器)', 'Modern syntax (short, needs a recent browser)')}
            </p>
            <pre className="inst-out" style={{ whiteSpace: 'pre-wrap', minHeight: 0 }}>
              {css}
            </pre>
            <Row>
              <CopyButton l={l} text={css} label={t(l, '複製新語法', 'copy modern')} />
              <CopyButton l={l} text={block} label={t(l, '複製含 fallback', 'copy with fallback')} />
            </Row>
            <p className="inst-no mt-3" style={{ marginBottom: '0.35rem' }}>
              {t(
                l,
                `含 fallback 的版本:先寫 ${FALLBACK_STEPS} 個預算好的 sRGB 色標,再用 @supports 覆蓋`,
                `With fallback: ${FALLBACK_STEPS} pre-computed sRGB stops first, then @supports overrides`
              )}
            </p>
            <pre className="inst-out" style={{ whiteSpace: 'pre-wrap' }}>
              {block}
            </pre>
          </div>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '色標數', 'stops'), v: String(gradient.stops.length) },
          {
            k: t(l, '中點彩度', 'chroma at 50%'),
            v: middle.c.toFixed(3),
          },
          {
            k: t(l, '最低彩度', 'lowest chroma'),
            v: `${comparison.chosen.minChroma.toFixed(3)} @ ${comparison.chosen.minChromaAt}%`,
          },
          {
            k: t(l, '同組在 sRGB', 'same in sRGB'),
            v: `${comparison.srgb.minChroma.toFixed(3)} @ ${comparison.srgb.minChromaAt}%`,
          },
          { k: t(l, 'fallback 色標', 'fallback stops'), v: String(FALLBACK_STEPS) },
        ]}
      />
    </div>
  );
}
