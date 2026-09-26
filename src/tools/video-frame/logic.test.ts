import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FPS,
  FPS_RANGE,
  assertFps,
  clampTime,
  formatTimecode,
  frameCount,
  frameFileName,
  frameIndexAt,
  frameMime,
  frameTime,
  parseFps,
  parseTimecode,
  scaleToLongestSide,
  snapToFrame,
  stepFrames,
} from './logic.ts';

test('DEFAULT_FPS and FPS_RANGE are the documented values', () => {
  assert.equal(DEFAULT_FPS, 30);
  assert.equal(FPS_RANGE.min, 1);
  assert.equal(FPS_RANGE.max, 240);
});

test('frameMime maps the two formats', () => {
  assert.equal(frameMime('png'), 'image/png');
  assert.equal(frameMime('jpeg'), 'image/jpeg');
});

test('clampTime keeps a position inside the clip', () => {
  assert.equal(clampTime(5, 10), 5);
  assert.equal(clampTime(0, 10), 0);
  assert.equal(clampTime(10, 10), 10);
  assert.equal(clampTime(11, 10), 10);
  assert.equal(clampTime(-1, 10), 0);
  assert.equal(clampTime(Number.NaN, 10), 0);
  assert.equal(clampTime(Number.POSITIVE_INFINITY, 10), 0);
  // An unknown duration (live stream, still loading) pins to the start.
  assert.equal(clampTime(5, Number.NaN), 0);
  assert.equal(clampTime(5, Number.POSITIVE_INFINITY), 0);
  assert.equal(clampTime(5, 0), 0);
});

test('assertFps accepts the range and rejects the rest', () => {
  assert.equal(assertFps(30), 30);
  assert.equal(assertFps(1), 1);
  assert.equal(assertFps(240), 240);
  assert.throws(() => assertFps(0), RangeError);
  assert.throws(() => assertFps(0.5), RangeError);
  assert.throws(() => assertFps(241), RangeError);
  assert.throws(() => assertFps(Number.NaN), RangeError);
});

test('parseFps reads decimals and NTSC ratios', () => {
  assert.equal(parseFps('30'), 30);
  assert.equal(parseFps(' 59.94 '), 59.94);
  assert.equal(parseFps('24'), 24);
  const ntsc = parseFps('30000/1001');
  assert.ok(ntsc !== null && Math.abs(ntsc - 29.97002997) < 1e-6);
  assert.equal(parseFps('24000 / 1001') !== null, true);
});

test('parseFps refuses what cannot be a frame rate', () => {
  assert.equal(parseFps(''), null);
  assert.equal(parseFps('   '), null);
  assert.equal(parseFps('abc'), null);
  assert.equal(parseFps('0'), null);
  assert.equal(parseFps('-30'), null);
  assert.equal(parseFps('1000'), null);
  assert.equal(parseFps('30/0'), null);
  assert.equal(parseFps('每秒三十格'), null);
  assert.equal(parseFps('30fps'), null);
});

test('frameIndexAt counts from zero', () => {
  assert.equal(frameIndexAt(0, 30), 0);
  assert.equal(frameIndexAt(1 / 30, 30), 1);
  assert.equal(frameIndexAt(0.9 / 30, 30), 0);
  assert.equal(frameIndexAt(1, 30), 30);
  assert.equal(frameIndexAt(-5, 30), 0);
  assert.equal(frameIndexAt(Number.NaN, 30), 0);
  assert.equal(frameIndexAt(2, 25), 50);
  assert.throws(() => frameIndexAt(1, 0), RangeError);
});

test('frameIndexAt survives binary floating point', () => {
  // 7/30*30 is 6.999999999999999 in IEEE 754; without the epsilon this is 6.
  assert.equal(frameIndexAt(7 / 30, 30), 7);
  for (let i = 0; i < 200; i += 1) {
    assert.equal(frameIndexAt(i / 30, 30), i, `frame ${i}`);
  }
});

test('frameTime is the inverse of frameIndexAt on frame boundaries', () => {
  for (let i = 0; i < 120; i += 1) {
    assert.equal(frameIndexAt(frameTime(i, 24), 24), i);
  }
  assert.equal(frameTime(0, 30), 0);
  assert.equal(frameTime(30, 30), 1);
  assert.equal(frameTime(-3, 30), 0);
  assert.equal(frameTime(2.7, 30), 2 / 30);
  assert.throws(() => frameTime(1, 500), RangeError);
});

test('snapToFrame moves to the start of the containing frame', () => {
  assert.equal(snapToFrame(0.05, 30), 1 / 30);
  assert.equal(snapToFrame(1 / 30, 30), 1 / 30);
  assert.equal(snapToFrame(0.01, 30), 0);
  assert.equal(snapToFrame(1, 30), 1);
  assert.equal(snapToFrame(-1, 30), 0);
});

