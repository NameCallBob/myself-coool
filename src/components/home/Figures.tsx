'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Figure } from '../../../content/figures';

/**
 * The four numbers, counted up when they come into view.
 *
 * The count is not decoration: these figures are the page's claim, and a
 * number that arrives at its value makes you read it rather than skim it.
 * The final value is in the DOM from the first render, so a reader with
 * reduced motion, no JavaScript, or a crawler sees the real figure.
 */
export function Figures({ figures, l }: { figures: Figure[]; l: 'zh' | 'en' }) {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      for (const node of gsap.utils.toArray<HTMLElement>('[data-count]')) {
        const target = Number(node.dataset.count);
        if (!Number.isFinite(target)) continue;
        const counter = { value: 0 };
        gsap.to(counter, {
          value: target,
          duration: 1.1,
          ease: 'expo.out',
          scrollTrigger: { trigger: node, start: 'top 85%', once: true },
          onUpdate: () => {
            node.textContent = String(Math.round(counter.value));
          },
        });
      }
    }, element);

    return () => context.revert();
  }, []);

  return (
    <div className="home-figures" ref={root}>
      {figures.map((figure) => (
        <div key={figure.label.en}>
          <div className="home-figure-value" data-count={figure.value}>
            {figure.value}
          </div>
          <div className="home-figure-label">{figure.label[l]}</div>
          <div className="home-figure-note">{figure.note[l]}</div>
        </div>
      ))}
    </div>
  );
}
