import { CONTACT_EMAIL, GITHUB_URL, SITE_NAME, SITE_URL } from '../../content/site';
import { CONTENT_DATES } from '../../content/dates';
import type { Project } from '../../content/projects';

/**
 * JSON-LD — derived from the same content modules as the pages
 * (single source of truth; never hand-written twice).
 */

function inLanguage(locale: string) {
  return locale === 'zh-TW' ? 'zh-Hant-TW' : 'en';
}

const PERSON = {
  '@type': 'Person',
  '@id': `${SITE_URL}/#person`,
  name: SITE_NAME,
  url: SITE_URL,
  email: `mailto:${CONTACT_EMAIL}`,
  jobTitle: 'Full-Stack Developer',
  sameAs: [GITHUB_URL],
  worksFor: { '@type': 'Organization', name: 'Manience Inc.' },
  alumniOf: {
    '@type': 'CollegeOrUniversity',
    name: 'National Kaohsiung University of Science and Technology',
    department: { '@type': 'Organization', name: 'Department of Intelligent Commerce' },
  },
  knowsAbout: [
    'Django',
    'Django REST Framework',
    'MySQL',
    'Redis',
    'System Design',
    'React',
    'Flutter',
    'AI Integration',
  ],
};

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SiteJsonLd({ locale }: { locale: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          PERSON,
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            inLanguage: inLanguage(locale),
            publisher: { '@id': `${SITE_URL}/#person` },
          },
        ],
      }}
    />
  );
}

/** /about is the canonical profile page for the Person entity. */
export function ProfileJsonLd({ locale }: { locale: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        '@id': `${SITE_URL}/${locale}/about#profile`,
        url: `${SITE_URL}/${locale}/about`,
        inLanguage: inLanguage(locale),
        mainEntity: { '@id': `${SITE_URL}/#person` },
      }}
    />
  );
}

export function CaseStudyJsonLd({
  project,
  locale,
}: {
  project: Project;
  locale: string;
}) {
  const loc = locale === 'zh-TW' ? 'zh' : 'en';
  const url = `${SITE_URL}/${locale}/work/${project.slug}`;
  const dates = CONTENT_DATES[project.slug];
  // Article rich results want a real image; fall back to the shared OG card
  // only when a case study has neither screenshots nor diagrams.
  const image = project.screenshots?.[0]?.src ?? project.diagrams?.[0]?.src ?? '/og.png';

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            headline: project.title[loc],
            description: project.oneLiner[loc],
            url,
            image: `${SITE_URL}${image}`,
            datePublished: dates.published,
            dateModified: dates.updated,
            inLanguage: inLanguage(locale),
            author: { '@id': `${SITE_URL}/#person` },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/${locale}` },
              { '@type': 'ListItem', position: 2, name: 'Work', item: `${SITE_URL}/${locale}/work` },
              { '@type': 'ListItem', position: 3, name: project.title[loc], item: url },
            ],
          },
        ],
      }}
    />
  );
}
