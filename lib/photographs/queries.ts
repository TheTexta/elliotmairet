import { createClient } from "@/lib/supabase/server";

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

export async function getPhotographs(): Promise<Photograph[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("filename", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as PhotographRow[]).map(photographFromRow);
}

export async function getPhotographByFilename(
  filename: string,
): Promise<Photograph | null> {
  const supabase = await createClient();
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

export async function getPhotographById(
  id: string,
): Promise<Photograph | null> {
  const supabase = await createClient();
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

export async function getPhotographPalette(
  photographId: string,
): Promise<PhotographPaletteColour[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photo_palette_colours_new")
    .select("photograph_id, rank, hex, lab_l, lab_a, lab_b")
    .eq("photograph_id", photographId)
    .order("rank", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as PaletteColourRow[]).map(paletteColourFromRow);
}

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

async function getAllPaletteColours(): Promise<PhotographPaletteColour[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photo_palette_colours_new")
    .select("photograph_id, rank, hex, lab_l, lab_a, lab_b")
    .order("photograph_id", { ascending: true })
    .order("rank", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as PaletteColourRow[]).map(paletteColourFromRow);
}