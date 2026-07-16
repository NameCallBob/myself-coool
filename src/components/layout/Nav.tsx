'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';

const LINKS = [
  { href: '/work', key: 'work' },
  { href: '/architecture', key: 'architecture' },
  { href: '/ai', key: 'ai' },
  { href: '/about', key: 'about' },
] as const;

function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[6px] text-muted transition-colors duration-200 hover:text-fg"
    >
      {mounted && resolvedTheme === 'light' ? (
        <Sun size={16} strokeWidth={1.5} />
      ) : (
        <Moon size={16} strokeWidth={1.5} />
      )}
    </button>
  );
}

export function Nav() {
  const t = useTranslations('nav');
  const a11y = useTranslations('a11y');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const otherLocale = locale === 'zh-TW' ? 'en' : 'zh-TW';

  // Close the mobile overlay whenever the route changes
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line-2 bg-[var(--glass)] backdrop-blur-[16px] backdrop-saturate-[1.4]">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-6"
      >
        <Link
          href="/"
          aria-label={t('home')}
          className="font-mono text-sm tracking-[0.08em] text-fg"
        >
          <span className="text-accent">◆</span> BINBIN
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map(({ href, key }) => {
            const current = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`text-base transition-colors duration-200 ${
                  current
                    ? 'text-fg underline decoration-accent decoration-2 underline-offset-[6px]'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {t(key)}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={pathname}
            locale={otherLocale}
            aria-label={a11y('switchLocale')}
            className="flex h-11 items-center rounded-[6px] px-2 font-mono text-xs tracking-[0.08em] text-muted transition-colors duration-200 hover:text-fg"
          >
            {locale === 'zh-TW' ? 'EN' : '中'}
          </Link>
          <ThemeToggle label={a11y('toggleTheme')} />
          <a
            href="#contact"
            className="hidden h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition-transform duration-200 hover:shadow-[0_0_24px_var(--accent-dim)] active:scale-[0.97] md:flex"
          >
            {t('contact')}
          </a>
          <button
            type="button"
            aria-label={open ? t('menuClose') : t('menuOpen')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center text-muted transition-colors duration-200 hover:text-fg md:hidden"
          >
            {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 bg-[var(--glass)] backdrop-blur-[16px] backdrop-saturate-[1.4] md:hidden">
          <div className="flex flex-col gap-2 px-5 py-8">
            {LINKS.map(({ href, key }, i) => (
              <Link
                key={href}
                href={href}
                className="border-b border-line-1 py-4 text-2xl text-fg"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                {t(key)}
              </Link>
            ))}
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="mt-6 flex h-12 items-center justify-center rounded-full bg-accent text-base font-medium text-accent-ink"
            >
              {t('contact')}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
