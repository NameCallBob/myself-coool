'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, Check2, CopyButton, Input, Note, Panel, Readout, Row, Seg, Table } from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_DIM,
  PRESETS,
  PRESET_VERSION,
  analyse,
  fitBox,
  formatRatio,
  heightFor,
  parseRatio,
  snap,
  widthFor,
  type PresetGroup,
  type Ratio,
} from './logic';

type Draft = { group: PresetGroup; label: string; w: string; h: string };
type Filter = PresetGroup | 'all';

const MULTIPLES = ['1', '2', '8', '16'] as const;
const BOUNDS = ['9', '16', '64', '999'] as const;
/** Editing 30-odd rows is the point; editing 300 is a different tool. */
const MAX_ROWS = 80;

function toDrafts(): Draft[] {
  return PRESETS.map((preset) => ({
    group: preset.group,
    label: preset.label,
    w: String(preset.w),
    h: String(preset.h),
  }));
}

/** A field value only counts as a size when it is a usable one. */
function size(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_DIM) return null;
  return n;
}

function percent(x: number): string {
  if (x === 0) return '0%';
  if (x < 0.000005) return '< 0.001%';
  return `${fixed(x * 100, 3)}%`;
}

export default function AspectRatio({ l }: ToolProps) {
  const [ratioText, setRatioText] = useState('16:9');
  const [w, setW] = useState('1920');
  const [h, setH] = useState('1080');
  const [locked, setLocked] = useState(true);
  const [keep, setKeep] = useState<'w' | 'h'>('w');
  const [multiple, setMultiple] = useState<(typeof MULTIPLES)[number]>('1');
  const [bound, setBound] = useState<(typeof BOUNDS)[number]>('64');

  const [boxW, setBoxW] = useState('1200');
  const [boxH, setBoxH] = useState('630');
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  const [rows, setRows] = useState<Draft[]>(toDrafts);
  const [filter, setFilter] = useState<Filter>('all');

  const ratio = useMemo(() => parseRatio(ratioText), [ratioText]);
  const step = Number(multiple);
  const wNum = size(w);
  const hNum = size(h);

  const report = useMemo(() => (wNum && hNum ? analyse(wNum, hNum, Number(bound)) : null), [wNum, hNum, bound]);

  /** Every write goes through one of these, so the pair on screen is always a
   *  pair the arithmetic produced — no effect syncing it up afterwards. */
  const editW = useCallback(
    (value: string) => {
      setW(value);
      const n = size(value);
      if (!locked || !ratio || n === null) return;
      setH(String(snap(heightFor(ratio, n), step)));
    },
    [locked, ratio, step]
  );

  const editH = useCallback(
    (value: string) => {
      setH(value);
      const n = size(value);
      if (!locked || !ratio || n === null) return;
      setW(String(snap(widthFor(ratio, n), step)));
    },
    [locked, ratio, step]
  );

  const editRatio = useCallback(
    (value: string) => {
      setRatioText(value);
      const next = parseRatio(value);
      if (!locked || !next) return;
      if (keep === 'w') {
        const n = size(w);
        if (n !== null) setH(String(snap(heightFor(next, n), step)));
      } else {
        const n = size(h);
        if (n !== null) setW(String(snap(widthFor(next, n), step)));
      }
    },
    [locked, keep, w, h, step]
  );

  const applySize = useCallback(
    (nextW: number, nextH: number) => {
      setW(String(nextW));
      setH(String(nextH));
      setRatioText(formatRatio(analyse(nextW, nextH, Number(bound)).exact ?? { w: nextW, h: nextH }));
    },
    [bound]
  );

  /** The rounding the snap actually did, stated rather than hidden. */
  const drift = useMemo(() => {
    if (!locked || !ratio || wNum === null || hNum === null) return null;
    const want = ratio.w / ratio.h;
    const got = wNum / hNum;
    if (got === want) return null;
    return { want, got, error: Math.abs(got - want) / want };
  }, [locked, ratio, wNum, hNum]);

  const fit = useMemo(() => {
    const bw = size(boxW);
    const bh = size(boxH);
    const source: Ratio | null = ratio ?? (wNum && hNum ? { w: wNum, h: hNum } : null);
    if (!source || bw === null || bh === null) return null;
    return { box: { w: bw, h: bh }, result: fitBox(source, { w: bw, h: bh }, fitMode) };
  }, [boxW, boxH, ratio, wNum, hNum, fitMode]);

  const visible = rows
    .map((draft, index) => ({ draft, index }))
    .filter((row) => filter === 'all' || row.draft.group === filter);

  const editRow = (index: number, key: keyof Draft, value: string) =>
    setRows((current) =>
      current.map((draft, i) => (i === index ? { ...draft, [key]: value } : draft))
    );

  const groupLabel: Record<PresetGroup, string> = {
    display: t(l, '顯示器', 'displays'),
    web: t(l, '社群與網頁', 'web & social'),
    mobile: t(l, '行動裝置', 'mobile'),
    print: t(l, '印刷', 'print'),
  };

  return (
    <div>
      <Panel
        label={t(l, '尺寸換算', 'SCALE')}
        aside={
          report ? (
            <span className="inst-no">
              {report.exact ? formatRatio(report.exact) : formatRatio(report.nearest)}
              {report.name && report.name !== formatRatio(report.exact ?? report.nearest)
                ? ` · ${report.name}`
                : ''}
            </span>
          ) : null
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
            gap: '1rem',
          }}
        >
          <Input
            label={t(l, '寬 px', 'width px')}
            value={w}
            onChange={editW}
            type="text"
            invalid={w.trim() !== '' && wNum === null}
            placeholder="1920"
          />
          <Input
            label={t(l, '高 px', 'height px')}
            value={h}
            onChange={editH}
            type="text"
            invalid={h.trim() !== '' && hNum === null}
            placeholder="1080"
          />
          <Input
            label={t(l, '比例', 'ratio')}
            hint={t(l, '16:9、16/9、2.39:1,或單一小數。', '16:9, 16/9, 2.39:1, or a bare decimal.')}
            value={ratioText}
            onChange={editRatio}
            invalid={ratioText.trim() !== '' && !ratio}
            placeholder="16:9"
          />
        </div>

        <Row>
          <Check2
            label={t(l, '鎖住比例', 'lock the ratio')}
            checked={locked}
            onChange={setLocked}
          />
          <Seg
            label={t(l, '改比例時保持哪一邊', 'Which side to keep when the ratio changes')}
            value={keep}
            onChange={setKeep}
            options={[
              { value: 'w', label: t(l, '保持寬', 'keep width') },
              { value: 'h', label: t(l, '保持高', 'keep height') },
            ]}
          />
          <Seg
            label={t(l, '對齊到倍數', 'Snap to a multiple')}
            value={multiple}
            onChange={setMultiple}
            options={MULTIPLES.map((m) => ({ value: m, label: m === '1' ? t(l, '整數', '1 px') : `×${m}` }))}
          />
          <Btn
            onClick={() => {
              if (report) setRatioText(formatRatio(report.exact ?? report.nearest));
            }}
            disabled={!report}
          >
            {t(l, '用現在的寬高反推比例', 'ratio from these sizes')}
          </Btn>
          <Btn
            onClick={() => {
              setW(h);
              setH(w);
              if (ratio) setRatioText(formatRatio({ w: ratio.h, h: ratio.w }));
            }}
          >
            {t(l, '轉向', 'rotate')}
          </Btn>
          <CopyButton l={l} text={wNum && hNum ? `${wNum}×${hNum}` : ''} label={t(l, '複製尺寸', 'copy size')} />
        </Row>

        {!locked ? (
          <Note>
            {t(
              l,
              '比例已解鎖:寬高各自獨立,下面的讀數是量出來的,不是算出來的。',
              'Ratio unlocked: the two sides move independently and the readings below are measured, not derived.'
            )}
          </Note>
        ) : null}

        {drift ? (
          <Note>
            {t(
              l,
              `四捨五入到 ${multiple} 的倍數之後,螢幕上這組數字的實際比例是 ${drift.got.toFixed(6)},不是 ${drift.want.toFixed(6)},差 ${percent(drift.error)}。`,
              `After snapping to a multiple of ${multiple}, this pair is actually ${drift.got.toFixed(6)}, not ${drift.want.toFixed(6)} — off by ${percent(drift.error)}.`
            )}
          </Note>
        ) : null}

        {(w.trim() !== '' && wNum === null) || (h.trim() !== '' && hNum === null) ? (
          <Note error>
            {t(
              l,
              `寬高要是 0 到 ${count(MAX_DIM)} 之間的正數。`,
              `Width and height must be positive numbers no larger than ${count(MAX_DIM)}.`
            )}
          </Note>
        ) : null}
      </Panel>

      <div className="mt-8">
        <Panel
          label={t(l, '比例分析', 'RATIO')}
          aside={
            <Seg
              label={t(l, '整數比的分母上限', 'Denominator bound for the simple ratio')}
              value={bound}
              onChange={setBound}
              options={BOUNDS.map((b) => ({ value: b, label: `≤ ${b}` }))}
            />
          }
        >
          <div aria-live="polite">
            <Table
              head={[t(l, '項目', 'reading'), t(l, '值', 'value'), t(l, '說明', 'note')]}
              align={['left', 'right', 'left']}
              rows={
                report
                  ? [
                      [
                        t(l, '精確整數比', 'exact ratio'),
                        <span key="v" className="inst-no">
                          {report.exact ? formatRatio(report.exact) : '—'}
                        </span>,
                        report.exact
                          ? t(l, '兩邊同除最大公因數(輾轉相除法)', 'both sides divided by their GCD (Euclid)')
                          : t(l, '寬高不是整數,沒有精確整數比', 'not whole pixels, so there is no exact integer ratio'),
                      ],
                      [
                        t(l, '最接近的整數比', 'nearest simple ratio'),
                        <span key="v" className="inst-no">
                          {formatRatio(report.nearest)}
                        </span>,
                        report.nearest.exact
                          ? t(l, '就是精確值', 'this is the exact value')
                          : t(
                              l,
                              `連分數逼近,分母 ≤ ${bound},誤差 ${percent(report.nearest.error)}`,
                              `continued-fraction fit, denominator ≤ ${bound}, off by ${percent(report.nearest.error)}`
                            ),
                      ],
                      [
                        t(l, '小數值 w/h', 'decimal w/h'),
                        <span key="v" className="inst-no">
                          {report.value.toFixed(6)}
                        </span>,
                        `${(1 / report.value).toFixed(6)} ${t(l, '(倒過來)', '(inverted)')}`,
                      ],
                      [
                        t(l, '常見名稱', 'common name'),
                        <span key="v" className="inst-no">
                          {report.name ?? '—'}
                        </span>,
                        report.name
                          ? t(l, '與常見比例相差 0.5% 以內', 'within 0.5% of a ratio people name')
                          : t(l, '不在常見比例的 0.5% 以內', 'not within 0.5% of any named ratio'),
                      ],
                      [
                        t(l, '像素數', 'pixels'),
                        <span key="v" className="inst-no">
                          {count(report.pixels)}
                        </span>,
                        `${fixed(report.pixels / 1e6, 2)} MP`,
                      ],
                      [
                        t(l, '方向', 'orientation'),
                        <span key="v" className="inst-no">
                          {report.orientation === 'landscape'
                            ? t(l, '橫向', 'landscape')
                            : report.orientation === 'portrait'
                              ? t(l, '直向', 'portrait')
                              : t(l, '正方', 'square')}
                        </span>,
                        '',
                      ],
                    ]
                  : []
              }
            />
          </div>
          {!report ? <Note>{t(l, '填入寬與高才有東西可以分析。', 'Enter a width and a height.')}</Note> : null}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '塞進框裡', 'FIT INTO A BOX')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
              gap: '1rem',
            }}
          >
            <Input label={t(l, '框寬 px', 'box width px')} value={boxW} onChange={setBoxW} />
            <Input label={t(l, '框高 px', 'box height px')} value={boxH} onChange={setBoxH} />
          </div>
          <Row>
            <Seg
              label={t(l, '模式', 'Mode')}
              value={fitMode}
              onChange={setFitMode}
              options={[
                { value: 'contain', label: t(l, '完整放進去 contain', 'contain') },
                { value: 'cover', label: t(l, '填滿裁切 cover', 'cover') },
              ]}
            />
            {fit ? (
              <Btn primary onClick={() => applySize(fit.result.w, fit.result.h)}>
                {t(l, '套用這個尺寸', 'use this size')}
              </Btn>
            ) : null}
          </Row>
          <div aria-live="polite">
            {fit ? (
              <p className="inst-no" style={{ color: 'var(--fg-muted)' }}>
                {formatRatio(ratio ?? { w: wNum ?? 1, h: hNum ?? 1 })} →{' '}
                <b>
                  {fit.result.w}×{fit.result.h}
                </b>{' '}
                · {t(l, '縮放倍率', 'scale')} {fit.result.scale.toFixed(4)}×
              </p>
            ) : (
              <p className="inst-hint">{t(l, '填入框的寬高。', 'Enter the box size.')}</p>
            )}
          </div>
          <Note>
            {t(
              l,
              'contain 向下取整,所以絕不會超出框;cover 向上取整,所以絕不會露出邊。兩邊都是整數像素,四捨五入造成的比例偏差看上面那張表。',
              'contain floors so it never overflows; cover ceils so it never leaves a gap. Both land on whole pixels, and the rounding drift is in the table above.'
            )}
          </Note>
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          label={t(l, '常見尺寸對照', 'REFERENCE SIZES')}
          aside={<span className="inst-no">{t(l, `資料版本 ${PRESET_VERSION}`, `table ${PRESET_VERSION}`)}</span>}
        >
          <Row>
            <Seg
              label={t(l, '分類', 'Group')}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all' as Filter, label: t(l, '全部', 'all') },
                ...(['display', 'web', 'mobile', 'print'] as PresetGroup[]).map((g) => ({
                  value: g as Filter,
                  label: groupLabel[g],
                })),
              ]}
            />
            <Btn
              disabled={rows.length >= MAX_ROWS}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    group: filter === 'all' ? 'display' : filter,
                    label: t(l, '自訂', 'custom'),
                    w: '',
                    h: '',
                  },
                ])
              }
            >
              {t(l, '加一列', 'add a row')}
            </Btn>
            <Btn onClick={() => setRows(toDrafts())}>{t(l, '還原預設表', 'reset the table')}</Btn>
          </Row>

          <Table
            head={[
              t(l, '名稱', 'name'),
              t(l, '寬', 'w'),
              t(l, '高', 'h'),
              t(l, '比例', 'ratio'),
              '',
              '',
            ]}
            align={['left', 'right', 'right', 'left', 'right', 'right']}
            rows={visible.map(({ draft, index }) => {
              const dw = size(draft.w);
              const dh = size(draft.h);
              const rowReport = dw && dh ? analyse(dw, dh, Number(bound)) : null;
              return [
                <Input key="n" value={draft.label} onChange={(value) => editRow(index, 'label', value)} />,
                <Input key="w" value={draft.w} onChange={(value) => editRow(index, 'w', value)} />,
                <Input key="h" value={draft.h} onChange={(value) => editRow(index, 'h', value)} />,
                <span key="r" className="inst-no">
                  {rowReport
                    ? `${formatRatio(rowReport.exact ?? rowReport.nearest)}${
                        rowReport.name && rowReport.name !== formatRatio(rowReport.exact ?? rowReport.nearest)
                          ? ` · ${rowReport.name}`
                          : ''
                      }`
                    : '—'}
                </span>,
                rowReport ? (
                  <Btn key="a" onClick={() => applySize(dw!, dh!)}>
                    {t(l, '帶入', 'use')}
                  </Btn>
                ) : (
                  <span key="a" />
                ),
                <Btn key="d" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                  {t(l, '刪', 'del')}
                </Btn>,
              ];
            })}
          />

          <Note>
            {t(
              l,
              `這張表是 ${PRESET_VERSION} 手動整理的,不會自動更新。顯示器與印刷那幾列是規格(A 系列是 ISO 216 紙張換算 300 dpi);社群平台的圖片尺寸與手機面板每年都在改,請以平台文件或裝置規格為準,不一樣就直接改上面的格子。`,
              `Compiled by hand on ${PRESET_VERSION} and never auto-updated. The display and print rows are standards (the A series is ISO 216 paper at 300 dpi); platform image sizes and phone panels change every year, so check the vendor's documentation and edit the cells above when they differ.`
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '寬', 'w'), v: wNum ? count(wNum) : '—' },
          { k: t(l, '高', 'h'), v: hNum ? count(hNum) : '—' },
          {
            k: t(l, '比例', 'ratio'),
            v: report ? formatRatio(report.exact ?? report.nearest) : '—',
          },
          { k: t(l, '像素', 'pixels'), v: report ? `${fixed(report.pixels / 1e6, 2)} MP` : '—' },
          { k: t(l, '表格版本', 'table'), v: PRESET_VERSION },
        ]}
      />
    </div>
  );
}
