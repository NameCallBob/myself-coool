'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import { toHex } from '@/lib/tools/bytes';
import { count } from '@/lib/tools/format';
import { randomBytes } from '@/lib/tools/random';
import {
  DrawError,
  MAX_ENTRIES,
  drawNames,
  formatDice,
  groupInto,
  parseDice,
  parseEntries,
  rollDice,
  ticketPool,
  type GroupMode,
} from './logic';

type Mode = 'draw' | 'group' | 'dice';

const SAMPLE = [
  '# 一行一個名字,# 開頭的行會跳過',
  '# 名字後面加 *3 就是三張票(中獎機率三倍,但只會中一次)',
  '林昱廷',
  '陳威宇',
  '黃思婷',
  '張家豪 *3',
  '李佩蓉',
  '吳承翰',
  '劉品妤',
  '鄭伯彥',
].join('\n');

/** 128 bits from getRandomValues, written as the 32-hex form the seed parser
 *  reads straight into generator state. Only ever called from a click. */
function freshSeed(): string {
  return toHex(randomBytes(16));
}

/**
 * Everything on screen is a pure function of (list, options, seed).
 *
 * The seed is the only place randomness enters, it only ever changes inside a
 * click handler, and it starts empty — so the prerendered HTML and the hydrated
 * page agree, and nothing is drawn until someone asks for a draw. It also means
 * a result can be reproduced: that is the entire reason this tool exists rather
 * than the person just shuffling the list themselves.
 */
