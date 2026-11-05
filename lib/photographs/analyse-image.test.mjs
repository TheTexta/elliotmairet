import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import ts from "typescript";

import * as vibrant from "../palette/mmcq-vibrant.js";
import * as conversions from "../palette/k-means.js";
import { extractImagePalette } from "../palette/analyse-buffer.ts";
import { MAXIMUM_INPUT_PIXELS } from "./config.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("./analyse-image.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const exports = {};
runInNewContext(source, { exports, Buffer, require(name) {
  if (name === "@/lib/palette/mmcq-vibrant.js") return vibrant;
  if (name === "@/lib/palette/k-means.js") return conversions;
  if (name === "@/lib/palette/analyse-buffer") return { extractImagePalette };
  if (name === "@/lib/photographs/config") return { MAXIMUM_INPUT_PIXELS };
  return require(name);
} });

test("upload analysis uses versioned MMCQ swatches in BOTH separate coordinate spaces", async () => {
  const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#b02040" } }).png().toBuffer();
  const analysis = await exports.analyseImage(image, "photograph-id");
  assert.equal(analysis.algorithm, vibrant.MMCQ_VIBRANT_ALGORITHM);
  assert.equal(analysis.oklab_features.algorithm, vibrant.MMCQ_VIBRANT_ALGORITHM);
  assert.equal(analysis.algorithm_iterations, 2);
  assert.equal(analysis.sample_longest_side, 256);
  assert.equal(analysis.photograph_id, "photograph-id");
  assert.equal(analysis.palette_size, analysis.colours.length);
  assert.equal(analysis.oklab_features.feature_count, analysis.oklab_features.features.length);
  assert.equal(analysis.colours.length, 1, "A flat image must not be padded to five swatches");
  const colour = analysis.colours[0], feature = analysis.oklab_features.features[0];
  assert.equal(colour.hex, feature.hex);
  assert.equal(colour.hex, "#b02040");
  assert.equal(colour.weight, feature.weight);
  assert.equal(colour.weight, 1);
  assert.ok(colour.lab_l > 1 && feature.oklab_l < 1, "CIELAB and OKLab must not be conflated");
});

test("transparent pixels cannot inject arbitrary invisible colours", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 4, background: "#ff00ff00" } }).png().toBuffer();
  await assert.rejects(exports.analyseImage(image, "transparent"), /empty pixel sample/);
});

test("metadata orientation and stored photograph dimensions remain unchanged", async () => {
  const image = await sharp({ create: { width: 32, height: 16, channels: 3, background: "#999999" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const metadata = await exports.imageMetadata(image);
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 32);
});
