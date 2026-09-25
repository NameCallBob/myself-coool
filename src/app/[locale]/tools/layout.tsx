import type { ReactNode } from 'react';
import { CommandPalette } from '@/components/tools/CommandPalette';
import { PwaRuntime } from '@/components/tools/PwaRuntime';
import '@/styles/tools.css';

/**
 * Scope for the bench. The stylesheet and the two always-on clients are
 * mounted here rather than in the root layout so the brand pages carry none
 * of it — /work and /about should not pay for a section they never show.
 */
export default async function ToolsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="inst">
      {children}
      <CommandPalette locale={locale} />
      <PwaRuntime locale={locale} />
    </div>
  );
}
