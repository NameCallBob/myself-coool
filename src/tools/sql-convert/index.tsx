'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Select,
  Table as TableView,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  ABSENT,
  DEFAULT_EMIT,
  TooMuchData,
  countCells,
  detectDelimiter,
  insertsToText,
  parseInserts,
  tableFromDelimited,
  tableFromJson,
  toCsv,
  toInserts,
  toJson,
  type Conflict,
  type Dialect,
  type Problem,
  type Table,
  type Typing,
} from './logic';

const CSV_SAMPLE = `id,name,qty,note,paid
1,"O'Brien",2,加急,true
2,陳小美,007,,false
3,"含 ,逗號",10,"兩行\n備註",true`;

const SQL_SAMPLE = `INSERT INTO public.orders (id, name, qty, paid) VALUES
  (1, 'O''Brien', 2, TRUE),
  (2, '陳小美', 7, FALSE);`;

const EMPTY: Table = { columns: [], rows: [] };

export default function SqlConvert({ l }: ToolProps) {
  const [direction, setDirection] = useState<'toSql' | 'fromSql'>('toSql');
  const [input, setInput] = useState('');

  const [source, setSource] = useState<'delimited' | 'json'>('delimited');
  const [hasHeader, setHasHeader] = useState(true);
  const [table, setTable] = useState('my_table');
  const [dialect, setDialect] = useState<Dialect>('postgres');
  const [typing, setTyping] = useState<Typing>('auto');
  const [emptyIsNull, setEmptyIsNull] = useState(true);
  const [batch, setBatch] = useState('50');
  const [parameterised, setParameterised] = useState(false);
  const [conflict, setConflict] = useState<Conflict>('none');
  const [conflictKey, setConflictKey] = useState('id');
  const [outputShape, setOutputShape] = useState<'csv' | 'json'>('csv');

  const parsed = useMemo((): { data: Table; problems: Problem[]; names: string[] } => {
    if (input.trim() === '') return { data: EMPTY, problems: [], names: [] };
    try {
      if (direction === 'fromSql') {
        const out = parseInserts(input);
        const first = out.tables[0];
        return {
          data: first ? first.data : EMPTY,
          problems: out.problems,
          names: out.tables.map((entry) => entry.table),
        };
      }
      if (source === 'json') {
        const out = tableFromJson(input);
        return { data: out.table, problems: out.problems, names: [] };
      }
      const delimiter = detectDelimiter(input);
      return { data: tableFromDelimited(input, delimiter, hasHeader), problems: [], names: [] };
    } catch (error) {
      return {
        data: EMPTY,
        problems: [
          {
            message:
              error instanceof TooMuchData
                ? t(l, `資料超過上限(${error.message}),請先切小。`, error.message)
                : String(error),
          },
        ],
        names: [],
      };
    }
  }, [input, direction, source, hasHeader, l]);

  const result = useMemo(() => {
    if (parsed.data.columns.length === 0) return { text: '', problems: parsed.problems, statements: 0 };
    if (direction === 'fromSql') {
      return {
        text: outputShape === 'csv' ? toCsv(parsed.data) : toJson(parsed.data, typing, emptyIsNull, 2),
        problems: parsed.problems,
        statements: 0,
      };
    }
    const parsedBatch = Number.parseInt(batch, 10);
    const out = toInserts(parsed.data, {
      ...DEFAULT_EMIT,
      table,
      dialect,
      typing,
      emptyIsNull,
      batch: Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : 1,
      parameterised,
      conflict,
      conflictKey: conflictKey.trim() === '' ? 'id' : conflictKey.trim(),
    });
    return {
      text: insertsToText(out.statements, parameterised),
      problems: [...parsed.problems, ...out.problems],
      statements: out.statements.length,
    };
  }, [
    parsed,
    direction,
    outputShape,
    table,
    dialect,
    typing,
    emptyIsNull,
    batch,
    parameterised,
    conflict,
    conflictKey,
  ]);

  const preview = parsed.data.rows.slice(0, 12);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'toSql', label: t(l, '資料 → INSERT', 'data → INSERT') },
            { value: 'fromSql', label: t(l, 'INSERT → 資料', 'INSERT → data') },
          ]}
        />
        {direction === 'toSql' ? (
          <Seg
            label={t(l, '輸入格式', 'Input')}
            value={source}
            onChange={setSource}
            options={[
              { value: 'delimited', label: t(l, 'CSV / TSV', 'CSV / TSV') },
              { value: 'json', label: 'JSON' },
            ]}
          />
        ) : (
          <Seg
            label={t(l, '輸出格式', 'Output')}
            value={outputShape}
            onChange={setOutputShape}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
          />
        )}
        {direction === 'toSql' && source === 'delimited' ? (
          <Check2 label={t(l, '第一列是標題', 'first row is a header')} checked={hasHeader} onChange={setHasHeader} />
        ) : null}
        <ResetButton l={l} onReset={() => setInput('')} />
        <button
          type="button"
          className="inst-btn"
          onClick={() => setInput(direction === 'toSql' ? CSV_SAMPLE : SQL_SAMPLE)}
        >
          {t(l, '放入範例', 'load sample')}
        </button>
      </Row>

      <Bench
        leftLabel={direction === 'toSql' ? t(l, '資料', 'DATA') : t(l, 'INSERT 語句', 'INSERT STATEMENTS')}
        rightLabel={direction === 'toSql' ? t(l, 'INSERT 語句', 'INSERT STATEMENTS') : t(l, '資料', 'DATA')}
        leftAside={input ? <span className="inst-no">{bytes(new Blob([input]).size)}</span> : null}
        rightAside={
          parsed.data.rows.length > 0 ? (
            <span className="inst-no">
              {count(parsed.data.rows.length)} {t(l, '列', 'rows')}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={
                direction === 'toSql'
                  ? source === 'json'
                    ? t(l, '貼上 JSON 陣列', 'Paste a JSON array')
                    : t(l, '貼上 CSV 或 TSV(分隔符號自動判斷)', 'Paste CSV or TSV (delimiter detected)')
                  : t(l, '貼上 INSERT 語句', 'Paste INSERT statements')
              }
              value={input}
              onChange={setInput}
              rows={14}
              placeholder={direction === 'toSql' ? CSV_SAMPLE : SQL_SAMPLE}
            />
            {result.problems.length > 0 ? (
              <div className="mt-2">
                {result.problems.slice(0, 8).map((problem, index) => (
                  <Note key={index} error>
                    {problem.row !== undefined
                      ? t(l, `第 ${problem.row} 列:${problem.message}`, `Row ${problem.row}: ${problem.message}`)
                      : problem.message}
                  </Note>
                ))}
                {result.problems.length > 8 ? (
                  <Note error>
                    {t(l, `還有 ${result.problems.length - 8} 個問題。`, `${result.problems.length - 8} more problems.`)}
                  </Note>
                ) : null}
              </div>
            ) : null}
            {parsed.names.length > 1 ? (
              <Note>
                {t(
                  l,
                  `這段裡有 ${parsed.names.length} 張表(${parsed.names.join('、')}),目前顯示第一張。`,
                  `This text holds ${parsed.names.length} tables (${parsed.names.join(', ')}); the first one is shown.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            {direction === 'toSql' ? (
              <>
                <Row>
                  <Input label={t(l, '表名', 'Table')} value={table} onChange={setTable} placeholder="my_table" />
                  <Select
                    label={t(l, '方言', 'Dialect')}
                    value={dialect}
                    onChange={setDialect}
                    options={[
                      { value: 'postgres', label: 'PostgreSQL' },
                      { value: 'mysql', label: 'MySQL' },
                      { value: 'sqlite', label: 'SQLite' },
                      { value: 'mssql', label: 'SQL Server' },
                      { value: 'ansi', label: 'ANSI' },
                    ]}
                  />
                  <CopyButton l={l} text={result.text} />
                </Row>
                <Row>
                  <Check2
                    label={t(l, '用參數佔位符(?/$1)', 'parameter placeholders')}
                    checked={parameterised}
                    onChange={setParameterised}
                  />
                  <Seg
                    label={t(l, '型別判斷', 'Typing')}
                    value={typing}
                    onChange={setTyping}
                    options={[
                      { value: 'auto', label: t(l, '自動', 'auto') },
                      { value: 'text', label: t(l, '全部當字串', 'all text') },
                    ]}
                  />
                  <Check2
                    label={t(l, '空白當 NULL', 'empty means NULL')}
                    checked={emptyIsNull}
                    onChange={setEmptyIsNull}
                  />
                  <Input label={t(l, '每句列數', 'Rows per statement')} value={batch} onChange={setBatch} type="number" min={1} />
                </Row>
                <Row>
                  <Select
                    label={t(l, '重複鍵處理', 'On conflict')}
                    value={conflict}
                    onChange={setConflict}
                    options={[
                      { value: 'none', label: t(l, '不處理', 'nothing') },
                      { value: 'ignore', label: t(l, '略過', 'skip the row') },
                      { value: 'update', label: t(l, '更新既有列', 'update the row') },
                    ]}
                  />
                  {conflict !== 'none' ? (
                    <Input label={t(l, '判重欄位', 'Key column')} value={conflictKey} onChange={setConflictKey} />
                  ) : null}
                </Row>
              </>
            ) : (
              <Row>
                <CopyButton l={l} text={result.text} />
              </Row>
            )}

            <div className="inst-out mt-3" style={{ minHeight: '20rem' }} aria-live="polite">
              {result.text || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上左邊的內容就會即時轉換。', 'Paste something on the left and it converts as you type.')}
                </span>
              )}
            </div>

            {direction === 'toSql' ? (
              <Note>
                {parameterised
                  ? t(
                      l,
                      '參數模式下語句裡一個資料字元都沒有,值全部走參數陣列——要真的執行請用這個模式。',
                      'In parameter mode no data character reaches the statement; the values travel in the array. Use this for anything that runs.'
                    )
                  : t(
                      l,
                      '字面值模式的跳脫是照方言來的:MySQL 的反斜線是跳脫字元要加倍,PostgreSQL(standard_conforming_strings 開啟)的反斜線是普通字元。SQL Server 非 ASCII 會加 N 前綴。這個模式適合寫進要人看的 migration,要執行的還是用參數。',
                      'Literal escaping follows the dialect: a backslash doubles in MySQL and is ordinary in PostgreSQL with standard_conforming_strings on, and SQL Server gets an N prefix for non-ASCII. Use literals for a migration a person reads; use parameters for anything that runs.'
                    )}
              </Note>
            ) : (
              <Note>
                {t(
                  l,
                  'VALUES 裡若有 now()、1+1 這類運算式,會照原樣當成文字帶回表格,不會被計算。',
                  'An expression such as now() or 1+1 inside VALUES comes back as its own text; it is never evaluated.'
                )}
              </Note>
            )}
          </>
        }
      />

      {preview.length > 0 ? (
        <div className="mt-6">
          <div className="inst-pane-label">
            <span>{t(l, '讀到的資料', 'PARSED DATA')}</span>
            <span className="inst-no">
              {count(parsed.data.rows.length)} × {count(parsed.data.columns.length)}
            </span>
          </div>
          <TableView
            head={parsed.data.columns}
            rows={preview.map((row) =>
              parsed.data.columns.map((column, index) =>
                index >= row.length || row[index] === ABSENT ? (
                  <span key={column} style={{ color: 'var(--fg-faint)' }}>
                    NULL
                  </span>
                ) : row[index] === '' ? (
                  <span key={column} style={{ color: 'var(--fg-faint)' }}>
                    {t(l, '(空白)', '(empty)')}
                  </span>
                ) : (
                  row[index].replace(/\n/g, '\\n')
                )
              )
            )}
          />
          {parsed.data.rows.length > preview.length ? (
            <Note>
              {t(l, `表格只列前 ${preview.length} 列。`, `Only the first ${preview.length} rows are shown.`)}
            </Note>
          ) : null}
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '列', 'rows'), v: count(parsed.data.rows.length) },
          { k: t(l, '欄', 'columns'), v: count(parsed.data.columns.length) },
          { k: t(l, '格數', 'cells'), v: count(countCells(parsed.data)) },
          ...(direction === 'toSql' ? [{ k: t(l, '語句', 'statements'), v: count(result.statements) }] : []),
          { k: t(l, '輸出', 'out'), v: result.text ? bytes(new Blob([result.text]).size) : '—' },
        ]}
      />
    </div>
  );
}
