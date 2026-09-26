'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  CONSTANTS,
  CalcError,
  FUNCTIONS,
  MAX_EXACT_FACTORIAL,
  MAX_EXPRESSION,
  formatResult,
  hidesFraction,
  integerViews,
  run,
  type AngleMode,
  type RunResult,
} from './logic';

const SAMPLE = [
  'a = 3',
  'b = 4',
  'sqrt(a^2 + b^2)     # 斜邊',
  'ans * 2',
  '1920 * 9 / 16',
  '49! / (6! * 43!)    # 49 取 6',
  'round(1.005, 2)     # 四捨五入到分',
].join('\n');

const EMPTY: RunResult = { lines: [], env: {}, value: Number.NaN };

/**
 * `≈` in front of a result that is not the whole number it prints as. Fifteen
 * significant digits round 253.00000000000006 to "253", and a combination built
 * out of factorials above 22! lands on values exactly like that one.
 */
const shown = (value: number) => `${hidesFraction(value) ? '≈ ' : ''}${formatResult(value)}`;

export default function Calculator({ l }: ToolProps) {
  const [source, setSource] = useState(SAMPLE);
  const [angle, setAngle] = useState<AngleMode>('rad');

  const outcome = useMemo((): { result: RunResult; fatal: string | null } => {
    try {
      return { result: run(source, angle), fatal: null };
    } catch (problem) {
      return {
        result: EMPTY,
        fatal: problem instanceof CalcError ? problem.message : String(problem),
      };
    }
  }, [source, angle]);

  const { lines, env } = outcome.result;
  const variables = Object.entries(env).filter(([name]) => name !== 'ans');
  const lastGood = [...lines].reverse().find((line) => !line.error);
  const views = lastGood ? integerViews(lastGood.value) : null;
  const failures = lines.filter((line) => line.error).length;

  const approximate = lines.some((line) => !line.error && hidesFraction(line.value));

  const transcript = lines
    .map((line) => `${line.source} = ${line.error ? line.error.message : shown(line.value)}`)
    .join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '算式', 'EXPRESSIONS')}
        rightLabel={t(l, '結果', 'RESULTS')}
        leftAside={
          <span className="inst-no">
            {count(source.length)} / {count(MAX_EXPRESSION)}
          </span>
        }
        rightAside={
          failures > 0 ? (
            <span className="inst-no" style={{ color: 'var(--accent)' }}>
              {count(failures)} {t(l, '行有錯', 'lines failed')}
            </span>
          ) : (
            <span className="inst-no">{count(lines.length)} {t(l, '行', 'lines')}</span>
          )
        }
        left={
          <>
            <Area
              label={t(l, '一行一個算式', 'One expression per line')}
              value={source}
              onChange={setSource}
              rows={14}
              hint={t(
                l,
                'ans 是上一行的結果。用 x = 3 存變數。# 之後是註解。',
                '`ans` is the previous line. `x = 3` stores a variable. `#` starts a comment.'
              )}
            />
            <Row>
              <Seg
                label={t(l, '角度單位', 'Angle unit')}
                value={angle}
                onChange={setAngle}
                options={[
                  { value: 'rad', label: t(l, '弧度', 'rad') },
                  { value: 'deg', label: t(l, '角度', 'deg') },
                ]}
              />
              <CopyButton
                l={l}
                text={lastGood ? formatResult(lastGood.value, false) : ''}
                label={t(l, '複製結果', 'copy result')}
              />
              <CopyButton l={l} text={transcript} label={t(l, '複製全部', 'copy sheet')} />
              <ResetButton l={l} onReset={() => setSource('')} />
            </Row>
            {outcome.fatal ? <Note error>{outcome.fatal}</Note> : null}
            <Note>
              {t(
                l,
                '這裡沒有用 eval。算式由自己寫的詞法分析與優先權爬升剖析器處理,所以它只能算出數字,做不了別的事。',
                'No eval here. A hand-written tokeniser and precedence-climbing parser means the only thing an expression can produce is a number.'
              )}
            </Note>
          </>
        }
        right={
          <>
            {lines.length === 0 ? (
              <Note>{t(l, '左邊打一行算式。', 'Type an expression on the left.')}</Note>
            ) : (
              <div aria-live="polite">
                <Table
                  head={['', t(l, '算式', 'expression'), t(l, '結果', 'value')]}
                  align={['right', 'left', 'right']}
                  rows={lines.map((line, index) => [
                    <span key="n" className="inst-no">
                      {index + 1}
                    </span>,
                    <span key="s" className="inst-wrap inst-no">
                      {line.source}
                    </span>,
                    line.error ? (
                      <span key="v" className="inst-wrap" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>
                        {line.error.message}
                        {line.error.pos >= 0 ? ` (${t(l, '第', 'char ')}${line.error.pos + 1}${t(l, ' 字', '')})` : ''}
                      </span>
                    ) : (
                      <span key="v" className="inst-no" style={{ color: 'var(--fg)', fontSize: '0.9375rem' }}>
                        {line.assigned ? `${line.assigned} = ` : ''}
                        {shown(line.value)}
                      </span>
                    ),
                  ])}
                />
              </div>
            )}

            {approximate ? (
              <Note>
                {t(
                  l,
                  `標 ≈ 的結果不是它印出來的那個整數,只是在十五位有效數字下看起來像。最常見的來源是階乘:${MAX_EXACT_FACTORIAL}! 以內是精確值,再往上就只是最接近的雙精度數,拿去相除得到的組合數會差在小數第十幾位。`,
                  `A result marked ≈ is not the whole number it prints as; fifteen significant digits just make it look like one. Factorials are exact up to ${MAX_EXACT_FACTORIAL}! and are the nearest double above that, so combinations divided out of them land a few parts in 10^15 off.`
                )}
              </Note>
            ) : null}

            {views ? (
              <Note>
                {t(l, '最後的整數結果:', 'Last integer result: ')}
                {views.hex} · {views.oct} · {views.bin}
              </Note>
            ) : null}

            {variables.length > 0 ? (
              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '變數', 'VARIABLES')}</span>
                  <span className="inst-no">{count(variables.length)}</span>
                </div>
                <Table
                  head={[t(l, '名稱', 'name'), t(l, '值', 'value')]}
                  align={['left', 'right']}
                  rows={variables.map(([name, value]) => [
                    <span key="n" className="inst-no" style={{ color: 'var(--fg)' }}>
                      {name}
                    </span>,
                    <span key="v" className="inst-no">
                      {shown(value)}
                    </span>,
                  ])}
                />
              </div>
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '看得懂什麼', 'WHAT IT UNDERSTANDS')}
          aside={
            <span className="inst-no">
              {count(Object.keys(FUNCTIONS).length)} {t(l, '個函式', 'functions')}
            </span>
          }
        >
          <Table
            head={[t(l, '寫法', 'syntax'), t(l, '意思', 'meaning')]}
            rows={[
              ['+ - * / %', t(l, '加減乘除與餘數。% 的正負號跟被除數一樣,要跟除數同號請用 mod()。', 'Arithmetic and remainder. `%` keeps the dividend’s sign; use mod() for the divisor’s.')],
              ['^ 或 **', t(l, '次方,右結合。2^3^2 是 512。', 'Power, right-associative. 2^3^2 is 512.')],
              ['-2^2', t(l, '等於 -4:次方比負號先算。要 4 請寫 (-2)^2。', 'Is −4: the power binds tighter than the sign. Write (−2)^2 for 4.')],
              ['5!', t(l, `階乘,上限 170!;${MAX_EXACT_FACTORIAL}! 以內是精確值,更大的只是最接近的雙精度數。`, `Factorial, up to 170!. Exact through ${MAX_EXACT_FACTORIAL}!, the nearest double above that.`)],
              ['2pi、3(4+5)', t(l, '省略的乘號會補上,但只在數字後面接名稱或括號時。', 'Implicit multiplication, only after a value and before a name or a bracket.')],
              ['x = 3', t(l, '存成變數,下面幾行都能用。', 'Stores a variable for the lines below.')],
              ['ans', t(l, '上一行的結果。', 'The previous line’s result.')],
              ['0xff、0b1011、1_000', t(l, '十六進位、二進位、可讀的千分位。', 'Hex, binary, and readable digit separators.')],
              ['# 註解', t(l, '到行尾都不算。', 'Ignored to the end of the line.')],
            ]}
          />
        </Panel>
      </div>

      <div className="mt-8">
        <Panel label={t(l, '函式與常數', 'FUNCTIONS AND CONSTANTS')}>
          <Table
            head={[t(l, '名稱', 'name'), t(l, '參數', 'args'), t(l, '說明', 'what it does')]}
            align={['left', 'right', 'left']}
            rows={[
              ...Object.entries(FUNCTIONS).map(([name, def]) => [
                <span key="n" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {name}
                </span>,
                <span key="a" className="inst-no">
                  {def.arity === -1 ? t(l, '多個', 'any') : def.arity}
                </span>,
                <span key="d" style={{ fontSize: '0.8125rem' }}>
                  {l === 'en' ? def.en : def.zh}
                </span>,
              ]),
              ...Object.entries(CONSTANTS).map(([name, value]) => [
                <span key="n" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {name}
                </span>,
                <span key="a" className="inst-no">
                  —
                </span>,
                <span key="d" className="inst-no" style={{ fontSize: '0.8125rem' }}>
                  {formatResult(value)}
                </span>,
              ]),
            ]}
          />
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '行數', 'lines'), v: count(lines.length) },
          { k: t(l, '出錯', 'failed'), v: count(failures) },
          { k: t(l, '變數', 'variables'), v: count(variables.length) },
          { k: t(l, '角度', 'angle'), v: angle === 'deg' ? t(l, '度', 'degrees') : t(l, '弧度', 'radians') },
          { k: t(l, '剖析', 'parser'), v: t(l, '自寫,無 eval', 'hand-written, no eval') },
        ]}
      />
    </div>
  );
}