export default function RandomDraw({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('draw');
  const [text, setText] = useState(SAMPLE);
  const [wanted, setWanted] = useState('3');
  const [replace, setReplace] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('count');
  const [groupValue, setGroupValue] = useState('3');
  const [dice, setDice] = useState('2d6+3');
  const [seed, setSeed] = useState('');
  const [publicSeed, setPublicSeed] = useState(false);

  const parsed = useMemo(() => parseEntries(text), [text]);
  const entries = parsed.entries;
  const names = useMemo(() => entries.map((entry) => entry.name), [entries]);
  const poolSize = useMemo(() => ticketPool(entries).length, [entries]);

  const wantedNumber = Math.max(1, Math.trunc(Number(wanted) || 0));
  const groupNumber = Math.max(1, Math.trunc(Number(groupValue) || 0));

  const drawn = useMemo(() => {
    if (mode !== 'draw' || seed === '' || entries.length === 0) return null;
    try {
      return { ok: drawNames(entries, wantedNumber, seed, replace), error: null };
    } catch (problem) {
      return { ok: null, error: problem };
    }
  }, [mode, entries, wantedNumber, seed, replace]);

  const groups = useMemo(() => {
    if (mode !== 'group' || seed === '' || names.length === 0) return null;
    try {
      return { ok: groupInto(names, groupMode, groupNumber, seed), error: null };
    } catch (problem) {
      return { ok: null, error: problem };
    }
  }, [mode, names, groupMode, groupNumber, seed]);

  const diceTerms = useMemo(() => {
    try {
      return { ok: parseDice(dice), error: null };
    } catch (problem) {
      return { ok: null, error: problem };
    }
  }, [dice]);

  const roll = useMemo(() => {
    if (mode !== 'dice' || seed === '' || !diceTerms.ok) return null;
    return rollDice(diceTerms.ok, seed);
  }, [mode, seed, diceTerms.ok]);

  /** Logic throws in English. Say the same thing in the reader's language and
   *  keep the detail, which names the offending fragment. */
  const say = (problem: unknown): string => {
    const detail = problem instanceof Error ? problem.message : String(problem);
    if (!(problem instanceof DrawError)) return detail;
    return t(l, `這個要求做不到:${detail}`, `Cannot do that: ${detail}`);
  };

  const label =
    mode === 'dice' ? t(l, '擲骰', 'roll') : seed === '' ? t(l, '抽', 'draw') : t(l, '重抽', 'draw again');

  const verification = useMemo(() => {
    if (seed === '') return '';
    const head = [
      `${t(l, '種子', 'seed')}: ${seed}`,
      `${t(l, '亂數器', 'generator')}: xoshiro128** (Blackman & Vigna)`,
      `${t(l, '種子展開', 'seeding')}: ${t(l, '32 位 hex 直接讀成四個 32-bit 字;其他字串走 FNV-1a + SplitMix32', '32 hex digits read as four 32-bit words; any other string via FNV-1a + SplitMix32')}`,
    ];
    if (mode === 'dice' && roll && diceTerms.ok) {
      return [
        ...head,
        `${t(l, '寫法', 'notation')}: ${formatDice(diceTerms.ok)}`,
        `${t(l, '取值', 'draws')}: rng.between(1, faces) ${t(l, '依序,逐項逐顆', 'in order, term by term, die by die')}`,
        `${t(l, '結果', 'result')}: ${roll.total}`,
      ].join('\n');
    }
    if (mode === 'group' && groups?.ok) {
      return [
        ...head,
        `${t(l, '做法', 'method')}: ${t(l, '名單 Fisher–Yates 洗牌,再依序輪流發進各組', 'Fisher–Yates over the list, then dealt round-robin into the groups')}`,
        `${t(l, '名單', 'list')}:`,
        ...names,
        `${t(l, '結果', 'result')}:`,
        ...groups.ok.map((group, index) => `${index + 1}. ${group.join(', ')}`),
      ].join('\n');
    }
    if (mode === 'draw' && drawn?.ok) {
      return [
        ...head,
        `${t(l, '做法', 'method')}: ${
          replace
            ? t(l, '每次從票池取一張(可重複)', 'one ticket drawn from the pool each time, repeats allowed')
            : t(l, '票池 Fisher–Yates 洗牌,取每個名字第一次出現的順序', 'Fisher–Yates over the ticket pool, keeping each name at its first appearance')
        }`,
        `${t(l, '票池', 'pool')}: ${poolSize}`,
        `${t(l, '名單', 'list')}:`,
        ...entries.map((entry) => (entry.tickets === 1 ? entry.name : `${entry.name} *${entry.tickets}`)),
        `${t(l, '結果', 'result')}:`,
        ...drawn.ok.winners.map((name, index) => `${index + 1}. ${name}`),
      ].join('\n');
    }
    return head.join('\n');
  }, [l, seed, mode, roll, diceTerms.ok, groups, drawn, names, entries, poolSize, replace]);

  const controls = (
    <>
      <Row>
        <Seg
          label={t(l, '要做什麼', 'What to do')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'draw', label: t(l, '抽人 / 抽獎', 'draw names') },
            { value: 'group', label: t(l, '分組', 'split groups') },
            { value: 'dice', label: t(l, '擲骰', 'dice') },
          ]}
        />
      </Row>

      {mode === 'dice' ? (
        <Input
          label={t(l, '骰子寫法', 'Dice notation')}
          hint={t(
            l,
            '2d6、3d8+2、1d20-1、2d6+1d4+3 都讀得懂。最多 20 項,單項最多 1000 顆、1000 面。',
            '2d6, 3d8+2, 1d20-1, 2d6+1d4+3. At most 20 terms; each term up to 1000 dice of up to 1000 faces.'
          )}
          value={dice}
          onChange={setDice}
          invalid={!diceTerms.ok}
          placeholder="2d6+3"
        />
      ) : (
        <Area
          label={t(l, '名單', 'List')}
          hint={t(
            l,
            `一行一個。名字後面加 *3 代表三張票。# 開頭的行跳過。上限 ${MAX_ENTRIES} 行。`,
            `One per line. A trailing *3 means three tickets. Lines starting with # are skipped. Up to ${MAX_ENTRIES} lines.`
          )}
          value={text}
          onChange={setText}
          rows={12}
          placeholder={t(l, '林昱廷\n陳威宇\n黃思婷 *3', 'Ada\nGrace\nAlan *3')}
        />
      )}

      {mode === 'draw' ? (
        <Row>
          <Input
            label={t(l, '抽幾個', 'How many')}
            value={wanted}
            onChange={setWanted}
            type="number"
            min={1}
            max={MAX_ENTRIES}
          />
          <Check2
            label={t(l, '可以重複中(每次都放回)', 'allow repeats (draw with replacement)')}
            checked={replace}
            onChange={setReplace}
          />
        </Row>
      ) : null}

      {mode === 'group' ? (
        <Row>
          <Seg
            label={t(l, '分組依據', 'Split by')}
            value={groupMode}
            onChange={setGroupMode}
            options={[
              { value: 'count', label: t(l, '分成幾組', 'number of groups') },
              { value: 'size', label: t(l, '每組幾人', 'people per group') },
            ]}
          />
          <Input
            label={groupMode === 'count' ? t(l, '組數', 'Groups') : t(l, '每組人數', 'Per group')}
            value={groupValue}
            onChange={setGroupValue}
            type="number"
            min={1}
          />
        </Row>
      ) : null}

      <Row>
        <Btn onClick={() => setSeed(freshSeed())} primary>
          {label}
        </Btn>
        <Check2
          label={t(l, '公開種子模式', 'published-seed mode')}
          checked={publicSeed}
          onChange={setPublicSeed}
        />
      </Row>

      {publicSeed ? (
        <>
          <Input
            label={t(l, '種子', 'Seed')}
            hint={t(
              l,
              '任何字串都可以當種子;32 位 hex 會整批讀成 128 bits 的生成器狀態。抽之前把種子公布出去,抽完連名單一起貼,別人重新輸入就能得到同一個順序。',
              'Any string works as a seed; 32 hex digits are read as the full 128-bit generator state. Publish the seed before the draw, publish the list after it, and anyone can reproduce the same order.'
            )}
            value={seed}
            onChange={setSeed}
            placeholder={t(l, '例如 2026-09-26-尾牙 或 32 位 hex', 'e.g. 2026-09-26-raffle, or 32 hex digits')}
          />
          <Note>
            {t(
              l,
              '這個模式是為了「事後可驗證」,不是為了安全。種子一旦公開,接下來的序列任何人都算得出來 —— 抽獎要的正是這件事,金鑰不能這樣做(那要用金鑰產生器,它直接向 getRandomValues 取值)。',
              'This mode exists to make a draw checkable afterwards, not to make it secret. Once the seed is out, anyone can compute the rest of the sequence — which is the point for a raffle and disqualifying for a key. Keys come from the keypair tool, which calls getRandomValues directly.'
            )}
          </Note>
        </>
      ) : null}

      {mode !== 'dice' && parsed.truncated ? (
        <Note error>
          {t(
            l,
            `名單超過 ${MAX_ENTRIES} 行,只讀了前 ${MAX_ENTRIES} 行。`,
            `The list is longer than ${MAX_ENTRIES} lines; only the first ${MAX_ENTRIES} were read.`
          )}
        </Note>
      ) : null}

      {mode === 'dice' && diceTerms.error ? <Note error>{say(diceTerms.error)}</Note> : null}
      {mode === 'draw' && drawn?.error ? <Note error>{say(drawn.error)}</Note> : null}
      {mode === 'group' && groups?.error ? <Note error>{say(groups.error)}</Note> : null}
    </>
  );

  const waiting = (
    <Note>
      {mode === 'dice'
        ? t(l, '按「擲骰」。', 'Press roll.')
        : entries.length === 0
          ? t(l, '名單是空的。', 'The list is empty.')
          : t(l, '按「抽」。結果是名單與種子的函數,兩者不動就不會變。', 'Press draw. The result is a function of the list and the seed; neither changes on its own.')}
    </Note>
  );

  const result = (
    <div aria-live="polite">
      {seed === '' || (mode !== 'dice' && entries.length === 0) ? waiting : null}

      {mode === 'draw' && drawn?.ok ? (
        <>
          <Table
            head={['#', t(l, '中籤', 'drawn'), t(l, '票數', 'tickets')]}
            align={['right', 'left', 'right']}
            rows={drawn.ok.winners.map((name, index) => [
              <span key="n" className="inst-no">
                {index + 1}
              </span>,
              <span key="w" className="inst-wrap">
                {name}
              </span>,
              <span key="t" className="inst-no">
                {entries.find((entry) => entry.name === name)?.tickets ?? 1}
              </span>,
            ])}
          />
          {drawn.ok.rest.length > 0 ? (
            <Note>
              {t(l, '備取順序:', 'Next in line: ')}
              {drawn.ok.rest.slice(0, 12).join('、')}
              {drawn.ok.rest.length > 12 ? t(l, ` …共 ${drawn.ok.rest.length} 人`, ` …${drawn.ok.rest.length} in all`) : ''}
            </Note>
          ) : null}
        </>
      ) : null}

      {mode === 'group' && groups?.ok ? (
        <Table
          head={[t(l, '組', 'group'), t(l, '成員', 'members'), t(l, '人數', 'size')]}
          align={['right', 'left', 'right']}
          rows={groups.ok.map((group, index) => [
            <span key="n" className="inst-no">
              {index + 1}
            </span>,
            <span key="m" className="inst-wrap">
              {group.join('、')}
            </span>,
            <span key="s" className="inst-no">
              {group.length}
            </span>,
          ])}
        />
      ) : null}

      {mode === 'dice' && roll ? (
        <>
          <p className="inst-no" style={{ fontSize: '1.6rem', color: 'var(--fg)' }}>
            {roll.total}
          </p>
          <Table
            head={[t(l, '項', 'term'), t(l, '每顆', 'each die'), t(l, '小計', 'subtotal')]}
            align={['left', 'left', 'right']}
            rows={roll.terms.map((entry) => [
              <span key="t" className="inst-no">
                {formatDice([entry.term])}
              </span>,
              <span key="r" className="inst-wrap inst-no">
                {entry.rolls.length === 0 ? '—' : entry.rolls.join(' ')}
              </span>,
              <span key="s" className="inst-no">
                {entry.subtotal}
              </span>,
            ])}
          />
          <Note>
            {t(
              l,
              `這串寫法的範圍是 ${roll.min} 到 ${roll.max}。`,
              `This notation ranges from ${roll.min} to ${roll.max}.`
            )}
          </Note>
        </>
      ) : null}

      {seed !== '' ? (
        <Row>
          <CopyButton
            l={l}
            text={
              mode === 'draw'
                ? (drawn?.ok?.winners.join('\n') ?? '')
                : mode === 'group'
                  ? (groups?.ok ?? []).map((group, index) => `${index + 1}. ${group.join('、')}`).join('\n')
                  : String(roll?.total ?? '')
            }
            label={t(l, '複製結果', 'copy result')}
          />
          <CopyButton l={l} text={verification} label={t(l, '複製驗證資料', 'copy the proof')} />
        </Row>
      ) : null}
    </div>
  );

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '設定', 'SETUP')}</span>
            <span className="inst-no">
              {mode === 'dice'
                ? diceTerms.ok
                  ? formatDice(diceTerms.ok)
                  : '—'
                : t(l, `${count(entries.length)} 人 / ${count(poolSize)} 票`, `${count(entries.length)} names / ${count(poolSize)} tickets`)}
            </span>
          </div>
          {controls}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '結果', 'RESULT')}</span>
            <span className="inst-no">{seed === '' ? '—' : `${t(l, '種子', 'seed')} ${seed.slice(0, 8)}…`}</span>
          </div>
          {result}
        </section>
      </div>

      {seed !== '' ? (
        <div className="mt-8">
          <Panel label={t(l, '這一次是怎麼抽的', 'HOW THIS ONE WAS DRAWN')}>
            <Area label={t(l, '驗證資料', 'Proof')} value={verification} rows={8} readOnly />
            <Note>
              {t(
                l,
                '種子是 crypto.getRandomValues 取的 128 bits;之後的每一步都是這個種子的函數,沒有第二個亂數來源。把上面這段連同名單貼出去,誰都能自己重跑一次 —— 不用信任這個網頁。',
                'The seed is 128 bits from crypto.getRandomValues; every step after it is a function of that seed, with no second source of randomness. Publish the block above and anyone can rerun the draw without trusting this page.'
              )}
            </Note>
            <Note>
              {t(
                l,
                '界線:序列由 128 bits 展開,所以超過 34 人的名單在理論上不是每一種排列都到得了 —— 對「誰會中」沒有可測量的影響,換來的是可以重現。要的是不可重現的隨機,就別開公開種子模式,每按一次都是新種子。',
                'The limit: the sequence is expanded from 128 bits, so for lists longer than 34 names not every permutation is reachable. That has no measurable effect on who wins, and it buys reproducibility. If you want a draw nobody can reproduce, leave published-seed mode off — every press takes a new seed.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          mode === 'dice'
            ? { k: t(l, '骰子', 'dice'), v: diceTerms.ok ? formatDice(diceTerms.ok) : '—' }
            : { k: t(l, '名單', 'names'), v: count(entries.length) },
          mode === 'draw'
            ? { k: t(l, '票池', 'tickets'), v: count(poolSize) }
            : mode === 'group'
              ? { k: t(l, '組數', 'groups'), v: count(groups?.ok?.length ?? 0) }
              : { k: t(l, '範圍', 'range'), v: roll ? `${roll.min}–${roll.max}` : '—' },
          { k: t(l, '結果', 'result'), v: mode === 'dice' ? String(roll?.total ?? '—') : count(mode === 'draw' ? (drawn?.ok?.winners.length ?? 0) : (groups?.ok?.length ?? 0)) },
          { k: t(l, '亂數來源', 'source'), v: 'getRandomValues → xoshiro128**' },
          { k: t(l, '種子', 'seed'), v: seed === '' ? '—' : `${seed.slice(0, 8)}…` },
        ]}
      />
    </div>
  );
}
