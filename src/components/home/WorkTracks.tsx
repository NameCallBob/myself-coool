'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Draws each row's slice of the shared axis as it scrolls into view.
 *
 * The bars are positioned by CSS custom properties rendered on the server, so
 * the layout is correct before this runs; all the animation does is scale them
 * in from their own left edge. Nothing here decides where a bar goes.
 */
export function WorkTracks({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.fromTo(
        '.span-track',
        { '--draw': 0 },
        {
          '--draw': 1,
          duration: 0.8,
          ease: 'expo.out',
          stagger: 0.04,
          scrollTrigger: { trigger: element, start: 'top 80%', once: true },
        }
      );
    }, element);

    return () => context.revert();
  }, []);

  return (
    <div className="home-work" ref={root}>
      {children}
    </div>
  );
}
