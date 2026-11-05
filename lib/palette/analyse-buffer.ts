import sharp from "sharp";

import { MAXIMUM_INPUT_PIXELS } from "../photographs/config.ts";
import { extractMmcqVibrantPalette, MMCQ_SAMPLE_LONGEST_SIDE } from "./mmcq-vibrant.js";

export const MAXIMUM_TRUSTED_ARCHIVE_PIXELS = 150_000_000;

/** Uploads retain the default limit; verified legacy originals can opt in. */
export async function extractImagePalette(
  buffer: Buffer,
  { maximumInputPixels = MAXIMUM_INPUT_PIXELS }: { maximumInputPixels?: number } = {},
) {
  if (!Number.isSafeInteger(maximumInputPixels) || maximumInputPixels < 1 || maximumInputPixels > MAXIMUM_TRUSTED_ARCHIVE_PIXELS) {
    throw new Error("Palette analysis requires a positive input limit at most 150 megapixels.");
  }
  const { data, info } = await sharp(buffer, { limitInputPixels: maximumInputPixels })
    .rotate()
    .resize({ width: MMCQ_SAMPLE_LONGEST_SIDE, height: MMCQ_SAMPLE_LONGEST_SIDE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: [number, number, number][] = [];
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] > 200) pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  return extractMmcqVibrantPalette(pixels, 5);
}
