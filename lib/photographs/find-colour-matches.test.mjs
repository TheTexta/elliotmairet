import assert from "node:assert/strict";
import { test } from "node:test";

import { findColourMatches } from "./find-colour-matches.ts";
import { closestPaletteMatch } from "./colour.ts";

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

test("descriptions survive matching without changing ranks or legacy results", () => {
  const legacy = findColourMatches([source, near, far], ["#aa0000"], "source.jpg");
  const described = findColourMatches(
    [source, { ...near, alt: "A red door in Montreal" }, far],
    ["#aa0000"],
    "source.jpg",
  );
  assert.equal(described.matches[0].alt, "A red door in Montreal");
  const { alt, ...firstMatch } = described.matches[0];
  assert.ok(alt);
  assert.deepEqual(firstMatch, legacy.matches[0]);
  assert.deepEqual(described.matches.slice(1), legacy.matches.slice(1));
  assert.equal(described.threshold, legacy.threshold);
});

test("full-palette searches include a similar photograph with fewer genuine swatches", () => {
  const source = photograph("two-greys", [["#777777", 0.56, 0, 0], ["#888888", 0.63, 0, 0]]);
  const candidate = photograph("one-grey", [["#808080", 0.60, 0, 0]]);
  const result = findColourMatches([source, candidate], source.palette.map(p => p.hex), source.filename);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].filename, candidate.filename);
  assert.ok(Math.abs(result.matches[0].difference - Math.hypot(0.04, 0.03) / Math.sqrt(2)) < 1e-10);
});

test("shorter-palette matching cannot discard unmatched source or candidate colours", () => {
  const selected = photograph("selected", [["#777777", 0.5, 0, 0], ["#787878", 0.51, 0, 0], ["#797979", 0.52, 0, 0]]).palette;
  const candidate = photograph("candidate", [["#777777", 0.5, 0, 0], ["#ffffff", 1, 0, 0]]).palette;
  assert.ok(closestPaletteMatch(selected, candidate).difference > 0.2, "The white candidate swatch was ignored");
  const oneColour = photograph("one", [["#aa0000", 0.5, 0.2, 0.1]]).palette;
  assert.ok(closestPaletteMatch(source.palette, oneColour).difference > 0.2, "The green source swatch was ignored");
});
