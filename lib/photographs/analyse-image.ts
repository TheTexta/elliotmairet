import readExif from "exif-reader";
import sharp from "sharp";

import {
  rgbToHex,
  rgbToLab,
} from "@/lib/palette/k-means.js";
import {
  MMCQ_VIBRANT_ALGORITHM,
  MMCQ_PASSES,
  MMCQ_SAMPLE_LONGEST_SIDE,
} from "@/lib/palette/mmcq-vibrant.js";
import { MAXIMUM_INPUT_PIXELS } from "@/lib/photographs/config";
import { extractImagePalette } from "@/lib/palette/analyse-buffer";

const sampleLongestSide = MMCQ_SAMPLE_LONGEST_SIDE;

function capturedDate(exifBuffer: Buffer | undefined) {
  if (!exifBuffer) {
    return null;
  }

  try {
    const exif = readExif(exifBuffer);
    const value = exif.Photo?.DateTimeOriginal
      ?? exif.Photo?.DateTimeDigitized
      ?? exif.Image?.DateTime;

    return value instanceof Date && !Number.isNaN(value.valueOf())
      ? value.toISOString().slice(0, 10)
      : null;
  } catch {
    return null;
  }
}

export async function imageMetadata(buffer: Buffer) {
  const metadata = await sharp(buffer, { limitInputPixels: MAXIMUM_INPUT_PIXELS }).metadata();
  const orientationSwapsDimensions = metadata.orientation
    ? metadata.orientation >= 5 && metadata.orientation <= 8
    : false;
  const width = orientationSwapsDimensions ? metadata.height : metadata.width;
  const height = orientationSwapsDimensions ? metadata.width : metadata.height;

  if (!width || !height) {
    throw new Error("The selected file does not contain valid image dimensions.");
  }

  return {
    capturedAt: capturedDate(metadata.exif),
    format: metadata.format,
    height,
    width,
  };
}

export async function analyseImage(buffer: Buffer, photographId: string) {
  const selectedPalette = await extractImagePalette(buffer);
  const colours = selectedPalette.map(
    ({ rgb, weight }, index) => {
      const [labL, labA, labB] = rgbToLab(rgb);

      return {
        rank: index + 1,
        red: rgb[0],
        green: rgb[1],
        blue: rgb[2],
        hex: rgbToHex(rgb),
        lab_l: labL,
        lab_a: labA,
        lab_b: labB,
        weight: Number(weight.toFixed(6)),
      };
    },
  );
  const oklabFeatures = selectedPalette.map(
    ({ rgb, oklab, weight }, index) => ({
      rank: index + 1,
      red: rgb[0],
      green: rgb[1],
      blue: rgb[2],
      hex: rgbToHex(rgb),
      oklab_l: oklab[0],
      oklab_a: oklab[1],
      oklab_b: oklab[2],
      weight: Number(weight.toFixed(6)),
    }),
  );
  const analyzedAt = new Date().toISOString();

  return {
    photograph_id: photographId,
    algorithm: MMCQ_VIBRANT_ALGORITHM,
    algorithm_iterations: MMCQ_PASSES,
    sample_longest_side: sampleLongestSide,
    palette_size: colours.length,
    analyzed_at: analyzedAt,
    colours,
    oklab_features: {
      photograph_id: photographId,
      algorithm: MMCQ_VIBRANT_ALGORITHM,
      algorithm_iterations: MMCQ_PASSES,
      sample_longest_side: sampleLongestSide,
      feature_count: oklabFeatures.length,
      analyzed_at: analyzedAt,
      features: oklabFeatures,
    },
  };
}
