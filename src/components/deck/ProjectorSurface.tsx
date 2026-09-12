'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Projector surface — the screen is fixed, the content moves across it.
 *
 * This is the honest version of the metaphor. A real projection screen does
 * not paginate: it hangs still while the image on it changes. So the fabric,
 * the vignette, the keystone and the beam are all `position: fixed`, and the
 * page scrolls normally underneath — which also means the content stays one
 * ordinary document for crawlers, anchors and Ctrl+F.
 *
 * ScrollTrigger drives four things off that scroll: the lamp brightens as you
 * enter, section blocks resolve as they cross the screen, figures count up,
 * and drawn rules stroke themselves on.
 */

export function ProjectorSurface({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      /* Lamp strike — two stutters before it holds, then the fabric lights. */
      if (!reduce) {
        gsap
          .timeline()
          .fromTo('.pj-beam', { opacity: 0 }, { opacity: 0.4, duration: 0.08 })
          .to('.pj-beam', { opacity: 0.05, duration: 0.06 })
          .to('.pj-beam', { opacity: 1, duration: 0.55, ease: 'expo.out' })
          // The unroll plays on the frame, never on .pj-content: scaling the
          // scroll container makes ScrollTrigger measure every block against a
          // squashed layout, and those positions are never recomputed, so the
          // section reveals silently never fire.
          .fromTo(
            '.pj-screen',
            { scaleY: 0.02, opacity: 0 },
            { scaleY: 1, opacity: 1, duration: 0.8, ease: 'expo.out', transformOrigin: 'top center' },
            '-=0.4'
          )
          .fromTo('.pj-content', { opacity: 0 }, { opacity: 1, duration: 0.5 }, '-=0.45')
          // Layout is final only once the frame has finished moving.
          .add(() => ScrollTrigger.refresh());
      } else {
        gsap.set(['.pj-beam', '.pj-screen', '.pj-content'], { opacity: 1, scaleY: 1 });
      }

      /* Dust in the light. */
      if (!reduce) {
        gsap.utils.toArray<SVGCircleElement>('.pj-mote').forEach((m, i) => {
          gsap.to(m, {
            y: 'random(-70, 70)',
            x: 'random(-110, 110)',
            opacity: 'random(0.1, 0.45)',
            duration: gsap.utils.random(8, 17),
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: i * 0.2,
          });
        });
      }

      if (reduce) {
        gsap.set('[data-pj="block"], [data-pj="line"]', { opacity: 1, y: 0 });
        document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
          el.textContent = el.dataset.count ?? '';
        });
        return;
      }

      /* Blocks resolve as they cross onto the lit part of the screen. */
      gsap.utils.toArray<HTMLElement>('[data-pj="block"]').forEach((el) => {
        // Opacity and position only. Animating `filter: blur()` promotes the
        // block to its own compositing layer, which renders as a flat grey
        // panel behind the text in Chromium, and costs a repaint per frame.
        gsap.fromTo(
          el,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          }
        );
      });

      /* Rules stroke themselves on. */
      gsap.utils.toArray<HTMLElement>('[data-pj="line"]').forEach((el) => {
        gsap.fromTo(
          el,
          { scaleX: 0 },
          {
            scaleX: 1,
            transformOrigin: 'left center',
            duration: 0.9,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          }
        );
      });

      /* Figures count up — thousands separators preserved. */
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const raw = el.dataset.count ?? '';
        const target = Number(raw.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(target)) {
          el.textContent = raw;
          return;
        }
        const suffix = raw.replace(/[0-9.,]/g, '');
        const decimals = (raw.split('.')[1] ?? '').replace(/\D/g, '').length;
        // Starts from zero only once the trigger fires, so the painted value
        // is never blanked before the reader reaches it.
        const obj = { n: 0 };
        gsap.to(obj, {
          n: target,
          duration: 1.5,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
            onEnter: () => {
              el.textContent = '0';
            },
          },
          onUpdate: () => {
            el.textContent =
              obj.n.toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              }) + suffix;
          },
        });
      });

      /* The lamp breathes very slightly with scroll velocity. */
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => {
          const v = Math.min(Math.abs(self.getVelocity()) / 2600, 1);
          gsap.to('.pj-beam', { opacity: 1 - v * 0.35, duration: 0.4, overwrite: 'auto' });
        },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  const motes = Array.from({ length: 30 }, (_, i) => ({
    cx: (i * 41) % 100,
    cy: (i * 67) % 100,
    r: 0.07 + ((i * 11) % 6) / 45,
  }));

  return (
    <div ref={root} className="pj-room">
      {/* The lamp */}
      <div className="pj-beam" aria-hidden />
      <svg className="pj-motes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {motes.map((m, i) => (
          <circle key={i} className="pj-mote" cx={m.cx} cy={m.cy} r={m.r} fill="rgba(251,240,214,.75)" />
        ))}
      </svg>

      {/* The screen: hangs still, never scrolls */}
      <div className="pj-screen" aria-hidden>
        <span className="pj-screen-fabric" />
        <span className="pj-screen-vignette" />
        <span className="pj-screen-sheen" />
      </div>

      {/* The image on it */}
      <div className="pj-content">{children}</div>

      {/* Lens vignette and glass sheen, cast over the whole image */}
      <div className="pj-glass" aria-hidden />

      {/* Where the projected image runs off the top and bottom edges */}
      <div className="pj-edge pj-edge-top" aria-hidden />
      <div className="pj-edge pj-edge-bottom" aria-hidden />
    </div>
  );
}
