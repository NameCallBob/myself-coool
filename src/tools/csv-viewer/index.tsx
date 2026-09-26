'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  Check2,
  CopyButton,
  DropZone,
  Input,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Select,
} from '@/components/tools/bench';
import { bytes, count, fixed } from '@/lib/tools/format';
import { isolate } from '@/lib/tools/isolate';
import { t } from '@/lib/tools/locale';
import {
  DELIMITERS,
  MAX_CELLS,
  MAX_ROWS,
  WORKER_THRESHOLD,
  columnStats,
  countCells,
  dedupe as dedupeTable,
  detectDelimiter,
  filterRows,
  parseRows,
  raggedRows,
  selectColumns,
  sortRows,
  toCsv,
  toJson,
  toMarkdown,
  toTable,
  transpose,
  type Direction,
  type Table,
} from './logic';

const SAMPLE = `order_id,customer,city,qty,unit_price,note
A-1001,陳小美,台北,2,349,加急
A-1002,O'Brien,台中,1,1290,
A-1003,王大明,台北,10,49,"含 ,逗號"
A-1004,陳小美,高雄,3,349,
A-1005,林小雨,台中,,89,缺數量`;

const PAGE_SIZE = 40;
const EMPTY: Table = { columns: [], rows: [] };

export default function CsvViewer({ l }: ToolProps) {
  const [pasted, setPasted] = useState('');
  const [loaded, setLoaded] = useState<{ name: string; size: number; text: string } | null>(null);
  const [delimiter, setDelimiter] = useState<'auto' | string>('auto');
  const [hasHeader, setHasHeader] = useState(true);

  const [workerRows, setWorkerRows] = useState<string[][] | null>(null);
  const [workerKey, setWorkerKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const [sort, setSort] = useState<{ index: number; direction: Direction } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [unique, setUnique] = useState(false);
  const [query, setQuery] = useState('');
  const [queryColumn, setQueryColumn] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [statColumn, setStatColumn] = useState<string>('');
  const [exportAs, setExportAs] = useState<'csv' | 'tsv' | 'json' | 'md'>('csv');

  const source = loaded ? loaded.text : pasted;
  const actualDelimiter = delimiter === 'auto' ? detectDelimiter(source) : delimiter;
  const heavy = source.length > WORKER_THRESHOLD;
  const key = `${source.length}:${actualDelimiter}`;
  const stale = heavy && workerKey !== key;

  /** Parses off the main thread. Called from event handlers, never from render. */
  const runWorker = useCallback(
    async (text: string, delim: string) => {
      setBusy(true);
      setWorkerError(null);
      const { workerSource } = await import('./logic');
      const outcome = await isolate<string[][]>(
        workerSource(),
        { text, delimiter: delim, maxRows: MAX_ROWS, maxCells: MAX_CELLS },
        15_000
      );
      setBusy(false);
      if (outcome.ok) {
        setWorkerRows(outcome.value);
        setWorkerKey(`${text.length}:${delim}`);
        setPage(0);
      } else {
        setWorkerRows(null);
        setWorkerError(outcome.error);
      }
    },
    []
  );

  const parsed = useMemo((): { rows: string[][]; error: string | null } => {
    if (source === '') return { rows: [], error: null };
    if (heavy) return { rows: workerRows ?? [], error: null };
    try {
      return { rows: parseRows(source, actualDelimiter, MAX_ROWS, MAX_CELLS), error: null };
    } catch (error) {
      return { rows: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [source, heavy, workerRows, actualDelimiter]);

  const base = useMemo(() => toTable(parsed.rows, hasHeader), [parsed.rows, hasHeader]);
  const ragged = useMemo(() => raggedRows(parsed.rows), [parsed.rows]);

  const view = useMemo(() => {
    if (base.columns.length === 0) return { table: EMPTY, removed: 0 };
    const keep = base.columns
      .map((column, index) => ({ column, index }))
      .filter((entry) => !hidden.includes(entry.column))
      .map((entry) => entry.index);
    let table = keep.length === base.columns.length ? base : selectColumns(base, keep);

    const columnIndex = queryColumn === 'all' ? null : table.columns.indexOf(queryColumn);
    table = filterRows(table, query, columnIndex === -1 ? null : columnIndex);

    let removed = 0;
    if (unique) {
      const deduped = dedupeTable(table, []);
      table = deduped.table;
      removed = deduped.removed;
    }
    if (sort && sort.index < table.columns.length) {
      table = { columns: table.columns, rows: sortRows(table.rows, sort.index, sort.direction) };
    }
    if (flipped) table = transpose(table);
    return { table, removed };
  }, [base, hidden, query, queryColumn, unique, sort, flipped]);

  const table = view.table;
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = table.rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const statIndex = table.columns.indexOf(statColumn);
  const stats = statIndex >= 0 ? columnStats(table, statIndex) : null;

  const exported = useMemo(() => {
    if (table.columns.length === 0) return '';
    if (exportAs === 'json') return toJson(table, 2);
    if (exportAs === 'md') return toMarkdown(table);
    return toCsv(table, exportAs === 'tsv' ? '\t' : ',');
  }, [table, exportAs]);

  const takeFile = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    void file.text().then((text) => {
      setLoaded({ name: file.name, size: file.size, text });
      setWorkerRows(null);
      setWorkerKey('');
      setSort(null);
      setHidden([]);
      setPage(0);
      if (text.length > WORKER_THRESHOLD) {
        void runWorker(text, delimiter === 'auto' ? detectDelimiter(text) : delimiter);
      }
    });
  };

  const reset = () => {
    setPasted('');
    setLoaded(null);
    setWorkerRows(null);
    setWorkerKey('');
    setWorkerError(null);
    setSort(null);
    setHidden([]);
    setFlipped(false);
    setUnique(false);
    setQuery('');
    setQueryColumn('all');
    setStatColumn('');
    setPage(0);
  };

  return (
    <div>
      <Panel
        label={t(l, '來源', 'SOURCE')}
        aside={
          <span className="inst-no">
            {loaded ? `${loaded.name} · ${bytes(loaded.size)}` : source ? bytes(new Blob([source]).size) : ''}
          </span>
        }
      >
        <DropZone
          l={l}
          onFiles={takeFile}
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          hint={t(l, '把 CSV / TSV 拖到這裡,或點一下選檔', 'Drop a CSV / TSV here, or click to choose')}
        />
        {loaded ? (
          <Row>
            <span className="inst-no">
              {t(l, '已讀入檔案', 'file loaded')}: {loaded.name}
            </span>
            <Btn
              onClick={() => {
                setLoaded(null);
                setWorkerRows(null);
                setWorkerKey('');
              }}
            >
              {t(l, '改用貼上的內容', 'use pasted text instead')}
            </Btn>
          </Row>
        ) : (
          <Area
            label={t(l, '或直接貼上', 'Or paste it here')}
            value={pasted}
            onChange={(value) => {
              setPasted(value);
              setWorkerRows(null);
              setWorkerKey('');
              setPage(0);
            }}
            rows={7}
            placeholder={SAMPLE}
          />
        )}

        <Row>
          <Select
            label={t(l, '分隔符號', 'Delimiter')}
            value={delimiter}
            onChange={(value) => {
              setDelimiter(value);
              if (heavy) void runWorker(source, value === 'auto' ? detectDelimiter(source) : value);
            }}
            options={[
              { value: 'auto', label: t(l, `自動(${actualDelimiter === '\t' ? 'tab' : actualDelimiter})`, `auto (${actualDelimiter === '\t' ? 'tab' : actualDelimiter})`) },
              ...DELIMITERS,
            ]}
          />
          <Check2 label={t(l, '第一列是標題', 'first row is a header')} checked={hasHeader} onChange={setHasHeader} />
          {!loaded ? (
            <Btn onClick={() => setPasted(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
          ) : null}
          <ResetButton l={l} onReset={reset} />
        </Row>

        {heavy ? (
          <Row>
            <span className="inst-no">
              {t(
                l,
                `超過 ${count(Math.round(WORKER_THRESHOLD / 1000))}k 字,解析交給 Worker 跑,主執行緒不會被卡住。`,
                `Over ${count(Math.round(WORKER_THRESHOLD / 1000))}k characters: parsing runs in a Worker so the tab stays responsive.`
              )}
            </span>
            {stale || workerRows === null ? (
              <Btn primary onClick={() => void runWorker(source, actualDelimiter)} disabled={busy}>
                {busy ? t(l, '解析中…', 'parsing…') : t(l, '在 Worker 裡解析', 'parse in a Worker')}
              </Btn>
            ) : null}
          </Row>
        ) : null}

        {parsed.error ? (
          <Note error>
            {t(l, `讀不完這份檔案:${parsed.error}`, `Could not finish reading this file: ${parsed.error}`)}
          </Note>
        ) : null}
        {workerError ? (
          <Note error>{t(l, `Worker 回報:${workerError}`, `The worker reported: ${workerError}`)}</Note>
        ) : null}
        {ragged.length > 0 ? (
          <Note error>
            {t(
              l,
              `有 ${count(ragged.length)} 列的欄數與第一列不同(第 ${ragged.slice(0, 5).join('、')} 列…),通常是引號沒配對。短的列已補空白。`,
              `${count(ragged.length)} rows have a different number of cells than the first (rows ${ragged.slice(0, 5).join(', ')}…), usually an unbalanced quote. Short rows were padded.`
            )}
          </Note>
        ) : null}
      </Panel>

      {base.columns.length > 0 ? (
        <>
          <div className="mt-6">
            <div className="inst-pane-label">
              <span>{t(l, '檢視', 'VIEW')}</span>
              <span className="inst-no">
                {count(table.rows.length)} / {count(base.rows.length)} {t(l, '列', 'rows')}
              </span>
            </div>
            <Row>
              <Input
                label={t(l, '篩選(包含即符合)', 'Filter (substring)')}
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(0);
                }}
              />
              <Select
                label={t(l, '篩選範圍', 'Filter in')}
                value={queryColumn}
                onChange={setQueryColumn}
                options={[
                  { value: 'all', label: t(l, '所有欄', 'every column') },
                  ...base.columns.map((column) => ({ value: column, label: column })),
                ]}
              />
              <Check2 label={t(l, '整列去重', 'drop duplicate rows')} checked={unique} onChange={setUnique} />
              <Check2 label={t(l, '轉置', 'transpose')} checked={flipped} onChange={setFlipped} />
              {sort ? (
                <Btn onClick={() => setSort(null)}>{t(l, '取消排序', 'clear sort')}</Btn>
              ) : null}
            </Row>

            {!flipped ? (
              <Row>
                <span className="inst-no">{t(l, '顯示欄位', 'columns')}</span>
                {base.columns.map((column) => (
                  <Check2
                    key={column}
                    label={column}
                    checked={!hidden.includes(column)}
                    onChange={(checked) =>
                      setHidden((previous) =>
                        checked ? previous.filter((name) => name !== column) : [...previous, column]
                      )
                    }
                  />
                ))}
              </Row>
            ) : null}

            {unique && view.removed > 0 ? (
              <Note>{t(l, `去掉了 ${count(view.removed)} 列重複。`, `${count(view.removed)} duplicate rows dropped.`)}</Note>
            ) : null}

            <div className="inst-scroll mt-3" aria-live="polite">
              <table className="inst-table">
                <thead>
                  <tr>
                    <th style={{ color: 'var(--fg-faint)' }}>#</th>
                    {table.columns.map((column, index) => {
                      const active = sort?.index === index;
                      return (
                        <th key={`${column}-${index}`}>
                          <button
                            type="button"
                            onClick={() =>
                              setSort((previous) =>
                                previous?.index === index
                                  ? { index, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
                                  : { index, direction: 'asc' }
                              )
                            }
                            style={{
                              all: 'unset',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              color: active ? 'var(--accent)' : 'inherit',
                            }}
                            aria-label={t(l, `依 ${column} 排序`, `sort by ${column}`)}
                          >
                            {column}
                            {active ? (sort?.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, index) => (
                    <tr key={current * PAGE_SIZE + index}>
                      <td style={{ color: 'var(--fg-faint)' }}>{count(current * PAGE_SIZE + index + 1)}</td>
                      {table.columns.map((column, cell) => (
                        <td key={`${column}-${cell}`}>
                          {(row[cell] ?? '') === '' ? (
                            <span style={{ color: 'var(--fg-faint)' }}>—</span>
                          ) : (
                            (row[cell] ?? '').replace(/\n/g, '\\n')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 ? (
              <Row>
                <Btn onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>
                  {t(l, '上一頁', 'previous')}
                </Btn>
                <span className="inst-no">
                  {count(current + 1)} / {count(pages)}
                </span>
                <Btn onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1}>
                  {t(l, '下一頁', 'next')}
                </Btn>
              </Row>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="inst-pane-label">
              <span>{t(l, '欄位統計', 'COLUMN SUMMARY')}</span>
            </div>
            <Row>
              <Select
                label={t(l, '看哪一欄', 'Column')}
                value={statColumn}
                onChange={setStatColumn}
                options={[
                  { value: '', label: t(l, '(不看)', '(none)') },
                  ...table.columns.map((column) => ({ value: column, label: column })),
                ]}
              />
            </Row>
            {stats ? (
              <>
                <dl className="inst-readout">
                  <div>
                    <dt>{t(l, '列數', 'rows')}</dt>
                    <dd>{count(stats.count)}</dd>
                  </div>
                  <div>
                    <dt>{t(l, '空白', 'blank')}</dt>
                    <dd>{count(stats.blank)}</dd>
                  </div>
                  <div>
                    <dt>{t(l, '不同值', 'distinct')}</dt>
                    <dd>{count(stats.distinct)}</dd>
                  </div>
                  <div>
                    <dt>{t(l, '可當數字', 'numeric')}</dt>
                    <dd>{count(stats.numeric)}</dd>
                  </div>
                  {stats.min !== undefined ? (
                    <>
                      <div>
                        <dt>{t(l, '最小', 'min')}</dt>
                        <dd>{fixed(stats.min, 2)}</dd>
                      </div>
                      <div>
                        <dt>{t(l, '最大', 'max')}</dt>
                        <dd>{fixed(stats.max ?? 0, 2)}</dd>
                      </div>
                      <div>
                        <dt>{t(l, '總和', 'sum')}</dt>
                        <dd>{fixed(stats.sum ?? 0, 2)}</dd>
                      </div>
                      <div>
                        <dt>{t(l, '平均', 'mean')}</dt>
                        <dd>{fixed(stats.mean ?? 0, 2)}</dd>
                      </div>
                      <div>
                        <dt>{t(l, '中位數', 'median')}</dt>
                        <dd>{fixed(stats.median ?? 0, 2)}</dd>
                      </div>
                    </>
                  ) : null}
                  {stats.shortest !== undefined ? (
                    <div>
                      <dt>{t(l, '字數範圍', 'length')}</dt>
                      <dd>
                        {count(stats.shortest)}–{count(stats.longest ?? 0)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {stats.numeric > 0 && stats.numeric < stats.count - stats.blank ? (
                  <Note>
                    {t(
                      l,
                      `這一欄有 ${count(stats.count - stats.blank - stats.numeric)} 格看起來不是數字,統計只算得出數字的那些。`,
                      `${count(stats.count - stats.blank - stats.numeric)} cells in this column are not numbers; the summary covers only the ones that are.`
                    )}
                  </Note>
                ) : null}
                {stats.top.length > 0 ? (
                  <Note>
                    {t(l, '最常出現:', 'most frequent: ')}
                    {stats.top.map((entry) => `${entry.value} (${count(entry.n)})`).join('、')}
                  </Note>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="inst-pane-label">
              <span>{t(l, '匯出目前檢視', 'EXPORT THIS VIEW')}</span>
              <span className="inst-no">{exported ? bytes(new Blob([exported]).size) : ''}</span>
            </div>
            <Row>
              <Seg
                label={t(l, '格式', 'Format')}
                value={exportAs}
                onChange={setExportAs}
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'tsv', label: 'TSV' },
                  { value: 'json', label: 'JSON' },
                  { value: 'md', label: 'Markdown' },
                ]}
              />
              <CopyButton l={l} text={exported} label={t(l, '複製', 'copy')} />
            </Row>
            <Note>
              {t(
                l,
                '匯出的是畫面上這份檢視:篩選、去重、選欄、排序、轉置都算進去,不是原始檔案。',
                'The export is this view — filtered, deduped, column-picked, sorted and transposed — not the original file.'
              )}
            </Note>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '列', 'rows'), v: count(table.rows.length) },
          { k: t(l, '欄', 'columns'), v: count(table.columns.length) },
          { k: t(l, '格數', 'cells'), v: count(countCells(table)) },
          { k: t(l, '欄數不符', 'ragged'), v: count(ragged.length) },
          { k: t(l, '來源', 'source'), v: source ? bytes(new Blob([source]).size) : '—' },
          { k: t(l, '解析', 'parsed'), v: heavy ? t(l, 'Worker', 'worker') : t(l, '主執行緒', 'main thread') },
        ]}
      />
    </div>
  );
}
