import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DeckSections } from '@/components/deck/DeckSections';
import type { DeckData } from '@/components/deck/DeckSlides';
import { CONTACT_EMAIL, GITHUB_URL, PHILOSOPHY } from '../../../content/site';
import { PROJECTS } from '../../../content/projects';
import { EXPERIENCE } from '../../../content/experience';
import { ART_PLATES } from '../../../content/art-plates';
import { CAPTIONS } from '../../../content/captions';

type Props = { params: Promise<{ locale: string }> };

/**
 * Home — the projected composition.
 *
 * The front door carries the design, because it is the one page a recruiter is
 * guaranteed to open. Everything on it is already published and verified
 * elsewhere in content/; nothing is asserted here for the first time.
 */
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'deck' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';
  const p = locale === 'zh-TW' ? '/zh-TW' : '/en';

  const data: DeckData = {
    name: t('name'),
    stance: t('stance'),
    role: t('role'),
    email: CONTACT_EMAIL,
    github: GITHUB_URL,
    live: [
      { label: 'manience.com', href: 'https://manience.com', since: t('liveStorefront') },
      { label: 'aaic.nkust.edu.tw', href: 'https://aaic.nkust.edu.tw', since: t('liveAlumni') },
      {
        label: 'equipment-borrowing.binbinbob.work',
        href: 'https://equipment-borrowing.binbinbob.work',
        since: t('liveBorrow'),
      },
    ],
    facts: [
      { value: '728', label: t('fact1'), note: t('fact1Note') },
      { value: '30', label: t('fact2'), note: t('fact2Note') },
      { value: '1,181', label: t('fact3'), note: t('fact3Note') },
      { value: '9,138', label: t('fact4'), note: t('fact4Note') },
    ],
    systems: [],
    projects: PROJECTS.filter((x) => x.featured).map((x) => ({
      title: x.title[loc],
      note: x.oneLiner[loc],
      stack: x.stack.join(' · '),
      scope: x.scope[loc],
      href: `${p}/work/${x.slug}`,
    })),
    experience: EXPERIENCE.map((e) => ({
      period: e.period,
      role: e.role[loc],
      org: e.org[loc],
      summary: e.summary[loc],
    })),
    timeline: [
      { year: '2023', title: t('tl1'), note: t('tl1Note') },
      { year: `2023 ${t('onward')}`, title: t('tl2'), note: t('tl2Note') },
      { year: '2024', title: t('tl3'), note: t('tl3Note') },
      { year: '2024', title: t('tl4'), note: t('tl4Note') },
      { year: `2025 ${t('onward')}`, title: t('tl5'), note: t('tl5Note') },
    ],
    range: [
      { heading: t('range1'), items: t('range1Items'), lead: true },
      { heading: t('range2'), items: t('range2Items'), lead: true },
      { heading: t('range3'), items: t('range3Items'), lead: false },
      { heading: t('range4'), items: t('range4Items'), lead: false },
    ],
    principles: PHILOSOPHY.map((x) => x[loc]),
    plates: [],
    art: ART_PLATES,
    captions: CAPTIONS.map((c) => c[loc]),
    s: {
      coverKicker: t('coverKicker'),
      evidenceKicker: t('evidenceKicker'),
      evidenceTitle: t('evidenceTitle'),
      evidenceNote: t('evidenceNote'),
      systemsKicker: t('systemsKicker'),
      systemsTitle: t('systemsTitle'),
      systemsMargin: t('systemsMargin'),
      experienceKicker: t('experienceKicker'),
      experienceTitle: t('experienceTitle'),
      experienceMargin: t('experienceMargin'),
      pathKicker: t('pathKicker'),
      pathTitle: t('pathTitle'),
      pathMargin: t('pathMargin'),
      rangeKicker: t('rangeKicker'),
      rangeTitle: t('rangeTitle'),
      rangeMargin: t('rangeMargin'),
      rangeLeadTag: t('rangeLeadTag'),
      wallKicker: t('wallKicker'),
      wallTitle: t('wallTitle'),
      wallMargin: t('wallMargin'),
      wallNote: t('wallNote'),
      principlesKicker: t('principlesKicker'),
      principlesMargin: t('principlesMargin'),
      avatarAlt: t('avatarAlt'),
      contactKicker: t('contactKicker'),
      contactTitle: t('contactTitle'),
      contactNote: t('contactNote'),
    },
  };

  return <DeckSections data={data} />;
}
