import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgenticLoopSchematic } from '@/components/diagrams/AgenticLoopSchematic';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { alternatesFor, ogFor } from '@/lib/seo';
import { AGENTIC } from '../../../../content/agentic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('ai'),
    description: m('ai'),
    openGraph: ogFor(locale, { title: t('ai'), description: m('ai') }),
    alternates: alternatesFor(locale, '/ai'),
  };
}

export default async function AiPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'nav' });
  const a11y = await getTranslations({ locale, namespace: 'a11y' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      {/* 00 / header — the vibe → agentic narrative */}
      <SectionHeading no="00" label="AGENTIC ENGINEERING" />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">{t('ai')}</h1>
      <div className="mt-10 max-w-[42rem] space-y-6 text-base leading-relaxed md:text-lg">
        {AGENTIC.intro.map((p, i) => (
          <Reveal key={p.en} delay={i * 60}>
            <p>{p[loc]}</p>
          </Reveal>
        ))}
      </div>

      {/* 01 / method — what changes between vibe and agentic */}
      <section
        aria-label={AGENTIC.method.title[loc]}
        className="tick mt-20 border-t border-line-2 pt-16 md:mt-28"
      >
        <Reveal>
          <SectionHeading no="01" label="FROM VIBE TO AGENTIC" />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">
            {AGENTIC.method.title[loc]}
          </h2>
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">
            {AGENTIC.method.note[loc]}
          </p>
        </Reveal>
        <div className="mt-10">
          <div className="hidden grid-cols-[140px_1fr_1fr] gap-8 border-b border-line-2 pb-3 font-mono text-[11px] tracking-[0.12em] text-faint md:grid">
            <p aria-hidden="true" />
            <p>VIBE CODING</p>
            <p className="text-accent">AGENTIC</p>
          </div>
          {AGENTIC.method.rows.map((r, i) => (
            <Reveal key={r.label} delay={i * 40}>
              <div className="grid grid-cols-1 gap-2 border-b border-line-2 py-6 md:grid-cols-[140px_1fr_1fr] md:gap-8">
                <p className="font-mono text-xs tracking-[0.12em]">{r.label}</p>
                <p className="text-sm text-muted">
                  <span className="mr-2 font-mono text-[10px] tracking-[0.1em] text-faint md:hidden">
                    VIBE
                  </span>
                  {r.vibe[loc]}
                </p>
                <p className="text-sm">
                  <span className="mr-2 font-mono text-[10px] tracking-[0.1em] text-accent md:hidden">
                    AGENTIC
                  </span>
                  {r.agentic[loc]}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 02 / the loop */}
      <section aria-label="Loop" className="tick mt-20 border-t border-line-2 pt-16 md:mt-28">
        <Reveal>
          <SectionHeading no="02" label="THE LOOP" />
        </Reveal>
        <figure className="mt-10 rounded-[6px] border border-line-2 bg-surface p-4 md:p-8">
          <AgenticLoopSchematic label={a11y('agenticLoopLabel')} />
          <figcaption className="mt-3 text-center font-mono text-[11px] tracking-[0.06em] text-faint">
            {AGENTIC.loop.caption[loc]}
          </figcaption>
        </figure>
      </section>

      {/* 03–04 / evidence — this site, then the campus production systems */}
      {AGENTIC.cases.map((c) => (
        <section
          key={c.no}
          aria-label={c.title[loc]}
          className="tick mt-20 border-t border-line-2 pt-16 md:mt-28"
        >
          <Reveal>
            <SectionHeading no={c.no} label={c.label} />
            <h2 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">
              {c.title[loc]}
            </h2>
            <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-muted md:text-base">
              {c.prose[loc]}
            </p>
          </Reveal>
          <dl className="mt-10">
            {c.evidence.map((e, i) => (
              <Reveal key={e.ref} delay={i * 30}>
                <div className="grid grid-cols-1 gap-1 border-b border-line-2 py-4 first:border-t md:grid-cols-[260px_1fr] md:gap-8">
                  <dt className="font-mono text-xs leading-6 tracking-[0.06em] text-accent">
                    {e.ref}
                  </dt>
                  <dd className="text-sm text-muted md:text-base">{e.desc[loc]}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>
      ))}

      {/* 05 / boundaries — what agents don't get to do */}
      <section
        aria-label={AGENTIC.boundaries.title[loc]}
        className="tick mt-20 border-t border-line-2 pt-16 md:mt-28"
      >
        <Reveal>
          <SectionHeading no="05" label="BOUNDARIES" />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">
            {AGENTIC.boundaries.title[loc]}
          </h2>
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">
            {AGENTIC.boundaries.note[loc]}
          </p>
        </Reveal>
        <ul className="mt-10 max-w-[42rem] space-y-6">
          {AGENTIC.boundaries.items.map((s, i) => (
            <Reveal key={s.en} delay={i * 40}>
              <li className="flex gap-5 border-l-2 border-accent/40 pl-5">
                <span className="font-mono text-xs leading-7 text-faint">0{i + 1}</span>
                <p className="text-base leading-relaxed md:text-lg">{s[loc]}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>
    </div>
  );
}
