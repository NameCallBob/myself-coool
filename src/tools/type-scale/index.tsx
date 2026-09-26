'use client';

import { useMemo, useState } from 'react';
import { Btn, Check2, CopyButton, Input, Note, Panel, Readout, Row, Seg, Select, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULTS,
  FLUID_DEFAULTS,
  MAX_STEPS,
  RATIOS,
  buildFluidScale,
  fluidAt,
  renderCss,
  type Format,
  type FluidOptions,
  type Options,
  type RatioName,
  type Rounding,
} from './logic';

const RATIO_LABEL: Record<RatioName, { zh: string; en: string }> = {
  'minor-second': { zh: '小二度 16:15', en: 'minor second 16:15' },
  'major-second': { zh: '大二度 9:8', en: 'major second 9:8' },
  'minor-third': { zh: '小三度 6:5', en: 'minor third 6:5' },
  'major-third': { zh: '大三度 5:4', en: 'major third 5:4' },
  'perfect-fourth': { zh: '完全四度 4:3', en: 'perfect fourth 4:3' },
  'augmented-fourth': { zh: '增四度 √2', en: 'augmented fourth √2' },
  'perfect-fifth': { zh: '完全五度 3:2', en: 'perfect fifth 3:2' },
  golden: { zh: '黃金比例 φ', en: 'golden ratio φ' },
};

const nameOfRatio = (value: number): RatioName | '' => {
  for (const [name, ratio] of Object.entries(RATIOS)) {
    if (Math.abs(ratio - value) < 1e-9) return name as RatioName;
  }
  return '';
};

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

