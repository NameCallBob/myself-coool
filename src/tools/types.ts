import type { Tool } from '../../content/tools/types';
import type { Loc } from '@/lib/tools/locale';

/**
 * The contract every tool implements: one default-exported client component
 * taking the active locale and its own registry entry. Nothing else is passed
 * in, so a tool can never depend on where it was rendered from.
 */
export type ToolProps = {
  l: Loc;
  tool: Tool;
};
