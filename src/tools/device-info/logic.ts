/**
 * Device and capability reporting, with the arithmetic and the caveats kept
 * out of the component so both can be tested.
 *
 * Almost every number a browser will tell you about the machine has been
 * deliberately blunted for fingerprinting reasons, and the blunting is not
 * documented anywhere the person reading a bug report will look. So each value
 * that is quantised, capped, or outright frozen carries a note saying so —
 * "8 GB" from `deviceMemory` means "8 or more", and reporting it as a fact is
 * how a bug gets closed as not-reproducible on the wrong hardware.
 */

export type Facts = {
  screenWidth: number;
  screenHeight: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  /** `navigator.hardwareConcurrency`, or null when the browser withholds it. */
  cores: number | null;
  /** `navigator.deviceMemory` in GiB, or null. Chromium only. */
  memoryGiB: number | null;
  maxTouchPoints: number;
  languages: string[];
  timeZone: string;
  /** 'srgb' | 'p3' | 'rec2020' | 'unknown' */
  gamut: string;
  colorScheme: string;
  reducedMotion: boolean;
  pointer: string;
  hover: boolean;
  online: boolean;
  cookieEnabled: boolean;
  userAgent: string;
  features: FeatureResult[];
};

export type FeatureResult = { id: string; ok: boolean };

/* ── Arithmetic ───────────────────────────── */

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/**
 * Aspect ratio in lowest terms, with the two ratios nobody writes reduced
 * normalised back: 8:5 is 16:10 and 683:384 is close enough to 16:9 that
 * printing the exact fraction would be noise rather than information.
 */
export function ratioOf(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '—';
  const divisor = gcd(width, height);
  let w = Math.round(width / divisor);
  let h = Math.round(height / divisor);
  if (w === 8 && h === 5) {
    w = 16;
    h = 10;
  }
  // Anything whose reduced form is this ugly is a near-miss on a common ratio.
  if (w > 40 || h > 40) {
    const common: [number, number][] = [
      [16, 9],
      [16, 10],
      [3, 2],
      [4, 3],
      [21, 9],
      [5, 4],
    ];
    const target = width / height;
    for (const [cw, ch] of common) {
      if (Math.abs(cw / ch - target) < 0.02) return `≈${cw}:${ch}`;
    }
  }
  return `${w}:${h}`;
}

/** Logical CSS pixels times the device pixel ratio, rounded to whole pixels. */
export function physicalPixels(width: number, height: number, dpr: number): [number, number] {
  if (!Number.isFinite(dpr) || dpr <= 0) return [Math.round(width), Math.round(height)];
  return [Math.round(width * dpr), Math.round(height * dpr)];
}

export function megapixels(width: number, height: number, dpr: number): number {
  const [w, h] = physicalPixels(width, height, dpr);
  return (w * h) / 1_000_000;
}

export function orientationOf(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  if (width > height) return 'landscape';
  if (width < height) return 'portrait';
  return 'square';
}

/* ── Caveats ──────────────────────────────── */

export type CaveatId =
  | 'dpr-fractional'
  | 'memory-quantised'
  | 'memory-missing'
  | 'cores-missing'
  | 'touch-desktop'
  | 'viewport-vs-screen';

/**
 * Which of the reported values need a footnote, for this particular machine.
 * Returning ids rather than sentences keeps the copy in the component and keeps
 * this function testable.
 */
export function caveatsFor(facts: Facts): CaveatId[] {
  const out: CaveatId[] = [];
  if (Number.isFinite(facts.dpr) && facts.dpr > 0 && !Number.isInteger(facts.dpr)) {
    out.push('dpr-fractional');
  }
  if (facts.memoryGiB === null) out.push('memory-missing');
  else out.push('memory-quantised');
  if (facts.cores === null) out.push('cores-missing');
  if (facts.maxTouchPoints > 0 && facts.pointer === 'fine') out.push('touch-desktop');
  if (
    facts.viewportWidth > 0 &&
    facts.screenWidth > 0 &&
    facts.viewportWidth > facts.screenWidth
  ) {
    out.push('viewport-vs-screen');
  }
  return out;
}

