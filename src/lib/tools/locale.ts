/**
 * Tool copy lives inside each tool, not in messages/*.json.
 *
 * A hundred tools' worth of strings in the shared message bundle would be
 * downloaded by every page on the site to render any one of them. Keeping the
 * strings in the tool means they ship in that tool's own chunk.
 */
export type Loc = 'zh' | 'en';

export function loc(locale: string): Loc {
  return locale === 'en' ? 'en' : 'zh';
}

/** `t(l, '中文', 'English')` — deliberately terse; it appears a lot. */
export function t(l: Loc, zh: string, en: string): string {
  return l === 'en' ? en : zh;
}
