import sharp from "sharp";

import { MAXIMUM_INPUT_PIXELS } from "../photographs/config.ts";
import { extractMmcqVibrantPalette, MMCQ_SAMPLE_LONGEST_SIDE } from "./mmcq-vibrant.js";

/** Shared by publication analysis and the read-only review tool. */
export async function extractImagePalette(buffer: Buffer) {
  const { data, info } = await sharp(buffer, { limitInputPixels: MAXIMUM_INPUT_PIXELS })
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
