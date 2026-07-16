'use client';

import { useEffect, useRef } from 'react';

/**
 * Live System Schematic — the hero's centerpiece.
 * Draws binbin's real microservices topology as a blueprint diagram;
 * amber pulses travel real request paths (client → nginx → service → db).
 *
 * Rules (Phase 5): nodes never float; pulses pause off-screen and in
 * hidden tabs; reduced-motion renders the static diagram only.
 */

const SERVICES = [
  'AUTH',
  'MEMBER',
  'PRODUCT',
  'ORDER',
  'INVENTORY',
  'NOTIFY',
  'ANALYSIS',
  'MEDIA',
] as const;

// Service node x-centers on the 960-wide canvas
const CX = [102, 210, 318, 426, 534, 642, 750, 858];

// Request routes the pulses travel (orthogonal blueprint routing)
const ROUTES = [
  'M390 52 V80 H480 V200 H426 V310 H370 V340', // WEB → NGINX → ORDER → MYSQL
  'M570 52 V80 H480 V200 H102 V310 H590 V340', // APP → NGINX → AUTH → REDIS
  'M390 52 V80 H480 V200 H642 V270', //           WEB → NGINX → NOTIFY
  'M570 52 V80 H480 V200 H318 V310 H370 V340', // APP → NGINX → PRODUCT → MYSQL
  'M480 150 V200 H750 V310 H590 V340', //         NGINX → ANALYSIS → REDIS
];

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function Node({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill="var(--bg-raised)"
        stroke="var(--border-2)"
      />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--fg-muted)"
        style={{ font: '500 11px var(--font-jetbrains)', letterSpacing: '0.06em' }}
      >
        {label}
      </text>
    </g>
  );
}

export function HeroSchematic({ label }: { label: string }) {
  const rootRef = useRef<SVGSVGElement>(null);
  const routeRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let inView = true;
    let pageVisible = !document.hidden;

    type Pulse = { route: SVGPathElement; len: number; start: number; dur: number };
    const pulses: (Pulse | null)[] = [null, null];
    let nextSpawn = performance.now() + 500;

    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
      },
      { threshold: 0.05 }
    );
    if (rootRef.current) io.observe(rootRef.current);

    const onVisibility = () => {
      pageVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!inView || !pageVisible) return;

      if (now >= nextSpawn) {
        const slot = pulses.findIndex((p) => p === null);
        if (slot !== -1) {
          const candidates = routeRefs.current.filter(Boolean) as SVGPathElement[];
          const route = candidates[Math.floor(Math.random() * candidates.length)];
          if (route) {
            pulses[slot] = {
              route,
              len: route.getTotalLength(),
              start: now,
              dur: 2000 + Math.random() * 600,
            };
          }
        }
        nextSpawn = now + 1400 + Math.random() * 1800;
      }

      pulses.forEach((p, i) => {
        const dot = dotRefs.current[i];
        if (!dot) return;
        if (!p) {
          dot.setAttribute('opacity', '0');
          return;
        }
        const t = (now - p.start) / p.dur;
        if (t >= 1) {
          pulses[i] = null;
          dot.setAttribute('opacity', '0');
          return;
        }
        const pt = p.route.getPointAtLength(easeInOut(t) * p.len);
        dot.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
        const fade = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
        dot.setAttribute('opacity', fade.toFixed(2));
      });
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const layerLabel = {
    font: '400 9px var(--font-jetbrains)',
    letterSpacing: '0.12em',
  } as const;

  return (
    <svg
      ref={rootRef}
      viewBox="0 0 960 440"
      role="img"
      aria-label={label}
      className="h-auto w-full"
    >
      {/* Structural wiring */}
      <path
        d={[
          'M390 52 V80 M570 52 V80 M390 80 H570 M480 80 V110',
          'M480 150 V200 M102 200 H858',
          ...CX.map((c) => `M${c} 200 V230`),
          ...CX.map((c) => `M${c} 270 V310`),
          'M102 310 H858 M370 310 V340 M590 310 V340',
        ].join(' ')}
        fill="none"
        stroke="var(--border-3)"
        strokeWidth="1"
      />

      {/* Invisible pulse routes (measured at runtime) */}
      {ROUTES.map((d, i) => (
        <path
          key={d}
          ref={(el) => {
            routeRefs.current[i] = el;
          }}
          d={d}
          fill="none"
          stroke="none"
        />
      ))}

      {/* Layer annotations */}
      <text x="8" y="38" fill="var(--fg-faint)" style={layerLabel}>
        EDGE
      </text>
      <text x="8" y="133" fill="var(--fg-faint)" style={layerLabel}>
        GATEWAY
      </text>
      <text x="8" y="363" fill="var(--fg-faint)" style={layerLabel}>
        DATA
      </text>

      {/* Nodes */}
      <Node x={330} y={16} w={120} h={36} label="WEB" />
      <Node x={510} y={16} w={120} h={36} label="APP" />
      <Node x={400} y={110} w={160} h={40} label="NGINX" />
      {SERVICES.map((s, i) => (
        <Node key={s} x={CX[i] - 48} y={230} w={96} h={40} label={s} />
      ))}
      <Node x={300} y={340} w={140} h={40} label="MYSQL" />
      <Node x={520} y={340} w={140} h={40} label="REDIS" />

      {/* Honest hint that the platform is larger than the diagram */}
      <text
        x="480"
        y="424"
        textAnchor="middle"
        fill="var(--fg-faint)"
        style={{ font: '400 10px var(--font-jetbrains)', letterSpacing: '0.1em' }}
      >
        + SUBSCRIPTION · INTERACTION · APPROVAL · LOGGING · …
      </text>

      {/* Pulse dots (two slots, driven by rAF) */}
      {[0, 1].map((slot) => (
        <g
          key={slot}
          ref={(el) => {
            dotRefs.current[slot] = el;
          }}
          opacity="0"
          aria-hidden
        >
          <circle r="7" fill="var(--accent)" opacity="0.3" />
          <circle r="3" fill="var(--accent)" />
        </g>
      ))}
    </svg>
  );
}
