'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
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
import { t } from '@/lib/tools/locale';
import { bytes, count } from '@/lib/tools/format';
import {
  COLLISION_THRESHOLD,
  DEFICIENCIES,
  MAX_PIXELS,
  PREVALENCE,
  collisions,
  extractPalette,
  luminance,
  simulate,
  simulateImageData,
  toHex,
  type Deficiency,
} from './logic';

const NAME: Record<Deficiency, { zh: string; en: string }> = {
  protan: { zh: '紅色盲 protanopia', en: 'protanopia' },
  deutan: { zh: '綠色盲 deuteranopia', en: 'deuteranopia' },
  tritan: { zh: '藍黃色盲 tritanopia', en: 'tritanopia' },
};

const SAMPLE = [
  '/* 貼 CSS、JSON 主題、或一欄色碼都可以 —— 會自動挑出 hex 與 rgb() */',
  '--ok:      #2e7d32;',
  '--warn:    #c62828;',
  '--info:    #1565c0;',
  '--pending: #f9a825;',
  '--muted:   #757575;',
  '--line:    rgb(180 180 180);',
].join('\n');

/** The preview is capped so dragging the severity slider stays interactive; the
 *  download is recomputed at full resolution. */
const PREVIEW_MAX = 1400;

type Loaded = {
  el: HTMLImageElement;
  url: string;
  w: number;
  h: number;
  name: string;
  size: number;
};

function Chip({ hex, label }: { hex: string; label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span
        aria-hidden="true"
        style={{
          background: hex,
          border: '1px solid var(--border-3)',
          display: 'inline-block',
          height: '1.1rem',
          width: '1.8rem',
        }}
      />
      <span className="inst-no">{label ?? hex}</span>
    </span>
  );
}

