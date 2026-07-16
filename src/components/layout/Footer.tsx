import { useTranslations } from 'next-intl';
import { CONTACT_EMAIL, GITHUB_URL } from '../../../content/site';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="relative z-10 border-t border-line-2">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-sm text-muted">{t('statement')}</p>
        <div className="flex items-center gap-6 font-mono text-xs tracking-[0.08em] text-muted">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="transition-colors duration-200 hover:text-fg"
          >
            {CONTACT_EMAIL.toUpperCase()}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200 hover:text-fg"
          >
            GITHUB ↗
          </a>
          <span className="text-faint">© {new Date().getFullYear()} BINBIN</span>
        </div>
      </div>
    </footer>
  );
}
