import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY,
  OUTPUT_EXT,
  OUTPUT_FORMATS,
  OUTPUT_LABEL,
  PIXEL_CEILING,
  RATIO_PRESETS,
  applyMatrix,
  applyRatio,
  centeredRect,
  clampRect,
  cropName,
  describeRatio,
  dropsAlpha,
  isLossy,
  isSilentFallback,
  moveRect,
  normalizeRect,
  parseRatio,
  pixels,
  pointToImage,
  rectFromPoints,
  reduceRatio,
  resizeRect,
  resolveOutput,
  rotateDim,
  scaleFactor,
  transformFor,
  withinCeiling,
  type Corner,
  type Dim,
  type QuarterTurns,
} from './logic.ts';

test('normalizeRect straightens a backwards drag and keeps whole pixels', () => {
  assert.deepEqual(normalizeRect({ x: 10, y: 20, width: -5, height: -10 }), {
    x: 5,
    y: 10,
    width: 5,
    height: 10,
  });
  // A zero-extent selection is one pixel, never zero: a zero-width crop is a
  // blank canvas three steps later.
  assert.deepEqual(normalizeRect({ x: 4, y: 4, width: 0, height: 0 }), { x: 4, y: 4, width: 1, height: 1 });
  assert.deepEqual(normalizeRect({ x: 10.4, y: 10.6, width: 5.2, height: 5.2 }), {
    x: 10,
    y: 11,
    width: 6,
    height: 5,
  });
  assert.throws(() => normalizeRect({ x: Number.NaN, y: 0, width: 1, height: 1 }), RangeError);
  assert.throws(() => normalizeRect({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 1 }), RangeError);
});

