'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
import { bytes as fmtBytes, count, fixed } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { toHex } from '@/lib/tools/bytes';
import {
  HEAD_BYTES,
  MATCH_LIMIT,
  NeedleError,
  dumpLines,
  formatOffset,
  identify,
  longestAsciiRun,
  parseNeedle,
  renderDump,
  search,
  stats,
  type ByteStats,
  type Match,
  type NeedleKind,
} from './logic';

/**
 * The file is never read whole. Three bounded reads only:
 *
 *  - HEAD: enough bytes for every signature in the table (the deepest is ISO
 *    9660's at 0x8001), used for identification.
 *  - SAMPLE: the first megabyte, used for entropy and the byte statistics —
 *    labelled as a sample in the UI, because that is what it is.
 *  - WINDOW: the few hundred bytes currently on screen.
 *
 * So a 4 GB disk image opens as fast as a 4 KB one. The only unbounded thing a
 * hexdump can ask for is a search, and that gets a scan ceiling plus a yield
 * between chunks so the tab keeps painting.
 */
const SAMPLE = 1024 * 1024;
const SCAN_CHUNK = 4 * 1024 * 1024;
const SCAN_CEILING = 256 * 1024 * 1024;

type Width = '8' | '16' | '32';
const PAGE_SIZES = [256, 512, 1024, 2048] as const;

type Loaded = {
  file: File;
  head: Uint8Array;
  matches: Match[];
  sample: ByteStats;
  sampleBytes: number;
  asciiRun: number;
};

type View = { offset: number; data: Uint8Array };

type Hits = { offsets: number[]; scanned: number; capped: boolean; needle: number };

