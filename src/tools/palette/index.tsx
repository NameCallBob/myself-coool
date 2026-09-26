'use client';

import { useMemo, useState } from 'react';
import {
  Btn,
  Check2,
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
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULT_RAMP,
  MAX_STEPS,
  anchorIndex,
  buildHarmony,
  buildRamp,
  parseColor,
  render,
  rgbToOklch,
  type Format,
  type HarmonyId,
  type RampOptions,
  type Swatch,
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

const RATIO_MARK = (ratio: number) => (ratio >= 4.5 ? 'AA' : ratio >= 3 ? '3:1' : '✕');

export default function Palette({ l }: ToolProps) {
  const [input, setInput] = useState('#3366cc');
  const [name, setName] = useState('brand');
  const [mode, setMode] = useState<'ramp' | 'harmony'>('ramp');
  const [harmony, setHarmony] = useState<HarmonyId>('complementary');
  const [format, setFormat] = useState<Format>('css');
  const [options, setOptions] = useState<RampOptions>(DEFAULT_RAMP);

  const base = useMemo(() => parseColor(input), [input]);

  const swatches: Swatch[] = useMemo(() => {
    if (!base) return [];
    return mode === 'ramp' ? buildRamp(base, options) : buildHarmony(base, harmony);
  }, [base, mode, options, harmony]);

  const anchor = useMemo(
    () => (base && mode === 'ramp' && swatches.length > 0 ? anchorIndex(swatches, base) : -1),
    [base, mode, swatches]
  );

  const output = useMemo(() => render(swatches, name, format), [swatches, name, format]);
  const clamped = swatches.filter((s) => s.clamped).length;
  const baseLch = base ? rgbToOklch(base) : null;

  const set = (patch: Partial<RampOptions>) => setOptions((current) => ({ ...current, ...patch }));

  return (
    <div>
      <Panel label={t(l, '起點', 'BASE COLOUR')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
            gap: '1rem',
            alignItems: 'start',
          }}
        >
          <Input
            label={t(l, '顏色', 'Colour')}
            value={input}
            onChange={setInput}
            invalid={input.trim() !== '' && !base}
            placeholder="#3366cc"
            hint={t(l, 'hex / rgb() / hsl() / oklch()', 'hex / rgb() / hsl() / oklch()')}
          />
          <Input
            label={t(l, '變數名稱', 'Variable name')}
            value={name}
            onChange={setName}
            placeholder="brand"
            hint={t(l, '用在輸出的 --名稱-階數', 'Used as --name-step in the output')}
          />
          <Seg
            label={t(l, '要什麼', 'What to build')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ramp', label: t(l, '色階', 'ramp') },
              { value: 'harmony', label: t(l, '配色', 'harmony') },
            ]}
          />
        </div>
        {input.trim() !== '' && !base ? (
          <Note error>
            {t(
              l,
              '讀不出這個顏色。這裡支援 hex、rgb()、hsl()、oklch() 與 white/black;其他寫法請先用 H01 轉。',
              'Not a colour this tool reads. It takes hex, rgb(), hsl(), oklch(), white and black; convert others in H01 first.'
            )}
          </Note>
        ) : null}
      </Panel>

      {base ? (
        <>
          <div className="mt-8">
            <Panel label={mode === 'ramp' ? t(l, '色階設定', 'RAMP') : t(l, '配色設定', 'HARMONY')}>
              {mode === 'ramp' ? (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
                      gap: '1rem 1.5rem',
                      maxWidth: '48rem',
                    }}
                  >
                    <Slider
                      label={t(l, '階數', 'steps')}
                      value={options.steps}
                      min={2}
                      max={MAX_STEPS}
                      step={1}
                      format={(v) => String(v)}
                      onChange={(v) => set({ steps: v })}
                    />
                    <Slider
                      label={t(l, '最亮階明度 L', 'lightest L')}
                      value={options.lightest}
                      min={0.5}
                      max={1}
                      step={0.005}
                      format={(v) => v.toFixed(3)}
                      onChange={(v) => set({ lightest: v })}
                    />
                    <Slider
                      label={t(l, '最暗階明度 L', 'darkest L')}
                      value={options.darkest}
                      min={0}
                      max={0.5}
                      step={0.005}
                      format={(v) => v.toFixed(3)}
                      onChange={(v) => set({ darkest: v })}
                    />
                    <Slider
                      label={t(l, '兩端褪色量', 'chroma falloff')}
                      value={options.chromaFalloff}
                      min={0}
                      max={1}
                      step={0.01}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => set({ chromaFalloff: v })}
                    />
                    <Slider
                      label={t(l, '色相位移(整段)', 'hue shift (total)')}
                      value={options.hueShift}
                      min={-60}
                      max={60}
                      step={1}
                      format={(v) => `${v > 0 ? '+' : ''}${v}°`}
                      onChange={(v) => set({ hueShift: v })}
                    />
                  </div>
                  <Row>
                    <Check2
                      label={t(l, '用 50–950 命名', 'name steps 50–950')}
                      checked={options.scaleNames}
                      onChange={(v) => set({ scaleNames: v })}
                    />
                    <Btn onClick={() => setOptions(DEFAULT_RAMP)}>{t(l, '回到預設', 'defaults')}</Btn>
                  </Row>
                </>
              ) : (
                <Select
                  label={t(l, '配色關係', 'Relationship')}
                  value={harmony}
                  onChange={setHarmony}
                  options={[
                    { value: 'complementary', label: t(l, '互補(+180°)', 'complementary (+180°)') },
                    { value: 'analogous', label: t(l, '類似色(±30°)', 'analogous (±30°)') },
                    { value: 'triadic', label: t(l, '三分(+120° +240°)', 'triadic (+120° +240°)') },
                    { value: 'split', label: t(l, '分裂互補(+150° +210°)', 'split complementary') },
                    { value: 'tetradic', label: t(l, '四分矩形(+60° +180° +240°)', 'tetradic rectangle') },
                    { value: 'square', label: t(l, '四分正方(+90° +180° +270°)', 'square') },
                  ]}
                  hint={t(
                    l,
                    '色相在 OKLCH 上旋轉,明度與彩度維持不變,所以一組顏色的輕重一致。',
                    'Hue rotates in OKLCH with lightness and chroma held, so the members of a set match in weight.'
                  )}
                />
              )}
            </Panel>
          </div>

          <div className="mt-8">
            <Panel
              label={t(l, '結果', 'RESULT')}
              aside={
                clamped > 0 ? (
                  <span className="inst-no" style={{ color: 'var(--accent)' }}>
                    {t(l, `△ ${clamped} 階已降彩度`, `△ ${clamped} step(s) chroma-reduced`)}
                  </span>
                ) : (
                  <span className="inst-no">{t(l, '全部可顯示', 'all displayable')}</span>
                )
              }
            >
              <div
                aria-hidden="true"
                style={{ display: 'flex', border: '1px solid var(--border-3)', minHeight: '4.5rem' }}
              >
                {swatches.map((swatch, i) => (
                  <div
                    key={swatch.name}
                    style={{
                      flex: 1,
                      background: swatch.hex,
                      display: 'grid',
                      alignContent: 'end',
                      padding: '0.3rem',
                      outline: i === anchor ? '2px solid var(--accent)' : undefined,
                      outlineOffset: '-2px',
                    }}
                  >
                    <span
                      className="inst-no"
                      style={{
                        color: swatch.onBlack > swatch.onWhite ? '#000000' : '#ffffff',
                        fontSize: '10px',
                      }}
                    >
                      {swatch.name}
                    </span>
                  </div>
                ))}
              </div>
              {anchor >= 0 ? (
                <Note>
                  {t(
                    l,
                    `紅框那一階(${swatches[anchor]?.name})是離你輸入的顏色最近的一階。色階是重算出來的,所以不保證剛好等於原色。`,
                    `The outlined step (${swatches[anchor]?.name}) is the one nearest your input. A ramp is recomputed, so it is not guaranteed to contain the original exactly.`
                  )}
                </Note>
              ) : null}

              <div className="mt-3" aria-live="polite">
                <Table
                  head={[
                    t(l, '階', 'step'),
                    'hex',
                    'oklch',
                    t(l, '對白底', 'on white'),
                    t(l, '對黑底', 'on black'),
                    t(l, '降彩度', 'reduced'),
                  ]}
                  align={['left', 'left', 'left', 'right', 'right', 'left']}
                  rows={swatches.map((swatch) => [
                    <span key="n" className="inst-no" style={{ color: 'var(--fg)' }}>
                      {swatch.name}
                    </span>,
                    <span key="h" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: '0.85rem',
                          height: '0.85rem',
                          background: swatch.hex,
                          border: '1px solid var(--border-3)',
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{swatch.hex}</span>
                    </span>,
                    <span key="o" className="inst-no">
                      {swatch.oklch.l.toFixed(3)} {swatch.oklch.c.toFixed(3)} {swatch.oklch.h.toFixed(1)}
                    </span>,
                    <span key="w" className="inst-no">
                      {swatch.onWhite.toFixed(2)} {RATIO_MARK(swatch.onWhite)}
                    </span>,
                    <span key="b" className="inst-no">
                      {swatch.onBlack.toFixed(2)} {RATIO_MARK(swatch.onBlack)}
                    </span>,
                    <span key="c" className="inst-no">
                      {swatch.clamped ? t(l, '是', 'yes') : '—'}
                    </span>,
                  ])}
                />
              </div>
              {clamped > 0 ? (
                <Note>
                  {t(
                    l,
                    'sRGB 在接近白與接近黑的地方放不了多少彩度,所以標「是」的階是把彩度降到剛好能顯示為止——不是把通道各自截斷,那樣色相會跑掉。',
                    'sRGB holds little chroma near white and near black, so the flagged steps had chroma reduced until they fit — not per-channel clipping, which would shift the hue.'
                  )}
                </Note>
              ) : null}
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
                    { value: 'css', label: 'CSS hex' },
                    { value: 'oklch', label: 'CSS oklch()' },
                    { value: 'hex', label: t(l, '純色碼', 'hex list') },
                    { value: 'json', label: 'JSON' },
                  ]}
                />
                <CopyButton l={l} text={output} />
              </Row>
              <pre className="inst-out mt-3" style={{ whiteSpace: 'pre-wrap' }}>
                {output}
              </pre>
              <Note>
                {t(
                  l,
                  'oklch() 那個格式保留完整精度,新瀏覽器直接吃;要支援舊瀏覽器就用 hex 版本當 fallback。',
                  'The oklch() output keeps full precision for browsers that support it; use the hex version as the fallback.'
                )}
              </Note>
            </Panel>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={
          baseLch
            ? [
                { k: t(l, '階數', 'swatches'), v: String(swatches.length) },
                { k: t(l, '起點 L', 'base L'), v: baseLch.l.toFixed(3) },
                { k: t(l, '起點 C', 'base C'), v: baseLch.c.toFixed(3) },
                { k: t(l, '起點 H', 'base H'), v: `${baseLch.h.toFixed(1)}°` },
                { k: t(l, '降彩度', 'reduced'), v: String(clamped) },
              ]
            : [{ k: t(l, '狀態', 'status'), v: '—' }]
        }
      />
    </div>
  );
}
