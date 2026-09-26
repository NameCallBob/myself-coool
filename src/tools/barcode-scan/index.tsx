'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ToolProps } from '../types';
import {
  Btn,
  CopyButton,
  DropZone,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  HISTORY_LIMIT,
  addScan,
  assessSupport,
  classifyPayload,
  formatFamily,
  historyToTsv,
  type Payload,
  type Scan,
  type UrlWarning,
} from './logic';

/* ── The API, typed locally ────────────────── */

/**
 * `BarcodeDetector` is not in TypeScript's DOM library, because it is not a
 * universally implemented API. Declaring the slice we use keeps the feature
 * test honest: nothing here assumes the constructor exists.
 */
type DetectedBarcode = { rawValue: string; format: string };

type DetectorLike = { detect(source: ImageBitmapSource): Promise<DetectedBarcode[]> };

type DetectorConstructor = {
  new (options?: { formats?: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

function detectorConstructor(): DetectorConstructor | null {
  const holder = window as unknown as { BarcodeDetector?: DetectorConstructor };
  return typeof holder.BarcodeDetector === 'function' ? holder.BarcodeDetector : null;
}

/* ── Facts, read through a store ───────────── */

const noSubscribe = () => () => {};
const readDetector = () => typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function';
const readMediaDevices = () =>
  typeof navigator.mediaDevices !== 'undefined' && typeof navigator.mediaDevices.getUserMedia === 'function';
const readSecure = () => window.isSecureContext;
const falseOnServer = () => false;

function useFlag(read: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, read, falseOnServer);
}

/* ── Copy for the codes logic returns ──────── */

function reasonText(l: Loc, reason: string): string {
  if (reason === 'no-detector') {
    return t(
      l,
      '這個瀏覽器沒有 BarcodeDetector。Chrome、Edge 與 Android 版 Chromium 有;Safari 與 Firefox 目前沒有,這件工具在那裡不能掃。',
      'This browser has no BarcodeDetector. Chrome, Edge and Chromium on Android do; Safari and Firefox do not, so this tool cannot scan there.'
    );
  }
  if (reason === 'no-media-devices') {
    return t(l, '沒有 mediaDevices.getUserMedia,拿不到相機,只能掃圖檔。', 'No mediaDevices.getUserMedia, so there is no camera — image files only.');
  }
  if (reason === 'insecure-context') {
    return t(
      l,
      '目前不是安全內容(https 或 localhost),瀏覽器不會給相機權限。掃圖檔不受影響。',
      'Not a secure context (https or localhost), so the browser will not grant camera access. Scanning an image file still works.'
    );
  }
  return t(l, '問不到支援格式清單,按下方按鈕再試一次。', 'The supported-format list could not be read; try the button below.');
}

const WARNING_TEXT: Record<UrlWarning, { zh: string; en: string }> = {
  'non-web-scheme': {
    zh: '不是 http/https,會交給裝置上的某個 app 處理。',
    en: 'Not http/https — some app on the device would handle it.',
  },
  userinfo: {
    zh: '網址裡夾帶帳密欄位(user:pass@),常見於偽裝真實網域的手法。',
    en: 'The URL carries a user:pass@ section, a common way to disguise the real domain.',
  },
  punycode: {
    zh: '主機名稱是 punycode(xn--),也就是非 ASCII 網域,可能和你以為的網域長得一樣。',
    en: 'The hostname is punycode (xn--) — a non-ASCII domain that may look identical to the one you expect.',
  },
  'ip-host': {
    zh: '直接連 IP,沒有網域也沒有憑證主體可以核對。',
    en: 'It points at a bare IP: no domain and no certificate subject to check.',
  },
  'unusual-port': { zh: '用了非 80/443 的埠。', en: 'A port other than 80 or 443.' },
  'no-tls': { zh: 'http 明文連線。', en: 'Plain http, not encrypted.' },
  'very-long': { zh: '超過 512 字元,內容可能藏在網址裡。', en: 'Over 512 characters — the payload may be hidden in the URL.' },
};

function kindLabel(l: Loc, payload: Payload): string {
  switch (payload.kind) {
    case 'url':
      return t(l, '網址', 'URL');
    case 'wifi':
      return t(l, 'WiFi 設定', 'WiFi config');
    case 'contact':
      return payload.source === 'vcard' ? 'vCard' : 'MECARD';
    case 'calendar':
      return t(l, '行事曆事件', 'Calendar event');
    case 'mailto':
      return t(l, '郵件', 'Email');
    case 'tel':
      return t(l, '電話', 'Phone');
    case 'sms':
      return t(l, '簡訊', 'SMS');
    case 'geo':
      return t(l, '座標', 'Coordinates');
    case 'otp':
      return t(l, 'TOTP 設定', 'TOTP setup');
    case 'gtin':
      return payload.verdict.kind;
    default:
      return t(l, '純文字', 'Plain text');
  }
}

/** Rows for the interpretation table, per payload type. */
function payloadRows(l: Loc, payload: Payload): [string, string][] {
  switch (payload.kind) {
    case 'wifi':
      return [
        [t(l, '網路名稱', 'SSID'), payload.wifi.ssid],
        [t(l, '加密', 'security'), payload.wifi.auth],
        [t(l, '密碼', 'password'), payload.wifi.password === '' ? t(l, '(無)', '(none)') : payload.wifi.password],
        [t(l, '隱藏網路', 'hidden'), payload.wifi.hidden ? t(l, '是', 'yes') : t(l, '否', 'no')],
        ...(payload.wifi.extras.length > 0
          ? ([[t(l, '未解讀的欄位', 'uninterpreted keys'), payload.wifi.extras.join(', ')]] as [string, string][])
          : []),
      ];
    case 'contact':
      return [
        [t(l, '姓名', 'name'), payload.contact.name],
        [t(l, '公司', 'organization'), payload.contact.organization],
        [t(l, '職稱', 'title'), payload.contact.title],
        [t(l, '電話', 'phone'), payload.contact.phones.join(' / ')],
        [t(l, 'Email', 'email'), payload.contact.emails.join(' / ')],
        [t(l, '網址', 'url'), payload.contact.urls.join(' / ')],
        [t(l, '地址', 'address'), payload.contact.addresses.join(' / ')],
        [t(l, '備註', 'note'), payload.contact.note],
      ].filter((row) => row[1] !== '') as [string, string][];
    case 'calendar':
      return payload.properties.map((property) => [property.name, property.value] as [string, string]);
    case 'mailto':
      return [
        [t(l, '收件者', 'to'), payload.address],
        [t(l, '主旨', 'subject'), payload.subject],
        [t(l, '內容', 'body'), payload.body],
      ].filter((row) => row[1] !== '') as [string, string][];
    case 'tel':
      return [[t(l, '號碼', 'number'), payload.number]];
    case 'sms':
      return [
        [t(l, '號碼', 'number'), payload.number],
        [t(l, '內容', 'body'), payload.body],
      ];
    case 'geo':
      return [
        [t(l, '緯度', 'latitude'), Number.isFinite(payload.latitude) ? String(payload.latitude) : '—'],
        [t(l, '經度', 'longitude'), Number.isFinite(payload.longitude) ? String(payload.longitude) : '—'],
      ];
    case 'otp':
      return [
        [t(l, '發行者', 'issuer'), payload.issuer],
        [t(l, '帳號', 'account'), payload.account],
        [
          t(l, '密鑰', 'secret'),
          t(l, '不顯示。要產生驗證碼請用 TOTP 那件工具。', 'Not shown. Use the TOTP tool to generate codes.'),
        ],
      ];
    case 'gtin':
      return [
        [t(l, '編號', 'number'), payload.value],
        [
          t(l, '檢查碼', 'check digit'),
          payload.verdict.valid
            ? t(l, `${payload.verdict.given} — 通過`, `${payload.verdict.given} — valid`)
            : t(
                l,
                `${payload.verdict.given} — 不符,應為 ${payload.verdict.expected}`,
                `${payload.verdict.given} — wrong, should be ${payload.verdict.expected}`
              ),
        ],
        ...(payload.isbn10 ? ([['ISBN-10', payload.isbn10]] as [string, string][]) : []),
      ];
    case 'url':
      return [[t(l, '網址', 'URL'), payload.url]];
    default:
      return [];
  }
}

/**
 * QR and barcode scanner.
 *
 * The decoding is the browser's `BarcodeDetector`; the tool's job is to say
 * clearly when that does not exist (Safari and Firefox), to keep the camera
 * under an explicit switch, and to interpret what came back — including
 * telling you when a scanned link is shaped like a trap. Nothing is recorded,
 * nothing is stored, and no scanned value is turned into a clickable link.
 */
export default function BarcodeScan({ l }: ToolProps) {
  const detector = useFlag(readDetector);
  const mediaDevices = useFlag(readMediaDevices);
  const secureContext = useFlag(readSecure);
  const [formats, setFormats] = useState<string[] | null>(null);

  const support = useMemo(
    () => assessSupport({ detector, formats, mediaDevices, secureContext }),
    [detector, formats, mediaDevices, secureContext]
  );

  const [history, setHistory] = useState<Scan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);
  const failures = useRef(0);
  const instance = useRef<DetectorLike | null>(null);
  /** Mirrors imageUrl so the unmount cleanup can revoke it without state. */
  const lastImageUrl = useRef<string | null>(null);

  const getDetector = useCallback((): DetectorLike | null => {
    if (instance.current) return instance.current;
    const Constructor = detectorConstructor();
    if (!Constructor) return null;
    try {
      // No format filter: restricting the list only ever hides a code someone
      // is holding up to the camera.
      instance.current = new Constructor();
      return instance.current;
    } catch {
      return null;
    }
  }, []);

  const loadFormats = useCallback(async () => {
    const Constructor = detectorConstructor();
    if (!Constructor?.getSupportedFormats) {
      setFormats([]);
      return;
    }
    try {
      setFormats(await Constructor.getSupportedFormats());
    } catch {
      setFormats([]);
    }
  }, []);

  /** Tear the camera down. Touches refs only, so it is safe from a cleanup. */
  const release = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (stream.current) {
      for (const track of stream.current.getTracks()) track.stop();
      stream.current = null;
    }
    if (video.current) video.current.srcObject = null;
    busy.current = false;
    failures.current = 0;
  }, []);

  // Cleanup only: the camera must not survive a navigation away from the tool,
  // and the preview's blob URL should not outlive the component either.
  useEffect(
    () => () => {
      release();
      if (lastImageUrl.current) URL.revokeObjectURL(lastImageUrl.current);
    },
    [release]
  );

  const stop = useCallback(() => {
    release();
    setRunning(false);
    setStatus(t(l, '相機已關閉。', 'Camera stopped.'));
  }, [l, release]);

  const tick = useCallback(() => {
    const element = video.current;
    const scanner = getDetector();
    if (!element || !scanner || busy.current) return;
    if (element.readyState < 2 || element.videoWidth === 0) return;
    busy.current = true;
    scanner
      .detect(element)
      .then((found) => {
        failures.current = 0;
        if (found.length === 0) return;
        setHistory((current) => {
          let next = current;
          for (const code of found) {
            if (code.rawValue === '') continue;
            next = addScan(next, { value: code.rawValue, format: code.format || 'unknown' });
          }
          return next;
        });
      })
      .catch((problem: unknown) => {
        failures.current += 1;
        // A few failures happen while the camera warms up; a run of them means
        // the detector is not going to work, so say so and stop the loop
        // rather than burning battery on it.
        if (failures.current >= 10) {
          release();
          setRunning(false);
          setError(
            t(
              l,
              `相機畫面解碼連續失敗,已停止:${problem instanceof Error ? problem.message : String(problem)}`,
              `Decoding the camera frames failed repeatedly and was stopped: ${problem instanceof Error ? problem.message : String(problem)}`
            )
          );
        }
      })
      .finally(() => {
        busy.current = false;
      });
  }, [getDetector, l, release]);

  const start = useCallback(async () => {
    setError(null);
    if (!getDetector()) {
      setError(reasonText(l, 'no-detector'));
      return;
    }
    if (formats === null) void loadFormats();
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.current = media;
      const element = video.current;
      if (element) {
        element.srcObject = media;
        await element.play().catch(() => undefined);
      }
      // Four looks a second: enough to feel immediate, far cheaper than every
      // frame, and it leaves the phone cool enough to hold.
      timer.current = setInterval(tick, 250);
      setRunning(true);
      setStatus(t(l, '相機開著,對準條碼。', 'Camera on — point it at a code.'));
    } catch (problem: unknown) {
      release();
      setRunning(false);
      const name = problem instanceof DOMException ? problem.name : '';
      setError(
        name === 'NotAllowedError'
          ? t(
              l,
              '相機權限被拒。要用相機掃就得在瀏覽器的網站設定裡把相機打開,或者改用下面的圖檔掃描。',
              'Camera permission was refused. Allow the camera in the browser site settings, or scan an image file below instead.'
            )
          : name === 'NotFoundError'
            ? t(l, '找不到相機裝置。', 'No camera device was found.')
            : t(
                l,
                `開相機失敗:${problem instanceof Error ? problem.message : String(problem)}`,
                `Could not start the camera: ${problem instanceof Error ? problem.message : String(problem)}`
              )
      );
    }
  }, [facing, formats, getDetector, l, loadFormats, release, tick]);

  const scanFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const file = files[0];
      if (!file) return;
      if (files.length > 1) {
        setStatus(
          t(
            l,
            `一次掃一張,這次用的是 ${file.name}。`,
            `One image at a time — ${file.name} was used.`
          )
        );
      }
      const scanner = getDetector();
      if (!scanner) {
        setError(reasonText(l, 'no-detector'));
        return;
      }
      if (formats === null) void loadFormats();
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        setError(
          t(
            l,
            '這個瀏覽器無法解碼這個圖檔。HEIC 與部分 TIFF 不在瀏覽器的解碼範圍內。',
            'This browser cannot decode the image. HEIC and some TIFF variants are outside what browsers decode.'
          )
        );
        return;
      }
      setImageUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        const next = URL.createObjectURL(file);
        lastImageUrl.current = next;
        return next;
      });
      try {
        const found = await scanner.detect(bitmap);
        if (found.length === 0) {
          setStatus(
            t(
              l,
              `在 ${file.name} 裡沒有找到條碼。試試裁切到只剩條碼、提高對比,或換一張清楚一點的。`,
              `No code was found in ${file.name}. Try cropping to the code, raising the contrast, or a sharper photo.`
            )
          );
          return;
        }
        setHistory((current) => {
          let next = current;
          for (const code of found) {
            if (code.rawValue === '') continue;
            next = addScan(next, { value: code.rawValue, format: code.format || 'unknown' });
          }
          return next;
        });
        setStatus(
          t(l, `在 ${file.name} 裡讀到 ${found.length} 個碼。`, `Read ${found.length} code(s) from ${file.name}.`)
        );
      } catch (problem: unknown) {
        setError(
          t(
            l,
            `解碼失敗:${problem instanceof Error ? problem.message : String(problem)}`,
            `Decoding failed: ${problem instanceof Error ? problem.message : String(problem)}`
          )
        );
      } finally {
        bitmap.close();
      }
    },
    [formats, getDetector, l, loadFormats]
  );

  const clear = useCallback(() => {
    setHistory([]);
    setStatus(null);
    setError(null);
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      lastImageUrl.current = null;
      return null;
    });
  }, []);

  const latest = history[0] ?? null;
  const payload = useMemo(() => (latest ? classifyPayload(latest.value) : null), [latest]);
  const rows = useMemo(() => (payload ? payloadRows(l, payload) : []), [l, payload]);
  const readings = history.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div>
      <Panel
        label={t(l, '瀏覽器支援', 'BROWSER SUPPORT')}
        aside={
          <span className="inst-no">
            {support.camera
              ? t(l, '相機 + 圖檔', 'camera + image')
              : support.image
                ? t(l, '僅圖檔', 'image only')
                : t(l, '不支援', 'unsupported')}
          </span>
        }
      >
        {support.reasons.length === 0 ? (
          <Note>
            {t(
              l,
              'BarcodeDetector 可用,相機與圖檔兩條路都能掃。解碼是瀏覽器內建的,畫面不離開這台裝置。',
              'BarcodeDetector is available: both the camera and image files work. Decoding is the browser’s own and nothing leaves this device.'
            )}
          </Note>
        ) : (
          support.reasons.map((reason) => (
            <Note key={reason} error={reason === 'no-detector'}>
              {reasonText(l, reason)}
            </Note>
          ))
        )}
        <Row>
          <Btn onClick={() => void loadFormats()} disabled={!detector}>
            {t(l, '查支援格式', 'list formats')}
          </Btn>
          {formats !== null ? (
            <span className="inst-no">
              {formats.length === 0
                ? t(l, '沒回報任何格式', 'no formats reported')
                : `${count(formats.length)} — ${formats.join(', ')}`}
            </span>
          ) : null}
        </Row>
        {support.unknownFormats.length > 0 ? (
          <Note>
            {t(
              l,
              `這個瀏覽器還回報了規格之外的格式:${support.unknownFormats.join(', ')}。`,
              `This browser also reports formats outside the spec: ${support.unknownFormats.join(', ')}.`
            )}
          </Note>
        ) : null}
      </Panel>

      <div className="mt-8">
        <Panel
          label={t(l, '相機', 'CAMERA')}
          aside={
            <span className="inst-no">
              {running ? t(l, '開啟中', 'live') : t(l, '關閉', 'off')}
            </span>
          }
        >
          <Row>
            {running ? (
              <Btn onClick={stop} primary>
                {t(l, '關閉相機', 'stop camera')}
              </Btn>
            ) : (
              <Btn onClick={() => void start()} primary disabled={!support.camera}>
                {t(l, '開啟相機', 'start camera')}
              </Btn>
            )}
            <Seg
              label={t(l, '鏡頭', 'Lens')}
              value={facing}
              onChange={(next) => {
                setFacing(next);
                if (running) {
                  // A facingMode change needs a new stream; restart rather than
                  // pretend the switch took effect.
                  release();
                  setRunning(false);
                  setStatus(t(l, '鏡頭已切換,再按開啟相機。', 'Lens changed — press start camera again.'));
                }
              }}
              options={[
                { value: 'environment', label: t(l, '後', 'rear') },
                { value: 'user', label: t(l, '前', 'front') },
              ]}
            />
          </Row>

          <div
            style={{
              border: '1px solid var(--rule)',
              aspectRatio: '4 / 3',
              maxWidth: '32rem',
              maxHeight: '60vh',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            {/* No <track>: a live camera preview carries no audio and has
                nothing to caption. */}
            <video
              ref={video}
              muted
              playsInline
              aria-label={t(l, '相機預覽', 'Camera preview')}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: running ? 'block' : 'none',
              }}
            />
            {running ? null : (
              <span className="inst-hint" style={{ padding: '1rem', textAlign: 'center' }}>
                {support.camera
                  ? t(l, '相機關閉中。按上面的按鈕才會開始要求權限。', 'Camera off. Permission is only requested when you press start.')
                  : t(l, '這個瀏覽器不能用相機掃,請改用下面的圖檔。', 'The camera path is unavailable here — use an image file below.')}
              </span>
            )}
          </div>
          <Note>
            {t(
              l,
              '畫面只送進瀏覽器的解碼器,不錄製、不存檔、不上傳。關閉相機會把 MediaStream 的軌道停掉(手機上的鏡頭指示燈會跟著熄),離開這一頁也會。',
              'Frames go only to the browser’s decoder: nothing is recorded, saved or uploaded. Stopping the camera stops the MediaStream tracks — the device indicator light goes out — and so does leaving this page.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '圖檔', 'IMAGE FILE')}>
          <DropZone
            l={l}
            onFiles={(files) => void scanFiles(files)}
            accept="image/*"
            hint={t(l, '把含條碼的圖片拖進來,或點一下選檔', 'Drop an image containing a code, or click to choose')}
          />
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={t(l, '剛剛掃描的圖片', 'The image just scanned')}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: '18rem',
                  width: 'auto',
                  border: '1px solid var(--rule)',
                }}
              />
            </>
          ) : null}
        </Panel>
      </div>

      {error ? <Note error>{error}</Note> : null}
      {status ? <Note>{status}</Note> : null}

      <div className="mt-8">
        <Panel
          label={t(l, '最新結果', 'LATEST RESULT')}
          aside={<span className="inst-no">{latest ? latest.format : '—'}</span>}
        >
          <div className="inst-out" aria-live="polite">
            {latest ? latest.value : <span style={{ color: 'var(--fg-faint)' }}>{t(l, '還沒掃到任何東西。', 'Nothing scanned yet.')}</span>}
          </div>
          {latest && payload ? (
            <>
              <Row>
                <span className="inst-no">
                  {kindLabel(l, payload)} · {latest.format} ·{' '}
                  {formatFamily(latest.format) === '1d'
                    ? t(l, '一維', '1D')
                    : formatFamily(latest.format) === '2d'
                      ? t(l, '二維', '2D')
                      : t(l, '未分類', 'unclassified')}
                </span>
                <CopyButton l={l} text={latest.value} label={t(l, '複製原始值', 'copy raw value')} />
              </Row>
              {rows.length > 0 ? (
                <Table
                  head={[t(l, '欄位', 'field'), t(l, '值', 'value')]}
                  rows={rows.map(([key, value]) => [key, value])}
                />
              ) : null}
              {payload.kind === 'url' ? (
                <>
                  {payload.warnings.length > 0 ? (
                    payload.warnings.map((warning) => (
                      <Note key={warning} error>
                        {t(l, WARNING_TEXT[warning].zh, WARNING_TEXT[warning].en)}
                      </Note>
                    ))
                  ) : (
                    <Note>{t(l, '網址沒有明顯可疑之處,但沒有可疑之處不等於安全。', 'Nothing obviously suspicious — which is not the same as safe.')}</Note>
                  )}
                  <Note>
                    {t(
                      l,
                      '這裡不會把掃到的網址變成可以點的連結:QR Code 是別人給的、你看不到內容就照著走的東西,要開請自己複製貼上,先看清楚網域。',
                      'A scanned URL is never turned into a clickable link here. A QR code is an address you cannot read before following it — copy it, look at the domain, then decide.'
                    )}
                  </Note>
                </>
              ) : null}
              {payload.kind === 'wifi' ? (
                <Note>
                  {t(
                    l,
                    'WiFi 密碼是明碼寫在碼裡的,任何掃得到這張碼的人都讀得到。這件工具不會把它存下來。',
                    'A WiFi password sits in the code in clear text — anyone who can scan it can read it. This tool does not store it.'
                  )}
                </Note>
              ) : null}
            </>
          ) : null}
        </Panel>
      </div>

      {history.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '本次掃到的碼', 'CODES THIS SESSION')}
            aside={<span className="inst-no">{count(history.length)} / {count(HISTORY_LIMIT)}</span>}
          >
            <Table
              head={[t(l, '格式', 'format'), t(l, '次數', 'reads'), t(l, '內容', 'value')]}
              align={['left', 'right', 'left']}
              rows={history.map((entry) => [
                entry.format,
                count(entry.count),
                // Long payloads are truncated in the table; the full value is
                // in the result panel and in the copied TSV.
                entry.value.length > 120 ? `${entry.value.slice(0, 120)}…` : entry.value,
              ])}
            />
            <Row>
              <CopyButton l={l} text={historyToTsv(history)} label={t(l, '複製全部(TSV)', 'copy all (TSV)')} />
              <Btn onClick={clear}>{t(l, '清空紀錄', 'clear list')}</Btn>
            </Row>
            <Note>
              {t(
                l,
                `紀錄只在這個分頁的記憶體裡,最多 ${HISTORY_LIMIT} 筆,重新整理就沒了——掃到的內容可能是密碼或個資,不寫 localStorage、不進網址。`,
                `The list lives in this tab’s memory, at most ${HISTORY_LIMIT} entries, and is gone on reload. Scanned values can be passwords or personal data, so nothing is written to localStorage or the URL.`
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          {
            k: t(l, '支援', 'support'),
            v: support.camera
              ? t(l, '相機 + 圖檔', 'camera + image')
              : support.image
                ? t(l, '僅圖檔', 'image only')
                : t(l, '無', 'none'),
          },
          { k: t(l, '相機', 'camera'), v: running ? t(l, '開啟', 'live') : t(l, '關閉', 'off') },
          { k: t(l, '不同碼', 'distinct codes'), v: count(history.length) },
          { k: t(l, '讀取次數', 'reads'), v: count(readings) },
          { k: t(l, '格式', 'formats'), v: formats === null ? '—' : count(formats.length) },
        ]}
      />
    </div>
  );
}
