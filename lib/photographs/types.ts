import type { CaptionMode, TextSources } from "./text";

export type Photograph = {
  id: string;
  storagePath: string;
  filename: string;
  width: number;
  height: number;
  capturedAt: string | null;
  updatedAt: string;
  title: string | null;
  altText: string | null;
  description: string | null;
  captionMode: CaptionMode;
  customCaption: string | null;
  textRevision: number;
  textMetadataAvailable: boolean;
  // Admin enrichment only; public queries never read private ownership records.
  textSources?: TextSources;
  sortOrder: number | null;
  year: string;
};

export type PhotographPaletteColour = {
  photographId: string;
  rank: number;
  hex: string;
  lightness: number;
  axisA: number;
  axisB: number;
  featureSpace: "cielab" | "oklab";
  weight?: number;
};

export type PhotographWithPalette = Photograph & {
  palette: PhotographPaletteColour[];
};
