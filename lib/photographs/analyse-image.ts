import readExif from "exif-reader";
import sharp from "sharp";

import {
  extractKMeansPalette,
  K_MEANS_ALGORITHM,
  K_MEANS_ITERATIONS,
  rgbToHex,
  rgbToLab,
} from "@/lib/palette/k-means.js";

const paletteSize = 5;
const sampleLongestSide = 96;
const maximumInputPixels = 120_000_000;

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
  const metadata = await sharp(buffer, { limitInputPixels: maximumInputPixels }).metadata();
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
  const { data, info } = await sharp(buffer, { limitInputPixels: maximumInputPixels })
    .rotate()
    .resize({
      width: sampleLongestSide,
      height: sampleLongestSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: [number, number, number][] = [];

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] > 200) {
      pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
    }
  }

  const colours = extractKMeansPalette(pixels, paletteSize).map(
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

  return {
    photograph_id: photographId,
    algorithm: K_MEANS_ALGORITHM,
    algorithm_iterations: K_MEANS_ITERATIONS,
    sample_longest_side: sampleLongestSide,
    palette_size: paletteSize,
    analyzed_at: new Date().toISOString(),
    colours,
  };
}
