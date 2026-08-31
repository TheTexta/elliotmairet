export type Photograph = {
  id: string;
  storagePath: string;
  filename: string;
  width: number;
  height: number;
  capturedAt: string | null;
  title: string | null;
  altText: string | null;
  sortOrder: number | null;
  year: string;
};

export type PhotographPaletteColour = {
  photographId: string;
  rank: number;
  hex: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
};

export type PhotographWithPalette = Photograph & {
  palette: PhotographPaletteColour[];
};