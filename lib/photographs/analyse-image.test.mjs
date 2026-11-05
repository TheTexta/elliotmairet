import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import * as vibrant from "../palette/mmcq-vibrant.js";
import { analyseImage, imageMetadata } from "./analyse-image.ts";
import { MAXIMUM_INPUT_PIXELS } from "./config.ts";
import { MAXIMUM_TRUSTED_ARCHIVE_PIXELS } from "../palette/analyse-buffer.ts";

test("upload analysis uses versioned MMCQ swatches in BOTH separate coordinate spaces", async () => {
  const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#b02040" } }).png().toBuffer();
  const analysis = await analyseImage(image, "photograph-id");
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
  await assert.rejects(analyseImage(image, "transparent"), /empty pixel sample/);
});

test("metadata orientation and stored photograph dimensions remain unchanged", async () => {
  const image = await sharp({ create: { width: 32, height: 16, channels: 3, background: "#999999" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const metadata = await imageMetadata(image);
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 32);
});

test("trusted archive allowance keeps the exact sampler and the public upload guard", async () => {
  assert.equal(MAXIMUM_INPUT_PIXELS, 120_000_000);
  const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#b02040" } }).jpeg().toBuffer();
  const ordinary = await analyseImage(image, "same-id");
  const trusted = await analyseImage(image, "same-id", { maximumInputPixels: MAXIMUM_TRUSTED_ARCHIVE_PIXELS });
  assert.deepEqual(trusted.colours, ordinary.colours);
  assert.deepEqual(trusted.oklab_features.features, ordinary.oklab_features.features);
  for (const limit of [0, Infinity, MAXIMUM_TRUSTED_ARCHIVE_PIXELS + 1]) {
    await assert.rejects(analyseImage(image, "invalid", { maximumInputPixels: limit }), /input limit/);
  }
  // Change only JPEG header dimensions: Sharp must reject before any decoding.
  const oversizedHeader = Buffer.from(image);
  const sof = oversizedHeader.indexOf(Buffer.from([0xff, 0xc0]));
  assert(sof > 0);
  oversizedHeader.writeUInt16BE(10_000, sof + 5);
  oversizedHeader.writeUInt16BE(15_000, sof + 7);
  await assert.rejects(analyseImage(oversizedHeader, "default-limit"), /pixel limit/);
  await assert.rejects(imageMetadata(oversizedHeader), /pixel limit/);
});
