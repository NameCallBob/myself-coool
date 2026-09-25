'use client';

import type { Tool } from '../../../content/tools/types';
import { TOOL_COMPONENTS } from '@/tools/loader.generated';
import { loc, t } from '@/lib/tools/locale';

/**
 * Loads exactly one tool's chunk and nothing else.
 *
 * A tool touches the clipboard, the file system and WebCrypto, so it cannot be
 * prerendered — `ssr: false` in the generated loader keeps it out of the build
 * output, which is also what makes the page HTML small enough to be worth
 * caching for offline use.
 */
export function ToolMount({ tool, locale }: { tool: Tool; locale: string }) {
  const l = loc(locale);
  const Component = TOOL_COMPONENTS[tool.slug];

  if (!Component) {
    return (
      <p className="inst-hint" style={{ marginTop: '2rem' }}>
        {t(
          l,
          '這件工具已經登錄但還沒做完。它會在下一批上線。',
          'This instrument is catalogued but not built yet. It ships in the next batch.'
        )}
      </p>
    );
  }

  return <Component l={l} tool={tool} />;
}
