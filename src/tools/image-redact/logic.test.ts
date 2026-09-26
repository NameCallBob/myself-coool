import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BLOCK,
  MAX_PIXELS,
  MIN_RECT,
  applyMosaic,
  applySolid,
  clampRect,
  coveredPixels,
  mapToImage,
  outputName,
  parseHexColor,
  rectFromPoints,
  redactedCopy,
  tooLarge,
  type Mark,
} from './logic.ts';

/** An RGBA buffer whose red channel is the value given per pixel, row by row. */
function image(width: number, height: number, reds: number[], alpha = 255): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    out[i * 4] = reds[i] ?? 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = alpha;
  }
  return out;
}

const reds = (pixels: Uint8Array | Uint8ClampedArray, n: number) =>
  Array.from({ length: n }, (_unused, i) => pixels[i * 4]);

const alphas = (pixels: Uint8Array | Uint8ClampedArray, n: number) =>
  Array.from({ length: n }, (_unused, i) => pixels[i * 4 + 3]);

test('the declared limits are the ones the code uses', () => {
  assert.equal(MAX_PIXELS, 40_000_000);
  assert.equal(MIN_RECT, 3);
  assert.equal(DEFAULT_BLOCK, 12);
  assert.equal(tooLarge(8000, 5000), false); // exactly 40 Mpx
  assert.equal(tooLarge(8000, 5001), true);
  assert.equal(tooLarge(1920, 1080), false);
});

test('a drag becomes a rectangle whichever way it was dragged', () => {
  assert.deepEqual(rectFromPoints({ x: 10, y: 20 }, { x: 30, y: 50 }), { x: 10, y: 20, w: 20, h: 30 });
  // Dragging up and to the left gives the same rectangle.
  assert.deepEqual(rectFromPoints({ x: 30, y: 50 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 20, h: 30 });
  // Fractional pointer positions are rounded, not truncated.
  assert.deepEqual(rectFromPoints({ x: 10.6, y: 20.4 }, { x: 30.5, y: 50.5 }), { x: 11, y: 20, w: 20, h: 31 });
  // A click is a zero-size rectangle, not a mark.
  assert.deepEqual(rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 5, y: 5, w: 0, h: 0 });
});

test('rectangles are clipped to the image, and an empty one is null', () => {
  assert.deepEqual(clampRect({ x: -10, y: -10, w: 30, h: 30 }, 100, 100), { x: 0, y: 0, w: 20, h: 20 });
  assert.deepEqual(clampRect({ x: 90, y: 90, w: 30, h: 30 }, 100, 100), { x: 90, y: 90, w: 10, h: 10 });
  assert.deepEqual(clampRect({ x: 0, y: 0, w: 100, h: 100 }, 100, 100), { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(clampRect({ x: 200, y: 0, w: 10, h: 10 }, 100, 100), null);
  assert.equal(clampRect({ x: -50, y: 0, w: 10, h: 10 }, 100, 100), null);
  assert.equal(clampRect({ x: 5, y: 5, w: 0, h: 10 }, 100, 100), null);
  assert.equal(clampRect({ x: 5, y: 5, w: 10, h: 0 }, 100, 100), null);
});

test('screen coordinates map to image pixels at the displayed scale', () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };
  // The canvas is shown at half size, so a click 200 css px in is 400 px in.
  assert.deepEqual(mapToImage({ x: 300, y: 150 }, box, 800, 400), { x: 400, y: 200 });
  assert.deepEqual(mapToImage({ x: 100, y: 50 }, box, 800, 400), { x: 0, y: 0 });
  assert.deepEqual(mapToImage({ x: 500, y: 250 }, box, 800, 400), { x: 800, y: 400 });
  // A pointer dragged off the canvas is clamped to its edge.
  assert.deepEqual(mapToImage({ x: -900, y: 9000 }, box, 800, 400), { x: 0, y: 400 });
  // A collapsed box cannot be divided by.
  assert.deepEqual(mapToImage({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 }, 800, 400), { x: 0, y: 0 });
});

