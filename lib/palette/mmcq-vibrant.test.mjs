import assert from "node:assert/strict";
import test from "node:test";

import { extractMmcqVibrantPalette, MMCQ_MINIMUM_DISTANCE } from "./mmcq-vibrant.js";

const pixels = (rgb, count) => Array.from({ length: count }, () => [...rgb]);
const delta = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test("selects supported vivid accents without inventing swatches or amplifying their population", () => {
  const input = [...pixels([60, 60, 60], 9500), ...pixels([230, 25, 40], 200), ...pixels([30, 110, 220], 150), ...pixels([240, 190, 40], 150)];
  const palette = extractMmcqVibrantPalette(input);
  assert.ok(palette.some(p => p.rgb.join() === "230,25,40"));
  assert.ok(palette.some(p => p.rgb.join() === "30,110,220"));
  const background = palette.find(p => p.rgb.join() === "60,60,60");
  assert.ok(background && background.weight > 0.9);
  assert.ok(palette[0].rgb.some((v, i, rgb) => v !== rgb[(i + 1) % 3]), "The first swatch should favour colour");
  assert.ok(Math.abs(palette.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-10);
});

test("filters isolated hot-pixel colours rather than rewarding chromatic noise", () => {
  const palette = extractMmcqVibrantPalette([...pixels([80, 80, 80], 10000), [255, 0, 255], [0, 255, 0]]);
  assert.equal(palette.length, 1);
  assert.deepEqual(palette[0].rgb, [80, 80, 80]);
  assert.equal(palette[0].weight, 1);
});

test("five diverse swatches are selected when the photograph supports them", () => {
  const input = [[220, 20, 35], [20, 180, 70], [30, 80, 220], [235, 190, 20], [160, 35, 190], [30, 180, 180]]
    .flatMap(rgb => pixels(rgb, 100));
  const palette = extractMmcqVibrantPalette(input);
  assert.equal(palette.length, 5);
  for (let i = 0; i < palette.length; i++) for (let j = i + 1; j < palette.length; j++) {
    assert.ok(delta(palette[i].oklab, palette[j].oklab) >= MMCQ_MINIMUM_DISTANCE);
  }
});

test("flat, near-flat, black/white and muted photographs do not gain synthetic vivid colours", () => {
  for (const input of [
    pixels([128, 128, 128], 100),
    [...pixels([0, 0, 0], 50), ...pixels([255, 255, 255], 50)],
    [...pixels([100, 100, 100], 50), ...pixels([102, 102, 102], 50)],
    [[110, 105, 100], [145, 150, 145], [180, 178, 170]].flatMap(rgb => pixels(rgb, 50)),
  ]) {
    const palette = extractMmcqVibrantPalette(input);
    const observed = new Set(input.map(rgb => rgb.join()));
    assert.ok(palette.length >= 1 && palette.length <= 5);
    assert.ok(palette.every(p => observed.has(p.rgb.join())));
    assert.ok(palette.every(p => Math.hypot(p.oklab[1], p.oklab[2]) < 0.04));
  }
  assert.equal(extractMmcqVibrantPalette(pixels([128, 128, 128], 10)).length, 1);
});

test("64-candidate quantisation is deterministic across reordered samples and never mutates input", () => {
  const input = Array.from({ length: 4096 }, (_, i) => [i % 256, (i * 37) % 256, (i * 71) % 256]);
  const before = structuredClone(input);
  input.forEach(Object.freeze);
  Object.freeze(input);
  const first = extractMmcqVibrantPalette(input);
  assert.deepEqual(extractMmcqVibrantPalette([...input].reverse()), first);
  assert.deepEqual(input, before);
  assert.ok(first.every(p => before.some(rgb => rgb.join() === p.rgb.join())));
});

test("empty/invalid samples and unsupported palette sizes fail explicitly", () => {
  assert.throws(() => extractMmcqVibrantPalette([]), /empty pixel sample/);
  for (const value of [0, 6, 2.5]) assert.throws(() => extractMmcqVibrantPalette([[0, 0, 0]], value), /one and five/);
  for (const pixel of [[-1, 0, 0], [256, 0, 0], [NaN, 0, 0], [1, 2], [1.5, 2, 3]]) {
    assert.throws(() => extractMmcqVibrantPalette([pixel]), /integer channels/);
  }
});
