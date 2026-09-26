'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  AREA_CODES,
  BATCH_LIMIT,
  LETTER_PLACES,
  formatAreaTable,
  parseAreaTable,
  validateBatch,
  validateLandline,
  validateMobile,
  validateTwId,
  validateVat,
  type BatchKind,
} from './logic';

const PLACEHOLDER: Record<BatchKind, string> = {
  id: 'A123456789',
  vat: '22099131',
  mobile: '0912-345-678',
  landline: '02-2345-6789',
};

function kindLabel(l: Loc, kind: BatchKind): string {
  switch (kind) {
    case 'id':
      return t(l, '身分證 / 居留證', 'ID / resident');
    case 'vat':
      return t(l, '統一編號', 'business no.');
    case 'mobile':
      return t(l, '手機', 'mobile');
    case 'landline':
      return t(l, '市話', 'landline');
  }
}

export default function TwValidate({ l }: ToolProps) {
  const [kind, setKind] = useState<BatchKind>('id');
  const [one, setOne] = useState('');
  const [batch, setBatch] = useState('');
  const [areaText, setAreaText] = useState(formatAreaTable(AREA_CODES));
  const [showArea, setShowArea] = useState(false);

  const table = useMemo(() => parseAreaTable(areaText), [areaText]);

  const id = useMemo(() => validateTwId(one), [one]);
  const vat = useMemo(() => validateVat(one), [one]);
  const mobile = useMemo(() => validateMobile(one), [one]);
  const landline = useMemo(() => validateLandline(one, table), [one, table]);

  const batchResult = useMemo(() => validateBatch(batch, kind, table), [batch, kind, table]);
  const badCount = batchResult.rows.filter((row) => !row.ok).length;

  const verdict =
    kind === 'id' ? id.ok : kind === 'vat' ? vat.ok : kind === 'mobile' ? mobile.ok : landline.ok;
  const reason =
    kind === 'id'
      ? id.reason
      : kind === 'vat'
        ? vat.reason
        : kind === 'mobile'
          ? mobile.reason
          : landline.reason;
  const touched = one.trim() !== '';

  const reasonText = () => {
    if (!touched || reason === null || reason === 'empty') return null;
    switch (reason) {
      case 'length':
        return t(l, '長度不對。', 'Wrong length.');
      case 'shape':
        return t(l, '格式不對:開頭、字母或數字的位置不符。', 'Wrong shape: the leading character, letters or digit positions do not match.');
      case 'prefix':
        return t(l, '號碼開頭不在這個表裡。', 'The leading digits are not in the table.');
      case 'checksum':
        return t(l, '長度與格式都對,但檢查碼算不過——通常是打錯一位數字。', 'The length and shape are right but the check digit does not add up — usually one mistyped digit.');
      default:
        return reason;
    }
  };

  const detailRows: [string, string][] = (() => {
    if (!touched) return [];
    if (kind === 'id') {
      return [
        [
          t(l, '類型', 'format'),
          id.kind === 'national'
            ? t(l, '國民身分證', 'national ID')
            : id.kind === 'resident-2021'
              ? t(l, '統一證號(2021 新式)', 'resident number (2021 format)')
              : id.kind === 'resident-legacy'
                ? t(l, '統一證號(舊式,兩個英文字母)', 'resident number (legacy, two letters)')
                : '—',
        ],
        [
          t(l, '性別碼', 'gender digit'),
          id.gender === 'male'
            ? t(l, '男', 'male')
            : id.gender === 'female'
              ? t(l, '女', 'female')
              : t(l, '這個格式沒有編性別', 'not encoded in this format'),
        ],
        [
          t(l, '首次發證地', 'first issued at'),
          id.letter && LETTER_PLACES[id.letter]
            ? t(l, LETTER_PLACES[id.letter].zh, LETTER_PLACES[id.letter].en)
            : '—',
        ],
        [
          t(l, '正確檢查碼', 'correct check digit'),
          id.expectedCheck === null ? '—' : String(id.expectedCheck),
        ],
      ];
    }
    if (kind === 'vat') {
      return [
        [t(l, '加權總和', 'weighted total'), String(vat.sum)],
        [
          t(l, '第 7 位是 7', 'seventh digit is 7'),
          vat.sevenRule ? t(l, '是,總和加 1 也算過', 'yes — the total plus one also counts') : t(l, '否', 'no'),
        ],
        [
          t(l, '現行規則(2023-04 起,mod 5)', 'current rule (mod 5, since 2023-04)'),
          vat.ok ? t(l, '通過', 'pass') : t(l, '不通過', 'fail'),
        ],
        [
          t(l, '舊規則(mod 10)', 'legacy rule (mod 10)'),
          vat.legacyOk ? t(l, '通過', 'pass') : t(l, '不通過', 'fail'),
        ],
      ];
    }
    if (kind === 'mobile') {
      return [
        [t(l, '本地格式', 'national'), mobile.national],
        [t(l, '國際格式', 'international'), mobile.international || '—'],
        [t(l, '分段顯示', 'grouped'), mobile.pretty || '—'],
        [
          t(l, '檢查碼', 'check digit'),
          t(l, '台灣手機號碼沒有檢查碼,只能驗格式', 'Taiwanese mobile numbers have none — format only'),
        ],
      ];
    }
    return [
      [t(l, '區碼', 'area code'), landline.area ? `${landline.area.code} ${landline.area.name}` : '—'],
      [
        t(l, '市內號碼', 'local number'),
        landline.local ? `${landline.local} (${landline.local.length} ${t(l, '位', 'digits')})` : '—',
      ],
      [
        t(l, '這個區碼應有位數', 'expected local digits'),
        landline.area ? String(landline.area.length) : '—',
      ],
      [t(l, '國際格式', 'international'), landline.international || '—'],
    ];
  })();

  return (
    <div>
      <Bench
        leftLabel={t(l, '號碼', 'NUMBER')}
        rightLabel={t(l, '判定', 'VERDICT')}
        leftAside={
          <Seg
            label={t(l, '種類', 'kind')}
            value={kind}
            onChange={setKind}
            options={(['id', 'vat', 'mobile', 'landline'] as BatchKind[]).map((entry) => ({
              value: entry,
              label: kindLabel(l, entry),
            }))}
          />
        }
        rightAside={
          touched ? (
            <span className="inst-no" style={{ color: verdict ? 'var(--data-teal)' : 'var(--accent)' }}>
              {verdict ? t(l, '✓ 通過', '✓ pass') : t(l, '× 不通過', '× fail')}
            </span>
          ) : null
        }
        left={
          <>
            <Input
              label={t(l, '輸入一組', 'One number')}
              value={one}
              onChange={setOne}
              placeholder={PLACEHOLDER[kind]}
              invalid={touched && !verdict}
              hint={t(
                l,
                '全形數字、空白、括號與破折號都會自動處理。',
                'Full-width digits, spaces, parentheses and dashes are handled.'
              )}
            />
            <Row>
              <Btn onClick={() => setOne('')} disabled={one === ''}>
                {t(l, '清空', 'clear')}
              </Btn>
              <Btn onClick={() => setOne(PLACEHOLDER[kind])}>{t(l, '放入範例', 'load sample')}</Btn>
            </Row>

            {reasonText() ? <Note error>{reasonText()}</Note> : null}

            {kind === 'id' && !verdict && id.reason === 'checksum' && id.expectedCheck !== null ? (
              <Note>
                {t(
                  l,
                  `如果只是最後一位打錯,正確的檢查碼是 ${id.expectedCheck}。`,
                  `If only the last digit is wrong, the correct check digit is ${id.expectedCheck}.`
                )}
              </Note>
            ) : null}

            {kind === 'vat' && vat.ok && !vat.legacyOk ? (
              <Note>
                {t(
                  l,
                  '這組統編符合 2023-04-01 起的 mod 5 規則,但不符合舊的 mod 10 規則。如果某個系統退你這組號碼,問題在那個系統還沒改。',
                  'This number satisfies the mod-5 rule in force since 2023-04-01 but not the older mod-10 rule. If a system rejects it, that system has not been updated.'
                )}
              </Note>
            ) : null}

            <Note>
              {t(
                l,
                '檢查碼只能證明號碼「編得對」。編得對的號碼不代表有人持有它,也不代表那個人是誰——這一頁不查任何資料庫,也沒有資料庫可查。',
                'A check digit only proves the number is well formed. A well-formed number does not mean anyone holds it, and does not say who. Nothing is looked up here, and there is nothing to look up.'
              )}
            </Note>
          </>
        }
        right={
          touched ? (
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                rows={detailRows.map(([key, value]) => [
                  key,
                  <span key={key} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {value}
                  </span>,
                ])}
              />
            </div>
          ) : (
            <Note>{t(l, '輸入一組號碼。', 'Enter a number.')}</Note>
          )
        }
      />

      <Panel
        label={t(l, '整批檢查', 'BATCH')}
        aside={
          batchResult.rows.length > 0 ? (
            <span className="inst-no">
              {count(batchResult.rows.length)} {t(l, '筆', 'rows')} ·{' '}
              {t(l, '不通過', 'failing')} {count(badCount)}
            </span>
          ) : null
        }
      >
        <Area
          label={t(l, `一行一筆(最多 ${BATCH_LIMIT} 筆)`, `One per line (up to ${BATCH_LIMIT})`)}
          value={batch}
          onChange={setBatch}
          rows={6}
          placeholder={`${PLACEHOLDER[kind]}\n${PLACEHOLDER[kind]}`}
        />
        {batchResult.truncated ? (
          <Note error>
            {t(
              l,
              `超過 ${BATCH_LIMIT} 行,只處理前面 ${BATCH_LIMIT} 行。`,
              `More than ${BATCH_LIMIT} lines — only the first ${BATCH_LIMIT} were checked.`
            )}
          </Note>
        ) : null}
        {batchResult.rows.length > 0 ? (
          <>
            <Table
              head={[t(l, '輸入', 'input'), t(l, '結果', 'result'), t(l, '備註', 'note')]}
              rows={batchResult.rows.map((row, index) => [
                <span key={index} style={{ fontFamily: 'var(--font-mono)' }}>
                  {row.input}
                </span>,
                <span
                  key={`v${index}`}
                  style={{ color: row.ok ? 'var(--data-teal)' : 'var(--accent)' }}
                >
                  {row.ok ? t(l, '✓ 通過', '✓ pass') : t(l, '× 不通過', '× fail')}
                </span>,
                <span key={`n${index}`} className="inst-no">
                  {row.note}
                </span>,
              ])}
            />
            <Row>
              <CopyButton
                l={l}
                text={batchResult.rows
                  .map((row) => `${row.input}\t${row.ok ? 'pass' : 'fail'}\t${row.note}`)
                  .join('\n')}
                label={t(l, '複製結果(TSV)', 'copy as TSV')}
              />
              <CopyButton
                l={l}
                text={batchResult.rows
                  .filter((row) => !row.ok)
                  .map((row) => row.input)
                  .join('\n')}
                label={t(l, '只複製不通過的', 'copy the failures')}
              />
            </Row>
          </>
        ) : null}
      </Panel>

      <Panel
        label={t(l, '市話區碼表', 'LANDLINE AREA CODES')}
        aside={
          <Btn onClick={() => setShowArea(!showArea)}>
            {showArea ? t(l, '收起', 'hide') : t(l, '打開編輯', 'edit')}
          </Btn>
        }
      >
        <p className="inst-hint">
          {t(
            l,
            '格式是「區碼:市內號碼位數:地區」,一行一筆,# 開頭是註解。內建這份是 2025-09 對照 NCC 電話號碼計畫整理的,號碼計畫會變(臺北市 2000 年就從 7 碼改成 8 碼),有疑問以 NCC 公告為準,不確定就自己改這張表。',
            'The format is "area code:local digits:region", one per line, # for comments. The built-in table was checked against the NCC numbering plan in 2025-09. Numbering plans change — Taipei went from seven digits to eight in 2000 — so trust the NCC’s published plan over this table, and edit it when in doubt.'
          )}
        </p>
        {showArea ? (
          <>
            <Area
              label={t(l, '區碼表', 'Area code table')}
              value={areaText}
              onChange={setAreaText}
              rows={14}
            />
            <Row>
              <Btn onClick={() => setAreaText(formatAreaTable(AREA_CODES))}>
                {t(l, '還原內建表', 'restore the built-in table')}
              </Btn>
              <span className="inst-no">
                {count(table.length)} {t(l, '筆有效', 'valid rows')}
              </span>
            </Row>
          </>
        ) : (
          <Table
            head={[t(l, '區碼', 'code'), t(l, '市內位數', 'local digits'), t(l, '地區', 'region')]}
            rows={[...table]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((entry) => [entry.code, String(entry.length), entry.name])}
          />
        )}
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '種類', 'kind'), v: kindLabel(l, kind) },
          {
            k: t(l, '單筆', 'single'),
            v: touched ? (verdict ? t(l, '通過', 'pass') : t(l, '不通過', 'fail')) : '—',
          },
          { k: t(l, '整批筆數', 'rows'), v: count(batchResult.rows.length) },
          { k: t(l, '整批不通過', 'failing'), v: count(badCount) },
          { k: t(l, '資料庫查詢', 'lookups'), v: t(l, '無', 'none') },
        ]}
      />
    </div>
  );
}
