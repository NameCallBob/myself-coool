import { Link } from '@/i18n/navigation';
import type { Tool } from '../../../content/tools/types';
import { CATEGORY_BY_ID } from '../../../content/tools/categories';
import { TOOLS } from '../../../content/tools/registry';
import type { Loc } from '@/lib/tools/locale';
import { t } from '@/lib/tools/locale';

/**
 * A catalogue entry's masthead, and the reason a tool page is a server
 * component: the number, the name, the one-line description and the walk to
 * the neighbouring tools are all in the HTML before any JavaScript runs.
 */
export function ToolHeader({ tool, l }: { tool: Tool; l: Loc }) {
  const category = CATEGORY_BY_ID.get(tool.category);
  const position = TOOLS.findIndex((entry) => entry.slug === tool.slug);
  const previous = TOOLS[position - 1];
  const next = TOOLS[position + 1];

  return (
    <header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/tools" className="inst-no ink-link">
          {t(l, '儀器櫃', 'INSTRUMENTS')}
        </Link>
        <span className="inst-no">/</span>
        <span className="inst-no">{category?.name[l]}</span>
        <span className="inst-no" style={{ marginLeft: 'auto' }}>
          {previous ? (
            <Link href={`/tools/${previous.slug}`} className="ink-link">
              ← {previous.id}
            </Link>
          ) : null}
          {previous && next ? <span style={{ opacity: 0.4 }}>{'  ·  '}</span> : null}
          {next ? (
            <Link href={`/tools/${next.slug}`} className="ink-link">
              {next.id} →
            </Link>
          ) : null}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="inst-no" style={{ fontSize: '13px' }}>
          <b>{tool.id.slice(0, 1)}</b>
          {tool.id.slice(1)}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{tool.name[l]}</h1>
        <span className="flex gap-1.5">
          {tool.sensitive ? (
            <span className="inst-flag" data-kind="sensitive">
              {t(l, '敏感輸入 · 不儲存', 'secret · never stored')}
            </span>
          ) : null}
          {tool.needs?.includes('camera') ? (
            <span className="inst-flag">{t(l, '需要相機', 'camera')}</span>
          ) : null}
        </span>
      </div>

      <p className="mt-3 max-w-[44rem] text-[0.9375rem] leading-relaxed text-muted">
        {tool.blurb[l]}
      </p>

      {tool.sensitive ? (
        <p className="mt-3 max-w-[44rem] text-[0.8125rem] leading-relaxed" style={{ color: 'var(--accent)' }}>
          {t(
            l,
            '這個工具吃的是秘密。它不寫 localStorage、不寫 IndexedDB,離開這一頁欄位就清空;若你要更保守,用完關掉分頁。',
            'This tool takes secrets. It writes nothing to storage and clears its fields when you leave the page.'
          )}
        </p>
      ) : null}
    </header>
  );
}
