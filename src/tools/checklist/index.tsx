'use client';

import { useMemo, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
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
  Select,
  Table,
} from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import { toHex } from '@/lib/tools/bytes';
import { randomBytes } from '@/lib/tools/random';
import { read, write } from '@/lib/tools/storage';
import {
  MAX_ITEMS,
  SCALES,
  TEMPLATES,
  buildOptions,
  checklistToMarkdown,
  flipWeights,
  margin,
  matrixToMarkdown,
  normalisedWeights,
  parseChecklist,
  parseCriteria,
  parseOptionLabels,
  progressOf,
  pruneScores,
  ranking,
  sortSaved,
  templateToChecklist,
  type Checklist,
  type Item,
  type Saved,
  type ScoreTable,
} from './logic';

const SLUG = 'checklist';

/**
 * Printing is the one place this tool needs a rule the shared stylesheet does
 * not have, and it has to be scoped to this tool — ten other tools share
 * `tools.css`. A local `<style>` element with a `j10-` prefix keeps it here.
 * The text content of a style element is not markup injection: it is a string
 * this file wrote, and no user input ever reaches it.
 */
const PRINT_CSS = `
@media print {
  .j10-hide { display: none !important; }
  .j10-print { break-inside: avoid; }
  .inst-bench { display: block !important; }
  .inst-seam { display: none !important; }
}
`;

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return toHex(randomBytes(4));
  }
}

const DEFAULT_CRITERIA_ZH = ['開發成本:3', '維護負擔:3', '上手難度:2', '生態與文件:2', '效能:1'].join('\n');
const DEFAULT_CRITERIA_EN = ['build cost:3', 'maintenance:3', 'learning curve:2', 'ecosystem:2', 'performance:1'].join('\n');
const DEFAULT_OPTIONS_ZH = ['方案 A', '方案 B', '什麼都不做'].join('\n');
const DEFAULT_OPTIONS_EN = ['Option A', 'Option B', 'Do nothing'].join('\n');

