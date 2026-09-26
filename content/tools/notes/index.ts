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
 * What a tool will not do.
 *
 * These were essays about how each tool worked. They are not any more: a tool
 * page is a tool, and the only thing worth putting under it is the boundary —
 * what it refuses, what it approximates, and which tool to use instead. One
 * sentence each.
 *
 * Split one file per drawer so ten batches of work never touch the same file.
 */
export type ToolNote = {
  /** One sentence each. Plain text — rendered as <li>, never as markup. */
  limits: Localized[];
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
