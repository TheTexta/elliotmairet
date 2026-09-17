import { photographUrl } from "@/lib/photographs/storage";

import type { Photograph } from "@/lib/photographs/types";

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

export function photographImageAlt(photograph: Photograph) {
  return (
    normalizedText(photograph.altText) ??
    normalizedText(photograph.title) ??
    `Photograph from ${photograph.year}`
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
  return {
    alt: photographImageAlt(photograph),
    height: photograph.height,
    url: photographUrl(photograph.storagePath),
    width: photograph.width,
  };
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