import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ToolHeader } from '@/components/tools/ToolHeader';
import { ToolMount } from '@/components/tools/ToolMount';
import { alternatesFor, ogFor, robotsFor } from '@/lib/seo';
import { routing } from '@/i18n/routing';
import { loc } from '@/lib/tools/locale';
import { TOOLS, findTool } from '../../../../../content/tools/registry';
import { noteFor } from '../../../../../content/tools/notes';

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Every catalogued slug gets a page, built or not — the URL is the contract. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    TOOLS.map((tool) => ({ locale, slug: tool.slug }))
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const tool = findTool(slug);
  if (!tool) return {};
  const l = loc(locale);
  const path = `/tools/${slug}`;

  return {
    title: tool.name[l],
    description: tool.blurb[l],
    openGraph: ogFor(locale, { title: tool.name[l], description: tool.blurb[l], path }),
    alternates: alternatesFor(locale, path),
    robots: robotsFor(path),
  };
}

export default async function ToolPage({ params }: Props) {
  const { locale, slug } = await params;
  const tool = findTool(slug);
  if (!tool) notFound();
  setRequestLocale(locale);

  const l = loc(locale);
  const note = noteFor(slug);

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <ToolHeader tool={tool} l={l} />

      <div className="mt-10">
        <ToolMount tool={tool} locale={locale} />
      </div>

      {note?.limits.length ? (
        <section className="mt-16 max-w-[44rem] border-t border-line-2 pt-8">
          <h2 className="inst-no">{l === 'en' ? 'WHAT IT WILL NOT DO' : '這個工具不做什麼'}</h2>
          <ul className="mt-4 space-y-2 text-[0.875rem] leading-relaxed text-muted">
            {note.limits.map((limit) => (
              <li key={limit.en} className="flex gap-2">
                <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                  —
                </span>
                <span>{limit[l]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  );
}