export default function HexViewer({ l }: ToolProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [page, setPage] = useState<number>(512);
  const [width, setWidth] = useState<Width>('16');
  const [upper, setUpper] = useState(false);
  const [goto, setGoto] = useState('');
  const [kind, setKind] = useState<NeedleKind>('hex');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hits | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Bumped on every new file so a slow read cannot land on a newer one. */
  const run = useRef(0);

  const size = loaded?.file.size ?? 0;

  const readWindow = useCallback(async (file: File, offset: number, length: number, token: number) => {
    const start = Math.max(0, Math.min(offset, Math.max(0, file.size - 1)));
    const end = Math.min(file.size, start + length);
    const data = new Uint8Array(await file.slice(start, end).arrayBuffer());
    if (run.current !== token) return;
    setView({ offset: start, data });
  }, []);

  const takeFile = useCallback(
    async (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      const token = run.current + 1;
      run.current = token;
      setError(null);
      setHits(null);
      setLoaded(null);
      setView(null);
      try {
        const head = new Uint8Array(
          await picked.slice(0, Math.min(picked.size, HEAD_BYTES)).arrayBuffer()
        );
        const sampleBuf =
          picked.size <= SAMPLE
            ? head.length >= picked.size
              ? head
              : new Uint8Array(await picked.slice(0, picked.size).arrayBuffer())
            : new Uint8Array(await picked.slice(0, SAMPLE).arrayBuffer());
        if (run.current !== token) return;
        setLoaded({
          file: picked,
          head,
          matches: identify(head),
          sample: stats(sampleBuf),
          sampleBytes: sampleBuf.length,
          asciiRun: longestAsciiRun(sampleBuf),
        });
        await readWindow(picked, 0, page, token);
      } catch (problem) {
        if (run.current !== token) return;
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    },
    [page, readWindow]
  );

  const jump = useCallback(
    (offset: number) => {
      if (!loaded) return;
      void readWindow(loaded.file, offset, page, run.current);
    },
    [loaded, page, readWindow]
  );

  const changePage = useCallback(
    (next: number) => {
      setPage(next);
      if (loaded && view) void readWindow(loaded.file, view.offset, next, run.current);
    },
    [loaded, view, readWindow]
  );

  /**
   * Scan for the needle in 4 MB chunks, handing the event loop back between
   * them. Chunks overlap by needle length − 1 so a match straddling a boundary
   * is still found, and the ranges are arranged so no match is reported twice.
   */
  const runSearch = useCallback(async () => {
    if (!loaded) return;
    let needle: Uint8Array;
    try {
      needle = parseNeedle(query, kind);
    } catch (problem) {
      setHits(null);
      setError(
        problem instanceof NeedleError
          ? t(
              l,
              `搜尋字串讀不出來:${problem.message}`,
              `Cannot read the search input: ${problem.message}`
            )
          : String(problem)
      );
      return;
    }
    setError(null);
    setScanning(true);
    const token = run.current;
    const file = loaded.file;
    const ceiling = Math.min(file.size, SCAN_CEILING);
    const offsets: number[] = [];
    let pos = 0;
    let scanned = 0;
    try {
      while (pos < ceiling && offsets.length < MATCH_LIMIT) {
        const end = Math.min(ceiling, pos + SCAN_CHUNK);
        const chunk = new Uint8Array(await file.slice(pos, end).arrayBuffer());
        if (run.current !== token) return;
        scanned = end;
        for (const at of search(chunk, needle, {
          base: pos,
          limit: MATCH_LIMIT - offsets.length,
        })) {
          offsets.push(at);
        }
        if (end >= ceiling) break;
        pos = end - (needle.length - 1);
        setHits({ offsets: [...offsets], scanned, capped: false, needle: needle.length });
        // Let the browser paint between chunks; a frozen tab reads as a crash.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (run.current !== token) return;
      }
      setHits({
        offsets,
        scanned,
        capped: ceiling < file.size || offsets.length >= MATCH_LIMIT,
        needle: needle.length,
      });
      if (offsets.length > 0) await readWindow(file, alignDown(offsets[0], page), page, token);
    } catch (problem) {
      if (run.current !== token) return;
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      if (run.current === token) setScanning(false);
    }
  }, [kind, l, loaded, page, query, readWindow]);

  const cols = Number(width);
  const lines = useMemo(
    () => (view ? dumpLines(view.data, view.offset, cols, { upper }) : []),
    [view, cols, upper]
  );
  const text = useMemo(() => renderDump(lines, { upper }), [lines, upper]);

  /** Byte offsets covered by a hit, so the dump can mark them. */
  const marked = useMemo(() => {
    if (!hits || !view || hits.needle === 0) return null;
    const from = view.offset;
    const to = view.offset + view.data.length;
    const set = new Set<number>();
    for (const at of hits.offsets) {
      if (at + hits.needle <= from || at >= to) continue;
      for (let i = 0; i < hits.needle; i += 1) {
        const abs = at + i;
        if (abs >= from && abs < to) set.add(abs);
      }
    }
    return set.size > 0 ? set : null;
  }, [hits, view]);

  const atEnd = view ? view.offset + view.data.length >= size : true;

  return (
    <div>
      <Bench
        leftLabel={t(l, '檔案', 'FILE')}
        rightLabel={t(l, 'HEXDUMP', 'HEXDUMP')}
        leftAside={loaded ? <span className="inst-no">{fmtBytes(size)}</span> : null}
        rightAside={
          view ? (
            <span className="inst-no">
              {formatOffset(view.offset, upper)}
              {' + '}
              {count(view.data.length)}
            </span>
          ) : null
        }
        left={
          <>
            <DropZone
              l={l}
              onFiles={takeFile}
              hint={t(l, '把檔案拖進來,或點一下選檔', 'Drop a file here, or click to choose')}
            />
            {loaded ? (
              <Note>
                {loaded.file.name} — {fmtBytes(size)}
                {size === 0 ? t(l, '(空檔案)', ' (empty file)') : ''}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}

            <Row>
              <Seg
                label={t(l, '每列位元組', 'Bytes per line')}
                value={width}
                onChange={setWidth}
                options={[
                  { value: '8', label: '8' },
                  { value: '16', label: '16' },
                  { value: '32', label: '32' },
                ]}
              />
              <Seg
                label={t(l, '每頁位元組', 'Bytes per page')}
                value={String(page) as `${number}`}
                onChange={(next) => changePage(Number(next))}
                options={PAGE_SIZES.map((n) => ({ value: String(n) as `${number}`, label: String(n) }))}
              />
              <Check2 label={t(l, '大寫 hex', 'upper-case hex')} checked={upper} onChange={setUpper} />
            </Row>

            <Row>
              <Btn onClick={() => jump(0)} disabled={!loaded || !view || view.offset === 0}>
                {t(l, '開頭', 'start')}
              </Btn>
              <Btn
                onClick={() => view && jump(Math.max(0, view.offset - page))}
                disabled={!view || view.offset === 0}
              >
                {t(l, '上一頁', 'prev')}
              </Btn>
              <Btn
                onClick={() => view && jump(view.offset + page)}
                disabled={!view || atEnd}
              >
                {t(l, '下一頁', 'next')}
              </Btn>
              <Btn
                onClick={() => jump(alignDown(Math.max(0, size - 1), page))}
                disabled={!loaded || atEnd}
              >
                {t(l, '結尾', 'end')}
              </Btn>
            </Row>

            <Row>
              <Input
                label={t(l, '跳到位移', 'Go to offset')}
                hint={t(
                  l,
                  '十進位,或用 0x 前綴寫十六進位。超出檔尾會夾到最後一頁。',
                  'Decimal, or 0x-prefixed hex. Past the end clamps to the last page.'
                )}
                value={goto}
                onChange={setGoto}
                placeholder="0x200"
                invalid={goto.trim() !== '' && parseOffset(goto) === null}
              />
              <Btn
                onClick={() => {
                  const at = parseOffset(goto);
                  if (at === null) {
                    setError(t(l, '位移讀不出來。寫 1024 或 0x400。', 'Cannot read that offset. Write 1024 or 0x400.'));
                    return;
                  }
                  setError(null);
                  jump(alignDown(Math.min(at, Math.max(0, size - 1)), page));
                }}
                disabled={!loaded}
              >
                {t(l, '跳過去', 'go')}
              </Btn>
            </Row>

            <Row>
              <Seg
                label={t(l, '搜尋方式', 'Search as')}
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'hex', label: t(l, '位元組', 'hex') },
                  { value: 'text', label: t(l, '文字', 'text') },
                ]}
              />
              <Input
                label={t(l, '搜尋內容', 'Search for')}
                hint={
                  kind === 'hex'
                    ? t(
                        l,
                        '空白、冒號、逗號、0x 前綴都可以:de ad be ef 與 deadbeef 一樣。',
                        'Spaces, colons, commas and 0x prefixes are all accepted: de ad be ef equals deadbeef.'
                      )
                    : t(l, '以 UTF-8 位元組比對,不做大小寫折疊。', 'Matched as UTF-8 bytes, case-sensitive.')
                }
                value={query}
                onChange={setQuery}
                placeholder={kind === 'hex' ? '89 50 4e 47' : 'IHDR'}
              />
              <Btn onClick={() => void runSearch()} disabled={!loaded || scanning || query === ''} primary>
                {scanning ? t(l, '掃描中…', 'scanning…') : t(l, '搜尋', 'search')}
              </Btn>
            </Row>

            {scanning ? (
              <Note>
                {t(
                  l,
                  `已掃描 ${fmtBytes(hits?.scanned ?? 0)},找到 ${count(hits?.offsets.length ?? 0)} 處`,
                  `Scanned ${fmtBytes(hits?.scanned ?? 0)}, ${count(hits?.offsets.length ?? 0)} so far`
                )}
              </Note>
            ) : hits ? (
              <>
                <Note>
                  {t(
                    l,
                    `掃了 ${fmtBytes(hits.scanned)},找到 ${count(hits.offsets.length)} 處`,
                    `Scanned ${fmtBytes(hits.scanned)}, found ${count(hits.offsets.length)}`
                  )}
                  {hits.offsets.length > 0 ? (
                    <>
                      {' — '}
                      {hits.offsets.slice(0, 12).map((at) => (
                        <button
                          key={at}
                          type="button"
                          className="inst-no"
                          onClick={() => jump(alignDown(at, page))}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '0 0.3rem 0 0',
                            cursor: 'pointer',
                            color: 'var(--accent)',
                            textDecoration: 'underline',
                            font: 'inherit',
                          }}
                        >
                          {formatOffset(at, upper)}
                        </button>
                      ))}
                      {hits.offsets.length > 12
                        ? t(l, `…另有 ${count(hits.offsets.length - 12)} 處`, `…and ${count(hits.offsets.length - 12)} more`)
                        : null}
                    </>
                  ) : null}
                </Note>
                {hits.capped ? (
                  <Note error>
                    {hits.offsets.length >= MATCH_LIMIT
                      ? t(
                          l,
                          `結果停在 ${MATCH_LIMIT} 處,後面沒有再掃。要找更少見的位元組序列請把搜尋字串加長。`,
                          `Stopped at ${MATCH_LIMIT} matches. Lengthen the needle to find something rarer.`
                        )
                      : t(
                          l,
                          `只掃了前 ${fmtBytes(SCAN_CEILING)}。再往後不掃,是為了不讓這個分頁卡住。`,
                          `Only the first ${fmtBytes(SCAN_CEILING)} were scanned — the ceiling exists so the tab stays responsive.`
                        )}
                  </Note>
                ) : null}
              </>
            ) : null}
          </>
        }
        right={
          view && view.data.length > 0 ? (
            <>
              <div
                className="inst-out inst-scroll"
                aria-live="polite"
                aria-atomic="false"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'pre',
                  lineHeight: 1.55,
                }}
              >
                {lines.map((line) => (
                  <div key={line.offset}>
                    <span style={{ color: 'var(--fg-faint)' }}>{formatOffset(line.offset, upper)}</span>
                    {'  '}
                    {line.hex.map((cell, k) => (
                      <span key={k}>
                        <Byte on={marked?.has(line.offset + k) ?? false}>{cell || '  '}</Byte>
                        {k === line.hex.length - 1 ? '' : (k + 1) % 8 === 0 ? '  ' : ' '}
                      </span>
                    ))}
                    {'  |'}
                    {[...line.ascii].map((ch, k) => (
                      <Byte key={k} on={marked?.has(line.offset + k) ?? false}>
                        {ch}
                      </Byte>
                    ))}
                    {'|'}
                  </div>
                ))}
              </div>
              <Row>
                <CopyButton l={l} text={text} label={t(l, '複製這一頁', 'copy this page')} />
                <span className="inst-hint">
                  {t(
                    l,
                    'ASCII 側欄只顯示 0x20–0x7E,其餘一律是句點 —— 不替 0x80 以上的位元組猜編碼。',
                    'The gutter shows only 0x20–0x7E; everything else is a full stop. No encoding is guessed for high bytes.'
                  )}
                </span>
              </Row>
            </>
          ) : (
            <Note>
              {loaded && size === 0
                ? t(l, '這個檔案是 0 位元組,沒有東西可以印。', 'That file is 0 bytes — nothing to dump.')
                : t(
                    l,
                    '選一個檔案。畫面上這幾百個位元組是唯一被讀進來的部分,檔案多大都一樣快。',
                    'Choose a file. Only the few hundred bytes on screen are read, so size does not matter.'
                  )}
            </Note>
          )
        }
      />

      {loaded ? (
        <Panel
          label={t(l, '檔頭簽章', 'SIGNATURES')}
          aside={<span className="inst-no">{count(loaded.matches.length)}</span>}
        >
          {loaded.matches.length > 0 ? (
            <Table
              head={[
                t(l, '判定', 'identified as'),
                t(l, '位移', 'at'),
                t(l, '長度', 'bytes'),
                t(l, '相符的位元組', 'matched bytes'),
                t(l, '備註', 'note'),
              ]}
              align={['left', 'right', 'right', 'left', 'left']}
              rows={loaded.matches.map((m) => [
                <span key="n">{m.signature.name}</span>,
                <span key="o" className="inst-no">
                  {formatOffset(m.offset, upper)}
                </span>,
                <span key="l" className="inst-no">
                  {m.length}
                </span>,
                <span key="b" className="inst-no">
                  {toHex(loaded.head.subarray(m.offset, m.offset + m.length), ' ')}
                </span>,
                <span key="a" className="inst-hint" style={{ margin: 0 }}>
                  {m.signature.also ?? '—'}
                </span>,
              ])}
            />
          ) : (
            <Note>
              {t(
                l,
                '前 32 KB 沒有對上表裡任何簽章。很多格式沒有檔頭簽章(純文字、CSV、原始資料),這不代表檔案壞了。',
                'Nothing in the first 32 KB matched the table. Plenty of formats have no signature at all (plain text, CSV, raw data) — this is not a sign of damage.'
              )}
            </Note>
          )}
          <Note>
            {t(
              l,
              '簽章是推論不是證明。PK 03 04 開頭同時是 zip、docx、jar、apk 與 epub;CA FE BA BE 同時是 Java class 與 Mach-O universal binary。所以這裡把所有相符的都列出來,不挑一個講得很篤定。',
              'A signature is inference, not proof. PK 03 04 is equally zip, docx, jar, apk and epub; CA FE BA BE is both a Java class file and a Mach-O universal binary. Every match is listed rather than one confident guess.'
            )}
          </Note>
        </Panel>
      ) : null}

      {loaded && loaded.sampleBytes > 0 ? (
        <Panel
          label={t(l, '位元組統計', 'BYTE STATISTICS')}
          aside={
            <span className="inst-no">
              {loaded.sampleBytes < size
                ? t(l, `前 ${fmtBytes(loaded.sampleBytes)} 取樣`, `first ${fmtBytes(loaded.sampleBytes)}`)
                : t(l, '全檔', 'whole file')}
            </span>
          }
        >
          <Table
            head={[t(l, '量測', 'measure'), t(l, '值', 'value'), t(l, '意思', 'reading')]}
            align={['left', 'right', 'left']}
            rows={[
              [
                t(l, '熵', 'entropy'),
                <span key="e" className="inst-no">
                  {fixed(loaded.sample.entropy, 3)} {t(l, '位元/位元組', 'bits/byte')}
                </span>,
                verdictText(l, loaded.sample.verdict),
              ],
              [
                t(l, '可列印 ASCII', 'printable ASCII'),
                <span key="p" className="inst-no">
                  {fixed((loaded.sample.printable / loaded.sampleBytes) * 100, 1)}%
                </span>,
                t(l, '0x20–0x7E 佔的比例', 'share of bytes in 0x20–0x7E'),
              ],
              [
                t(l, '零位元組', 'zero bytes'),
                <span key="z" className="inst-no">
                  {count(loaded.sample.zero)}
                </span>,
                t(l, '大量出現通常是二進位或對齊填充', 'many of them usually means binary data or alignment padding'),
              ],
              [
                t(l, '高位位元組', 'high bytes'),
                <span key="h" className="inst-no">
                  {count(loaded.sample.high)}
                </span>,
                t(l, '≥ 0x80。純 ASCII 檔應該是 0', 'bytes ≥ 0x80. A pure-ASCII file has none'),
              ],
              [
                t(l, '最長可列印連續段', 'longest printable run'),
                <span key="r" className="inst-no">
                  {count(loaded.asciiRun)}
                </span>,
                t(l, '相當於 strings(1) 能撈到的最長一段', 'the longest string strings(1) would pull out'),
              ],
            ]}
          />
          <Note>
            {t(
              l,
              '熵是「這段位元組有多不可預測」,0 到 8。英文文字大約 4.5;壓縮過或加密過的資料會貼著 8,因為兩者存在的目的就是把這裡量的冗餘拿掉。所以高熵可以用來判斷「這塊是不是壓縮/加密資料」,但分不出是哪一種。',
              'Entropy is how unpredictable the bytes are, 0 to 8. English text sits near 4.5; compressed or encrypted data crowds against 8, because both exist to remove exactly the redundancy this measures. High entropy tells you a region is compressed or encrypted — not which.'
            )}
          </Note>
        </Panel>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '檔案', 'file'), v: loaded ? fmtBytes(size) : '—' },
          { k: t(l, '已讀取', 'read'), v: loaded ? fmtBytes(loaded.sampleBytes + (view?.data.length ?? 0)) : '—' },
          { k: t(l, '視窗位移', 'window'), v: view ? `0x${formatOffset(view.offset, false)}` : '—' },
          { k: t(l, '簽章', 'signatures'), v: loaded ? count(loaded.matches.length) : '—' },
          { k: t(l, '搜尋命中', 'hits'), v: hits ? count(hits.offsets.length) : '—' },
        ]}
      />
    </div>
  );
}

