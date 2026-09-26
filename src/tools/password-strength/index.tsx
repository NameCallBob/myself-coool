'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Table,
} from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  COMMON_WORDS,
  MAX_LENGTH,
  TOP_PASSWORDS,
  adviceFor,
  estimate,
  guessTime,
  type AdviceCode,
  type Match,
  type MatchKind,
} from './logic';

const BAND_COLOUR = ['var(--accent)', 'var(--accent)', 'var(--fg-muted)', 'var(--data-teal)', 'var(--data-teal)'];

function bandLabel(score: number, l: Loc): string {
  return [
    t(l, '立刻被猜到', 'guessed instantly'),
    t(l, '很弱', 'very weak'),
    t(l, '勉強', 'okay'),
    t(l, '夠強', 'strong'),
    t(l, '很強', 'very strong'),
  ][score];
}

function kindLabel(kind: MatchKind, l: Loc): string {
  return {
    dictionary: t(l, '字典字', 'dictionary word'),
    reversed: t(l, '反寫的字', 'word, reversed'),
    leet: t(l, '替換字母', 'letter substitution'),
    sequence: t(l, '連續序列', 'sequence'),
    repeat: t(l, '重複', 'repeat'),
    keyboard: t(l, '鍵盤相鄰', 'keyboard run'),
    date: t(l, '日期', 'date'),
    bruteforce: t(l, '沒有樣式', 'no pattern'),
  }[kind];
}

function explain(match: Match, l: Loc): string {
  if (match.kind === 'dictionary' || match.kind === 'reversed' || match.kind === 'leet') {
    const source =
      match.detail.source === 'passwords'
        ? t(l, '常見密碼表', 'common-password list')
        : t(l, '常見英文字表', 'common-word list');
    return t(
      l,
      `「${match.detail.word}」在${source}第 ${count(match.detail.rank ?? 0)} 筆`,
      `“${match.detail.word}” at position ${count(match.detail.rank ?? 0)} of the ${source}`
    );
  }
  if (match.kind === 'keyboard') {
    return t(
      l,
      `${match.detail.base === 'keypad' ? '數字鍵區' : '鍵盤'}相鄰按鍵,轉向 ${match.detail.turns ?? 0} 次`,
      `adjacent keys on the ${match.detail.base}, ${match.detail.turns ?? 0} direction change(s)`
    );
  }
  if (match.kind === 'repeat') {
    return t(
      l,
      `「${match.detail.base}」重複 ${match.detail.repeats} 次`,
      `“${match.detail.base}” repeated ${match.detail.repeats} times`
    );
  }
  if (match.kind === 'date') {
    return t(l, `看起來是 ${match.detail.year} 年的日期`, `reads as a date in ${match.detail.year}`);
  }
  if (match.kind === 'sequence') {
    return t(l, '字元表上的連續位置', 'consecutive positions in the alphabet');
  }
  return t(l, '只能逐字暴力猜', 'nothing better than brute force');
}

function adviceText(code: AdviceCode, l: Loc): string {
  return {
    empty: t(l, '輸入一組密碼,判斷完全在這個分頁裡做。', 'Type a password. Everything is judged in this tab.'),
    'too-short': t(
      l,
      '長度不足 12 個字元。長度是唯一能線性換到強度的東西。',
      'Under twelve characters. Length is the only thing that buys strength linearly.'
    ),
    'top-password': t(
      l,
      '這組(或去掉替換後的樣子)出現在最常見密碼的前段。這種密碼在任何字典攻擊的第一秒就會被試到。',
      'This, or its un-substituted form, is near the top of the most-guessed list. A dictionary attack reaches it in the first second.'
    ),
    'dictionary-word': t(
      l,
      '裡面有常見字。字典字本身不是問題,問題是只有一個字。',
      'It contains a common word. A word is not the problem; only having one is.'
    ),
    'reversed-word': t(l, '反著拼不算變化,破解工具兩邊都試。', 'Spelling it backwards is not a change — crackers try both directions.'),
    'leet-substitution': t(
      l,
      'a→@、o→0 這類替換是每套破解規則的第一條,大約只多兩到三個 bit。',
      'a→@ and o→0 are the first rule in every cracking rule set — worth about two or three bits.'
    ),
    'keyboard-run': t(l, '鍵盤上相鄰的按鍵是一種樣式,不是隨機。', 'Adjacent keys on the keyboard are a pattern, not randomness.'),
    sequence: t(l, '連續的字母或數字幾乎不增加強度。', 'Runs of consecutive letters or digits add almost nothing.'),
    repeat: t(l, '重複同一段只讓密碼變長,沒有變難猜。', 'Repeating a chunk makes the password longer, not harder.'),
    date: t(
      l,
      '日期(尤其是生日與最近幾年)的空間非常小,大約 15 bit 以下。',
      'Dates — birthdays and recent years especially — are a tiny space, under about 15 bits.'
    ),
    'single-piece': t(l, '整串只由一個已知樣式組成。', 'The whole thing is one known pattern.'),
    'add-length': t(
      l,
      '沒有抓到明顯樣式,但空間還是不夠大。再加幾個字元,或改用四到六個字的密語。',
      'No obvious pattern, but the space is still small. Add characters, or switch to a four-to-six word passphrase.'
    ),
    'looks-random': t(
      l,
      '找不到任何已知樣式,看起來是隨機產生的。這一頁對這種密碼只能給下限——真正的熵請看產生它的工具。',
      'No known pattern found; this looks generated. For such a password this page can only give a lower bound — the generator knows the real entropy.'
    ),
    'list-is-small': t(
      l,
      '提醒:本頁的字表只有幾千筆,真實的破解字典有數億筆。分數高只代表「沒找到已知樣式」,不等於安全。',
      'A caveat: the lists here hold a few thousand entries where a real cracking dictionary holds hundreds of millions. A high score means no known pattern was found — not that the password is safe.'
    ),
  }[code];
}