export default function ColorBlind({ l }: ToolProps) {
  const [source, setSource] = useState<'palette' | 'image'>('palette');
  const [text, setText] = useState(SAMPLE);
  const [severityPct, setSeverityPct] = useState(100);
  const [threshold, setThreshold] = useState(String(COLLISION_THRESHOLD));
  const [type, setType] = useState<Deficiency>('deutan');
  const [image, setImage] = useState<Loaded | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(true);

  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const simulatedRef = useRef<HTMLCanvasElement | null>(null);

  const severity = severityPct / 100;
  const thresholdNumber = Number(threshold);
  const usableThreshold =
    Number.isFinite(thresholdNumber) && thresholdNumber > 0 ? thresholdNumber : COLLISION_THRESHOLD;

  const palette = useMemo(() => extractPalette(text), [text]);

  const clashes = useMemo(() => {
    const rgbs = palette.map((entry) => entry.rgb);
    return {
      protan: collisions(rgbs, 'protan', severity, usableThreshold),
      deutan: collisions(rgbs, 'deutan', severity, usableThreshold),
      tritan: collisions(rgbs, 'tritan', severity, usableThreshold),
    };
  }, [palette, severity, usableThreshold]);

  /**
   * Canvas work, and only canvas work: the effect draws, it never sets state,
   * so the severity slider does not cost a render pass per pixel pass.
   */
  useEffect(() => {
    const a = originalRef.current;
    const b = simulatedRef.current;
    // `source` is a dependency because switching away unmounts these canvases:
    // coming back mounts fresh, blank ones, and without it the effect would not
    // re-run to repaint them.
    if (source !== 'image' || !image || !a || !b) return;
    const scale = Math.min(1, PREVIEW_MAX / Math.max(image.w, image.h));
    const w = Math.max(1, Math.round(image.w * scale));
    const h = Math.max(1, Math.round(image.h * scale));
    for (const canvas of [a, b]) {
      canvas.width = w;
      canvas.height = h;
    }
    const ca = a.getContext('2d', { willReadFrequently: true });
    const cb = b.getContext('2d');
    if (!ca || !cb) return;
    ca.drawImage(image.el, 0, 0, w, h);
    const frame = ca.getImageData(0, 0, w, h);
    simulateImageData(frame.data, type, severity);
    cb.putImageData(frame, 0, 0);
  }, [source, image, type, severity]);

  const take = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setImageError(t(l, '這不是圖片檔。', 'Not an image file.'));
        return;
      }
      const url = URL.createObjectURL(file);
      const el = new Image();
      el.src = url;
      try {
        await el.decode();
      } catch {
        URL.revokeObjectURL(url);
        setImageError(
          t(l, '瀏覽器解不開這個檔,或它壞了。', 'The browser could not decode this file, or it is damaged.')
        );
        return;
      }
      const w = el.naturalWidth;
      const h = el.naturalHeight;
      if (w === 0 || h === 0) {
        URL.revokeObjectURL(url);
        setImageError(
          t(
            l,
            '讀不到尺寸。SVG 沒有寫 width / height 時會這樣,先給它一組尺寸再拖進來。',
            'No intrinsic size. An SVG without width / height does this — give it dimensions and try again.'
          )
        );
        return;
      }
      if (w * h > MAX_PIXELS) {
        URL.revokeObjectURL(url);
        setImageError(
          t(
            l,
            `${w}×${h} 是 ${count(w * h)} 個像素,超過上限 ${count(MAX_PIXELS)}。縮小再試,不然這個分頁會停住。`,
            `${w}×${h} is ${count(w * h)} pixels, over the ${count(MAX_PIXELS)} ceiling. Downscale it first, or this tab will stall.`
          )
        );
        return;
      }
      setImage((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { el, url, w, h, name: file.name, size: file.size };
      });
      setImageError(null);
    },
    [l]
  );

  /** Full resolution, computed in the click rather than kept around. */
  const download = useCallback(() => {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = image.w;
    canvas.height = image.h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image.el, 0, 0);
    const frame = context.getImageData(0, 0, image.w, image.h);
    simulateImageData(frame.data, type, severity);
    context.putImageData(frame, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${image.name.replace(/\.[^.]+$/, '')}-${type}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [image, type, severity]);

  const worst = DEFICIENCIES.reduce(
    (found, kind) => (clashes[kind].length > clashes[found].length ? kind : found),
    DEFICIENCIES[0]
  );
  const totalClashes = DEFICIENCIES.reduce((sum, kind) => sum + clashes[kind].length, 0);

  const severityControl = (
    <div className="inst-field">
      <label className="inst-label" htmlFor="cb-severity">
        {t(l, `嚴重度 ${severityPct}%`, `Severity ${severityPct}%`)}
      </label>
      <input
        id="cb-severity"
        type="range"
        min={0}
        max={100}
        step={5}
        value={severityPct}
        onChange={(event) => setSeverityPct(Number(event.target.value))}
        style={{ accentColor: 'var(--accent)', width: '100%' }}
      />
      <p className="inst-hint">
        {t(
          l,
          '100% 是全色盲(缺一種錐細胞)的投影,那是有根據的模型。中間的值是往該結果線性內插,用來大致代表色弱 —— 它不是錐細胞反應模型,只能當參考。要下結論請看 100%。',
          '100% is the dichromat projection, which is a published model. Values in between linearly interpolate towards it as a rough stand-in for anomalous trichromacy — it is not a cone-response model, so read it as indicative. Judge at 100%.'
        )}
      </p>
    </div>
  );

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '來源', 'Source')}
          value={source}
          onChange={setSource}
          options={[
            { value: 'palette', label: t(l, '色票', 'palette') },
            { value: 'image', label: t(l, '圖片', 'image') },
          ]}
        />
      </Row>

      {source === 'palette' ? (
        <div className="inst-bench">
          <section>
            <div className="inst-pane-label">
              <span>{t(l, '色票', 'PALETTE')}</span>
              <span className="inst-no">{t(l, `${palette.length} 色`, `${palette.length} colours`)}</span>
            </div>
            <Area
              label={t(l, '貼上任何含色碼的文字', 'Paste anything with colours in it')}
              hint={t(
                l,
                '會挑出 #rrggbb、#rgb 與 rgb()/rgba();重複的只留一個,最多 64 色。',
                'Picks up #rrggbb, #rgb and rgb()/rgba(); duplicates are dropped, up to 64 colours.'
              )}
              value={text}
              onChange={setText}
              rows={10}
            />
            {severityControl}
            <Input
              label={t(l, '判定門檻(OKLab 距離)', 'Threshold (OKLab distance)')}
              hint={t(
                l,
                '模擬後距離小於這個值就算「分不出來」。預設 0.06 —— 大約是兩塊色票並排時還能看出差別的下限,不是標準,依你的用途改。0.02 約等於一個剛可辨差。',
                'Two colours closer than this after simulation count as indistinguishable. The 0.06 default is roughly the floor for telling two adjacent swatches apart — a judgement, not a standard. 0.02 is about one just-noticeable difference.'
              )}
              value={threshold}
              onChange={setThreshold}
              type="number"
              min={0.005}
              max={0.5}
              step={0.005}
              invalid={!Number.isFinite(thresholdNumber) || thresholdNumber <= 0}
            />
          </section>

          <div className="inst-seam" aria-hidden="true" />

          <section>
            <div className="inst-pane-label">
              <span>{t(l, '三型模擬', 'SIMULATED')}</span>
              <span className="inst-no">
                {totalClashes === 0
                  ? t(l, '沒有相撞', 'no collisions')
                  : t(l, `${totalClashes} 組相撞`, `${totalClashes} collisions`)}
              </span>
            </div>
            <div aria-live="polite">
              {palette.length === 0 ? (
                <Note>{t(l, '貼上的文字裡找不到色碼。', 'No colours found in that text.')}</Note>
              ) : (
                <Table
                  head={[
                    t(l, '原色', 'as drawn'),
                    t(l, '紅色盲', 'protan'),
                    t(l, '綠色盲', 'deutan'),
                    t(l, '藍黃色盲', 'tritan'),
                    t(l, '亮度', 'luminance'),
                  ]}
                  align={['left', 'left', 'left', 'left', 'right']}
                  rows={palette.map((entry) => [
                    <Chip key="o" hex={entry.hex} />,
                    ...DEFICIENCIES.map((kind) => (
                      <Chip key={kind} hex={toHex(simulate(entry.rgb, kind, severity))} />
                    )),
                    <span key="lum" className="inst-no">
                      {luminance(entry.rgb).toFixed(3)}
                    </span>,
                  ])}
                />
              )}
            </div>
          </section>
        </div>
      ) : (
        <div>
          <Panel
            label={t(l, '圖片', 'IMAGE')}
            aside={
              image ? (
                <span className="inst-no">
                  {image.w}×{image.h} · {bytes(image.size)}
                </span>
              ) : null
            }
          >
            <DropZone
              l={l}
              onFiles={take}
              accept="image/*"
              hint={t(
                l,
                '把截圖拖到這裡,或點一下選檔(PNG / JPEG / WebP / GIF 第一格)',
                'Drop a screenshot here, or click to choose (PNG / JPEG / WebP / first GIF frame)'
              )}
            />
            {imageError ? <Note error>{imageError}</Note> : null}
            <Row>
              <Seg
                label={t(l, '模擬哪一型', 'Which deficiency')}
                value={type}
                onChange={setType}
                options={DEFICIENCIES.map((kind) => ({ value: kind, label: NAME[kind][l] }))}
              />
              <Check2
                label={t(l, '並排對照', 'side by side')}
                checked={sideBySide}
                onChange={setSideBySide}
              />
              <Btn onClick={download} disabled={!image}>
                {t(l, '下載模擬圖(原尺寸 PNG)', 'download the simulation (full-size PNG)')}
              </Btn>
            </Row>
            {severityControl}
            <Note>{PREVALENCE[type][l]}</Note>
            <div
              aria-live="polite"
              style={{
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: sideBySide ? 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))' : '1fr',
              }}
            >
              <figure style={{ display: image && sideBySide ? 'block' : 'none', margin: 0 }}>
                <figcaption className="inst-no" style={{ marginBottom: '0.35rem' }}>
                  {t(l, '原圖', 'as drawn')}
                </figcaption>
                <canvas
                  ref={originalRef}
                  role="img"
                  aria-label={t(l, '原圖', 'the image as drawn')}
                  style={{ border: '1px solid var(--border-3)', height: 'auto', maxWidth: '100%' }}
                />
              </figure>
              <figure style={{ display: image ? 'block' : 'none', margin: 0 }}>
                <figcaption className="inst-no" style={{ marginBottom: '0.35rem' }}>
                  {NAME[type][l]}
                  {severityPct === 100 ? '' : ` · ${severityPct}%`}
                </figcaption>
                <canvas
                  ref={simulatedRef}
                  role="img"
                  aria-label={t(l, `套上 ${NAME[type].zh} 模擬的同一張圖`, `the same image under simulated ${NAME[type].en}`)}
                  style={{ border: '1px solid var(--border-3)', height: 'auto', maxWidth: '100%' }}
                />
              </figure>
            </div>
            {image ? (
              <Note>
                {t(
                  l,
                  `預覽最長邊縮到 ${PREVIEW_MAX} px,拉嚴重度才不會卡;下載的那張是用原始 ${image.w}×${image.h} 重算的。圖片在這個分頁裡用 Canvas 讀寫,沒有送出去。`,
                  `The preview is scaled to ${PREVIEW_MAX} px on its longest side so the slider stays responsive; the download is recomputed at the original ${image.w}×${image.h}. The image is read and written with Canvas in this tab and never sent anywhere.`
                )}
              </Note>
            ) : null}
          </Panel>
        </div>
      )}

      {source === 'palette' && palette.length >= 2 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '模擬後分不出來的組合', 'PAIRS THAT COLLAPSE')}
            aside={<span className="inst-no">{t(l, `最嚴重:${NAME[worst][l]}`, `worst: ${NAME[worst][l]}`)}</span>}
          >
            {DEFICIENCIES.map((kind) => (
              <div key={kind} style={{ marginBottom: '1rem' }}>
                <p className="inst-no" style={{ marginBottom: '0.35rem' }}>
                  {NAME[kind][l]} · {PREVALENCE[kind][l]} ·{' '}
                  {clashes[kind].length === 0
                    ? t(l, '沒有相撞', 'nothing collapses')
                    : t(l, `${clashes[kind].length} 組`, `${clashes[kind].length} pairs`)}
                </p>
                {clashes[kind].length > 0 ? (
                  <Table
                    head={[
                      t(l, '這兩色', 'this pair'),
                      t(l, '模擬後', 'after'),
                      t(l, '原本', 'before'),
                      t(l, '亮度比', 'luminance ratio'),
                      t(l, '還救得回來嗎', 'recoverable'),
                    ]}
                    align={['left', 'right', 'right', 'right', 'left']}
                    rows={clashes[kind].map((clash) => [
                      <span key="p" style={{ display: 'inline-flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Chip hex={clash.hexA} />
                        <Chip hex={clash.hexB} />
                      </span>,
                      <span key="a" className="inst-no">
                        {clash.after.toFixed(3)}
                      </span>,
                      <span key="b" className="inst-no">
                        {clash.before.toFixed(3)}
                      </span>,
                      <span key="r" className="inst-no">
                        {clash.luminanceRatio.toFixed(2)}:1
                      </span>,
                      <span key="f" className="inst-no">
                        {clash.luminanceRatio >= 3
                          ? t(l, '亮度差得夠,灰階也分得出', 'lightness differs — survives greyscale')
                          : t(l, '亮度也差不多,要改形狀或加標籤', 'lightness is close too — change shape or label it')}
                      </span>,
                    ])}
                  />
                ) : null}
              </div>
            ))}
            <Note>
              {t(
                l,
                '「不要只用顏色傳達資訊」要問的不是配色會不會變 —— 一定會變 —— 而是兩個本來代表不同意思的顏色會不會疊到一起。亮度比是最便宜的補救:亮度差得開的一對,印成黑白也還分得出來。',
                'The real question behind "do not rely on colour alone" is not whether the palette shifts — it always shifts — but whether two colours carrying different meanings land on each other. The luminance ratio is the cheapest fix: a pair that differs in lightness survives being printed in greyscale.'
              )}
            </Note>
            <Note>
              {t(
                l,
                '模型是 Viénot–Brettel–Mollon 的二色視投影,矩陣作用在線性 RGB 上(套在 gamma 值上是最常見的錯法,結果看起來很像但中間調差很多)。不做的:色弱的錐細胞位移模型、影像的色票自動抽取。',
                'The model is the Viénot–Brettel–Mollon dichromat projection, applied in linear RGB — applying it to gamma-encoded values is the usual mistake and looks plausible while being badly wrong in the midtones. Not modelled: the shifted cone response of anomalous trichromacy, and palette extraction from an image.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={
          source === 'palette'
            ? [
                { k: t(l, '色票', 'colours'), v: count(palette.length) },
                { k: t(l, '配對', 'pairs'), v: count((palette.length * (palette.length - 1)) / 2) },
                { k: t(l, '相撞', 'collisions'), v: count(totalClashes) },
                { k: t(l, '門檻', 'threshold'), v: usableThreshold.toFixed(3) },
                { k: t(l, '嚴重度', 'severity'), v: `${severityPct}%` },
              ]
            : [
                { k: t(l, '尺寸', 'size'), v: image ? `${image.w}×${image.h}` : '—' },
                { k: t(l, '像素', 'pixels'), v: image ? count(image.w * image.h) : '—' },
                { k: t(l, '檔案', 'file'), v: image ? bytes(image.size) : '—' },
                { k: t(l, '型別', 'deficiency'), v: type },
                { k: t(l, '嚴重度', 'severity'), v: `${severityPct}%` },
              ]
        }
      />
    </div>
  );
}
