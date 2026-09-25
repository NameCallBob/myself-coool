import type { Localized } from '../types';
import { TEXT_NOTES } from './text';
import { ENCODE_NOTES } from './encode';
import { DATA_NOTES } from './data';
import { DEV_NOTES } from './dev';
import { CRYPTO_NOTES } from './crypto';
import { TIME_NOTES } from './time';
import { CALC_NOTES } from './calc';
import { DESIGN_NOTES } from './design';
import { MEDIA_NOTES } from './media';
import { NET_NOTES } from './net';

/**
 * The "how it works" prose under a tool.
 *
 * Only tools marked `indexable` need an entry: this is the substance that
 * makes a tool page worth putting in front of a search engine, and a page
 * without it stays out of the index (plan §3). Split one file per drawer so
 * ten batches of work never touch the same file.
 *
 * Paragraphs are written in Chinese; `en` carries a shorter summary because
 * the long-form voice on this site is zh-TW (plan §3).
 */
export type ToolNote = {
  /** Body paragraphs. Plain text — rendered as <p>, never as markup. */
  body: Localized[];
  /** Limits, caveats, and what this tool will not do. */
  limits?: Localized[];
};

export const TOOL_NOTES: Record<string, ToolNote> = {
  ...TEXT_NOTES,
  ...ENCODE_NOTES,
  ...DATA_NOTES,
  ...DEV_NOTES,
  ...CRYPTO_NOTES,
  ...TIME_NOTES,
  ...CALC_NOTES,
  ...DESIGN_NOTES,
  ...MEDIA_NOTES,
  ...NET_NOTES,
};

export function noteFor(slug: string): ToolNote | undefined {
  return TOOL_NOTES[slug];
}
