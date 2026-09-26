'use client';

import { useCallback, useMemo, useState } from 'react';
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
  Row,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  ALGOS,
  ALGO_LABEL,
  COLLIDABLE,
  algoOf,
  digestStreamMulti,
  hex,
  manifestLine,
  parseChecksumText,
  verifyFile,
  type Algo,
  type Verdict,
} from './logic';

/** Read size: one repaint per megabyte, memory flat whatever the file size. */
const CHUNK = 1024 * 1024;

type Entry = {
  file: File;
  digests: Record<string, Uint8Array>;
};

export default function ChecksumVerify({ l }: ToolProps) {
  const [published, setPublished] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [everything, setEverything] = useState(false);
  const [busy, setBusy] = useState<{ name: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseChecksumText(published), [published]);

  /**
   * Only the algorithms the pasted text actually needs get computed. Hashing a
   * 4 GB image with all five is four passes of wasted minutes, and SHA-256 is
   * what publishers post.
   */
  const needed = useMemo<Algo[]>(() => {
    if (everything) return ALGOS;
    const wanted = new Set<Algo>(['sha256']);
    for (const sum of parsed.sums) for (const algo of algoOf(sum)) wanted.add(algo);
    return ALGOS.filter((algo) => wanted.has(algo));
  }, [parsed.sums, everything]);

  const missingFor = useCallback(
    (entry: Entry) => needed.filter((algo) => !(algo in entry.digests)),
    [needed]
  );
  const pending = entries.filter((entry) => missingFor(entry).length > 0);

  const hashAll = useCallback(
    async (targets: Entry[], algos: Algo[]) => {
      setError(null);
      for (const target of targets) {
        const missing = algos.filter((algo) => !(algo in target.digests));
        if (missing.length === 0) continue;
        setBusy({ name: target.file.name, done: 0, total: target.file.size });
        try {
          const fresh = await digestStreamMulti(missing, readChunks(target.file), (done) =>
            setBusy({ name: target.file.name, done, total: target.file.size })
          );
          setEntries((previous) =>
            previous.map((entry) =>
              entry.file === target.file ? { ...entry, digests: { ...entry.digests, ...fresh } } : entry
            )
          );
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : String(problem));
        }
      }
      setBusy(null);
    },
    []
  );

  const take = useCallback(
    async (files: File[]) => {
      const fresh: Entry[] = files.map((file) => ({ file, digests: {} }));
      setEntries((previous) => [...previous, ...fresh]);
      await hashAll(fresh, needed);
    },
    [hashAll, needed]
  );

  const verdicts = entries.map((entry) => ({
    entry,
    verdict: verifyFile(entry.file.name, entry.digests, parsed.sums),
    missing: missingFor(entry),
  }));

  const matched = verdicts.filter((row) => row.verdict.kind === 'match').length;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);

  const manifest = entries
    .filter((entry) => entry.digests.sha256)
    .map((entry) => manifestLine(hex(entry.digests.sha256), entry.file.name))
    .join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '檔案與公布值', 'FILES AND PUBLISHED VALUE')}
        rightLabel={t(l, '判定', 'VERDICT')}
        leftAside={<span className="inst-no">{fmtBytes(totalBytes)}</span>}
        rightAside={
          entries.length > 0 ? (
            <span className="inst-no">
              {matched} / {entries.length} {t(l, '符合', 'match')}
            </span>
          ) : null
        }
        left={
          <>
            <DropZone
              l={l}
              onFiles={take}
              multiple
              hint={t(
                l,
                '把下載好的檔案拖進來(可以一次多個)',
                'Drop the files you downloaded — several at once is fine'
              )}
            />
            {busy ? (
              <Note>
                {t(
                  l,
                  `計算中 ${busy.name} — ${fmtBytes(busy.done)} / ${fmtBytes(busy.total)}`,
                  `Hashing ${busy.name} — ${fmtBytes(busy.done)} of ${fmtBytes(busy.total)}`
                )}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}

            <Area
              label={t(l, '官方公布的 checksum', 'The published checksum')}
              hint={t(
                l,
                '整段貼進來就好:sha256sum 輸出、BSD 的 SHA256 (檔名) = …、或單獨一串 hex 都認得。註解行會跳過。',
                'Paste the whole thing: sha256sum output, BSD-style SHA256 (file) = …, or a bare hex string. Comment lines are skipped.'
              )}
              value={published}
              onChange={setPublished}
              rows={8}
              placeholder={'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ubuntu.iso'}
            />

            <Row>
              <Check2
                label={t(l, '五種演算法全算', 'compute all five')}
                checked={everything}
                onChange={setEverything}
              />
              {pending.length > 0 && !busy ? (
                <Btn primary onClick={() => hashAll(pending, needed)}>
                  {t(
                    l,
                    `計算缺的 ${pending.length} 個檔案`,
                    `Hash ${pending.length} remaining file${pending.length > 1 ? 's' : ''}`
                  )}
                </Btn>
              ) : null}
              {entries.length > 0 ? (
                <Btn
                  onClick={() => {
                    setEntries([]);
                    setError(null);
                  }}
                >
                  {t(l, '移除檔案', 'remove files')}
                </Btn>
              ) : null}
            </Row>

            <Note>
              {t(
                l,
                `目前計算:${needed.map((algo) => ALGO_LABEL[algo]).join('、')}。演算法是從貼上的內容推斷的,沒貼就先算 SHA-256——多算一種就要多讀一次整個檔案。`,
                `Computing ${needed.map((algo) => ALGO_LABEL[algo]).join(', ')}. The set comes from what you pasted; with nothing pasted it is SHA-256 alone, because each extra algorithm is another pass over the file.`
              )}
            </Note>
            {parsed.skipped.length > 0 ? (
              <Note>
                {t(
                  l,
                  `有 ${parsed.skipped.length} 行看不出摘要,已跳過(第 ${parsed.skipped
                    .slice(0, 5)
                    .map((entry) => entry.line)
                    .join('、')} 行)。`,
                  `${parsed.skipped.length} line(s) carried no digest and were skipped (line ${parsed.skipped
                    .slice(0, 5)
                    .map((entry) => entry.line)
                    .join(', ')}).`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          entries.length === 0 ? (
            <Note>
              {t(
                l,
                '拖入檔案後這裡會逐一判定。檔案只在這個分頁裡讀取。',
                'Verdicts appear here, one per file. Files are read in this tab only.'
              )}
            </Note>
          ) : (
            <Table
              head={[t(l, '檔案', 'file'), t(l, '判定', 'verdict')]}
              rows={verdicts.map((row) => [
                <span key="n" className="inst-wrap">
                  {row.entry.file.name}
                  <br />
                  <span className="inst-no">{fmtBytes(row.entry.file.size)}</span>
                </span>,
                <span key="v" className="inst-wrap">
                  {row.missing.length > 0 ? (
                    <span className="inst-no">
                      {t(l, `還沒算 ${row.missing.map((algo) => ALGO_LABEL[algo]).join('、')}`, `not hashed yet: ${row.missing.map((algo) => ALGO_LABEL[algo]).join(', ')}`)}
                    </span>
                  ) : (
                    describe(row.verdict, l)
                  )}
                </span>,
              ])}
            />
          )
        }
      />

      {manifest ? (
        <Panel
          label={t(l, 'SHA-256 清單', 'SHA-256 MANIFEST')}
          aside={<CopyButton l={l} text={manifest} />}
        >
          <div className="inst-out" aria-live="polite">
            {manifest}
          </div>
          <Note>
            {t(
              l,
              '這就是 sha256sum 的格式,存成 SHA256SUMS 之後可以用 sha256sum -c 再驗一次。',
              'This is sha256sum’s own format — save it as SHA256SUMS and `sha256sum -c` will read it back.'
            )}
          </Note>
        </Panel>
      ) : null}

      <Panel label={t(l, '判定的意思', 'WHAT THE VERDICTS MEAN')}>
        <Table
          head={[t(l, '判定', 'verdict'), t(l, '代表什麼', 'meaning')]}
          rows={[
            [
              t(l, '符合', 'match'),
              t(
                l,
                '這個檔案的位元組跟公布值一致。SHA-256 相符就足以排除傳輸損壞與中途替換。',
                'The bytes agree with the published value. A SHA-256 match rules out both corruption and substitution.'
              ),
            ],
            [
              t(l, '不符合', 'mismatch'),
              t(
                l,
                '重下載一次再驗。連兩次都不符合,就不要執行它。',
                'Download again and re-check. If it fails twice, do not run it.'
              ),
            ],
            [
              t(l, '沒有對應的行', 'absent'),
              t(
                l,
                '貼上的清單裡沒有這個檔名、摘要也沒有一行對得上。通常是清單貼錯版本。',
                'Nothing you pasted names this file and no digest lines up. Usually the manifest is for another release.'
              ),
            ],
            [
              t(l, '長度不支援', 'unsupported'),
              t(
                l,
                '那串不是這五種演算法的長度(常見是 CRC32 或 BLAKE2),本工具算不出來。',
                'That length is none of these five algorithms — often CRC32 or BLAKE2, which this tool does not compute.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            'MD5 與 SHA-1 已有實際碰撞,只能用來抓損壞;要確認「這是不是發布者發的那個檔」請用 SHA-256 以上,並且公布值要從你信任的來源取得。摘要對上只證明位元組一致,不證明發布者可信。',
            'MD5 and SHA-1 have practical collisions and can only catch corruption. To establish that a file is the publisher’s file, use SHA-256 or better, and get the published value from a source you trust. A matching digest proves the bytes agree — not that the publisher is trustworthy.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '檔案', 'files'), v: count(entries.length) },
          { k: t(l, '總大小', 'total'), v: fmtBytes(totalBytes) },
          { k: t(l, '公布值', 'published'), v: count(parsed.sums.length) },
          { k: t(l, '符合', 'matched'), v: `${matched} / ${entries.length}` },
          { k: t(l, '演算法', 'algorithms'), v: needed.map((algo) => ALGO_LABEL[algo]).join(' ') },
        ]}
      />
    </div>
  );
}

/** Verdicts read as words, never as a colour alone. */
function describe(verdict: Verdict, l: 'zh' | 'en') {
  if (verdict.kind === 'match') {
    return (
      <span style={{ color: 'var(--data-teal)' }}>
        {t(l, `符合 — ${ALGO_LABEL[verdict.algo]}`, `MATCH — ${ALGO_LABEL[verdict.algo]}`)}
        {COLLIDABLE.includes(verdict.algo)
          ? t(l, '(此演算法已被碰撞,只當損壞檢查)', ' (a collidable algorithm — corruption check only)')
          : ''}
        <br />
        <span className="inst-no">
          {t(l, `第 ${verdict.sum.line} 行`, `line ${verdict.sum.line}`)}
          {verdict.sum.name ? ` · ${verdict.sum.name}` : ''}
        </span>
      </span>
    );
  }
  if (verdict.kind === 'mismatch') {
    return (
      <span style={{ color: 'var(--accent)' }} role="alert">
        {t(l, `不符合 — ${ALGO_LABEL[verdict.algo]}`, `MISMATCH — ${ALGO_LABEL[verdict.algo]}`)}
        <br />
        <span className="inst-no">
          {t(l, '公布', 'published')} {verdict.sum.hex}
        </span>
        <br />
        <span className="inst-no">
          {t(l, '實際', 'computed')} {verdict.computed}
        </span>
      </span>
    );
  }
  if (verdict.kind === 'unsupported') {
    return (
      <span className="inst-no">
        {t(
          l,
          `長度 ${verdict.sum.hex.length} 的摘要不是這五種演算法`,
          `a ${verdict.sum.hex.length}-character digest is none of these five algorithms`
        )}
      </span>
    );
  }
  return (
    <span className="inst-no">
      {t(l, '公布值裡沒有對應這個檔案的行', 'nothing you pasted refers to this file')}
    </span>
  );
}

/**
 * A file as 1 MB chunks through `Blob.slice`, rather than `file.stream()`:
 * the stream hands back whatever size it likes, which would mean a repaint
 * every 64 KB on a large file.
 */
async function* readChunks(file: File): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
  }
}
