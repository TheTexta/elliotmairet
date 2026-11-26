import type { ColourSearchPhotograph } from "./find-colour-matches.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function decodeColourPalettes(value: unknown): ColourSearchPhotograph[] {
  if (!Array.isArray(value) || !value.every((photo) =>
    isRecord(photo) &&
    typeof photo.filename === "string" && photo.filename.length > 0 &&
    isFiniteNumber(photo.width) && photo.width > 0 &&
    isFiniteNumber(photo.height) && photo.height > 0 &&
    typeof photo.year === "string" &&
    typeof photo.imageUrl === "string" && photo.imageUrl.length > 0 &&
    (photo.alt === undefined || typeof photo.alt === "string") &&
    Array.isArray(photo.palette) && photo.palette.length <= 5 &&
    photo.palette.every((colour: unknown) =>
      isRecord(colour) &&
      typeof colour.hex === "string" && /^#[0-9a-f]{6}$/i.test(colour.hex) &&
      isFiniteNumber(colour.lightness) &&
      isFiniteNumber(colour.axisA) &&
      isFiniteNumber(colour.axisB) &&
      (colour.featureSpace === "cielab" || colour.featureSpace === "oklab"),
    ),
  )) {
    throw new Error("Palette response has an invalid catalogue shape.");
  }

  return value as ColourSearchPhotograph[];
}

type PaletteRequest = Promise<ColourSearchPhotograph[]>;
let pendingRequest: PaletteRequest | undefined;
let cachedRequest: PaletteRequest | undefined;

// Consumer cancellation must never abort this shared browser request.
// Refresh only the generation that failed for this consumer: another consumer's
// pending or already-completed recovery is reusable, even on concurrent retries.
export function loadColourPalettes(retryAfter?: PaletteRequest): PaletteRequest {
  if (pendingRequest) return pendingRequest;
  if (cachedRequest && cachedRequest !== retryAfter) return cachedRequest;

  const request = fetch(
    "/api/gallery/palettes",
    retryAfter ? { cache: "no-cache" } : undefined,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Palette request failed with ${response.status}.`);
    }

    return decodeColourPalettes(await response.json());
  });

  cachedRequest = undefined;
  pendingRequest = request;
  void request.then(
    () => {
      if (pendingRequest === request) {
        cachedRequest = request;
        pendingRequest = undefined;
      }
    },
    () => {
      if (pendingRequest === request) pendingRequest = undefined;
    },
  );
  return request;
}
