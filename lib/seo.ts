import photographImageLoader from "./photographs/image-loader.ts";
import { photographUrl } from "./photographs/storage.ts";

import type { Photograph } from "./photographs/types.ts";

export const siteOrigin = "https://elliotmairet.com";
export const siteName = "Elliot Mairet";
export const siteMetadataBase = new URL(siteOrigin);

export function absoluteUrl(pathname: string) {
  return new URL(pathname, siteMetadataBase).toString();
}

export function photographPath(filename: string) {
  return `/gallery/${encodeURIComponent(filename)}`;
}

function normalizedText(value: string | null | undefined) {
  return value?.trim() || null;
}

function readableFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function photographImageAlt(photograph: Photograph, fallback = `Photograph from ${photograph.year}`) {
  return (
    normalizedText(photograph.altText) ??
    normalizedText(photograph.title) ??
    fallback
  );
}

export function photographDisplayTitle(photograph: Photograph) {
  const title = normalizedText(photograph.title);

  if (title) {
    return title;
  }

  return readableFilename(photograph.filename) || `Photograph from ${photograph.year}`;
}

export function photographDescription(photograph: Photograph) {
  const title = normalizedText(photograph.title);

  if (title) {
    return `${title}, ${photograph.year}. Photograph by ${siteName}.`;
  }

  const altText = normalizedText(photograph.altText);

  if (altText && altText.length <= 180) {
    return `${altText} Photograph by ${siteName}.`;
  }

  return `Photograph from ${photograph.year} by ${siteName}.`;
}

export function photographSocialImage(photograph: Photograph) {
  const width = Math.min(1200, photograph.width);

  return {
    alt: photographImageAlt(photograph),
    height: Math.max(1, Math.floor(photograph.height * width / photograph.width)),
    url: photographImageLoader({
      src: photographUrl(photograph.storagePath),
      width: 1200,
      quality: 82,
    }),
    width,
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function catalogueLastModified(photographs: readonly Pick<Photograph, "updatedAt">[]) {
  let latest: string | undefined;
  let latestTimestamp = -Infinity;

  for (const { updatedAt } of photographs) {
    const timestamp = Date.parse(updatedAt);
    if (timestamp > latestTimestamp) {
      latest = updatedAt;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export function websiteJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    description,
    name: siteName,
    publisher: {
      "@type": "Person",
      name: siteName,
      sameAs: "https://www.instagram.com/elliotmairet/",
    },
    url: siteOrigin,
  };
}

export function photographJsonLd(photograph: Photograph) {
  const canonicalPath = photographPath(photograph.filename);

  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: photographUrl(photograph.storagePath),
    creator: {
      "@type": "Person",
      name: siteName,
    },
    dateCreated: photograph.capturedAt ?? undefined,
    description: photographDescription(photograph),
    height: photograph.height,
    name: photographDisplayTitle(photograph),
    url: absoluteUrl(canonicalPath),
    width: photograph.width,
  };
}
