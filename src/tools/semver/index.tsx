'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  boundsOf,
  compare,
  diffKind,
  format,
  formatRange,
  maxSatisfying,
  parse,
  parseRange,
  probeVersions,
  satisfies,
  sortVersions,
  type DiffKind,
} from './logic';

const DIFF_LABEL: Record<DiffKind, [string, string]> = {
  same: ['完全相同', 'identical'],
  build: ['只有建構資訊不同(排序上相等)', 'build metadata only — equal in precedence'],
  prerelease: ['預發布標籤不同', 'prerelease differs'],
  patch: ['修訂號不同', 'patch differs'],
  minor: ['次版號不同', 'minor differs'],
  major: ['主版號不同', 'major differs'],
};

const SAMPLE_VERSIONS = [
  '0.9.0',
  '1.0.0',
  '1.0.1',
  '1.2.0',
  '1.2.3',
  '1.9.9',
  '2.0.0-rc.1',
  '2.0.0',
  '2.1.0',
].join('\n');

const RANGE_PRESETS = ['^1.2.3', '~1.2.3', '>=1.2.0 <2.0.0', '1.x', '1.2.3 - 2.3.4', '^1 || ^2'];

/**
 * Sorting versions, and showing what a range actually covers.
 *
 * The range half is the one worth having. `^0.2.3` stops at 0.3.0 and `^1.2.3`
 * expands to `<2.0.0-0` rather than `<2.0.0`, and neither is guessable from the
 * notation — so the expansion is printed as explicit comparators and then tested
 * against versions either side of every bound.
 */
