'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

export function LenisProvider() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return null;
}
