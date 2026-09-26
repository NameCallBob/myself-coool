'use client';

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Btn, CopyButton, Input, Note, Panel, Readout, Row, Select } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  EXTRAS,
  PRESETS,
  analyse,
  clampControls,
  keywordFor,
  parseCss,
  samplePath,
  sampleTimeline,
  toCss,
  toLinearEasing,
  type Bezier,
} from './logic';

/** Graph geometry in SVG user units. y runs from 1.5 at the top to −0.5 at the
 *  bottom, so an overshoot has somewhere to go without rescaling as you drag. */
const W = 100;
const Y_TOP = 1.5;
const Y_BOTTOM = -0.5;
const H = (Y_TOP - Y_BOTTOM) * W; // 200

const toSvgX = (x: number) => x * W;
const toSvgY = (y: number) => (Y_TOP - y) * W;
const fromSvgX = (sx: number) => sx / W;
const fromSvgY = (sy: number) => Y_TOP - sy / W;

const ALL_NAMES = [...Object.keys(PRESETS), ...Object.keys(EXTRAS)];

export default function CubicBezier({ l }: ToolProps) {
  const [curve, setCurve] = useState<Bezier>(() => ({ ...PRESETS['ease-in-out'] }));
  const [against, setAgainst] = useState<string>('linear');
  const [text, setText] = useState(() => toCss(PRESETS['ease-in-out']));
  const [textError, setTextError] = useState(false);
  const [duration, setDuration] = useState(900);
  const [away, setAway] = useState(false);
  const [segments, setSegments] = useState(16);
  const [dragging, setDragging] = useState<1 | 2 | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);

  const apply = useCallback((next: Bezier) => {
    const safe = clampControls(next);
    setCurve(safe);
    setText(toCss(safe));
    setTextError(false);
  }, []);

  const path = useMemo(() => samplePath(curve, 96), [curve]);
  const report = useMemo(() => analyse(curve), [curve]);
  const timeline = useMemo(() => sampleTimeline(curve, 12), [curve]);
  const comparison = PRESETS[against] ?? EXTRAS[against] ?? PRESETS.linear;
  const css = toCss(curve);
  const linearCss = useMemo(() => toLinearEasing(curve, segments), [curve, segments]);
  const keyword = keywordFor(curve);

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement | SVGCircleElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const sx = ((event.clientX - box.left) / box.width) * W;
    const sy = ((event.clientY - box.top) / box.height) * H;
    return { x: fromSvgX(sx), y: fromSvgY(sy) };
  };

  const drag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const point = pointFromEvent(event);
    if (!point) return;
    apply(
      dragging === 1
        ? { ...curve, x1: point.x, y1: point.y }
        : { ...curve, x2: point.x, y2: point.y }
    );
  };

  /** Arrow keys nudge a handle, so the curve is reachable without a pointer. */
  const nudge = (which: 1 | 2, dx: number, dy: number) => {
    apply(
      which === 1
        ? { ...curve, x1: curve.x1 + dx, y1: curve.y1 + dy }
        : { ...curve, x2: curve.x2 + dx, y2: curve.y2 + dy }
    );
  };

  const handleKeys = (which: 1 | 2) => (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudge(which, move[0], move[1]);
  };

  const handles: { which: 1 | 2; x: number; y: number; label: string }[] = [
    { which: 1, x: curve.x1, y: curve.y1, label: t(l, '第一個控制點', 'First control point') },
    { which: 2, x: curve.x2, y: curve.y2, label: t(l, '第二個控制點', 'Second control point') },
  ];

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '曲線', 'CURVE')}</span>
            <span className="inst-no">{keyword ?? t(l, '自訂', 'custom')}</span>
          </div>
          <svg
            ref={svg}
            viewBox={`-10 -14 ${W + 20} ${H + 28}`}
            style={{ width: '100%', maxWidth: '26rem', touchAction: 'none', display: 'block' }}
            role="img"
            aria-label={t(l, '緩動曲線編輯區,控制點可用方向鍵調整', 'Easing curve editor; control points respond to arrow keys')}
            onPointerMove={drag}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            {/* The unit square: time across, progress up. Everything outside it
                is overshoot. */}
            <rect
              x={0}
              y={toSvgY(1)}
              width={W}
              height={toSvgY(0) - toSvgY(1)}
              fill="none"
              stroke="var(--border-2)"
              strokeWidth={0.6}
            />
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g}>
                <line x1={toSvgX(g)} y1={toSvgY(0)} x2={toSvgX(g)} y2={toSvgY(1)} stroke="var(--border-1)" strokeWidth={0.4} />
                <line x1={0} y1={toSvgY(g)} x2={W} y2={toSvgY(g)} stroke="var(--border-1)" strokeWidth={0.4} />
              </g>
            ))}
            <line x1={0} y1={toSvgY(0)} x2={W} y2={toSvgY(1)} stroke="var(--border-2)" strokeWidth={0.4} strokeDasharray="2 2" />

            <polyline
              points={samplePath(comparison, 64).map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
              fill="none"
              stroke="var(--fg-faint)"
              strokeWidth={0.8}
              strokeDasharray="3 2"
            />
            <polyline
              points={path.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.6}
            />

            <line x1={0} y1={toSvgY(0)} x2={toSvgX(curve.x1)} y2={toSvgY(curve.y1)} stroke="var(--data-teal)" strokeWidth={0.7} />
            <line x1={W} y1={toSvgY(1)} x2={toSvgX(curve.x2)} y2={toSvgY(curve.y2)} stroke="var(--data-slate)" strokeWidth={0.7} />

            {handles.map((handle) => (
              <circle
                key={handle.which}
                cx={toSvgX(handle.x)}
                cy={toSvgY(handle.y)}
                r={dragging === handle.which ? 4.5 : 3.5}
                fill={handle.which === 1 ? 'var(--data-teal)' : 'var(--data-slate)'}
                stroke="var(--bg-raised)"
                strokeWidth={1}
                tabIndex={0}
                role="slider"
                aria-label={handle.label}
                aria-valuetext={`x ${handle.x.toFixed(2)}, y ${handle.y.toFixed(2)}`}
                aria-valuenow={handle.x}
                aria-valuemin={0}
                aria-valuemax={1}
                style={{ cursor: 'grab' }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDragging(handle.which);
                }}
                onKeyDown={handleKeys(handle.which)}
              />
            ))}
          </svg>
          <Note>
            {t(
              l,
              '拖圓點,或聚焦後用方向鍵(按住 Shift 走大步)。X 限制在 0–1:超出的話時間會倒著走,CSS 也會直接拒絕。Y 可以超出,那就是 overshoot。',
              'Drag a handle, or focus one and use the arrow keys (Shift for bigger steps). X is limited to 0–1: outside it time would run backwards, and CSS rejects the value. Y may go outside, which is an overshoot.'
            )}
          </Note>
        </section>
        <div className="inst-seam" aria-hidden="true" />
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '數值', 'VALUES')}</span>
            <span className="inst-no">{report.overshoots ? t(l, '△ 會過衝', '△ overshoots') : ''}</span>
          </div>
          <div style={{ maxWidth: '26rem' }}>
            <Input
              label={t(l, 'cubic-bezier() 或關鍵字', 'cubic-bezier() or a keyword')}
              value={text}
              onChange={(value) => {
                setText(value);
                const parsed = parseCss(value);
                if (parsed) {
                  setCurve(clampControls(parsed));
                  setTextError(false);
                } else {
                  setTextError(value.trim() !== '');
                }
              }}
              invalid={textError}
              hint={t(l, '四個數字也可以,逗號或空白都吃。', 'Four bare numbers work too, comma- or space-separated.')}
            />
            {textError ? (
              <Note error>
                {t(
                  l,
                  '讀不出來。格式是 cubic-bezier(x1, y1, x2, y2),x 必須在 0 到 1 之間;關鍵字支援 ease / ease-in / ease-out / ease-in-out / linear。',
                  'Not readable. The form is cubic-bezier(x1, y1, x2, y2) with both x values in 0–1; keywords are ease / ease-in / ease-out / ease-in-out / linear.'
                )}
              </Note>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.5rem' }}>
              {(
                [
                  ['x1', curve.x1, 0, 1],
                  ['y1', curve.y1, -5, 5],
                  ['x2', curve.x2, 0, 1],
                  ['y2', curve.y2, -5, 5],
                ] as [keyof Bezier, number, number, number][]
              ).map(([key, value, min, max]) => (
                <Input
                  key={key}
                  label={key}
                  type="number"
                  value={value}
                  min={min}
                  max={max}
                  step={0.01}
                  onChange={(next) => apply({ ...curve, [key]: Number(next) })}
                />
              ))}
            </div>

            <Row>
              <CopyButton l={l} text={css} label={t(l, '複製 cubic-bezier()', 'copy cubic-bezier()')} />
              <Btn onClick={() => apply({ x1: curve.x2, y1: 1 - curve.y2, x2: curve.x1, y2: 1 - curve.y1 })}>
                {t(l, '前後反轉', 'reverse')}
              </Btn>
            </Row>

            <Select
              label={t(l, '載入一條曲線', 'Load a curve')}
              value={keyword ?? ''}
              onChange={(value) => {
                const preset = PRESETS[value] ?? EXTRAS[value];
                if (preset) apply({ ...preset });
              }}
              options={[
                { value: '', label: t(l, '(自訂)', '(custom)') },
                ...ALL_NAMES.map((n) => ({ value: n, label: n })),
              ]}
            />
            <Select
              label={t(l, '虛線比較對象', 'Dashed comparison')}
              value={against}
              onChange={setAgainst}
              options={ALL_NAMES.map((n) => ({ value: n, label: n }))}
            />
          </div>
        </section>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '節奏', 'RHYTHM')}>
          {/* Dots at even intervals of time, placed by progress. Where they
              bunch up, the motion is slow. */}
          <div style={{ position: 'relative', height: '1.5rem', borderBottom: '1px solid var(--border-2)' }} aria-hidden="true">
            {timeline.map((point, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${Math.min(100, Math.max(0, point.y * 100))}%`,
                  bottom: '0.35rem',
                  width: '4px',
                  height: '4px',
                  marginLeft: '-2px',
                  background: i === 0 || i === timeline.length - 1 ? 'var(--accent)' : 'var(--fg-muted)',
                }}
              />
            ))}
          </div>
          <p className="inst-hint">
            {t(
              l,
              '每個點是相同的時間間隔。點擠在一起的地方動得慢,散開的地方動得快。',
              'Each dot is one equal slice of time. Where they bunch up the motion is slow; where they spread out it is fast.'
            )}
          </p>

          <Row>
            <Btn onClick={() => setAway((v) => !v)} primary>
              {away ? t(l, '播回來', 'play back') : t(l, '播出去', 'play')}
            </Btn>
            <Input
              label={t(l, '時長 (ms)', 'Duration (ms)')}
              type="number"
              value={duration}
              min={100}
              max={5000}
              step={50}
              onChange={(value) => setDuration(Math.min(5000, Math.max(100, Number(value) || 900)))}
            />
          </Row>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {[
              { label: keyword ?? t(l, '自訂', 'custom'), easing: css, accent: true },
              { label: against, easing: toCss(comparison), accent: false },
            ].map((row) => (
              <div key={row.label}>
                <span className="inst-no">{row.label}</span>
                <div
                  style={{
                    position: 'relative',
                    height: '1.75rem',
                    border: '1px solid var(--border-2)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '0.25rem',
                      width: '1.25rem',
                      height: '1.25rem',
                      background: row.accent ? 'var(--accent)' : 'var(--fg-faint)',
                      // `left` rather than a transform, so the two tracks stay
                      // comparable: the box travels exactly the track width
                      // minus its own size in both rows.
                      left: away ? 'calc(100% - 1.25rem)' : '0',
                      transitionProperty: 'left',
                      transitionDuration: `${duration}ms`,
                      transitionTimingFunction: row.easing,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Note>
            {t(
              l,
              '兩條用同一個時長跑,差別只有 timing function。過衝的曲線會看到方塊衝過去再退回來。',
              'Both run for the same duration and differ only in the timing function. An overshooting curve visibly runs past the end and comes back.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, 'linear() 近似', 'linear() APPROXIMATION')}>
          <Row>
            <Input
              label={t(l, '分段數', 'Segments')}
              type="number"
              value={segments}
              min={2}
              max={64}
              step={1}
              onChange={(value) => setSegments(Math.min(64, Math.max(2, Number(value) || 16)))}
            />
            <CopyButton l={l} text={linearCss} label={t(l, '複製 linear()', 'copy linear()')} />
          </Row>
          <pre className="inst-out mt-3" style={{ whiteSpace: 'pre-wrap', minHeight: 0 }} aria-live="polite">
            {linearCss}
          </pre>
          <Note>
            {t(
              l,
              'linear() 是折線,所以這是取樣近似,不是等價轉換——在取樣點上完全相同,兩點之間走直線。需要在只接受停駐點清單的地方(例如 scroll-driven animation 的 range)表達這條曲線時才用。',
              'linear() is a polyline, so this is a sampled approximation rather than a translation: exact at every sample, straight between them. Use it where an easing has to be expressed as a stop list rather than a timing function.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '半程進度', 'progress at 50%'), v: report.midpoint.toFixed(4) },
          { k: t(l, '最快速度', 'peak speed'), v: `${report.peakSpeed.toFixed(2)}×` },
          { k: t(l, '最快時點', 'peak at'), v: `${(report.peakSpeedAt * 100).toFixed(0)}%` },
          { k: t(l, '最大進度', 'max progress'), v: report.maxProgress.toFixed(3) },
          { k: t(l, '單調', 'monotonic'), v: report.monotonic ? t(l, '是', 'yes') : t(l, '否', 'no') },
        ]}
      />
    </div>
  );
}
