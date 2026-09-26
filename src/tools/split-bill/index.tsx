'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
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
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_ITEMS,
  MAX_PEOPLE,
  SplitError,
  computeSplit,
  money,
  type Item,
  type SplitInput,
  type SplitResult,
  type TipBase,
} from './logic';

type PersonDraft = { id: string; name: string };
type ItemDraft = {
  id: string;
  label: string;
  amount: string;
  paidBy: string;
  participants: string[];
  weights: Record<string, string>;
  uneven: boolean;
};

const START_PEOPLE: PersonDraft[] = [
  { id: 'p1', name: '阿明' },
  { id: 'p2', name: '小美' },
  { id: 'p3', name: 'Chris' },
];

const START_ITEMS: ItemDraft[] = [
  {
    id: 'i1',
    label: '主餐',
    amount: '2400',
    paidBy: 'p1',
    participants: ['p1', 'p2', 'p3'],
    weights: {},
    uneven: false,
  },
  {
    id: 'i2',
    label: '啤酒',
    amount: '900',
    paidBy: 'p2',
    participants: ['p1', 'p2'],
    weights: { p1: '1', p2: '2' },
    uneven: true,
  },
];

const num = (text: string): number => {
  const cleaned = text.replace(/[,\s_$¥￥]/g, '');
  if (cleaned === '') return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
};

