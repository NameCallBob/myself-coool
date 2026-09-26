'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  CANVAS_LIMITS,
  checkLayout,
  moveItem,
  normalizeHexColor,
  planJoin,
  type Align,
  type CrossFit,
  type JoinLayout,
  type Orientation,
} from './logic';

type Loaded = {
  /** Monotonic within this session; only used as a React key. */
  id: number;
  name: string;
  fileBytes: number;
  width: number;
  height: number;
  url: string;
  image: HTMLImageElement;
};

type Result = {
  url: string;
  bytes: number;
  type: string;
  width: number;
  height: number;
};

type Format = 'png' | 'jpeg' | 'webp';

const MIME: Record<Format, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Enough for a long screenshot run; past this the page is the wrong tool. */
const MAX_FILES = 40;

/**
 * Hard refusal line, well above the warning thresholds in `logic.ts`.
 *
 * A canvas this big either throws on allocation or — worse, on some builds —
 * hands back a blank bitmap. Refusing with a number on screen beats exporting
 * a 300 MB white rectangle.
 */
const REFUSE_AREA = 268_435_456; // 16384 x 16384

export default function ImageJoin({ l }: ToolProps) {
  const [items, setItems] = useState<Loaded[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('vertical');
  const [align, setAlign] = useState<Align>('center');
  const [fit, setFit] = useState<CrossFit>('none');
  const [gap, setGap] = useState('0');
  const [padding, setPadding] = useState('0');
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [format, setFormat] = useState<Format>('png');
  const [quality, setQuality] = useState('92');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Object URLs live outside React, so they are revoked by hand: the preview
   * thumbnails when a row goes away, the composed sheet when it is replaced.
   */
  const urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const open = urls.current;
    return () => {
      for (const url of open) URL.revokeObjectURL(url);
      open.clear();
    };
  }, []);

  const track = (url: string) => {
    urls.current.add(url);
    return url;
  };
  const drop = (url: string) => {
    urls.current.delete(url);
    URL.revokeObjectURL(url);
  };

  const gapPx = Math.max(0, Math.round(Number(gap) || 0));
  const padPx = Math.max(0, Math.round(Number(padding) || 0));
  const hex = normalizeHexColor(bg);
  const qualityPct = Math.min(100, Math.max(1, Math.round(Number(quality) || 92)));
  const lossy = format !== 'png';

  const layout: JoinLayout = useMemo(
    () =>
      planJoin(
        items.map((item) => ({ width: item.width, height: item.height })),
        { orientation, gap: gapPx, padding: padPx, align, fit }
      ),
    [items, orientation, gapPx, padPx, align, fit]
  );

  const check = useMemo(() => checkLayout(layout), [layout]);
  const tooBig = check.pixels > REFUSE_AREA;

  const clearResult = useCallback(() => {
    setResult((current) => {
      if (current) drop(current.url);
      return null;
    });
  }, []);

  const takeFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const room = MAX_FILES - items.length;
      if (room <= 0) {
        setError(t(l, `一次最多 ${MAX_FILES} 張。`, `At most ${MAX_FILES} images at a time.`));
        return;
      }
      const picked = files.filter((file) => file.type.startsWith('image/')).slice(0, room);
      const rejected = files.length - picked.length;
      const loaded: Loaded[] = [];
      const failed: string[] = [];

      for (const file of picked) {
        const url = track(URL.createObjectURL(file));
        const image = new Image();
        image.src = url;
        try {
          // decode() rather than onload: it resolves only once the pixels are
          // ready to draw, so the first compose cannot land on an empty image.
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('zero size');
          loaded.push({
            id: nextId(),
            name: file.name,
            fileBytes: file.size,
            width: image.naturalWidth,
            height: image.naturalHeight,
            url,
            image,
          });
        } catch {
          drop(url);
          failed.push(file.name);
        }
      }

      if (loaded.length > 0) {
        setItems((current) => [...current, ...loaded]);
        clearResult();
      }
      const problems: string[] = [];
      if (failed.length > 0) {
        problems.push(
          t(
            l,
            `這些檔案瀏覽器解不開,已跳過:${failed.join('、')}`,
            `The browser could not decode, so these were skipped: ${failed.join(', ')}`
          )
        );
      }
      if (rejected > 0) {
        problems.push(
          t(
            l,
            `有 ${rejected} 個檔案不是圖片或超過張數上限,沒有加入。`,
            `${rejected} file(s) were not images or exceeded the limit and were not added.`
          )
        );
      }
      setError(problems.length > 0 ? problems.join(' ') : null);
    },
    [clearResult, items.length, l]
  );

  const removeAt = (index: number) => {
    setItems((current) => {
      const target = current[index];
      if (target) drop(target.url);
      return current.filter((_, i) => i !== index);
    });
    clearResult();
  };

  const move = (from: number, to: number) => {
    setItems((current) => moveItem(current, from, to));
    clearResult();
  };

  const clearAll = () => {
    setItems((current) => {
      for (const item of current) drop(item.url);
      return [];
    });
    clearResult();
    setError(null);
  };

  /**
   * Draw the sheet.
   *
   * Explicitly a button rather than a live preview: allocating and encoding a
   * canvas of a few dozen megapixels is not something to do on every keystroke
   * of the gap field. The numbers in the table update live; the pixels wait.
   */
  const compose = async () => {
    if (items.length === 0 || tooBig) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = layout.canvas.width;
      canvas.height = layout.canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t(l, '這個瀏覽器沒有給 2D 繪圖環境。', 'No 2D context available.'));

      if (!(transparent && format !== 'jpeg')) {
        // JPEG has no alpha channel: an unfilled canvas would come out black,
        // so the background is painted regardless of the checkbox.
        ctx.fillStyle = hex ?? '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (const place of layout.placements) {
        const source = items[place.index];
        if (!source) continue;
        ctx.drawImage(source.image, place.x, place.y, place.width, place.height);
      }

      const mime = MIME[format];
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, lossy ? qualityPct / 100 : undefined);
      });
      if (!blob || blob.size === 0) {
        throw new Error(
          t(
            l,
            '瀏覽器拒絕輸出這張畫布——通常是尺寸太大。把間距或邊界調小,或改用「縮到最小」。',
            'The browser refused to export this canvas, usually because it is too large. Reduce the size or use fit-to-smallest.'
          )
        );
      }
      clearResult();
      setResult({
        url: track(URL.createObjectURL(blob)),
        bytes: blob.size,
        type: blob.type,
        width: canvas.width,
        height: canvas.height,
      });
      if (blob.type !== mime) {
        setError(
          t(
            l,
            `這個瀏覽器不支援輸出 ${format.toUpperCase()},實際存成 ${blob.type || '未知格式'}。`,
            `This browser cannot encode ${format.toUpperCase()}; it produced ${blob.type || 'an unknown type'} instead.`
          )
        );
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result) return;
    const ext = result.type === 'image/jpeg' ? 'jpg' : result.type === 'image/webp' ? 'webp' : 'png';
    const anchor = document.createElement('a');
    anchor.href = result.url;
    anchor.download = `joined-${result.width}x${result.height}.${ext}`;
    anchor.click();
  };

  const alignLabels =
    orientation === 'vertical'
      ? [t(l, '靠左', 'left'), t(l, '置中', 'centre'), t(l, '靠右', 'right')]
      : [t(l, '靠上', 'top'), t(l, '置中', 'centre'), t(l, '靠下', 'bottom')];

  const crossName = orientation === 'vertical' ? t(l, '寬度', 'width') : t(l, '高度', 'height');
  const totalInput = items.reduce((sum, item) => sum + item.fileBytes, 0);

  return (
    <div>
      <Bench
        leftLabel={t(l, '來源圖片', 'SOURCES')}
        rightLabel={t(l, '成品', 'SHEET')}
        leftAside={<span className="inst-no">{count(items.length)}</span>}
        rightAside={
          <span className="inst-no">
            {layout.canvas.width} × {layout.canvas.height}
          </span>
        }
        left={
          <>
            <DropZone
              l={l}
              onFiles={takeFiles}
              accept="image/*"
              multiple
              hint={t(
                l,
                '把圖片拖進來,或點一下選檔(可多選)',
                'Drop images here, or click to choose (multiple allowed)'
              )}
            />

            {items.length > 0 ? (
              <>
                <Table
                  head={[
                    '#',
                    t(l, '檔名', 'file'),
                    t(l, '原尺寸', 'source'),
                    t(l, '繪製尺寸', 'drawn'),
                    t(l, '位置 x,y', 'at x,y'),
                    t(l, '順序', 'order'),
                  ]}
                  align={['right', 'left', 'right', 'right', 'right', 'left']}
                  rows={items.map((item, index) => {
                    const place = layout.placements[index];
                    return [
                      <span key="n" className="inst-no">
                        {index + 1}
                      </span>,
                      <span key="f" className="inst-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this tab; next/image would try to route it through a loader */}
                        <img
                          src={item.url}
                          alt=""
                          width={28}
                          height={28}
                          style={{ width: 28, height: 28, objectFit: 'cover', flex: '0 0 auto', border: '1px solid var(--border-2)' }}
                        />
                        <span>{item.name}</span>
                      </span>,
                      <span key="s" className="inst-no">
                        {item.width}×{item.height}
                      </span>,
                      <span key="d" className="inst-no">
                        {place ? `${place.width}×${place.height}` : '—'}
                      </span>,
                      <span key="p" className="inst-no">
                        {place ? `${place.x},${place.y}` : '—'}
                      </span>,
                      <span key="o" style={{ display: 'flex', gap: '0.25rem' }}>
                        <Btn
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          title={t(l, '往前', 'move up')}
                        >
                          ↑
                        </Btn>
                        <Btn
                          onClick={() => move(index, index + 1)}
                          disabled={index === items.length - 1}
                          title={t(l, '往後', 'move down')}
                        >
                          ↓
                        </Btn>
                        <Btn onClick={() => removeAt(index)} title={t(l, '移除', 'remove')}>
                          ✕
                        </Btn>
                      </span>,
                    ];
                  })}
                />
                <Row>
                  <Btn onClick={clearAll}>{t(l, '全部移除', 'remove all')}</Btn>
                </Row>
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '順序就是接起來的順序,加進來之後可以用 ↑ ↓ 調。圖片只在這個分頁裡解碼。',
                  'The list order is the join order; use ↑ ↓ to change it. Images are decoded in this tab only.'
                )}
              </Note>
            )}

            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          <>
            <Row>
              <Btn onClick={compose} primary disabled={items.length === 0 || busy || tooBig}>
                {busy ? t(l, '合成中', 'drawing') : t(l, '合成', 'draw sheet')}
              </Btn>
              <Btn onClick={save} disabled={!result}>
                {t(l, '存檔', 'save')}
              </Btn>
            </Row>

            {tooBig ? (
              <Note error>
                {t(
                  l,
                  `畫布會是 ${count(check.pixels)} 像素,超過本工具的上限 ${count(REFUSE_AREA)},不做。把邊界或間距調小,或用「縮到最小」。`,
                  `The canvas would be ${count(check.pixels)} pixels, past this tool's ceiling of ${count(REFUSE_AREA)}. Reduce spacing, or scale to the smallest.`
                )}
              </Note>
            ) : check.exceeded.length > 0 ? (
              <Note>
                {t(
                  l,
                  `畫布 ${layout.canvas.width}×${layout.canvas.height}(${count(check.pixels)} 像素)超過常見的安全範圍(單邊 ${count(CANVAS_LIMITS.maxSide)}、面積 ${count(CANVAS_LIMITS.maxArea)})。桌機 Chrome 通常還畫得出來,iOS Safari 可能回傳一張空白圖。合成後請確認預覽不是空的。`,
                  `The canvas is ${layout.canvas.width}×${layout.canvas.height} (${count(check.pixels)} px), past the commonly safe range (${count(CANVAS_LIMITS.maxSide)} per side, ${count(CANVAS_LIMITS.maxArea)} px of area). Desktop Chrome usually copes; iOS Safari may hand back a blank image. Check the preview is not empty.`
                )}
              </Note>
            ) : null}

            {result ? (
              <div className="inst-field">
                <div
                  aria-live="polite"
                  style={{ border: '1px solid var(--border-2)', padding: '0.5rem', background: 'var(--bg-base)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL built from the canvas in this tab */}
                  <img
                    src={result.url}
                    alt={t(l, '拼接結果預覽', 'Joined result preview')}
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', margin: '0 auto', objectFit: 'contain' }}
                  />
                </div>
                <p className="inst-hint">
                  {result.width}×{result.height} · {result.type || '?'} · {fmtBytes(result.bytes)}
                </p>
              </div>
            ) : (
              <Note>
                {items.length === 0
                  ? t(l, '先加幾張圖。', 'Add some images first.')
                  : t(
                      l,
                      '設定改好之後按「合成」。下面的尺寸與座標是即時算的,像素要按了才畫。',
                      'Set the options, then draw. Sizes and coordinates update live; the pixels are only drawn on demand.'
                    )}
              </Note>
            )}
          </>
        }
      />

      <Panel label={t(l, '排列', 'LAYOUT')}>
        <Row>
          <Seg
            label={t(l, '方向', 'Direction')}
            value={orientation}
            onChange={(next) => {
              setOrientation(next);
              clearResult();
            }}
            options={[
              { value: 'vertical', label: t(l, '縱向', 'vertical') },
              { value: 'horizontal', label: t(l, '橫向', 'horizontal') },
            ]}
          />
          <Seg
            label={t(l, '對齊', 'Align')}
            value={align}
            onChange={(next) => {
              setAlign(next);
              clearResult();
            }}
            options={[
              { value: 'start', label: alignLabels[0] },
              { value: 'center', label: alignLabels[1] },
              { value: 'end', label: alignLabels[2] },
            ]}
          />
          <Seg
            label={t(l, `尺寸不同時的${crossName}`, `Uneven ${crossName}`)}
            value={fit}
            onChange={(next) => {
              setFit(next);
              clearResult();
            }}
            options={[
              { value: 'none', label: t(l, '不縮放', 'as-is') },
              { value: 'min', label: t(l, '縮到最小', 'to smallest') },
              { value: 'max', label: t(l, '放到最大', 'to largest') },
            ]}
          />
        </Row>
        <Row>
          <Input
            label={t(l, '間距 px', 'Gap px')}
            type="number"
            min={0}
            step={1}
            value={gap}
            onChange={(next) => {
              setGap(next);
              clearResult();
            }}
          />
          <Input
            label={t(l, '外框 px', 'Padding px')}
            type="number"
            min={0}
            step={1}
            value={padding}
            onChange={(next) => {
              setPadding(next);
              clearResult();
            }}
          />
          <Input
            label={t(l, '背景色', 'Background')}
            type="color"
            value={hex ?? '#ffffff'}
            onChange={(next) => {
              setBg(next);
              clearResult();
            }}
          />
          <Check2
            label={t(l, '背景透明(PNG / WebP)', 'Transparent background (PNG / WebP)')}
            checked={transparent}
            onChange={(next) => {
              setTransparent(next);
              clearResult();
            }}
          />
        </Row>
        <Note>
          {fit === 'none'
            ? t(
                l,
                `${crossName}不一樣時,窄的那幾張照「對齊」放,空出來的地方是背景色。想讓每張一樣寬就改用縮放。`,
                `With uneven ${crossName}, the smaller images sit where "align" says and the gap shows the background. Switch to scaling to make them match.`
              )
            : fit === 'min'
              ? t(
                  l,
                  `每張都等比縮到最小的那張的${crossName}。放大不會發生,所以不會有插值模糊。`,
                  `Every image is scaled down to the smallest ${crossName}. Nothing is enlarged, so nothing gets interpolation blur.`
                )
              : t(
                  l,
                  `每張都等比縮到最大的那張的${crossName}。小圖會被放大,看起來會軟。`,
                  `Every image is scaled up to the largest ${crossName}. Small images get enlarged and will look soft.`
                )}
        </Note>
        {transparent && format === 'jpeg' ? (
          <Note>
            {t(
              l,
              'JPEG 沒有透明通道,輸出時還是會填背景色。要透明就選 PNG 或 WebP。',
              'JPEG has no alpha channel, so the background colour is painted anyway. Choose PNG or WebP for transparency.'
            )}
          </Note>
        ) : null}
      </Panel>

      <Panel label={t(l, '輸出', 'OUTPUT')}>
        <Row>
          <Seg
            label={t(l, '格式', 'Format')}
            value={format}
            onChange={(next) => {
              setFormat(next);
              clearResult();
            }}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
              { value: 'webp', label: 'WebP' },
            ]}
          />
          {lossy ? (
            <Input
              label={t(l, '品質 1–100', 'Quality 1–100')}
              type="number"
              min={1}
              max={100}
              step={1}
              value={quality}
              onChange={(next) => {
                setQuality(next);
                clearResult();
              }}
            />
          ) : null}
        </Row>
        <Note>
          {format === 'png'
            ? t(
                l,
                'PNG 無損,截圖與線稿用這個。檔案會比 JPEG 大很多。',
                'PNG is lossless — the right choice for screenshots and line art. Much larger than JPEG.'
              )
            : t(
                l,
                '有損壓縮。照片可以;文字截圖壓過頭會在字邊出現雜訊。',
                'Lossy. Fine for photographs; text screenshots pick up ringing around the glyphs when pushed.'
              )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '張數', 'images'), v: count(items.length) },
          {
            k: t(l, '畫布', 'canvas'),
            v: items.length > 0 ? `${layout.canvas.width}×${layout.canvas.height}` : '—',
          },
          { k: t(l, '像素', 'pixels'), v: count(check.pixels) },
          { k: t(l, '讀入', 'read'), v: fmtBytes(totalInput) },
          { k: t(l, '輸出', 'written'), v: result ? fmtBytes(result.bytes) : '—' },
        ]}
      />
    </div>
  );
}

/**
 * Row keys. A counter rather than a timestamp or a random id, because the
 * bench forbids clock and RNG reads during render and this is the only thing
 * these numbers are ever used for.
 */
let idSeed = 0;
function nextId(): number {
  idSeed += 1;
  return idSeed;
}
