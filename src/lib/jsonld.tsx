import { CONTACT_EMAIL, GITHUB_URL, SITE_NAME, SITE_URL } from '../../content/site';
import type { Project } from '../../content/projects';

/**
 * JSON-LD — derived from the same content modules as the pages
 * (single source of truth; never hand-written twice).
 */

const PERSON = {
  '@type': 'Person',
  '@id': `${SITE_URL}/#person`,
  name: SITE_NAME,
  url: SITE_URL,
  email: `mailto:${CONTACT_EMAIL}`,
  jobTitle: 'Full-Stack Developer',
  sameAs: [GITHUB_URL],
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
            inLanguage: locale === 'zh-TW' ? 'zh-Hant-TW' : 'en',
            publisher: { '@id': `${SITE_URL}/#person` },
          },
        ],
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
            inLanguage: locale === 'zh-TW' ? 'zh-Hant-TW' : 'en',
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
