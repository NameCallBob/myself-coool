import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroSchematic } from '@/components/diagrams/HeroSchematic';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { alternatesFor } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('architecture'),
    description: m('architecture'),
    alternates: alternatesFor(locale, '/architecture'),
  };
}

export default async function ArchitecturePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'nav' });
  const common = await getTranslations({ locale, namespace: 'common' });
  const a11y = await getTranslations({ locale, namespace: 'a11y' });

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no="00" label="SYSTEM ARCHITECTURE" />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
        {t('architecture')}
      </h1>
      {/* 互動版(pan/zoom/節點詳情)開發中;先展示全景示意 */}
      <div className="mt-16 rounded-[6px] border border-line-2 bg-base p-6 md:p-10">
        <HeroSchematic label={a11y('schematicLabel')} />
      </div>
      <p className="mt-10 max-w-[46ch] font-mono text-sm leading-relaxed text-muted">
        {common('underConstruction')}
      </p>
    </div>
  );
}
