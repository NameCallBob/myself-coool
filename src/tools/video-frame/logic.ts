/**
 * Time arithmetic for pulling a still out of a local video.
 *
 * Everything here is about turning a position into a number and back again:
 * the `<video>` element and the canvas grab live in `index.tsx`, because they
 * cannot be tested outside a browser. What *can* go wrong quietly — a timecode
 * that parses as the wrong second, a frame step that drifts, an output size
 * that loses the aspect ratio — is in here with tests on it.
 *
 * On frame rate: HTML video exposes no frame rate. `requestVideoFrameCallback`
 * reports the presentation time of frames as they go past, which is a rate
 * *observation*, not the container's declared rate, and it needs playback to
 * happen at all. So every function taking `fps` takes it as a caller-supplied
 * nominal rate. A one-frame step is 1/fps seconds — exact for a constant frame
 * rate clip whose rate you typed correctly, and an approximation for anything
 * variable-frame-rate (most phone recordings and screen captures).
 */

export type Size = { width: number; height: number };

/** A nominal step of 1/30 s. Right for nothing in particular; wrong by little. */
export const DEFAULT_FPS = 30;

/** Below 1 a step exceeds most clips; above 240 the step is under the seek precision. */
export const FPS_RANGE = { min: 1, max: 240 } as const;

export type FrameFormat = 'png' | 'jpeg';

const MIME: Record<FrameFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

const EXTENSION: Record<FrameFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
};

export const frameMime = (format: FrameFormat): string => MIME[format];

/**
 * Half a millisecond, used to absorb binary floating point before flooring.
 *
 * Without it `frameIndexAt(0.1 * 3, 30)` lands on frame 8 instead of 9,
 * because 0.30000000000000004 * 30 is 9.000000000000002 — that one is fine,
 * but 7 / 30 * 30 is 6.999999999999999, which is not.
 */
const EPSILON = 5e-7;

/** Clamp into `[0, duration]`, treating junk as 0 rather than letting NaN spread. */
export function clampTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(seconds, duration);
}

export function assertFps(fps: number): number {
  if (!Number.isFinite(fps) || fps < FPS_RANGE.min || fps > FPS_RANGE.max) {
    throw new RangeError(
      `fps must be between ${FPS_RANGE.min} and ${FPS_RANGE.max}, got ${String(fps)}`
    );
  }
  return fps;
}

/** A frame rate typed by a person, or `null` if it is not a usable one. */
export function parseFps(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  // 30000/1001 — the way NTSC rates are actually written in container metadata.
  const ratio = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  const value = ratio ? Number(ratio[1]) / Number(ratio[2]) : Number(text);
  if (!Number.isFinite(value)) return null;
  if (value < FPS_RANGE.min || value > FPS_RANGE.max) return null;
  return value;
}

/** Which frame a moment belongs to, counting from 0. */
export function frameIndexAt(seconds: number, fps: number): number {
  assertFps(fps);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds * fps + EPSILON);
}

/** The start of a frame, in seconds. */
export function frameTime(index: number, fps: number): number {
  assertFps(fps);
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.floor(index) / fps;
}

/** Move a position to the start of the frame it falls inside. */
export function snapToFrame(seconds: number, fps: number): number {
  return frameTime(frameIndexAt(seconds, fps), fps);
}

/**
 * Step `frames` frames from `current`, clamped to the clip.
 *
 * Stepping is computed from the frame index rather than by adding 1/fps to the
 * current time, so holding the button down cannot accumulate rounding drift.
 */
export function stepFrames(current: number, frames: number, fps: number, duration: number): number {
  assertFps(fps);
  if (!Number.isFinite(frames)) return clampTime(current, duration);
  const index = frameIndexAt(clampTime(current, duration), fps) + Math.round(frames);
  return clampTime(frameTime(Math.max(0, index), fps), duration);
}

/** How many whole frames a clip holds at this nominal rate. */
export function frameCount(duration: number, fps: number): number {
  assertFps(fps);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(1, Math.round(duration * fps));
}

/**
 * `HH:MM:SS.mmm`, with the hours dropped under an hour unless asked for.
 *
 * Milliseconds are always shown: for this job the difference between 12.033
 * and 12.066 is the difference between two frames.
 */
export function formatTimecode(seconds: number, options?: { hours?: 'auto' | 'always' }): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  // Round to the millisecond first, so 59.9996 becomes 1:00.000, not 59.1000.
  const ms = Math.round(total * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const tail = `${pad(m)}:${pad(s)}.${pad(rest, 3)}`;
  return h > 0 || options?.hours === 'always' ? `${pad(h)}:${tail}` : tail;
}

/**
 * Read a timecode back. Returns `null` for anything ambiguous.
 *
 * Accepts `SS`, `SS.mmm`, `MM:SS(.mmm)`, `HH:MM:SS(.mmm)`, a trailing `s`, and
 * full-width colons (typing `1：02` on a Chinese IME is not a mistake worth
 * punishing). Rejects out-of-range parts: `1:75` is not 135 seconds to
 * everyone, so it is not silently treated as either reading.
 */
export function parseTimecode(input: string): number | null {
  const text = input
    .trim()
    .replace(/[：﹕]/g, ':')
    .replace(/\s+/g, '')
    .replace(/[sS秒]$/, '');
  if (!text) return null;
  if (!/^\d{1,6}(:\d{1,2}){0,2}(\.\d{1,6})?$/.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  const parts = whole.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;

  let seconds = 0;
  if (parts.length === 1) {
    seconds = parts[0];
  } else {
    // Only the leading field may exceed its natural range.
    const tail = parts.slice(1);
    if (tail.some((part) => part > 59)) return null;
    seconds = parts.reduce((sum, part) => sum * 60 + part, 0);
  }
  if (fraction) seconds += Number(`0.${fraction}`);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Output size for a grab, optionally pinned to a longest side.
 *
 * `longestSide` of 0 (or anything non-positive) means "native size". The ratio
 * is preserved and both sides are floored at 1 px, so an extreme letterbox
 * cannot come out zero pixels tall and encode as an empty file.
 */
export function scaleToLongestSide(size: Size, longestSide: number): Size {
  for (const key of ['width', 'height'] as const) {
    if (!Number.isFinite(size[key]) || size[key] <= 0) {
      throw new RangeError(`scaleToLongestSide: ${key} must be finite and positive`);
    }
  }
  const native = {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
  if (!Number.isFinite(longestSide) || longestSide <= 0) return native;
  const longest = Math.max(size.width, size.height);
  const factor = longestSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
  };
}

/**
 * A file name that says which clip and which moment it came from.
 *
 * The source stem is kept — a folder of `frame.png` files is useless — but
 * sanitised down to what every file system accepts. CJK and other non-ASCII
 * letters are kept as they are; only separators and control characters go.
 */
export function frameFileName(
  sourceName: string,
  seconds: number,
  format: FrameFormat,
  frameIndex?: number
): string {
  const base = sourceName.replace(/\.[^./\\]{1,8}$/, '');
  // Control characters are dropped by code point rather than with a regex
  // class: a literal control range inside a pattern is itself a lint error,
  // and this reads as what it actually does.
  const printable = Array.from(base)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  const stem =
    printable
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .replace(/^[.\-_]+|[.\-_]+$/g, '')
      .slice(0, 64) || 'frame';
  const stamp = formatTimecode(seconds, { hours: 'always' }).replace(/[:.]/g, '-');
  const suffix = frameIndex === undefined ? '' : `_f${Math.max(0, Math.floor(frameIndex))}`;
  return `${stem}_${stamp}${suffix}.${EXTENSION[format]}`;
}
