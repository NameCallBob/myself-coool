/** Readout formatting. Everything here is pure so the tests can pin it. */

/** Narrow no-break space: a reading never wraps between number and unit. */
const NBSP = '\u202f';

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n}${NBSP}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)}${NBSP}${units[i]}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

export function ms(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${n.toFixed(2)}${NBSP}ms`;
  if (n < 1000) return `${n.toFixed(n < 10 ? 2 : 1)}${NBSP}ms`;
  return `${(n / 1000).toFixed(2)}${NBSP}s`;
}

/** Fixed decimals without exponent notation, for money and rates. */
export function fixed(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** UTF-8 byte length without allocating when the string is plain ASCII. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.codePointAt(i)!;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else {
      n += 4;
      i += 1; // surrogate pair consumed
    }
  }
  return n;
}
