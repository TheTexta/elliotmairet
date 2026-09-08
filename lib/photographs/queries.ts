import { unstable_cache } from "next/cache";

import { cacheTags } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";

import type {
  Photograph,
  PhotographPaletteColour,
  PhotographWithPalette,
} from "./types";

const photographColumns = `
  id,
  storage_path,
  filename,
  image_width,
  image_height,
  captured_at,
  title,
  alt_text,
  sort_order
`;

type PhotographRow = {
  id: string;
  storage_path: string;
  filename: string;
  image_width: number;
  image_height: number;
  captured_at: string | null;
  title: string | null;
  alt_text: string | null;
  sort_order: number | null;
};

type PaletteColourRow = {
  photograph_id: string;
  rank: number;
  hex: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
};

function photographFromRow(row: PhotographRow): Photograph {
  return {
    id: row.id,
    storagePath: row.storage_path,
    filename: row.filename,
    width: row.image_width,
    height: row.image_height,
    capturedAt: row.captured_at,
    title: row.title,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    year: row.captured_at?.slice(0, 4) ?? row.filename.slice(0, 4),
  };
}

function paletteColourFromRow(row: PaletteColourRow): PhotographPaletteColour {
  return {
    photographId: row.photograph_id,
    rank: row.rank,
    hex: row.hex,
    lab_l: row.lab_l,
    lab_a: row.lab_a,
    lab_b: row.lab_b,
  };
}

async function readPhotographs(): Promise<Photograph[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("filename", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as PhotographRow[]).map(photographFromRow);
}

export const getPhotographs = unstable_cache(readPhotographs, ["photographs", "catalogue"], {
  revalidate: 86400,
  tags: [cacheTags.photographCatalogue, cacheTags.colourSimilarity],
});

async function readPhotographByFilename(
  filename: string,
): Promise<Photograph | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .eq("filename", filename)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? photographFromRow(data as PhotographRow) : null;
}

export const getPhotographByFilename = unstable_cache(
  readPhotographByFilename,
  ["photographs", "by-filename"],
  { revalidate: 86400, tags: [cacheTags.photographDetails] },
);

async function readPhotographById(
  id: string,
): Promise<Photograph | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? photographFromRow(data as PhotographRow) : null;
}

export const getPhotographById = unstable_cache(
  readPhotographById,
  ["photographs", "by-id"],
  { revalidate: 86400, tags: [cacheTags.photographDetails] },
);

async function readPhotographPalette(
  photographId: string,
): Promise<PhotographPaletteColour[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photo_palette_colours")
    .select("photograph_id, rank, hex, lab_l, lab_a, lab_b")
    .eq("photograph_id", photographId)
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data as PaletteColourRow[]).map(paletteColourFromRow);
}

export const getPhotographPalette = unstable_cache(
  readPhotographPalette,
  ["photographs", "palette"],
  { revalidate: 86400, tags: [cacheTags.palettes, cacheTags.colourSimilarity] },
);

export async function getPhotographsWithPalettes(): Promise<
  PhotographWithPalette[]
> {
  const [photographs, paletteRows] = await Promise.all([
    getPhotographs(),
    getAllPaletteColours(),
  ]);
  const palettes = new Map<string, PhotographPaletteColour[]>();

  for (const colour of paletteRows) {
    const palette = palettes.get(colour.photographId) ?? [];
    palette.push(colour);
    palettes.set(colour.photographId, palette);
  }

  return photographs.map((photograph) => ({
    ...photograph,
    palette: palettes.get(photograph.id) ?? [],
  }));
}

async function readAllPaletteColours(): Promise<PhotographPaletteColour[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photo_palette_colours")
    .select("photograph_id, rank, hex, lab_l, lab_a, lab_b")
    .order("photograph_id", { ascending: true })
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data as PaletteColourRow[]).map(paletteColourFromRow);
}

const getAllPaletteColours = unstable_cache(
  readAllPaletteColours,
  ["photographs", "all-palette-colours"],
  { revalidate: 86400, tags: [cacheTags.palettes, cacheTags.colourSimilarity] },
);
