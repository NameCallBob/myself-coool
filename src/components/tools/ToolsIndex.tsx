'use client';

import { useMemo, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { TOOLS } from '../../../content/tools/registry';
import { CATEGORIES } from '../../../content/tools/categories';
import type { CategoryId } from '../../../content/tools/types';
import { BUILT } from '@/tools/built.generated';
import { loc, t } from '@/lib/tools/locale';
import { search } from '@/lib/tools/search';

/**
 * The catalogue.
 *
 * Set as a contents page, not a card grid: one row per tool, the part number
 * on the left, a dotted leader carrying the eye across to the flags on the
 * right. Dense on purpose — a bench with a hundred instruments should look
 * like it has a hundred instruments.
 *
 * Rendered from the registry on the server as well as the client, so the whole
 * list is in the HTML for a crawler and for a reader with JS off; the input
 * only filters what is already there.
 */
export function ToolsIndex({ locale }: { locale: string }) {
  const l = loc(locale);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<CategoryId | 'all'>('all');
  const [builtOnly, setBuiltOnly] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    let list = search(TOOLS, query, l);
    if (drawer !== 'all') list = list.filter((tool) => tool.category === drawer);
    if (builtOnly) list = list.filter((tool) => BUILT.has(tool.slug));
    return list;
  }, [query, drawer, builtOnly, l]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem 0.75rem',
          alignItems: 'center',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-3)',
        }}
      >
        <input
          ref={input}
          data-inst-search
          className="inst-input"
          style={{ maxWidth: '22rem' }}
          value={query}
          placeholder={t(l, '搜尋名稱、關鍵字或料號', 'Name, keyword or part number')}
          aria-label={t(l, '搜尋工具', 'Search instruments')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('');
              input.current?.blur();
            }
          }}
        />
        <div className="inst-seg" role="group" aria-label={t(l, '分類篩選', 'Filter by drawer')}>
          <button type="button" aria-pressed={drawer === 'all'} onClick={() => setDrawer('all')}>
            {t(l, '全部', 'all')}
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={drawer === category.id}
              title={category.name[l]}
              onClick={() => setDrawer(category.id)}
            >
              {category.letter}
            </button>
          ))}
        </div>
        <label className="inst-status" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={builtOnly}
            onChange={(event) => setBuiltOnly(event.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ letterSpacing: 0, color: 'var(--fg-muted)' }}>
            {t(l, '只看已完成', 'built only')}
          </span>
        </label>
        <span className="inst-no" style={{ marginLeft: 'auto' }}>
          {matches.length} / {TOOLS.length}
        </span>
      </div>

      {matches.length === 0 ? (
        <p className="inst-hint" style={{ marginTop: '1.5rem' }}>
          {t(l, '沒有符合的工具。試試料號,或清掉篩選。', 'Nothing matches. Try a part number, or clear the filters.')}
        </p>
      ) : null}

      {CATEGORIES.map((category) => {
        const rows = matches.filter((tool) => tool.category === category.id);
        if (rows.length === 0) return null;

        return (
          <section key={category.id} className="inst-drawer">
            <div className="inst-drawer-head">
              <span className="inst-no" style={{ fontSize: '13px' }}>
                <b>{category.letter}</b>
              </span>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{category.name[l]}</h2>
              <p className="inst-hint" style={{ marginTop: 0, flex: 1 }}>
                {category.note[l]}
              </p>
            </div>
            {rows.map((tool) => (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="inst-row"
              >
                <span className="inst-no">
                  <b>{tool.id.slice(0, 1)}</b>
                  {tool.id.slice(1)}
                </span>
                <span className="inst-row-name">{tool.name[l]}</span>
                <span className="inst-leader" aria-hidden="true" />
                <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'baseline' }}>
                  {tool.sensitive ? (
                    <span className="inst-flag" data-kind="sensitive">
                      {t(l, '敏感', 'secret')}
                    </span>
                  ) : null}
                  {tool.needs?.includes('camera') ? (
                    <span className="inst-flag">{t(l, '相機', 'camera')}</span>
                  ) : null}
                  {BUILT.has(tool.slug) ? null : (
                    <span className="inst-flag">{t(l, '未完成', 'pending')}</span>
                  )}
                </span>
                <span className="inst-row-blurb">{tool.blurb[l]}</span>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
