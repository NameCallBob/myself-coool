'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  CopyButton,
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
  APPLE_FILE_NAME,
  DEFAULT_ICO_SIZES,
  DEFAULT_PNG_SIZES,
  ICO_FILE_NAME,
  ICO_MAX_SIDE,
  KNOWN_SIZES,
  MANIFEST_FILE_NAME,
  buildIco,
  htmlSnippet,
  manifestJson,
  parseIco,
  parseSizeList,
  pngFileName,
  planDraw,
  readPngSize,
  type Draw,
  type FitMode,
  type IcoEntry,
} from './logic';

type Source = {
  name: string;
  fileBytes: number;
  type: string;
  width: number;
  height: number;
  url: string;
  image: HTMLImageElement;
};

type Artifact = {
  /** File name as it should be saved and as the HTML references it. */
  name: string;
  /** Icon edge in pixels; 0 for the ICO and the manifest. */
  size: number;
  bytes: number;
  url: string;
  kind: 'png' | 'ico' | 'text';
};

type Built = {
  files: Artifact[];
  ico: IcoEntry[] | null;
  /** Sizes that actually came out of the encoder, for the snippet. */
  pngSizes: number[];
  icoSizes: number[];
  appleSize: number;
  manifest: boolean;
  /** The manifest text, kept alongside the Blob so it can also be copied. */
  manifestText: string;
  base: string;
};

/** Anything beyond this is not a favicon any more. */
const MAX_SIZE = 1024;
/** Encoding is per-size and synchronous-ish; a couple of dozen is plenty. */
const MAX_COUNT = 12;