test('clampRect slides before it shrinks', () => {
  const bounds: Dim = { width: 1000, height: 1000 };
  // Hangs off the right edge by 100: slide left, same size.
  assert.deepEqual(clampRect({ x: 900, y: 0, width: 200, height: 100 }, bounds), {
    x: 800,
    y: 0,
    width: 200,
    height: 100,
  });
  assert.deepEqual(clampRect({ x: -50, y: -50, width: 100, height: 100 }, bounds), {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  // Bigger than the image: only now does it shrink.
  assert.deepEqual(clampRect({ x: 10, y: 10, width: 2000, height: 3000 }, bounds), {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  });
  // A 1x1 image is still an image.
  assert.deepEqual(clampRect({ x: 5, y: 5, width: 5, height: 5 }, { width: 1, height: 1 }), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});

test('rectFromPoints does not care which way the pointer went', () => {
  assert.deepEqual(rectFromPoints({ x: 100, y: 50 }, { x: 20, y: 10 }), {
    x: 20,
    y: 10,
    width: 80,
    height: 40,
  });
  assert.deepEqual(
    rectFromPoints({ x: 20, y: 10 }, { x: 100, y: 50 }),
    rectFromPoints({ x: 100, y: 50 }, { x: 20, y: 10 })
  );
});

test('moveRect translates without resizing', () => {
  const bounds: Dim = { width: 1000, height: 1000 };
  assert.deepEqual(moveRect({ x: 10, y: 10, width: 100, height: 100 }, -50, 5, bounds), {
    x: 0,
    y: 15,
    width: 100,
    height: 100,
  });
  // Against the far edge the size is preserved, the position is not.
  assert.deepEqual(moveRect({ x: 800, y: 800, width: 200, height: 200 }, 500, 500, bounds), {
    x: 800,
    y: 800,
    width: 200,
    height: 200,
  });
});

test('applyRatio pins the top-left and gives way at the edge', () => {
  const bounds: Dim = { width: 1000, height: 1000 };
  assert.deepEqual(applyRatio({ x: 0, y: 0, width: 400, height: 100 }, 1, bounds), {
    x: 0,
    y: 0,
    width: 400,
    height: 400,
  });
  // Only 200 px of room below y = 800, so the height leads instead.
  assert.deepEqual(applyRatio({ x: 0, y: 800, width: 400, height: 100 }, 1, bounds), {
    x: 0,
    y: 800,
    width: 200,
    height: 200,
  });
  // 16:9 across the full width is 562.5 px tall — rounded, and so 1.776:1.
  assert.deepEqual(applyRatio({ x: 0, y: 0, width: 1000, height: 10 }, 16 / 9, bounds), {
    x: 0,
    y: 0,
    width: 1000,
    height: 563,
  });
  assert.throws(() => applyRatio({ x: 0, y: 0, width: 10, height: 10 }, 0, bounds), RangeError);
  assert.throws(() => applyRatio({ x: 0, y: 0, width: 10, height: 10 }, -2, bounds), RangeError);
});

test('centeredRect is the largest box of that ratio, centred', () => {
  assert.deepEqual(centeredRect({ width: 1000, height: 1000 }, 1), {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  });
  // 16:9 in a square: full width, 562.5 -> 563 tall, centred vertically.
  assert.deepEqual(centeredRect({ width: 1000, height: 1000 }, 16 / 9), {
    x: 0,
    y: 219,
    width: 1000,
    height: 563,
  });
  // A square in 4:3: limited by the height.
  assert.deepEqual(centeredRect({ width: 800, height: 600 }, 1), {
    x: 100,
    y: 0,
    width: 600,
    height: 600,
  });
  assert.throws(() => centeredRect({ width: 10, height: 10 }, Number.NaN), RangeError);
});

test('resizeRect keeps the opposite corner nailed down', () => {
  const bounds: Dim = { width: 1000, height: 1000 };
  const rect = { x: 100, y: 100, width: 200, height: 200 };
  // Dragging the SE corner leaves the NW corner where it was.
  assert.deepEqual(resizeRect(rect, 'se', { x: 500, y: 400 }, bounds, null), {
    x: 100,
    y: 100,
    width: 400,
    height: 300,
  });
  // Dragging the NW corner leaves the SE corner (300, 300) where it was.
  assert.deepEqual(resizeRect(rect, 'nw', { x: 50, y: 50 }, bounds, null), {
    x: 50,
    y: 50,
    width: 250,
    height: 250,
  });
  // Past the anchor: the box flips over it rather than collapsing.
  assert.deepEqual(resizeRect(rect, 'se', { x: 40, y: 60 }, bounds, null), {
    x: 40,
    y: 60,
    width: 60,
    height: 40,
  });
  assert.deepEqual(resizeRect(rect, 'ne', { x: 500, y: 50 }, bounds, null), {
    x: 100,
    y: 50,
    width: 400,
    height: 250,
  });
  assert.deepEqual(resizeRect(rect, 'sw', { x: 50, y: 500 }, bounds, null), {
    x: 50,
    y: 100,
    width: 250,
    height: 400,
  });
});

test('resizeRect with a locked ratio contains the pointer and survives the edge', () => {
  const bounds: Dim = { width: 1000, height: 1000 };
  const rect = { x: 100, y: 100, width: 200, height: 200 };
  // 400 across, 300 down: the square grows to the larger of the two.
  assert.deepEqual(resizeRect(rect, 'se', { x: 500, y: 400 }, bounds, 1), {
    x: 100,
    y: 100,
    width: 400,
    height: 400,
  });
  // Way outside the image: both sides stop at the room available.
  assert.deepEqual(resizeRect(rect, 'se', { x: 5000, y: 5000 }, bounds, 1), {
    x: 100,
    y: 100,
    width: 900,
    height: 900,
  });
  // A short image: 16:9 wants 562 px of height, gets 300, so the width comes
  // down with it — 533.33 rounds to 533, i.e. 1.777 becomes 1.7767.
  assert.deepEqual(
    resizeRect({ x: 0, y: 0, width: 100, height: 100 }, 'se', { x: 1000, y: 200 }, { width: 1000, height: 300 }, 16 / 9),
    { x: 0, y: 0, width: 533, height: 300 }
  );
  assert.throws(() => resizeRect(rect, 'se', { x: 1, y: 1 }, bounds, 0), RangeError);
});

test('rotateDim swaps the sides on odd turns only', () => {
  const dim: Dim = { width: 1920, height: 1080 };
  assert.deepEqual(rotateDim(dim, 0), dim);
  assert.deepEqual(rotateDim(dim, 1), { width: 1080, height: 1920 });
  assert.deepEqual(rotateDim(dim, 2), dim);
  assert.deepEqual(rotateDim(dim, 3), { width: 1080, height: 1920 });
});

test('parseRatio takes the three shapes people type, and nothing else', () => {
  assert.equal(parseRatio('16:9'), 16 / 9);
  assert.equal(parseRatio('16/9'), 16 / 9);
  assert.equal(parseRatio(' 4 : 3 '), 4 / 3);
  assert.equal(parseRatio('1.78'), 1.78);
  assert.equal(parseRatio('1'), 1);
  assert.equal(parseRatio(''), null);
  assert.equal(parseRatio('   '), null);
  assert.equal(parseRatio('0:1'), null);
  assert.equal(parseRatio('1:0'), null);
  assert.equal(parseRatio('-2'), null);
  assert.equal(parseRatio('16x9'), null);
  assert.equal(parseRatio('1:2:3'), null);
  assert.equal(parseRatio('abc'), null);
});

test('every ratio preset parses back to its own label', () => {
  assert.ok(RATIO_PRESETS.length > 0);
  for (const preset of RATIO_PRESETS) {
    assert.equal(parseRatio(preset.key), preset.ratio, preset.key);
  }
});

test('reduceRatio is the smallest integer pair', () => {
  assert.deepEqual(reduceRatio(1920, 1080), [16, 9]);
  assert.deepEqual(reduceRatio(100, 100), [1, 1]);
  assert.deepEqual(reduceRatio(3840, 2160), [16, 9]);
  assert.deepEqual(reduceRatio(1000, 563), [1000, 563]);
  // Degenerate input clamps rather than dividing by zero.
  assert.deepEqual(reduceRatio(3, 0), [3, 1]);
});

test('describeRatio prints the useful form of the two', () => {
  assert.equal(describeRatio(1920, 1080), '16:9');
  assert.equal(describeRatio(600, 600), '1:1');
  assert.equal(describeRatio(500, 1000), '1:2');
  // 1000:563 is true and unreadable, so it becomes a decimal.
  assert.equal(describeRatio(1000, 563), '1.78:1');
  assert.equal(describeRatio(563, 1000), '0.56:1');
});

test('applyMatrix and IDENTITY', () => {
  assert.deepEqual(applyMatrix(IDENTITY, { x: 12, y: 34 }), { x: 12, y: 34 });
  assert.deepEqual(applyMatrix({ a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 }, { x: 1, y: 1 }), { x: 7, y: 10 });
});

test('transformFor: rotation puts the source corners where they belong', () => {
  const draw: Dim = { width: 100, height: 50 };
  const topLeft = { x: 0, y: 0 };

  assert.deepEqual(transformFor(draw, 0, { horizontal: false, vertical: false }), IDENTITY);

  // 90 CW: the top-left of the picture ends up top-right of a 50x100 canvas.
  const cw90 = transformFor(draw, 1, { horizontal: false, vertical: false });
  assert.deepEqual(applyMatrix(cw90, topLeft), { x: 50, y: 0 });
  assert.deepEqual(applyMatrix(cw90, { x: 100, y: 0 }), { x: 50, y: 100 });
  assert.deepEqual(applyMatrix(cw90, { x: 0, y: 50 }), { x: 0, y: 0 });

  // 180: top-left becomes bottom-right of the same 100x50 canvas.
  const half = transformFor(draw, 2, { horizontal: false, vertical: false });
  assert.deepEqual(applyMatrix(half, topLeft), { x: 100, y: 50 });

  // 270 CW: top-left becomes bottom-left of a 50x100 canvas.
  const ccw90 = transformFor(draw, 3, { horizontal: false, vertical: false });
  assert.deepEqual(applyMatrix(ccw90, topLeft), { x: 0, y: 100 });
  assert.deepEqual(applyMatrix(ccw90, { x: 100, y: 0 }), { x: 0, y: 0 });
});

test('transformFor: flips act on what the viewer sees', () => {
  const draw: Dim = { width: 100, height: 50 };
  const mirrored = transformFor(draw, 0, { horizontal: true, vertical: false });
  assert.deepEqual(applyMatrix(mirrored, { x: 0, y: 0 }), { x: 100, y: 0 });
  assert.deepEqual(applyMatrix(mirrored, { x: 100, y: 50 }), { x: 0, y: 50 });

  const upsideDown = transformFor(draw, 0, { horizontal: false, vertical: true });
  assert.deepEqual(applyMatrix(upsideDown, { x: 0, y: 0 }), { x: 0, y: 50 });

  // Both flips are a half turn — the known identity that catches a sign error.
  assert.deepEqual(
    transformFor(draw, 0, { horizontal: true, vertical: true }),
    transformFor(draw, 2, { horizontal: false, vertical: false })
  );

  // 90 CW then mirrored horizontally is a transpose.
  const transpose = transformFor(draw, 1, { horizontal: true, vertical: false });
  assert.deepEqual(applyMatrix(transpose, { x: 0, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(applyMatrix(transpose, { x: 100, y: 0 }), { x: 0, y: 100 });
  assert.deepEqual(applyMatrix(transpose, { x: 0, y: 50 }), { x: 50, y: 0 });
});

test('transformFor: every combination maps the box onto the canvas exactly', () => {
  const draw: Dim = { width: 100, height: 50 };
  const corners = [
    { x: 0, y: 0 },
    { x: draw.width, y: 0 },
    { x: draw.width, y: draw.height },
    { x: 0, y: draw.height },
  ];
  const turnsList: QuarterTurns[] = [0, 1, 2, 3];
  for (const turns of turnsList) {
    for (const horizontal of [false, true]) {
      for (const vertical of [false, true]) {
        const matrix = transformFor(draw, turns, { horizontal, vertical });
        const out = rotateDim(draw, turns);
        const mapped = corners
          .map((corner) => applyMatrix(matrix, corner))
          .map((point) => `${point.x},${point.y}`)
          .sort();
        const expected = [
          `0,0`,
          `${out.width},0`,
          `${out.width},${out.height}`,
          `0,${out.height}`,
        ].sort();
        // The four corners of the source land on the four corners of the
        // canvas — nothing rotated off the edge, nothing left blank.
        assert.deepEqual(mapped, expected, `turns=${turns} h=${horizontal} v=${vertical}`);
      }
    }
  }
});

test('resolveOutput: nothing asked for is the crop itself', () => {
  assert.deepEqual(resolveOutput({ width: 400, height: 300 }, { width: null, height: null }, false), {
    width: 400,
    height: 300,
  });
  // Zero and negatives are read as "unset", not as a zero-pixel output.
  assert.deepEqual(resolveOutput({ width: 400, height: 300 }, { width: 0, height: -5 }, false), {
    width: 400,
    height: 300,
  });
});

test('resolveOutput: one side given, the other follows the ratio', () => {
  assert.deepEqual(resolveOutput({ width: 400, height: 300 }, { width: 800, height: null }, false), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(resolveOutput({ width: 400, height: 300 }, { width: null, height: 150 }, false), {
    width: 200,
    height: 150,
  });
  // 7 * 10 / 3 = 23.33, rounded.
  assert.deepEqual(resolveOutput({ width: 3, height: 7 }, { width: 10, height: null }, false), {
    width: 10,
    height: 23,
  });
});

test('resolveOutput: both sides fit inside the box unless distortion is allowed', () => {
  const crop = { width: 400, height: 300 };
  assert.deepEqual(resolveOutput(crop, { width: 1000, height: 1000 }, false), { width: 1000, height: 750 });
  assert.deepEqual(resolveOutput(crop, { width: 1000, height: 1000 }, true), { width: 1000, height: 1000 });
  assert.deepEqual(resolveOutput(crop, { width: 100, height: 1000 }, false), { width: 100, height: 75 });
});

test('pixel counts and the ceiling', () => {
  assert.equal(pixels({ width: 1920, height: 1080 }), 2_073_600);
  assert.equal(PIXEL_CEILING, 40_000_000);
  assert.equal(withinCeiling({ width: 8000, height: 5000 }), true);
  assert.equal(withinCeiling({ width: 8000, height: 5001 }), false);
});

test('scaleFactor from the displayed size back to pixels', () => {
  assert.deepEqual(scaleFactor({ width: 500, height: 300 }, { width: 1000, height: 600 }), { x: 2, y: 2 });
  assert.deepEqual(scaleFactor({ width: 0, height: 0 }, { width: 10, height: 20 }), { x: 10, y: 20 });
});

test('pointToImage converts and clamps a pointer position', () => {
  const box: Dim = { width: 500, height: 250 };
  const image: Dim = { width: 1000, height: 500 };
  assert.deepEqual(pointToImage({ x: 50, y: 25 }, box, image), { x: 100, y: 50 });
  assert.deepEqual(pointToImage({ x: 0, y: 0 }, box, image), { x: 0, y: 0 });
  assert.deepEqual(pointToImage({ x: 500, y: 250 }, box, image), { x: 1000, y: 500 });
  // A drag that left the element pins to the edge.
  assert.deepEqual(pointToImage({ x: -40, y: 9999 }, box, image), { x: 0, y: 500 });
  // Fractional CSS pixels round to whole image pixels.
  assert.deepEqual(pointToImage({ x: 12.4, y: 12.6 }, box, image), { x: 25, y: 25 });
});

test('the output format table', () => {
  assert.deepEqual([...OUTPUT_FORMATS], ['image/png', 'image/jpeg', 'image/webp']);
  for (const format of OUTPUT_FORMATS) {
    assert.equal(typeof OUTPUT_LABEL[format], 'string');
    assert.match(OUTPUT_EXT[format], /^[a-z]+$/);
  }
  assert.equal(OUTPUT_EXT['image/jpeg'], 'jpg');
  assert.equal(OUTPUT_LABEL['image/webp'], 'WebP');
  assert.equal(isLossy('image/png'), false);
  assert.equal(isLossy('image/jpeg'), true);
  assert.equal(isLossy('image/webp'), true);
  assert.equal(dropsAlpha('image/jpeg'), true);
  assert.equal(dropsAlpha('image/png'), false);
  assert.equal(dropsAlpha('image/webp'), false);
});

test('isSilentFallback catches a canvas substituting PNG', () => {
  assert.equal(isSilentFallback('image/webp', 'image/png'), true);
  assert.equal(isSilentFallback('image/png', 'image/png'), false);
  assert.equal(isSilentFallback('image/jpeg', 'image/jpeg;charset=binary'), false);
  assert.equal(isSilentFallback('IMAGE/WEBP', 'image/webp '), false);
  // No type at all is not the type we asked for.
  assert.equal(isSilentFallback('image/webp', ''), true);
});

test('cropName marks the output and swaps the extension', () => {
  assert.equal(cropName('photo.png', 'image/png'), 'photo-crop.png');
  assert.equal(cropName('photo.PNG', 'image/jpeg'), 'photo-crop.jpg');
  assert.equal(cropName('a.b.jpeg', 'image/webp'), 'a.b-crop.webp');
  assert.equal(cropName('noextension', 'image/png'), 'noextension-crop.png');
  assert.equal(cropName('.gitignore', 'image/png'), '.gitignore-crop.png');
  assert.equal(cropName('', 'image/jpeg'), 'image-crop.jpg');
  assert.equal(cropName('   ', 'image/jpeg'), 'image-crop.jpg');
  assert.equal(cropName('照片 2024.jpg', 'image/webp'), '照片 2024-crop.webp');
  assert.equal(cropName('🐟.png', 'image/png'), '🐟-crop.png');
});

test('the pipeline composes: crop, rotate, then scale', () => {
  // A 4000x3000 photo, cropped to a 16:9 band, turned on its side, output
  // 1080 px wide. Each stage is checked against the next one's input.
  const source: Dim = { width: 4000, height: 3000 };
  const crop = centeredRect(source, 16 / 9);
  assert.deepEqual(crop, { x: 0, y: 375, width: 4000, height: 2250 });
  assert.equal(describeRatio(crop.width, crop.height), '16:9');

  const turned = rotateDim(crop, 1);
  assert.deepEqual(turned, { width: 2250, height: 4000 });

  const out = resolveOutput(turned, { width: 1080, height: null }, false);
  assert.deepEqual(out, { width: 1080, height: 1920 });
  assert.equal(describeRatio(out.width, out.height), '9:16');
  assert.ok(withinCeiling(out));

  // And the crop stays inside the photo it came from.
  assert.deepEqual(clampRect(crop, source), crop);
});

test('a corner list stays exhaustive', () => {
  const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
  const bounds: Dim = { width: 100, height: 100 };
  for (const corner of corners) {
    const out = resizeRect({ x: 20, y: 20, width: 20, height: 20 }, corner, { x: 60, y: 60 }, bounds, null);
    assert.ok(out.width >= 1 && out.height >= 1, corner);
    assert.deepEqual(clampRect(out, bounds), out, corner);
  }
});