export default function TypeScale({ l }: ToolProps) {
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [fluid, setFluid] = useState<FluidOptions>(FLUID_DEFAULTS);
  const [format, setFormat] = useState<Format>('fluid');
  const [prefix, setPrefix] = useState('text');
  const [preview, setPreview] = useState(1024);

  const set = (patch: Partial<Options>) => setOptions((current) => ({ ...current, ...patch }));
  const setF = (patch: Partial<FluidOptions>) => setFluid((current) => ({ ...current, ...patch }));

  const steps = useMemo(() => buildFluidScale(options, fluid), [options, fluid]);
  const css = useMemo(() => renderCss(steps, format, prefix), [steps, format, prefix]);
  const sample = t(
    l,
    '設計系統的字級不是挑好看的數字,而是挑一個比例。',
    'A type scale is not a set of nice numbers; it is one ratio, repeated.'
  );

  return (
    <div>
      <Panel label={t(l, '比例', 'RATIO')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
            gap: '1rem 1.5rem',
            maxWidth: '52rem',
            alignItems: 'end',
          }}
        >
          <Select
            label={t(l, '音樂比例', 'Musical interval')}
            value={nameOfRatio(options.ratio)}
            onChange={(value) => {
              if (value) set({ ratio: RATIOS[value as RatioName] });
            }}
            options={[
              { value: '', label: t(l, '(自訂)', '(custom)') },
              ...(Object.keys(RATIOS) as RatioName[]).map((name) => ({
                value: name,
                label: t(l, RATIO_LABEL[name].zh, RATIO_LABEL[name].en),
              })),
            ]}
          />
          <Input
            label={t(l, '比例值', 'Ratio')}
            type="number"
            value={Number(options.ratio.toFixed(4))}
            min={1}
            max={3}
            step={0.001}
            onChange={(value) => set({ ratio: Math.max(1, Math.min(3, Number(value) || 1)) })}
          />
          <Input
            label={t(l, '基準字級(小螢幕,px)', 'Base size (small viewport, px)')}
            type="number"
            value={options.base}
            min={8}
            max={40}
            step={0.5}
            onChange={(value) => set({ base: Math.max(1, Number(value) || 16) })}
          />
          <Input
            label={t(l, '根字級 rem 基準(px)', 'Root font size (px)')}
            type="number"
            value={options.rootPx}
            min={8}
            max={32}
            step={1}
            onChange={(value) => set({ rootPx: Math.max(1, Number(value) || 16) })}
          />
          <Slider
            label={t(l, '往上幾階', 'steps up')}
            value={options.up}
            min={0}
            max={MAX_STEPS}
            step={1}
            format={(v) => String(v)}
            onChange={(up) => set({ up })}
          />
          <Slider
            label={t(l, '往下幾階', 'steps down')}
            value={options.down}
            min={0}
            max={MAX_STEPS}
            step={1}
            format={(v) => String(v)}
            onChange={(down) => set({ down })}
          />
        </div>
        <Row>
          <Seg
            label={t(l, '進位', 'Rounding')}
            value={options.rounding}
            onChange={(rounding: Rounding) => set({ rounding })}
            options={[
              { value: 'none', label: t(l, '不進位', 'none') },
              { value: 'quarter', label: '0.25px' },
              { value: 'half', label: '0.5px' },
              { value: 'whole', label: '1px' },
            ]}
          />
          <Check2
            label={t(l, '用 sm / base / lg 命名', 'name steps sm / base / lg')}
            checked={options.namedSteps}
            onChange={(namedSteps) => set({ namedSteps })}
          />
          <Btn onClick={() => setOptions(DEFAULTS)}>{t(l, '回到預設', 'defaults')}</Btn>
        </Row>
      </Panel>

      <div className="mt-8">
        <Panel label={t(l, '行高', 'LINE HEIGHT')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: '1rem 1.5rem',
              maxWidth: '52rem',
            }}
          >
            <Slider
              label={t(l, '固定行距(px)', 'constant leading (px)')}
              value={options.leading}
              min={0}
              max={24}
              step={0.5}
              format={(v) => `${v}px`}
              onChange={(leading) => set({ leading })}
            />
            <Slider
              label={t(l, '行高下限', 'minimum line height')}
              value={options.minLineHeight}
              min={0.9}
              max={1.5}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(minLineHeight) => set({ minLineHeight })}
            />
            <Slider
              label={t(l, '行高上限', 'maximum line height')}
              value={options.maxLineHeight}
              min={1.2}
              max={2.4}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(maxLineHeight) => set({ maxLineHeight })}
            />
          </div>
          <Note>
            {t(
              l,
              '行高不是固定倍數,而是從「固定行距」推回來的:行盒 = 字級 + 行距,所以字級越大、倍數越小。用固定倍數的話,48px 標題在 1.5 會拿到 24px 的多餘空間,看起來就是散掉。上下限存在的理由是,小字會算出 2.5 那種像清單的行高,大字會算到 1.0 貼死。',
              'Line height is derived from a constant leading rather than fixed as a multiplier: the line box is size + leading, so the ratio falls as the size rises. A fixed 1.5 gives a 48px heading 24px of air it does not need. The bounds exist because the formula would ask for 2.5 at tiny sizes and 1.0 at huge ones.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '流體級距', 'FLUID')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: '1rem 1.5rem',
              maxWidth: '52rem',
              alignItems: 'end',
            }}
          >
            <Input
              label={t(l, '小視窗寬 (px)', 'Small viewport (px)')}
              type="number"
              value={fluid.minViewport}
              min={200}
              max={2000}
              step={10}
              onChange={(value) => setF({ minViewport: Math.max(1, Number(value) || 360) })}
            />
            <Input
              label={t(l, '大視窗寬 (px)', 'Large viewport (px)')}
              type="number"
              value={fluid.maxViewport}
              min={200}
              max={3000}
              step={10}
              onChange={(value) => setF({ maxViewport: Math.max(1, Number(value) || 1280) })}
            />
            <Input
              label={t(l, '大視窗基準字級 (px)', 'Base size at large viewport (px)')}
              type="number"
              value={fluid.maxBase}
              min={8}
              max={48}
              step={0.5}
              onChange={(value) => setF({ maxBase: Math.max(1, Number(value) || 18) })}
            />
            <Select
              label={t(l, '大視窗比例', 'Ratio at large viewport')}
              value={nameOfRatio(fluid.maxRatio)}
              onChange={(value) => {
                if (value) setF({ maxRatio: RATIOS[value as RatioName] });
              }}
              options={[
                { value: '', label: t(l, '(自訂)', '(custom)') },
                ...(Object.keys(RATIOS) as RatioName[]).map((name) => ({
                  value: name,
                  label: t(l, RATIO_LABEL[name].zh, RATIO_LABEL[name].en),
                })),
              ]}
            />
            <Input
              label={t(l, '大視窗比例值', 'Large ratio')}
              type="number"
              value={Number(fluid.maxRatio.toFixed(4))}
              min={1}
              max={3}
              step={0.001}
              onChange={(value) => setF({ maxRatio: Math.max(1, Math.min(3, Number(value) || 1)) })}
            />
            <Slider
              label={t(l, '預覽視窗寬', 'preview viewport')}
              value={preview}
              min={240}
              max={2000}
              step={10}
              format={(v) => `${v}px`}
              onChange={setPreview}
            />
          </div>
          {fluid.maxViewport <= fluid.minViewport ? (
            <Note error>
              {t(
                l,
                '大視窗寬要大於小視窗寬,不然兩點之間沒有直線可解。現在會退回固定字級。',
                'The large viewport must exceed the small one, or there is no line through the two points. Sizes fall back to fixed.'
              )}
            </Note>
          ) : null}
          <Note>
            {t(
              l,
              '兩端可以用不同比例:手機上 3 倍大的標題不是標題,是障礙物。clamp() 的斜率與截距是從兩個 (視窗寬, 字級) 精確解出來的,不是手調——手調的 calc(1rem + 1vw) 兩端通常都不會剛好落在你要的值。',
              'The two ends may use different ratios: on a phone a 3× heading is not a heading, it is an obstacle. The clamp() slope and intercept are solved exactly from the two (viewport, size) points — a hand-tuned calc(1rem + 1vw) usually hits neither target.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          label={t(l, '級距', 'THE SCALE')}
          aside={<span className="inst-no">{t(l, `預覽於 ${preview}px 視窗`, `at a ${preview}px viewport`)}</span>}
        >
          <div aria-live="polite">
            <Table
              head={[
                t(l, '階', 'step'),
                t(l, '小視窗', 'small'),
                t(l, '大視窗', 'large'),
                t(l, '此視窗', 'here'),
                t(l, '行高', 'line height'),
                t(l, '行盒', 'line box'),
                'CSS',
              ]}
              align={['left', 'right', 'right', 'right', 'right', 'right', 'left']}
              rows={steps.map((step) => [
                <span key="n" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {step.name}
                </span>,
                <span key="s" className="inst-no">
                  {step.px}px
                </span>,
                <span key="m" className="inst-no">
                  {step.maxPx}px
                </span>,
                <span key="h" className="inst-no">
                  {fluidAt(step.fluid, preview, options.rootPx).toFixed(2)}px
                </span>,
                <span key="lh" className="inst-no">
                  {step.lineHeight}
                </span>,
                <span key="lb" className="inst-no">
                  {step.lineBoxPx}px
                </span>,
                <span key="c" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  {step.css}
                </span>,
              ])}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '看起來是這樣', 'SPECIMEN')}>
          <div style={{ display: 'grid', gap: '0.75rem', borderTop: '1px solid var(--border-1)', paddingTop: '0.75rem' }}>
            {[...steps].reverse().map((step) => {
              const size = fluidAt(step.fluid, preview, options.rootPx);
              return (
                <div key={step.name} style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
                  <span className="inst-no" style={{ width: '4.5rem', flex: 'none' }}>
                    {step.name} · {size.toFixed(1)}px
                  </span>
                  <span
                    style={{
                      fontSize: `${size}px`,
                      lineHeight: step.lineHeight,
                      overflowWrap: 'anywhere',
                      minWidth: 0,
                    }}
                  >
                    {sample}
                  </span>
                </div>
              );
            })}
          </div>
          <Note>
            {t(
              l,
              '這裡的字級是用上面那個「預覽視窗寬」算出來的實際 px,不是瀏覽器目前視窗算出來的——拖滑桿就等於改變視窗寬。',
              'The sizes here are computed for the preview viewport above, not for this browser window — dragging that slider is the same as resizing.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '輸出', 'OUTPUT')}>
          <Row>
            <Seg
              label={t(l, '格式', 'Format')}
              value={format}
              onChange={setFormat}
              options={[
                { value: 'fluid', label: t(l, '流體 clamp()', 'fluid clamp()') },
                { value: 'static', label: t(l, '固定 rem', 'fixed rem') },
                { value: 'both', label: t(l, '兩者都給', 'both') },
                { value: 'tailwind', label: 'Tailwind @theme' },
              ]}
            />
            <CopyButton l={l} text={css} />
          </Row>
          <div style={{ maxWidth: '20rem' }}>
            <Input
              label={t(l, '變數前綴', 'Property prefix')}
              value={prefix}
              onChange={setPrefix}
              placeholder="text"
            />
          </div>
          <pre className="inst-out mt-3" style={{ whiteSpace: 'pre-wrap' }}>
            {css}
          </pre>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '比例', 'ratio'), v: options.ratio.toFixed(4) },
          { k: t(l, '階數', 'steps'), v: String(steps.length) },
          {
            k: t(l, '最大/最小', 'largest / smallest'),
            v: `${steps[steps.length - 1]?.maxPx ?? 0}px / ${steps[0]?.px ?? 0}px`,
          },
          {
            k: t(l, '跨幅', 'span'),
            v: `${((steps[steps.length - 1]?.maxPx ?? 1) / (steps[0]?.px || 1)).toFixed(1)}×`,
          },
          { k: t(l, '每倍需要', 'steps per doubling'), v: (Math.log(2) / Math.log(Math.max(1.0001, options.ratio))).toFixed(1) },
        ]}
      />
    </div>
  );
}
