'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
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
  DEFAULT_BLOCK,
  MAX_PIXELS,
  MIN_RECT,
  clampRect,
  coveredPixels,
  mapToImage,
  outputName,
  parseHexColor,
  rectFromPoints,
  redactedCopy,
  tooLarge,
  type Mark,
  type MarkKind,
  type Point,
  type Rect,
} from './logic';

type Source = {
  name: string;
  fileBytes: number;
  width: number;
  height: number;
  /** The decoded RGBA bytes of the original. Never mutated. */
  pixels: Uint8Array;
};

type Format = 'png' | 'jpg';

export default function ImageRedact({ l }: ToolProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [kind, setKind] = useState<MarkKind>('solid');
  const [color, setColor] = useState('#000000');
  const [block, setBlock] = useState(String(DEFAULT_BLOCK));
  const [format, setFormat] = useState<Format>('png');
  const [draft, setDraft] = useState<Rect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const dragFrom = useRef<Point | null>(null);

  const blockSize = Math.max(2, Math.min(256, Number.parseInt(block, 10) || DEFAULT_BLOCK));
  const colorOk = (() => {
    try {
      parseHexColor(color);
      return true;
    } catch {
      return false;
    }
  })();

  const take = useCallback(async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setError(null);
    setSaved(null);
    setMarks([]);
    setDraft(null);
    try {
      // createImageBitmap decodes off the main thread and needs no <img> in the
      // document; `from-image` honours the Exif orientation flag so a phone
      // photo is marked up the way it is displayed everywhere else.
      const bitmap = await createImageBitmap(picked, { imageOrientation: 'from-image' });
      const { width, height } = bitmap;
      if (tooLarge(width, height)) {
        bitmap.close();
        setSource(null);
        setError(
          t(
            l,
            `影像 ${width}×${height} 超過 ${(MAX_PIXELS / 1_000_000).toFixed(0)} 百萬像素的上限。每畫一筆遮罩都要重算整張,再大就會卡住分頁,所以在這裡擋掉。`,
            `${width}×${height} is over the ${(MAX_PIXELS / 1_000_000).toFixed(0)} megapixel ceiling. Every mark recomputes the whole buffer, and past this size the tab stalls.`
          )
        );
        return;
      }
      const scratch = document.createElement('canvas');
      scratch.width = width;
      scratch.height = height;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas is unavailable in this browser');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = ctx.getImageData(0, 0, width, height);
      setSource({
        name: picked.name,
        fileBytes: picked.size,
        width,
        height,
        pixels: new Uint8Array(data.data.buffer.slice(0)),
      });
    } catch (problem) {
      setSource(null);
      setError(
        problem instanceof Error
          ? t(l, `無法解碼這個檔案:${problem.message}`, `Could not decode that file: ${problem.message}`)
          : String(problem)
      );
    }
  }, [l]);

  /** The committed result. Recomputed only when the mark list changes. */
  const output = useMemo(() => {
    if (!source) return null;
    return redactedCopy(source.pixels, source.width, source.height, marks);
  }, [source, marks]);

  const frame = useMemo(() => {
    if (!source || !output) return null;
    return new ImageData(new Uint8ClampedArray(output.buffer as ArrayBuffer, 0, output.length), source.width, source.height);
  }, [source, output]);

  // Paint: the committed pixels are blitted, then the in-progress rectangle is
  // outlined on top. The outline is never part of the buffer, so it can never
  // end up in the saved file.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !source || !frame) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(frame, 0, 0);
    if (draft) {
      const scale = Math.max(1, Math.round(Math.max(source.width, source.height) / 600));
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(draft.x, draft.y, draft.w, draft.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = scale;
      ctx.setLineDash([4 * scale, 3 * scale]);
      ctx.strokeRect(draft.x + scale / 2, draft.y + scale / 2, draft.w - scale, draft.h - scale);
      ctx.restore();
    }
  }, [frame, draft, source]);

  const pointerAt = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const element = canvas.current;
    if (!element || !source) return null;
    const box = element.getBoundingClientRect();
    return mapToImage({ x: event.clientX, y: event.clientY }, box, source.width, source.height);
  };

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const at = pointerAt(event);
    if (!at) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragFrom.current = at;
    setSaved(null);
    setDraft({ x: at.x, y: at.y, w: 0, h: 0 });
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragFrom.current) return;
    const at = pointerAt(event);
    if (!at) return;
    setDraft(rectFromPoints(dragFrom.current, at));
  };

  const onUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDraft(null);
    if (!from || !source) return;
    const at = pointerAt(event);
    if (!at) return;
    const rect = clampRect(rectFromPoints(from, at), source.width, source.height);
    // A click, or a drag of a few pixels, is not a redaction — discard it rather
    // than leaving a mark too small to see in the list.
    if (!rect || rect.w < MIN_RECT || rect.h < MIN_RECT) return;
    setMarks((current) => [
      ...current,
      kind === 'solid' ? { kind, rect, color } : { kind, rect, block: blockSize },
    ]);
  };

  const save = () => {
    if (!source || !output) return;
    setError(null);
    const scratch = document.createElement('canvas');
    scratch.width = source.width;
    scratch.height = source.height;
    const ctx = scratch.getContext('2d');
    if (!ctx) {
      setError(t(l, '這個瀏覽器沒有 2D canvas,無法輸出。', 'No 2D canvas in this browser, so nothing can be written.'));
      return;
    }
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(output.buffer as ArrayBuffer, 0, output.length), source.width, source.height),
      0,
      0
    );
    const name = outputName(source.name, format);
    scratch.toBlob(
      (blob) => {
        if (!blob) {
          setError(t(l, '編碼失敗,沒有產生檔案。', 'Encoding failed; no file was produced.'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
        setSaved(t(l, `已輸出 ${name}(${fmtBytes(blob.size)})`, `Wrote ${name} (${fmtBytes(blob.size)})`));
      },
      format === 'png' ? 'image/png' : 'image/jpeg',
      format === 'png' ? undefined : 0.92
    );
  };

  const covered = source ? coveredPixels(source.width, source.height, marks) : 0;
  const total = source ? source.width * source.height : 0;
  const percent = total > 0 ? (covered / total) * 100 : 0;

  return (
    <div>
      <Bench
        leftLabel={t(l, '畫面', 'CANVAS')}
        rightLabel={t(l, '遮罩', 'MARKS')}
        leftAside={
          source ? (
            <span className="inst-no">
              {source.width}×{source.height}
            </span>
          ) : null
        }
        rightAside={source ? <span className="inst-no">{count(marks.length)}</span> : null}
        left={
          <>
            {!source ? (
              <DropZone
                l={l}
                onFiles={take}
                accept="image/*"
                hint={t(l, '把截圖拖進來,或點一下選檔', 'Drop a screenshot here, or click to choose')}
              />
            ) : null}
            {error ? <Note error>{error}</Note> : null}

            {source ? (
              <>
                <Row>
                  <Seg
                    label={t(l, '筆刷', 'Brush')}
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: 'solid', label: t(l, '實心遮罩', 'solid') },
                      { value: 'mosaic', label: t(l, '馬賽克', 'mosaic') },
                    ]}
                  />
                  {kind === 'solid' ? (
                    <Input label={t(l, '顏色', 'Colour')} type="color" value={color} onChange={setColor} invalid={!colorOk} />
                  ) : (
                    <Input
                      label={t(l, '方塊邊長(像素)', 'Block (px)')}
                      type="number"
                      min={2}
                      max={256}
                      value={block}
                      onChange={setBlock}
                    />
                  )}
                  <Btn onClick={() => setMarks((current) => current.slice(0, -1))} disabled={marks.length === 0}>
                    {t(l, '復原上一筆', 'undo')}
                  </Btn>
                  <Btn onClick={() => setMarks([])} disabled={marks.length === 0}>
                    {t(l, '清掉所有遮罩', 'clear marks')}
                  </Btn>
                </Row>

                <div
                  style={{
                    border: '1px solid var(--border-2)',
                    background:
                      'repeating-conic-gradient(var(--border-3) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
                    lineHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  <canvas
                    ref={canvas}
                    width={source.width}
                    height={source.height}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: 'auto',
                      touchAction: 'none',
                      cursor: 'crosshair',
                    }}
                  />
                </div>
                <Note>
                  {t(
                    l,
                    '在畫面上拖曳畫出要遮的區域。畫布顯示的就是輸出的位元組——虛線框只在拖曳中出現,不會進到檔案裡。',
                    'Drag on the image to mark an area. What the canvas shows is what gets written — the dashed outline only exists mid-drag and never reaches the file.'
                  )}
                </Note>

                <Row>
                  <Seg
                    label={t(l, '輸出格式', 'Format')}
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'png', label: 'PNG' },
                      { value: 'jpg', label: 'JPEG 92%' },
                    ]}
                  />
                  <Btn onClick={save} primary disabled={marks.length === 0}>
                    {t(l, '輸出打碼後的檔案', 'export redacted file')}
                  </Btn>
                  <Btn
                    onClick={() => {
                      setSource(null);
                      setMarks([]);
                      setDraft(null);
                      setSaved(null);
                      setError(null);
                    }}
                  >
                    {t(l, '換一張', 'another image')}
                  </Btn>
                </Row>
                {format === 'jpg' ? (
                  <Note>
                    {t(
                      l,
                      'JPEG 會重新壓縮,截圖裡的細字會多一層壓縮痕跡;要保真就選 PNG。兩種輸出都不帶任何 Exif——canvas 編碼器不寫。',
                      'JPEG re-compresses, which shows on small text in screenshots; choose PNG to keep it clean. Neither output carries any Exif — the canvas encoder writes none.'
                    )}
                  </Note>
                ) : null}
                {saved ? <Note>{saved}</Note> : null}
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '選一張截圖。解碼、改像素、重新編碼全在這個分頁完成。',
                  'Choose a screenshot. Decoding, pixel edits and re-encoding all happen in this tab.'
                )}
              </Note>
            )}
          </>
        }
        right={
          marks.length > 0 && source ? (
            <>
              <Table
                head={[t(l, '#', '#'), t(l, '類型', 'kind'), t(l, '區域 x,y,w,h', 'rect x,y,w,h'), '']}
                align={['right', 'left', 'left', 'left']}
                rows={marks.map((mark, index) => [
                  <span key="i" className="inst-no">
                    {index + 1}
                  </span>,
                  <span key="k">
                    {mark.kind === 'solid'
                      ? t(l, '實心', 'solid')
                      : t(l, `馬賽克 ${mark.block}px`, `mosaic ${mark.block}px`)}
                    {mark.kind === 'solid' ? (
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: '0.7em',
                          height: '0.7em',
                          marginLeft: '0.4rem',
                          border: '1px solid var(--border-2)',
                          background: mark.color,
                        }}
                      />
                    ) : null}
                    {mark.kind === 'solid' ? (
                      <span className="inst-no" style={{ marginLeft: '0.3rem' }}>
                        {mark.color}
                      </span>
                    ) : null}
                  </span>,
                  <span key="r" className="inst-no">
                    {mark.rect.x}, {mark.rect.y}, {mark.rect.w}, {mark.rect.h}
                  </span>,
                  <Btn
                    key="x"
                    onClick={() => setMarks((current) => current.filter((_unused, i) => i !== index))}
                  >
                    {t(l, '刪除', 'remove')}
                  </Btn>,
                ])}
              />
              <Note>
                {t(
                  l,
                  `覆蓋 ${count(covered)} 像素,佔全圖 ${percent.toFixed(2)}%。遮罩按順序套用,後畫的蓋在先畫的上面。`,
                  `${count(covered)} pixels covered, ${percent.toFixed(2)}% of the image. Marks apply in order; later ones sit on top.`
                )}
              </Note>
            </>
          ) : (
            <Note>
              {t(
                l,
                '還沒有遮罩。拖曳出第一個區域之後,每一筆會列在這裡,可以單獨刪除。',
                'No marks yet. Drag out an area and each one is listed here, removable on its own.'
              )}
            </Note>
          )
        }
      />

      <Panel label={t(l, '這個工具做了什麼、沒做什麼', 'WHAT THIS DOES AND DOES NOT DO')}>
        <Table
          head={[t(l, '項目', 'item'), t(l, '說明', 'detail')]}
          rows={[
            [
              t(l, '像素真的被改掉', 'the pixels are replaced'),
              t(
                l,
                '遮罩是寫進 RGBA 緩衝區再重新編碼成新檔案,輸出檔裡沒有「被蓋住的那一層」。這跟在 PDF、簡報或 SVG 上疊一個黑色方塊不一樣——那種做法原始像素還在底下,刪掉物件就看得到。',
                'Marks are written into the RGBA buffer and the buffer is re-encoded, so the output has no covered-up layer. That is not what a black box drawn over a PDF, a slide or an SVG does — there the original pixels are still underneath, one object deletion away.'
              ),
            ],
            [
              t(l, '實心遮罩', 'solid'),
              t(
                l,
                '整個區域寫成同一個顏色,原值完全消失,只剩下框的形狀。要遮文字、帳號、身分證號就用這個。',
                'One colour over the whole area. The original values are gone and only the rectangle shape remains. Use this for text, account numbers, ID numbers.'
              ),
            ],
            [
              t(l, '馬賽克', 'mosaic'),
              t(
                l,
                '每個方塊換成該方塊的平均色。平均不可逆,但它是「減少資訊」而不是「抹掉資訊」:方塊平均值還在,字體已知、字串短、方塊又小的時候,對手可以把候選字串照同樣方式平均回來比對。遮文字請用實心。',
                'Each block becomes that block’s mean colour. A mean is not invertible, but this reduces information rather than erasing it: the block means remain, and for short strings in a known font with a small block size an attacker can average candidate renderings the same way and compare. For text, use solid.'
              ),
            ],
            [
              t(l, '輸出的中繼資料', 'metadata in the output'),
              t(
                l,
                'canvas 編碼器不寫 Exif,所以輸出檔沒有相機、時間或 GPS。要檢查原檔帶了什麼,用「EXIF 檢視與移除」。',
                'The canvas encoder writes no Exif, so the output carries no camera, time or GPS. To see what the original carried, use the EXIF tool.'
              ),
            ],
            [
              t(l, '不做的事', 'not done here'),
              t(
                l,
                '不做模糊(高斯模糊在小半徑下可被反卷積還原,不是遮蔽手段)、不做自動偵測人臉或文字、不改原始檔案。',
                'No blur — a small-radius Gaussian can be deconvolved, so it is not redaction — no automatic face or text detection, and the original file is never modified.'
              ),
            ],
            [
              t(l, '尺寸上限', 'size ceiling'),
              t(
                l,
                `${(MAX_PIXELS / 1_000_000).toFixed(0)} 百萬像素。超過就會拒收,因為每畫一筆都要重算整張緩衝區。`,
                `${(MAX_PIXELS / 1_000_000).toFixed(0)} megapixels. Larger files are refused because every mark recomputes the whole buffer.`
              ),
            ],
          ]}
        />
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '原始檔', 'source'), v: source ? fmtBytes(source.fileBytes) : '—' },
          { k: t(l, '尺寸', 'size'), v: source ? `${source.width}×${source.height}` : '—' },
          { k: t(l, '像素', 'pixels'), v: source ? count(total) : '—' },
          { k: t(l, '遮罩', 'marks'), v: count(marks.length) },
          { k: t(l, '覆蓋', 'covered'), v: source ? `${count(covered)} (${percent.toFixed(2)}%)` : '—' },
          { k: t(l, '輸出', 'output'), v: format === 'png' ? 'PNG' : 'JPEG 92%' },
        ]}
      />
    </div>
  );
}
