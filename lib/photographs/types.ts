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
};

export type PhotographWithPalette = Photograph & {
  palette: PhotographPaletteColour[];
};