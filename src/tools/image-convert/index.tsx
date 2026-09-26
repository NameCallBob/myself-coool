'use client';

/**
 * Image re-encoding on the canvas the browser already has.
 *
 * Three things here are not obvious.
 *
 * 1. Encoder support has to be probed, not assumed. `toBlob` and
 *    `convertToBlob` fall back to PNG for a format the browser cannot write,
 *    and say nothing — ask a Chrome build with no AVIF encoder for AVIF and
 *    you get a PNG four times the size of the JPEG you started from, labelled
 *    ".avif". So every format is probed once on a throwaway 8x8 canvas at
 *    mount, and each finished encode is checked again against the type it
 *    claims to be (`isSilentFallback`).
 *
 * 2. Decoding is the other half of support, and it fails the opposite way:
 *    `createImageBitmap` throws. HEIC from an iPhone is the common case, so
 *    the failure is reported per file instead of aborting the batch.
 *
 * 3. Nothing is predicted. The size readings are the byte lengths of blobs
 *    that exist; the "fit under N KB" mode bisects on quality and reports the
 *    quality whose measured size fit, or admits it could not get there.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { bytes as fmtBytes, count, fixed } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  FORMATS,
  FORMAT_EXT,
  FORMAT_LABEL,
  PIXEL_CEILING,
  advanceQualitySearch,
  bitsPerPixel,
  clampQuality,
  decodedBytes,
  dropsAlpha,
  isLossy,
  isSilentFallback,
  megapixels,
  outputSize,
  renameFor,
  sizeDelta,
  startQualitySearch,
  withinCeiling,
  type Dim,
  type ImageFormat,
  type ResizeMode,
} from './logic';

/** Each decoded frame is held as RGBA while the batch runs, so the count is
 *  capped as well as the pixels. Eight 12 MP photos is already ~380 MB. */
const MAX_FILES = 8;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type Source = {
  key: string;
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  url: string;
};

type Result = {
  key: string;
  name: string;
  sourceName: string;
  sourceBytes: number;
  bytes: number;
  dim: Dim;
  quality: number | null;
  rounds: number;
  blob: Blob;
  url: string;
  /** Blob type differs from the requested type: the canvas substituted. */
  fallbackType: string | null;
  /** Budget mode ran out of room — this is the smallest encode, over budget. */
  overBudget: boolean;
};

type Failure = { key: string; name: string; reason: string };

/** Paint the source into a surface of the output size. */
function paint(ctx: Ctx2D, bitmap: ImageBitmap, dim: Dim, background: string | null) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (background) {
    // JPEG has no alpha channel. Without this, transparent pixels land on
    // whatever the encoder treats as empty — usually black.
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, dim.width, dim.height);
  }
  ctx.drawImage(bitmap, 0, 0, dim.width, dim.height);
}

/**
 * Encode one surface. `OffscreenCanvas` when the browser has it — it keeps the
 * pixels off the layout tree — and the DOM canvas otherwise (Safari before 17
 * has no `convertToBlob`).
 */
