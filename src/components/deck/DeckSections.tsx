'use client';

import { ProjectorSurface } from './ProjectorSurface';
import { Avatar } from '@/components/ui/Avatar';
import { ArtWall } from '@/components/ui/ArtWall';
import type { DeckData } from './DeckSlides';

/**
 * The projected image: one dense, continuous composition.
 *
 * Not slides. A slide holds one idea and a lot of air, which shows off
 * neither the work nor the layout. This is a spread — a wide measure with a
 * marginal column, figures set large, a rule drawn under each heading — so
 * that a reader who scrolls three screens has already seen the scale of the
 * work, the systems, the path and the range.
 */

function Section({
  n,
  kicker,
  title,
  margin,
  children,
}: {
  n: string;
  kicker: string;
  title?: string;
  margin?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section data-pj="block" className="mt-24 md:mt-36">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[7rem_1fr]">
        <p className="pj-kicker pt-1">
          {n} <span className="ml-2">{kicker}</span>
        </p>
        <div>
          <span data-pj="line" className="pj-rule block max-w-[9rem]" />
          {title && <h2 className="pj-h-sm mt-5">{title}</h2>}
        </div>
      </div>
      <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-[7rem_1fr]">
        <aside className="pj-margin order-2 md:order-1">{margin}</aside>
        <div className="order-1 md:order-2">{children}</div>
      </div>
    </section>
  );
}

