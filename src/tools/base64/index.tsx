'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  DropZone,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  Base64Error,
  WRAP_MIME,
  WRAP_PEM,
  buildDataUri,
  decodeBase64,
  encodeBase64,
  fromUtf8Bytes,
  inspectBase64,
  parseDataUri,
  toHex,
  toUtf8Bytes,
  type Variant,
} from './logic';

type Mode = 'encode' | 'decode';
type Source = 'text' | 'file';
type Wrap = 'off' | 'mime' | 'pem';

const WRAP_WIDTH: Record<Wrap, number> = { off: 0, mime: WRAP_MIME, pem: WRAP_PEM };

/** Bytes kept in memory for a file. Beyond this the base64 string alone would
 *  be 1.33x again and the textarea becomes the bottleneck, not the encoder. */
const FILE_CEILING = 8 * 1024 * 1024;

/** How much of a non-text decode result to show as hex. */
const HEX_PREVIEW = 512;

type Loaded = { name: string; type: string; data: Uint8Array };

export default function Base64Tool({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('encode');
  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>('standard');
  const [pad, setPad] = useState(true);
  const [wrap, setWrap] = useState<Wrap>('off');
  const [strict, setStrict] = useState(false);
  const [mime, setMime] = useState('');

  const input = mode === 'encode' && source === 'file' && file ? null : text;

  /** Encode side: bytes come from the textarea or the loaded file. */
  const encoded = useMemo(() => {
    if (mode !== 'encode') return null;
    const data = source === 'file' ? (file?.data ?? null) : toUtf8Bytes(text);
    if (!data) return null;
    return {
      data,
      out: encodeBase64(data, { variant, pad, wrap: WRAP_WIDTH[wrap] }),
    };
  }, [mode, source, file, text, variant, pad, wrap]);

  /** Decode side, including the data-URI form, which carries its own MIME. */
  const decoded = useMemo(() => {
    if (mode !== 'decode' || text.trim() === '') return null;
    try {
      if (/^\s*data:/i.test(text)) {
        const uri = parseDataUri(text);
        return { data: uri.data, mime: uri.mime, error: null as string | null };
      }
      return { data: decodeBase64(text, { strict }), mime: '', error: null };
    } catch (problem) {
      const at =
        problem instanceof Base64Error
          ? t(l, `第 ${problem.index + 1} 個字元:`, `at character ${problem.index + 1}: `)
          : '';
      return { data: null, mime: '', error: at + (problem instanceof Error ? problem.message : String(problem)) };
    }
  }, [mode, text, strict, l]);

  const report = useMemo(() => (mode === 'decode' ? inspectBase64(text) : null), [mode, text]);

  const decodedText = useMemo(
    () => (decoded?.data ? fromUtf8Bytes(decoded.data) : null),
    [decoded]
  );

  const dataUri = useMemo(() => {
    if (!encoded) return '';
    const type = mime.trim() || (source === 'file' ? file?.type : '') || 'text/plain';
    return buildDataUri(type, encoded.data, { base64: true });
  }, [encoded, mime, source, file]);

  const takeFile = async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    if (picked.size > FILE_CEILING) {
      setFile(null);
      setFileError(
        t(
          l,
          `這個檔案 ${bytes(picked.size)},超過本工具的 ${bytes(FILE_CEILING)} 上限。Base64 會讓它再長三分之一,放進文字框只會讓分頁卡住。`,
          `That file is ${bytes(picked.size)}, over the ${bytes(FILE_CEILING)} ceiling. Base64 adds another third, and a string that long freezes the textarea.`
        )
      );
      return;
    }
    setFileError(null);
    setFile({
      name: picked.name,
      type: picked.type,
      data: new Uint8Array(await picked.arrayBuffer()),
    });
  };

  /** Blob download, built and revoked inside the click — no network involved. */
  const saveDecoded = () => {
    if (!decoded?.data) return;
    const blob = new Blob([decoded.data as Uint8Array<ArrayBuffer>], {
      type: decoded.mime || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'decoded.bin';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const inputBytes = mode === 'encode' ? (encoded?.data.length ?? 0) : toUtf8Bytes(text).length;
  const outputBytes = mode === 'encode' ? (encoded?.out.length ?? 0) : (decoded?.data?.length ?? 0);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: t(l, '編碼', 'encode') },
            { value: 'decode', label: t(l, '解碼', 'decode') },
          ]}
        />
        {mode === 'encode' ? (
          <Seg
            label={t(l, '來源', 'Source')}
            value={source}
            onChange={setSource}
            options={[
              { value: 'text', label: t(l, '文字', 'text') },
              { value: 'file', label: t(l, '檔案', 'file') },
            ]}
          />
        ) : null}
        <ResetButton
          l={l}
          onReset={() => {
            setText('');
            setFile(null);
            setFileError(null);
          }}
        />
      </Row>

      <Bench
        leftLabel={mode === 'encode' ? t(l, '輸入', 'INPUT') : t(l, 'BASE64', 'BASE64')}
        rightLabel={mode === 'encode' ? t(l, 'BASE64', 'BASE64') : t(l, '解碼結果', 'DECODED')}
        leftAside={<span className="inst-no">{bytes(inputBytes)}</span>}
        rightAside={<span className="inst-no">{mode === 'encode' ? `${count(outputBytes)} ch` : bytes(outputBytes)}</span>}
        left={
          <>
            {mode === 'encode' && source === 'file' ? (
              <>
                <DropZone
                  l={l}
                  onFiles={takeFile}
                  hint={
                    file
                      ? `${file.name} · ${bytes(file.data.length)}`
                      : t(l, '把要編碼的檔案拖進來', 'Drop the file to encode')
                  }
                />
                {fileError ? <Note error>{fileError}</Note> : null}
              </>
            ) : (
              <Area
                label={
                  mode === 'encode'
                    ? t(l, '要編碼的文字(以 UTF-8 取位元組)', 'Text to encode (UTF-8 bytes)')
                    : t(l, '貼上 Base64,或整條 data: URI', 'Paste Base64, or a whole data: URI')
                }
                value={input ?? ''}
                onChange={setText}
                rows={13}
                invalid={Boolean(decoded?.error)}
                placeholder={mode === 'encode' ? '你好,世界' : 'aGVsbG8sIOS4lueVjA=='}
              />
            )}

            {mode === 'encode' ? (
              <>
                <Row>
                  <Seg
                    label={t(l, '字母表', 'Alphabet')}
                    value={variant}
                    onChange={setVariant}
                    options={[
                      { value: 'standard', label: t(l, '標準 +/', 'standard +/') },
                      { value: 'urlsafe', label: t(l, 'URL-safe -_', 'URL-safe -_') },
                    ]}
                  />
                  <Seg
                    label={t(l, '換行', 'Wrap')}
                    value={wrap}
                    onChange={setWrap}
                    options={[
                      { value: 'off', label: t(l, '不斷行', 'none') },
                      { value: 'mime', label: 'MIME 76' },
                      { value: 'pem', label: 'PEM 64' },
                    ]}
                  />
                </Row>
                <Row>
                  <Check2
                    label={t(l, '補 = 號', 'add = padding')}
                    checked={pad}
                    onChange={setPad}
                  />
                </Row>
                <Note>
                  {t(
                    l,
                    'JWT 與 URL 參數用 URL-safe 且不補等號;MIME 附件與 PEM 用標準字母表並補滿。',
                    'JWTs and URL parameters use the URL-safe alphabet unpadded; MIME and PEM use the standard alphabet, padded.'
                  )}
                </Note>
              </>
            ) : (
              <>
                <Row>
                  <Check2
                    label={t(l, '嚴格模式(拒絕非標準尾端)', 'strict (reject non-canonical tail)')}
                    checked={strict}
                    onChange={setStrict}
                  />
                </Row>
                {decoded?.error ? <Note error>{decoded.error}</Note> : null}
                {report && text.trim() !== '' ? (
                  <Table
                    head={[t(l, '檢查', 'check'), t(l, '值', 'value')]}
                    rows={[
                      [t(l, '資料字元', 'data chars'), count(report.dataChars)],
                      [t(l, '空白(忽略)', 'whitespace (ignored)'), count(report.whitespace)],
                      [t(l, '= 補位', '= padding'), count(report.padding)],
                      [
                        t(l, '字母表', 'alphabet'),
                        report.mixedAlphabet
                          ? t(l, '兩種混用', 'both, mixed')
                          : report.urlSafeOnly > 0
                            ? 'URL-safe'
                            : report.standardOnly > 0
                              ? t(l, '標準', 'standard')
                              : t(l, '無法判斷(只有 A–Z a–z 0–9)', 'indeterminate'),
                      ],
                      [t(l, '預期位元組', 'expected bytes'), bytes(report.expectedBytes)],
                    ]}
                  />
                ) : null}
              </>
            )}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={mode === 'encode' ? (encoded?.out ?? '') : (decodedText ?? '')} />
              {mode === 'decode' && decoded?.data && decoded.data.length > 0 ? (
                <Btn onClick={saveDecoded}>{t(l, '存成檔案', 'save as file')}</Btn>
              ) : null}
            </Row>

            <div
              className="inst-out mt-3"
              style={{ minHeight: '17rem', wordBreak: 'break-all' }}
              aria-live="polite"
            >
              {mode === 'encode' ? (
                (encoded?.out ?? '') || (
                  <span style={{ color: 'var(--fg-faint)' }}>
                    {t(l, '左邊放進文字或檔案就會編碼。', 'Encoded output appears here.')}
                  </span>
                )
              ) : decoded?.data === null || decoded?.data === undefined ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上 Base64 就會解碼。', 'Decoded output appears here.')}
                </span>
              ) : decodedText !== null ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{decodedText}</span>
              ) : (
                <div>
                  <p className="inst-hint" style={{ marginTop: 0 }}>
                    {t(
                      l,
                      `這些位元組不是有效的 UTF-8,所以以十六進位顯示前 ${HEX_PREVIEW} 個位元組。`,
                      `These bytes are not valid UTF-8; the first ${HEX_PREVIEW} are shown as hex.`
                    )}
                  </p>
                  <span>{toHex(decoded.data, HEX_PREVIEW)}</span>
                  {decoded.data.length > HEX_PREVIEW ? (
                    <span style={{ color: 'var(--fg-faint)' }}>
                      {' '}
                      … {t(l, `還有 ${count(decoded.data.length - HEX_PREVIEW)} 個位元組`, `${count(decoded.data.length - HEX_PREVIEW)} more bytes`)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </>
        }
      />

      {mode === 'encode' && encoded && encoded.data.length > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, 'DATA URI', 'DATA URI')}
            aside={<span className="inst-no">{bytes(dataUri.length)}</span>}
          >
            <Row>
              <div style={{ minWidth: '14rem', flex: 1 }}>
                <Area
                  label={t(l, 'MIME 型別', 'MIME type')}
                  value={mime}
                  onChange={setMime}
                  rows={1}
                  placeholder={source === 'file' ? (file?.type || 'application/octet-stream') : 'text/plain'}
                />
              </div>
              <CopyButton l={l} text={dataUri} label={t(l, '複製 data URI', 'copy data URI')} />
            </Row>
            <div className="inst-out mt-2" style={{ minHeight: 0, maxHeight: '9rem', overflow: 'auto', wordBreak: 'break-all' }}>
              {dataUri}
            </div>
            <Note>
              {t(
                l,
                'data URI 把位元組塞進標記或樣式表裡,代價是體積比原檔大三分之一,而且無法被瀏覽器單獨快取。小圖示與字型子集適合,大圖不適合。',
                'A data URI inlines bytes into markup or CSS at a third more size, and the browser cannot cache it separately. Fine for small icons, not for photographs.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '位元組', 'bytes'), v: bytes(mode === 'encode' ? inputBytes : outputBytes) },
          {
            k: t(l, 'Base64 字元', 'base64 chars'),
            v: count(mode === 'encode' ? (encoded?.out.replace(/\n/g, '').length ?? 0) : (report?.dataChars ?? 0)),
          },
          {
            k: t(l, '膨脹', 'overhead'),
            v:
              inputBytes > 0 && mode === 'encode'
                ? `${(((encoded?.out.replace(/\n/g, '').length ?? 0) / inputBytes - 1) * 100).toFixed(1)}%`
                : '—',
          },
          {
            k: t(l, '字母表', 'alphabet'),
            v: mode === 'encode' ? (variant === 'urlsafe' ? '-_' : '+/') : t(l, '兩種皆收', 'either'),
          },
        ]}
      />
    </div>
  );
}
