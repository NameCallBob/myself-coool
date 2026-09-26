'use client';

/**
 * Crop, rotate, flip, resize — one bitmap, one canvas, four stages.
 *
 * The selection box is drawn over the *source* image, unrotated, and every
 * rectangle in state lives in source pixel coordinates. That is the only way
 * the numbers in the fields and the box on screen can be the same thing: if
 * the selection were kept in screen space it would need re-deriving on every
 * layout change, and a 4000 px photo displayed at 700 px would quietly lose
 * precision each time. The rotation and the flips are applied when the output
 * is rendered, and the preview shows the result.
 *
 * Dragging writes to `draft`; letting go commits to `rect`. Only the commit
 * re-encodes, because encoding a 12 MP PNG on every pointermove is how a tool
 * like this ends up feeling broken.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  DropZone,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, fixed } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  OUTPUT_FORMATS,
  OUTPUT_LABEL,
  PIXEL_CEILING,
  RATIO_PRESETS,
  applyRatio,
  centeredRect,
  clampRect,
  cropName,
  describeRatio,
  dropsAlpha,
  isLossy,
  isSilentFallback,
  moveRect,
  parseRatio,
  pixels,
  pointToImage,
  resizeRect,
  resolveOutput,
  rotateDim,
  transformFor,
  withinCeiling,
  type Corner,
  type Dim,
  type Flip,
  type OutputFormat,
  type Point,
  type QuarterTurns,
  type Rect,
} from './logic';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type Source = {
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  url: string;
};

type Output = { url: string; bytes: number; dim: Dim; blob: Blob; actualType: string };

type Drag =
  | { mode: 'new'; start: Point }
  | { mode: 'move'; start: Point; startRect: Rect }
  | { mode: 'corner'; corner: Corner; startRect: Rect };

/** Blank means "follow the other side". Zero and junk mean the same thing. */
function parseSide(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
}

/**
 * The whole pipeline as numbers. Called during render for the readouts and
 * again inside the render effect, so that the effect can depend on plain
 * strings and never on an object rebuilt every render.
 */
function plan(
  source: Dim,
  rect: Rect,
  turns: QuarterTurns,
  widthText: string,
  heightText: string,
  lockRatio: boolean
) {
  const crop = clampRect(rect, source);
  const rotated = rotateDim(crop, turns);
  const out = resolveOutput(
    rotated,
    { width: parseSide(widthText), height: parseSide(heightText) },
    !lockRatio
  );
  return { crop, rotated, out, oversize: !withinCeiling(out) };
}

async function encodeSurface(
  dim: Dim,
  format: OutputFormat,
  quality: number,
  draw: (ctx: Ctx2D) => void
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(dim.width, dim.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    draw(ctx);
    return canvas.convertToBlob({ type: format, quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = dim.width;
  canvas.height = dim.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  draw(ctx);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas produced no blob'))),
      format,
      quality
    );
  });
}

/** Render the cropped, turned, flipped, scaled result. */
async function renderOutput(
  bitmap: ImageBitmap,
  crop: Rect,
  turns: QuarterTurns,
  flip: Flip,
  out: Dim,
  format: OutputFormat,
  quality: number,
  background: string | null
): Promise<Blob> {
  // The canvas is the final size; the image is painted at the pre-rotation
  // size, and the transform rotates that box onto the canvas.
  const draw = turns % 2 === 1 ? { width: out.height, height: out.width } : out;
  const matrix = transformFor(draw, turns, flip);
  return encodeSurface(out, format, quality, (ctx) => {
    ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, draw.width, draw.height);
    }
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, draw.width, draw.height);
  });
}

