'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
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
import { bytes as fmtBytes } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { toBase64, toHex, encodeUtf8 } from '@/lib/tools/bytes';
import {
  ALGOS,
  ALGO_LABEL,
  COLLIDABLE,
  digestBytes,
  digestStreamMulti,
  normalizeDigest,
} from './logic';

type Mode = 'text' | 'file';
type Form = 'hex' | 'base64';

/** Text is hashed on every keystroke, so it gets a ceiling. Files do not. */
const TEXT_CEILING = 4 * 1024 * 1024;
/** Read size for files: big enough to keep the hash busy, small enough to repaint. */
const CHUNK = 1024 * 1024;

type FileResult = {
  name: string;
  size: number;
  digests: Record<string, Uint8Array>;
};

export default function Hash({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [form, setForm] = useState<Form>('hex');
  const [expected, setExpected] = useState('');
  const [file, setFile] = useState<FileResult | null>(null);
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo(() => encodeUtf8(text), [text]);
  const overCeiling = input.length > TEXT_CEILING;

  const textDigests = useMemo(() => {
    if (mode !== 'text' || overCeiling) return null;
    const out: Record<string, Uint8Array> = {};
    for (const algo of ALGOS) out[algo] = digestBytes(algo, input);
    return out;
  }, [mode, overCeiling, input]);

  const digests = mode === 'text' ? textDigests : (file?.digests ?? null);
  const size = mode === 'text' ? input.length : (file?.size ?? 0);

  const show = useCallback(
    (data: Uint8Array) => (form === 'hex' ? toHex(data) : toBase64(data)),
    [form]
  );

  const takeFile = useCallback(async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setError(null);
    setFile(null);
    setProgress({ name: picked.name, done: 0, total: picked.size });
    try {
      const digested = await digestStreamMulti(ALGOS, readChunks(picked), (done) => {
        // One repaint per megabyte read.
        setProgress({ name: picked.name, done, total: picked.size });
      });
      setFile({ name: picked.name, size: picked.size, digests: digested });
      setProgress(null);
    } catch (problem) {
      setProgress(null);
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, []);

  const wanted = normalizeDigest(expected);
  const matched = wanted
    ? ALGOS.filter((algo) => digests?.[algo] && toHex(digests[algo]) === wanted)
    : [];

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '摘要', 'DIGESTS')}
        leftAside={<span className="inst-no">{fmtBytes(size)}</span>}
        rightAside={
          <Seg
            label={t(l, '輸出格式', 'Output format')}
            value={form}
            onChange={setForm}
            options={[
              { value: 'hex', label: 'hex' },
              { value: 'base64', label: 'base64' },
            ]}
          />
        }
        left={
          <>
            <Row>
              <Seg
                label={t(l, '來源', 'Source')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'text', label: t(l, '文字', 'text') },
                  { value: 'file', label: t(l, '檔案', 'file') },
                ]}
              />
            </Row>

            {mode === 'text' ? (
              <Area
                label={t(l, '要雜湊的文字', 'Text to hash')}
                hint={t(
                  l,
                  '算的是這段文字的 UTF-8 位元組。換行用 LF;貼進來的 CRLF 會算出不同的值。',
                  'Hashes the UTF-8 bytes of this text. Newlines are taken literally — CRLF and LF differ.'
                )}
                value={text}
                onChange={setText}
                rows={12}
                placeholder="abc"
              />
            ) : (
              <>
                <DropZone
                  l={l}
                  onFiles={takeFile}
                  hint={t(l, '把檔案拖進來,或點一下選檔', 'Drop a file here, or click to choose')}
                />
                {progress ? (
                  <Note>
                    {t(
                      l,
                      `讀取中 ${progress.name} — ${fmtBytes(progress.done)} / ${fmtBytes(progress.total)}`,
                      `Reading ${progress.name} — ${fmtBytes(progress.done)} of ${fmtBytes(progress.total)}`
                    )}
                  </Note>
                ) : null}
                {file ? (
                  <Note>
                    {file.name} — {fmtBytes(file.size)}
                  </Note>
                ) : null}
                {error ? <Note error>{error}</Note> : null}
              </>
            )}

            {overCeiling ? (
              <Note error>
                {t(
                  l,
                  '文字超過 4 MB,改用檔案模式:那條路徑是分段讀取的,不會把整份資料塞進記憶體。',
                  'Over 4 MB of text — switch to file mode, which streams instead of holding it all in memory.'
                )}
              </Note>
            ) : null}

            <div className="mt-3">
              <Area
                label={t(l, '比對(貼上對方公布的值)', 'Compare against a published value')}
                hint={t(
                  l,
                  '貼上什麼格式都行:大寫、sha256: 前綴、中間的空格或冒號,以及 sha256sum / shasum 整行(含後面的檔名)都會自動處理。比對永遠用 hex。',
                  'Any shape works — upper case, a sha256: prefix, spaces or colons, and a whole sha256sum or shasum line with the filename on it. Comparison is always on hex.'
                )}
                value={expected}
                onChange={setExpected}
                rows={2}
                placeholder="e3b0c442…"
              />
              {wanted ? (
                matched.length > 0 ? (
                  <Note>
                    {t(
                      l,
                      `符合 — 這是 ${matched.map((algo) => ALGO_LABEL[algo]).join(' / ')}`,
                      `Match — that is ${matched.map((algo) => ALGO_LABEL[algo]).join(' / ')}`
                    )}
                  </Note>
                ) : (
                  <Note error>
                    {t(
                      l,
                      '不符合上面任何一個摘要。先確認演算法與來源檔案都是同一個。',
                      'Does not match any digest above. Check that the algorithm and the source are the same.'
                    )}
                  </Note>
                )
              ) : null}
            </div>
          </>
        }
        right={
          digests ? (
            <Table
              head={[t(l, '演算法', 'algorithm'), t(l, '摘要', 'digest'), '']}
              rows={ALGOS.map((algo) => [
                <span key="a" className="inst-no" style={{ whiteSpace: 'nowrap' }}>
                  {ALGO_LABEL[algo]}
                  {COLLIDABLE.includes(algo) ? (
                    <span className="inst-flag" style={{ marginLeft: '0.4rem' }}>
                      {t(l, '已被碰撞', 'collidable')}
                    </span>
                  ) : null}
                </span>,
                <span key="d" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                  {show(digests[algo])}
                </span>,
                <CopyButton key="c" l={l} text={show(digests[algo])} />,
              ])}
            />
          ) : (
            <Note>
              {mode === 'file'
                ? t(l, '選一個檔案。五種摘要用同一次讀取算完。', 'Choose a file. All five digests come from one pass over it.')
                : t(l, '輸入文字後五種摘要會即時出現。', 'Digests appear as you type.')}
            </Note>
          )
        }
      />

      <Panel label={t(l, '該用哪一個', 'WHICH ONE')}>
        <Table
          head={[t(l, '演算法', 'algorithm'), t(l, '長度', 'bits'), t(l, '現在的用途', 'use today')]}
          rows={[
            [
              'SHA-256',
              '256',
              t(l, '預設選這個。簽章、指紋、完整性都合格。', 'The default. Fine for signatures, fingerprints and integrity.'),
            ],
            [
              'SHA-384 / SHA-512',
              '384 / 512',
              t(
                l,
                '64 位元運算,在 64 位元機器上通常比 SHA-256 快。',
                'Built on 64-bit words, so often faster than SHA-256 on 64-bit machines.'
              ),
            ],
            [
              'SHA-1',
              '160',
              t(
                l,
                '2017 年起有實際碰撞(SHAttered)。只剩下 git 物件識別這類既有格式在用。',
                'Practical collisions since 2017 (SHAttered). Only legacy formats such as git object ids still use it.'
              ),
            ],
            [
              'MD5',
              '128',
              t(
                l,
                '2004 年就被碰撞。當作「檔案有沒有壞掉」的校驗還行,不能當作身分證明。',
                'Collided since 2004. Acceptable as a corruption check, never as proof of identity.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            '碰撞的意思是有人能做出兩個不同的檔案、同一個摘要。所以拿 MD5 或 SHA-1 比對「這是不是我要的那個檔」在對手存在時不成立;對抗硬碟壞軌則沒問題。',
            'A collision means someone can build two different files with the same digest. So MD5 or SHA-1 cannot establish that a file is the file you wanted when an adversary is involved — against a bad disk sector they are fine.'
          )}
        </Note>
        <Row>
          <Btn
            onClick={() => {
              setText('');
              setExpected('');
              setFile(null);
              setError(null);
            }}
          >
            {t(l, '清空', 'clear')}
          </Btn>
        </Row>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入', 'input'), v: fmtBytes(size) },
          { k: t(l, '來源', 'source'), v: mode === 'text' ? t(l, '文字', 'text') : t(l, '檔案', 'file') },
          { k: t(l, '演算法', 'algorithms'), v: String(ALGOS.length) },
          { k: t(l, '實作', 'implementation'), v: t(l, '本頁自行計算', 'in-page') },
        ]}
      />
    </div>
  );
}

/**
 * A file as 1 MB chunks, read through `Blob.slice`.
 *
 * Deliberately not `file.stream()`: the stream hands back whatever size the
 * browser feels like (often 64 KB), which would mean a progress update every
 * 64 KB and thousands of renders on a large file. A fixed slice size makes
 * both the memory use and the repaint rate predictable.
 */
async function* readChunks(file: File): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
  }
}