test('stepFrames walks frame by frame without drifting', () => {
  let at = 0;
  for (let i = 1; i <= 90; i += 1) {
    at = stepFrames(at, 1, 30, 10);
    assert.equal(frameIndexAt(at, 30), i, `after ${i} steps`);
  }
  // And back again lands exactly where it started.
  for (let i = 89; i >= 0; i -= 1) {
    at = stepFrames(at, -1, 30, 10);
    assert.equal(frameIndexAt(at, 30), i, `back to ${i}`);
  }
  assert.equal(at, 0);
});

test('stepFrames clamps at both ends of the clip', () => {
  assert.equal(stepFrames(0, -1, 30, 10), 0);
  assert.equal(stepFrames(0, -600, 30, 10), 0);
  assert.equal(stepFrames(10, 1, 30, 10), 10);
  assert.equal(stepFrames(9.99, 100, 30, 10), 10);
  assert.equal(stepFrames(5, 0, 30, 10), snapToFrame(5, 30));
  // An unknown current position is treated as the start, then stepped.
  assert.equal(stepFrames(Number.NaN, 5, 30, 10), 5 / 30);
  assert.equal(stepFrames(5, Number.NaN, 30, 10), 5);
  assert.throws(() => stepFrames(1, 1, 0, 10), RangeError);
});

test('stepFrames takes multi-frame jumps', () => {
  assert.equal(frameIndexAt(stepFrames(0, 10, 30, 10), 30), 10);
  assert.equal(frameIndexAt(stepFrames(1, -10, 30, 10), 30), 20);
  // Fractional frame counts round rather than truncate towards zero.
  assert.equal(frameIndexAt(stepFrames(0, 1.6, 30, 10), 30), 2);
});

test('frameCount counts whole frames', () => {
  assert.equal(frameCount(10, 30), 300);
  assert.equal(frameCount(1, 24), 24);
  assert.equal(frameCount(0, 30), 0);
  assert.equal(frameCount(-5, 30), 0);
  assert.equal(frameCount(Number.NaN, 30), 0);
  assert.equal(frameCount(Number.POSITIVE_INFINITY, 30), 0);
  // A clip shorter than one frame still holds the one frame you can see.
  assert.equal(frameCount(0.01, 30), 1);
});

test('formatTimecode prints milliseconds and drops idle hours', () => {
  assert.equal(formatTimecode(0), '00:00.000');
  assert.equal(formatTimecode(1.5), '00:01.500');
  assert.equal(formatTimecode(61.25), '01:01.250');
  assert.equal(formatTimecode(599.999), '09:59.999');
  assert.equal(formatTimecode(3600), '01:00:00.000');
  assert.equal(formatTimecode(3661.007), '01:01:01.007');
  assert.equal(formatTimecode(0, { hours: 'always' }), '00:00:00.000');
  assert.equal(formatTimecode(-3), '00:00.000');
  assert.equal(formatTimecode(Number.NaN), '00:00.000');
});

test('formatTimecode carries at the millisecond, not below it', () => {
  // 59.9996 s must read as a minute, never as 59.1000.
  assert.equal(formatTimecode(59.9996), '01:00.000');
  assert.equal(formatTimecode(59.9994), '00:59.999');
  assert.equal(formatTimecode(1 / 30), '00:00.033');
  assert.equal(formatTimecode(2 / 30), '00:00.067');
});

test('parseTimecode reads every accepted shape', () => {
  assert.equal(parseTimecode('12'), 12);
  assert.equal(parseTimecode('12.5'), 12.5);
  assert.equal(parseTimecode('12.033'), 12.033);
  assert.equal(parseTimecode('1:02'), 62);
  assert.equal(parseTimecode('01:02.250'), 62.25);
  assert.equal(parseTimecode('1:01:01'), 3661);
  assert.equal(parseTimecode('01:01:01.007'), 3661.007);
  assert.equal(parseTimecode(' 90s '), 90);
  assert.equal(parseTimecode('90秒'), 90);
  assert.equal(parseTimecode('1：02'), 62);
  assert.equal(parseTimecode('0'), 0);
  assert.equal(parseTimecode('3600'), 3600);
});

test('parseTimecode round-trips formatTimecode', () => {
  for (const seconds of [0, 0.033, 1.5, 59.999, 61.25, 3600, 3661.007, 86399.999]) {
    const text = formatTimecode(seconds, { hours: 'always' });
    const back = parseTimecode(text);
    assert.ok(back !== null, `${text} should parse`);
    assert.ok(Math.abs(back - seconds) < 0.001, `${text} -> ${String(back)}`);
  }
});

