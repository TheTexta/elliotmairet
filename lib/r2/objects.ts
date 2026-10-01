const photographObjectKeyPattern =
  /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;
const stagedPhotographObjectKeyPattern =
  /^staging\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

export const PUBLISHED_OBJECT_CACHE_CONTROL = "public, max-age=3600, must-revalidate";

export type PhotographObjectExtension = "jpg" | "png" | "webp";

export function photographObjectKey(
  photographId: string,
  extension: PhotographObjectExtension,
) {
  const key = `uploads/${photographId}.${extension}`;

  if (!photographObjectKeyPattern.test(key)) {
    throw new Error("Invalid photograph object key.");
  }

  return key;
}

export function stagedPhotographObjectKey(
  photographId: string,
  extension: PhotographObjectExtension,
) {
  const key = `staging/${photographId}.${extension}`;

  if (!stagedPhotographObjectKeyPattern.test(key)) {
    throw new Error("Invalid staged photograph object key.");
  }

  return key;
}

export function parsePhotographObjectKey(key: unknown) {
  if (typeof key !== "string") {
    return null;
  }

  const match = key.match(photographObjectKeyPattern);

  if (!match) {
    return null;
  }

  return {
    photographId: match[1].toLowerCase(),
    extension: match[2].toLowerCase() as PhotographObjectExtension,
    key: match[0],
  };
}

export function parseStagedPhotographObjectKey(key: unknown) {
  if (typeof key !== "string") {
    return null;
  }

  const match = key.match(stagedPhotographObjectKeyPattern);

  if (!match) {
    return null;
  }

  return {
    photographId: match[1].toLowerCase(),
    extension: match[2].toLowerCase() as PhotographObjectExtension,
    key: match[0],
  };
}

export function publicObjectUrl(baseUrl: string, key: string) {
  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("The R2 public URL must use HTTPS.");
  }

  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodedKey}`;

  return url.toString();
}