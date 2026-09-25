'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { TOOLS } from '../../../content/tools/registry';
import { CATEGORY_BY_ID } from '../../../content/tools/categories';
import { BUILT } from '@/tools/built.generated';
import { loc, t } from '@/lib/tools/locale';
import { search } from '@/lib/tools/search';

/**
 * ⌘K / Ctrl-K anywhere in the bench.
 *
 * The part number is a first-class query: typing `E07` goes straight to the
 * AES tool. That is the whole reason the numbers are functional rather than
 * decorative — they are the shortest unambiguous name a tool has.
 *
 * Only registry metadata is read here, so opening the palette never pulls in
 * a tool's implementation.
 */
export function CommandPalette({ locale }: { locale: string }) {
  const l = loc(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => search(TOOLS, query, l).slice(0, 40), [query, l]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const go = useCallback(
    (slug: string) => {
      close();
      router.push(`/tools/${slug}`);
    },
    [close, router]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((previous) => !previous);
        return;
      }
      // Bare `/` is the fast path, but not while someone is filling a field,
      // and not on the index — that page has its own search box, which is a
      // better target than an overlay covering the list you are reading.
      if (event.key === '/' && !typing && !open) {
        const inPage = document.querySelector<HTMLInputElement>('[data-inst-search]');
        event.preventDefault();
        if (inPage) inPage.focus();
        else setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    item?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  return (
    <div
      className="inst-palette"
      role="dialog"
      aria-modal="true"
      aria-label={t(l, '搜尋工具', 'Search instruments')}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="inst-palette-box">
        <input
          className="inst-palette-input"
          autoFocus
          value={query}
          placeholder={t(l, '輸入名稱、關鍵字或料號(例如 E07)', 'Name, keyword or part number (e.g. E07)')}
          aria-label={t(l, '搜尋工具', 'Search instruments')}
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset the cursor here rather than in an effect on `query`: the
            // keystroke is the event that invalidated it.
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
            else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter' && results[active]) {
              event.preventDefault();
              go(results[active].slug);
            }
          }}
        />
        <div className="inst-palette-list" ref={listRef}>
          {results.length === 0 ? (
            <p className="inst-hint" style={{ padding: '0.75rem 0.85rem' }}>
              {t(l, '沒有符合的工具。', 'Nothing matches.')}
            </p>
          ) : (
            results.map((tool, index) => (
              <button
                key={tool.slug}
                type="button"
                className="inst-palette-item"
                data-active={index === active ? 'true' : undefined}
                onPointerEnter={() => setActive(index)}
                onClick={() => go(tool.slug)}
              >
                <span className="inst-no">
                  <b>{tool.id.slice(0, 1)}</b>
                  {tool.id.slice(1)}
                </span>
                <span style={{ fontSize: '0.875rem' }}>
                  {l === 'en' ? tool.name.en : tool.name.zh}
                  <span className="inst-hint" style={{ marginTop: 0, marginLeft: '0.5rem', display: 'inline' }}>
                    {CATEGORY_BY_ID.get(tool.category)?.name[l]}
                  </span>
                </span>
                {BUILT.has(tool.slug) ? null : (
                  <span className="inst-flag">{t(l, '未完成', 'pending')}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
