/**
 * Type contract for the instrument registry.
 *
 * Metadata lives apart from implementation on purpose: the index page, the
 * command palette, the sitemap and the service-worker precache list all need
 * a tool's name and number, and none of them should pull in its code to get it.
 */

export type Localized = { zh: string; en: string };

/** Catalogue drawers. The letter is part of every tool's part number. */
export type CategoryId =
  | 'text'
  | 'encode'
  | 'data'
  | 'dev'
  | 'crypto'
  | 'time'
  | 'calc'
  | 'design'
  | 'media'
  | 'net';

/**
 * Browser powers a tool asks for. Declared here so the index can warn before
 * you open something that will prompt for a camera, and so the offline
 * pre-fetch can skip what will not work without hardware.
 */
export type Capability = 'camera' | 'file' | 'clipboard' | 'notify';

/** Chunk budget class. `heavy` tools carry a data table or a large algorithm. */
export type Weight = 'tiny' | 'small' | 'heavy';

export type Tool = {
  /** Functional part number, e.g. `A01`. Typed into the palette to jump. */
  id: string;
  slug: string;
  category: CategoryId;
  name: Localized;
  /** One line. Doubles as the page's meta description. */
  blurb: Localized;
  /** Search terms — Chinese, English and the aliases people actually type. */
  keywords: string[];
  /**
   * Input is a secret (tokens, keys, passwords). Sensitive tools never
   * persist anything and say so on the page. Enforced by `ToolShell`.
   */
  sensitive?: boolean;
  needs?: Capability[];
  weight?: Weight;
  /**
   * Carries enough prose of its own to deserve a place in the index.
   * `sitemap.ts` and `robotsFor` read this — see docs/phase-10-tools-plan.md §3.
   */
  indexable?: boolean;
};

export type Category = {
  id: CategoryId;
  /** Part-number prefix. */
  letter: string;
  name: Localized;
  note: Localized;
};
