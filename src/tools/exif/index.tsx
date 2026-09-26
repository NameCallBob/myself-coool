'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  CopyButton,
  DropZone,
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
  MAX_FILE_BYTES,
  cleanName,
  readMetadata,
  stripMetadata,
  type IfdName,
  type MetadataReport,
} from './logic';

type Loaded = {
  name: string;
  data: Uint8Array;
  report: MetadataReport;
};

type View = 'all' | 'identifying';

const IFD_ORDER: IfdName[] = ['ifd0', 'exif', 'gps', 'interop', 'ifd1'];

const IFD_LABEL: Record<IfdName, { zh: string; en: string }> = {
  ifd0: { zh: 'IFD0 影像', en: 'IFD0 image' },
  exif: { zh: 'Exif 子目錄', en: 'Exif sub-IFD' },
  gps: { zh: 'GPS 子目錄', en: 'GPS sub-IFD' },
  interop: { zh: '互通性', en: 'Interop' },
  ifd1: { zh: 'IFD1 縮圖', en: 'IFD1 thumbnail' },
};

export default function Exif({ l }: ToolProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ name: string; from: number; to: number; blocks: number } | null>(null);

  const take = useCallback(async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setError(null);
    setDone(null);
    if (picked.size > MAX_FILE_BYTES) {
      setLoaded(null);
      setError(
        t(
          l,
          `檔案 ${fmtBytes(picked.size)} 超過上限 ${fmtBytes(MAX_FILE_BYTES)}。這個工具會把整個檔案讀進記憶體再重寫,所以設了界線。`,
          `${fmtBytes(picked.size)} is over the ${fmtBytes(MAX_FILE_BYTES)} ceiling. This tool holds the whole file in memory to rewrite it, hence the limit.`
        )
      );
      return;
    }
    try {
      const data = new Uint8Array(await picked.arrayBuffer());
      const report = readMetadata(data);
      setLoaded({ name: picked.name, data, report });
      // Default selection: everything that identifies a person, a device or a
      // place. Colour profiles and JFIF headers start unchecked — dropping them
      // changes how the image decodes, which is not what "strip metadata" means.
      setChosen(new Set(report.blocks.filter((b) => b.identifying).map((b) => b.id)));
    } catch (problem) {
      setLoaded(null);
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [l]);

  const report = loaded?.report ?? null;

  const grouped = useMemo(() => {
    if (!report) return [];
    const rows = view === 'identifying' ? report.fields.filter((f) => f.identifying) : report.fields;
    return IFD_ORDER.map((ifd) => ({ ifd, fields: rows.filter((f) => f.ifd === ifd) })).filter(
      (group) => group.fields.length > 0
    );
  }, [report, view]);

  const chosenBytes = useMemo(() => {
    if (!report) return 0;
    return report.blocks.filter((b) => chosen.has(b.id)).reduce((sum, b) => sum + b.bytes, 0);
  }, [report, chosen]);

  const metaBytes = report?.blocks.reduce((sum, b) => sum + b.bytes, 0) ?? 0;

  const toggle = (id: string, on: boolean) => {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** Rewrite and hand the result to the browser's save dialog. No network. */
  const save = () => {
    if (!loaded || !report) return;
    setError(null);
    try {
      const result = stripMetadata(loaded.data, report, [...chosen]);
      const name = cleanName(loaded.name);
      const blob = new Blob([result.data as Uint8Array<ArrayBuffer>], {
        type: report.container === 'png' ? 'image/png' : 'image/jpeg',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      setDone({ name, from: loaded.data.length, to: result.data.length, blocks: result.removed.length });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const containerLabel = report
    ? report.container === 'unknown'
      ? t(l, '無法辨識', 'unrecognised')
      : report.container.toUpperCase()
    : '—';

  const summary = report?.summary ?? {};
  const summaryRows: [string, string | undefined][] = [
    [t(l, '製造商', 'make'), summary.make],
    [t(l, '型號', 'model'), summary.model],
    [t(l, '鏡頭', 'lens'), summary.lens],
    [t(l, '拍攝時間', 'taken'), summary.dateTaken],
    [t(l, '曝光', 'exposure'), summary.exposure],
    [t(l, '像素', 'pixels'), summary.pixels],
    [t(l, '處理軟體', 'software'), summary.software],
    [t(l, '機身序號', 'serial'), summary.serial],
  ];
  const filledSummary = summaryRows.filter((row): row is [string, string] => !!row[1]);

  return (
    <div>
      <Bench
        leftLabel={t(l, '檔案', 'FILE')}
        rightLabel={t(l, '欄位', 'FIELDS')}
        leftAside={<span className="inst-no">{loaded ? fmtBytes(loaded.data.length) : '—'}</span>}
        rightAside={
          report && report.fields.length > 0 ? (
            <Seg
              label={t(l, '顯示範圍', 'Scope')}
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: t(l, '全部', 'all') },
                { value: 'identifying', label: t(l, '可識別身分', 'identifying') },
              ]}
            />
          ) : null
        }
        left={
          <>
            <DropZone
              l={l}
              onFiles={take}
              accept="image/jpeg,image/png,image/tiff,.jpg,.jpeg,.png,.tif,.tiff"
              hint={t(l, '把照片拖進來,或點一下選檔(JPEG / PNG / TIFF)', 'Drop a photo here, or click to choose (JPEG / PNG / TIFF)')}
            />
            {error ? <Note error>{error}</Note> : null}

            {loaded && report ? (
              <>
                <Table
                  head={[t(l, '項目', 'item'), t(l, '值', 'value')]}
                  rows={[
                    [t(l, '檔名', 'name'), <span key="n" className="inst-wrap">{loaded.name}</span>],
                    [t(l, '容器', 'container'), containerLabel],
                    [t(l, '檔案大小', 'size'), fmtBytes(loaded.data.length)],
                    [
                      t(l, '中繼資料', 'metadata'),
                      `${fmtBytes(metaBytes)} / ${count(report.blocks.length)} ${t(l, '段', 'blocks')}`,
                    ],
                    [t(l, 'Exif 欄位', 'exif fields'), count(report.fields.length)],
                  ]}
                />

                {filledSummary.length > 0 ? (
                  <div className="mt-3">
                    <Table
                      head={[t(l, '摘要', 'summary'), t(l, '值', 'value')]}
                      rows={filledSummary.map(([k, v]) => [
                        k,
                        <span key={k} className="inst-wrap">{v}</span>,
                      ])}
                    />
                  </div>
                ) : null}

                {report.gps ? (
                  <div className="mt-3">
                    <Table
                      head={[t(l, 'GPS', 'GPS'), t(l, '值', 'value')]}
                      rows={[
                        [
                          t(l, '十進位座標', 'decimal'),
                          <span key="d" style={{ fontFamily: 'var(--font-mono)' }}>
                            {report.gps.decimal}
                          </span>,
                        ],
                        [t(l, '緯度', 'latitude'), report.gps.latitude.toFixed(6)],
                        [t(l, '經度', 'longitude'), report.gps.longitude.toFixed(6)],
                        ...(report.gps.altitude !== undefined
                          ? [[t(l, '海拔', 'altitude'), `${report.gps.altitude.toFixed(1)} m`] as [string, string]]
                          : []),
                        ...(report.gps.utc ? [[t(l, 'GPS 時間', 'gps time'), report.gps.utc] as [string, string]] : []),
                      ]}
                    />
                    <Row>
                      <CopyButton l={l} text={report.gps.decimal} label={t(l, '複製座標', 'copy coords')} />
                    </Row>
                    <Note error>
                      {t(
                        l,
                        '這張照片帶著拍攝地點。座標寫到小數第六位大約是 0.1 公尺,足以指出是哪一戶。要對外貼圖就把下面的 Exif 段一起洗掉。',
                        'This photo carries where it was taken. Six decimals is about 0.1 m — enough to name a doorway. Strip the Exif block below before posting it.'
                      )}
                    </Note>
                  </div>
                ) : null}

                {report.warnings.length > 0 ? (
                  <div className="mt-3">
                    {report.warnings.map((warning) => (
                      <Note key={warning}>{warning}</Note>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <Note>
                {t(
                  l,
                  '選一張照片。解析與重寫都在這個分頁做完,檔案不會送到任何地方。',
                  'Choose a photo. Parsing and rewriting both happen in this tab; the file goes nowhere.'
                )}
              </Note>
            )}
          </>
        }
        right={
          report ? (
            grouped.length > 0 ? (
              <>
                {grouped.map((group) => (
                  <div key={group.ifd} className="mt-3">
                    <Table
                      head={[
                        t(l, IFD_LABEL[group.ifd].zh, IFD_LABEL[group.ifd].en),
                        t(l, '型別', 'type'),
                        t(l, '值', 'value'),
                      ]}
                      rows={group.fields.map((field) => [
                        <span key="k" className="inst-wrap">
                          {field.name}
                          {field.identifying ? (
                            <span className="inst-flag" style={{ marginLeft: '0.4rem' }}>
                              {t(l, '可識別', 'identifying')}
                            </span>
                          ) : null}
                        </span>,
                        <span key="t" className="inst-no" style={{ whiteSpace: 'nowrap' }}>
                          {field.typeName}
                          {field.count > 1 ? `×${field.count}` : ''}
                        </span>,
                        <span key="v" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                          {field.value}
                        </span>,
                      ])}
                    />
                  </div>
                ))}
                <Note>
                  {t(
                    l,
                    'MakerNote 這類廠商私有區塊只顯示前 64 位元組的原始值——它的內部格式每家不同且未公開,這裡不猜。移除時整段都會拿掉。',
                    'Vendor blobs such as MakerNote are shown as their first 64 raw bytes: the layouts are proprietary and undocumented, so nothing is guessed. Removal drops the whole block.'
                  )}
                </Note>
              </>
            ) : (
              <Note>
                {report.container === 'unknown'
                  ? t(l, '沒有讀到任何欄位。', 'No fields were read.')
                  : view === 'identifying'
                    ? t(l, '沒有可識別身分的欄位。', 'No identifying fields.')
                    : t(l, '這個檔案裡沒有 Exif 欄位。', 'This file carries no Exif fields.')}
              </Note>
            )
          ) : (
            <Note>
              {t(
                l,
                'Exif 是 TIFF 結構:一個位元組序標頭,後面接目錄表,長值用位移指向別處。這裡由本頁的剖析器逐欄位讀出來。',
                'Exif is TIFF inside: a byte-order header, then tables of entries whose long values live at offsets. Read here by this page’s own parser.'
              )}
            </Note>
          )
        }
      />

      <Panel
        label={t(l, '移除', 'REMOVE')}
        aside={
          report ? (
            <span className="inst-no">
              {fmtBytes(chosenBytes)} / {fmtBytes(metaBytes)}
            </span>
          ) : null
        }
      >
        {report && report.blocks.length > 0 ? (
          <>
            <Table
              head={[t(l, '區塊', 'block'), t(l, '位移', 'offset'), t(l, '大小', 'size'), t(l, '內容', 'carries')]}
              align={['left', 'left', 'right', 'left']}
              rows={report.blocks.map((block) => [
                <Check2
                  key="c"
                  label={block.label}
                  checked={chosen.has(block.id)}
                  onChange={(on) => toggle(block.id, on)}
                />,
                <span key="o" className="inst-no">
                  @{block.offset}
                </span>,
                <span key="s" className="inst-no">
                  {fmtBytes(block.bytes)}
                </span>,
                <span key="w" className="inst-wrap">
                  {block.identifying
                    ? t(l, '可識別身分的資料', 'identifying data')
                    : t(l, '無身分資料', 'no identifying data')}
                  {block.affectsRendering
                    ? t(l, ';移除會改變顯示結果', '; dropping it changes how the image displays')
                    : ''}
                </span>,
              ])}
            />
            <Note>
              {t(
                l,
                '輸出是把選中的段落從位元組流裡刪掉,其餘位元組原封不動複製——包含壓縮後的影像資料。畫質不會掉一格,因為沒有重新編碼。',
                'The output is the original byte stream with the selected blocks deleted and everything else copied verbatim, compressed image data included. No re-encoding, so no quality loss.'
              )}
            </Note>
            {report.blocks.some((b) => b.affectsRendering && chosen.has(b.id)) ? (
              <Note error>
                {t(
                  l,
                  '你選了會影響顯示的區塊(ICC 色彩描述或 JFIF 標頭)。拿掉 ICC 之後,寬色域照片在多數瀏覽器會被當成 sRGB,顏色會偏。確定要就繼續。',
                  'You selected a block that affects display (an ICC profile or the JFIF header). Without ICC, a wide-gamut photo is treated as sRGB and the colours shift. Continue only if that is what you want.'
                )}
              </Note>
            ) : null}
            {!report.removable ? (
              <Note error>
                {t(
                  l,
                  'TIFF 只能讀不能寫。要清掉 TIFF 的中繼資料得重建每一個 IFD 並改寫所有 strip 位移,寫半套比不寫更糟,所以這裡不做。',
                  'TIFF is read-only here. Stripping it means rebuilding every IFD and rewriting every strip offset; a half-correct TIFF writer is worse than none.'
                )}
              </Note>
            ) : null}
            <Row>
              <Btn onClick={save} primary disabled={!report.removable || chosen.size === 0}>
                {t(l, '重寫並下載', 'rewrite and download')}
              </Btn>
              <Btn
                onClick={() => setChosen(new Set(report.blocks.filter((b) => b.identifying).map((b) => b.id)))}
              >
                {t(l, '只選可識別身分的', 'select identifying only')}
              </Btn>
              <Btn onClick={() => setChosen(new Set(report.blocks.map((b) => b.id)))}>
                {t(l, '全選', 'select all')}
              </Btn>
              <Btn onClick={() => setChosen(new Set())}>{t(l, '全不選', 'select none')}</Btn>
              <Btn
                onClick={() => {
                  setLoaded(null);
                  setChosen(new Set());
                  setDone(null);
                  setError(null);
                }}
              >
                {t(l, '清空', 'clear')}
              </Btn>
            </Row>
            {done ? (
              <Note>
                {t(
                  l,
                  `已輸出 ${done.name}:移除 ${done.blocks} 段,${fmtBytes(done.from)} → ${fmtBytes(done.to)}。原檔沒有被改動。`,
                  `Wrote ${done.name}: ${done.blocks} blocks removed, ${fmtBytes(done.from)} → ${fmtBytes(done.to)}. The original was not touched.`
                )}
              </Note>
            ) : null}
          </>
        ) : (
          <Note>
            {report
              ? t(l, '這個檔案沒有可移除的中繼資料段。', 'This file has no metadata blocks to remove.')
              : t(
                  l,
                  '讀到檔案之後,這裡會列出所有中繼資料段落,勾選要刪掉的。',
                  'Once a file is read, every metadata block is listed here for you to select.'
                )}
          </Note>
        )}
      </Panel>

      <Panel label={t(l, '界線', 'LIMITS')}>
        <Table
          head={[t(l, '項目', 'item'), t(l, '狀況', 'status')]}
          rows={[
            [
              'JPEG',
              t(l, '讀取與重寫都支援。APP1 Exif、APP1 XMP、APP13 IPTC、COM 註解、其他 APPn 都可刪。', 'Read and rewrite. APP1 Exif, APP1 XMP, APP13 IPTC, COM comments and other APPn segments can all be dropped.'),
            ],
            [
              'PNG',
              t(l, '讀取與重寫都支援:eXIf、tEXt、iTXt、zTXt、tIME。zTXt 與壓縮過的 iTXt 只列出不解壓(無外部解壓縮函式庫)。', 'Read and rewrite: eXIf, tEXt, iTXt, zTXt, tIME. zTXt and compressed iTXt are listed but not inflated — no decompression library here.'),
            ],
            [
              'TIFF',
              t(l, '只讀。', 'Read only.'),
            ],
            [
              'HEIC / WebP / AVIF',
              t(l, '不處理。這三種是 ISO-BMFF 或 RIFF 容器,Exif 的位置與 JPEG 完全不同,沒做就不假裝有做。', 'Not handled. These are ISO-BMFF or RIFF containers where Exif sits somewhere else entirely; not implemented, and not pretended.'),
            ],
            [
              t(l, '縮圖', 'thumbnail'),
              t(l, 'IFD1 的內嵌縮圖在 APP1 Exif 段裡,刪掉 Exif 就一起消失。', 'The IFD1 thumbnail lives inside the APP1 Exif segment, so dropping Exif removes it too.'),
            ],
            [
              t(l, '像素本身', 'the pixels'),
              t(l, '不動。要把畫面內容遮掉請用「截圖打碼」。', 'Untouched. To hide what is in the picture, use the redaction tool.'),
            ],
          ]}
        />
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '檔案', 'file'), v: loaded ? fmtBytes(loaded.data.length) : '—' },
          { k: t(l, '容器', 'container'), v: containerLabel },
          { k: t(l, '欄位', 'fields'), v: report ? count(report.fields.length) : '—' },
          { k: t(l, '中繼資料', 'metadata'), v: report ? fmtBytes(metaBytes) : '—' },
          { k: 'GPS', v: report ? (report.gps ? t(l, '有座標', 'present') : t(l, '無', 'none')) : '—' },
          { k: t(l, '待移除', 'selected'), v: report ? fmtBytes(chosenBytes) : '—' },
        ]}
      />
    </div>
  );
}
