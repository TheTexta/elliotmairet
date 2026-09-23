import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractOklabKMedoids,
  rgbToOklab,
} from "./oklab-k-medoids.js";

test("converts sRGB reference colours to OKLab", () => {
  assert.deepEqual(rgbToOklab([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(rgbToOklab([255, 255, 255]), [1, 0, 0]);
  assert.deepEqual(rgbToOklab([255, 0, 0]), [0.627955, 0.224863, 0.125846]);
});

test("extracts deterministic weighted medoids in dominance order", () => {
  const pixels = [
    ...new Array(6).fill([250, 10, 10]),
    ...new Array(3).fill([10, 250, 10]),
    [10, 10, 250],
  ];
  const first = extractOklabKMedoids(pixels, 3);
  const second = extractOklabKMedoids([...pixels].reverse(), 3);

  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ rgb }) => rgb), [
    [240, 16, 16],
    [16, 240, 16],
    [16, 16, 240],
  ]);
  assert.deepEqual(first.map(({ weight }) => weight), [0.6, 0.3, 0.1]);
});

test("returns only the available medoids", () => {
  const features = extractOklabKMedoids(new Array(4).fill([128, 128, 128]), 5);

  assert.equal(features.length, 1);
  assert.equal(features[0].weight, 1);
});

test("rejects empty samples and invalid feature counts", () => {
  assert.throws(() => extractOklabKMedoids([]), /empty pixel sample/);
  assert.throws(() => extractOklabKMedoids([[0, 0, 0]], 0), /positive integer/);
});