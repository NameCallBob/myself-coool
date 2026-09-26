'use client';

import { useCallback, useState } from 'react';
import {
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { below } from '@/lib/tools/random';
import type { ToolProps } from '../types';
import {
  DEFAULTS,
  FIELDS,
  MAX_ROWS,
  generateRows,
  toCsv,
  toJson,
  toLines,
  type CardBrand,
  type FieldId,
  type Options,
  type Row as DataRow,
} from './logic';

type Format = 'table' | 'csv' | 'json' | 'tsv';

const LABELS: Record<FieldId, { zh: string; en: string }> = {
  nameZh: { zh: '中文姓名', en: 'Name (zh)' },
  nameEn: { zh: '英文姓名', en: 'Name (en)' },
  email: { zh: 'Email', en: 'Email' },
  mobile: { zh: '手機', en: 'Mobile' },
  landline: { zh: '市話', en: 'Landline' },
  address: { zh: '地址', en: 'Address' },
  date: { zh: '日期', en: 'Date' },
  uuid: { zh: 'UUID v4', en: 'UUID v4' },
  card: { zh: '測試卡號', en: 'Test card' },
  twId: { zh: '身分證字號', en: 'TW ID number' },
  twBusiness: { zh: '統一編號', en: 'TW business no.' },
  loremZh: { zh: '中文亂文', en: 'Filler (zh)' },
  loremEn: { zh: '拉丁亂文', en: 'Lorem ipsum' },
};

const DEFAULT_FIELDS: FieldId[] = ['nameZh', 'email', 'mobile', 'address'];

/**
 * Nothing here runs during render: every value comes from
 * `crypto.getRandomValues`, and reading randomness while rendering is impure —
 * React would be free to call it twice and show a different table each time.
 * The button is the only thing that generates.
 */
export default function FakeData({ l }: ToolProps) {
  const [fields, setFields] = useState<FieldId[]>(DEFAULT_FIELDS);
  const [rowCount, setRowCount] = useState(10);
  const [format, setFormat] = useState<Format>('table');
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [rows, setRows] = useState<DataRow[]>([]);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const toggle = (field: FieldId) =>
    setFields((previous) =>
      previous.includes(field) ? previous.filter((entry) => entry !== field) : [...previous, field]
    );

  const roll = useCallback(() => {
    setRows(generateRows(fields, rowCount, below, options));
  }, [fields, rowCount, options]);

  // Field order follows the catalogue, not the order they were ticked, so the
  // columns do not jump around between runs.
  const ordered = FIELDS.filter((field) => fields.includes(field));
  const text =
    format === 'csv'
      ? toCsv(rows, ordered)
      : format === 'json'
        ? toJson(rows)
        : toLines(rows, ordered);

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '欄位', 'FIELDS')}</span>
            <span className="inst-no">{count(ordered.length)}</span>
          </div>
          <div className="inst-toolbar">
            {FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                className="inst-btn"
                aria-pressed={fields.includes(field)}
                data-primary={fields.includes(field) ? 'true' : undefined}
                onClick={() => toggle(field)}
              >
                {t(l, LABELS[field].zh, LABELS[field].en)}
              </button>
            ))}
          </div>

          <Row>
            <Input
              label={t(l, '筆數', 'Rows')}
              type="number"
              min={1}
              max={MAX_ROWS}
              value={String(rowCount)}
              onChange={(value) => setRowCount(Math.max(1, Math.min(MAX_ROWS, Number(value) || 1)))}
            />
            <Select
              label={t(l, '卡別', 'Card brand')}
              value={options.brand}
              onChange={(value: CardBrand) => set('brand', value)}
              options={[
                { value: 'visa', label: 'Visa' },
                { value: 'mastercard', label: 'Mastercard' },
                { value: 'amex', label: 'American Express' },
                { value: 'jcb', label: 'JCB' },
              ]}
            />
          </Row>
          <Row>
            <Input
              label={t(l, '日期從', 'Dates from')}
              type="number"
              min={1970}
              max={2100}
              value={String(options.startYear)}
              onChange={(value) => set('startYear', Number(value) || DEFAULTS.startYear)}
            />
            <Input
              label={t(l, '到', 'to')}
              type="number"
              min={1970}
              max={2100}
              value={String(options.endYear)}
              onChange={(value) => set('endYear', Number(value) || DEFAULTS.endYear)}
            />
            <Input
              label={t(l, '亂文詞數', 'Filler words')}
              type="number"
              min={1}
              max={200}
              value={String(options.loremWords)}
              onChange={(value) => set('loremWords', Math.max(1, Math.min(200, Number(value) || 1)))}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '卡號每四位分組', 'group card digits')}
              checked={options.groupCard}
              onChange={(value) => set('groupCard', value)}
            />
          </Row>

          <Row>
            <Btn onClick={roll} primary disabled={ordered.length === 0}>
              {t(l, '產生', 'generate')}
            </Btn>
            <Btn onClick={() => setRows([])} disabled={rows.length === 0}>
              {t(l, '清空', 'clear')}
            </Btn>
            <CopyButton l={l} text={text} label={t(l, '複製輸出', 'copy output')} />
          </Row>
          {ordered.length === 0 ? (
            <Note error>{t(l, '至少選一個欄位。', 'Pick at least one field.')}</Note>
          ) : null}

          <Note>
            {t(
              l,
              '亂數來源是 crypto.getRandomValues,沒有種子,所以按兩次不會一樣。需要可重現的測試資料請把產生的結果存進 fixture。',
              'Randomness comes from crypto.getRandomValues with no seed, so two runs differ. For reproducible fixtures, save the output.'
            )}
          </Note>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '輸出', 'OUTPUT')}</span>
            <span className="inst-no">
              {count(rows.length)} {t(l, '筆', 'rows')}
            </span>
          </div>
          <Row>
            <Seg
              label={t(l, '輸出格式', 'Output format')}
              value={format}
              onChange={setFormat}
              options={[
                { value: 'table', label: t(l, '表格', 'table') },
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
                { value: 'tsv', label: t(l, '定位字元分隔', 'TSV') },
              ]}
            />
          </Row>

          <div aria-live="polite">
            {rows.length === 0 ? (
              <div className="inst-out">
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '按「產生」。', 'Press generate.')}
                </span>
              </div>
            ) : format === 'table' ? (
              <Table
                head={ordered.map((field) => t(l, LABELS[field].zh, LABELS[field].en))}
                rows={rows.map((row, index) =>
                  ordered.map((field) => (
                    <span key={`${index}-${field}`} className="inst-wrap">
                      {row[field] ?? ''}
                    </span>
                  ))
                )}
              />
            ) : (
              <pre className="inst-out" style={{ margin: 0 }}>
                {text}
              </pre>
            )}
          </div>
        </section>
      </div>

      <Panel label={t(l, '這些資料是什麼、不是什麼', 'WHAT THIS DATA IS AND IS NOT')}>
        <Table
          head={[t(l, '欄位', 'field'), t(l, '怎麼產生的', 'how it is made')]}
          rows={[
            [
              t(l, '身分證字號 / 統一編號', 'TW ID / business number'),
              t(
                l,
                '檢查碼是算對的,所以過得了驗證;號碼本身是隨機的,不對應任何人或公司。',
                'The check digit is correct so it passes validation; the number itself is random and belongs to nobody.'
              ),
            ],
            [
              t(l, '測試卡號', 'Test card'),
              t(
                l,
                '用各卡別公開的測試前置碼,Luhn 檢查碼算對。不是真卡,刷不過。',
                'Published test IIN prefixes with a correct Luhn digit. Not a real card; it will not authorise.'
              ),
            ],
            [
              'Email',
              t(
                l,
                '網域只用 RFC 2606 / 6761 保留名稱(example.com、.invalid、.test),不可能被註冊,所以寄不到任何人。',
                'Domains are RFC 2606 / 6761 reserved names, which can never be registered — nothing can be delivered.'
              ),
            ],
            [
              t(l, '地址', 'Address'),
              t(
                l,
                '縣市與行政區是真的而且互相對得上(區不會掛錯縣市),路名、號、樓是隨機的,所以這個地址幾乎確定不存在。',
                'City and district are real and consistent with each other; street, number and floor are random, so the address almost certainly does not exist.'
              ),
            ],
            [
              t(l, '市話 / 手機', 'Phones'),
              t(
                l,
                '區碼與號碼長度照實際規則(02 八碼、其他多為七碼),號碼隨機,可能剛好是某個真號碼——不要撥打。',
                'Area codes and local lengths follow the real rules; the digits are random and could coincide with a real line — do not call them.'
              ),
            ],
            [
              'UUID v4',
              t(
                l,
                'RFC 4122:122 個隨機位元,版本與 variant 欄位照規格寫死,嚴格的解析器也認得。',
                'RFC 4122: 122 random bits with the version and variant fields fixed, so a strict parser accepts it.'
              ),
            ],
          ]}
        />
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '筆數', 'rows'), v: count(rows.length) },
          { k: t(l, '欄位', 'fields'), v: count(ordered.length) },
          { k: t(l, '格式', 'format'), v: format.toUpperCase() },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([text]).size) },
          { k: t(l, '亂數來源', 'source'), v: 'crypto.getRandomValues' },
        ]}
      />
    </div>
  );
}
