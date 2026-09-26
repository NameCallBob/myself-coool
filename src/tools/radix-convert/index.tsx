'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_BASE,
  MAX_FRAC_DIGITS,
  MAX_INPUT,
  MIN_BASE,
  RadixError,
  bitLength,
  defaultGroupSize,
  fractionTerminates,
  groupDigits,
  parseRadix,
  renderRadix,
  type Parsed,
} from './logic';

const BASES = Array.from({ length: MAX_BASE - MIN_BASE + 1 }, (_, i) => MIN_BASE + i);
const COMMON = [2, 8, 10, 16, 36];

export default function RadixConvert({ l }: ToolProps) {
  const [text, setText] = useState('255');
  const [from, setFrom] = useState(10);
  const [to, setTo] = useState(16);
  const [group, setGroup] = useState(true);
  const [fracDigits, setFracDigits] = useState(24);

  const parsed = useMemo((): { value: Parsed | null; error: RadixError | null } => {
    if (text.trim() === '') return { value: null, error: null };
    try {
      return { value: parseRadix(text, from), error: null };
    } catch (problem) {
      return { value: null, error: problem instanceof RadixError ? problem : new RadixError(String(problem), -1) };
    }
  }, [text, from]);

  const rendered = useMemo(
    () => (parsed.value ? renderRadix(parsed.value, to, fracDigits) : null),
    [parsed.value, to, fracDigits]
  );

  const shown = rendered
    ? group
      ? groupDigits(rendered.text, defaultGroupSize(to), to === 10 ? ',' : ' ')
      : rendered.text
    : '';

  // The familiar bases plus whichever one is selected, so the table always
  // contains the answer the reader is looking at above it.
  const tableBases = COMMON.includes(to) ? COMMON : [...COMMON, to].sort((a, b) => a - b);

  const baseOptions = BASES.map((base) => ({
    value: String(base),
    label:
      base === 2
        ? t(l, '2 二進位', '2 binary')
        : base === 8
          ? t(l, '8 八進位', '8 octal')
          : base === 10
            ? t(l, '10 十進位', '10 decimal')
            : base === 16
              ? t(l, '16 十六進位', '16 hex')
              : String(base),
  }));

  const terminates = parsed.value ? fractionTerminates(parsed.value, to) : true;
  const bits = parsed.value ? bitLength(parsed.value.int) : 0;

  const errorText = (error: RadixError) => {
    if (error.index >= 0 && error.index < text.length) {
      return t(
        l,
        `${error.message}(第 ${error.index + 1} 個字元)`,
        `${error.message} (character ${error.index + 1})`
      );
    }
    return error.message;
  };

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={
          <span className="inst-no">
            {count(text.length)} / {count(MAX_INPUT)}
          </span>
        }
        rightAside={
          rendered ? (
            <span className="inst-no" style={rendered.truncated ? { color: 'var(--accent)' } : undefined}>
              {rendered.truncated
                ? t(l, '小數被截斷', 'fraction truncated')
                : t(l, '精確', 'exact')}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '數字', 'Number')}
              value={text}
              onChange={setText}
              rows={5}
              invalid={parsed.error !== null}
              placeholder="dead_beef"
              hint={t(
                l,
                '空白、底線與 0x / 0b / 0o 前綴會忽略。可以寫小數點。',
                'Spaces, underscores and 0x / 0b / 0o prefixes are ignored. A radix point is allowed.'
              )}
            />
            <Row>
              <Select
                label={t(l, '來源進位', 'From base')}
                value={String(from)}
                options={baseOptions}
                onChange={(next) => setFrom(Number(next))}
              />
              <Select
                label={t(l, '目標進位', 'To base')}
                value={String(to)}
                options={baseOptions}
                onChange={(next) => setTo(Number(next))}
              />
            </Row>
            <Row>
              <button
                type="button"
                className="inst-btn"
                onClick={() => {
                  if (rendered) setText(rendered.text);
                  setFrom(to);
                  setTo(from);
                }}
              >
                {t(l, '把結果搬到輸入', 'move result to input')}
              </button>
              <Check2
                label={t(l, '分組顯示', 'group digits')}
                checked={group}
                onChange={setGroup}
              />
            </Row>
            <FracLimit
              l={l}
              value={fracDigits}
              onChange={setFracDigits}
            />
            {parsed.error ? <Note error>{errorText(parsed.error)}</Note> : null}
          </>
        }
        right={
          <>
            <div className="inst-out" aria-live="polite" style={{ minHeight: '5rem' }}>
              {shown || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊填一個數字。', 'Enter a number on the left.')}
                </span>
              )}
            </div>
            <Row>
              <CopyButton l={l} text={rendered?.text ?? ''} />
              {group && rendered ? (
                <CopyButton l={l} text={shown} label={t(l, '複製(含分組)', 'copy grouped')} />
              ) : null}
            </Row>
            {rendered?.truncated ? (
              <Note>
                {terminates
                  ? t(
                      l,
                      `這個小數在 ${to} 進位下會結束,但比目前的 ${fracDigits} 位上限長。把上限拉高就會看到完整的值。`,
                      `This fraction does terminate in base ${to}, but it is longer than the current ${fracDigits}-digit limit. Raise the limit to see all of it.`
                    )
                  : t(
                      l,
                      `這個小數在 ${to} 進位下是循環的,寫不完。顯示的位數是截斷,不是四捨五入。`,
                      `This fraction repeats forever in base ${to}. What you see is truncated, not rounded.`
                    )}
              </Note>
            ) : null}
            {parsed.value && parsed.value.int !== 0n ? (
              <Note>
                {t(
                  l,
                  `整數部分需要 ${bits} 個位元,${Math.ceil(bits / 8)} 個位元組。`,
                  `The integer part needs ${bits} bits, ${Math.ceil(bits / 8)} bytes.`
                )}
              </Note>
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <Panel label={t(l, '常用進位一覽', 'THE USUAL BASES')}>
          {parsed.value ? (
            <Table
              head={[t(l, '進位', 'base'), t(l, '寫法', 'written'), t(l, '位數', 'digits')]}
              align={['left', 'left', 'right']}
              rows={tableBases.map((base) => {
                const row = renderRadix(parsed.value as Parsed, base, fracDigits);
                const display = group
                  ? groupDigits(row.text, defaultGroupSize(base), base === 10 ? ',' : ' ')
                  : row.text;
                return [
                  <span key="b" className="inst-no" style={base === to ? { color: 'var(--accent)' } : undefined}>
                    {base}
                  </span>,
                  <span key="v" className="inst-wrap inst-no" style={{ color: 'var(--fg)' }}>
                    {display}
                    {row.truncated ? <span style={{ color: 'var(--fg-faint)' }}>…</span> : null}
                  </span>,
                  <span key="d" className="inst-no">
                    {count(row.text.replace(/[-.]/g, '').length)}
                  </span>,
                ];
              })}
            />
          ) : (
            <Note>{t(l, '輸入一個數字就會列出來。', 'Enter a number to fill this table.')}</Note>
          )}
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '來源', 'from'), v: `base ${from}` },
          { k: t(l, '目標', 'to'), v: `base ${to}` },
          { k: t(l, '整數位元', 'int bits'), v: count(bits) },
          {
            k: t(l, '小數', 'fraction'),
            v: !parsed.value
              ? '—'
              : parsed.value.frac === 0n
                ? t(l, '無', 'none')
                : terminates
                  ? t(l, '會結束', 'terminates')
                  : t(l, '循環', 'repeats'),
          },
          { k: t(l, '算法', 'arithmetic'), v: 'BigInt' },
        ]}
      />
    </div>
  );
}

/**
 * The fraction-digit budget. A plain number field rather than a slider: the
 * value is typed far more often than it is swept, and it has a hard ceiling
 * that a slider would hide.
 */
function FracLimit({
  l,
  value,
  onChange,
}: {
  l: 'zh' | 'en';
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inst-field">
      <label className="inst-label" htmlFor="radix-frac">
        {t(l, '小數位數上限', 'Fraction digit limit')}
      </label>
      <input
        id="radix-frac"
        className="inst-input"
        type="number"
        min={0}
        max={MAX_FRAC_DIGITS}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.max(0, Math.min(MAX_FRAC_DIGITS, Math.trunc(next))));
        }}
      />
      <p className="inst-hint">
        {t(
          l,
          `循環小數寫不完,所以要有上限。最多 ${MAX_FRAC_DIGITS} 位。`,
          `A repeating fraction never ends, so there is a limit. At most ${MAX_FRAC_DIGITS} digits.`
        )}
      </p>
    </div>
  );
}
