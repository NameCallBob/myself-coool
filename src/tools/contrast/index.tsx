'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, CopyButton, Input, Note, Panel, Readout, Row, Seg, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import {
  apcaBand,
  measure,
  nearestPassing,
  parseColor,
  toHex,
  type ApcaBand,
  type Rgb,
  type Target,
  type WcagLevel,
} from './logic';

const BAND_TEXT: Record<ApcaBand, { zh: string; en: string }> = {
  'body-preferred': { zh: 'Lc 90 以上 — 正文的理想值', en: 'Lc 90+ — preferred for body text' },
  'body-min': { zh: 'Lc 75–90 — 正文的下限', en: 'Lc 75–90 — minimum for body text' },
  'sub-body': { zh: 'Lc 60–75 — 只夠較大或較粗的字', en: 'Lc 60–75 — larger or heavier text only' },
  'large-only': { zh: 'Lc 45–60 — 只夠大標題', en: 'Lc 45–60 — headlines only' },
  'non-text': { zh: 'Lc 15–45 — 只夠非文字元素', en: 'Lc 15–45 — non-text elements only' },
  invisible: { zh: 'Lc 15 以下 — 看不見', en: 'Lc under 15 — invisible' },
};

const LEVEL_MARK: Record<WcagLevel, string> = { AAA: 'AAA', AA: 'AA', fail: '✕' };

function Verdict({ level, label }: { level: WcagLevel; label: string }) {
  const failed = level === 'fail';
  return (
    <span
      className="inst-no"
      style={{ color: failed ? 'var(--accent)' : 'var(--data-teal)', letterSpacing: '0.04em' }}
    >
      {/* The mark carries the state, not only the colour — a contrast tool of
          all things cannot rely on hue to tell you something failed. */}
      {LEVEL_MARK[level]} {label}
    </span>
  );
}

const SAMPLES: { text: string; bg: string; note: { zh: string; en: string } }[] = [
  { text: '#767676', bg: '#ffffff', note: { zh: '白底上剛好過 AA 的灰', en: 'the grey that just passes AA on white' } },
  { text: '#ffffff', bg: '#2a7d7f', note: { zh: '白字配中明度色塊', en: 'white on a mid-lightness fill' } },
  { text: '#89847a', bg: '#12100e', note: { zh: '深色模式的次要文字', en: 'muted text in a dark theme' } },
];

