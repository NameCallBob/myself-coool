'use client';

import { useMemo, useState } from 'react';
import {
  Bench,
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
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  LAYOUT,
  OPS,
  SYMBOL,
  WIDTHS,
  applyOp,
  bitList,
  decimalDigits,
  highestBit,
  isShift,
  notOf,
  parseFloat754,
  parseInteger,
  popcount,
  roundTrips,
  signedOf,
  toBinary,
  toBytes,
  toRadix,
  trailingZeros,
  ulpOf,
  type FloatKind,
  type Op,
  type Width,
} from './logic';

const OP_LABEL: Record<Op, [string, string]> = {
  and: ['AND', 'AND'],
  or: ['OR', 'OR'],
  xor: ['XOR', 'XOR'],
  nand: ['NAND', 'NAND'],
  nor: ['NOR', 'NOR'],
  xnor: ['XNOR', 'XNOR'],
  andnot: ['AND NOT', 'AND NOT'],
  shl: ['左移', 'shift left'],
  shr: ['右移(邏輯)', 'shift right (logical)'],
  sar: ['右移(算術)', 'shift right (arith)'],
  rotl: ['左旋', 'rotate left'],
  rotr: ['右旋', 'rotate right'],
};

const CLASS_LABEL: Record<string, [string, string]> = {
  zero: ['零', 'zero'],
  subnormal: ['非正規數', 'subnormal'],
  normal: ['正規數', 'normal'],
  infinity: ['無限', 'infinity'],
  nan: ['NaN', 'NaN'],
};

/** A bit grid. Index 0 is drawn on the right, as a register is written. */
function Bits({
  value,
  width,
  label,
}: {
  value: bigint;
  width: Width;
  label: string;
}) {
  const bits = bitList(value, width);
  return (
    <div className="inst-field">
      <span className="inst-label">{label}</span>
      <div className="inst-scroll">
        <div style={{ display: 'flex', gap: '2px', minWidth: 'max-content' }}>
          {bits
            .slice()
            .reverse()
            .map((on, index) => {
              const position = width - 1 - index;
              return (
                <span
                  key={position}
                  title={`bit ${position}`}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    // A nibble boundary gets a visible gap, which is the only
                    // way a 64-bit row stays countable by eye.
                    marginRight: position % 4 === 0 && position !== 0 ? '6px' : 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '1.1rem',
                      textAlign: 'center',
                      color: on ? 'var(--fg)' : 'var(--fg-faint)',
                      fontWeight: on ? 700 : 400,
                      background: on ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent',
                    }}
                  >
                    {on ? '1' : '0'}
                  </span>
                  {position % 8 === 0 ? (
                    <span aria-hidden="true" style={{ fontSize: '0.6rem', color: 'var(--fg-faint)' }}>
                      {position}
                    </span>
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>
                      &nbsp;
                    </span>
                  )}
                </span>
              );
            })}
        </div>
      </div>
      <p className="inst-hint">{toBinary(value, width, 8)}</p>
    </div>
  );
}

/**
 * Two operands, one operation, every representation of the result — and, below,
 * the same treatment for an IEEE 754 float.
 *
 * All of it runs on BigInt at an explicit width. JavaScript's own bitwise
 * operators would be the obvious shortcut and are the wrong tool: they coerce to
 * signed 32-bit first, so they cannot answer a question about a 64-bit register
 * and they mask shift counts in a way no other language does.
 */
