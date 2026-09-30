import assert from "node:assert/strict";
import { test } from "node:test";

import { findColourMatches } from "./find-colour-matches.ts";

function photograph(filename, colours, featureSpace = "oklab") {
  return {
    filename,
    width: 100,
    height: 100,
    year: "2024",
    imageUrl: `https://example.com/${filename}`,
    palette: colours.map(([hex, lightness, axisA, axisB]) => ({
      hex,
      lightness,
      axisA,
      axisB,
      featureSpace,
    })),
  };
}

const source = photograph("source.jpg", [
  ["#aa0000", 0.5, 0.2, 0.1],
  ["#00aa00", 0.6, -0.2, 0.1],
]);
const near = photograph("near.jpg", [
  ["#ab0000", 0.51, 0.2, 0.1],
  ["#00ab00", 0.61, -0.2, 0.1],
]);
const far = photograph("far.jpg", [
  ["#0000aa", 0.2, 0.05, -0.3],
  ["#aaaa00", 0.9, 0.0, 0.3],
]);
const grey = photograph("grey.jpg", [
  ["#777777", 0.5, 0, 0],
  ["#888888", 0.6, 0, 0],
]);
const cielab = photograph("cielab.jpg", [
  ["#aa0000", 50, 20, 10],
  ["#00aa00", 60, -20, 10],
], "cielab");

test("excludes the source and ranks candidates by difference", () => {
  const result = findColourMatches(
    [source, far, near, grey, cielab],
    ["AA0000", "00aa00"],
    "source.jpg",
  );

  assert.deepEqual(result?.matches.map(({ filename }) => filename), ["near.jpg", "far.jpg"]);
  assert.equal(result?.matches[0].closestHex, "#ab0000");
  assert.deepEqual(result?.matches[0].palette, ["#ab0000", "#00ab00"]);
  assert.equal(result?.threshold, result?.matches[1].difference);
});

test("uses the OKLab baseline threshold when enough matches exist", () => {
  const nearby = Array.from({ length: 6 }, (_, index) =>
    photograph(`near-${index}.jpg`, [
      ["#ab0000", 0.5 + index * 0.001, 0.2, 0.1],
      ["#00ab00", 0.6, -0.2, 0.1],
    ]),
  );
  const result = findColourMatches([source, ...nearby, far], ["#aa0000"], "source.jpg");

  assert.equal(result?.threshold, 0.1);
  assert.equal(result?.matches.length, 6);
});

test("rejects colours outside the source palette", () => {
  assert.equal(findColourMatches([source, near], ["#123456"], "source.jpg"), null);
});

test("rejects invalid hex input", () => {
  assert.equal(findColourMatches([source, near], ["zzzzzz"], "source.jpg"), null);
  assert.equal(findColourMatches([source, near], [], "source.jpg"), null);
});
