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
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_PAGE_PT,
  PAPERS,
  buildPdf,
  jpegEmbedVerdict,
  mmToPt,
  paperById,
  parseJpeg,
  planPage,
  rgbaToRgb,
  zlibStore,
  type JpegInfo,
  type Orientation,
  type PagePlan,
  type PdfImage,
  type PdfPageSpec,
  type Size,
} from './logic';

type Item = {
  /** Row key. A counter, because render may not read the clock or the RNG. */
  id: number;
  name: string;
  type: string;
  fileBytes: number;
  /** The file's own bytes, kept so a JPEG can be embedded without re-encoding. */
  data: Uint8Array;
  url: string;
  image: HTMLImageElement;
  /** Size as the browser presents it, i.e. after any EXIF rotation. */
  width: number;
  height: number;
  jpeg: JpegInfo | null;
  /** True when EXIF rotation means the stored JPEG is not the upright image. */
  exifRotated: boolean;
};

/** How an image gets into the file. */
type EmbedPath = 'copy' | 'jpeg' | 'flate';
type EmbedMode = 'auto' | 'jpeg' | 'flate';

type PageRow = {
  item: Item;
  plan: PagePlan | null;
  problem: string | null;
  path: EmbedPath;
};

type Result = {
  url: string;
  bytes: number;
  pages: number;
  streams: number[];
  deflate: 'native' | 'stored' | 'none';
};

const MAX_FILES = 60;
/** Total input the tool will hold in memory at once. */
const MAX_INPUT_BYTES = 300 * 1024 * 1024;
/** Per-image ceiling for the re-encode paths, which need a canvas that big. */
const MAX_REENCODE_PIXELS = 40_000_000;

