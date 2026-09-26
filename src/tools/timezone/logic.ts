/**
 * Time zones, using the only correct source of zone data a browser has:
 * `Intl.DateTimeFormat`. Every offset here is *read back* from the formatter
 * rather than stored in a table, so the answer follows whatever IANA release
 * the engine shipped with instead of a list that rots in this repository.
 *
 * Two directions are needed and only one of them is easy. Instant → wall clock
 * is a format call. Wall clock → instant has no API, so it is solved by
 * iteration: guess with the offset at the naive instant, re-read the offset
 * there, and verify the result formats back to the requested wall clock. That
 * verification is what makes the two hours a year when a wall clock is either
 * missing or duplicated visible instead of silently wrong.
 */

export type CivilTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ZoneParts = CivilTime & {
  /** 0 = Sunday, computed from the civil date rather than the locale. */
  weekday: number;
};

/** Formatter construction is the expensive part; one per zone is enough. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  FORMATTERS.set(timeZone, made);
  return made;
}

export function isValidZone(timeZone: string): boolean {
  if (timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Days since 1970-01-01 for a proleptic Gregorian civil date. Pure integer
 *  arithmetic, so it works for dates outside the Date range the UI offers. */
export function dayNumber(year: number, month: number, day: number): number {
  // Howard Hinnant's days_from_civil.
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 0 = Sunday. 1970-01-01 was a Thursday, hence the +4. */
export function weekdayOf(year: number, month: number, day: number): number {
  const n = dayNumber(year, month, day) + 4;
  return ((n % 7) + 7) % 7;
}

/** Wall clock in `timeZone` at a given instant. */
export function zoneParts(instant: number, timeZone: string): ZoneParts {
  const found: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  const year = Number(found.year);
  const month = Number(found.month);
  const day = Number(found.day);
  // Some engines still emit hour 24 for midnight under h23; normalise it.
  const hour = Number(found.hour) % 24;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(found.minute),
    second: Number(found.second),
    weekday: weekdayOf(year, month, day),
  };
}

/**
 * Offset in minutes east of UTC at an instant: the zone's wall clock read as
 * if it were UTC, minus the instant itself. Sub-minute historical offsets are
 * rounded — every zone has been on a whole minute since 1900-ish.
 */
