export const PHOTOGRAPH_BUCKET = "elliotmairet";

export const MAXIMUM_UPLOAD_BYTES = 536_870_912;
export const MAXIMUM_INPUT_PIXELS = 120_000_000;
export const OVERSIZED_UPLOAD_ERROR = "The image must be 512 MiB or smaller.";

export const PHOTOGRAPH_UPLOAD_FORMATS = {
  "image/jpeg": { extension: "jpg", sharpFormat: "jpeg" },
  "image/png": { extension: "png", sharpFormat: "png" },
  "image/webp": { extension: "webp", sharpFormat: "webp" },
} as const;

export type PhotographUploadMimeType = keyof typeof PHOTOGRAPH_UPLOAD_FORMATS;

export function uploadSizeError(size: unknown) {
  if (!Number.isSafeInteger(size) || (size as number) < 0) {
    return "The image size is invalid.";
  }

  if (size === 0) {
    return "Choose a non-empty image to upload.";
  }

  if ((size as number) > MAXIMUM_UPLOAD_BYTES) {
    return OVERSIZED_UPLOAD_ERROR;
  }

  return null;
}
