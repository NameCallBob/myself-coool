import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SectionHeading } from '@/components/ui/SectionHeading';

type Props = { params: Promise<{ locale: string }> };

export default async function AiPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'nav' });
  const common = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no="00" label="AI WORKFLOW" />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">{t('ai')}</h1>
      <p className="mt-10 max-w-[46ch] font-mono text-sm leading-relaxed text-muted">
        {common('underConstruction')}
      </p>
    </div>
  );
}