export default function ImageCrop({ l }: ToolProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [draft, setDraft] = useState<Rect | null>(null);
  const [turns, setTurns] = useState<QuarterTurns>(0);
  const [flip, setFlip] = useState<Flip>({ horizontal: false, vertical: false });
  const [ratioKey, setRatioKey] = useState<string>('free');
  const [customRatio, setCustomRatio] = useState('16:9');
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [lockRatio, setLockRatio] = useState(true);
  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [qualityText, setQualityText] = useState('0.9');
  const [background, setBackground] = useState('#ffffff');
  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  /** Mirror of `draft`, so the pointer-up handler can commit the final
   *  rectangle without doing work inside a setState updater — those run twice
   *  under StrictMode and must stay pure. */
  const draftRect = useRef<Rect | null>(null);

  const qualityRaw = Number(qualityText);
  const quality = Number.isFinite(qualityRaw) ? Math.min(1, Math.max(0.05, qualityRaw)) : 0.9;
  const qualityValid = Number.isFinite(qualityRaw) && qualityRaw >= 0.05 && qualityRaw <= 1;

  const ratio = useMemo(() => {
    if (ratioKey === 'free') return null;
    if (ratioKey === 'custom') return parseRatio(customRatio);
    return parseRatio(ratioKey);
  }, [ratioKey, customRatio]);
  const ratioBroken = ratioKey === 'custom' && ratio === null;

  const live = draft ?? rect;
  const shape = plan(
    source ?? { width: 1, height: 1 },
    rect,
    turns,
    widthText,
    heightText,
    lockRatio
  );

  // Release the decoded frame and the preview URL when either is replaced.
  useEffect(
    () => () => {
      if (source) {
        URL.revokeObjectURL(source.url);
        source.bitmap.close();
      }
    },
    [source]
  );

  // Re-encode whenever anything that affects the output changes. The state
  // write happens after an await, so this is not a synchronous setState in an
  // effect; the URL is only created once the result is known to still matter.
  useEffect(() => {
    if (!source) return;
    const shaped = plan(source, rect, turns, widthText, heightText, lockRatio);
    if (shaped.oversize) return;
    let alive = true;
    let url: string | null = null;
    void (async () => {
      try {
        const blob = await renderOutput(
          source.bitmap,
          shaped.crop,
          turns,
          flip,
          shaped.out,
          format,
          quality,
          dropsAlpha(format) ? background : null
        );
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setOutput({ url, bytes: blob.size, dim: shaped.out, blob, actualType: blob.type });
        setError(null);
      } catch (problem) {
        if (!alive) return;
        setOutput(null);
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, rect, turns, flip, widthText, heightText, lockRatio, format, quality, background]);

  const take = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      try {
        const bitmap = await createImageBitmap(file);
        if (!withinCeiling({ width: bitmap.width, height: bitmap.height })) {
          bitmap.close();
          setError(
            t(
              l,
              `${bitmap.width}x${bitmap.height} 超過 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP 上限,這個工具不收。`,
              `${bitmap.width}x${bitmap.height} is over the ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP ceiling.`
            )
          );
          return;
        }
        setSource({
          name: file.name,
          size: file.size,
          type: file.type || t(l, '未標示', 'unlabelled'),
          width: bitmap.width,
          height: bitmap.height,
          bitmap,
          url: URL.createObjectURL(file),
        });
        setRect({ x: 0, y: 0, width: bitmap.width, height: bitmap.height });
        // Default to the format it arrived in: re-encoding a photo as a
        // full-size PNG is both slow and several times larger, and turning a
        // screenshot into JPEG blurs the text. Only these three are offered,
        // so anything else (AVIF, GIF, BMP) lands on PNG.
        setFormat(
          file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png'
        );
        setDraft(null);
        setTurns(0);
        setFlip({ horizontal: false, vertical: false });
        setOutput(null);
      } catch {
        setError(
          t(
            l,
            '這個瀏覽器無法解碼這個檔案。HEIC/HEIF 與部分 TIFF 不在瀏覽器的解碼範圍內,先轉成 JPEG 或 PNG。',
            'This browser cannot decode the file. HEIC/HEIF and some TIFF variants are outside what browsers decode — convert to JPEG or PNG first.'
          )
        );
      }
    },
    [l]
  );

  // Memoised so the drag callbacks below are not rebuilt on every render.
  const bounds: Dim = useMemo(() => source ?? { width: 1, height: 1 }, [source]);

  const pointOf = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): Point => {
      const element = frame.current;
      if (!element) return { x: 0, y: 0 };
      const box = element.getBoundingClientRect();
      return pointToImage(
        { x: event.clientX - box.left, y: event.clientY - box.top },
        { width: box.width, height: box.height },
        bounds
      );
    },
    [bounds]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!source || event.button !== 0) return;
      const element = frame.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const point = pointOf(event);
      // A grab zone of ~14 CSS px, expressed in image pixels so it stays the
      // same physical size whatever the image is scaled to.
      const tolerance = Math.max(
        4,
        Math.round((14 * source.width) / Math.max(1, box.width))
      );
      const corners: [Corner, number, number][] = [
        ['nw', rect.x, rect.y],
        ['ne', rect.x + rect.width, rect.y],
        ['sw', rect.x, rect.y + rect.height],
        ['se', rect.x + rect.width, rect.y + rect.height],
      ];
      const hit = corners.find(
        ([, cx, cy]) => Math.abs(point.x - cx) <= tolerance && Math.abs(point.y - cy) <= tolerance
      );
      const inside =
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height;

      drag.current = hit
        ? { mode: 'corner', corner: hit[0], startRect: rect }
        : inside
          ? { mode: 'move', start: point, startRect: rect }
          : { mode: 'new', start: point };
      draftRect.current = rect;
      setDraft(rect);
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [pointOf, rect, source]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = drag.current;
      if (!active || !source) return;
      const point = pointOf(event);
      const next =
        active.mode === 'new'
          ? // A fresh drag is the SE corner of a box anchored where it
            // started, which is also how a locked ratio is honoured from the
            // very first pixel of the gesture.
            resizeRect({ x: active.start.x, y: active.start.y, width: 1, height: 1 }, 'se', point, bounds, ratio)
          : active.mode === 'move'
            ? moveRect(active.startRect, point.x - active.start.x, point.y - active.start.y, bounds)
            : resizeRect(active.startRect, active.corner, point, bounds, ratio);
      draftRect.current = next;
      setDraft(next);
    },
    [bounds, pointOf, ratio, source]
  );

  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    const final = draftRect.current;
    draftRect.current = null;
    if (final) setRect(final);
    setDraft(null);
  }, []);

  const setEdge = useCallback(
    (key: keyof Rect, text: string) => {
      const value = Number(text);
      if (!Number.isFinite(value)) return;
      const next = clampRect({ ...rect, [key]: Math.round(value) }, bounds);
      setRect(ratio !== null ? applyRatio(next, ratio, bounds) : next);
    },
    [bounds, ratio, rect]
  );

  const reset = useCallback(() => {
    if (!source) return;
    setRect({ x: 0, y: 0, width: source.width, height: source.height });
    draftRect.current = null;
    setDraft(null);
    setTurns(0);
    setFlip({ horizontal: false, vertical: false });
    setWidthText('');
    setHeightText('');
  }, [source]);

  const clear = useCallback(() => {
    setSource(null);
    setOutput(null);
    draftRect.current = null;
    setDraft(null);
    setError(null);
    setRect({ x: 0, y: 0, width: 1, height: 1 });
  }, []);

  const save = useCallback(() => {
    if (!output || !source) return;
    const anchor = document.createElement('a');
    anchor.href = output.url;
    anchor.download = cropName(source.name, format);
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, [format, output, source]);

  const percent = (value: number, total: number) => `${(value / Math.max(1, total)) * 100}%`;
  const handleStyle = (corner: Corner): CSSProperties => ({
    position: 'absolute',
    width: '10px',
    height: '10px',
    background: 'var(--bg)',
    border: '1px solid var(--accent)',
    left: corner === 'nw' || corner === 'sw' ? '-5px' : undefined,
    right: corner === 'ne' || corner === 'se' ? '-5px' : undefined,
    top: corner === 'nw' || corner === 'ne' ? '-5px' : undefined,
    bottom: corner === 'sw' || corner === 'se' ? '-5px' : undefined,
  });

  const mismatch = output ? isSilentFallback(format, output.actualType) : false;

  return (
    <div>
      <Bench
        leftLabel={t(l, '原圖與選取', 'SOURCE & SELECTION')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={
          <span className="inst-no">
            {source ? `${source.width}x${source.height}` : '—'}
          </span>
        }
        rightAside={<span className="inst-no">{output ? fmtBytes(output.bytes) : '—'}</span>}
        left={
          <>
            {/* Left in place after a file is loaded: dropping another one is
                how you swap images, and hiding the zone would mean clearing
                first. */}
            <DropZone
              l={l}
              onFiles={take}
              accept="image/*"
              hint={
                source
                  ? t(l, '換一張:拖進來或點一下選檔', 'Swap: drop another image, or click to choose')
                  : t(l, '把一張圖拖進來,或點一下選檔', 'Drop an image here, or click to choose')
              }
            />

            {source ? (
              <>
                <div
                  ref={frame}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{
                    position: 'relative',
                    display: 'block',
                    overflow: 'hidden',
                    touchAction: 'none',
                    userSelect: 'none',
                    cursor: 'crosshair',
                    border: '1px solid var(--rule)',
                    lineHeight: 0,
                  }}
                >
                  {/* Blob URL made in this tab. An <img> rather than
                      next/image because the bytes are local and must not pass
                      through any loader or optimiser. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={source.url}
                    alt={t(l, '原圖,可在上面拖曳選取範圍', 'Source image; drag on it to select a crop')}
                    draggable={false}
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: percent(live.x, source.width),
                      top: percent(live.y, source.height),
                      width: percent(live.width, source.width),
                      height: percent(live.height, source.height),
                      outline: '1px solid var(--accent)',
                      // Everything outside the selection, dimmed with one
                      // oversized shadow instead of four positioned masks.
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                    }}
                  >
                    <span style={handleStyle('nw')} />
                    <span style={handleStyle('ne')} />
                    <span style={handleStyle('sw')} />
                    <span style={handleStyle('se')} />
                  </div>
                </div>
                <Note>
                  {t(
                    l,
                    '在圖上拖曳畫出選取範圍,拖框內移動,拖四角改大小。要精準到像素就直接改下面的數字。',
                    'Drag on the image to select, drag inside to move, drag a corner to resize. For exact pixels, type in the fields below.'
                  )}
                </Note>
              </>
            ) : null}

            {error ? <Note error>{error}</Note> : null}

            {source ? (
              <>
                <Row>
                  <Input
                    label="X"
                    type="number"
                    min={0}
                    step={1}
                    value={live.x}
                    onChange={(next) => setEdge('x', next)}
                  />
                  <Input
                    label="Y"
                    type="number"
                    min={0}
                    step={1}
                    value={live.y}
                    onChange={(next) => setEdge('y', next)}
                  />
                  <Input
                    label={t(l, '寬', 'W')}
                    type="number"
                    min={1}
                    step={1}
                    value={live.width}
                    onChange={(next) => setEdge('width', next)}
                  />
                  <Input
                    label={t(l, '高', 'H')}
                    type="number"
                    min={1}
                    step={1}
                    value={live.height}
                    onChange={(next) => setEdge('height', next)}
                  />
                </Row>

                <Row>
                  <Select
                    label={t(l, '鎖定比例', 'Lock ratio')}
                    value={ratioKey}
                    onChange={(next) => {
                      setRatioKey(next);
                      const locked = next === 'free' ? null : next === 'custom' ? parseRatio(customRatio) : parseRatio(next);
                      if (locked !== null) setRect(applyRatio(rect, locked, bounds));
                    }}
                    options={[
                      { value: 'free', label: t(l, '不鎖', 'free') },
                      ...RATIO_PRESETS.map((preset) => ({ value: preset.key, label: preset.key })),
                      { value: 'custom', label: t(l, '自訂', 'custom') },
                    ]}
                  />
                  {ratioKey === 'custom' ? (
                    <Input
                      label={t(l, '比例 寬:高', 'Ratio W:H')}
                      value={customRatio}
                      invalid={ratioBroken}
                      onChange={(next) => {
                        setCustomRatio(next);
                        const parsed = parseRatio(next);
                        if (parsed !== null) setRect(applyRatio(rect, parsed, bounds));
                      }}
                      placeholder="16:9"
                      hint={t(l, '可寫 16:9、16/9 或 1.78。', 'Accepts 16:9, 16/9 or 1.78.')}
                    />
                  ) : null}
                  <Btn
                    onClick={() => {
                      setDraft(null);
                      setRect(
                        ratio === null
                          ? { x: 0, y: 0, width: source.width, height: source.height }
                          : centeredRect(source, ratio)
                      );
                    }}
                  >
                    {ratio === null ? t(l, '全選', 'select all') : t(l, '置中最大', 'centre, largest')}
                  </Btn>
                </Row>

                <Row>
                  <Seg
                    label={t(l, '旋轉', 'Rotate')}
                    value={String(turns)}
                    onChange={(next) => setTurns(Number(next) as QuarterTurns)}
                    options={[
                      { value: '0', label: '0°' },
                      { value: '1', label: '90°' },
                      { value: '2', label: '180°' },
                      { value: '3', label: '270°' },
                    ]}
                  />
                  <Check2
                    label={t(l, '水平翻轉', 'flip horizontal')}
                    checked={flip.horizontal}
                    onChange={(next) => setFlip((current) => ({ ...current, horizontal: next }))}
                  />
                  <Check2
                    label={t(l, '垂直翻轉', 'flip vertical')}
                    checked={flip.vertical}
                    onChange={(next) => setFlip((current) => ({ ...current, vertical: next }))}
                  />
                </Row>
                <Note>
                  {t(
                    l,
                    '旋轉是順時針的整數 90 度,不會重新取樣,所以不掉畫質。翻轉是對「你現在看到的輸出」翻,先旋轉再翻轉。',
                    'Rotation is clockwise whole quarter turns, so nothing is resampled and no detail is lost. Flips apply to the output as you see it — rotation first, then flip.'
                  )}
                </Note>

                <Row>
                  <Input
                    label={t(l, '輸出寬 px', 'Output W px')}
                    type="number"
                    min={1}
                    step={1}
                    value={widthText}
                    onChange={setWidthText}
                    placeholder={String(shape.rotated.width)}
                  />
                  <Input
                    label={t(l, '輸出高 px', 'Output H px')}
                    type="number"
                    min={1}
                    step={1}
                    value={heightText}
                    onChange={setHeightText}
                    placeholder={String(shape.rotated.height)}
                  />
                  <Check2
                    label={t(l, '不變形(維持選取比例)', 'No distortion (keep crop ratio)')}
                    checked={lockRatio}
                    onChange={setLockRatio}
                  />
                </Row>
                <Note>
                  {t(
                    l,
                    '兩個都留空就是選取範圍的原始像素。只填一個,另一個按比例算。兩個都填而且勾了「不變形」,輸出會縮進你指定的框裡而不是被拉扯。',
                    'Leave both blank for the crop as-is. Fill one and the other follows. Fill both with "no distortion" on and the result fits inside the box you asked for instead of being stretched.'
                  )}
                </Note>

                <Row>
                  <Select
                    label={t(l, '輸出格式', 'Output format')}
                    value={format}
                    onChange={setFormat}
                    options={OUTPUT_FORMATS.map((candidate) => ({
                      value: candidate,
                      label: OUTPUT_LABEL[candidate],
                    }))}
                    hint={t(
                      l,
                      '截圖、線稿、要留透明就 PNG。要換編碼器或壓大小用「圖片壓縮與轉檔」。',
                      'PNG for screenshots, line art and transparency. Use the image converter to change codecs or hit a size budget.'
                    )}
                  />
                  {isLossy(format) ? (
                    <Input
                      label={t(l, '品質 0.05–1', 'Quality 0.05–1')}
                      type="number"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={qualityText}
                      invalid={!qualityValid}
                      onChange={setQualityText}
                    />
                  ) : null}
                  {dropsAlpha(format) ? (
                    <Input
                      label={t(l, '透明處填色', 'Flatten alpha onto')}
                      type="color"
                      value={background}
                      onChange={setBackground}
                      hint={t(l, 'JPEG 沒有透明通道。', 'JPEG has no alpha channel.')}
                    />
                  ) : null}
                </Row>

                <Row>
                  <Btn primary onClick={save} disabled={!output}>
                    {t(l, '下載', 'save')}
                  </Btn>
                  <Btn onClick={reset}>{t(l, '回到原圖', 'reset edits')}</Btn>
                  <Btn onClick={clear}>{t(l, '清空', 'clear')}</Btn>
                </Row>
              </>
            ) : null}
          </>
        }
        right={
          source ? (
            <div aria-live="polite">
              {shape.oversize ? (
                <Note error>
                  {t(
                    l,
                    `輸出 ${shape.out.width}x${shape.out.height} 超過 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP 上限,沒有算。把輸出尺寸改小。`,
                    `Output ${shape.out.width}x${shape.out.height} is over the ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP ceiling — nothing was rendered. Ask for less.`
                  )}
                </Note>
              ) : null}

              {output && !shape.oversize ? (
                <>
                  {/* Blob URL from this tab; see the note on the source image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={output.url}
                    alt={t(l, '輸出預覽', 'Output preview')}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      height: 'auto',
                      border: '1px solid var(--rule)',
                    }}
                  />
                  <Table
                    head={[t(l, '項目', 'item'), t(l, '值', 'value')]}
                    align={['left', 'right']}
                    rows={[
                      [
                        t(l, '選取範圍', 'selection'),
                        <span key="v" className="inst-no">
                          {`${shape.crop.width}x${shape.crop.height} @ ${shape.crop.x},${shape.crop.y}`}
                        </span>,
                      ],
                      [
                        t(l, '選取比例', 'selection ratio'),
                        <span key="v" className="inst-no">
                          {describeRatio(shape.crop.width, shape.crop.height)}
                        </span>,
                      ],
                      [
                        t(l, '旋轉後', 'after rotation'),
                        <span key="v" className="inst-no">
                          {`${shape.rotated.width}x${shape.rotated.height}`}
                        </span>,
                      ],
                      [
                        t(l, '輸出尺寸', 'output'),
                        <span key="v" className="inst-no">
                          {`${output.dim.width}x${output.dim.height}`}
                        </span>,
                      ],
                      [
                        t(l, '輸出比例', 'output ratio'),
                        <span key="v" className="inst-no">
                          {describeRatio(output.dim.width, output.dim.height)}
                        </span>,
                      ],
                      [
                        t(l, '檔名', 'file name'),
                        <span key="v" className="inst-no">
                          {cropName(source.name, format)}
                        </span>,
                      ],
                    ]}
                  />
                  {describeRatio(shape.crop.width, shape.crop.height) !==
                  describeRatio(output.dim.width, output.dim.height) ? (
                    <Note>
                      {t(
                        l,
                        '輸出比例和選取比例不一樣:你指定的尺寸把它拉過了。要維持形狀就勾「不變形」,或只填一邊。',
                        'The output ratio differs from the selection: the size you asked for stretched it. Tick "no distortion", or fill only one side.'
                      )}
                    </Note>
                  ) : null}
                  {mismatch ? (
                    <Note error>
                      {t(
                        l,
                        `瀏覽器沒有輸出 ${OUTPUT_LABEL[format]},實際拿到的是 ${output.actualType || t(l, '未標示的格式', 'an unlabelled type')}。canvas 在編不出來時會默默改吐 PNG,換個格式。`,
                        `The browser did not produce ${OUTPUT_LABEL[format]} — it returned ${output.actualType || 'an unlabelled type'}. A canvas that cannot encode silently falls back to PNG; pick another format.`
                      )}
                    </Note>
                  ) : null}
                </>
              ) : shape.oversize ? null : (
                <Note>{t(l, '算輸出中。', 'Rendering the output.')}</Note>
              )}
            </div>
          ) : (
            <Note>
              {t(
                l,
                '丟一張圖進來。解碼、裁切、旋轉、編碼都在這個分頁裡做,檔案不會離開這台裝置。',
                'Drop an image. Decode, crop, rotate and encode all happen in this tab; the file never leaves this device.'
              )}
            </Note>
          )
        }
      />

      <Panel label={t(l, '這個工具怎麼算', 'HOW IT COMPUTES')}>
        <Table
          head={[t(l, '步驟', 'stage'), t(l, '做什麼', 'what happens')]}
          rows={[
            [
              t(l, '1 裁切', '1 crop'),
              t(
                l,
                '選取框的座標是原圖像素,不是螢幕像素。圖縮到多大都不影響裁出來的範圍。',
                'The selection is stored in source pixels, not screen pixels, so how the image is displayed never changes what is cut.'
              ),
            ],
            [
              t(l, '2 旋轉', '2 rotate'),
              t(
                l,
                '整數 90 度,用 canvas transform 做,像素只是換位置,沒有內插。',
                'Whole quarter turns via a canvas transform: pixels move, nothing is interpolated.'
              ),
            ],
            [
              t(l, '3 翻轉', '3 flip'),
              t(l, '在旋轉之後、對你看到的畫面翻。', 'Applied after the rotation, to the picture you see.'),
            ],
            [
              t(l, '4 縮放', '4 scale'),
              t(
                l,
                '最後一步才縮到輸出尺寸,用瀏覽器的高品質取樣。放大不會長出細節。',
                'Only the last stage resamples, using the browser high-quality filter. Enlarging adds no detail.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            `鎖定比例是算到整數像素為止:16:9 在 1000 px 寬是 562.5 px 高,沒有這種矩形,所以會四捨五入成 563,實際比例 1.776。要精確就填能整除的數字。上限 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP,因為一張解碼後的圖是「寬 x 高 x 4」位元組。`,
            `A locked ratio is honoured to the pixel and no further: 16:9 at 1000 px wide is 562.5 px tall, which is not a rectangle, so it rounds to 563 — an actual ratio of 1.776. Pick numbers that divide if you need it exact. The ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP ceiling is there because a decoded frame costs width x height x 4 bytes.`
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          {
            k: t(l, '原圖', 'source'),
            v: source ? `${source.width}x${source.height}` : '—',
          },
          {
            k: t(l, '選取', 'selection'),
            v: source ? `${live.width}x${live.height}` : '—',
          },
          {
            k: t(l, '選取比例', 'ratio'),
            v: source ? describeRatio(live.width, live.height) : '—',
          },
          {
            k: t(l, '輸出', 'output'),
            v: output ? `${output.dim.width}x${output.dim.height}` : '—',
          },
          {
            k: t(l, '輸出像素', 'output px'),
            v: output ? `${fixed(pixels(output.dim) / 1_000_000, 2)} MP` : '—',
          },
          { k: t(l, '原始檔', 'source bytes'), v: source ? fmtBytes(source.size) : '—' },
          { k: t(l, '輸出檔', 'output bytes'), v: output ? fmtBytes(output.bytes) : '—' },
          { k: t(l, '格式', 'format'), v: OUTPUT_LABEL[format] },
        ]}
      />
    </div>
  );
}
