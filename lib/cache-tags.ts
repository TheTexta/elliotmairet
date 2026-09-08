export const cacheTags = {
  colourSimilarity: "colour-similarity",
  photographCatalogue: "photograph-catalogue",
  photographDetails: "photograph-details",
  palettes: "photograph-palettes",
  siteContent: "site-content",
} as const;

export const photographCacheTags = [
  cacheTags.photographCatalogue,
  cacheTags.photographDetails,
  cacheTags.colourSimilarity,
] as const;

export const paletteCacheTags = [
  cacheTags.palettes,
  cacheTags.colourSimilarity,
] as const;