/**
 * Sensitive tool. The password is never stored, never put in the URL, and
 * never leaves the page — which is the only reason it is acceptable to type a
 * real password into a strength checker at all.
 */
export default function PasswordStrength({ l }: ToolProps) {
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);

  // Roughly O(n³) in the length, so the ceiling matters: 128 characters takes
  // about 4 ms, which is fine per keystroke; 1000 would not be.
  const result = useMemo(() => estimate(password), [password]);
  const advice = useMemo(() => adviceFor(password, result), [password, result]);

  return (
    <div>
      <Bench
        leftLabel={t(l, '密碼', 'PASSWORD')}
        rightLabel={t(l, '判定', 'ASSESSMENT')}
        leftAside={<span className="inst-no">{t(l, '不儲存、不外送', 'not stored, not sent')}</span>}
        rightAside={
          password ? (
            <span className="inst-no" style={{ color: BAND_COLOUR[result.score] }}>
              {fixed(result.bits, 1)} bits · {bandLabel(result.score, l)}
            </span>
          ) : null
        }
        left={
          <>
            <Input
              label={t(l, '要檢查的密碼', 'The password to check')}
              hint={t(
                l,
                '就算這一頁不連線,把正在用的密碼貼進任何網頁都是壞習慣。要驗證概念的話,打一組跟它同結構的假密碼就夠了。',
                'Even though this page makes no connections, typing a password you actually use into any web page is a bad habit. To test the idea, type one with the same shape instead.'
              )}
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <Row>
              <Check2 label={t(l, '顯示', 'show')} checked={reveal} onChange={setReveal} />
              {password ? <Btn onClick={() => setPassword('')}>{t(l, '清空', 'clear')}</Btn> : null}
            </Row>

            {result.truncated ? (
              <Note>
                {t(
                  l,
                  `只分析前 ${MAX_LENGTH} 個字元。比這更長的密碼,長度本身已經是答案。`,
                  `Only the first ${MAX_LENGTH} characters are analysed. Past that, the length is the answer.`
                )}
              </Note>
            ) : null}

            {password ? (
              <div className="inst-field">
                <span className="inst-label">{t(l, '拆解', 'Decomposition')}</span>
                <p className="inst-hint">
                  {t(
                    l,
                    '這是猜測程式最省力的一條路。每一段的 bit 加起來,再加上「要猜對怎麼拆」的成本,就是上面那個數字。',
                    'This is the cheapest route a guesser has. The pieces’ bits, plus the cost of guessing the split itself, make the figure above.'
                  )}
                </p>
                <Table
                  head={[t(l, '片段', 'piece'), t(l, '型態', 'kind'), t(l, '為什麼便宜', 'why it is cheap'), 'bits']}
                  align={['left', 'left', 'left', 'right']}
                  rows={result.sequence.map((match, index) => [
                    <span key={`t${index}`} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                      {reveal ? match.token : '•'.repeat(match.token.length)}
                    </span>,
                    kindLabel(match.kind, l),
                    explain(match, l),
                    fixed(match.log2Guesses, 1),
                  ])}
                />
              </div>
            ) : null}
          </>
        }
        right={
          password ? (
            <>
              <div className="inst-field">
                <span className="inst-label">{t(l, '估計強度', 'Estimated strength')}</span>
                <div
                  aria-live="polite"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(1.5rem, 5vw, 2.25rem)',
                    fontVariantNumeric: 'tabular-nums',
                    color: BAND_COLOUR[result.score],
                    lineHeight: 1.2,
                  }}
                >
                  {fixed(result.bits, 1)} bits
                </div>
                <p className="inst-hint">
                  {t(
                    l,
                    `${bandLabel(result.score, l)}(0–4 分制的 ${result.score} 分)。已知樣式覆蓋了 ${Math.round(result.coverage * 100)}% 的字元。`,
                    `${bandLabel(result.score, l)} — ${result.score} on the usual 0–4 scale. Known patterns explain ${Math.round(result.coverage * 100)}% of the characters.`
                  )}
                </p>
                {/* Five segments, labelled in text above, so the reading never
                    depends on colour alone. */}
                <div style={{ display: 'flex', gap: 2 }} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((band) => (
                    <div
                      key={band}
                      style={{
                        height: 3,
                        flex: 1,
                        background: band <= result.score ? BAND_COLOUR[result.score] : 'var(--border-2)',
                      }}
                    />
                  ))}
                </div>
              </div>

              <Table
                head={[t(l, '攻擊情境', 'scenario'), t(l, '每秒猜測', 'guesses/s'), t(l, '撐多久', 'holds for')]}
                rows={[
                  [
                    t(l, '有節流的登入表單', 'a throttled login form'),
                    '1e2',
                    guessTime(result.bits, 1e2),
                  ],
                  [
                    t(l, '沒節流的線上服務', 'an online service with no throttle'),
                    '1e4',
                    guessTime(result.bits, 1e4),
                  ],
                  [
                    t(l, '外洩的慢雜湊(bcrypt)', 'a leaked slow hash (bcrypt)'),
                    '1e5',
                    guessTime(result.bits, 1e5),
                  ],
                  [
                    t(l, '外洩的快雜湊(SHA-256)', 'a leaked fast hash (SHA-256)'),
                    '1e11',
                    guessTime(result.bits, 1e11),
                  ],
                ]}
              />

              <div className="inst-field">
                <span className="inst-label">{t(l, '要改什麼', 'What to change')}</span>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {advice.map((code) => (
                    <li key={code} className="inst-hint" style={{ marginTop: '0.35rem' }}>
                      {adviceText(code, l)}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <Note>{adviceText('empty', l)}</Note>
          )
        }
      />

      <Panel label={t(l, '這個分數是怎麼算的', 'HOW THE FIGURE IS REACHED')}>
        <Table
          head={[t(l, '步驟', 'step'), t(l, '做法', 'what happens')]}
          rows={[
            [
              t(l, '找樣式', 'find patterns'),
              t(
                l,
                `比對 ${count(TOP_PASSWORDS.length)} 筆常見密碼與 ${count(COMMON_WORDS.length)} 筆常見英文字,含反寫與字母替換;再找鍵盤相鄰、連續序列、重複、日期。`,
                `Checks ${count(TOP_PASSWORDS.length)} common passwords and ${count(COMMON_WORDS.length)} common words, including reversed and substituted spellings, then looks for keyboard runs, sequences, repeats and dates.`
              ),
            ],
            [
              t(l, '算每段成本', 'price each piece'),
              t(
                l,
                '字典字的成本是它在表上的位置乘以大小寫與替換的變化數;沒有樣式的片段按實際用到的字元類別逐字暴力計算。',
                'A dictionary hit costs its position in the list times the capitalisation and substitution variants. An unmatched run is priced by brute force over the classes it actually uses.'
              ),
            ],
            [
              t(l, '挑最便宜的拆法', 'take the cheapest split'),
              t(
                l,
                '動態規劃找出總成本最低的拆解方式,並加上「拆成幾段」本身的成本(每多一段 ×10⁴,再乘上段數階乘)。',
                'Dynamic programming finds the lowest-cost decomposition, plus the cost of the split itself: ×10⁴ per extra piece and the factorial of the piece count.'
              ),
            ],
            [
              t(l, '換成時間', 'turn it into time'),
              t(
                l,
                '假設攻擊者猜到一半就中,再除以上表的每秒猜測數。全程用 log2 計算,所以 2³⁰⁰ 也印得出數字。',
                'Assumes the attacker succeeds halfway through, divided by the rates above. All of it in log2, so 2³⁰⁰ still prints a number.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            '做法沿用 zxcvbn 的思路,但字表小得多,而且沒有樣式的片段是按實際字元類別算(zxcvbn 一律用每字元 10 種,對真正隨機的密碼會低估很多)。這裡的數字對「有樣式」的密碼相當準,對「真隨機」的密碼是下限。',
            'The approach follows zxcvbn’s, with much smaller lists and one deliberate difference: an unmatched run is priced by the character classes present, where zxcvbn assumes ten per character and so understates genuinely random passwords. The figure here is reliable for passwords with patterns and a lower bound for random ones.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '長度', 'length'), v: password ? count(Math.min(password.length, MAX_LENGTH)) : '—' },
          { k: t(l, '熵估計', 'entropy'), v: password ? `${fixed(result.bits, 1)} bits` : '—' },
          { k: t(l, '分數', 'score'), v: password ? `${result.score} / 4` : '—' },
          { k: t(l, '片段', 'pieces'), v: password ? count(result.sequence.length) : '—' },
          { k: t(l, '字表', 'lists'), v: count(TOP_PASSWORDS.length + COMMON_WORDS.length) },
        ]}
      />
    </div>
  );
}