test('parseTimecode refuses ambiguous or malformed input', () => {
  assert.equal(parseTimecode(''), null);
  assert.equal(parseTimecode('  '), null);
  assert.equal(parseTimecode('abc'), null);
  assert.equal(parseTimecode('-5'), null);
  assert.equal(parseTimecode('12.'), null);
  assert.equal(parseTimecode('.5'), null);
  assert.equal(parseTimecode('1:2:3:4'), null);
  // 1:75 is 135 s to some people and nonsense to others, so it is neither.
  assert.equal(parseTimecode('1:75'), null);
  assert.equal(parseTimecode('1:10:99'), null);
  assert.equal(parseTimecode('1e3'), null);
  assert.equal(parseTimecode('第一分鐘'), null);
  assert.equal(parseTimecode('⏱'), null);
  assert.equal(parseTimecode('00:00:00:12'), null);
});

test('scaleToLongestSide keeps the ratio and the native size', () => {
  const hd = { width: 1920, height: 1080 };
  assert.deepEqual(scaleToLongestSide(hd, 0), hd);
  assert.deepEqual(scaleToLongestSide(hd, -1), hd);
  assert.deepEqual(scaleToLongestSide(hd, Number.NaN), hd);
  assert.deepEqual(scaleToLongestSide(hd, 1920), hd);
  assert.deepEqual(scaleToLongestSide(hd, 960), { width: 960, height: 540 });
  assert.deepEqual(scaleToLongestSide(hd, 3840), { width: 3840, height: 2160 });
  // Portrait: the long side is the height.
  assert.deepEqual(scaleToLongestSide({ width: 1080, height: 1920 }, 960), {
    width: 540,
    height: 960,
  });
  // Square.
  assert.deepEqual(scaleToLongestSide({ width: 500, height: 500 }, 100), {
    width: 100,
    height: 100,
  });
});

test('scaleToLongestSide floors extreme letterboxes at one pixel', () => {
  assert.deepEqual(scaleToLongestSide({ width: 4000, height: 3 }, 100), {
    width: 100,
    height: 1,
  });
});

test('scaleToLongestSide rejects impossible sizes', () => {
  assert.throws(() => scaleToLongestSide({ width: 0, height: 10 }, 100), RangeError);
  assert.throws(() => scaleToLongestSide({ width: 10, height: -1 }, 100), RangeError);
  assert.throws(
    () => scaleToLongestSide({ width: Number.NaN, height: 10 }, 100),
    RangeError
  );
});

test('frameFileName names the clip and the moment', () => {
  assert.equal(frameFileName('clip.mp4', 12.4, 'png'), 'clip_00-00-12-400.png');
  assert.equal(frameFileName('clip.mp4', 12.4, 'jpeg'), 'clip_00-00-12-400.jpg');
  assert.equal(frameFileName('clip.webm', 3661.007, 'png'), 'clip_01-01-01-007.png');
  assert.equal(frameFileName('clip.mp4', 1 / 30, 'png', 1), 'clip_00-00-00-033_f1.png');
  assert.equal(frameFileName('clip.mp4', 0, 'png', 0), 'clip_00-00-00-000_f0.png');
});

test('frameFileName keeps CJK and strips what file systems refuse', () => {
  assert.equal(frameFileName('會議錄影.mp4', 5, 'png'), '會議錄影_00-00-05-000.png');
  assert.equal(frameFileName('my holiday clip.mov', 5, 'png'), 'my_holiday_clip_00-00-05-000.png');
  // Each refused character becomes a dash; a trailing one is then trimmed.
  assert.equal(frameFileName('a/b:c*d?.mp4', 5, 'png'), 'a-b-c-d_00-00-05-000.png');
  assert.equal(frameFileName('sub\u0000dir\u001f.mp4', 5, 'png'), 'subdir_00-00-05-000.png');
  assert.equal(frameFileName('🎬.mp4', 5, 'png'), '🎬_00-00-05-000.png');
});

test('frameFileName always yields a usable name', () => {
  assert.equal(frameFileName('', 0, 'png'), 'frame_00-00-00-000.png');
  assert.equal(frameFileName('...', 0, 'png'), 'frame_00-00-00-000.png');
  assert.equal(frameFileName('.mp4', 0, 'png'), 'frame_00-00-00-000.png');
  assert.equal(frameFileName('noextension', 1, 'png'), 'noextension_00-00-01-000.png');
  const long = frameFileName('x'.repeat(200) + '.mp4', 0, 'png');
  assert.equal(long, `${'x'.repeat(64)}_00-00-00-000.png`);
});
