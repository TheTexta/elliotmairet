import { createHash } from "node:crypto";
import sharp from "sharp";

export const CLOUDFLARE_MAX_IMAGE_PIXELS = 100_000_000;
export const CLOUDFLARE_MAX_IMAGE_BYTES = 100_000_000;
const maximumSourceDimension = 12_000;
const maximumDeliveryDimension = 5120;

export function needsImageDeliverySource(width: number, height: number, bytes: number) {
  return width * height > CLOUDFLARE_MAX_IMAGE_PIXELS
    || Math.max(width, height) > maximumSourceDimension
    || bytes > CLOUDFLARE_MAX_IMAGE_BYTES;
}

export function imageDeliverySourceKey(originalKey: string) {
  return `__image-sources/${createHash("sha256").update(originalKey).digest("hex")}.webp`;
}

export async function createImageDeliverySource(buffer: Buffer, width: number, height: number) {
  if (!needsImageDeliverySource(width, height, buffer.length)) return undefined;
  // Upload validation runs before this helper. Backfills use verified catalogue originals.
  const bytes = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .resize({ width: maximumDeliveryDimension, height: maximumDeliveryDimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 95 })
    .toBuffer();
  if (bytes.length > CLOUDFLARE_MAX_IMAGE_BYTES) throw new Error("The image delivery source is too large.");
  return bytes;
}