export function zoneOffset(instant: number, timeZone: string): number {
  const p = zoneParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc - whole) / 60_000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const total = Math.abs(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Cached for the same reason as `FORMATTERS`: constructing the formatter, not
 *  using it, is what costs. This one was being rebuilt for every zone on every
 *  tick of the clock, which was about half the cost of reading the whole table. */
const ABBREV_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** What the engine calls the zone right now — "EST", "GMT+8", "AEDT". */
export function zoneAbbrev(instant: number, timeZone: string): string {
  let made = ABBREV_FORMATTERS.get(timeZone);
  if (!made) {
    made = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
    ABBREV_FORMATTERS.set(timeZone, made);
  }
  const parts = made.formatToParts(new Date(instant));
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * Whether the zone is on its summer offset at this instant.
 *
 * Decided by comparing against the smaller of the January and July offsets of
 * the same year rather than by any flag, because no such flag is exposed. It
 * reads correctly in both hemispheres, and a zone that never shifts has
 * January equal to July, so nothing is ever flagged.
 */
export function isDaylight(instant: number, timeZone: string): boolean {
  const { year } = zoneParts(instant, timeZone);
  const january = zoneOffset(Date.UTC(year, 0, 1, 12), timeZone);
  const july = zoneOffset(Date.UTC(year, 6, 1, 12), timeZone);
  if (january === july) return false;
  return zoneOffset(instant, timeZone) > Math.min(january, july);
}

export type Resolution = {
  instant: number;
  /** `exact` — one instant. `gap` — the wall clock does not exist (clocks
   *  jumped forward); the next real instant is returned. `ambiguous` — it
   *  happens twice (clocks went back); the first is returned. */
  kind: 'exact' | 'gap' | 'ambiguous';
  offset: number;
};

function sameCivil(a: CivilTime, b: CivilTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/**
 * Wall clock in a zone → instant, with the boundary cases named.
 *
 * Both candidate offsets are tried and each is checked by formatting the
 * result back. Zero candidates match means a gap, two means the hour repeats.
 */
export function resolveZoned(wall: CivilTime, timeZone: string): Resolution {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Both offsets in force around this wall clock, taken a day either side so a
  // transition inside the day is always straddled. Guessing from the offset at
  // the naive instant alone finds only one of the two occurrences of a
  // repeated hour, which is exactly the case worth reporting.
  const before = zoneOffset(naive - 86_400_000, timeZone);
  const after = zoneOffset(naive + 86_400_000, timeZone);
  const offsets = before === after ? [before] : [before, after];
  const candidates = offsets.map((offset) => naive - offset * 60_000);
  const valid = candidates.filter((instant) => sameCivil(zoneParts(instant, timeZone), wall));

  if (valid.length === 1) {
    return { instant: valid[0], kind: 'exact', offset: zoneOffset(valid[0], timeZone) };
  }
  if (valid.length > 1) {
    const earliest = Math.min(...valid);
    return { instant: earliest, kind: 'ambiguous', offset: zoneOffset(earliest, timeZone) };
  }
  // A gap: the requested clock time was skipped. The later candidate is the
  // first instant after the jump, which is what a calendar does with it.
  const shifted = Math.max(...candidates);
  return { instant: shifted, kind: 'gap', offset: zoneOffset(shifted, timeZone) };
}

export function zonedTimeToUtc(wall: CivilTime, timeZone: string): number {
  return resolveZoned(wall, timeZone).instant;
}

/** `2026-09-26T14:30` (the value an `<input type="datetime-local">` gives). */
export function parseLocalInput(value: string): CivilTime | null {
  const match = /^(-?\d{4,6})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const wall = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  };
  if (wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.day > 31) return null;
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) return null;
  // Reject 2026-02-31 and friends: the round trip through the day number
  // catches anything the ranges above let past.
  const n = dayNumber(wall.year, wall.month, wall.day);
  const back = civilFromDayNumber(n);
  if (back.month !== wall.month || back.day !== wall.day) return null;
  return wall;
}

/** Inverse of `dayNumber`. */
export function civilFromDayNumber(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

export function formatCivil(p: CivilTime, seconds = false): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = seconds
    ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
    : `${pad(p.hour)}:${pad(p.minute)}`;
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${clock}`;
}

export function formatIsoDate(p: { year: number; month: number; day: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Calendar days between two wall clocks: -1, 0, +1 in practice. */
export function dayShift(reference: CivilTime, other: CivilTime): number {
  return (
    dayNumber(other.year, other.month, other.day) -
    dayNumber(reference.year, reference.month, reference.day)
  );
}

export type ZoneReading = {
  zone: string;
  parts: ZoneParts;
  offset: number;
  abbrev: string;
  daylight: boolean;
  /** Days ahead of (or behind) the reference zone at this instant. */
  shift: number;
};

/** One instant read in several zones, sorted east to west by offset. */
export function readZones(instant: number, zones: readonly string[], reference: string): ZoneReading[] {
  const base = zoneParts(instant, reference);
  return zones
    .filter((zone) => isValidZone(zone))
    .map((zone) => {
      const parts = zoneParts(instant, zone);
      return {
        zone,
        parts,
        offset: zoneOffset(instant, zone),
        abbrev: zoneAbbrev(instant, zone),
        daylight: isDaylight(instant, zone),
        shift: dayShift(base, parts),
      };
    })
    .sort((a, b) => b.offset - a.offset || a.zone.localeCompare(b.zone));
}

/** Coarse step for the transition scan. Small enough that no zone has ever
 *  changed offset twice inside one step, large enough that a whole year costs
 *  under sixty formatter reads. */
const SCAN_STEP_MS = 7 * 86_400_000;

/**
 * The next offset change in a zone after `instant`. Returns null for a zone
 * that does not shift within 400 days.
 *
 * Found by scanning forward a week at a time and bisecting *inside the first
 * week whose end offset differs*, never by bisecting the whole horizon. The
 * reason is that "the offset is still the starting one" is not a monotone
 * predicate over a year: it goes false at the first transition and true again
 * at the second. A bisection over the full range can therefore land in that
 * second true stretch and return the transition a year later — which for
 * Sydney read in March, or Berlin read in October, is exactly what happened.
 * Within one week the predicate really is monotone, so bisection is sound.
 */
export function nextTransition(instant: number, timeZone: string): number | null {
  const start = zoneOffset(instant, timeZone);
  const horizon = instant + 400 * 86_400_000;
  let low = instant;
  let high = -1;
  for (let probe = instant; probe < horizon; ) {
    const next = Math.min(probe + SCAN_STEP_MS, horizon);
    if (zoneOffset(next, timeZone) !== start) {
      low = probe;
      high = next;
      break;
    }
    probe = next;
  }
  if (high === -1) return null;
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (zoneOffset(mid, timeZone) === start) low = mid;
    else high = mid;
  }
  return high;
}

/** Curated shortlist. `allZones()` has the rest; these are the ones people
 *  actually compare against, in geographic order rather than alphabetical. */
export const CITY_ZONES: { zone: string; zh: string; en: string }[] = [
  { zone: 'Pacific/Auckland', zh: '奧克蘭', en: 'Auckland' },
  { zone: 'Australia/Sydney', zh: '雪梨', en: 'Sydney' },
  { zone: 'Australia/Adelaide', zh: '阿德萊德', en: 'Adelaide' },
  { zone: 'Asia/Tokyo', zh: '東京', en: 'Tokyo' },
  { zone: 'Asia/Seoul', zh: '首爾', en: 'Seoul' },
  { zone: 'Asia/Taipei', zh: '臺北', en: 'Taipei' },
  { zone: 'Asia/Shanghai', zh: '上海', en: 'Shanghai' },
  { zone: 'Asia/Hong_Kong', zh: '香港', en: 'Hong Kong' },
  { zone: 'Asia/Manila', zh: '馬尼拉', en: 'Manila' },
  { zone: 'Asia/Singapore', zh: '新加坡', en: 'Singapore' },
  { zone: 'Asia/Bangkok', zh: '曼谷', en: 'Bangkok' },
  { zone: 'Asia/Ho_Chi_Minh', zh: '胡志明市', en: 'Ho Chi Minh City' },
  { zone: 'Asia/Jakarta', zh: '雅加達', en: 'Jakarta' },
  { zone: 'Asia/Kolkata', zh: '加爾各答', en: 'Kolkata' },
  { zone: 'Asia/Karachi', zh: '喀拉蚩', en: 'Karachi' },
  { zone: 'Asia/Dubai', zh: '杜拜', en: 'Dubai' },
  { zone: 'Europe/Moscow', zh: '莫斯科', en: 'Moscow' },
  { zone: 'Europe/Istanbul', zh: '伊斯坦堡', en: 'Istanbul' },
  { zone: 'Africa/Johannesburg', zh: '約翰尼斯堡', en: 'Johannesburg' },
  { zone: 'Europe/Berlin', zh: '柏林', en: 'Berlin' },
  { zone: 'Europe/Paris', zh: '巴黎', en: 'Paris' },
  { zone: 'Europe/Amsterdam', zh: '阿姆斯特丹', en: 'Amsterdam' },
  { zone: 'Europe/Madrid', zh: '馬德里', en: 'Madrid' },
  { zone: 'Europe/London', zh: '倫敦', en: 'London' },
  { zone: 'UTC', zh: 'UTC', en: 'UTC' },
  { zone: 'Africa/Lagos', zh: '拉哥斯', en: 'Lagos' },
  { zone: 'America/Sao_Paulo', zh: '聖保羅', en: 'São Paulo' },
  { zone: 'America/New_York', zh: '紐約', en: 'New York' },
  { zone: 'America/Toronto', zh: '多倫多', en: 'Toronto' },
  { zone: 'America/Chicago', zh: '芝加哥', en: 'Chicago' },
  { zone: 'America/Mexico_City', zh: '墨西哥城', en: 'Mexico City' },
  { zone: 'America/Denver', zh: '丹佛', en: 'Denver' },
  { zone: 'America/Los_Angeles', zh: '洛杉磯', en: 'Los Angeles' },
  { zone: 'America/Vancouver', zh: '溫哥華', en: 'Vancouver' },
  { zone: 'Pacific/Honolulu', zh: '檀香山', en: 'Honolulu' },
];

/** Every zone the engine knows, or the shortlist when it will not say. */
export function allZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  const shortlist = CITY_ZONES.map((entry) => entry.zone);
  if (typeof supported === 'function') {
    try {
      // The engine's list follows CLDR, which still canonicalises a few zones
      // to their old names (Asia/Calcutta, Asia/Saigon) and omits UTC. Merging
      // the shortlist in means the picker offers the names people expect.
      return [...new Set([...supported('timeZone'), ...shortlist])].sort();
    } catch {
      /* fall through to the shortlist */
    }
  }
  return shortlist;
}