export default function Favicon({ l }: ToolProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [sizeText, setSizeText] = useState(DEFAULT_PNG_SIZES.join(', '));
  const [icoText, setIcoText] = useState(DEFAULT_ICO_SIZES.join(', '));
  const [fit, setFit] = useState<FitMode>('contain');
  const [padding, setPadding] = useState('0');
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(true);
  const [base, setBase] = useState('/');
  const [applePick, setApplePick] = useState('180');
  const [wantManifest, setWantManifest] = useState(false);
  const [appName, setAppName] = useState('');
  const [shortName, setShortName] = useState('');
  const [themeColor, setThemeColor] = useState('#111111');
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Object URLs are not React state; they are revoked by hand. */
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

  const plan = useMemo(() => {
    try {
      const sizes = parseSizeList(sizeText, MAX_SIZE);
      if (sizes.length > MAX_COUNT) {
        return {
          sizes: [] as number[],
          ico: [] as number[],
          problem: t(
            l,
            `一次最多 ${MAX_COUNT} 個尺寸。`,
            `At most ${MAX_COUNT} sizes at a time.`
          ),
        };
      }
      const ico = icoText.trim() === '' ? [] : parseSizeList(icoText, ICO_MAX_SIDE);
      const tooBig = ico.filter((size) => size > ICO_MAX_SIDE);
      if (tooBig.length > 0) {
        return {
          sizes,
          ico: [] as number[],
          problem: t(
            l,
            `ICO 每一格最多 ${ICO_MAX_SIDE} px(目錄用一個位元組存邊長),${tooBig.join('、')} 放不進去。`,
            `An ICO member maxes out at ${ICO_MAX_SIDE} px — the directory stores the edge in one byte — so ${tooBig.join(', ')} cannot go in.`
          ),
        };
      }
      return { sizes, ico, problem: null as string | null };
    } catch (problem) {
      return {
        sizes: [] as number[],
        ico: [] as number[],
        problem: problem instanceof Error ? problem.message : String(problem),
      };
    }
  }, [icoText, l, sizeText]);

  const padFraction = useMemo(() => {
    const pct = Number(padding);
    if (!Number.isFinite(pct) || pct < 0) return 0;
    return Math.min(45, pct) / 100;
  }, [padding]);

  const appleSize = plan.sizes.includes(Number(applePick)) ? Number(applePick) : 0;
  /** Sizes that need rendering: the listed ones plus any ICO-only size. */
  const renderSizes = useMemo(() => {
    const all = new Set([...plan.sizes, ...plan.ico]);
    return [...all].sort((a, b) => a - b);
  }, [plan.ico, plan.sizes]);

  const clearBuilt = useCallback(() => {
    setBuilt((current) => {
      if (current) for (const file of current.files) drop(file.url);
      return null;
    });
  }, []);

  /** Any settings change invalidates the rendered set rather than lying about it. */
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    clearBuilt();
  };

  const takeFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      clearBuilt();
      const url = track(URL.createObjectURL(file));
      const image = new Image();
      image.src = url;
      try {
        // decode() resolves only when the pixels can be drawn, so the first
        // render cannot land on an empty image.
        await image.decode();
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) throw new Error('zero size');
        setSource((current) => {
          if (current) drop(current.url);
          return {
            name: file.name,
            fileBytes: file.size,
            type: file.type || t(l, '未知', 'unknown'),
            width,
            height,
            url,
            image,
          };
        });
      } catch {
        drop(url);
        setError(
          file.type === 'image/svg+xml'
            ? t(
                l,
                '這個 SVG 解不開,或者根元素沒有 width/height。瀏覽器要有內建尺寸才畫得出點陣圖——先在 <svg> 上補 width 與 height,或先匯出一張 PNG。',
                'This SVG could not be decoded, or its root has no width/height. The browser needs an intrinsic size to rasterise — add width and height to <svg>, or export a PNG first.'
              )
            : t(
                l,
                '瀏覽器解不開這個檔案。它可能不是圖片,或是這個瀏覽器不支援的格式。',
                'The browser could not decode this file. It may not be an image, or not a format this browser supports.'
              )
        );
      }
    },
    [clearBuilt, l]
  );

  const previews = useMemo(() => {
    if (!source) return [] as { size: number; draw: Draw }[];
    return renderSizes.map((size) => ({
      size,
      draw: planDraw(source, size, fit, padFraction),
    }));
  }, [fit, padFraction, renderSizes, source]);

  /**
   * Render every size, then pack the ICO.
   *
   * A button, not a live effect: this allocates and PNG-encodes a dozen
   * canvases, which is not something to redo on every keystroke in the padding
   * field. The geometry table above updates live; the bytes wait for the press.
   */
  const generate = async () => {
    if (!source || plan.problem || renderSizes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pngs = new Map<number, Uint8Array>();
      const files: Artifact[] = [];

      for (const size of renderSizes) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(t(l, '這個瀏覽器沒有給 2D 繪圖環境。', 'No 2D context available.'));
        if (!transparent) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, size, size);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const draw = planDraw(source, size, fit, padFraction);
        ctx.drawImage(source.image, draw.x, draw.y, draw.width, draw.height);

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        if (!blob || blob.size === 0) {
          throw new Error(
            t(l, `${size}×${size} 這一張瀏覽器拒絕輸出。`, `The browser refused to encode ${size}x${size}.`)
          );
        }
        const data = new Uint8Array(await blob.arrayBuffer());
        // Trust the payload, not the request: the directory entry has to match
        // the IHDR, so read it back instead of assuming.
        const real = readPngSize(data);
        if (real.width !== size || real.height !== size) {
          throw new Error(
            t(
              l,
              `瀏覽器輸出的是 ${real.width}×${real.height},不是要求的 ${size}×${size},停下來。`,
              `The encoder produced ${real.width}x${real.height} instead of ${size}x${size}; stopping.`
            )
          );
        }
        pngs.set(size, data);
      }

      for (const size of plan.sizes) {
        const data = pngs.get(size)!;
        files.push({
          name: size === appleSize ? APPLE_FILE_NAME : pngFileName(size),
          size,
          bytes: data.length,
          url: track(URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/png' }))),
          kind: 'png',
        });
      }

      let icoEntries: IcoEntry[] | null = null;
      if (plan.ico.length > 0) {
        const ico = buildIco(
          plan.ico.map((size) => ({ width: size, height: size, png: pngs.get(size)! }))
        );
        // Read our own container back before handing it over.
        icoEntries = parseIco(ico);
        files.unshift({
          name: ICO_FILE_NAME,
          size: 0,
          bytes: ico.length,
          url: track(
            URL.createObjectURL(new Blob([ico as Uint8Array<ArrayBuffer>], { type: 'image/vnd.microsoft.icon' }))
          ),
          kind: 'ico',
        });
      }

      const manifestOn = wantManifest && appName.trim() !== '';
      let manifestText = '';
      if (manifestOn) {
        const text = manifestJson({
          base,
          name: appName.trim(),
          shortName: (shortName.trim() || appName.trim()).slice(0, 12),
          sizes: plan.sizes.filter((size) => size !== appleSize),
          themeColor,
          backgroundColor: transparent ? '#ffffff' : bg,
        });
        manifestText = text;
        files.push({
          name: MANIFEST_FILE_NAME,
          size: 0,
          bytes: new TextEncoder().encode(text).length,
          url: track(URL.createObjectURL(new Blob([text], { type: 'application/manifest+json' }))),
          kind: 'text',
        });
      }

      clearBuilt();
      setBuilt({
        files,
        ico: icoEntries,
        pngSizes: plan.sizes,
        icoSizes: plan.ico,
        appleSize,
        manifest: manifestOn,
        manifestText,
        base,
      });
      if (wantManifest && !manifestOn) {
        setError(
          t(
            l,
            'manifest 沒有寫出來:要先填網站名稱。其他檔案已產生。',
            'The manifest was skipped: it needs a site name. The other files were written.'
          )
        );
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const save = (file: Artifact) => {
    const anchor = document.createElement('a');
    anchor.href = file.url;
    anchor.download = file.name;
    anchor.click();
  };

  const saveAll = () => {
    if (!built) return;
    for (const file of built.files) save(file);
  };

  const clearAll = () => {
    setSource((current) => {
      if (current) drop(current.url);
      return null;
    });
    clearBuilt();
    setError(null);
  };

  const snippet = built
    ? htmlSnippet({
        base: built.base,
        pngSizes: built.pngSizes,
        icoSizes: built.icoSizes,
        appleSize: built.appleSize,
        manifest: built.manifest,
      })
    : '';
  const manifestText = built?.manifestText ?? '';

  const totalBytes = built ? built.files.reduce((sum, file) => sum + file.bytes, 0) : 0;
  const icoFile = built?.files.find((file) => file.kind === 'ico') ?? null;
  const squareSource = source ? source.width === source.height : true;

  return (
    <div>
      <Bench
        leftLabel={t(l, '來源圖', 'SOURCE')}
        rightLabel={t(l, '產出', 'FILES')}
        leftAside={
          source ? (
            <span className="inst-no">
              {source.width} × {source.height}
            </span>
          ) : null
        }
        rightAside={built ? <span className="inst-no">{count(built.files.length)}</span> : null}
        left={
          <>
            <DropZone
              l={l}
              onFiles={takeFile}
              accept="image/*"
              hint={t(
                l,
                '把來源圖拖進來,或點一下選檔',
                'Drop the source image here, or click to choose'
              )}
            />
            {source ? (
              <>
                <Table
                  head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                  align={['left', 'right']}
                  rows={[
                    [t(l, '檔名', 'file'), <span key="n" className="inst-wrap">{source.name}</span>],
                    [t(l, '格式', 'type'), <span key="t" className="inst-no">{source.type}</span>],
                    [
                      t(l, '尺寸', 'pixels'),
                      <span key="d" className="inst-no">
                        {source.width} × {source.height}
                      </span>,
                    ],
                    [t(l, '大小', 'size'), <span key="b" className="inst-no">{fmtBytes(source.fileBytes)}</span>],
                  ]}
                />
                <Row>
                  <Btn onClick={clearAll}>{t(l, '移除', 'remove')}</Btn>
                </Row>
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '建議給一張至少 512×512 的方形圖。放大出來的 512 會軟,這個工具不會替你補細節。',
                  'Give it a square image of at least 512x512. Upscaling to 512 looks soft, and this tool will not invent detail.'
                )}
              </Note>
            )}
            {source && !squareSource ? (
              <Note>
                {fit === 'contain'
                  ? t(
                      l,
                      '來源不是正方形。「完整放入」會留白邊,要不要透明看下面的設定。',
                      'The source is not square. "Contain" leaves margin; the transparency switch below decides what fills it.'
                    )
                  : t(
                      l,
                      '來源不是正方形。「填滿裁切」會切掉長邊,兩端各切一半。',
                      'The source is not square. "Cover" crops the long edge, half off each end.'
                    )}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          <>
            <Row>
              <Btn
                onClick={generate}
                primary
                disabled={!source || busy || plan.problem !== null || renderSizes.length === 0}
              >
                {busy ? t(l, '產生中', 'rendering') : t(l, '產生整組', 'render set')}
              </Btn>
              <Btn onClick={saveAll} disabled={!built}>
                {t(l, '全部存檔', 'save all')}
              </Btn>
            </Row>
            {plan.problem ? <Note error>{plan.problem}</Note> : null}
            {built ? (
              <>
                <Table
                  head={[t(l, '檔名', 'file'), t(l, '尺寸', 'size'), t(l, '位元組', 'bytes'), '']}
                  align={['left', 'right', 'right', 'left']}
                  rows={built.files.map((file) => [
                    <span key="n" className="inst-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {file.kind === 'png' ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- a blob: URL encoded in this tab; next/image would route it through a loader */
                        <img
                          src={file.url}
                          alt=""
                          width={16}
                          height={16}
                          style={{ width: 16, height: 16, flex: '0 0 auto' }}
                        />
                      ) : null}
                      <span>{file.name}</span>
                    </span>,
                    <span key="s" className="inst-no">
                      {file.size > 0 ? `${file.size}×${file.size}` : file.kind === 'ico' ? built.icoSizes.map((s) => `${s}`).join('/') : '—'}
                    </span>,
                    <span key="b" className="inst-no">
                      {count(file.bytes)}
                    </span>,
                    <Btn key="d" onClick={() => save(file)}>
                      {t(l, '存檔', 'save')}
                    </Btn>,
                  ])}
                />
                <Note>
                  {t(
                    l,
                    '「全部存檔」是逐檔觸發下載,瀏覽器可能會問要不要允許多個檔案。',
                    '"Save all" triggers one download per file; the browser may ask to allow multiple downloads.'
                  )}
                </Note>
              </>
            ) : (
              <Note>
                {source
                  ? t(
                      l,
                      '設定調好後按「產生整組」。下面的繪製座標是即時算的,像素要按了才畫。',
                      'Set the options, then render. The draw coordinates below update live; the pixels wait for the press.'
                    )
                  : t(l, '先給一張圖。', 'Add an image first.')}
              </Note>
            )}
          </>
        }
      />

      <Panel
        label={t(l, '尺寸', 'SIZES')}
        aside={<span className="inst-no">{renderSizes.join(' · ') || '—'}</span>}
      >
        <Row>
          <Input
            label={t(l, 'PNG 尺寸', 'PNG sizes')}
            hint={t(l, `逗號分隔,1–${MAX_SIZE},最多 ${MAX_COUNT} 個`, `Comma separated, 1–${MAX_SIZE}, up to ${MAX_COUNT}`)}
            value={sizeText}
            onChange={change(setSizeText)}
          />
          <Input
            label={t(l, 'ICO 內含尺寸', 'Sizes inside the ICO')}
            hint={t(l, `留空就不產生 .ico;每格上限 ${ICO_MAX_SIDE}`, `Leave empty to skip the .ico; ${ICO_MAX_SIDE} max per member`)}
            value={icoText}
            onChange={change(setIcoText)}
          />
          <Input
            label={t(l, 'apple-touch-icon 用哪個', 'apple-touch-icon size')}
            hint={t(l, '這一格會存成 apple-touch-icon.png', 'That size is saved as apple-touch-icon.png')}
            value={applePick}
            onChange={change(setApplePick)}
          />
        </Row>
        {appleSize === 0 ? (
          <Note>
            {t(
              l,
              'apple-touch-icon 沒有對應尺寸,不會產生。iOS 加到主畫面時只看這個檔,不看 manifest,所以通常留 180。',
              'No apple-touch-icon will be written. iOS reads only that file when adding to the home screen — it ignores the manifest — so 180 is usually worth keeping.'
            )}
          </Note>
        ) : null}
        <Table
          head={[t(l, '尺寸', 'px'), t(l, '用在哪', 'used for'), t(l, '這次產生', 'in this set')]}
          align={['right', 'left', 'left']}
          rows={KNOWN_SIZES.map((row) => [
            <span key="s" className="inst-no">
              {row.size}
            </span>,
            t(l, row.use.zh, row.use.en),
            <span key="i" className="inst-no">
              {plan.sizes.includes(row.size)
                ? plan.ico.includes(row.size)
                  ? t(l, 'PNG + ICO', 'PNG + ICO')
                  : 'PNG'
                : plan.ico.includes(row.size)
                  ? t(l, '只在 ICO 裡', 'ICO only')
                  : '—'}
            </span>,
          ])}
        />
        <Note>
          {t(
            l,
            '這張表是慣例,不是標準——各家瀏覽器實際怎麼挑圖會變,尺寸清單上面可以自己改。16/32 給分頁,180 給 iOS,192/512 給 Android 的 manifest,ICO 包 16/32/48 應付舊環境與 Windows 捷徑。',
            'This table is convention, not specification — what each browser actually picks changes over time, and the size list above is editable. 16/32 for tabs, 180 for iOS, 192/512 for the Android manifest, and an ICO of 16/32/48 for legacy and Windows shortcuts.'
          )}
        </Note>
      </Panel>

      <Panel label={t(l, '繪製', 'RENDER')}>
        <Row>
          <Seg
            label={t(l, '裁切方式', 'Fit')}
            value={fit}
            onChange={change<FitMode>(setFit)}
            options={[
              { value: 'contain', label: t(l, '完整放入', 'contain') },
              { value: 'cover', label: t(l, '填滿裁切', 'cover') },
            ]}
          />
          <Input
            label={t(l, '留白 %', 'Padding %')}
            hint={t(l, '每邊各留,0–45', 'Per side, 0–45')}
            type="number"
            min={0}
            max={45}
            step={1}
            value={padding}
            onChange={change(setPadding)}
          />
          <Input
            label={t(l, '背景色', 'Background')}
            type="color"
            value={bg}
            onChange={change(setBg)}
          />
          <Check2
            label={t(l, '背景透明', 'Transparent background')}
            checked={transparent}
            onChange={change(setTransparent)}
          />
        </Row>
        <Note>
          {transparent
            ? t(
                l,
                '透明背景在深色分頁條上比較保險,但深色的線稿在深色主題會看不見。想確定就關掉透明,填一個底色。',
                'A transparent background is safer across tab bars, but dark line art disappears on a dark theme. Turn transparency off and fill a colour if you need certainty.'
              )
            : t(
                l,
                '底色會填滿整個方框,包含 contain 留出來的白邊。',
                'The colour fills the whole square, including the margin that contain leaves.'
              )}
        </Note>
        {source ? (
          <Table
            head={[
              t(l, '尺寸', 'box'),
              t(l, '繪製寬高', 'drawn'),
              t(l, '位置 x,y', 'at x,y'),
              t(l, '相對來源', 'scale'),
            ]}
            align={['right', 'right', 'right', 'right']}
            rows={previews.map((row) => [
              <span key="b" className="inst-no">
                {row.size}×{row.size}
              </span>,
              <span key="d" className="inst-no">
                {round(row.draw.width)}×{round(row.draw.height)}
              </span>,
              <span key="p" className="inst-no">
                {round(row.draw.x)},{round(row.draw.y)}
              </span>,
              <span key="s" className="inst-no">
                {((row.draw.width / source.width) * 100).toFixed(1)}%
              </span>,
            ])}
          />
        ) : null}
        {built ? (
          <div className="inst-field">
            <p className="inst-hint">
              {t(l, '實際大小預覽(1:1)', 'Actual-size preview (1:1)')}
            </p>
            <div
              aria-live="polite"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}
            >
              {built.files
                .filter((file) => file.kind === 'png')
                .map((file) => (
                  <span key={file.name} style={{ display: 'grid', gap: '0.25rem', justifyItems: 'center' }}>
                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        border: '1px solid var(--border-2)',
                      }}
                    >
                      {['#ffffff', '#1a1a1a'].map((chip) => (
                        <span key={chip} style={{ background: chip, padding: '0.35rem', display: 'block' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL from this tab */}
                          <img
                            src={file.url}
                            alt={t(l, `${file.size} 像素圖示`, `${file.size} pixel icon`)}
                            width={Math.min(file.size, 128)}
                            height={Math.min(file.size, 128)}
                            style={{
                              display: 'block',
                              width: Math.min(file.size, 128),
                              height: Math.min(file.size, 128),
                            }}
                          />
                        </span>
                      ))}
                    </span>
                    <span className="inst-no" style={{ fontSize: '0.7rem' }}>
                      {file.size}
                      {file.size > 128 ? t(l, '(縮至 128 顯示)', ' (shown at 128)') : ''}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel label={t(l, '要貼進 <head> 的標籤', 'MARKUP')}>
        <Row>
          <Input
            label={t(l, '檔案放在哪個路徑', 'Base path')}
            hint={t(l, '寫成網址前綴,例如 / 或 /assets/', 'A URL prefix, e.g. / or /assets/')}
            value={base}
            onChange={change(setBase)}
          />
          <Check2
            label={t(l, '一起產生 manifest', 'Also write a manifest')}
            checked={wantManifest}
            onChange={change(setWantManifest)}
          />
          {wantManifest ? (
            <>
              <Input
                label={t(l, '網站名稱', 'Site name')}
                value={appName}
                onChange={change(setAppName)}
              />
              <Input
                label={t(l, '短名稱', 'Short name')}
                hint={t(l, '留空就用網站名稱前 12 字', 'Empty uses the first 12 characters of the name')}
                value={shortName}
                onChange={change(setShortName)}
              />
              <Input
                label={t(l, '主題色', 'Theme colour')}
                type="color"
                value={themeColor}
                onChange={change(setThemeColor)}
              />
            </>
          ) : null}
        </Row>
        <div className="inst-field">
          <p className="inst-hint">
            {t(l, '路徑用的是你上面填的前綴,檔名就是產出表裡的檔名。', 'The paths use the prefix above; the names are exactly the ones in the file list.')}
          </p>
          <pre className="inst-out" aria-live="polite" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {snippet ||
              t(
                l,
                '產生之後這裡會出現實際的標籤。',
                'The actual markup appears here once the set is rendered.'
              )}
          </pre>
          <Row>
            <CopyButton l={l} text={snippet} label={t(l, '複製標籤', 'copy markup')} />
            {manifestText ? (
              <CopyButton l={l} text={manifestText} label={t(l, '複製 manifest', 'copy manifest')} />
            ) : null}
          </Row>
        </div>
        {built ? (
          <Note>
            {t(
              l,
              'favicon.ico 放在網站根目錄時,連標籤都不寫也會被找到——舊瀏覽器與 RSS 閱讀器仍在猜這條路徑。',
              'A favicon.ico at the site root is found even with no markup at all: old browsers and feed readers still guess that path.'
            )}
          </Note>
        ) : null}
      </Panel>

      {built?.ico ? (
        <Panel
          label={t(l, 'ICO 容器檢查', 'ICO CONTAINER')}
          aside={<span className="inst-no">{icoFile ? fmtBytes(icoFile.bytes) : '—'}</span>}
        >
          <Table
            head={[
              '#',
              t(l, '尺寸', 'size'),
              t(l, '位元深度', 'bits'),
              t(l, '資料長度', 'payload'),
              t(l, '檔內位移', 'offset'),
              t(l, '格式', 'format'),
            ]}
            align={['right', 'right', 'right', 'right', 'right', 'left']}
            rows={built.ico.map((entry, index) => [
              <span key="i" className="inst-no">
                {index + 1}
              </span>,
              <span key="s" className="inst-no">
                {entry.width}×{entry.height}
              </span>,
              <span key="b" className="inst-no">
                {entry.bitCount}
              </span>,
              <span key="p" className="inst-no">
                {count(entry.bytes)}
              </span>,
              <span key="o" className="inst-no">
                {count(entry.offset)}
              </span>,
              <span key="f" className="inst-no">
                {entry.png ? 'PNG' : 'BMP/DIB'}
              </span>,
            ])}
          />
          <Note>
            {t(
              l,
              '這張表是把剛才寫出來的 .ico 重新讀一遍的結果:目錄有 6 個位元組的表頭,每一格 16 個位元組,位移是從檔案開頭算的。每格存 PNG,是 Vista 之後的作法;真正的 Windows XP 只看得懂 BMP 格式的那一種。',
              'This table is the .ico just written, read back: a 6-byte directory header, 16 bytes per member, offsets counted from the start of the file. Each member holds a PNG, which is the post-Vista arrangement — genuine Windows XP only understands the BMP kind.'
            )}
          </Note>
        </Panel>
      ) : null}

      <Readout
        l={l}
        items={[
          {
            k: t(l, '來源', 'source'),
            v: source ? `${source.width}×${source.height}` : '—',
          },
          { k: t(l, '尺寸數', 'sizes'), v: count(renderSizes.length) },
          { k: t(l, '檔案數', 'files'), v: built ? count(built.files.length) : '—' },
          { k: t(l, 'ICO', 'ico'), v: icoFile ? fmtBytes(icoFile.bytes) : '—' },
          { k: t(l, '合計', 'total'), v: built ? fmtBytes(totalBytes) : '—' },
        ]}
      />
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
