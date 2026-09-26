'use client';

import { useMemo, useState } from 'react';
import { Btn, Check2, CopyButton, Input, Note, Panel, Readout, Row, Seg, Select, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULT_BORDER,
  DEFAULT_ELEVATION,
  DEFAULT_RADIUS,
  MAX_LAYERS,
  buildElevation,
  formatBorder,
  formatCss,
  formatRadius,
  formatShadow,
  parseRgba,
  parseShadow,
  stackedOpacity,
  type Border,
  type BorderStyle,
  type Elevation,
  type Layer,
  type Radius,
  type Unit,
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
    <label style={{ display: 'grid', gap: '0.25rem', minWidth: '8rem' }}>
      <span className="inst-no" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
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

const hexOf = (color: { r: number; g: number; b: number }) =>
  `#${[color.r, color.g, color.b]
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;

export default function ShadowCss({ l }: ToolProps) {
  const [mode, setMode] = useState<'elevation' | 'manual'>('elevation');
  const [elevation, setElevation] = useState<Elevation>(DEFAULT_ELEVATION);
  const [manual, setManual] = useState<Layer[]>(() => buildElevation(DEFAULT_ELEVATION).slice(0, 2));
  const [radius, setRadius] = useState<Radius>(DEFAULT_RADIUS);
  const [border, setBorder] = useState<Border>(DEFAULT_BORDER);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [surface, setSurface] = useState<'light' | 'dark'>('light');

  const layers = mode === 'elevation' ? buildElevation(elevation) : manual;

  const design = useMemo(() => ({ layers, radius, border }), [layers, radius, border]);
  const css = useMemo(() => formatCss(design), [design]);
  const shadowValue = useMemo(() => formatShadow(layers), [layers]);
  const opacity = useMemo(() => stackedOpacity(layers), [layers]);

  const setLayer = (index: number, patch: Partial<Layer>) =>
    setManual((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const importPaste = () => {
    const result = parseShadow(paste);
    if (!result.ok) {
      setPasteError(
        t(
          l,
          `第 ${result.layer + 1} 層讀不出來:${result.error}`,
          `Layer ${result.layer + 1} did not parse: ${result.error}`
        )
      );
      return;
    }
    setPasteError(null);
    setManual(result.layers.length > 0 ? result.layers : buildElevation(DEFAULT_ELEVATION).slice(0, 2));
    setMode('manual');
  };

  const shadowColorHex = hexOf(elevation.color);

  return (
    <div>
      <Panel
        label={t(l, '預覽', 'PREVIEW')}
        aside={
          <Seg
            label={t(l, '底色', 'Surface')}
            value={surface}
            onChange={setSurface}
            options={[
              { value: 'light', label: t(l, '淺', 'light') },
              { value: 'dark', label: t(l, '深', 'dark') },
            ]}
          />
        }
      >
        <div
          style={{
            background: surface === 'light' ? '#f2efe8' : '#181512',
            padding: '3.5rem 2rem',
            display: 'grid',
            placeItems: 'center',
            border: '1px solid var(--border-2)',
          }}
        >
          <div
            style={{
              width: 'min(18rem, 100%)',
              height: '7rem',
              background: surface === 'light' ? '#ffffff' : '#201c18',
              color: surface === 'light' ? '#1a1714' : '#ede8df',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.06em',
              boxShadow: shadowValue,
              borderRadius: formatRadius(radius),
              border: formatBorder(border),
            }}
          >
            {layers.length} {t(l, '層', layers.length === 1 ? 'layer' : 'layers')}
          </div>
        </div>
      </Panel>

      <div className="mt-8">
        <Panel label={t(l, '陰影', 'SHADOW')}>
          <Row>
            <Seg
              label={t(l, '做法', 'Method')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'elevation', label: t(l, '疊層產生', 'stack generator') },
                { value: 'manual', label: t(l, '逐層手調', 'per-layer') },
              ]}
            />
            {mode === 'elevation' ? (
              <Btn onClick={() => setManual(buildElevation(elevation))}>
                {t(l, '轉成可手調的層', 'hand over to per-layer')}
              </Btn>
            ) : null}
          </Row>

          {mode === 'elevation' ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
                  gap: '1rem 1.5rem',
                  maxWidth: '48rem',
                }}
              >
                <Slider
                  label={t(l, '層數', 'layers')}
                  value={elevation.layers}
                  min={1}
                  max={MAX_LAYERS}
                  step={1}
                  format={(v) => String(v)}
                  onChange={(layersCount) => setElevation((e) => ({ ...e, layers: layersCount }))}
                />
                <Slider
                  label={t(l, '最外層垂直距離', 'largest offset')}
                  value={elevation.distance}
                  min={1}
                  max={80}
                  step={1}
                  format={(v) => `${v}px`}
                  onChange={(distance) => setElevation((e) => ({ ...e, distance }))}
                />
                <Slider
                  label={t(l, '模糊倍率', 'blur ratio')}
                  value={elevation.blurRatio}
                  min={0.5}
                  max={4}
                  step={0.1}
                  format={(v) => `×${v}`}
                  onChange={(blurRatio) => setElevation((e) => ({ ...e, blurRatio }))}
                />
                <Slider
                  label={t(l, '總不透明度', 'total opacity')}
                  value={elevation.alpha}
                  min={0.02}
                  max={0.8}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(alpha) => setElevation((e) => ({ ...e, alpha }))}
                />
                <Slider
                  label={t(l, '衰減速度', 'falloff')}
                  value={elevation.falloff}
                  min={0.1}
                  max={0.95}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(falloff) => setElevation((e) => ({ ...e, falloff }))}
                />
                <Slider
                  label={t(l, '擴散', 'spread')}
                  value={elevation.spread}
                  min={-20}
                  max={20}
                  step={1}
                  format={(v) => `${v}px`}
                  onChange={(spread) => setElevation((e) => ({ ...e, spread }))}
                />
              </div>
              <Row>
                <label className="inst-status" style={{ cursor: 'pointer', gap: '0.4rem' }}>
                  <input
                    type="color"
                    value={shadowColorHex}
                    onChange={(event) => {
                      const parsed = parseRgba(event.target.value);
                      if (parsed) setElevation((e) => ({ ...e, color: { ...parsed, a: 1 } }));
                    }}
                    style={{ width: '2rem', height: '1.4rem', padding: 0, border: '1px solid var(--border-3)', background: 'none' }}
                    aria-label={t(l, '陰影顏色', 'Shadow colour')}
                  />
                  <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
                    {t(l, '陰影顏色', 'shadow colour')} {shadowColorHex}
                  </span>
                </label>
                <Btn onClick={() => setElevation(DEFAULT_ELEVATION)}>{t(l, '回到預設', 'defaults')}</Btn>
              </Row>
              <Note>
                {t(
                  l,
                  '每一層的垂直距離往上加倍,最外層剛好落在你設定的距離;不透明度反方向等比衰減,並且正規化成加起來等於「總不透明度」——所以層數改變時陰影的深淺不會跟著跳。這是經驗配方不是光學模擬:真的半影取決於光源大小與距離,CSS 兩個都不讓你講。',
                  'Each layer’s offset doubles, so the largest lands exactly at the distance you set. Opacity decays geometrically the other way and is normalised to sum to the total, so changing the layer count does not change how dark the shadow reads. It is an empirical recipe, not optics: a real penumbra depends on the size and distance of the light source, and CSS lets you state neither.'
                )}
              </Note>
            </>
          ) : (
            <>
              <Table
                head={[
                  t(l, '層', '#'),
                  'x',
                  'y',
                  t(l, '模糊', 'blur'),
                  t(l, '擴散', 'spread'),
                  t(l, '顏色', 'colour'),
                  'inset',
                ]}
                rows={manual.map((item, index) => [
                  <span key="i" className="inst-no">
                    {index + 1}
                  </span>,
                  <Slider
                    key="x"
                    label="x"
                    value={item.x}
                    min={-40}
                    max={40}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={(x) => setLayer(index, { x })}
                  />,
                  <Slider
                    key="y"
                    label="y"
                    value={item.y}
                    min={-40}
                    max={80}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={(y) => setLayer(index, { y })}
                  />,
                  <Slider
                    key="b"
                    label={t(l, '模糊', 'blur')}
                    value={item.blur}
                    min={0}
                    max={120}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={(blur) => setLayer(index, { blur })}
                  />,
                  <Slider
                    key="s"
                    label={t(l, '擴散', 'spread')}
                    value={item.spread}
                    min={-40}
                    max={40}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={(spread) => setLayer(index, { spread })}
                  />,
                  <span key="c" style={{ display: 'grid', gap: '0.35rem' }}>
                    <input
                      type="color"
                      value={hexOf(item.color)}
                      onChange={(event) => {
                        const parsed = parseRgba(event.target.value);
                        if (parsed) setLayer(index, { color: { ...parsed, a: item.color.a } });
                      }}
                      style={{ width: '2.5rem', height: '1.4rem', padding: 0, border: '1px solid var(--border-3)', background: 'none' }}
                      aria-label={t(l, `第 ${index + 1} 層顏色`, `Layer ${index + 1} colour`)}
                    />
                    <Slider
                      label="alpha"
                      value={item.color.a}
                      min={0}
                      max={1}
                      step={0.01}
                      format={(v) => v.toFixed(2)}
                      onChange={(a) => setLayer(index, { color: { ...item.color, a } })}
                    />
                  </span>,
                  <span key="in" style={{ display: 'grid', gap: '0.35rem' }}>
                    <Check2
                      label="inset"
                      checked={item.inset}
                      onChange={(inset) => setLayer(index, { inset })}
                    />
                    <Btn
                      onClick={() => setManual((current) => current.filter((_, i) => i !== index))}
                      disabled={manual.length <= 1}
                    >
                      {t(l, '刪除', 'remove')}
                    </Btn>
                  </span>,
                ])}
              />
              <Row>
                <Btn
                  onClick={() =>
                    setManual((current) =>
                      current.length >= MAX_LAYERS
                        ? current
                        : [...current, { x: 0, y: 2, blur: 4, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.12 }, inset: false }]
                    )
                  }
                  disabled={manual.length >= MAX_LAYERS}
                >
                  {t(l, '加一層', 'add a layer')}
                </Btn>
                <span className="inst-no">
                  {manual.length} / {MAX_LAYERS}
                </span>
              </Row>
            </>
          )}

          <div className="mt-3" style={{ maxWidth: '40rem' }}>
            <Input
              label={t(l, '把現成的 box-shadow 貼進來', 'Paste an existing box-shadow')}
              value={paste}
              onChange={(value) => {
                setPaste(value);
                setPasteError(null);
              }}
              placeholder="0 1px 2px rgba(0,0,0,.2), 0 4px 12px rgba(0,0,0,.1)"
              hint={t(l, '只吃 px;em/rem 的像素值取決於它落在哪裡,滑桿無法誠實表示。', 'px only: the pixel value of em/rem depends on where the rule lands, which numeric sliders cannot honestly represent.')}
            />
            <Row>
              <Btn onClick={importPaste} disabled={paste.trim() === ''}>
                {t(l, '讀進來', 'import')}
              </Btn>
            </Row>
            {pasteError ? <Note error>{pasteError}</Note> : null}
          </div>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '圓角與邊框', 'RADIUS & BORDER')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
              gap: '1rem 1.5rem',
              maxWidth: '48rem',
            }}
          >
            {(
              [
                ['tl', t(l, '左上', 'top left')],
                ['tr', t(l, '右上', 'top right')],
                ['br', t(l, '右下', 'bottom right')],
                ['bl', t(l, '左下', 'bottom left')],
              ] as [keyof Radius & ('tl' | 'tr' | 'br' | 'bl'), string][]
            ).map(([key, label]) => (
              <Slider
                key={key}
                label={label}
                value={radius[key]}
                min={0}
                max={radius.unit === '%' ? 50 : radius.unit === 'rem' ? 6 : 96}
                step={radius.unit === 'rem' ? 0.125 : 1}
                format={(v) => `${v}${radius.unit}`}
                onChange={(v) => setRadius((r) => ({ ...r, [key]: v }))}
              />
            ))}
          </div>
          <Row>
            <Seg
              label={t(l, '單位', 'Unit')}
              value={radius.unit}
              onChange={(unit: Unit) => setRadius((r) => ({ ...r, unit }))}
              options={[
                { value: 'px', label: 'px' },
                { value: 'rem', label: 'rem' },
                { value: '%', label: '%' },
              ]}
            />
            <Check2
              label={t(l, '橢圓角(兩組半徑)', 'elliptical corners')}
              checked={radius.elliptical}
              onChange={(elliptical) => setRadius((r) => ({ ...r, elliptical }))}
            />
            <Btn
              onClick={() =>
                setRadius((r) => ({ ...r, tr: r.tl, br: r.tl, bl: r.tl, tr2: r.tl2, br2: r.tl2, bl2: r.tl2 }))
              }
            >
              {t(l, '四角同值', 'match all corners')}
            </Btn>
          </Row>
          {radius.elliptical ? (
            <div
              className="mt-3"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                gap: '1rem 1.5rem',
                maxWidth: '48rem',
              }}
            >
              {(
                [
                  ['tl2', t(l, '左上(垂直)', 'top left (vertical)')],
                  ['tr2', t(l, '右上(垂直)', 'top right (vertical)')],
                  ['br2', t(l, '右下(垂直)', 'bottom right (vertical)')],
                  ['bl2', t(l, '左下(垂直)', 'bottom left (vertical)')],
                ] as [keyof Radius & ('tl2' | 'tr2' | 'br2' | 'bl2'), string][]
              ).map(([key, label]) => (
                <Slider
                  key={key}
                  label={label}
                  value={radius[key]}
                  min={0}
                  max={radius.unit === '%' ? 50 : radius.unit === 'rem' ? 6 : 96}
                  step={radius.unit === 'rem' ? 0.125 : 1}
                  format={(v) => `${v}${radius.unit}`}
                  onChange={(v) => setRadius((r) => ({ ...r, [key]: v }))}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '1rem 1.5rem', maxWidth: '48rem', alignItems: 'end' }}>
            <Slider
              label={t(l, '邊框寬度', 'border width')}
              value={border.width}
              min={0}
              max={12}
              step={0.5}
              format={(v) => `${v}px`}
              onChange={(width) => setBorder((b) => ({ ...b, width }))}
            />
            <Select
              label={t(l, '邊框樣式', 'Border style')}
              value={border.style}
              onChange={(style: BorderStyle) => setBorder((b) => ({ ...b, style }))}
              options={[
                { value: 'solid', label: 'solid' },
                { value: 'dashed', label: 'dashed' },
                { value: 'dotted', label: 'dotted' },
                { value: 'double', label: 'double' },
                { value: 'none', label: 'none' },
              ]}
            />
            <Slider
              label={t(l, '邊框不透明度', 'border alpha')}
              value={border.color.a}
              min={0}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(a) => setBorder((b) => ({ ...b, color: { ...b.color, a } }))}
            />
            <label className="inst-status" style={{ cursor: 'pointer', gap: '0.4rem' }}>
              <input
                type="color"
                value={hexOf(border.color)}
                onChange={(event) => {
                  const parsed = parseRgba(event.target.value);
                  if (parsed) setBorder((b) => ({ ...b, color: { ...parsed, a: b.color.a } }));
                }}
                style={{ width: '2rem', height: '1.4rem', padding: 0, border: '1px solid var(--border-3)', background: 'none' }}
                aria-label={t(l, '邊框顏色', 'Border colour')}
              />
              <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
                {t(l, '邊框顏色', 'border colour')}
              </span>
            </label>
            <Check2
              label={t(l, '要邊框', 'draw a border')}
              checked={border.enabled}
              onChange={(enabled) => setBorder((b) => ({ ...b, enabled }))}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, 'CSS', 'CSS')}>
          <Row>
            <CopyButton l={l} text={css} />
            <CopyButton l={l} text={shadowValue} label={t(l, '只複製 box-shadow 值', 'copy the shadow value')} />
          </Row>
          <pre className="inst-out mt-3" style={{ whiteSpace: 'pre-wrap' }} aria-live="polite">
            {css}
          </pre>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '層數', 'layers'), v: String(layers.length) },
          { k: t(l, '疊合後不透明度', 'composited opacity'), v: opacity.toFixed(3) },
          {
            k: t(l, '最大模糊', 'largest blur'),
            v: `${Math.max(0, ...layers.map((s) => s.blur)).toFixed(0)}px`,
          },
          { k: t(l, '圓角', 'radius'), v: formatRadius(radius) },
          { k: t(l, '邊框', 'border'), v: formatBorder(border) === 'none' ? '—' : formatBorder(border) },
        ]}
      />
    </div>
  );
}