test('colours are read as #rgb or #rrggbb, and nothing else', () => {
  assert.deepEqual(parseHexColor('#000000'), [0, 0, 0]);
  assert.deepEqual(parseHexColor('#ffffff'), [255, 255, 255]);
  assert.deepEqual(parseHexColor('  #FF8000 '), [255, 128, 0]);
  assert.deepEqual(parseHexColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHexColor('#1a2b3c'), [26, 43, 60]);
  for (const bad of ['', 'black', '#12345', '#gggggg', 'rgb(0,0,0)', '000000']) {
    assert.throws(() => parseHexColor(bad), /not a #rrggbb colour/, bad);
  }
});

test('a solid mark replaces every pixel value in the rectangle', () => {
  const pixels = image(4, 2, [1, 2, 3, 4, 5, 6, 7, 8], 40);
  const changed = applySolid(pixels, 4, 2, { x: 1, y: 0, w: 2, h: 2 }, '#ff8000');
  assert.equal(changed, 4);
  assert.deepEqual(reds(pixels, 8), [1, 255, 255, 4, 5, 255, 255, 8]);
  // Green and blue are written too, not only red.
  assert.equal(pixels[1 * 4 + 1], 128);
  assert.equal(pixels[1 * 4 + 2], 0);
  // The mark is opaque even over a transparent image; the rest keeps its alpha.
  assert.deepEqual(alphas(pixels, 8), [40, 255, 255, 40, 40, 255, 255, 40]);
});

test('a solid mark outside the image changes nothing', () => {
  const pixels = image(2, 2, [1, 2, 3, 4]);
  assert.equal(applySolid(pixels, 2, 2, { x: 10, y: 10, w: 5, h: 5 }, '#000000'), 0);
  assert.deepEqual(reds(pixels, 4), [1, 2, 3, 4]);
});

test('a mosaic block becomes the mean of that block', () => {
  // 4×4, red channel laid out so every 2×2 block has a whole-number mean.
  const pixels = image(4, 4, [
    0, 10, 20, 30,
    20, 30, 40, 50,
    100, 100, 200, 200,
    100, 100, 200, 200,
  ]);
  const changed = applyMosaic(pixels, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 2);
  assert.equal(changed, 16);
  assert.deepEqual(reds(pixels, 16), [
    15, 15, 35, 35,
    15, 15, 35, 35,
    100, 100, 200, 200,
    100, 100, 200, 200,
  ]);
});

test('the mosaic grid is aligned to the image and clipped to the mark', () => {
  const pixels = image(4, 4, [
    0, 0, 0, 0,
    0, 10, 20, 0,
    0, 30, 40, 0,
    0, 0, 0, 0,
  ]);
  // Block 2 with the grid on the image origin: the marked 2×2 straddles four
  // cells, so each marked pixel is its own mean and keeps its value — and no
  // colour from outside the mark leaks in.
  applyMosaic(pixels, 4, 4, { x: 1, y: 1, w: 2, h: 2 }, 2);
  assert.deepEqual(reds(pixels, 16), [
    0, 0, 0, 0,
    0, 10, 20, 0,
    0, 30, 40, 0,
    0, 0, 0, 0,
  ]);
  // The same mark with a block that covers it all averages the four values.
  applyMosaic(pixels, 4, 4, { x: 1, y: 1, w: 2, h: 2 }, 4);
  assert.deepEqual(reds(pixels, 16), [
    0, 0, 0, 0,
    0, 25, 25, 0,
    0, 25, 25, 0,
    0, 0, 0, 0,
  ]);
});

test('a partial block averages only the pixels inside the image', () => {
  // 3×1 with block 2: the second cell holds one pixel, so its mean is itself.
  const pixels = image(3, 1, [10, 20, 90]);
  applyMosaic(pixels, 3, 1, { x: 0, y: 0, w: 3, h: 1 }, 2);
  assert.deepEqual(reds(pixels, 3), [15, 15, 90]);
});

test('mosaic averages alpha as well, and rounds halves up', () => {
  const pixels = new Uint8Array([
    0, 0, 0, 0,
    255, 255, 255, 255,
  ]);
  applyMosaic(pixels, 2, 1, { x: 0, y: 0, w: 2, h: 1 }, 2);
  // (0 + 255) / 2 = 127.5 → 128 on every channel, alpha included.
  assert.deepEqual([...pixels], [128, 128, 128, 128, 128, 128, 128, 128]);
});

test('a block size below two is raised to two rather than dividing by zero', () => {
  const pixels = image(2, 1, [0, 100]);
  applyMosaic(pixels, 2, 1, { x: 0, y: 0, w: 2, h: 1 }, 1);
  assert.deepEqual(reds(pixels, 2), [50, 50]);
  const other = image(2, 1, [0, 100]);
  applyMosaic(other, 2, 1, { x: 0, y: 0, w: 2, h: 1 }, 0);
  assert.deepEqual(reds(other, 2), [50, 50]);
});

test('an out-of-range mosaic mark changes nothing', () => {
  const pixels = image(2, 2, [1, 2, 3, 4]);
  assert.equal(applyMosaic(pixels, 2, 2, { x: -20, y: 0, w: 5, h: 5 }, 4), 0);
  assert.deepEqual(reds(pixels, 4), [1, 2, 3, 4]);
});

test('the copy carries the marks and the source is left alone', () => {
  const source = image(4, 1, [10, 20, 30, 40]);
  const marks: Mark[] = [
    { kind: 'solid', rect: { x: 0, y: 0, w: 2, h: 1 }, color: '#020202' },
    { kind: 'mosaic', rect: { x: 2, y: 0, w: 2, h: 1 }, block: 2 },
  ];
  const out = redactedCopy(source, 4, 1, marks);
  assert.deepEqual(reds(out, 4), [2, 2, 35, 35]);
  assert.deepEqual(reds(source, 4), [10, 20, 30, 40]);
  assert.notEqual(out, source);
});

test('marks are applied in order, so a later mark wins', () => {
  const source = image(2, 1, [0, 200]);
  const mosaicThenSolid = redactedCopy(source, 2, 1, [
    { kind: 'mosaic', rect: { x: 0, y: 0, w: 2, h: 1 }, block: 2 },
    { kind: 'solid', rect: { x: 0, y: 0, w: 1, h: 1 }, color: '#0a0000' },
  ]);
  assert.deepEqual(reds(mosaicThenSolid, 2), [10, 100]);
  // The other order: a mosaic over a solid block averages the solid colour.
  const solidThenMosaic = redactedCopy(source, 2, 1, [
    { kind: 'solid', rect: { x: 0, y: 0, w: 2, h: 1 }, color: '#0a0000' },
    { kind: 'mosaic', rect: { x: 0, y: 0, w: 2, h: 1 }, block: 2 },
  ]);
  assert.deepEqual(reds(solidThenMosaic, 2), [10, 10]);
});

test('defaults fill in for a mark that names neither colour nor block', () => {
  const source = image(2, 1, [10, 200]);
  const solid = redactedCopy(source, 2, 1, [{ kind: 'solid', rect: { x: 0, y: 0, w: 1, h: 1 } }]);
  assert.deepEqual(reds(solid, 2), [0, 200]); // black by default
  const mosaic = redactedCopy(source, 2, 1, [{ kind: 'mosaic', rect: { x: 0, y: 0, w: 2, h: 1 } }]);
  assert.deepEqual(reds(mosaic, 2), [105, 105]); // DEFAULT_BLOCK covers both
});

test('no marks means an identical copy, and a short buffer is refused', () => {
  const source = image(2, 2, [1, 2, 3, 4]);
  const out = redactedCopy(source, 2, 2, []);
  assert.deepEqual([...out], [...source]);
  assert.throws(() => redactedCopy(new Uint8Array(8), 2, 2, []), /needs 16/);
});

test('coverage counts pixels once, however the marks overlap', () => {
  const marks: Mark[] = [
    { kind: 'solid', rect: { x: 0, y: 0, w: 10, h: 10 } },
    { kind: 'mosaic', rect: { x: 5, y: 5, w: 10, h: 10 } },
  ];
  // 100 + 100 areas, 25 shared → 175 distinct pixels.
  assert.equal(coveredPixels(20, 20, marks), 175);
  assert.equal(coveredPixels(20, 20, []), 0);
  // Marks hanging off the edge count only the part inside the image.
  assert.equal(coveredPixels(10, 10, [{ kind: 'solid', rect: { x: 5, y: 5, w: 100, h: 100 } }]), 25);
  assert.equal(coveredPixels(10, 10, [{ kind: 'solid', rect: { x: 50, y: 0, w: 5, h: 5 } }]), 0);
  assert.equal(coveredPixels(0, 0, marks), 0);
});

test('the output file is named as the redacted one', () => {
  assert.equal(outputName('shot.png', 'png'), 'shot.redacted.png');
  assert.equal(outputName('shot.png', 'jpg'), 'shot.redacted.jpg');
  assert.equal(outputName('a.b.jpeg', 'png'), 'a.b.redacted.png');
  assert.equal(outputName('noextension', 'png'), 'noextension.redacted.png');
  assert.equal(outputName('螢幕截圖 2026-09-26.png', 'png'), '螢幕截圖 2026-09-26.redacted.png');
});
