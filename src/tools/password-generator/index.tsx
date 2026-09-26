'use client';

import { useCallback, useState } from 'react';
import type { ToolProps } from '../types';
import { Btn, Check2, CopyButton, Note, Panel, Readout, Row, Table } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import { below } from '@/lib/tools/random';
import {
  CHARSETS,
  GPU_SHA256_PER_SECOND,
  ImpossibleOptions,
  MAX_LENGTH,
  MIN_LENGTH,
  alphabetFor,
  crackTime,
  entropyOf,
  generate,
  strengthOf,
  type Options,
  type SetId,
} from './logic';

const SET_ORDER: SetId[] = ['lower', 'upper', 'digit', 'symbol'];

const STRENGTH_COLOUR = {
  weak: 'var(--accent)',
  fair: 'var(--fg-muted)',
  strong: 'var(--data-teal)',
  excessive: 'var(--data-teal)',
} as const;

/**
 * Nothing here is stored. The registry marks this tool `sensitive`, which is
 * why there is no "remember my settings" — a length and a checkbox are not
 * worth a localStorage entry that outlives the password.
 */
export default function PasswordGenerator({ l }: ToolProps) {
  const [options, setOptions] = useState<Options>({
    length: 20,
    sets: ['lower', 'upper', 'digit', 'symbol'],
    requireEach: true,
    avoidAmbiguous: false,
  });
  const [batch, setBatch] = useState(5);
  const [passwords, setPasswords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const alphabet = alphabetFor(options);
  const bits = entropyOf(options);
  const strength = strengthOf(bits);

  const roll = useCallback(() => {
    try {
      setPasswords(Array.from({ length: batch }, () => generate(options, below)));
      setError(null);
    } catch (problem) {
      setPasswords([]);
      setError(
        problem instanceof ImpossibleOptions
          ? t(
              l,
              '這組設定做不出密碼:沒有選字元類型,長度不足以容納所有類型,或字元集被排除到空了。',
              'These options cannot produce a password: no character types are selected, the length cannot hold every type, or the alphabet is empty.'
            )
          : String(problem)
      );
    }
  }, [options, batch, l]);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const toggleSet = (id: SetId) =>
    setOptions((previous) => {
      const next = previous.sets.includes(id)
        ? previous.sets.filter((entry) => entry !== id)
        : [...previous.sets, id];
      // Unselecting the last type is allowed to stick: the button then shows
      // what was actually clicked, and the panel says a password cannot be made
      // from it. Quietly putting a type back — or generating lowercase anyway —
      // hands back something other than what the screen claims is selected.
      return { ...previous, sets: next };
    });

  // Not memoised: it is a four-way lookup, and wrapping it defeats the React
  // Compiler rather than helping it.
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
              {t(l, '字元集', 'alphabet')} {alphabet.length}
            </span>
          </div>

          <div className="inst-field">
            <label className="inst-label" htmlFor="pw-length">
              {t(l, `長度 ${options.length}`, `Length ${options.length}`)}
            </label>
            <input
              id="pw-length"
              type="range"
              min={MIN_LENGTH}
              max={MAX_LENGTH}
              value={options.length}
              onChange={(event) => set('length', Number(event.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <p className="inst-hint">
              {t(
                l,
                '一般用途 16 到 20 就夠;會被離線破解的東西(備份、金鑰庫)給 24 以上。',
                'Sixteen to twenty covers normal use; give anything that could be attacked offline twenty-four or more.'
              )}
            </p>
          </div>

          <div className="inst-field">
            <span className="inst-label">{t(l, '字元類型', 'Character types')}</span>
            <div className="inst-toolbar">
              {SET_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="inst-btn"
                  aria-pressed={options.sets.includes(id)}
                  data-primary={options.sets.includes(id) ? 'true' : undefined}
                  onClick={() => toggleSet(id)}
                >
                  {id === 'lower'
                    ? 'a–z'
                    : id === 'upper'
                      ? 'A–Z'
                      : id === 'digit'
                        ? '0–9'
                        : CHARSETS.symbol.slice(0, 6)}
                </button>
              ))}
            </div>
            {options.sets.length === 0 ? (
              <Note error>
                {t(
                  l,
                  '沒有選任何字元類型,就沒有可以抽的字元。至少選一類。',
                  'No character types selected, so there is nothing to draw from. Pick at least one.'
                )}
              </Note>
            ) : null}
          </div>

          <Row>
            <Check2
              label={t(l, '每類至少一個', 'at least one of each')}
              checked={options.requireEach}
              onChange={(value) => set('requireEach', value)}
            />
            <Check2
              label={t(l, '排除易混字元', 'avoid look-alikes')}
              checked={options.avoidAmbiguous}
              onChange={(value) => set('avoidAmbiguous', value)}
            />
          </Row>

          <Row>
            <Btn onClick={roll} primary disabled={options.sets.length === 0}>
              {t(l, '產生', 'generate')}
            </Btn>
            <Check2
              label={t(l, '一次五組', 'five at a time')}
              checked={batch === 5}
              onChange={(value) => setBatch(value ? 5 : 1)}
            />
          </Row>

          {error ? <Note error>{error}</Note> : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '結果', 'RESULT')}</span>
            <span className="inst-no" style={{ color: STRENGTH_COLOUR[strength] }}>
              {bits.toFixed(1)} bits · {label}
            </span>
          </div>

          {passwords.length === 0 ? (
            <Note>
              {t(
                l,
                '按「產生」。密碼只存在這個分頁的記憶體裡,重新整理就沒了。',
                'Press generate. Passwords live in this tab’s memory and are gone on reload.'
              )}
            </Note>
          ) : (
            <Table
              head={[t(l, '密碼', 'password'), '']}
              rows={passwords.map((password) => [
                <span key={password} className="inst-wrap">
                  {password}
                </span>,
                <CopyButton key={`${password}-copy`} l={l} text={password} />,
              ])}
            />
          )}

          {passwords.length > 1 ? (
            <Row>
              <CopyButton l={l} text={passwords.join('\n')} label={t(l, '全部複製', 'copy all')} />
            </Row>
          ) : null}
        </section>
      </div>

      <Panel label={t(l, '這個強度代表什麼', 'WHAT THAT STRENGTH MEANS')}>
        <Table
          head={[t(l, '攻擊情境', 'scenario'), t(l, '每秒猜測', 'guesses/s'), t(l, '耗時', 'time')]}
          rows={[
            [t(l, '線上服務(有節流)', 'online service, throttled'), '1e3', crackTime(bits, 1e3)],
            [t(l, '外洩的慢雜湊(bcrypt)', 'leaked slow hash (bcrypt)'), '1e5', crackTime(bits, 1e5)],
            [
              t(l, '外洩的快雜湊(SHA-256,四張 GPU)', 'leaked fast hash (SHA-256), four GPUs'),
              '1e11',
              crackTime(bits, GPU_SHA256_PER_SECOND),
            ],
          ]}
        />
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '長度', 'length'), v: String(options.length) },
          { k: t(l, '字元集', 'alphabet'), v: String(alphabet.length) },
          { k: t(l, '熵', 'entropy'), v: `${bits.toFixed(1)} bits` },
          { k: t(l, '亂數來源', 'source'), v: 'crypto.getRandomValues' },
        ]}
      />
    </div>
  );
}