function formatTime(l: Loc, value: number): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(l === 'en' ? 'en-GB' : 'zh-TW', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export default function ChecklistTool({ l }: ToolProps) {
  const [list, setList] = useState<Checklist>(() => {
    const held = read<Checklist | null>(SLUG, 'list', null);
    if (held && Array.isArray(held.items)) return held;
    return templateToChecklist(TEMPLATES[0], l, (index) => `t${index}`);
  });
  const [criteriaText, setCriteriaText] = useState(() =>
    read<string>(SLUG, 'criteria', l === 'en' ? DEFAULT_CRITERIA_EN : DEFAULT_CRITERIA_ZH)
  );
  const [optionsText, setOptionsText] = useState(() =>
    read<string>(SLUG, 'options', l === 'en' ? DEFAULT_OPTIONS_EN : DEFAULT_OPTIONS_ZH)
  );
  const [scaleText, setScaleText] = useState(() => read<string>(SLUG, 'scale', '5'));
  const [scores, setScores] = useState<ScoreTable>(() => read<ScoreTable>(SLUG, 'scores', {}));
  const [saved, setSaved] = useState<Saved[]>(() => sortSaved(read<Saved[]>(SLUG, 'saved', [])));
  const [saveName, setSaveName] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const scale = Number(scaleText) || 5;
  const criteria = useMemo(() => parseCriteria(criteriaText), [criteriaText]);
  const optionLabels = useMemo(() => parseOptionLabels(optionsText), [optionsText]);
  const options = useMemo(() => buildOptions(optionLabels, scores), [optionLabels, scores]);
  const order = useMemo(() => ranking(options, criteria, scale), [options, criteria, scale]);
  const flips = useMemo(() => flipWeights(options, criteria, scale), [options, criteria, scale]);
  const weights = useMemo(() => normalisedWeights(criteria), [criteria]);
  const lead = margin(order);
  const progress = progressOf(list.items);

  const persist = (key: string, value: unknown) => {
    if (!write(SLUG, key, value)) setFailed(true);
  };

  const setChecklist = (next: Checklist) => {
    setList(next);
    persist('list', next);
  };

  const setItem = (id: string, patch: Partial<Item>) =>
    setChecklist({
      ...list,
      items: list.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });

  const addItem = () => {
    if (list.items.length >= MAX_ITEMS) return;
    setChecklist({
      ...list,
      items: [...list.items, { id: newId(), text: '', done: false, required: false }],
    });
  };

  const setScore = (optionLabel: string, criterionId: string, raw: string) => {
    const value = Number(raw);
    const row = { ...(scores[optionLabel] ?? {}) };
    if (raw.trim() === '' || !Number.isFinite(value)) delete row[criterionId];
    else row[criterionId] = Math.min(Math.max(value, 0), scale);
    const next = { ...scores, [optionLabel]: row };
    setScores(next);
    persist('scores', next);
  };

  const tidy = () => {
    const next = pruneScores(scores, optionLabels, criteria);
    setScores(next);
    persist('scores', next);
    setMessage(
      t(l, '已清掉不存在的選項與評分項目留下的分數。', 'Dropped scores belonging to options and criteria that no longer exist.')
    );
  };

  const saveSnapshot = () => {
    const name = saveName.trim() || list.title.trim() || t(l, '未命名', 'Untitled');
    const snapshot: Saved = {
      id: newId(),
      name,
      updated: Date.now(),
      checklist: list,
      criteriaText,
      optionsText,
      scale,
      scores,
    };
    const next = sortSaved([snapshot, ...saved]);
    setSaved(next);
    persist('saved', next);
    setSaveName('');
    setMessage(t(l, `已存成「${name}」。`, `Saved as "${name}".`));
  };

  const load = (entry: Saved) => {
    setList(entry.checklist);
    setCriteriaText(entry.criteriaText);
    setOptionsText(entry.optionsText);
    setScaleText(String(entry.scale));
    setScores(entry.scores);
    persist('list', entry.checklist);
    persist('criteria', entry.criteriaText);
    persist('options', entry.optionsText);
    persist('scale', String(entry.scale));
    persist('scores', entry.scores);
    setMessage(t(l, `載入「${entry.name}」。`, `Loaded "${entry.name}".`));
  };

  const drop = (id: string) => {
    const next = saved.filter((entry) => entry.id !== id);
    setSaved(next);
    persist('saved', next);
  };

  const markdown = `${checklistToMarkdown(list, l)}\n\n${matrixToMarkdown(options, criteria, scale, l)}`;

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <Bench
        leftLabel={t(l, '檢查表', 'CHECKLIST')}
        rightLabel={t(l, '進度', 'PROGRESS')}
        leftAside={
          <span className="inst-no">
            {count(progress.done)} / {count(progress.total)}
          </span>
        }
        rightAside={
          <span
            className="inst-no"
            style={{ color: progress.ready ? 'var(--data-teal)' : 'var(--fg-faint)' }}
          >
            {progress.ready ? t(l, '✓ 可以了', '✓ clear') : t(l, '未完成', 'not yet')}
          </span>
        }
        left={
          <>
            <Row>
              <Input
                label={t(l, '標題', 'Title')}
                value={list.title}
                onChange={(value) => setChecklist({ ...list, title: value })}
              />
              <div className="j10-hide">
                <Select
                  label={t(l, '套用範本', 'Template')}
                  value=""
                  onChange={(value) => {
                    const template = TEMPLATES.find((entry) => entry.id === value);
                    if (!template) return;
                    setChecklist(templateToChecklist(template, l, (index) => `${value}-${index}`));
                  }}
                  options={[
                    { value: '', label: t(l, '— 取代目前內容 —', '— replaces what is here —') },
                    ...TEMPLATES.map((entry) => ({
                      value: entry.id,
                      label: l === 'en' ? entry.title.en : entry.title.zh,
                    })),
                  ]}
                />
              </div>
            </Row>

            <div className="j10-print">
              {list.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.25rem 0',
                    borderBottom: '1px solid var(--border-1)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    aria-label={item.text || t(l, '未命名項目', 'unnamed item')}
                    onChange={(event) => setItem(item.id, { done: event.target.checked })}
                    style={{ accentColor: 'var(--accent)', flex: '0 0 auto' }}
                  />
                  <input
                    className="inst-input"
                    value={item.text}
                    aria-label={t(l, '項目文字', 'item text')}
                    onChange={(event) => setItem(item.id, { text: event.target.value })}
                    style={{
                      flex: 1,
                      border: 0,
                      background: 'none',
                      textDecoration: item.done ? 'line-through' : undefined,
                      color: item.done ? 'var(--fg-faint)' : undefined,
                    }}
                  />
                  <label
                    className="inst-no j10-hide"
                    style={{ cursor: 'pointer', flex: '0 0 auto' }}
                    title={t(l, '必要項目:沒打勾就不算過', 'Required: the list is not clear until this is ticked')}
                  >
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(event) => setItem(item.id, { required: event.target.checked })}
                      style={{ accentColor: 'var(--accent)' }}
                    />{' '}
                    {t(l, '必要', 'req')}
                  </label>
                  {item.required ? (
                    <span className="inst-no" style={{ color: 'var(--accent)' }}>
                      {t(l, '必', '!')}
                    </span>
                  ) : null}
                  <span className="j10-hide">
                    <Btn
                      onClick={() =>
                        setChecklist({
                          ...list,
                          items: list.items.filter((entry) => entry.id !== item.id),
                        })
                      }
                      title={t(l, '刪掉這一項', 'remove this item')}
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </Btn>
                  </span>
                </div>
              ))}
            </div>

            <Row>
              <span className="j10-hide">
                <Btn onClick={addItem} primary>
                  <Plus size={12} strokeWidth={1.5} />
                  {t(l, '加一項', 'add an item')}
                </Btn>
              </span>
              <span className="j10-hide">
                <Btn
                  onClick={() =>
                    setChecklist({
                      ...list,
                      items: list.items.map((item) => ({ ...item, done: false })),
                    })
                  }
                >
                  {t(l, '全部取消打勾', 'untick everything')}
                </Btn>
              </span>
              <span className="j10-hide">
                <Btn onClick={() => window.print()}>
                  <Printer size={12} strokeWidth={1.5} />
                  {t(l, '列印', 'print')}
                </Btn>
              </span>
            </Row>
          </>
        }
        right={
          <div aria-live="polite">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 32,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {fixed(progress.fraction * 100, 0)}
              <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>%</span>
            </div>
            <div
              aria-hidden="true"
              style={{
                height: 4,
                background: 'var(--border-1)',
                marginBottom: '0.8rem',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress.fraction * 100}%`,
                  background: progress.ready ? 'var(--data-teal)' : 'var(--accent)',
                }}
              />
            </div>
            <Table
              head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
              rows={[
                [t(l, '總項數', 'items'), count(progress.total)],
                [t(l, '已完成', 'done'), count(progress.done)],
                [
                  t(l, '必要項目', 'required'),
                  `${count(progress.requiredDone)} / ${count(progress.required)}`,
                ],
                [
                  t(l, '判定', 'verdict'),
                  progress.ready
                    ? t(l, '必要項目都完成了', 'every required item is done')
                    : progress.required > 0
                      ? t(l, '還有必要項目沒完成', 'a required item is still open')
                      : t(l, '沒有標必要項目,所以要全部完成', 'nothing marked required, so all items count'),
                ],
              ]}
            />
            <Note>
              {t(
                l,
                '標成「必要」的項目就是攔停條件:只要有一項沒勾,上面就不會出現可以了。沒有標任何必要項目時,以全部完成為準。',
                'Items marked required are the bar: while one is unticked, this never reads clear. With none marked, everything has to be ticked instead.'
              )}
            </Note>
          </div>
        }
      />

      <Panel
        label={t(l, '加權決策矩陣', 'WEIGHTED DECISION MATRIX')}
        aside={
          order.length > 0 ? (
            <span className="inst-no">
              {t(l, '目前領先', 'leading')}: {order[0].option.label}{' '}
              {fixed(order[0].score * 100, 1)}%
            </span>
          ) : null
        }
      >
        <div className="j10-hide">
          <Row>
            <Seg
              label={t(l, '評分尺度', 'scale')}
              value={scaleText}
              onChange={(value) => {
                setScaleText(value);
                persist('scale', value);
              }}
              options={SCALES.map((value) => ({ value: String(value), label: `1–${value}` }))}
            />
            <Btn onClick={tidy}>{t(l, '整理分數表', 'tidy the score table')}</Btn>
          </Row>
          <Row>
            <Area
              label={t(l, '評分項目與權重(一行一項,名稱:權重)', 'Criteria and weights (one per line, name:weight)')}
              value={criteriaText}
              onChange={(value) => {
                setCriteriaText(value);
                persist('criteria', value);
              }}
              rows={6}
            />
            <Area
              label={t(l, '選項(一行一個)', 'Options (one per line)')}
              value={optionsText}
              onChange={(value) => {
                setOptionsText(value);
                persist('options', value);
              }}
              rows={6}
            />
          </Row>
        </div>

        {criteria.length === 0 || options.length === 0 ? (
          <Note>{t(l, '至少要一個評分項目與一個選項。', 'Needs at least one criterion and one option.')}</Note>
        ) : (
          <>
            <div className="inst-scroll j10-print">
              <table className="inst-table">
                <thead>
                  <tr>
                    <th>{t(l, '選項', 'option')}</th>
                    {criteria.map((criterion) => (
                      <th key={criterion.id} style={{ textAlign: 'right' }}>
                        {criterion.label}
                        <br />
                        <span className="inst-no">
                          {criterion.weight}
                          {weights ? ` · ${fixed(weights[criterion.id] * 100, 0)}%` : ''}
                        </span>
                      </th>
                    ))}
                    <th style={{ textAlign: 'right' }}>{t(l, '加權分數', 'score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((option) => {
                    const ranked = order.find((entry) => entry.option.id === option.id);
                    return (
                      <tr key={option.id}>
                        <td>{option.label}</td>
                        {criteria.map((criterion) => (
                          <td key={criterion.id} style={{ textAlign: 'right' }}>
                            <input
                              className="inst-input"
                              type="number"
                              min={0}
                              max={scale}
                              step={scale > 10 ? 1 : 0.5}
                              value={option.scores[criterion.id] ?? ''}
                              aria-label={`${option.label} / ${criterion.label}`}
                              onChange={(event) =>
                                setScore(option.label, criterion.id, event.target.value)
                              }
                              style={{ width: '4.5rem', textAlign: 'right' }}
                            />
                          </td>
                        ))}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            color: ranked?.rank === 1 ? 'var(--accent)' : undefined,
                          }}
                        >
                          {ranked ? `${fixed(ranked.score * 100, 1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Table
              head={[
                t(l, '名次', 'rank'),
                t(l, '選項', 'option'),
                t(l, '分數', 'score'),
                t(l, '落後', 'behind'),
              ]}
              rows={order.map((entry) => [
                String(entry.rank),
                entry.option.label,
                `${fixed(entry.score * 100, 1)}%`,
                entry.behind === 0 ? '—' : `${fixed(entry.behind * 100, 1)}%`,
              ])}
            />

            {lead !== null ? (
              <Note error={lead < 0.05}>
                {lead < 0.05
                  ? t(
                      l,
                      `第一名只領先 ${fixed(lead * 100, 1)}%。這個差距小於你輸入這些分數時的精度,矩陣沒有替你決定任何事——改用下面那張表看看哪個權重在撐著結論。`,
                      `The leader is only ${fixed(lead * 100, 1)}% ahead. That is smaller than the precision of the numbers you typed, so the matrix has not decided anything — read the table below to see which weight is holding the answer up.`
                    )
                  : t(
                      l,
                      `第一名領先 ${fixed(lead * 100, 1)}%。`,
                      `The leader is ${fixed(lead * 100, 1)}% ahead.`
                    )}
              </Note>
            ) : null}

            {flips.length > 0 ? (
              <>
                <Table
                  head={[
                    t(l, '評分項目', 'criterion'),
                    t(l, '目前權重', 'weight now'),
                    t(l, '打平所需權重', 'weight that ties it'),
                    t(l, '要動多少', 'change needed'),
                  ]}
                  rows={flips.map((flip) => [
                    flip.criterionId,
                    fixed(flip.current, 2),
                    fixed(flip.needed, 2),
                    Number.isFinite(flip.ratio)
                      ? `×${fixed(flip.ratio, 2)}`
                      : t(l, '從 0 起才有影響', 'only from zero'),
                  ])}
                />
                <Note>
                  {t(
                    l,
                    '這張表說的是:把某一個權重改成右邊那個數字,第一名與第二名就會打平。最上面那一列是結論最脆弱的地方——如果那個權重只要動一點就翻盤,真正該討論的是那個權重,不是分數。沒出現在表上的評分項目,無論權重怎麼調都不會改變名次。',
                    'Each row says: set that one weight to the value on the right and the top two options tie. The first row is where the conclusion is most fragile — if a small nudge flips it, the weight is what the discussion should be about, not the scores. Criteria absent from this table cannot change the ranking at any weight.'
                  )}
                </Note>
              </>
            ) : options.length > 1 ? (
              <Note>
                {t(
                  l,
                  '第一名在每個評分項目上都不輸第二名,所以調整權重不會改變結論。',
                  'The leader is at least as good as the runner-up on every criterion, so no weighting changes the outcome.'
                )}
              </Note>
            ) : null}

            <Note>
              {t(
                l,
                '分數是先乘權重再除以權重總和與尺度上限,所以增減評分項目或把尺度從 1–5 換成 1–10,整批分數不會平移——昨天的 72% 跟今天的 72% 可以比。權重是你自己給的主觀數字,這個工具只負責把它算清楚,不負責它對不對。',
                'Scores are weighted, then divided by both the weight total and the top of the scale, so adding a criterion or switching from 1–5 to 1–10 does not shift everything — yesterday’s 72% is comparable with today’s. The weights are your own judgement; this tool only makes the arithmetic honest, not the judgement.'
              )}
            </Note>
          </>
        )}
      </Panel>

      <Panel
        label={t(l, '存檔、匯出、匯入', 'SAVE, EXPORT, IMPORT')}
        aside={
          <span className="inst-no">
            {count(saved.length)} {t(l, '份存檔', 'saved')}
          </span>
        }
      >
        <div className="j10-hide">
          <Row>
            <Input
              label={t(l, '存檔名稱', 'Name')}
              value={saveName}
              onChange={setSaveName}
              placeholder={list.title || t(l, '未命名', 'Untitled')}
            />
            <Btn onClick={saveSnapshot}>{t(l, '另存一份', 'save a copy')}</Btn>
            <CopyButton l={l} text={markdown} label={t(l, '複製 Markdown', 'copy Markdown')} />
          </Row>

          {saved.length > 0 ? (
            <Table
              head={[t(l, '名稱', 'name'), t(l, '時間', 'saved at'), t(l, '項目', 'items'), '']}
              rows={saved.map((entry) => [
                entry.name,
                formatTime(l, entry.updated),
                count(entry.checklist.items.length),
                <Row key={entry.id}>
                  <Btn onClick={() => load(entry)}>{t(l, '載入', 'load')}</Btn>
                  <Btn onClick={() => drop(entry.id)}>
                    <Trash2 size={12} strokeWidth={1.5} />
                  </Btn>
                </Row>,
              ])}
            />
          ) : null}

          <Area
            label={t(l, '貼上 Markdown 任務清單來取代檢查表', 'Paste a Markdown task list to replace the checklist')}
            value={importText}
            onChange={setImportText}
            rows={4}
            placeholder={'# 標題\n- [x] 已完成\n- [ ] 還沒(必要)'}
          />
          <Row>
            <Btn
              onClick={() => {
                const parsed = parseChecklist(importText, (index) => `p${index}-${newId()}`);
                if (parsed.items.length === 0) {
                  setMessage(t(l, '沒有找到任何 - [ ] 開頭的項目。', 'No "- [ ]" lines found.'));
                  return;
                }
                setChecklist({
                  title: parsed.title || list.title,
                  items: parsed.items.slice(0, MAX_ITEMS),
                });
                setMessage(
                  t(l, `讀進 ${parsed.items.length} 項。`, `Read ${parsed.items.length} items.`)
                );
              }}
              disabled={importText.trim() === ''}
            >
              {t(l, '匯入檢查表', 'import the checklist')}
            </Btn>
          </Row>

          {message ? <Note>{message}</Note> : null}
          {failed ? (
            <Note error>
              {t(
                l,
                '寫不進瀏覽器儲存空間(無痕視窗、網站資料被封鎖,或容量滿了)。先複製 Markdown 帶走。',
                'The browser refused to store this — a private window, blocked site data, or a full quota. Copy the Markdown out.'
              )}
            </Note>
          ) : null}

          <p className="inst-hint">
            {t(
              l,
              '所有東西存在這台裝置的瀏覽器裡,沒有帳號、不會上傳、換裝置看不到。分數表以「選項名稱 + 評分項目名稱」為鍵,所以重新排序不會跑掉,但改名字會讓那一列的分數對不上——改名前先按「整理分數表」看清楚。',
              'Everything is kept in this browser on this device: no account, nothing uploaded, invisible on another machine. The score table is keyed by option and criterion name, so reordering is safe while renaming detaches that row’s scores — press tidy to see what is left over.'
            )}
          </p>
        </div>

        <div className="j10-print">
          <p className="inst-hint">
            {t(l, '列印時只會留下檢查表與矩陣本身,控制項會隱藏。', 'Printing keeps the checklist and the matrix and hides the controls.')}
          </p>
        </div>
      </Panel>

      <Readout
        l={l}
        items={[
          {
            k: t(l, '檢查表', 'checklist'),
            v: `${count(progress.done)}/${count(progress.total)}`,
          },
          {
            k: t(l, '必要項目', 'required'),
            v: `${count(progress.requiredDone)}/${count(progress.required)}`,
          },
          { k: t(l, '選項', 'options'), v: count(options.length) },
          { k: t(l, '評分項目', 'criteria'), v: count(criteria.length) },
          {
            k: t(l, '領先幅度', 'margin'),
            v: lead === null ? '—' : `${fixed(lead * 100, 1)}%`,
          },
        ]}
      />
    </div>
  );
}