export default function SplitBill({ l }: ToolProps) {
  const [people, setPeople] = useState<PersonDraft[]>(START_PEOPLE);
  const [items, setItems] = useState<ItemDraft[]>(START_ITEMS);
  const [nextId, setNextId] = useState(10);
  const [servicePercent, setServicePercent] = useState('10');
  const [tipPercent, setTipPercent] = useState('0');
  const [tipBase, setTipBase] = useState<TipBase>('subtotal');
  const [roundTo, setRoundTo] = useState('1');

  const mint = (prefix: string) => {
    const id = `${prefix}${nextId}`;
    setNextId((value) => value + 1);
    return id;
  };

  const nameOf = (id: string) => people.find((person) => person.id === id)?.name || id;

  const input: SplitInput = useMemo(
    () => ({
      people: people.map((person, index) => ({
        id: person.id,
        name: person.name.trim() || `#${index + 1}`,
      })),
      items: items.map((draft): Item => {
        const participants = draft.participants.filter((id) =>
          people.some((person) => person.id === id)
        );
        return {
          id: draft.id,
          label: draft.label.trim() || draft.id,
          amount: num(draft.amount),
          paidBy: draft.paidBy,
          shares: participants.map((id) => ({
            person: id,
            weight: draft.uneven ? Math.max(num(draft.weights[id] ?? '1'), 0) || 1 : 1,
          })),
        };
      }),
      servicePercent: num(servicePercent),
      tipPercent: num(tipPercent),
      tipBase,
      roundTo: num(roundTo),
    }),
    [people, items, servicePercent, tipPercent, tipBase, roundTo]
  );

  const outcome = useMemo((): { result: SplitResult | null; error: string | null } => {
    try {
      return { result: computeSplit(input), error: null };
    } catch (problem) {
      return {
        result: null,
        error: problem instanceof SplitError ? problem.message : String(problem),
      };
    }
  }, [input]);

  const result = outcome.result;

  const editItem = (id: string, patch: Partial<ItemDraft>) =>
    setItems((previous) => previous.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));

  const toggleParticipant = (itemId: string, personId: string) =>
    setItems((previous) =>
      previous.map((draft) =>
        draft.id === itemId
          ? {
              ...draft,
              participants: draft.participants.includes(personId)
                ? draft.participants.filter((id) => id !== personId)
                : [...draft.participants, personId],
            }
          : draft
      )
    );

  const settlement = result
    ? result.transfers
        .map(
          (transfer) =>
            `${nameOf(transfer.from)} → ${nameOf(transfer.to)}  ${money(transfer.amount, 2)}`
        )
        .join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '帳目', 'THE BILL')}
        rightLabel={t(l, '結算', 'SETTLEMENT')}
        leftAside={
          <span className="inst-no">
            {count(people.length)} {t(l, '人', 'people')} · {count(items.length)}{' '}
            {t(l, '項', 'items')}
          </span>
        }
        rightAside={
          result ? <span className="inst-no">{money(result.total, 2)}</span> : null
        }
        left={
          <>
            <div className="inst-field">
              <span className="inst-label">{t(l, '參與的人', 'People')}</span>
              {people.map((person, index) => (
                <Row key={person.id}>
                  <Input
                    value={person.name}
                    onChange={(value) =>
                      setPeople((previous) =>
                        previous.map((entry) =>
                          entry.id === person.id ? { ...entry, name: value } : entry
                        )
                      )
                    }
                    placeholder={`#${index + 1}`}
                  />
                  <Btn
                    disabled={people.length <= 1}
                    onClick={() => {
                      setPeople((previous) => previous.filter((entry) => entry.id !== person.id));
                      setItems((previous) =>
                        previous.map((draft) => ({
                          ...draft,
                          participants: draft.participants.filter((id) => id !== person.id),
                          paidBy:
                            draft.paidBy === person.id
                              ? people.find((entry) => entry.id !== person.id)?.id ?? draft.paidBy
                              : draft.paidBy,
                        }))
                      );
                    }}
                  >
                    {t(l, '移除', 'remove')}
                  </Btn>
                </Row>
              ))}
              <Row>
                <Btn
                  disabled={people.length >= MAX_PEOPLE}
                  onClick={() => {
                    const id = mint('p');
                    setPeople((previous) => [
                      ...previous,
                      { id, name: `#${previous.length + 1}` },
                    ]);
                  }}
                >
                  {t(l, '加一個人', 'add a person')}
                </Btn>
              </Row>
            </div>

            <div className="inst-field">
              <span className="inst-label">{t(l, '項目', 'Items')}</span>
              {items.map((draft) => (
                <div
                  key={draft.id}
                  style={{
                    borderTop: '1px solid var(--border-1)',
                    paddingTop: '0.5rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <Row>
                    <Input
                      label={t(l, '名稱', 'What')}
                      value={draft.label}
                      onChange={(value) => editItem(draft.id, { label: value })}
                    />
                    <Input
                      label={t(l, '金額', 'Amount')}
                      value={draft.amount}
                      onChange={(value) => editItem(draft.id, { amount: value })}
                    />
                    <Select
                      label={t(l, '誰先付的', 'Fronted by')}
                      value={draft.paidBy}
                      options={people.map((person, index) => ({
                        value: person.id,
                        label: person.name.trim() || `#${index + 1}`,
                      }))}
                      onChange={(value) => editItem(draft.id, { paidBy: value })}
                    />
                    <Btn onClick={() => setItems((previous) => previous.filter((entry) => entry.id !== draft.id))}>
                      {t(l, '刪除', 'delete')}
                    </Btn>
                  </Row>
                  <div className="inst-toolbar">
                    {people.map((person, index) => {
                      const on = draft.participants.includes(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          className="inst-btn"
                          aria-pressed={on}
                          data-primary={on ? 'true' : undefined}
                          onClick={() => toggleParticipant(draft.id, person.id)}
                        >
                          {person.name.trim() || `#${index + 1}`}
                        </button>
                      );
                    })}
                    <Btn
                      onClick={() =>
                        editItem(draft.id, { participants: people.map((person) => person.id) })
                      }
                    >
                      {t(l, '全選', 'all')}
                    </Btn>
                    <Check2
                      label={t(l, '不均分', 'uneven')}
                      checked={draft.uneven}
                      onChange={(value) => editItem(draft.id, { uneven: value })}
                    />
                  </div>
                  {draft.uneven ? (
                    <Row>
                      {draft.participants.map((id) => (
                        <Input
                          key={id}
                          label={t(l, `${nameOf(id)} 的份數`, `${nameOf(id)} shares`)}
                          value={draft.weights[id] ?? '1'}
                          onChange={(value) =>
                            editItem(draft.id, { weights: { ...draft.weights, [id]: value } })
                          }
                        />
                      ))}
                    </Row>
                  ) : null}
                </div>
              ))}
              <Row>
                <Btn
                  disabled={items.length >= MAX_ITEMS}
                  onClick={() => {
                    const id = mint('i');
                    setItems((previous) => [
                      ...previous,
                      {
                        id,
                        label: '',
                        amount: '0',
                        paidBy: people[0]?.id ?? '',
                        participants: people.map((person) => person.id),
                        weights: {},
                        uneven: false,
                      },
                    ]);
                  }}
                >
                  {t(l, '加一項', 'add an item')}
                </Btn>
              </Row>
            </div>

            <Row>
              <Input
                label={t(l, '服務費 %', 'Service charge %')}
                value={servicePercent}
                onChange={setServicePercent}
              />
              <Input label={t(l, '小費 %', 'Tip %')} value={tipPercent} onChange={setTipPercent} />
              <Select
                label={t(l, '結到多少', 'Round each to')}
                value={roundTo}
                options={[
                  { value: '0', label: t(l, '不進位(到分)', 'no rounding') },
                  { value: '1', label: t(l, '整數元', 'whole 1') },
                  { value: '5', label: t(l, '5 元', 'nearest 5') },
                  { value: '10', label: t(l, '10 元', 'nearest 10') },
                  { value: '100', label: t(l, '100 元', 'nearest 100') },
                ]}
                onChange={setRoundTo}
              />
            </Row>
            {num(tipPercent) > 0 ? (
              <Row>
                <Seg
                  label={t(l, '小費算在哪個基礎上', 'Tip is taken on')}
                  value={tipBase}
                  onChange={setTipBase}
                  options={[
                    { value: 'subtotal', label: t(l, '未加服務費', 'subtotal') },
                    { value: 'withService', label: t(l, '含服務費', 'subtotal + service') },
                  ]}
                />
              </Row>
            ) : null}

            {outcome.error ? <Note error>{outcome.error}</Note> : null}
            <Note>
              {t(
                l,
                '服務費與小費是按各人自己的小計比例分,不是平均分。平均分等於讓點沙拉的人補貼點牛排的人。',
                'Service and tip are proportional to each person’s own subtotal, not split equally — splitting them equally makes the salad subsidise the steak.'
              )}
            </Note>
          </>
        }
        right={
          !result ? (
            <Note>{t(l, '帳目還不完整。', 'The bill is incomplete.')}</Note>
          ) : (
            <div aria-live="polite">
              <Table
                head={[
                  t(l, '人', 'person'),
                  t(l, '小計', 'subtotal'),
                  t(l, '服務費+小費', 'service + tip'),
                  t(l, '應付', 'owes'),
                  t(l, '已付', 'fronted'),
                  t(l, '差額', 'net'),
                ]}
                align={['left', 'right', 'right', 'right', 'right', 'right']}
                rows={result.people.map((person) => [
                  <span key="n">{person.name}</span>,
                  <span key="s" className="inst-no">
                    {money(person.subtotal, 2)}
                  </span>,
                  <span key="t" className="inst-no">
                    {money(person.service + person.tip, 2)}
                  </span>,
                  <span key="o" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {money(person.owes, 2)}
                  </span>,
                  <span key="p" className="inst-no">
                    {money(person.paid, 2)}
                  </span>,
                  <span
                    key="net"
                    className="inst-no"
                    style={{
                      color:
                        person.net > 0.005
                          ? 'var(--data-teal)'
                          : person.net < -0.005
                            ? 'var(--accent)'
                            : undefined,
                    }}
                  >
                    {person.net > 0.005 ? '+' : ''}
                    {money(person.net, 2)}
                  </span>,
                ])}
              />
              <Note>
                {t(
                  l,
                  '差額為正(青色)是別人要還他,為負(強調色)是他要付出去。',
                  'A positive net (teal) means the group owes them; negative (accent) means they owe the group.'
                )}
              </Note>

              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '誰付給誰', 'WHO PAYS WHOM')}</span>
                  <span className="inst-no">
                    {count(result.transfers.length)} {t(l, '筆', 'transfers')}
                  </span>
                </div>
                {result.transfers.length === 0 ? (
                  <Note>{t(l, '大家剛好互相打平,不用轉帳。', 'The group is already square — nothing to transfer.')}</Note>
                ) : (
                  <>
                    <Table
                      head={[t(l, '付款人', 'from'), t(l, '收款人', 'to'), t(l, '金額', 'amount')]}
                      align={['left', 'left', 'right']}
                      rows={result.transfers.map((transfer, index) => [
                        <span key={`f${index}`}>{nameOf(transfer.from)}</span>,
                        <span key={`t${index}`}>{nameOf(transfer.to)}</span>,
                        <span key={`a${index}`} className="inst-no" style={{ color: 'var(--fg)' }}>
                          {money(transfer.amount, 2)}
                        </span>,
                      ])}
                    />
                    <Row>
                      <CopyButton l={l} text={settlement} label={t(l, '複製轉帳清單', 'copy transfers')} />
                    </Row>
                  </>
                )}
              </div>

              <Table
                head={[t(l, '總計', 'totals'), t(l, '金額', 'amount')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '項目小計', 'items subtotal'), money(result.subtotal, 2)],
                  [t(l, '服務費', 'service charge'), money(result.service, 2)],
                  [t(l, '小費', 'tip'), money(result.tip, 2)],
                  [t(l, '帳單合計', 'bill total'), money(result.total, 2)],
                ].map(([k, v]) => [
                  <span key="k" style={{ fontSize: '0.8125rem' }}>
                    {k}
                  </span>,
                  <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {v}
                  </span>,
                ])}
              />

              {result.residualAbsorbedBy ? (
                <Note>
                  {t(
                    l,
                    `進位到這個單位之後,各人的整數金額加起來跟帳單差 ${money(result.roundingResidual, 2)},由出錢最多的 ${nameOf(result.residualAbsorbedBy)} 吸收——也就是「你們各給我整數,零頭我出」。`,
                    `After rounding, the whole-unit shares differ from the bill by ${money(result.roundingResidual, 2)}. ${nameOf(result.residualAbsorbedBy)}, who fronted the most, absorbs it — the usual "give me a round number and I'll cover the change".`
                  )}
                </Note>
              ) : null}
            </div>
          )
        }
      />

      <div className="mt-8">
        <Panel label={t(l, '轉帳筆數怎麼來的', 'HOW THE TRANSFER LIST IS BUILT')}>
          <Note>
            {t(
              l,
              '把每個人的差額算出來之後,拿欠最多的去還給被欠最多的,清掉一邊再繼續。這樣 n 個人最多 n−1 筆轉帳,通常更少,不會變成每個人都要付給每個人。',
              'Once every net is known, the largest debtor pays the largest creditor, whichever side clears first drops out, and it repeats. That gives at most n−1 transfers for n people instead of everybody paying everybody.'
            )}
          </Note>
          <Note>
            {t(
              l,
              '這不保證是理論上的最少筆數——那個問題是 NP-hard——但實際的聚餐幾乎都剛好是最少,而且算得完。',
              'It is not provably the minimum — that problem is NP-hard — but on real groups it almost always is, and it finishes.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '人數', 'people'), v: count(people.length) },
          { k: t(l, '項目', 'items'), v: count(items.length) },
          { k: t(l, '帳單合計', 'bill'), v: result ? money(result.total, 2) : '—' },
          { k: t(l, '轉帳筆數', 'transfers'), v: result ? count(result.transfers.length) : '—' },
          {
            k: t(l, '進位零頭', 'rounding'),
            v: result ? money(result.roundingResidual, 2) : '—',
          },
        ]}
      />
    </div>
  );
}
