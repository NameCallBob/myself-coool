'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  EC_LEVELS,
  EC_RECOVERY,
  MAX_VERSION,
  QrTooLong,
  buildVCard,
  buildWifi,
  capacityBytes,
  encodeText,
  normalizeUrl,
  smallestVersion,
  toSvg,
  type EcLevel,
  type QrSymbol,
  type WifiAuth,
} from './logic';

type Kind = 'text' | 'url' | 'wifi' | 'vcard';

const PNG_TARGETS = ['256', '512', '1024', '2048'] as const;

/** UTF-8 length without building the array, for the capacity meter. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * QR generator.
 *
 * The encoder is in logic.ts and is byte mode only, versions 1–10 — the UI
 * says so rather than letting someone discover the ceiling by watching a
 * symbol fail to appear. The preview is an `<img>` fed a data URI holding the
 * SVG: the markup is built by this tool, never from anything typed in, and it
 * still never reaches the page's DOM as markup.
 */
export default function QrGenerate({ l }: ToolProps) {
  const [kind, setKind] = useState<Kind>('url');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('https://manience.com');

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<WifiAuth>('WPA');
  const [hidden, setHidden] = useState(false);

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [organization, setOrganization] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vcardUrl, setVcardUrl] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  const [level, setLevel] = useState<EcLevel>('M');
  const [version, setVersion] = useState('auto');
  const [mask, setMask] = useState('auto');
  const [quiet, setQuiet] = useState('4');
  const [target, setTarget] = useState<(typeof PNG_TARGETS)[number]>('512');
  const [dark, setDark] = useState('#000000');
  const [light, setLight] = useState('#ffffff');
  const [saved, setSaved] = useState<string | null>(null);

  /** The exact string that gets encoded. Shown, because for WiFi and vCard the
   *  payload is a format with rules and a typo there is invisible otherwise. */
  const payload = useMemo(() => {
    if (kind === 'text') return text;
    if (kind === 'url') return normalizeUrl(url);
    if (kind === 'wifi') return ssid.trim() === '' ? '' : buildWifi({ ssid, password, auth, hidden });
    const empty =
      [lastName, firstName, organization, title, phone, email, vcardUrl, address, note].every(
        (field) => field.trim() === ''
      );
    return empty
      ? ''
      : buildVCard({
          lastName,
          firstName,
          organization,
          title,
          phone,
          email,
          url: vcardUrl,
          address,
          note,
        });
  }, [
    address,
    auth,
    email,
    firstName,
    hidden,
    kind,
    lastName,
    note,
    organization,
    password,
    phone,
    ssid,
    text,
    title,
    url,
    vcardUrl,
  ]);

  const quietZone = Math.min(16, Math.max(0, Number.parseInt(quiet, 10) || 0));

  const result = useMemo(() => {
    if (payload === '') return { symbol: null as QrSymbol | null, error: null as string | null };
    try {
      const symbol = encodeText(payload, level, {
        version: version === 'auto' ? undefined : Number.parseInt(version, 10),
        mask: mask === 'auto' ? undefined : Number.parseInt(mask, 10),
      });
      return { symbol, error: null };
    } catch (problem) {
      if (problem instanceof QrTooLong) {
        const fits = smallestVersion(problem.byteLength, level);
        const advice =
          version !== 'auto' && fits !== null
            ? t(
                l,
                `改用 version ${fits} 或讓版本自動選就放得下。`,
                `Version ${fits} holds it, or leave the version on auto.`
              )
            : t(
                l,
                '這件工具做到 version 10 為止,超過就得縮短內容或降低容錯等級。',
                'This tool stops at version 10 — shorten the content or drop the error-correction level.'
              );
        return {
          symbol: null,
          error: t(
            l,
            `內容 ${count(problem.byteLength)} 位元組,超過上限 ${count(problem.limit)} 位元組(多了 ${count(problem.byteLength - problem.limit)})。${advice}`,
            `The content is ${count(problem.byteLength)} bytes, over the ${count(problem.limit)}-byte limit by ${count(problem.byteLength - problem.limit)}. ${advice}`
          ),
        };
      }
      return { symbol: null, error: problem instanceof Error ? problem.message : String(problem) };
    }
  }, [l, level, mask, payload, version]);

  const symbol = result.symbol;

  const svg = useMemo(
    () => (symbol ? toSvg(symbol, { scale: 8, quietZone, dark, light }) : ''),
    [dark, light, quietZone, symbol]
  );

  /** Data URI rather than a blob URL: a blob URL would have to be created as a
   *  side effect and revoked later, and this re-derives on every keystroke. */
  const preview = useMemo(
    () => (svg === '' ? '' : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
    [svg]
  );

  /** Whole-module pixel scale, so the PNG has no resampling blur. */
  const png = useMemo(() => {
    if (!symbol) return null;
    const span = symbol.size + quietZone * 2;
    const wanted = Number.parseInt(target, 10);
    const scale = Math.max(1, Math.round(wanted / span));
    return { span, scale, pixels: span * scale };
  }, [quietZone, symbol, target]);

  const download = useCallback(
    (blob: Blob, name: string) => {
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = name;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on the next task so the navigation has already taken the bytes.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setSaved(name);
    },
    []
  );

  const saveSvg = useCallback(() => {
    if (svg === '' || !symbol) return;
    download(new Blob([svg], { type: 'image/svg+xml' }), `qr-${symbol.version}${symbol.level}.svg`);
  }, [download, svg, symbol]);

  const savePng = useCallback(() => {
    if (!symbol || !png) return;
    const canvas = document.createElement('canvas');
    canvas.width = png.pixels;
    canvas.height = png.pixels;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = light;
    context.fillRect(0, 0, png.pixels, png.pixels);
    context.fillStyle = dark;
    for (let row = 0; row < symbol.size; row += 1) {
      for (let col = 0; col < symbol.size; col += 1) {
        if (symbol.modules[row * symbol.size + col] === 0) continue;
        context.fillRect(
          (col + quietZone) * png.scale,
          (row + quietZone) * png.scale,
          png.scale,
          png.scale
        );
      }
    }
    canvas.toBlob((blob) => {
      if (blob) download(blob, `qr-${symbol.version}${symbol.level}-${png.pixels}px.png`);
    }, 'image/png');
  }, [dark, download, light, png, quietZone, symbol]);

  const reset = useCallback(() => {
    setText('');
    setUrl('');
    setSsid('');
    setPassword('');
    setHidden(false);
    setLastName('');
    setFirstName('');
    setOrganization('');
    setTitle('');
    setPhone('');
    setEmail('');
    setVcardUrl('');
    setAddress('');
    setNote('');
    setSaved(null);
  }, []);

  const room = capacityBytes(
    version === 'auto' ? MAX_VERSION : Number.parseInt(version, 10),
    level
  );
  const used = byteLength(payload);

  return (
    <div>
      <Bench
        leftLabel={t(l, '內容與設定', 'CONTENT & SETTINGS')}
        rightLabel={t(l, '符號', 'SYMBOL')}
        leftAside={
          <span className="inst-no">
            {count(used)} / {count(room)} B
          </span>
        }
        rightAside={
          <span className="inst-no">
            {symbol ? `${symbol.size}×${symbol.size}` : '—'}
          </span>
        }
        left={
          <>
            <Seg
              label={t(l, '內容型態', 'Content type')}
              value={kind}
              onChange={setKind}
              options={[
                { value: 'url', label: t(l, '網址', 'URL') },
                { value: 'text', label: t(l, '純文字', 'Text') },
                { value: 'wifi', label: 'WiFi' },
                { value: 'vcard', label: 'vCard' },
              ]}
            />

            {kind === 'url' ? (
              <Input
                label={t(l, '網址', 'URL')}
                value={url}
                onChange={setUrl}
                placeholder="example.com/path"
                hint={t(
                  l,
                  '沒寫 scheme 的話會補上 https://,主機帶埠號(localhost:3000)也算沒寫。mailto:、tel: 這類自己帶 scheme 的不會被改。',
                  'https:// is added when no scheme is present, a host with a port (localhost:3000) included. mailto:, tel: and friends are left as typed.'
                )}
              />
            ) : null}

            {kind === 'text' ? (
              <Area
                label={t(l, '文字', 'Text')}
                value={text}
                onChange={setText}
                rows={6}
                placeholder={t(l, '任何 UTF-8 文字', 'Any UTF-8 text')}
                hint={t(
                  l,
                  '以 byte mode 編碼,一個中文字算三個位元組。',
                  'Encoded in byte mode; a Chinese character costs three bytes.'
                )}
              />
            ) : null}

            {kind === 'wifi' ? (
              <>
                <Input label={t(l, '網路名稱 SSID', 'SSID')} value={ssid} onChange={setSsid} />
                <Row>
                  <Select
                    label={t(l, '加密', 'Security')}
                    value={auth}
                    onChange={setAuth}
                    options={[
                      { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
                      { value: 'WEP', label: 'WEP' },
                      { value: 'nopass', label: t(l, '無密碼', 'Open') },
                    ]}
                  />
                  <Check2
                    label={t(l, '隱藏網路', 'Hidden network')}
                    checked={hidden}
                    onChange={setHidden}
                  />
                </Row>
                {auth === 'nopass' ? null : (
                  <Input
                    label={t(l, '密碼', 'Password')}
                    value={password}
                    onChange={setPassword}
                    hint={t(
                      l,
                      '密碼會明碼寫進 QR Code 裡,任何掃到的人都讀得到。這個欄位不儲存、不進網址。',
                      'The password goes into the symbol in clear text — anyone who scans it can read it. This field is never stored or put in the URL.'
                    )}
                  />
                )}
                <Note>
                  {t(
                    l,
                    'WIFI: 這個格式不是 ISO 標準,是 Android 年代留下來的慣例,iOS 11 之後也認。舊機器可能不認。',
                    'The WIFI: payload is a de-facto format from Android, adopted by iOS 11 and later. Older readers may not accept it.'
                  )}
                </Note>
              </>
            ) : null}

            {kind === 'vcard' ? (
              <>
                <Row>
                  <Input label={t(l, '姓', 'Last name')} value={lastName} onChange={setLastName} />
                  <Input label={t(l, '名', 'First name')} value={firstName} onChange={setFirstName} />
                </Row>
                <Row>
                  <Input label={t(l, '公司', 'Organization')} value={organization} onChange={setOrganization} />
                  <Input label={t(l, '職稱', 'Title')} value={title} onChange={setTitle} />
                </Row>
                <Row>
                  <Input label={t(l, '電話', 'Phone')} value={phone} onChange={setPhone} />
                  <Input label={t(l, 'Email', 'Email')} value={email} onChange={setEmail} />
                </Row>
                <Input label={t(l, '網址', 'URL')} value={vcardUrl} onChange={setVcardUrl} />
                <Input label={t(l, '地址', 'Address')} value={address} onChange={setAddress} />
                <Input label={t(l, '備註', 'Note')} value={note} onChange={setNote} />
                <Note>
                  {t(
                    l,
                    'vCard 3.0。手機的通訊錄匯入普遍吃 3.0,4.0 有些會直接忽略。空欄位不會寫進去。',
                    'vCard 3.0 — phone contact importers generally accept 3.0 and several ignore 4.0. Empty fields are omitted.'
                  )}
                </Note>
              </>
            ) : null}

            <Row>
              <Seg
                label={t(l, '容錯等級', 'Error correction')}
                value={level}
                onChange={setLevel}
                options={EC_LEVELS.map((candidate) => ({ value: candidate, label: candidate }))}
              />
              <Select
                label={t(l, '版本', 'Version')}
                value={version}
                onChange={setVersion}
                options={[
                  { value: 'auto', label: t(l, '自動(最小)', 'auto (smallest)') },
                  ...Array.from({ length: MAX_VERSION }, (_, i) => ({
                    value: String(i + 1),
                    label: `${i + 1} — ${(i + 1) * 4 + 17}×${(i + 1) * 4 + 17}`,
                  })),
                ]}
              />
              <Select
                label={t(l, '遮罩', 'Mask')}
                value={mask}
                onChange={setMask}
                options={[
                  { value: 'auto', label: t(l, '自動(評分最低)', 'auto (lowest penalty)') },
                  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: String(i) })),
                ]}
              />
            </Row>

            <Row>
              <Input
                label={t(l, '留白邊(模組)', 'Quiet zone (modules)')}
                type="number"
                min={0}
                max={16}
                value={quiet}
                onChange={setQuiet}
                hint={t(l, '標準要求 4;小於 4 有些讀取器會對不到。', 'The standard asks for 4; below that some readers miss it.')}
              />
              <Select
                label={t(l, 'PNG 目標邊長', 'PNG target size')}
                value={target}
                onChange={setTarget}
                options={PNG_TARGETS.map((value) => ({ value, label: `${value} px` }))}
                hint={
                  png
                    ? t(l, `實際 ${png.pixels} px(每模組 ${png.scale} px)`, `actual ${png.pixels} px (${png.scale} px per module)`)
                    : undefined
                }
              />
            </Row>

            <Row>
              <Input label={t(l, '深色', 'Dark')} type="color" value={dark} onChange={setDark} />
              <Input label={t(l, '淺色', 'Light')} type="color" value={light} onChange={setLight} />
            </Row>
            <Note>
              {t(
                l,
                '深色要夠深、淺色要夠淺:讀取器看的是對比,反相或對比不足的配色掃不到。',
                'Readers judge contrast, not hue — an inverted or low-contrast pair will not scan.'
              )}
            </Note>
          </>
        }
        right={
          <>
            {result.error ? <Note error>{result.error}</Note> : null}

            {symbol && preview !== '' ? (
              <div className="inst-field">
                {/* A data URI on an <img>, not inline SVG: the markup is built
                    here from module bits, and it still never enters the DOM as
                    markup. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={t(
                    l,
                    `QR Code,version ${symbol.version},容錯等級 ${symbol.level}`,
                    `QR code, version ${symbol.version}, error correction ${symbol.level}`
                  )}
                  width={320}
                  height={320}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: '20rem',
                    height: 'auto',
                    border: '1px solid var(--rule)',
                    imageRendering: 'pixelated',
                  }}
                />
              </div>
            ) : (
              <div className="inst-out" aria-live="polite">
                <span style={{ color: 'var(--fg-faint)' }}>
                  {result.error
                    ? t(l, '先把內容縮短。', 'Shorten the content first.')
                    : t(l, '左邊填入內容後,這裡就會出現符號。', 'Fill in the content and the symbol appears here.')}
                </span>
              </div>
            )}

            <Row>
              <Btn onClick={savePng} primary disabled={!symbol}>
                {t(l, '下載 PNG', 'download PNG')}
              </Btn>
              <Btn onClick={saveSvg} disabled={!symbol}>
                {t(l, '下載 SVG', 'download SVG')}
              </Btn>
              <CopyButton l={l} text={svg} label={t(l, '複製 SVG 原始碼', 'copy SVG source')} />
              <ResetButton l={l} onReset={reset} />
            </Row>
            {saved ? <Note>{t(l, `已存 ${saved}`, `Saved ${saved}`)}</Note> : null}

            <Area
              label={t(l, '實際編碼的字串', 'The string actually encoded')}
              value={payload}
              rows={kind === 'vcard' ? 8 : 3}
              readOnly
              hint={t(
                l,
                'WiFi 與 vCard 是有規則的格式,這裡顯示組出來的完整字串,方便對照。',
                'WiFi and vCard are structured formats; this is the exact string that was built.'
              )}
            />
            <Row>
              <CopyButton l={l} text={payload} label={t(l, '複製字串', 'copy string')} />
            </Row>

            {symbol ? (
              <div className="mt-3">
                <Table
                  head={[t(l, '項目', 'item'), t(l, '值', 'value')]}
                  align={['left', 'right']}
                  rows={[
                    [t(l, '版本 / 模組', 'version / modules'), `${symbol.version} / ${symbol.size}×${symbol.size}`],
                    [
                      t(l, '容錯等級', 'error correction'),
                      `${symbol.level} — ${t(l, '可救', 'recovers')} ≈${Math.round(EC_RECOVERY[symbol.level] * 100)}%`,
                    ],
                    [
                      t(l, '遮罩', 'mask'),
                      mask === 'auto'
                        ? t(l, `${symbol.mask}(評分 ${count(symbol.penalty.total)},八種中最低)`, `${symbol.mask} (penalty ${count(symbol.penalty.total)}, lowest of eight)`)
                        : t(l, `${symbol.mask}(手動指定,評分 ${count(symbol.penalty.total)})`, `${symbol.mask} (fixed, penalty ${count(symbol.penalty.total)})`),
                    ],
                    [
                      t(l, '資料 / 容量', 'payload / capacity'),
                      `${count(symbol.payloadBytes)} / ${count(symbol.capacityBytes)} B`,
                    ],
                    [
                      t(l, '碼字(資料 + 更正)', 'codewords (data + EC)'),
                      `${count(symbol.dataCodewords)} + ${count(symbol.ecCodewords)}`,
                    ],
                    [t(l, '區塊數', 'blocks'), count(symbol.blocks)],
                    [
                      t(l, '罰分(連續/方塊/類定位/明暗)', 'penalty (runs/blocks/finder-like/balance)'),
                      `${count(symbol.penalty.runs)} / ${count(symbol.penalty.blocks)} / ${count(symbol.penalty.finderLike)} / ${count(symbol.penalty.balance)}`,
                    ],
                    [t(l, 'SVG 位元組', 'SVG bytes'), fmtBytes(byteLength(svg))],
                  ]}
                />
              </div>
            ) : null}

            <Note>
              {t(
                l,
                `編碼範圍寫清楚:只用 byte mode(UTF-8),版本 1–10,容量上限 ${count(capacityBytes(MAX_VERSION, 'L'))} 位元組(等級 L)。純數字內容用 numeric mode 可以更小,這裡不做——模式指示錯了就是一張掃不出來的圖。Micro QR 與結構化串接也不做。`,
                `Scope, stated: byte mode (UTF-8) only, versions 1–10, at most ${count(capacityBytes(MAX_VERSION, 'L'))} bytes at level L. Numeric-only content would pack smaller in numeric mode; that mode is not implemented, because a wrong mode indicator is a symbol that simply does not scan. No Micro QR and no structured append either.`
              )}
            </Note>
            <Note>
              {t(
                l,
                '遮罩、錯誤更正與格式資訊照 ISO/IEC 18004 實作,測試用公開常數表與 Reed-Solomon 的定義性質驗證,並且會把產生出來的符號反向解回原字串。印出來前還是先用手機掃一次。',
                'Masking, error correction and format information follow ISO/IEC 18004; the tests check them against published constants and against the defining property of the Reed-Solomon code, then decode the finished symbol back to the input. Still scan it with a phone before you print it.'
              )}
            </Note>
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '版本', 'version'), v: symbol ? `${symbol.version} (${symbol.size}×${symbol.size})` : '—' },
          { k: t(l, '容錯', 'ec level'), v: symbol ? symbol.level : level },
          { k: t(l, '內容', 'payload'), v: `${count(used)} B` },
          { k: t(l, '容量', 'capacity'), v: symbol ? `${count(symbol.capacityBytes)} B` : `${count(room)} B` },
          { k: t(l, '遮罩', 'mask'), v: symbol ? String(symbol.mask) : '—' },
        ]}
      />
    </div>
  );
}
