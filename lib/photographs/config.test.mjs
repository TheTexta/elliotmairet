import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  MAXIMUM_UPLOAD_BYTES,
  MAXIMUM_INPUT_PIXELS,
  OVERSIZED_UPLOAD_ERROR,
  uploadSizeError,
} from "./config.ts";

test("upload size validation rejects absent and invalid sizes", () => {
  assert.equal(uploadSizeError(undefined), "The image size is invalid.");
  assert.equal(uploadSizeError(-1), "The image size is invalid.");
  assert.equal(uploadSizeError(1.5), "The image size is invalid.");
});

test("upload size validation rejects empty files", () => {
  assert.equal(uploadSizeError(0), "Choose a non-empty image to upload.");
});

test("upload size validation accepts the 512 MiB boundary", () => {
  assert.equal(uploadSizeError(MAXIMUM_UPLOAD_BYTES - 1), null);
  assert.equal(uploadSizeError(MAXIMUM_UPLOAD_BYTES), null);
});

test("upload size validation rejects one byte above 512 MiB", () => {
  assert.equal(uploadSizeError(MAXIMUM_UPLOAD_BYTES + 1), OVERSIZED_UPLOAD_ERROR);
});

test("Sharp rejects an image above the 120-megapixel decoded limit", async () => {
  const width = 12_001;
  const height = 10_000;
  const image = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`,
  );

  await assert.rejects(
    sharp(image, { limitInputPixels: MAXIMUM_INPUT_PIXELS }).metadata(),
    /exceeds pixel limit/i,
  );
});
