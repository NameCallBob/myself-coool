'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  Check2,
  CopyButton,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { below } from '@/lib/tools/random';
import {
  ImpossibleOptions,
  MAX_DIGITS,
  MAX_WORDS,
  MIN_WORDS,
  SEPARATORS,
  SYMBOLS,
  bitsPerWord,
  entropyBreakdown,
  generatePassphrase,
  guessTime,
  listFor,
  normalizeWordlist,
  strengthOf,
  type Capitalize,
  type Options,
  type SeparatorId,
} from './logic';

const STRENGTH_COLOUR = {
  weak: 'var(--accent)',
  fair: 'var(--fg-muted)',
  strong: 'var(--data-teal)',
  excessive: 'var(--data-teal)',
} as const;

/**
 * Sensitive tool: nothing is stored. A passphrase you intend to use should be
 * typed into your password manager from here and then forgotten by this tab.
 */
export default function Passphrase({ l }: ToolProps) {
  const [options, setOptions] = useState<Options>({
    words: 6,
    separator: 'hyphen',
    capitalize: 'none',
    digits: 0,
    symbol: false,
  });
  const [customText, setCustomText] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const custom = useMemo(() => normalizeWordlist(customText), [customText]);
  const effective = useMemo<Options>(
    () => ({ ...options, list: useCustom && custom.length > 1 ? custom : undefined }),
    [options, useCustom, custom]
  );

  const list = listFor(effective);
  const perWord = bitsPerWord(list);
  const breakdown = entropyBreakdown(effective);
  const strength = strengthOf(breakdown.total);

  const roll = useCallback(() => {
    try {
      setPhrases(Array.from({ length: 5 }, () => generatePassphrase(effective, below)));
      setError(null);
    } catch (problem) {
      setPhrases([]);
      setError(problem instanceof ImpossibleOptions ? problem.message : String(problem));
    }
  }, [effective]);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const label = {
    weak: t(l, '偏弱', 'weak'),
    fair: t(l, '堪用', 'fair'),
    strong: t(l, '夠強', 'strong'),
    excessive: t(l, '超出需要', 'more than enough'),
  }[strength];

  return (
    <div>
      <div className="inst-bench">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '設定', 'OPTIONS')}</span>
            <span className="inst-no">
              {t(l, '字表', 'list')} {count(list.length)} · {fixed(perWord, 2)} bit/{t(l, '字', 'word')}
            </span>
          </div>

          <div className="inst-field">
            <label className="inst-label" htmlFor="pp-words">
              {t(l, `字數 ${options.words}`, `Words ${options.words}`)}
            </label>
            <input
              id="pp-words"
              type="range"
              min={MIN_WORDS}
              max={MAX_WORDS}
              value={options.words}
              onChange={(event) => set('words', Number(event.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <p className="inst-hint">
              {t(
                l,
                '用這個字表:四個字 44 bit(離線破解只要幾分鐘),六個字 66 bit,七個字 77 bit。要抗離線攻擊就給六個以上。',
                'With this list: four words is 44 bits (minutes to an offline attack), six is 66, seven is 77. Give anything attackable offline six or more.'
              )}
            </p>
          </div>

          <Row>
            <Seg
              label={t(l, '分隔', 'Separator')}
              value={options.separator}
              onChange={(value) => set('separator', value as SeparatorId)}
              options={Object.keys(SEPARATORS).map((id) => ({
                value: id,
                label: SEPARATORS[id] === '' ? t(l, '無', 'none') : SEPARATORS[id] === ' ' ? '␣' : SEPARATORS[id],
              }))}
            />
            <Select
              label={t(l, '大寫', 'Capitals')}
              value={options.capitalize}
              onChange={(value) => set('capitalize', value as Capitalize)}
              options={[
                { value: 'none', label: t(l, '全小寫', 'all lower case') },
                { value: 'each', label: t(l, '每字開頭(0 bit)', 'every word (0 bits)') },
                { value: 'one-random', label: t(l, '隨機一個字', 'one random word') },
              ]}
            />
          </Row>

          <Row>
            <Select
              label={t(l, '結尾數字', 'Trailing digits')}
              value={String(options.digits)}
              onChange={(value) => set('digits', Number(value))}
              options={Array.from({ length: MAX_DIGITS + 1 }, (_, n) => ({
                value: String(n),
                label: n === 0 ? t(l, '不加', 'none') : `${n}`,
              }))}
            />
            <Check2
              label={t(l, '加一個符號', 'add one symbol')}
              checked={options.symbol}
              onChange={(value) => set('symbol', value)}
            />
          </Row>

          <Row>
            <Check2
              label={t(l, '用自己的字表', 'use my own wordlist')}
              checked={useCustom}
              onChange={setUseCustom}
            />
          </Row>
          {useCustom ? (
            <>
              <Area
                label={t(l, '字表(一行一個字,或用空白分隔)', 'Wordlist (one per line, or space-separated)')}
                hint={t(
                  l,
                  'EFF 的長字表、BIP-39、或你自己的語言都可以。重複的字會先去掉,熵是按去重後的數量算的。',
                  'The EFF long list, BIP-39, or your own language. Duplicates are removed first, and the entropy uses the de-duplicated count.'
                )}
                value={customText}
                onChange={setCustomText}
                rows={6}
                placeholder={'11116\tacid\n11121\tacorn\n…'}
              />
              <Note>
                {custom.length > 1
                  ? t(
                      l,
                      `去重後 ${custom.length} 個字,每個字 ${fixed(Math.log2(custom.length), 2)} bit。`,
                      `${custom.length} words after de-duplication, ${fixed(Math.log2(custom.length), 2)} bits each.`
                    )
                  : t(l, '至少要兩個字才算得出熵,目前還在用內建字表。', 'At least two words are needed; the built-in list is still in use.')}
              </Note>
            </>
          ) : null}

          <Row>
            <Btn onClick={roll} primary>
              {t(l, '產生五組', 'generate five')}
            </Btn>
            {phrases.length > 0 ? (
              <Btn onClick={() => setPhrases([])}>{t(l, '清空', 'clear')}</Btn>
            ) : null}
          </Row>
          {error ? <Note error>{error}</Note> : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '結果', 'RESULT')}</span>
            <span className="inst-no" style={{ color: STRENGTH_COLOUR[strength] }}>
              {fixed(breakdown.total, 1)} bits · {label}
            </span>
          </div>

          {phrases.length === 0 ? (
            <Note>
              {t(
                l,
                '按「產生五組」,挑一組唸得順的。密語只存在這個分頁的記憶體裡,重新整理就沒了。',
                'Press generate and pick one that reads well. Passphrases live in this tab’s memory and are gone on reload.'
              )}
            </Note>
          ) : (
            <>
              <Table
                head={[t(l, '密語', 'passphrase'), t(l, '字元', 'chars'), '']}
                rows={phrases.map((phrase) => [
                  <span key="p" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {phrase}
                  </span>,
                  <span key="n" className="inst-no">
                    {phrase.length}
                  </span>,
                  <CopyButton key="c" l={l} text={phrase} />,
                ])}
              />
              <Row>
                <CopyButton l={l} text={phrases.join('\n')} label={t(l, '全部複製', 'copy all')} />
              </Row>
            </>
          )}

          <Panel label={t(l, '這些 bit 從哪來', 'WHERE THE BITS COME FROM')}>
            <Table
              head={[t(l, '來源', 'source'), t(l, 'bit', 'bits')]}
              align={['left', 'right']}
              rows={[
                [
                  t(l, `${options.words} 個字 × ${fixed(perWord, 2)}`, `${options.words} words × ${fixed(perWord, 2)}`),
                  fixed(breakdown.words, 1),
                ],
                [
                  t(l, '大寫位置', 'capitalisation'),
                  breakdown.capitalization === 0
                    ? t(l, '0(固定樣式)', '0 (a fixed pattern)')
                    : fixed(breakdown.capitalization, 1),
                ],
                [t(l, `結尾 ${options.digits} 位數字`, `${options.digits} trailing digits`), fixed(breakdown.digits, 1)],
                [
                  t(l, `符號(${SYMBOLS.length} 種)`, `symbol (${SYMBOLS.length} options)`),
                  fixed(breakdown.symbol, 1),
                ],
                [t(l, '合計', 'total'), fixed(breakdown.total, 1)],
              ]}
            />
            <Note>
              {t(
                l,
                '多加一個字等於多 ' +
                  fixed(perWord, 2) +
                  ' bit,比所有裝飾加起來都多。裝飾只有在「選哪一個」是隨機的時候才算 bit——每個字都大寫、結尾固定加 1!,攻擊者本來就會試。',
                'One more word is worth ' +
                  fixed(perWord, 2) +
                  ' bits — more than every decoration combined. Decoration only counts when the choice was random; capitalising every word or ending with 1! is already in every cracking rule set.'
              )}
            </Note>
          </Panel>
        </section>
      </div>

      <Panel label={t(l, '這個強度撐得住什麼', 'WHAT THAT STRENGTH SURVIVES')}>
        <Table
          head={[t(l, '攻擊情境', 'scenario'), t(l, '每秒猜測', 'guesses/s'), t(l, '耗時', 'time')]}
          rows={[
            [t(l, '線上服務(有節流)', 'online service, throttled'), '1e3', guessTime(breakdown.total, 1e3)],
            [
              t(l, '外洩的慢雜湊(bcrypt)', 'leaked slow hash (bcrypt)'),
              '1e5',
              guessTime(breakdown.total, 1e5),
            ],
            [
              t(l, '外洩的快雜湊(SHA-256)', 'leaked fast hash (SHA-256)'),
              '1e11',
              guessTime(breakdown.total, 1e11),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            '時間是猜完一半 keyspace 的估計,假設攻擊者知道你用了這個字表與這組規則——這是唯一誠實的假設,因為字表就公開在這一頁裡。真正的風險通常不是被暴力破解,而是同一組密語用在兩個地方。',
            'Times are for exhausting half the keyspace, assuming the attacker knows this wordlist and these rules — the only honest assumption, since the list is on this page. The real risk is usually not brute force but reusing the same passphrase in two places.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '字數', 'words'), v: String(options.words) },
          { k: t(l, '字表', 'list'), v: count(list.length) },
          { k: t(l, '每字', 'per word'), v: `${fixed(perWord, 2)} bits` },
          { k: t(l, '熵', 'entropy'), v: `${fixed(breakdown.total, 1)} bits` },
          { k: t(l, '亂數來源', 'source'), v: 'crypto.getRandomValues' },
        ]}
      />
    </div>
  );
}
