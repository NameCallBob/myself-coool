import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '../../content/site';
import { PROJECTS } from '../../content/projects';
import { findTool } from '../../content/tools/registry';
import { noteFor } from '../../content/tools/notes';
import { BUILT } from '@/tools/built.generated';
import { routing } from '@/i18n/routing';

/** Shared social preview image (metadataBase resolves it to an absolute URL). */
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'binbin — Full-Stack Developer · System Design · AI Integration',
};

/**
 * Pages held back from the index until they carry real content.
 *
 * A thin page still in the sitemap drags down how a small site is assessed
 * as a whole, so `sitemap.ts` and `generateMetadata` read the same rule here
 * rather than each keeping its own list. Remove a path from this set the
 * moment its content ships.
 */
export function isIndexable(path: string): boolean {
  const slug = path.startsWith('/work/') ? path.slice('/work/'.length) : null;
  if (slug) return Boolean(PROJECTS.find((p) => p.slug === slug)?.caseStudy);

  // The bench: the index earns a place, and so does a tool that exists and
  // carries its own prose. A hundred thin near-identical pages would read as a
  // doorway set and drag the whole domain down with them, so the rest stay
  // crawlable but unindexed (docs/phase-10-tools-plan.md §3).
  //
  // All three conditions are checked, not just the registry flag: `indexable`
  // is an intention, and a page is only worth indexing once the intention has
  // actually been met by a built tool with something written under it.
  if (path === '/tools/settings') return false;
  if (path.startsWith('/tools/')) {
    const toolSlug = path.slice('/tools/'.length);
    const tool = findTool(toolSlug);
    return Boolean(tool?.indexable && BUILT.has(toolSlug) && noteFor(toolSlug));
  }

  return true;
}

/** `robots` metadata for a path — crawlable, but kept out of the index. */
export function robotsFor(path: string): Metadata['robots'] {
  return isIndexable(path) ? undefined : { index: false, follow: true };
}

/**
 * Complete openGraph object for a page. Next.js metadata merging replaces
 * the parent's `openGraph` wholesale, so every page must re-declare
 * type/siteName/locale/images — this helper keeps that in one place.
 */
export function ogFor(
  locale: string,
  { title, description, path = '' }: { title: string; description: string; path?: string }
) {
  return {
    type: 'website' as const,
    siteName: SITE_NAME,
    locale: ogLocale(locale),
    url: `${SITE_URL}/${locale}${path}`,
    title,
    description,
    images: [OG_IMAGE],
  };
}

/**
 * hreflang / canonical helper — every page declares its zh-TW/en pair
 * plus x-default (→ zh-TW), per Google multilingual guidelines.
 */
export function alternatesFor(locale: string, path: string) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
  ) as Record<string, string>;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}${path}`;

  return {
    canonical: `${SITE_URL}/${locale}${path}`,
    languages,
  };
}

export function ogLocale(locale: string) {
  return locale === 'zh-TW' ? 'zh_TW' : 'en_US';
}