/**
 * A marked byte gets colour *and* an underline: the highlight has to survive a
 * reader who cannot tell the accent from the body text.
 */
function Byte({ on, children }: { on: boolean; children: string }) {
  return on ? (
    <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{children}</span>
  ) : (
    <>{children}</>
  );
}

function alignDown(offset: number, page: number): number {
  return Math.max(0, Math.floor(offset / page) * page);
}

/** `1024` or `0x400`, nothing else. Returns null rather than guessing. */
function parseOffset(text: string): number | null {
  const clean = text.trim().replace(/[\s,_]/g, '');
  if (clean === '') return null;
  const hex = /^0[xX]([0-9a-fA-F]+)$/.exec(clean);
  if (hex) return Number.parseInt(hex[1], 16);
  if (!/^[0-9]+$/.test(clean)) return null;
  const n = Number.parseInt(clean, 10);
  return Number.isSafeInteger(n) ? n : null;
}

function verdictText(l: Parameters<typeof t>[0], verdict: ByteStats['verdict']): string {
  if (verdict === 'low') return t(l, '重複性很高 —— 填充、稀疏檔或單調資料', 'highly repetitive — padding, a sparse file or monotonous data');
  if (verdict === 'text') return t(l, '像文字或結構化來源碼', 'looks like text or structured source');
  if (verdict === 'mixed') return t(l, '混合:有結構的二進位,像可執行檔或未壓縮容器', 'mixed: structured binary such as an executable or an uncompressed container');
  return t(l, '接近隨機 —— 壓縮過、加密過,或本來就是雜訊', 'near-random — compressed, encrypted, or noise to begin with');
}