export default function Bitwise({ l }: ToolProps) {
  const [width, setWidth] = useState<Width>(32);
  const [op, setOp] = useState<Op>('and');
  const [aText, setAText] = useState('0b1100');
  const [bText, setBText] = useState('0b1010');
  const [floatKind, setFloatKind] = useState<FloatKind>('f64');
  const [floatText, setFloatText] = useState('0.1');

  const a = useMemo(() => parseInteger(aText, width), [aText, width]);
  const b = useMemo(() => parseInteger(bText, width), [bText, width]);

  const result = useMemo(() => {
    if (!a || !b) return null;
    return applyOp(op, a.value, b.value, width);
  }, [a, b, op, width]);

  const float = useMemo(() => parseFloat754(floatText, floatKind), [floatText, floatKind]);
  const digits = decimalDigits(floatKind);

  const radixRows = (value: bigint): [string, string][] => [
    [t(l, '十進位(無號)', 'decimal (unsigned)'), toRadix(value, width, 10)],
    [t(l, '十進位(有號)', 'decimal (signed)'), signedOf(value, width).toString(10)],
    [t(l, '十六進位', 'hex'), `0x${toRadix(value, width, 16)}`],
    [t(l, '八進位', 'octal'), `0o${toRadix(value, width, 8)}`],
    [t(l, '位元組', 'bytes'), toBytes(value, width).map((byte) => byte.toString(16).padStart(2, '0')).join(' ')],
  ];

  return (
    <div>
      <Bench
        leftLabel={t(l, '運算元', 'OPERANDS')}
        rightLabel={t(l, '結果', 'RESULT')}
        leftAside={<span className="inst-no">{width}-bit</span>}
        rightAside={<span className="inst-no">{SYMBOL[op]}</span>}
        left={
          <>
            <Row>
              <Seg
                label={t(l, '寬度', 'Width')}
                value={String(width)}
                onChange={(value) => setWidth(Number(value) as Width)}
                options={WIDTHS.map((entry) => ({ value: String(entry), label: `${entry}` }))}
              />
              <Select
                label={t(l, '運算', 'Operation')}
                value={op}
                onChange={setOp}
                options={OPS.map((entry) => ({
                  value: entry,
                  label: `${t(l, OP_LABEL[entry][0], OP_LABEL[entry][1])} — ${SYMBOL[entry]}`,
                }))}
              />
            </Row>

            <Input
              label={t(l, 'a', 'a')}
              hint={t(
                l,
                '十進位、0x 十六進位、0b 二進位、0o 八進位。負數會取這個寬度的二補數。',
                'Decimal, 0x hex, 0b binary, 0o octal. A negative value becomes its two’s complement at this width.'
              )}
              value={aText}
              onChange={setAText}
              invalid={a === null && aText.trim() !== ''}
            />
            {a ? <Bits value={a.value} width={width} label={`a = ${toRadix(a.value, width, 10)}`} /> : null}

            <Input
              label={isShift(op) ? t(l, 'n(位移量)', 'n (distance)') : t(l, 'b', 'b')}
              hint={
                isShift(op)
                  ? t(
                      l,
                      '位移量不會被取模。移超過寬度就是全部移掉(算術右移則填滿符號位),這和 JavaScript 的 1 << 32 === 1 不一樣。',
                      'The distance is not taken modulo the width: shifting past it empties the value (an arithmetic shift fills with the sign bit). JavaScript’s 1 << 32 === 1 is the odd one out.'
                    )
                  : undefined
              }
              value={bText}
              onChange={setBText}
              invalid={b === null && bText.trim() !== ''}
            />
            {b && !isShift(op) ? (
              <Bits value={b.value} width={width} label={`b = ${toRadix(b.value, width, 10)}`} />
            ) : null}

            {a?.wrapped || b?.wrapped ? (
              <Note error>
                {t(
                  l,
                  `有運算元超出 ${width} 位元能表示的範圍,已經照硬體的方式截掉高位。換更寬的寬度就會看到完整的值。`,
                  `An operand does not fit in ${width} bits and was truncated the way hardware would. Choose a wider width to see the whole value.`
                )}
              </Note>
            ) : null}

            {(a === null && aText.trim() !== '') || (b === null && bText.trim() !== '') ? (
              <Note error>
                {t(
                  l,
                  '有一邊讀不出來。可以寫 255、0xFF、0b1111_1111、0o377、-1。',
                  'One side cannot be read. Write 255, 0xFF, 0b1111_1111, 0o377 or -1.'
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div aria-live="polite">
              {result === null ? (
                <Note>{t(l, '兩邊都填好就會算。', 'Fill both sides and the result appears.')}</Note>
              ) : (
                <>
                  <Bits
                    value={result}
                    width={width}
                    label={t(l, `結果 ${SYMBOL[op]}`, `result ${SYMBOL[op]}`)}
                  />
                  <Table
                    head={[t(l, '表示法', 'notation'), t(l, '值', 'value')]}
                    rows={radixRows(result).map(([label, value]) => [
                      label,
                      <span key={label} className="inst-no inst-wrap">
                        {value}
                      </span>,
                    ])}
                  />
                  <Row>
                    <CopyButton l={l} text={`0x${toRadix(result, width, 16)}`} label={t(l, '複製 hex', 'copy hex')} />
                    <CopyButton l={l} text={toBinary(result, width, 0)} label={t(l, '複製位元', 'copy bits')} />
                  </Row>
                </>
              )}
            </div>

            {a ? (
              <Panel label={t(l, 'a 的其他讀數', 'OTHER READINGS OF a')}>
                <Table
                  head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                  rows={[
                    [t(l, '補數 ~a', 'complement ~a'), `0x${toRadix(notOf(a.value, width), width, 16)}`],
                    [t(l, '設定的位元數', 'set bits'), String(popcount(a.value))],
                    [
                      t(l, '最高設定位元', 'highest set bit'),
                      highestBit(a.value) === -1 ? t(l, '無', 'none') : String(highestBit(a.value)),
                    ],
                    [
                      t(l, '尾端零位元', 'trailing zeros'),
                      trailingZeros(a.value) === -1 ? String(width) : String(trailingZeros(a.value)),
                    ],
                    [
                      t(l, '是 2 的次方', 'power of two'),
                      popcount(a.value) === 1 ? t(l, `是(2^${trailingZeros(a.value)})`, `yes (2^${trailingZeros(a.value)})`) : t(l, '否', 'no'),
                    ],
                  ]}
                />
              </Panel>
            ) : null}
          </>
        }
      />

      <Panel
        label={t(l, 'IEEE 754 浮點拆解', 'IEEE 754 BREAKDOWN')}
        aside={<span className="inst-no">{LAYOUT[floatKind].bits}-bit</span>}
      >
        <Row>
          <Seg
            label={t(l, '格式', 'Format')}
            value={floatKind}
            onChange={setFloatKind}
            options={[
              { value: 'f64', label: 'binary64 (double)' },
              { value: 'f32', label: 'binary32 (float)' },
            ]}
          />
          <Input
            label={t(l, '數值或位元樣式', 'Value or bit pattern')}
            hint={t(
              l,
              '寫 0.1 或 -1.5e3,或直接給位元:0x3FF0000000000000。也接受 Infinity 與 NaN。',
              'Write 0.1 or -1.5e3, or give the bits directly: 0x3FF0000000000000. Infinity and NaN are accepted.'
            )}
            value={floatText}
            onChange={setFloatText}
            invalid={float === null && floatText.trim() !== ''}
          />
        </Row>

        {float === null ? (
          <Note error={floatText.trim() !== ''}>
            {floatText.trim() === ''
              ? t(l, '填一個數值。', 'Enter a value.')
              : t(l, '讀不出來。試 0.1、1e-5、0x3FF0000000000000。', 'Cannot read that. Try 0.1, 1e-5 or 0x3FF0000000000000.')}
          </Note>
        ) : (
          <div aria-live="polite">
            <div className="inst-field">
              <span className="inst-label">
                {t(l, '符號 / 指數 / 尾數', 'sign / exponent / mantissa')}
              </span>
              <p className="inst-out inst-wrap" style={{ minHeight: 0 }}>
                <span style={{ color: 'var(--accent)' }}>{float.binary.slice(0, 1)}</span>
                {' '}
                <span style={{ color: 'var(--data-teal)' }}>
                  {float.binary.slice(1, 1 + LAYOUT[floatKind].exponentBits)}
                </span>
                {' '}
                <span>{float.binary.slice(1 + LAYOUT[floatKind].exponentBits)}</span>
              </p>
              <p className="inst-hint">
                {t(
                  l,
                  `1 位符號、${LAYOUT[floatKind].exponentBits} 位指數(偏移 ${LAYOUT[floatKind].bias})、${LAYOUT[floatKind].mantissaBits} 位尾數。`,
                  `1 sign bit, ${LAYOUT[floatKind].exponentBits} exponent bits (bias ${LAYOUT[floatKind].bias}), ${LAYOUT[floatKind].mantissaBits} mantissa bits.`
                )}
              </p>
            </div>

            <Table
              head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
              rows={[
                [t(l, '位元樣式', 'bits'), <span key="h" className="inst-no">{`0x${float.hex}`}</span>],
                [t(l, '分類', 'class'), t(l, CLASS_LABEL[float.classification][0], CLASS_LABEL[float.classification][1])],
                [t(l, '符號', 'sign'), float.sign === 1 ? '1 (−)' : '0 (+)'],
                [
                  t(l, '指數欄位', 'exponent field'),
                  `${float.exponentRaw} (0x${float.exponentRaw.toString(16)})`,
                ],
                [
                  t(l, '有效數字 × 2^e', 'significand × 2^e'),
                  <span key="s" className="inst-no inst-wrap">
                    {float.significand.toString(10)} × 2^{float.exponent}
                  </span>,
                ],
                [
                  t(l, '精確十進位值', 'exact decimal value'),
                  <span key="e" className="inst-no inst-wrap">
                    {float.exact}
                  </span>,
                ],
                [
                  t(l, 'JavaScript 印出來的樣子', 'as JavaScript prints it'),
                  <span key="v" className="inst-no">
                    {String(float.value)}
                  </span>,
                ],
                [
                  t(l, '到下一個可表示數的距離', 'step to the next value'),
                  <span key="u" className="inst-no inst-wrap">
                    {ulpOf(float)}
                  </span>,
                ],
              ]}
            />

            <Row>
              <CopyButton l={l} text={`0x${float.hex}`} label={t(l, '複製位元', 'copy bits')} />
              <CopyButton l={l} text={float.exact} label={t(l, '複製精確值', 'copy exact value')} />
            </Row>

            <Note>
              {t(
                l,
                `每一個二進位浮點數都是一個精確的十進位數,只是通常很長。上面那一行就是這組位元真正代表的值——0.1 存進 double 之後其實是 0.1000000000000000055511151231257827…,這就是 0.1 + 0.2 不等於 0.3 的全部原因。這個格式能保證來回不變的十進位有效位數是 ${digits.significant} 位,要寫出去再讀回來位元完全一樣則需要 ${digits.roundTrip} 位。`,
                `Every binary float is an exact decimal, just usually a long one. The line above is what these bits actually mean: 0.1 stored as a double is really 0.1000000000000000055511151231257827…, which is the whole reason 0.1 + 0.2 is not 0.3. This format always preserves ${digits.significant} significant decimal digits, and needs ${digits.roundTrip} to write a value out and read it back bit-for-bit.`
              )}
            </Note>

            {!roundTrips(floatText, floatKind) && /^[+-]?[\d.]/.test(floatText.trim()) ? (
              <Note error>
                {t(
                  l,
                  `這個十進位在 ${floatKind === 'f32' ? 'binary32' : 'binary64'} 裡存不下來,存進去再讀出來已經不是同一個數了。`,
                  `This decimal cannot be held in ${floatKind === 'f32' ? 'binary32' : 'binary64'}: storing and reading it back does not give the same number.`
                )}
              </Note>
            ) : null}
          </div>
        )}
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '寬度', 'width'), v: `${width} bit` },
          { k: t(l, '運算', 'operation'), v: SYMBOL[op] },
          {
            k: t(l, '結果(hex)', 'result (hex)'),
            v: result === null ? '—' : `0x${toRadix(result, width, 16)}`,
          },
          { k: t(l, '設定的位元數', 'set bits'), v: result === null ? '—' : String(popcount(result)) },
          { k: t(l, '浮點分類', 'float class'), v: float ? t(l, CLASS_LABEL[float.classification][0], CLASS_LABEL[float.classification][1]) : '—' },
        ]}
      />
    </div>
  );
}