/* ── Feature list ─────────────────────────── */

/**
 * The APIs worth knowing about when a page misbehaves on someone else's
 * machine. Names are the specification's own, so they need no translation.
 */
export const FEATURE_IDS: string[] = [
  'WebAssembly',
  'WebGL',
  'WebGL 2',
  'WebGPU',
  'OffscreenCanvas',
  'Web Worker',
  'SharedArrayBuffer',
  'Service Worker',
  'Cache Storage',
  'IndexedDB',
  'localStorage',
  'Web Crypto',
  'Clipboard write',
  'File System Access',
  'Web Share',
  'Notifications',
  'Geolocation',
  'Media Devices',
  'Speech Synthesis',
  'WebRTC',
  'Payment Request',
  'Web Bluetooth',
  'WebUSB',
  'Gamepad',
  'Vibration',
  'Wake Lock',
  'Intl.Segmenter',
  'Intl.DurationFormat',
  'structuredClone',
  'createImageBitmap',
  'WebCodecs',
  'CSS :has()',
  'CSS container queries',
  'CSS nesting',
  'CSS color-mix()',
  'CSS oklch()',
  'View Transitions',
  'Popover',
  '<dialog>',
];

/**
 * Deliberately absent: which image formats the browser can *decode*. There is
 * no synchronous test for it — `canvas.toDataURL('image/avif')` tests the
 * encoder, and Safari decodes AVIF without being able to encode it, so that
 * check reports a false "no". An honest gap beats a confident wrong answer.
 */

export function supportedCount(features: readonly FeatureResult[]): number {
  return features.filter((entry) => entry.ok).length;
}

/* ── Report ───────────────────────────────── */

/**
 * A block to paste into an issue. English labels regardless of the page
 * language: this text is going to a developer, and a bug report in mixed
 * scripts is harder to search than one in the language the APIs are named in.
 */
export function buildReport(facts: Facts): string {
  const [physicalW, physicalH] = physicalPixels(facts.screenWidth, facts.screenHeight, facts.dpr);
  const missing = facts.features.filter((entry) => !entry.ok).map((entry) => entry.id);
  const lines = [
    `User-Agent: ${facts.userAgent}`,
    `Screen: ${facts.screenWidth}×${facts.screenHeight} CSS px (${ratioOf(facts.screenWidth, facts.screenHeight)}), ${physicalW}×${physicalH} device px`,
    `Available: ${facts.availWidth}×${facts.availHeight} CSS px`,
    `Viewport: ${facts.viewportWidth}×${facts.viewportHeight} CSS px (${orientationOf(facts.viewportWidth, facts.viewportHeight)})`,
    `Device pixel ratio: ${facts.dpr}`,
    `Colour depth: ${facts.colorDepth}-bit, gamut ${facts.gamut}`,
    `Preferred scheme: ${facts.colorScheme}, reduced motion: ${facts.reducedMotion ? 'yes' : 'no'}`,
    `Pointer: ${facts.pointer}, hover: ${facts.hover ? 'yes' : 'no'}, max touch points: ${facts.maxTouchPoints}`,
    `Cores: ${facts.cores ?? 'not reported'}`,
    `Memory: ${facts.memoryGiB === null ? 'not reported' : `${facts.memoryGiB} GiB or more (quantised)`}`,
    `Languages: ${facts.languages.join(', ') || 'not reported'}`,
    `Time zone: ${facts.timeZone || 'not reported'}`,
    `Online: ${facts.online ? 'yes' : 'no'}, cookies enabled: ${facts.cookieEnabled ? 'yes' : 'no'}`,
    `Unsupported of ${facts.features.length} checked: ${missing.length === 0 ? 'none' : missing.join(', ')}`,
  ];
  return lines.join('\n');
}
