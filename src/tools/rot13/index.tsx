'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  atbash,
  breakCaesar,
  letterTotal,
  rot,
  rot13,
  rot18,
  rot47,
  scoreEnglish,
} from './logic';

type Scheme = 'rot13' | 'caesar' | 'atbash' | 'rot47' | 'rot18';

/** Below this many letters the frequency ranking is a coin toss, and says so. */
const RANKING_FLOOR = 20;

export default function Rot13({ l }: ToolProps) {
  const [scheme, setScheme] = useState<Scheme>('rot13');
  const [shift, setShift] = useState(3);
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);

  const output = useMemo(() => {
    switch (scheme) {
      case 'rot13':
        return rot13(text);
      case 'rot18':
        return rot18(text);
      case 'rot47':
        return rot47(text);
      case 'atbash':
        return atbash(text);
      case 'caesar':
      default:
        return rot(text, shift);
    }
  }, [scheme, shift, text]);

  const candidates = useMemo(() => (showAll ? breakCaesar(text) : []), [showAll, text]);
  const letters = useMemo(() => letterTotal(text), [text]);
  const score = useMemo(() => scoreEnglish(text), [text]);

  /** Self-inverse schemes are the ones with no separate "decode" direction. */
  const selfInverse = scheme !== 'caesar' || shift === 13;

  return (
    <div>
      <Note error>
        {t(
          l,
          '這是遮擋,不是加密。金鑰只有 25 種可能,下面的「全部位移」按鈕會在一瞬間把它們全部試完並排名。要真的保護內容請用 E07 的 AES-GCM。',
          'This obscures text; it does not encrypt it. There are 25 possible keys, and the button below tries all of them and ranks the results instantly. For actual protection use the AES-GCM tool (E07).'
        )}
      </Note>

      <Row>
        <Seg
          label={t(l, '方式', 'Scheme')}
          value={scheme}
          onChange={setScheme}
          options={[
            { value: 'rot13', label: 'ROT13' },
            { value: 'caesar', label: t(l, '任意位移', 'Caesar') },
            { value: 'atbash', label: 'Atbash' },
            { value: 'rot47', label: 'ROT47' },
            { value: 'rot18', label: 'ROT18' },
          ]}
        />
        <Btn onClick={() => setText('The quick brown fox jumps over the lazy dog.')}>
          {t(l, '放入範例', 'load sample')}
        </Btn>
        <Btn onClick={() => setText(output)} disabled={output === ''}>
          {t(l, '把結果放回左邊', 'feed result back')}
        </Btn>
        <ResetButton l={l} onReset={() => setText('')} />
      </Row>

      {scheme === 'caesar' ? (
        <div className="inst-field" style={{ maxWidth: '22rem' }}>
          <label className="inst-label" htmlFor="caesar-shift">
            {t(l, `位移 ${shift > 0 ? `+${shift}` : shift}`, `Shift ${shift > 0 ? `+${shift}` : shift}`)}
          </label>
          <input
            id="caesar-shift"
            type="range"
            min={-25}
            max={25}
            value={shift}
            onChange={(event) => setShift(Number(event.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <p className="inst-hint">
            {shift === 13
              ? t(l, '位移 13 就是 ROT13,自己就是反運算。', 'Shift 13 is ROT13, which is its own inverse.')
              : t(
                  l,
                  `解回原文要用位移 ${-shift > 0 ? `+${-shift}` : -shift}。`,
                  `To reverse it, use shift ${-shift > 0 ? `+${-shift}` : -shift}.`
                )}
          </p>
        </div>
      ) : null}

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{count(utf8Length(text))} B</span>}
        rightAside={
          <span className="inst-no">
            {selfInverse ? t(l, '自反', 'self-inverse') : t(l, '需反向位移', 'needs reversing')}
          </span>
        }
        left={
          <Area
            label={t(l, '貼上文字', 'Paste text')}
            value={text}
            onChange={setText}
            rows={10}
            placeholder="The quick brown fox jumps over the lazy dog."
          />
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '12rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              aria-live="polite"
            >
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
            <Note>
              {scheme === 'rot47'
                ? t(
                    l,
                    'ROT47 在 ! 到 ~ 這 94 個可列印 ASCII 字元上位移 47,所以數字與標點也會變。空白與換行不在範圍內,原樣保留。',
                    'ROT47 shifts by 47 across the 94 printable ASCII characters from ! to ~, so digits and punctuation change too. Space and newline are outside the range and stay put.'
                  )
                : scheme === 'atbash'
                  ? t(
                      l,
                      'Atbash 把 A 換成 Z、B 換成 Y,是一個鏡射,所以連金鑰都沒有,沒東西可以猜。它比凱薩更古老,也更沒有祕密。',
                      'Atbash mirrors the alphabet: A becomes Z, B becomes Y. It has no key at all, so there is nothing to guess.'
                    )
                  : t(
                      l,
                      '只有 A–Z 與 a–z 會位移。中文、emoji、重音字母原樣保留——把 é 位移 13 會得到 ò,那不是任何凱薩密碼的意思。',
                      'Only A–Z and a–z shift. Chinese, emoji and accented letters are left alone: shifting é by 13 gives ò, which no Caesar cipher has ever meant.'
                    )}
            </Note>
          </>
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '全部 26 種位移', 'ALL 26 SHIFTS')}
          aside={
            letters > 0 ? (
              <span className="inst-no">
                {count(letters)} {t(l, '個字母', 'letters')}
              </span>
            ) : null
          }
        >
          <Row>
            <Btn onClick={() => setShowAll(!showAll)} primary={!showAll} disabled={text === ''}>
              {showAll ? t(l, '收起', 'hide') : t(l, '試完全部位移並排名', 'try every shift and rank them')}
            </Btn>
          </Row>

          {!showAll ? (
            <Note>
              {t(
                l,
                '按下去會把 26 種位移全部算出來,用英文字母頻率的卡方距離排序。這不是功能,是證明:金鑰空間小到窮舉沒有成本。',
                'That button computes all 26 shifts and ranks them by chi-square distance from English letter frequencies. It is not a feature so much as a demonstration: the key space is small enough that brute force costs nothing.'
              )}
            </Note>
          ) : letters < RANKING_FLOOR ? (
            <>
              <Note error>
                {t(
                  l,
                  `只有 ${count(letters)} 個拉丁字母,頻率分析在這個長度下等於猜。下面的排名不要當真。`,
                  `Only ${count(letters)} Latin letters. Frequency analysis at this length is guessing — do not trust the ranking below.`
                )}
              </Note>
              <Table
                head={[t(l, '位移', 'shift'), t(l, '結果', 'result')]}
                rows={candidates.map((entry) => [
                  <span key={`s${entry.shift}`} className="inst-no">
                    +{entry.shift}
                  </span>,
                  <span key={`t${entry.shift}`} className="inst-wrap">
                    {entry.text.slice(0, 120)}
                  </span>,
                ])}
              />
            </>
          ) : (
            <>
              <Table
                head={[t(l, '位移', 'shift'), t(l, '英文相似度', 'English score'), t(l, '結果', 'result')]}
                rows={candidates.map((entry, index) => [
                  <span
                    key={`s${entry.shift}`}
                    className="inst-no"
                    style={index === 0 ? { color: 'var(--accent)' } : undefined}
                  >
                    +{entry.shift}
                    {index === 0 ? ` ${t(l, '最像', 'best')}` : ''}
                  </span>,
                  <span key={`c${entry.shift}`} className="inst-no">
                    {Number.isFinite(entry.score) ? entry.score.toFixed(0) : '—'}
                  </span>,
                  <span
                    key={`t${entry.shift}`}
                    className="inst-wrap"
                    style={index === 0 ? { color: 'var(--accent)' } : undefined}
                  >
                    {entry.text.slice(0, 120)}
                    {entry.text.length > 120 ? '…' : ''}
                  </span>,
                ])}
                align={['left', 'right', 'left']}
              />
              <Note>
                {t(
                  l,
                  '卡方距離越小越像英文。這個排名對長一點的英文幾乎不會錯,對中文、對短字串、對本來就不是英文的內容完全沒有意義——所以 26 種全部列出來,不只給你一個答案。',
                  'A lower chi-square is more English-like. The ranking is almost always right on more than a sentence of English, and means nothing for Chinese, short strings, or text that was never English — which is why all 26 are listed rather than one answer.'
                )}
              </Note>
            </>
          )}
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '字元', 'chars'), v: count(text.length) },
          { k: t(l, '拉丁字母', 'Latin letters'), v: count(letters) },
          { k: t(l, '英文相似度', 'English score'), v: Number.isFinite(score) ? score.toFixed(0) : '—' },
          { k: t(l, '金鑰空間', 'key space'), v: scheme === 'atbash' ? t(l, '無金鑰', 'no key') : scheme === 'rot47' ? '94' : '26' },
          { k: t(l, '自反', 'self-inverse'), v: selfInverse ? t(l, '是', 'yes') : t(l, '否', 'no') },
        ]}
      />
    </div>
  );
}