async function encodeSurface(
  dim: Dim,
  format: ImageFormat,
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

/** Can this browser *write* the format? One 8x8 encode is enough to tell. */
async function probeEncoder(format: ImageFormat): Promise<boolean> {
  try {
    const blob = await encodeSurface({ width: 8, height: 8 }, format, 0.7, (ctx) => {
      ctx.fillStyle = '#7f7f7f';
      ctx.fillRect(0, 0, 8, 8);
    });
    return !isSilentFallback(format, blob.type);
  } catch {
    return false;
  }
}

export default function ImageConvert({ l }: ToolProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [format, setFormat] = useState<ImageFormat>('image/webp');
  const [qualityText, setQualityText] = useState('0.8');
  const [mode, setMode] = useState<ResizeMode>('none');
  const [sizeText, setSizeText] = useState('1600');
  const [upscale, setUpscale] = useState(false);
  const [budgetOn, setBudgetOn] = useState(false);
  const [budgetText, setBudgetText] = useState('300');
  const [background, setBackground] = useState('#ffffff');
  const [support, setSupport] = useState<Partial<Record<ImageFormat, boolean>>>({});
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const counter = useRef(0);
  const cancelled = useRef(false);

  // Probe every encoder once. The state write happens after an await, so this
  // is not a synchronous setState inside an effect.
  useEffect(() => {
    let live = true;
    void (async () => {
      const pairs = await Promise.all(
        FORMATS.map(async (candidate) => [candidate, await probeEncoder(candidate)] as const)
      );
      if (!live) return;
      setSupport(Object.fromEntries(pairs));
    })();
    return () => {
      live = false;
    };
  }, []);

  // Object URLs and decoded bitmaps are the two things here that leak if
  // nobody releases them. Cleanup runs when the list is replaced.
  useEffect(
    () => () => {
      for (const source of sources) {
        URL.revokeObjectURL(source.url);
        source.bitmap.close();
      }
    },
    [sources]
  );
  useEffect(
    () => () => {
      for (const result of results) URL.revokeObjectURL(result.url);
    },
    [results]
  );

  const touch = useCallback(() => setStale(true), []);

  // Quality is held as text so that typing "0.85" is not fought by a clamp
  // after the first keystroke; the encoders only ever see the clamped number.
  const qualityRaw = Number(qualityText);
  const quality = clampQuality(qualityRaw);
  const qualityValid = Number.isFinite(qualityRaw) && qualityRaw >= 0.05 && qualityRaw <= 1;
  const sizeValue = Number(sizeText);
  const budgetBytes = Math.round(Number(budgetText) * 1024);
  const sizeValid = mode === 'none' || (Number.isFinite(sizeValue) && sizeValue > 0);
  const budgetValid = !budgetOn || (Number.isFinite(budgetBytes) && budgetBytes > 0);
  const encoderKnown = support[format];

  const convert = useCallback(
    // `carry` holds failures from the intake step (a file the browser could
    // not decode). Without it, re-encoding would replace the list and the
    // rejected HEIC would silently disappear from the report.
    async (list: Source[], carry: Failure[] = []) => {
      if (list.length === 0) return;
      if (!sizeValid || !budgetValid) return;
      cancelled.current = false;
      const produced: Result[] = [];
      const failed: Failure[] = [...carry];
      const wantsBudget = budgetOn && isLossy(format) && budgetValid;
      const fill = dropsAlpha(format) ? background : null;

      for (let i = 0; i < list.length; i += 1) {
        const source = list[i]!;
        setBusy({ done: i, total: list.length, name: source.name });
        if (cancelled.current) break;
        try {
          const dim = outputSize(source, mode, sizeValue, upscale);
          if (!withinCeiling(dim)) {
            failed.push({
              key: source.key,
              name: source.name,
              reason: t(
                l,
                `輸出 ${dim.width}x${dim.height} 超過 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP 上限,先縮小再轉。`,
                `Output ${dim.width}x${dim.height} is over the ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP ceiling — resize first.`
              ),
            });
            continue;
          }
          const draw = (ctx: Ctx2D) => paint(ctx, source.bitmap, dim, fill);

          let chosen: Blob;
          let usedQuality: number | null = isLossy(format) ? clampQuality(quality) : null;
          let rounds = 1;
          let overBudget = false;

          if (wantsBudget) {
            let search = startQualitySearch(quality);
            let bestBlob: Blob | null = null;
            let smallest: Blob | null = null;
            rounds = 0;
            for (;;) {
              const probe = await encodeSurface(dim, format, search.quality, draw);
              rounds += 1;
              if (smallest === null || probe.size < smallest.size) smallest = probe;
              const next = advanceQualitySearch(search, probe.size, budgetBytes);
              // `next.best.quality` equals the quality just measured exactly
              // when this probe became the best fit, so the blob to keep is
              // identified by the logic rather than re-derived here.
              if (next.best !== null && next.best.quality === search.quality) bestBlob = probe;
              search = next;
              if (search.done || cancelled.current) break;
            }
            if (bestBlob !== null && search.best !== null) {
              chosen = bestBlob;
              usedQuality = search.best.quality;
            } else {
              // Nothing fit, including the quality floor. Hand over the
              // smallest encode and say it is over budget.
              chosen = smallest!;
              usedQuality = null;
              overBudget = true;
            }
          } else {
            chosen = await encodeSurface(dim, format, usedQuality ?? 1, draw);
          }

          const mismatch = isSilentFallback(format, chosen.type);
          produced.push({
            key: source.key,
            name: renameFor(source.name, format),
            sourceName: source.name,
            sourceBytes: source.size,
            bytes: chosen.size,
            dim,
            quality: usedQuality,
            rounds,
            blob: chosen,
            url: URL.createObjectURL(chosen),
            fallbackType: mismatch ? chosen.type || t(l, '未標示', 'unlabelled') : null,
            overBudget,
          });
        } catch (problem) {
          failed.push({
            key: source.key,
            name: source.name,
            reason: problem instanceof Error ? problem.message : String(problem),
          });
        }
      }

      setResults(produced);
      setFailures(failed);
      setPreviewKey(produced[0]?.key ?? null);
      setBusy(null);
      setStale(false);
    },
    [background, budgetBytes, budgetOn, budgetValid, format, l, mode, quality, sizeValid, sizeValue, upscale]
  );

  const take = useCallback(
    async (files: File[]) => {
      const picked = files.filter((file) => file.size > 0).slice(0, MAX_FILES);
      if (picked.length === 0) return;
      setError(
        files.length > MAX_FILES
          ? t(
              l,
              `一次最多 ${MAX_FILES} 個檔案,只收了前 ${MAX_FILES} 個。`,
              `At most ${MAX_FILES} files at a time — the first ${MAX_FILES} were taken.`
            )
          : null
      );

      const loaded: Source[] = [];
      const failed: Failure[] = [];
      for (const file of picked) {
        counter.current += 1;
        const key = `f${counter.current}`;
        try {
          const bitmap = await createImageBitmap(file);
          if (!withinCeiling({ width: bitmap.width, height: bitmap.height })) {
            bitmap.close();
            failed.push({
              key,
              name: file.name,
              reason: t(
                l,
                `${bitmap.width}x${bitmap.height} 超過 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP 上限。`,
                `${bitmap.width}x${bitmap.height} is over the ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP ceiling.`
              ),
            });
            continue;
          }
          loaded.push({
            key,
            name: file.name,
            size: file.size,
            type: file.type || t(l, '未標示', 'unlabelled'),
            width: bitmap.width,
            height: bitmap.height,
            bitmap,
            url: URL.createObjectURL(file),
          });
        } catch {
          failed.push({
            key,
            name: file.name,
            reason: t(
              l,
              '這個瀏覽器無法解碼這個檔案。HEIC/HEIF 與部分 TIFF 都不在瀏覽器的解碼範圍內。',
              'This browser cannot decode the file. HEIC/HEIF and some TIFF variants are outside what browsers decode.'
            ),
          });
        }
      }

      setSources(loaded);
      setResults([]);
      setFailures(failed);
      setPreviewKey(null);
      if (loaded.length > 0) await convert(loaded, failed);
    },
    [convert, l]
  );

  const reset = useCallback(() => {
    cancelled.current = true;
    setSources([]);
    setResults([]);
    setFailures([]);
    setPreviewKey(null);
    setBusy(null);
    setError(null);
    setStale(false);
  }, []);

  const save = useCallback(
    (result: Result) => {
      const anchor = document.createElement('a');
      anchor.href = result.url;
      anchor.download = result.name;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setError(null);
    },
    []
  );

  const sourceTotal = sources.reduce((sum, source) => sum + source.size, 0);
  const outputTotal = results.reduce((sum, result) => sum + result.bytes, 0);
  const total = sizeDelta(
    results.reduce((sum, result) => sum + result.sourceBytes, 0),
    outputTotal
  );
  const preview = results.find((result) => result.key === previewKey) ?? results[0] ?? null;
  const previewSource = preview ? sources.find((source) => source.key === preview.key) ?? null : null;
  const sameFormat = sources.some((source) => source.type === format);
  const decodedTotal = sources.reduce((sum, source) => sum + decodedBytes(source), 0);

  return (
    <div>
      <Bench
        leftLabel={t(l, '來源與設定', 'SOURCE & SETTINGS')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{sources.length > 0 ? fmtBytes(sourceTotal) : '—'}</span>}
        rightAside={<span className="inst-no">{results.length > 0 ? fmtBytes(outputTotal) : '—'}</span>}
        left={
          <>
            <DropZone
              l={l}
              onFiles={take}
              accept="image/*"
              multiple
              hint={t(
                l,
                `把圖片拖進來,或點一下選檔(一次最多 ${MAX_FILES} 個)`,
                `Drop images here, or click to choose (up to ${MAX_FILES} at a time)`
              )}
            />

            <Row>
              <Select
                label={t(l, '輸出格式', 'Output format')}
                value={format}
                onChange={(next) => {
                  setFormat(next);
                  touch();
                }}
                options={FORMATS.map((candidate) => ({
                  value: candidate,
                  label:
                    support[candidate] === false
                      ? `${FORMAT_LABEL[candidate]} — ${t(l, '此瀏覽器不能編碼', 'no encoder here')}`
                      : FORMAT_LABEL[candidate],
                }))}
                hint={
                  isLossy(format)
                    ? t(l, '有損格式,品質數值有作用。', 'Lossy — the quality value applies.')
                    : t(l, 'PNG 無損,品質數值無效。', 'PNG is lossless; quality is ignored.')
                }
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
                  onChange={(next) => {
                    setQualityText(next);
                    touch();
                  }}
                  hint={t(
                    l,
                    '這個數字沒有跨格式意義:WebP 0.8 與 JPEG 0.8 不是同一件事。',
                    'The number does not carry across formats: WebP 0.8 and JPEG 0.8 are unrelated.'
                  )}
                />
              ) : null}
              {dropsAlpha(format) ? (
                <Input
                  label={t(l, '透明處填色', 'Flatten alpha onto')}
                  type="color"
                  value={background}
                  onChange={(next) => {
                    setBackground(next);
                    touch();
                  }}
                  hint={t(l, 'JPEG 沒有透明通道。', 'JPEG has no alpha channel.')}
                />
              ) : null}
            </Row>

            <Row>
              <Seg
                label={t(l, '尺寸', 'Resize')}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  touch();
                }}
                options={[
                  { value: 'none', label: t(l, '原尺寸', 'as-is') },
                  { value: 'longest', label: t(l, '長邊', 'long side') },
                  { value: 'width', label: t(l, '寬', 'width') },
                  { value: 'height', label: t(l, '高', 'height') },
                  { value: 'scale', label: t(l, '百分比', 'percent') },
                ]}
              />
              {mode !== 'none' ? (
                <Input
                  label={mode === 'scale' ? t(l, '百分比', 'Percent') : t(l, '像素', 'Pixels')}
                  type="number"
                  min={1}
                  step={1}
                  value={sizeText}
                  onChange={(next) => {
                    setSizeText(next);
                    touch();
                  }}
                  invalid={!sizeValid}
                  hint={t(l, '另一邊按原比例算,四捨五入到整數像素。', 'The other side follows the ratio, rounded to whole pixels.')}
                />
              ) : null}
            </Row>

            {mode !== 'none' ? (
              <Row>
                <Check2
                  label={t(l, '允許放大(不會增加細節)', 'Allow upscaling (adds no detail)')}
                  checked={upscale}
                  onChange={(next) => {
                    setUpscale(next);
                    touch();
                  }}
                />
              </Row>
            ) : null}

            <Row>
              <Check2
                label={t(l, '壓到指定大小以下', 'Fit under a byte budget')}
                checked={budgetOn}
                onChange={(next) => {
                  setBudgetOn(next);
                  touch();
                }}
              />
              {budgetOn ? (
                <Input
                  label={t(l, '上限 KB', 'Budget KB')}
                  type="number"
                  min={1}
                  step={10}
                  value={budgetText}
                  onChange={(next) => {
                    setBudgetText(next);
                    touch();
                  }}
                  invalid={!budgetValid}
                  hint={t(
                    l,
                    '用二分法試品質,最多 7 次編碼。回報的大小是實際編出來的位元組,不是估的;回報的品質是「塞得進上限的最高品質,誤差一個百分點內」——區間收到 2 個百分點就停,省下一次編碼。',
                    'Bisects on quality, at most 7 encodes. The size reported is a measured blob, not an estimate; the quality is the highest that fits to within one percent — the bracket stops at two percent wide, which saves an encode.'
                  )}
                />
              ) : null}
            </Row>

            {budgetOn && !isLossy(format) ? (
              <Note error>
                {t(
                  l,
                  'PNG 是無損的,沒有品質可以調,大小上限這一項對它無效。要壓到指定大小請改用 WebP、AVIF 或 JPEG,或縮小尺寸。',
                  'PNG is lossless — there is no quality to trade, so the budget does nothing. Use WebP, AVIF or JPEG, or reduce the dimensions.'
                )}
              </Note>
            ) : null}

            <Row>
              <Btn
                primary
                onClick={() => {
                  setError(null);
                  void convert(sources, failures.filter((failure) => !sources.some((source) => source.key === failure.key)));
                }}
                disabled={sources.length === 0 || busy !== null || !sizeValid || !budgetValid}
              >
                {t(l, '轉檔', 'convert')}
              </Btn>
              {busy ? (
                <Btn onClick={() => { cancelled.current = true; }}>{t(l, '中止', 'stop')}</Btn>
              ) : null}
              <Btn onClick={reset} disabled={sources.length === 0 && results.length === 0}>
                {t(l, '清空', 'clear')}
              </Btn>
            </Row>

            {busy ? (
              <Note>
                {t(
                  l,
                  `編碼中 ${busy.done + 1} / ${busy.total} — ${busy.name}`,
                  `Encoding ${busy.done + 1} of ${busy.total} — ${busy.name}`
                )}
              </Note>
            ) : null}

            {stale && results.length > 0 && !busy ? (
              <Note>
                {t(l, '設定改過了,按「轉檔」重新編碼。', 'Settings changed — press convert to re-encode.')}
              </Note>
            ) : null}

            {encoderKnown === false ? (
              <Note error>
                {t(
                  l,
                  `這個瀏覽器沒有 ${FORMAT_LABEL[format]} 編碼器。硬要輸出會拿到改名的 PNG,通常比原檔更大。換一個格式。`,
                  `This browser has no ${FORMAT_LABEL[format]} encoder. Forcing it yields a renamed PNG, usually larger than the source. Pick another format.`
                )}
              </Note>
            ) : null}

            {sameFormat ? (
              <Note>
                {t(
                  l,
                  '有檔案的來源格式就是輸出格式。有損格式重新編碼一次就再掉一次畫質,即使品質調到 1。',
                  'Some sources are already in the target format. Re-encoding a lossy format loses detail again, even at quality 1.'
                )}
              </Note>
            ) : null}

            {error ? <Note error>{error}</Note> : null}

            {failures.length > 0 ? (
              <div className="mt-3">
                {failures.map((failure) => (
                  <Note key={failure.key} error>
                    {failure.name} — {failure.reason}
                  </Note>
                ))}
              </div>
            ) : null}
          </>
        }
        right={
          results.length > 0 ? (
            <div aria-live="polite">
              <Table
                head={[
                  t(l, '檔名', 'file'),
                  t(l, '尺寸', 'pixels'),
                  t(l, '品質', 'q'),
                  t(l, '原始', 'before'),
                  t(l, '輸出', 'after'),
                  t(l, '剩下', 'of source'),
                  '',
                ]}
                align={['left', 'left', 'right', 'right', 'right', 'right', 'left']}
                rows={results.map((result) => {
                  const delta = sizeDelta(result.sourceBytes, result.bytes);
                  return [
                    <button
                      key="n"
                      type="button"
                      className="inst-btn"
                      aria-pressed={preview?.key === result.key}
                      onClick={() => setPreviewKey(result.key)}
                      title={t(
                        l,
                        `預覽這一張(來源:${result.sourceName})`,
                        `Preview this one (from ${result.sourceName})`
                      )}
                    >
                      <span className="inst-wrap">{result.name}</span>
                    </button>,
                    <span key="d" className="inst-no">{`${result.dim.width}x${result.dim.height}`}</span>,
                    <span key="q" className="inst-no" style={{ whiteSpace: 'nowrap' }}>
                      {result.quality === null ? '—' : fixed(result.quality, 2)}
                      {result.rounds > 1 ? (
                        <span style={{ color: 'var(--fg-faint)' }}>
                          {t(l, ` (${result.rounds} 次)`, ` (${result.rounds}x)`)}
                        </span>
                      ) : null}
                    </span>,
                    <span key="b" className="inst-no">{fmtBytes(result.sourceBytes)}</span>,
                    <span key="a" className="inst-no">{fmtBytes(result.bytes)}</span>,
                    <span key="r" className="inst-no">
                      {`${fixed(delta.remainingRatio * 100, 1)}%`}
                      {delta.verdict === 'larger' ? ` ${t(l, '(變大)', '(grew)')}` : ''}
                    </span>,
                    <Btn key="s" onClick={() => save(result)}>
                      {t(l, '下載', 'save')}
                    </Btn>,
                  ];
                })}
              />

              {results.some((result) => result.fallbackType) ? (
                <Note error>
                  {t(
                    l,
                    `有輸出不是 ${FORMAT_LABEL[format]}:瀏覽器在沒有編碼器時會改吐 PNG 而不報錯。不要用這些檔案。`,
                    `Some outputs are not ${FORMAT_LABEL[format]}: with no encoder the browser silently returns PNG. Do not ship these.`
                  )}
                </Note>
              ) : null}

              {results.some((result) => result.overBudget) ? (
                <Note error>
                  {t(
                    l,
                    '有檔案連品質 0.05 都壓不到上限以下,表格裡放的是最小的那次編碼(仍超過上限)。要達標得縮尺寸。',
                    'Some files stay over the budget even at quality 0.05. The table holds the smallest encode, still over. Reduce the dimensions to get there.'
                  )}
                </Note>
              ) : null}

              {preview ? (
                <div className="mt-3">
                  <Row>
                    <Seg
                      label={t(l, '預覽', 'Preview')}
                      value={showSource ? 'source' : 'output'}
                      onChange={(next) => setShowSource(next === 'source')}
                      options={[
                        { value: 'output', label: t(l, '輸出', 'output') },
                        { value: 'source', label: t(l, '原圖', 'source') },
                      ]}
                    />
                    <span className="inst-no">
                      {showSource && previewSource
                        ? `${previewSource.width}x${previewSource.height} · ${fmtBytes(previewSource.size)}`
                        : `${preview.dim.width}x${preview.dim.height} · ${fmtBytes(preview.bytes)}`}
                    </span>
                  </Row>
                  {/* Blob URL from this tab, never a remote image. Rendered as
                      an <img> rather than next/image because the bytes are
                      local and must not go through any loader. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showSource && previewSource ? previewSource.url : preview.url}
                    alt={
                      showSource
                        ? t(l, '原圖預覽', 'Source preview')
                        : t(l, '輸出預覽', 'Output preview')
                    }
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      height: 'auto',
                      border: '1px solid var(--rule)',
                    }}
                  />
                  <Note>
                    {t(
                      l,
                      '瀏覽器會把預覽縮到欄寬,所以畫質要看細節請下載原檔比對。',
                      'The preview is scaled to the column, so judge detail on the downloaded file.'
                    )}
                  </Note>
                </div>
              ) : null}
            </div>
          ) : (
            <Note>
              {sources.length === 0
                ? t(l, '丟一張圖進來。解碼、縮放、編碼都在這個分頁裡做。', 'Drop an image. Decode, resize and encode all happen in this tab.')
                : t(l, '按「轉檔」開始編碼。', 'Press convert to encode.')}
            </Note>
          )
        }
      />

      <Panel label={t(l, '這個瀏覽器能編碼什麼', 'WHAT THIS BROWSER CAN ENCODE')}>
        <Table
          head={[t(l, '格式', 'format'), t(l, '編碼器', 'encoder'), t(l, '用途', 'use')]}
          rows={FORMATS.map((candidate) => [
            <span key="f" className="inst-no">
              {FORMAT_LABEL[candidate]} <span style={{ color: 'var(--fg-faint)' }}>.{FORMAT_EXT[candidate]}</span>
            </span>,
            <span key="s" className="inst-no">
              {support[candidate] === undefined
                ? t(l, '偵測中', 'probing')
                : support[candidate]
                  ? t(l, '有', 'yes')
                  : t(l, '沒有', 'no')}
            </span>,
            candidate === 'image/webp'
              ? t(l, '現在的預設值。所有在維護的瀏覽器都能解也能編。', 'The default today: every maintained browser both decodes and encodes it.')
              : candidate === 'image/avif'
                ? t(l, '同畫質通常最小,但編碼慢,而且不是每個瀏覽器都能編。', 'Usually the smallest at a given quality, but slow to encode and not universally supported.')
                : candidate === 'image/jpeg'
                  ? t(l, '相容性最好,沒有透明通道。', 'The safest bet for compatibility. No alpha channel.')
                  : t(l, '無損。截圖、線稿、要保留透明才用。', 'Lossless. For screenshots, line art, and anything needing alpha.'),
          ])}
        />
        <Note>
          {t(
            l,
            '這張表是在你的瀏覽器上實測的:每個格式都真的編了一張 8x8 再檢查回來的 MIME type。canvas 在編不出來時會默默改吐 PNG,只看有沒有拋錯是驗不出來的。',
            'This table is measured in your browser: each format is actually encoded as an 8x8 image and the returned MIME type checked. A canvas that cannot encode silently returns PNG, so watching for exceptions proves nothing.'
          )}
        </Note>
        <Note>
          {t(
            l,
            `解碼是另一回事:能不能讀進來取決於瀏覽器,iPhone 的 HEIC 多半讀不了。上限 ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP、一次 ${MAX_FILES} 個檔,因為解碼後的每張圖都是「寬 x 高 x 4」位元組的記憶體。`,
            `Decoding is separate: whether a file reads at all is up to the browser, and iPhone HEIC usually does not. The ${(PIXEL_CEILING / 1_000_000).toFixed(0)} MP and ${MAX_FILES}-file ceilings exist because a decoded frame costs width x height x 4 bytes of memory.`
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '檔數', 'files'), v: count(results.length) },
          { k: t(l, '原始', 'before'), v: sources.length > 0 ? fmtBytes(sourceTotal) : '—' },
          { k: t(l, '輸出', 'after'), v: results.length > 0 ? fmtBytes(outputTotal) : '—' },
          {
            k: t(l, '省下', 'saved'),
            v: results.length > 0 ? `${fixed(total.savedRatio * 100, 1)}%` : '—',
          },
          {
            k: t(l, '位元/像素', 'bits/px'),
            v: preview ? fixed(bitsPerPixel(preview.bytes, preview.dim), 3) : '—',
          },
          {
            k: t(l, '像素', 'pixels'),
            v: preview ? `${fixed(megapixels(preview.dim), 2)} MP` : '—',
          },
          {
            k: t(l, '解碼佔用', 'decoded'),
            v: sources.length > 0 ? fmtBytes(decodedTotal) : '—',
          },
          { k: t(l, '輸出格式', 'format'), v: FORMAT_LABEL[format] },
        ]}
      />
    </div>
  );
}
