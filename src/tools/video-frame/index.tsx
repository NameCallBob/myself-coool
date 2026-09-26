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
  DEFAULT_FPS,
  FPS_RANGE,
  clampTime,
  formatTimecode,
  frameCount,
  frameFileName,
  frameIndexAt,
  frameMime,
  parseFps,
  parseTimecode,
  scaleToLongestSide,
  snapToFrame,
  stepFrames,
  type FrameFormat,
} from './logic';

type Clip = {
  name: string;
  fileBytes: number;
  type: string;
  url: string;
};

type Grab = {
  url: string;
  bytes: number;
  type: string;
  width: number;
  height: number;
  at: number;
  frame: number;
  name: string;
};

/** A seek that never returns would leave the button stuck; give up and say so. */
const SEEK_TIMEOUT_MS = 4000;

export default function VideoFrame({ l }: ToolProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const urls = useRef<Set<string>>(new Set());

  const [clip, setClip] = useState<Clip | null>(null);
  const [duration, setDuration] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [at, setAt] = useState(0);
  const [fpsText, setFpsText] = useState(String(DEFAULT_FPS));
  const [jumpTo, setJumpTo] = useState('');
  const [format, setFormat] = useState<FrameFormat>('png');
  const [quality, setQuality] = useState('92');
  const [longest, setLongest] = useState('0');
  const [grab, setGrab] = useState<Grab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const fps = parseFps(fpsText) ?? DEFAULT_FPS;
  const fpsBad = parseFps(fpsText) === null;
  const qualityPct = Math.min(100, Math.max(1, Math.round(Number(quality) || 92)));
  const longestPx = Math.max(0, Math.round(Number(longest) || 0));
  const frame = useMemo(() => frameIndexAt(at, fps), [at, fps]);
  const frames = useMemo(() => frameCount(duration, fps), [duration, fps]);

  const outSize = useMemo(() => {
    if (!size.width || !size.height) return { width: 0, height: 0 };
    return scaleToLongestSide(size, longestPx);
  }, [size, longestPx]);

  const clearGrab = useCallback(() => {
    setGrab((current) => {
      if (current) drop(current.url);
      return null;
    });
  }, []);

  const takeFile = useCallback(
    (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      setError(null);
      clearGrab();
      setClip((current) => {
        if (current) drop(current.url);
        return {
          name: picked.name,
          fileBytes: picked.size,
          type: picked.type || t(l, '未標示', 'unstated'),
          url: track(URL.createObjectURL(picked)),
        };
      });
      setDuration(0);
      setSize({ width: 0, height: 0 });
      setAt(0);
    },
    [clearGrab, l]
  );

  /** Wait for the element to actually land on the requested time. */
  const seek = (element: HTMLVideoElement, time: number) =>
    new Promise<void>((resolve) => {
      if (Math.abs(element.currentTime - time) < 1e-4) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        element.removeEventListener('seeked', finish);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, SEEK_TIMEOUT_MS);
      element.addEventListener('seeked', finish, { once: true });
      element.currentTime = time;
    });

  const goTo = async (time: number) => {
    const element = video.current;
    if (!element || duration <= 0) return;
    const target = clampTime(time, duration);
    element.pause();
    await seek(element, target);
    setAt(element.currentTime);
  };

  const step = (frameDelta: number) => {
    const element = video.current;
    if (!element || duration <= 0) return;
    void goTo(stepFrames(element.currentTime, frameDelta, fps, duration));
  };

  /**
   * Copy the frame the element is currently showing onto a canvas.
   *
   * `drawImage(video, …)` takes whatever is on screen right now, which is why
   * the stepping buttons wait for `seeked` first: grabbing during a seek gives
   * you the frame you were on before, and it looks correct.
   */
  const capture = async () => {
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) return;
    setBusy(true);
    setError(null);
    try {
      element.pause();
      const target = scaleToLongestSide(
        { width: element.videoWidth, height: element.videoHeight },
        longestPx
      );
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t(l, '這個瀏覽器沒有給 2D 繪圖環境。', 'No 2D context available.'));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(element, 0, 0, target.width, target.height);

      const mime = frameMime(format);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, format === 'jpeg' ? qualityPct / 100 : undefined);
      });
      if (!blob || blob.size === 0) {
        throw new Error(
          t(
            l,
            '瀏覽器沒有交出影像。多半是這個影片有 DRM 保護,或解碼器拒絕輸出畫面。',
            'The browser produced no image — usually DRM-protected video, or a decoder that refuses read-back.'
          )
        );
      }
      const time = element.currentTime;
      clearGrab();
      setGrab({
        url: track(URL.createObjectURL(blob)),
        bytes: blob.size,
        type: blob.type,
        width: canvas.width,
        height: canvas.height,
        at: time,
        frame: frameIndexAt(time, fps),
        name: frameFileName(clip?.name ?? 'frame', time, format, frameIndexAt(time, fps)),
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
    if (!grab) return;
    const anchor = document.createElement('a');
    anchor.href = grab.url;
    anchor.download = grab.name;
    anchor.click();
  };

  const jump = () => {
    const parsed = parseTimecode(jumpTo);
    if (parsed === null) {
      setError(
        t(
          l,
          '時間碼看不懂。寫成 12、12.5、1:02.250 或 01:01:01.007 都可以。',
          'Could not read that timecode. Use 12, 12.5, 1:02.250 or 01:01:01.007.'
        )
      );
      return;
    }
    setError(null);
    void goTo(parsed);
  };

  const clearAll = () => {
    const element = video.current;
    if (element) element.pause();
    clearGrab();
    setClip((current) => {
      if (current) drop(current.url);
      return null;
    });
    setDuration(0);
    setSize({ width: 0, height: 0 });
    setAt(0);
    setJumpTo('');
    setError(null);
  };

  const ready = duration > 0 && size.width > 0;

  return (
    <div>
      <Bench
        leftLabel={t(l, '影片', 'CLIP')}
        rightLabel={t(l, '擷取的影格', 'FRAME')}
        leftAside={
          <span className="inst-no">
            {ready ? `${size.width}×${size.height}` : '—'}
          </span>
        }
        rightAside={
          <span className="inst-no">{ready ? formatTimecode(at, { hours: 'always' }) : '—'}</span>
        }
        left={
          <>
            {clip ? null : (
              <DropZone
                l={l}
                onFiles={takeFile}
                accept="video/*"
                hint={t(
                  l,
                  '把影片拖進來,或點一下選檔',
                  'Drop a video here, or click to choose'
                )}
              />
            )}

            {clip ? (
              <div className="inst-field">
                <video
                  ref={video}
                  src={clip.url}
                  controls
                  playsInline
                  preload="metadata"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '48vh',
                    background: '#000',
                    border: '1px solid var(--border-2)',
                  }}
                  onLoadedMetadata={(event) => {
                    const element = event.currentTarget;
                    setDuration(Number.isFinite(element.duration) ? element.duration : 0);
                    setSize({ width: element.videoWidth, height: element.videoHeight });
                    setAt(element.currentTime);
                  }}
                  onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
                  onSeeked={(event) => setAt(event.currentTarget.currentTime)}
                  onError={() =>
                    setError(
                      t(
                        l,
                        '這個瀏覽器播不動這個檔。容器或編碼不支援(H.265、ProRes、部分 MKV 都常見),換 MP4/H.264 或 WebM 再試。',
                        'This browser cannot play the file — an unsupported container or codec (H.265, ProRes and some MKV are common). Try MP4/H.264 or WebM.'
                      )
                    )
                  }
                />
                <p className="inst-hint">
                  {clip.name} · {fmtBytes(clip.fileBytes)} · {clip.type}
                  {ready
                    ? ` · ${formatTimecode(duration, { hours: 'always' })}`
                    : ` · ${t(l, '讀取中', 'loading')}`}
                </p>
              </div>
            ) : (
              <Note>
                {t(
                  l,
                  '影片用 blob: URL 直接餵給 <video>,沒有上傳、沒有轉檔。畫面是從播放中的元素複製到 canvas 的。',
                  'The file is handed to <video> as a blob: URL — nothing is uploaded or transcoded. The frame is copied from the playing element onto a canvas.'
                )}
              </Note>
            )}

            <Row>
              <Btn onClick={() => step(-10)} disabled={!ready}>
                −10
              </Btn>
              <Btn onClick={() => step(-1)} disabled={!ready}>
                {t(l, '−1 格', '−1 frame')}
              </Btn>
              <Btn onClick={() => step(1)} disabled={!ready}>
                {t(l, '+1 格', '+1 frame')}
              </Btn>
              <Btn onClick={() => step(10)} disabled={!ready}>
                +10
              </Btn>
              <Btn onClick={() => void goTo(snapToFrame(at, fps))} disabled={!ready}>
                {t(l, '對到影格起點', 'snap to frame')}
              </Btn>
              {clip ? <Btn onClick={clearAll}>{t(l, '換一支', 'close')}</Btn> : null}
            </Row>

            <Row>
              <Input
                label={t(l, '跳到時間碼', 'Jump to timecode')}
                hint={t(l, '12 / 12.5 / 1:02.250 / 01:01:01.007', '12 / 12.5 / 1:02.250 / 01:01:01.007')}
                value={jumpTo}
                onChange={setJumpTo}
                placeholder="1:02.250"
              />
              <Btn onClick={jump} disabled={!ready}>
                {t(l, '跳轉', 'go')}
              </Btn>
            </Row>

            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          <>
            <Row>
              <Btn onClick={capture} primary disabled={!ready || busy}>
                {busy ? t(l, '擷取中', 'grabbing') : t(l, '擷取這一格', 'grab this frame')}
              </Btn>
              <Btn onClick={save} disabled={!grab}>
                {t(l, '存檔', 'save')}
              </Btn>
            </Row>

            {grab ? (
              <div className="inst-field">
                <div
                  aria-live="polite"
                  style={{
                    border: '1px solid var(--border-2)',
                    padding: '0.5rem',
                    background: 'var(--bg-base)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL built from the canvas in this tab */}
                  <img
                    src={grab.url}
                    alt={t(l, '擷取的影格預覽', 'Captured frame preview')}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '48vh',
                      margin: '0 auto',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <Table
                  head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                  rows={[
                    [t(l, '時間碼', 'timecode'), formatTimecode(grab.at, { hours: 'always' })],
                    [t(l, '秒數', 'seconds'), grab.at.toFixed(3)],
                    [
                      t(l, '影格序號', 'frame index'),
                      t(l, `第 ${count(grab.frame)} 格(按 ${fps} fps 推算)`, `${count(grab.frame)} at ${fps} fps`),
                    ],
                    [t(l, '尺寸', 'size'), `${grab.width}×${grab.height}`],
                    [t(l, '格式', 'type'), grab.type || '?'],
                    [t(l, '檔案大小', 'file size'), fmtBytes(grab.bytes)],
                    [t(l, '存檔檔名', 'file name'), grab.name],
                  ]}
                />
              </div>
            ) : (
              <Note>
                {ready
                  ? t(
                      l,
                      '把畫面停在要的那一格,按「擷取這一格」。抓的是元素上正在顯示的那一幀。',
                      'Park the video on the frame you want and grab it. What you get is the frame on screen.'
                    )
                  : t(l, '先開一支影片。', 'Open a video first.')}
              </Note>
            )}
          </>
        }
      />

      <Panel label={t(l, '影格步進', 'FRAME STEPPING')}>
        <Row>
          <Input
            label={t(l, '影格率 fps', 'Frame rate fps')}
            hint={t(
              l,
              `1–${FPS_RANGE.max},可以寫 30000/1001 這種比值。`,
              `1–${FPS_RANGE.max}; a ratio such as 30000/1001 also works.`
            )}
            value={fpsText}
            onChange={setFpsText}
            invalid={fpsBad}
            placeholder="30"
          />
        </Row>
        {fpsBad ? (
          <Note error>
            {t(
              l,
              `讀不到這個影格率,暫時用 ${DEFAULT_FPS} 計算。`,
              `That frame rate does not parse; falling back to ${DEFAULT_FPS}.`
            )}
          </Note>
        ) : null}
        <Note>
          {t(
            l,
            'HTML 影片不提供影格率,所以上面這個數字是你告訴它的,不是從檔案讀出來的。一格 = 1/fps 秒:定影格率的片子填對就準;手機錄影與螢幕錄影多是變動影格率,步進會偏移。真的要逐格,看畫面有沒有變比看數字可靠。',
            'HTML video does not expose a frame rate, so the number above is the one you supplied, not one read from the file. A step is 1/fps seconds: exact for constant-frame-rate clips, approximate for the variable-frame-rate output of phones and screen recorders. When it matters, trust the picture changing rather than the number.'
          )}
        </Note>
        <Note>
          {t(
            l,
            '瀏覽器會把時間對到最近能解出來的位置,所以步進後的實際時間可能跟算出來的差幾毫秒——上面顯示的時間碼是元素回報的真實值。',
            'The browser lands on the nearest position it can decode, so the real time after a step can differ by a few milliseconds. The timecode shown is what the element reports, not what was requested.'
          )}
        </Note>
      </Panel>

      <Panel label={t(l, '輸出', 'OUTPUT')}>
        <Row>
          <Seg
            label={t(l, '格式', 'Format')}
            value={format}
            onChange={(next) => {
              setFormat(next);
              clearGrab();
            }}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
            ]}
          />
          {format === 'jpeg' ? (
            <Input
              label={t(l, '品質 1–100', 'Quality 1–100')}
              value={quality}
              type="number"
              min={1}
              max={100}
              step={1}
              onChange={(next) => {
                setQuality(next);
                clearGrab();
              }}
            />
          ) : null}
          <Input
            label={t(l, '長邊像素(0 = 原生)', 'Longest side px (0 = native)')}
            value={longest}
            type="number"
            min={0}
            step={1}
            onChange={(next) => {
              setLongest(next);
              clearGrab();
            }}
          />
        </Row>
        <Note>
          {ready
            ? t(
                l,
                `原生 ${size.width}×${size.height},輸出 ${outSize.width}×${outSize.height}。`,
                `Native ${size.width}×${size.height}, output ${outSize.width}×${outSize.height}.`
              )
            : t(l, '開檔後這裡會顯示原生與輸出尺寸。', 'Native and output sizes appear once a file is open.')}
        </Note>
        <Note>
          {format === 'png'
            ? t(
                l,
                'PNG 無損,但它壓的是解碼後的畫面——影片本身已經有壓縮痕跡,PNG 只是把那些痕跡完整保留下來。',
                'PNG is lossless, but what it preserves is the decoded picture: the video was already compressed, and PNG keeps those artefacts exactly.'
              )
            : t(
                l,
                'JPEG 在已經壓過的畫面上再壓一次,字邊會更糊。要拿去比對細節就用 PNG。',
                'JPEG compresses an already-compressed picture again, which softens edges further. Use PNG when the detail matters.'
              )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '解析度', 'resolution'), v: ready ? `${size.width}×${size.height}` : '—' },
          { k: t(l, '長度', 'duration'), v: ready ? formatTimecode(duration, { hours: 'always' }) : '—' },
          { k: t(l, '位置', 'position'), v: ready ? formatTimecode(at, { hours: 'always' }) : '—' },
          {
            k: t(l, '影格', 'frame'),
            v: ready ? `${count(frame)} / ${count(frames)}` : '—',
          },
          { k: t(l, '讀入', 'read'), v: clip ? fmtBytes(clip.fileBytes) : '—' },
          { k: t(l, '輸出', 'written'), v: grab ? fmtBytes(grab.bytes) : '—' },
        ]}
      />
    </div>
  );
}