export function DeckSections({ data }: { data: DeckData }) {
  const { s } = data;

  return (
    <ProjectorSurface>
      {/* ── Masthead ─────────────────────────────────────── */}
      <header data-pj="block">
        <p className="pj-kicker">{s.coverKicker}</p>
        <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-end md:gap-12">
          <Avatar title={s.avatarAlt} size={132} className="shrink-0 text-[var(--ink)]" />
          <div>
            <h1 className="pj-h">{data.name}</h1>
            <p className="mt-4 max-w-[26ch] font-serif text-[clamp(1.1rem,2.4vw,1.8rem)] leading-tight font-medium">
              {data.stance}
            </p>
          </div>
        </div>

        <span data-pj="line" className="pj-rule mt-10 block" />

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {data.live.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="group">
              <p className="font-mono text-[13px] break-all underline decoration-[var(--accent)] decoration-2 underline-offset-4">
                {l.label}
              </p>
              <p className="pj-margin mt-1">{l.since}</p>
            </a>
          ))}
        </div>
        <p className="pj-kicker mt-8">{data.role}</p>
      </header>

      {/* ── 01 Scale ─────────────────────────────────────── */}
      <Section n="01" kicker={s.evidenceKicker} title={s.evidenceTitle} margin={s.evidenceNote}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
          {data.facts.map((f) => (
            <div key={f.label}>
              {/* The real figure is the text node: a crawler, a reader with
                  JS off, and a copy-paste all get 728, not 0. The counter
                  rewrites it at runtime. */}
              <p className="pj-figure" data-count={f.value}>
                {f.value}
              </p>
              <span data-pj="line" className="pj-hair mt-3 block" />
              <p className="mt-3 text-sm font-medium">{f.label}</p>
              <p className="pj-margin mt-1">{f.note}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 02 Systems ───────────────────────────────────── */}
      <Section n="02" kicker={s.systemsKicker} title={s.systemsTitle} margin={s.systemsMargin}>
        <ul>
          {data.projects.map((pr) => (
            <li
              key={pr.href}
              className="grid gap-2 border-t border-[rgba(21,18,14,.14)] py-6 last:border-b md:grid-cols-[1fr_13rem] md:gap-10"
            >
              <div>
                <a href={pr.href} className="pj-h-sm hover:text-[var(--accent)]">
                  {pr.title}
                </a>
                <p className="pj-body mt-2 max-w-[62ch] text-[0.92rem]">{pr.note}</p>
              </div>
              <div className="pj-margin md:text-right">
                <p>{pr.stack}</p>
                <p className="mt-1">{pr.scope}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── 03 Experience ────────────────────────────────── */}
      <Section n="03" kicker={s.experienceKicker} title={s.experienceTitle} margin={s.experienceMargin}>
        <div className="space-y-8">
          {data.experience.map((e) => (
            <div key={e.period + e.role} className="grid gap-1 md:grid-cols-[11rem_1fr] md:gap-8">
              <p className="pj-margin">{e.period}</p>
              <div>
                <h3 className="pj-h-sm text-[clamp(1rem,1.7vw,1.25rem)]">
                  {e.role}
                  <span className="pj-body ml-2 font-sans text-[0.9rem]">— {e.org}</span>
                </h3>
                <p className="pj-body mt-1.5 max-w-[62ch] text-[0.88rem]">{e.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 04 Path ──────────────────────────────────────── */}
      <Section n="04" kicker={s.pathKicker} title={s.pathTitle} margin={s.pathMargin}>
        <ol className="grid gap-8 md:grid-cols-5 md:gap-5">
          {data.timeline.map((t) => (
            <li key={t.year + t.title} className="relative md:pt-6">
              <span
                data-pj="line"
                aria-hidden
                className="absolute top-0 left-0 hidden h-px w-full bg-[rgba(21,18,14,.2)] md:block"
              />
              <span
                aria-hidden
                className="absolute top-0 left-0 hidden h-[7px] w-[7px] -translate-y-[3px] rounded-full bg-[var(--accent)] md:block"
              />
              <p className="pj-margin">{t.year}</p>
              <p className="pj-h-sm mt-2 text-[clamp(1rem,1.6vw,1.2rem)]">{t.title}</p>
              <p className="pj-body mt-2 text-[0.82rem] leading-relaxed">{t.note}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── 04 Range ─────────────────────────────────────── */}
      <Section n="05" kicker={s.rangeKicker} title={s.rangeTitle} margin={s.rangeMargin}>
        <div className="grid gap-8 md:grid-cols-2">
          {data.range.map((r) => (
            <div
              key={r.heading}
              className="border-l-2 pl-5"
              style={{ borderColor: r.lead ? 'var(--accent)' : 'rgba(21,18,14,.18)' }}
            >
              <h3 className="pj-h-sm text-[clamp(1rem,1.7vw,1.3rem)]">
                {r.heading}
                {r.lead && <span className="pj-chip ml-3 align-middle">{s.rangeLeadTag}</span>}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {r.items.split(' · ').map((item) => (
                  <li key={item} className="pj-chip">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 05 The wall ──────────────────────────────────── */}
      <Section n="06" kicker={s.wallKicker} title={s.wallTitle} margin={s.wallMargin}>
        <ArtWall art={data.art} captions={data.captions} count={9} note={s.wallNote} />
      </Section>

      {/* ── 06 Principles ────────────────────────────────── */}
      <Section n="07" kicker={s.principlesKicker} margin={s.principlesMargin}>
        <ul className="space-y-12">
          {data.principles.map((p) => (
            <li key={p}>
              <span data-pj="line" className="pj-rule mb-4 block max-w-[3rem]" />
              <p className="font-serif text-[clamp(1.35rem,3.4vw,2.4rem)] leading-tight font-medium">
                {p}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── 07 Contact ───────────────────────────────────── */}
      <Section n="08" kicker={s.contactKicker} title={s.contactTitle} margin={s.contactNote}>
        <dl className="space-y-3 font-mono text-sm">
          <div className="flex gap-8">
            <dt className="w-[7ch] tracking-[0.12em] text-[var(--ink-faint)]">EMAIL</dt>
            <dd>
              <a
                href={`mailto:${data.email}`}
                className="break-all text-[var(--accent)] underline underline-offset-4"
              >
                {data.email}
              </a>
            </dd>
          </div>
          <div className="flex gap-8">
            <dt className="w-[7ch] tracking-[0.12em] text-[var(--ink-faint)]">GITHUB</dt>
            <dd>
              <a
                href={data.github}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline underline-offset-4"
              >
                {data.github.replace('https://', '')}
              </a>
            </dd>
          </div>
        </dl>
      </Section>
    </ProjectorSurface>
  );
}