export default function SemverTool({ l }: ToolProps) {
  const [versionsText, setVersionsText] = useState(SAMPLE_VERSIONS);
  const [rangeText, setRangeText] = useState('^1.2.3');
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [leftText, setLeftText] = useState('1.0.0-rc.1');
  const [rightText, setRightText] = useState('1.0.0');

  const lines = useMemo(
    () =>
      versionsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    [versionsText]
  );

  const parsedVersions = useMemo(
    () => lines.map((line) => ({ line, version: parse(line) })),
    [lines]
  );
  const valid = useMemo(
    () => parsedVersions.filter((entry) => entry.version !== null).map((entry) => entry.version!),
    [parsedVersions]
  );
  const invalid = useMemo(
    () => parsedVersions.filter((entry) => entry.version === null).map((entry) => entry.line),
    [parsedVersions]
  );

  const range = useMemo(() => parseRange(rangeText), [rangeText]);
  const sorted = useMemo(() => sortVersions(valid), [valid]);
  const best = useMemo(
    () => (range ? maxSatisfying(valid, range, includePrerelease) : null),
    [valid, range, includePrerelease]
  );
  const probes = useMemo(() => (range ? probeVersions(range) : []), [range]);

  const left = useMemo(() => parse(leftText), [leftText]);
  const right = useMemo(() => parse(rightText), [rightText]);
  const order = left && right ? compare(left, right) : null;

  const boundsText = (group: ReturnType<typeof boundsOf>): string => {
    if (group.empty) {
      return t(l, '這一組條件互相矛盾,沒有任何版本符合。', 'These comparators contradict; nothing can satisfy them.');
    }
    const low =
      group.lower === null
        ? t(l, '沒有下界', 'no lower bound')
        : t(
            l,
            `從 ${format(group.lower)} ${group.lowerInclusive ? '(含)' : '(不含)'} 起`,
            `from ${format(group.lower)} ${group.lowerInclusive ? 'inclusive' : 'exclusive'}`
          );
    const high =
      group.upper === null
        ? t(l, '沒有上界', 'no upper bound')
        : t(
            l,
            `到 ${format(group.upper)} ${group.upperInclusive ? '(含)' : '(不含)'}`,
            `up to ${format(group.upper)} ${group.upperInclusive ? 'inclusive' : 'exclusive'}`
          );
    return `${low} ${high}`;
  };

  return (
    <div>
      <Bench
        leftLabel={t(l, '版本與範圍', 'VERSIONS & RANGE')}
        rightLabel={t(l, '範圍涵蓋什麼', 'WHAT THE RANGE COVERS')}
        leftAside={<span className="inst-no">{count(valid.length)}</span>}
        rightAside={range ? <span className="inst-no">{count(range.groups.length)} group</span> : null}
        left={
          <>
            <Input
              label={t(l, '範圍', 'Range')}
              hint={t(
                l,
                '^ ~ >= <= > < =、x 通配、1.2.3 - 2.3.4 區間、|| 或。語意照 npm。',
                '^ ~ >= <= > < =, x wildcards, 1.2.3 - 2.3.4 hyphen ranges, || for alternatives. Semantics follow npm.'
              )}
              value={rangeText}
              onChange={setRangeText}
              invalid={range === null && rangeText.trim() !== ''}
            />

            <div className="inst-field">
              <span className="inst-label">{t(l, '常見寫法', 'Common ranges')}</span>
              <div className="inst-toolbar">
                {RANGE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="inst-btn"
                    onClick={() => setRangeText(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {range === null && rangeText.trim() !== '' ? (
              <Note error>
                {t(
                  l,
                  '這個範圍讀不出來。運算子後面要接版本號,^ 或 >= 自己一個是打錯了。',
                  'This range cannot be read. An operator needs a version after it; a bare ^ or >= is a typo.'
                )}
              </Note>
            ) : null}

            {range ? (
              <>
                <div className="inst-field">
                  <span className="inst-label">{t(l, '展開成明確的比較式', 'Expanded to explicit comparators')}</span>
                  <p className="inst-out inst-wrap" style={{ minHeight: 0 }}>
                    {formatRange(range)}
                  </p>
                </div>
                <Row>
                  <CopyButton l={l} text={formatRange(range)} />
                  <Check2
                    label={t(l, '納入預發布版本', 'include prereleases')}
                    checked={includePrerelease}
                    onChange={setIncludePrerelease}
                  />
                </Row>
                {range.groups.map((group, index) => (
                  <Note key={index}>
                    {range.groups.length > 1 ? `${index + 1}. ` : ''}
                    {boundsText(boundsOf(group))}
                  </Note>
                ))}
              </>
            ) : null}

            <Area
              label={t(l, '版本清單(一行一個)', 'Versions, one per line')}
              value={versionsText}
              onChange={setVersionsText}
              rows={10}
            />
            {invalid.length > 0 ? (
              <Note error>
                {t(
                  l,
                  `這幾行不是合法的 semver,已排除:${invalid.slice(0, 6).join(', ')}${invalid.length > 6 ? ' …' : ''}`,
                  `Not valid semver and skipped: ${invalid.slice(0, 6).join(', ')}${invalid.length > 6 ? ' …' : ''}`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div aria-live="polite">
              {range === null || valid.length === 0 ? (
                <Note>
                  {t(l, '填好範圍與版本清單就會逐個判定。', 'Fill in a range and some versions to test each one.')}
                </Note>
              ) : (
                <Table
                  head={[t(l, '版本', 'version'), t(l, '在範圍內', 'in range'), t(l, '排序', 'order')]}
                  align={['left', 'left', 'right']}
                  rows={sorted.map((version) => {
                    const inside = satisfies(version, range, includePrerelease);
                    const isBest = best !== null && compare(version, best) === 0;
                    return [
                      <span key="v" className="inst-no">
                        {format(version)}
                        {isBest ? t(l, ' ← 會選到這個', ' ← resolves here') : ''}
                      </span>,
                      <span
                        key="s"
                        style={{ color: inside ? 'var(--data-teal)' : 'var(--fg-faint)' }}
                      >
                        {inside ? t(l, '✓ 符合', '✓ yes') : t(l, '✕ 不符合', '✕ no')}
                      </span>,
                      String(sorted.indexOf(version) + 1),
                    ];
                  })}
                />
              )}
            </div>

            {range ? (
              <Panel label={t(l, '邊界測試', 'BOUNDARY PROBES')}>
                <Note>
                  {t(
                    l,
                    '這些版本是從範圍的邊界自動推出來的:上下界本身、各差一號的鄰居、以及同一個版號的預發布。邊界差一號的錯誤通常在這裡才看得出來。',
                    'These are derived from the range’s own bounds: each bound, its neighbours one step either side, and the prerelease of the same version. An off-by-one bound shows up here and almost nowhere else.'
                  )}
                </Note>
                <Table
                  head={[t(l, '版本', 'version'), t(l, '在範圍內', 'in range')]}
                  rows={probes.map((version) => [
                    <span key="v" className="inst-no">
                      {format(version)}
                    </span>,
                    <span
                      key="s"
                      style={{
                        color: satisfies(version, range, includePrerelease)
                          ? 'var(--data-teal)'
                          : 'var(--fg-faint)',
                      }}
                    >
                      {satisfies(version, range, includePrerelease) ? t(l, '✓ 符合', '✓ yes') : t(l, '✕ 不符合', '✕ no')}
                    </span>,
                  ])}
                />
              </Panel>
            ) : null}
          </>
        }
      />

      <Panel label={t(l, '兩個版本比大小', 'COMPARE TWO VERSIONS')}>
        <Row>
          <Input
            label={t(l, '左', 'left')}
            value={leftText}
            onChange={setLeftText}
            invalid={left === null && leftText.trim() !== ''}
          />
          <Input
            label={t(l, '右', 'right')}
            value={rightText}
            onChange={setRightText}
            invalid={right === null && rightText.trim() !== ''}
          />
        </Row>

        <div className="inst-out" aria-live="polite" style={{ minHeight: 0 }}>
          {left === null || right === null ? (
            <span style={{ color: 'var(--fg-faint)' }}>
              {t(l, '兩邊都要是合法的 semver。', 'Both sides must be valid semver.')}
            </span>
          ) : (
            <>
              {format(left)} {order === 0 ? '=' : order === -1 ? '<' : '>'} {format(right)}
              {'  —  '}
              {t(l, DIFF_LABEL[diffKind(left, right)][0], DIFF_LABEL[diffKind(left, right)][1])}
            </>
          )}
        </div>

        {left && right && diffKind(left, right) === 'build' ? (
          <Note>
            {t(
              l,
              '建構資訊(+ 後面那段)在語意化版本的排序規則裡完全不參與比較,所以這兩個版本在排序上是相等的。要區分不同建構請放到預發布標籤,不要放在 + 後面。',
              'Build metadata — everything after the + — takes no part in precedence, so these two are equal when sorted. If two builds need to be distinguishable, that belongs in the prerelease field.'
            )}
          </Note>
        ) : null}

        {left && right && left.prerelease.length !== right.prerelease.length && order !== 0 ? (
          <Note>
            {t(
              l,
              '帶預發布標籤的版本排在同號正式版之前,所以 1.0.0-rc.1 小於 1.0.0。這也是 ^1.0.0 收不到 1.0.0-rc.1 的原因。',
              'A version with a prerelease sorts below the release of the same number, so 1.0.0-rc.1 is less than 1.0.0. That is also why ^1.0.0 will not take 1.0.0-rc.1.'
            )}
          </Note>
        ) : null}
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '有效版本', 'valid versions'), v: count(valid.length) },
          { k: t(l, '無效行', 'rejected lines'), v: count(invalid.length) },
          {
            k: t(l, '符合範圍', 'in range'),
            v:
              range === null
                ? '—'
                : count(valid.filter((version) => satisfies(version, range, includePrerelease)).length),
          },
          { k: t(l, '會選到', 'resolves to'), v: best ? format(best) : '—' },
          { k: t(l, '或條件組', 'or-groups'), v: range ? count(range.groups.length) : '—' },
        ]}
      />
    </div>
  );
}