export default function Contrast({ l }: ToolProps) {
  const [textInput, setTextInput] = useState('#767676');
  const [bgInput, setBgInput] = useState('#ffffff');
  const [page, setPage] = useState<'white' | 'black'>('white');
  const [target, setTarget] = useState<Target>(4.5);
  const [move, setMove] = useState<'text' | 'background'>('text');

  const text = useMemo(() => parseColor(textInput), [textInput]);
  const background = useMemo(() => parseColor(bgInput), [bgInput]);
  const result = useMemo(() => {
    const pageRgb: Rgb = page === 'white' ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
    return text && background ? measure(text, background, pageRgb) : null;
  }, [text, background, page]);

  const suggestions = useMemo(() => {
    if (!result) return [];
    return move === 'text'
      ? nearestPassing(result.text, result.background, target, true)
      : nearestPassing(result.background, result.text, target, false);
  }, [result, target, move]);

  const swatchText = result ? toHex(result.text) : '#000000';
  const swatchBg = result ? toHex(result.background) : '#ffffff';

  return (
    <div>
      <Panel label={t(l, '兩個顏色', 'THE PAIR')}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
            gap: '1rem',
          }}
        >
          <Input
            label={t(l, '文字顏色', 'Text colour')}
            value={textInput}
            onChange={setTextInput}
            invalid={textInput.trim() !== '' && !text}
            placeholder="#767676"
            hint={t(l, 'hex / rgb() / hsl() / oklch() / oklab(),可帶透明度', 'hex / rgb() / hsl() / oklch() / oklab(), alpha allowed')}
          />
          <Input
            label={t(l, '背景顏色', 'Background colour')}
            value={bgInput}
            onChange={setBgInput}
            invalid={bgInput.trim() !== '' && !background}
            placeholder="#ffffff"
            hint={t(l, '半透明會先疊在下面的頁面色上', 'A translucent value is composited onto the page colour below')}
          />
          <Seg
            label={t(l, '頁面底色', 'Page colour')}
            value={page}
            onChange={setPage}
            options={[
              { value: 'white', label: t(l, '白', 'white') },
              { value: 'black', label: t(l, '黑', 'black') },
            ]}
          />
        </div>

        <Row>
          <Btn
            onClick={() => {
              setTextInput(bgInput);
              setBgInput(textInput);
            }}
          >
            {t(l, '交換', 'swap')}
          </Btn>
          {SAMPLES.map((sample) => (
            <Btn
              key={sample.text + sample.bg}
              onClick={() => {
                setTextInput(sample.text);
                setBgInput(sample.bg);
              }}
              title={t(l, sample.note.zh, sample.note.en)}
            >
              {sample.text} / {sample.bg}
            </Btn>
          ))}
        </Row>

        {(textInput.trim() !== '' && !text) || (bgInput.trim() !== '' && !background) ? (
          <Note error>
            {t(
              l,
              '有一邊讀不出來。這裡吃 hex、rgb()、hsl()、oklch()、oklab() 與 black/white/grey 幾個名稱;完整的顏色名稱表在 H01。',
              'One side did not parse. This tool reads hex, rgb(), hsl(), oklch(), oklab() and a few names; the full named-colour table is in H01.'
            )}
          </Note>
        ) : null}
      </Panel>

      {result ? (
        <>
          <div className="mt-8">
            <Panel
              label={t(l, '看起來是這樣', 'PREVIEW')}
              aside={
                result.composited ? (
                  <span className="inst-no">{t(l, '已疊合透明度', 'alpha composited')}</span>
                ) : null
              }
            >
              <div
                style={{
                  background: swatchBg,
                  color: swatchText,
                  border: '1px solid var(--border-3)',
                  padding: '1.25rem',
                  display: 'grid',
                  gap: '0.6rem',
                }}
              >
                <p style={{ fontSize: '2rem', lineHeight: 1.1, margin: 0 }}>
                  {t(l, '大標題 24px 以上', 'Large heading, 24px up')}
                </p>
                <p style={{ fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
                  {t(
                    l,
                    '正文大小的中文。判定門檻看的是字級與字重,不只是顏色:18pt(24px),或 14pt(18.66px)加粗,算「大字」。',
                    'Body copy. The threshold depends on size and weight, not colour alone: 18pt (24px), or 14pt (18.66px) bold, counts as large.'
                  )}
                </p>
                <p style={{ fontSize: '0.75rem', margin: 0 }}>
                  {t(l, '12px 的註腳文字', 'A 12px footnote')}
                </p>
              </div>
            </Panel>
          </div>

          <div className="mt-8">
            <Panel label={t(l, '判定', 'VERDICT')}>
              <div aria-live="polite">
                <Table
                  head={[t(l, '量測', 'measure'), t(l, '值', 'value'), t(l, '判定', 'verdict')]}
                  rows={[
                    [
                      <span key="k">{t(l, 'WCAG 2.2 對比率', 'WCAG 2.2 ratio')}</span>,
                      <span key="v" className="inst-no" style={{ color: 'var(--fg)', fontSize: '0.9rem' }}>
                        {result.ratio.toFixed(2)}:1
                      </span>,
                      <span key="d" style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
                        <Verdict level={result.wcag.normal} label={t(l, '正文', 'body')} />
                        <Verdict level={result.wcag.large} label={t(l, '大字', 'large')} />
                        <Verdict
                          level={result.wcag.nonText ? 'AA' : 'fail'}
                          label={t(l, '非文字 3:1', 'non-text 3:1')}
                        />
                      </span>,
                    ],
                    [
                      <span key="k">{t(l, 'APCA Lc(對照用)', 'APCA Lc (for reference)')}</span>,
                      <span key="v" className="inst-no" style={{ color: 'var(--fg)', fontSize: '0.9rem' }}>
                        {result.lc.toFixed(1)}
                      </span>,
                      <span key="d" className="inst-no">
                        {t(l, BAND_TEXT[result.band].zh, BAND_TEXT[result.band].en)}
                      </span>,
                    ],
                  ]}
                />
              </div>
              <Note>
                {t(
                  l,
                  'WCAG 是目前的規範,APCA 還在 WCAG 3 草案階段,兩者不會給一樣的結論——尤其在深色主題上,WCAG 對深色偏寬鬆。兩邊都看,不要只挑過得去的那個。Lc 的正負是極性:正代表深字淺底。',
                  'WCAG is the normative measure; APCA is still a WCAG 3 draft, and the two do not agree — WCAG is notably lenient about dark themes. Read both. The sign of Lc is polarity: positive means dark text on a light ground.'
                )}
              </Note>
            </Panel>
          </div>

          <div className="mt-8">
            <Panel label={t(l, '最近的可用色', 'NEAREST PASSING COLOUR')}>
              <Row>
                <Seg
                  label={t(l, '目標對比率', 'Target ratio')}
                  value={String(target) as '3' | '4.5' | '7'}
                  onChange={(v) => setTarget(Number(v) as Target)}
                  options={[
                    { value: '3', label: t(l, '3:1 大字/非文字', '3:1 large / non-text') },
                    { value: '4.5', label: t(l, '4.5:1 AA', '4.5:1 AA') },
                    { value: '7', label: t(l, '7:1 AAA', '7:1 AAA') },
                  ]}
                />
                <Seg
                  label={t(l, '要改哪一邊', 'Which side moves')}
                  value={move}
                  onChange={setMove}
                  options={[
                    { value: 'text', label: t(l, '改文字', 'text') },
                    { value: 'background', label: t(l, '改背景', 'background') },
                  ]}
                />
              </Row>

              <div aria-live="polite">
                {result.ratio >= target ? (
                  <Note>
                    {t(
                      l,
                      `現在的 ${result.ratio.toFixed(2)}:1 已經達到 ${target}:1,不需要改。`,
                      `${result.ratio.toFixed(2)}:1 already meets ${target}:1 — nothing to change.`
                    )}
                  </Note>
                ) : suggestions.length === 0 ? (
                  <Note error>
                    {t(
                      l,
                      `固定色相與彩度、只動明度的話,這一邊不管往哪個方向都到不了 ${target}:1。要換的是另一邊,或者放棄這個色相。`,
                      `Holding hue and chroma and moving only lightness, this side cannot reach ${target}:1 in either direction. Move the other side, or give up this hue.`
                    )}
                  </Note>
                ) : (
                  <Table
                    head={[
                      t(l, '方向', 'direction'),
                      t(l, '顏色', 'colour'),
                      t(l, '對比率', 'ratio'),
                      'Lc',
                      t(l, '色差 ΔEOK', 'ΔEOK'),
                      '',
                    ]}
                    align={['left', 'left', 'right', 'right', 'right', 'right']}
                    rows={suggestions.map((s) => [
                      <span key="d" className="inst-no">
                        {s.direction === 'darker' ? t(l, '調暗', 'darker') : t(l, '調亮', 'lighter')}
                      </span>,
                      <span key="c" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: '1rem',
                            height: '1rem',
                            background: s.hex,
                            border: '1px solid var(--border-3)',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{s.hex}</span>
                      </span>,
                      <span key="r" className="inst-no">
                        {s.ratio.toFixed(2)}:1
                      </span>,
                      <span key="l" className="inst-no">
                        {s.lc.toFixed(1)}
                      </span>,
                      <span key="e" className="inst-no">
                        {s.deltaE.toFixed(3)}
                      </span>,
                      <span key="a" style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <CopyButton l={l} text={s.hex} label={t(l, '複製', 'copy')} />
                        <Btn
                          onClick={() => (move === 'text' ? setTextInput(s.hex) : setBgInput(s.hex))}
                        >
                          {t(l, '套用', 'apply')}
                        </Btn>
                      </span>,
                    ])}
                  />
                )}
              </div>
              <Note>
                {t(
                  l,
                  '建議色只動 OKLCH 的明度,色相與彩度維持原樣,再壓回 sRGB 可顯示範圍。ΔEOK 是與原色的感知距離,0.02 約等於剛好看得出來的差別。',
                  'Suggestions move only OKLCH lightness, holding hue and chroma, then map back into sRGB. ΔEOK is the perceptual distance from the original; 0.02 is about one just-noticeable difference.'
                )}
              </Note>
            </Panel>
          </div>
        </>
      ) : null}

      <Readout
        l={l}
        items={
          result
            ? [
                { k: t(l, '對比率', 'ratio'), v: `${result.ratio.toFixed(2)}:1` },
                { k: 'APCA Lc', v: result.lc.toFixed(1) },
                { k: t(l, '正文', 'body'), v: LEVEL_MARK[result.wcag.normal] },
                { k: t(l, '大字', 'large'), v: LEVEL_MARK[result.wcag.large] },
                { k: t(l, 'APCA 分級', 'APCA band'), v: apcaBand(result.lc) },
              ]
            : [{ k: t(l, '狀態', 'status'), v: t(l, '等兩個顏色', 'awaiting both colours') }]
        }
      />
    </div>
  );
}