export default function ImagesToPdf({ l }: ToolProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [paperId, setPaperId] = useState('a4');
  const [customW, setCustomW] = useState('210');
  const [customH, setCustomH] = useState('297');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [marginMm, setMarginMm] = useState('10');
  const [dpi, setDpi] = useState('96');
  const [upscale, setUpscale] = useState(true);
  const [mode, setMode] = useState<EmbedMode>('auto');
  const [quality, setQuality] = useState('90');
  const [bg, setBg] = useState('#ffffff');
  const [title, setTitle] = useState('');
  const [stampDate, setStampDate] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Object URLs live outside React; they are revoked by hand. */
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

  const clearResult = useCallback(() => {
    setResult((current) => {
      if (current) drop(current.url);
      return null;
    });
  }, []);

  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    clearResult();
  };

  const marginPt = useMemo(() => {
    const mm = Number(marginMm);
    return Number.isFinite(mm) && mm >= 0 ? mmToPt(mm) : 0;
  }, [marginMm]);

  const dpiValue = useMemo(() => {
    const value = Number(dpi);
    return Number.isFinite(value) && value > 0 ? value : 96;
  }, [dpi]);

  const paper: Size | 'original' | null = useMemo(() => {
    if (paperId === 'original') return 'original';
    if (paperId === 'custom') {
      const width = Number(customW);
      const height = Number(customH);
      if (!(width > 0) || !(height > 0)) return null;
      return { width: mmToPt(width), height: mmToPt(height) };
    }
    const found = paperById(paperId);
    if (!found) return null;
    return { width: mmToPt(found.widthMm), height: mmToPt(found.heightMm) };
  }, [customH, customW, paperId]);

  const pathFor = useCallback(
    (item: Item): EmbedPath => {
      const canCopy =
        item.jpeg !== null && jpegEmbedVerdict(item.jpeg).ok && !item.exifRotated;
      if (mode === 'auto') return canCopy ? 'copy' : 'jpeg';
      // Forcing JPEG re-encodes even an embeddable JPEG: the point of the
      // option is to squeeze an oversized scan at a lower quality, which
      // copying the original bytes cannot do.
      if (mode === 'jpeg') return 'jpeg';
      return 'flate';
    },
    [mode]
  );

  const rows: PageRow[] = useMemo(
    () =>
      items.map((item) => {
        const path = pathFor(item);
        if (!paper) {
          return {
            item,
            plan: null,
            path,
            problem: t(l, '紙張尺寸填得不對。', 'The paper size is not a positive number.'),
          };
        }
        try {
          return {
            item,
            path,
            plan: planPage({
              image: { width: item.width, height: item.height },
              paper,
              marginPt,
              orientation,
              dpi: dpiValue,
              upscale,
            }),
            problem: null,
          };
        } catch (problem) {
          return {
            item,
            path,
            plan: null,
            problem: problem instanceof Error ? problem.message : String(problem),
          };
        }
      }),
    [dpiValue, items, l, marginPt, orientation, paper, pathFor, upscale]
  );

  const blocked = rows.find((row) => row.problem !== null)?.problem ?? null;
  const inputBytes = items.reduce((sum, item) => sum + item.fileBytes, 0);

  const takeFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const room = MAX_FILES - items.length;
      if (room <= 0) {
        setError(t(l, `一次最多 ${MAX_FILES} 張。`, `At most ${MAX_FILES} images at a time.`));
        return;
      }
      const picked = files.filter((file) => file.type.startsWith('image/')).slice(0, room);
      const skipped = files.length - picked.length;
      const loaded: Item[] = [];
      const failed: string[] = [];
      let held = inputBytes;

      for (const file of picked) {
        if (held + file.size > MAX_INPUT_BYTES) {
          failed.push(`${file.name} (${t(l, '超過記憶體上限', 'over the memory ceiling')})`);
          continue;
        }
        const url = track(URL.createObjectURL(file));
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('zero size');
          const data = new Uint8Array(await file.arrayBuffer());
          let jpeg: JpegInfo | null = null;
          if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8) {
            try {
              jpeg = parseJpeg(data);
            } catch {
              jpeg = null; // unreadable frame header: treat it as a re-encode case
            }
          }
          // The browser applies EXIF orientation when decoding; PDF does not.
          // If the stored frame is sideways relative to what you see, copying
          // the bytes would silently rotate the page, so it gets re-encoded.
          const exifRotated =
            jpeg !== null &&
            (jpeg.width !== image.naturalWidth || jpeg.height !== image.naturalHeight);
          held += file.size;
          loaded.push({
            id: nextId(),
            name: file.name,
            type: file.type || t(l, '未知', 'unknown'),
            fileBytes: file.size,
            data,
            url,
            image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            jpeg,
            exifRotated,
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
            `這些檔案沒有加入:${failed.join('、')}`,
            `These files were not added: ${failed.join(', ')}`
          )
        );
      }
      if (skipped > 0) {
        problems.push(
          t(
            l,
            `有 ${skipped} 個檔案不是圖片或超過張數上限。`,
            `${skipped} file(s) were not images or exceeded the count limit.`
          )
        );
      }
      setError(problems.length > 0 ? problems.join(' ') : null);
    },
    [clearResult, inputBytes, items.length, l]
  );

  const move = (from: number, to: number) => {
    setItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [taken] = next.splice(from, 1);
      next.splice(to, 0, taken);
      return next;
    });
    clearResult();
  };

  const removeAt = (index: number) => {
    setItems((current) => {
      const target = current[index];
      if (target) drop(target.url);
      return current.filter((_, i) => i !== index);
    });
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
   * Turn one loaded image into a PDF image stream.
   *
   * `copy` is the path that matters: the JPEG goes in untouched, so a 40-page
   * scan set comes out about the size of its inputs with no second generation
   * of lossy compression. The other two paths have to rasterise.
   */
  const makeStream = async (
    item: Item,
    path: EmbedPath,
    used: { deflate: 'native' | 'stored' | 'none' }
  ): Promise<PdfImage> => {
    if (path === 'copy') {
      const info = item.jpeg!;
      const verdict = jpegEmbedVerdict(info);
      if (!verdict.ok) throw new Error('internal: unembeddable JPEG reached the copy path');
      return {
        data: item.data,
        width: info.width,
        height: info.height,
        filter: 'DCTDecode',
        colorSpace: verdict.colorSpace,
      };
    }

    if (item.width * item.height > MAX_REENCODE_PIXELS) {
      throw new Error(
        t(
          l,
          `${item.name} 是 ${count(item.width * item.height)} 像素,重新編碼要開一張同樣大的畫布,超過本工具的上限 ${count(MAX_REENCODE_PIXELS)}。如果它本來就是 JPEG,請改用「自動」讓它直接嵌入。`,
          `${item.name} is ${count(item.width * item.height)} pixels; re-encoding needs a canvas that big, past this tool's ceiling of ${count(MAX_REENCODE_PIXELS)}. If it is already a JPEG, switch to "auto" so it can be embedded as-is.`
        )
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width = item.width;
    canvas.height = item.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: path === 'flate' });
    if (!ctx) throw new Error(t(l, '這個瀏覽器沒有給 2D 繪圖環境。', 'No 2D context available.'));
    // Neither DCTDecode nor a plain FlateDecode image carries transparency, so
    // the background is painted first and the alpha is flattened onto it.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(item.image, 0, 0);

    if (path === 'jpeg') {
      const q = Math.min(100, Math.max(1, Math.round(Number(quality) || 90))) / 100;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', q);
      });
      if (!blob || blob.type !== 'image/jpeg') {
        throw new Error(
          t(
            l,
            `${item.name}:瀏覽器沒有輸出 JPEG。改用「無損」再試。`,
            `${item.name}: the browser did not produce a JPEG. Try the lossless path instead.`
          )
        );
      }
      const data = new Uint8Array(await blob.arrayBuffer());
      // Read back what the encoder actually wrote rather than assuming.
      const info = parseJpeg(data);
      const verdict = jpegEmbedVerdict(info);
      if (!verdict.ok) {
        throw new Error(
          t(
            l,
            `${item.name}:這個瀏覽器寫出的 JPEG 不是 PDF 的 DCTDecode 能吃的種類(${verdict.reason})。改用「無損」。`,
            `${item.name}: this browser wrote a JPEG that PDF's DCTDecode does not cover (${verdict.reason}). Use the lossless path.`
          )
        );
      }
      return {
        data,
        width: info.width,
        height: info.height,
        filter: 'DCTDecode',
        colorSpace: verdict.colorSpace,
      };
    }

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = rgbaToRgb(new Uint8Array(pixels.data.buffer), hexToRgb(bg));
    const packed = await deflateZlib(rgb);
    used.deflate = packed.how;
    return {
      data: packed.data,
      width: canvas.width,
      height: canvas.height,
      filter: 'FlateDecode',
      colorSpace: 'DeviceRGB',
    };
  };

  /**
   * Assemble the document.
   *
   * A button, not a live effect: this reads every pixel of every image. The
   * page table above is arithmetic and stays live.
   */
  const build = async () => {
    if (items.length === 0 || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const used: { deflate: 'native' | 'stored' | 'none' } = { deflate: 'none' };
      const specs: PdfPageSpec[] = [];
      for (const row of rows) {
        if (!row.plan) throw new Error(row.problem ?? 'no page plan');
        const image = await makeStream(row.item, row.path, used);
        specs.push({
          width: row.plan.page.width,
          height: row.plan.page.height,
          image,
          rect: row.plan.rect,
        });
      }
      const pdf = buildPdf(specs, {
        producer: 'instrument bench / images-to-pdf',
        title: title.trim() === '' ? undefined : title.trim(),
        // Reading the clock here is fine: this is an event handler, not render.
        creationDate: stampDate ? pdfDate(new Date()) : undefined,
      });
      clearResult();
      setResult({
        url: track(
          URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
        ),
        bytes: pdf.length,
        pages: specs.length,
        streams: specs.map((spec) => spec.image.data.length),
        deflate: used.deflate,
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result) return;
    const anchor = document.createElement('a');
    anchor.href = result.url;
    anchor.download = `${(title.trim() || 'images').replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
    anchor.click();
  };

  const pathLabel = (path: EmbedPath) =>
    path === 'copy'
      ? t(l, '直接嵌入', 'copied')
      : path === 'jpeg'
        ? t(l, '轉 JPEG', 're-encode')
        : t(l, '無損 Flate', 'lossless');

  const paperOptions = [
    ...PAPERS.map((entry) => ({
      value: entry.id,
      label: `${entry.label} (${entry.widthMm}×${entry.heightMm} mm)`,
    })),
    { value: 'original', label: t(l, '原尺寸(依 dpi)', 'Original size (by dpi)') },
    { value: 'custom', label: t(l, '自訂 mm', 'Custom mm') },
  ];

  const copyCount = rows.filter((row) => row.path === 'copy').length;

  return (
    <div>
      <Bench
        leftLabel={t(l, '圖片(順序就是頁序)', 'IMAGES — IN PAGE ORDER')}
        rightLabel={t(l, 'PDF', 'PDF')}
        leftAside={<span className="inst-no">{count(items.length)}</span>}
        rightAside={result ? <span className="inst-no">{fmtBytes(result.bytes)}</span> : null}
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
                    t(l, '像素', 'pixels'),
                    t(l, '原檔', 'source'),
                    t(l, '嵌入方式', 'embedded'),
                    t(l, '順序', 'order'),
                  ]}
                  align={['right', 'left', 'right', 'right', 'left', 'left']}
                  rows={rows.map((row, index) => [
                    <span key="n" className="inst-no">
                      {index + 1}
                    </span>,
                    <span
                      key="f"
                      className="inst-wrap"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this tab; next/image would route it through a loader */}
                      <img
                        src={row.item.url}
                        alt=""
                        width={28}
                        height={28}
                        style={{
                          width: 28,
                          height: 28,
                          objectFit: 'cover',
                          flex: '0 0 auto',
                          border: '1px solid var(--border-2)',
                        }}
                      />
                      <span>{row.item.name}</span>
                    </span>,
                    <span key="p" className="inst-no">
                      {row.item.width}×{row.item.height}
                    </span>,
                    <span key="s" className="inst-no">
                      {fmtBytes(row.item.fileBytes)}
                    </span>,
                    <span key="e" className="inst-no">
                      {pathLabel(row.path)}
                      {row.item.exifRotated ? t(l, '(EXIF 轉向)', ' (EXIF rotated)') : ''}
                    </span>,
                    <span key="o" style={{ display: 'flex', gap: '0.25rem' }}>
                      <Btn onClick={() => move(index, index - 1)} disabled={index === 0} title={t(l, '往前', 'move up')}>
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
                  ])}
                />
                <Row>
                  <Btn onClick={clearAll}>{t(l, '全部移除', 'remove all')}</Btn>
                </Row>
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '一張圖一頁,順序就是頁序。加進來之後可以用 ↑ ↓ 調。',
                  'One image per page, in list order. Use ↑ ↓ to rearrange.'
                )}
              </Note>
            )}
            {items.some((item) => item.exifRotated) ? (
              <Note>
                {t(
                  l,
                  ' 有檔案帶 EXIF 轉向。PDF 不看 EXIF,直接嵌入會躺著,所以這幾張改成重新編碼成你現在看到的方向。',
                  'Some files carry EXIF orientation. PDF ignores EXIF, so copying the bytes would lay them sideways; those are re-encoded upright instead.'
                )}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          <>
            <Row>
              <Btn onClick={build} primary disabled={items.length === 0 || busy || blocked !== null}>
                {busy ? t(l, '組裝中', 'assembling') : t(l, '組成 PDF', 'build PDF')}
              </Btn>
              <Btn onClick={save} disabled={!result}>
                {t(l, '存檔', 'save')}
              </Btn>
              <Btn
                onClick={() => {
                  if (result) window.open(result.url, '_blank', 'noopener');
                }}
                disabled={!result}
                title={t(l, '用瀏覽器內建的檢視器打開', 'Open in the browser viewer')}
              >
                {t(l, '另開分頁檢視', 'view')}
              </Btn>
            </Row>
            {blocked ? <Note error>{blocked}</Note> : null}
            {result ? (
              <>
                <Table
                  head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                  align={['left', 'right']}
                  rows={[
                    [t(l, '頁數', 'pages'), <span key="p" className="inst-no">{count(result.pages)}</span>],
                    [t(l, '檔案大小', 'file size'), <span key="b" className="inst-no">{fmtBytes(result.bytes)}</span>],
                    [
                      t(l, '影像資料', 'image streams'),
                      <span key="s" className="inst-no">
                        {fmtBytes(result.streams.reduce((sum, n) => sum + n, 0))}
                      </span>,
                    ],
                    [
                      t(l, '相對於原檔', 'vs. sources'),
                      <span key="r" className="inst-no">
                        {inputBytes > 0 ? `${((result.bytes / inputBytes) * 100).toFixed(0)}%` : '—'}
                      </span>,
                    ],
                    [
                      t(l, 'PDF 版本', 'version'),
                      <span key="v" className="inst-no">
                        1.4
                      </span>,
                    ],
                  ]}
                />
                {result.deflate === 'stored' ? (
                  <Note>
                    {t(
                      l,
                      '這個瀏覽器沒有 CompressionStream,無損影像是用「不壓縮的 deflate 區塊」寫進去的:格式完全合法,任何閱讀器都打得開,但檔案等於未壓縮的 RGB。要小檔就改用轉 JPEG。',
                      'This browser has no CompressionStream, so the lossless images were written as uncompressed deflate blocks: entirely valid and readable everywhere, but the size is that of raw RGB. Switch to re-encoding for a small file.'
                    )}
                  </Note>
                ) : null}
                <Note>
                  {t(
                    l,
                    '「另開分頁檢視」用的是瀏覽器內建的 PDF 檢視器,檔案沒有離開這台裝置。',
                    'The view button hands the file to the browser’s own PDF viewer; nothing leaves this device.'
                  )}
                </Note>
              </>
            ) : (
              <Note>
                {items.length === 0
                  ? t(l, '先加幾張圖。', 'Add some images first.')
                  : t(
                      l,
                      '設定改好之後按「組成 PDF」。下面的頁面表是即時算的,像素要按了才讀。',
                      'Set the options, then build. The page table below is live arithmetic; the pixels wait for the press.'
                    )}
              </Note>
            )}
          </>
        }
      />

      <Panel label={t(l, '版面', 'PAGE')}>
        <Row>
          <Select
            label={t(l, '紙張', 'Paper')}
            value={paperId}
            onChange={change(setPaperId)}
            options={paperOptions}
          />
          {paperId === 'custom' ? (
            <>
              <Input
                label={t(l, '寬 mm', 'Width mm')}
                type="number"
                min={1}
                step={1}
                value={customW}
                onChange={change(setCustomW)}
              />
              <Input
                label={t(l, '高 mm', 'Height mm')}
                type="number"
                min={1}
                step={1}
                value={customH}
                onChange={change(setCustomH)}
              />
            </>
          ) : null}
          <Seg
            label={t(l, '方向', 'Orientation')}
            value={orientation}
            onChange={change<Orientation>(setOrientation)}
            options={[
              { value: 'auto', label: t(l, '跟著圖片', 'follow image') },
              { value: 'portrait', label: t(l, '直式', 'portrait') },
              { value: 'landscape', label: t(l, '橫式', 'landscape') },
            ]}
          />
          <Input
            label={t(l, '邊界 mm', 'Margin mm')}
            type="number"
            min={0}
            step={1}
            value={marginMm}
            onChange={change(setMarginMm)}
          />
          <Input
            label={t(l, '像素密度 dpi', 'Pixel density dpi')}
            hint={t(l, '把像素換算成公分用的;72 就是一像素一點', 'Converts pixels to points; 72 means one pixel per point')}
            type="number"
            min={1}
            step={1}
            value={dpi}
            onChange={change(setDpi)}
          />
          <Check2
            label={t(l, '小圖放大到填滿版面', 'Enlarge small images to fill the page')}
            checked={upscale}
            onChange={change(setUpscale)}
          />
        </Row>
        <Note>
          {paperId === 'original'
            ? t(
                l,
                '原尺寸:每一頁就是那張圖在指定 dpi 下的實際大小,再加上邊界。方向設定在這個模式下沒有作用,頁面跟著圖片。PDF 的單邊上限是 14400 點(200 英吋),超過會直接擋下。',
                'Original: each page is the image’s real size at the given dpi, plus the margins. Orientation has no effect here — the page follows the image. PDF caps an edge at 14400 pt (200 in) and anything past that is refused.'
              )
            : t(
                l,
                '圖片等比縮放置中,不裁切。dpi 只影響原尺寸模式與「實際解析度」這一欄——縮到版面上之後,實際解析度才是列印會看到的那個數字。',
                'Images are scaled to fit and centred, never cropped. The dpi setting only affects original-size mode and the effective-resolution column — once scaled to the page, that is the number a printer sees.'
              )}
        </Note>
        {items.length > 0 ? (
          <Table
            head={[
              '#',
              t(l, '頁面 mm', 'page mm'),
              t(l, '頁面 pt', 'page pt'),
              t(l, '影像 pt', 'image pt'),
              t(l, '位置 x,y', 'at x,y'),
              t(l, '縮放', 'scale'),
              t(l, '實際解析度', 'effective dpi'),
            ]}
            align={['right', 'right', 'right', 'right', 'right', 'right', 'right']}
            rows={rows.map((row, index) => [
              <span key="n" className="inst-no">
                {index + 1}
              </span>,
              <span key="m" className="inst-no">
                {row.plan
                  ? `${(row.plan.page.width / mmToPt(1)).toFixed(0)}×${(row.plan.page.height / mmToPt(1)).toFixed(0)}`
                  : '—'}
              </span>,
              <span key="p" className="inst-no">
                {row.plan ? `${row.plan.page.width.toFixed(0)}×${row.plan.page.height.toFixed(0)}` : '—'}
              </span>,
              <span key="i" className="inst-no">
                {row.plan ? `${row.plan.rect.width.toFixed(0)}×${row.plan.rect.height.toFixed(0)}` : '—'}
              </span>,
              <span key="x" className="inst-no">
                {row.plan ? `${row.plan.rect.x.toFixed(0)},${row.plan.rect.y.toFixed(0)}` : '—'}
              </span>,
              <span key="s" className="inst-no">
                {row.plan ? `${(row.plan.scale * 100).toFixed(0)}%` : '—'}
              </span>,
              <span key="d" className="inst-no">
                {row.plan ? row.plan.effectiveDpi.toFixed(0) : '—'}
              </span>,
            ])}
          />
        ) : null}
        {rows.some((row) => row.plan !== null && row.plan.effectiveDpi < 150) ? (
          <Note>
            {t(
              l,
              '有頁面的實際解析度低於 150 dpi。螢幕上看沒事,印出來會看得出鋸齒。',
              'Some pages land under 150 dpi of effective resolution. Fine on screen; visibly soft in print.'
            )}
          </Note>
        ) : null}
      </Panel>

      <Panel label={t(l, '影像嵌入', 'IMAGE DATA')}>
        <Row>
          <Seg
            label={t(l, '方式', 'Path')}
            value={mode}
            onChange={change<EmbedMode>(setMode)}
            options={[
              { value: 'auto', label: t(l, '自動', 'auto') },
              { value: 'jpeg', label: t(l, '一律 JPEG', 'all JPEG') },
              { value: 'flate', label: t(l, '無損', 'lossless') },
            ]}
          />
          {mode !== 'flate' ? (
            <Input
              label={t(l, 'JPEG 品質 1–100', 'JPEG quality 1–100')}
              hint={t(l, '只影響需要重新編碼的那幾張', 'Only affects images that must be re-encoded')}
              type="number"
              min={1}
              max={100}
              step={1}
              value={quality}
              onChange={change(setQuality)}
            />
          ) : null}
          <Input
            label={t(l, '透明處填色', 'Flatten alpha onto')}
            type="color"
            value={bg}
            onChange={change(setBg)}
          />
        </Row>
        <Note>
          {mode === 'flate'
            ? t(
                l,
                '無損:每張圖都解成 RGB 再用 FlateDecode 壓進去。文字截圖、線稿用這個,字邊不會有雜訊。缺點是檔案大,而且原本是 JPEG 的圖也會被重新解碼(畫質不會再掉,但檔案會變大)。',
                'Lossless: every image is decoded to RGB and packed with FlateDecode. Right for text screenshots and line art — no ringing around glyphs. The file gets large, and images that were already JPEG are decoded too (no further quality loss, but a bigger file).'
              )
            : mode === 'auto'
              ? t(
                  l,
                  `自動:能直接嵌入的 JPEG 就照原樣搬進 PDF(/DCTDecode 的串流就是 JPEG 本體),不重新壓,畫質不會掉第二次;這次有 ${copyCount} 張走這條路。其餘的(PNG、帶透明、漸進式 JPEG 等)用畫布重新編碼成 JPEG。`,
                  `Auto: a JPEG that PDF can take verbatim is moved in byte for byte — a /DCTDecode stream is a JPEG scan — so there is no second generation of loss; ${copyCount} image(s) qualify here. The rest (PNG, anything with alpha, progressive JPEG) are re-encoded through a canvas.`
                )
              : t(
                  l,
                  '一律 JPEG:每張圖都重新編碼,原本就是 JPEG 的也一樣。用途是把太大的掃描件壓小——代價是二次壓縮,畫質只會更差,不會更好。只想縮小檔案就降品質;不想掉畫質就用「自動」。',
                  'All JPEG: every image is re-encoded, including ones that were already JPEG. The point is to shrink an oversized scan — at the cost of a second generation of compression, which can only lose quality. Lower the quality to shrink; switch to auto to keep what you have.'
                )}
        </Note>
        <Note>
          {t(
            l,
            'PDF 的影像沒有透明:半透明的地方會先合成到上面那個顏色。漸進式 JPEG、CMYK JPEG、12 位元 JPEG 不能直接嵌入(DCTDecode 不涵蓋,很多閱讀器會給你一張白紙),這幾種會自動改走重新編碼。',
            'A plain PDF image has no transparency: anything translucent is composited onto the colour above first. Progressive, CMYK and 12-bit JPEGs cannot be embedded verbatim — DCTDecode does not cover them and many readers would show a blank page — so those are re-encoded automatically.'
          )}
        </Note>
      </Panel>

      <Panel label={t(l, '檔案資訊', 'DOCUMENT INFO')}>
        <Row>
          <Input
            label={t(l, '標題(選填)', 'Title (optional)')}
            hint={t(l, '也當成存檔的檔名', 'Also used as the download file name')}
            value={title}
            onChange={change(setTitle)}
          />
          <Check2
            label={t(l, '寫入建立時間', 'Stamp a creation date')}
            checked={stampDate}
            onChange={change(setStampDate)}
          />
        </Row>
        <Note>
          {stampDate
            ? t(
                l,
                '會寫入本機時間與時區,包含你的時區偏移。不想留下這個就取消勾選。',
                'Writes your local time and time zone offset into the file. Uncheck to leave it out.'
              )
            : t(
                l,
                '不寫時間:同樣的圖片與設定會產生位元組完全相同的 PDF,方便比對。',
                'No timestamp: the same images and settings produce a byte-identical PDF, which makes it diffable.'
              )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '圖片', 'images'), v: count(items.length) },
          { k: t(l, '直接嵌入', 'copied'), v: count(copyCount) },
          { k: t(l, '讀入', 'read'), v: fmtBytes(inputBytes) },
          { k: t(l, 'PDF', 'pdf'), v: result ? fmtBytes(result.bytes) : '—' },
          {
            k: t(l, '頁面上限', 'page ceiling'),
            v: `${MAX_PAGE_PT} pt`,
          },
        ]}
      />
    </div>
  );
}

let idSeed = 0;
function nextId(): number {
  idSeed += 1;
  return idSeed;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!clean) return [255, 255, 255];
  const value = Number.parseInt(clean[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** PDF date syntax: D:YYYYMMDDHHmmSSOHH'mm'. */
function pdfDate(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -when.getTimezoneOffset();
  const sign = offset === 0 ? 'Z' : offset > 0 ? '+' : '-';
  const body =
    `D:${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  if (offset === 0) return `${body}Z`;
  const absolute = Math.abs(offset);
  return `${body}${sign}${pad(Math.floor(absolute / 60))}'${pad(absolute % 60)}'`;
}

/**
 * Real deflate where the browser has it, valid stored blocks where it does not.
 *
 * `CompressionStream('deflate')` emits the zlib wrapper that PDF's
 * `/FlateDecode` expects. Without it the file would still be correct, just big,
 * and the UI says so rather than pretending it compressed.
 */
async function deflateZlib(
  data: Uint8Array
): Promise<{ data: Uint8Array; how: 'native' | 'stored' }> {
  const ctor = (globalThis as { CompressionStream?: new (format: string) => unknown })
    .CompressionStream;
  if (typeof ctor !== 'function') return { data: zlibStore(data), how: 'stored' };
  try {
    const stream = new ctor('deflate') as {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
    const writer = stream.writable.getWriter();
    void writer.write(data as Uint8Array<ArrayBuffer>);
    void writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      total += next.value.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return { data: out, how: 'native' };
  } catch {
    return { data: zlibStore(data), how: 'stored' };
  }
}
