import { unstable_cache } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";

import { cacheTags } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import type { CaptionMode } from "./text";

import type {
  Photograph,
  PhotographPaletteColour,
  PhotographWithPalette,
} from "./types";

// Bypass pre-release data retained across deployments after the owner's deletions.
const photographCacheVersion = "2026-11-03";

const legacyPhotographColumns = `
  id,
  storage_path,
  filename,
  image_width,
  image_height,
  captured_at,
  updated_at,
  title,
  alt_text,
  sort_order
`;
const photographColumns = `${legacyPhotographColumns}, description, caption_mode, custom_caption, text_revision`;

function missingTextMigration(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

type PhotographRow = {
  id: string;
  storage_path: string;
  filename: string;
  image_width: number;
  image_height: number;
  captured_at: string | null;
  updated_at: string;
  title: string | null;
  alt_text: string | null;
  description?: string | null;
  caption_mode?: CaptionMode;
  custom_caption?: string | null;
  text_revision?: number;
  sort_order: number | null;
};

type PaletteColourRow = {
  photograph_id: string;
  rank: number;
  hex: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  weight?: number;
};

type OklabFeatureRow = {
  photograph_id: string;
  rank: number;
  hex: string;
  oklab_l: number;
  oklab_a: number;
  oklab_b: number;
  weight?: number;
};

function photographFromRow(row: PhotographRow): Photograph {
  return {
    id: row.id,
    storagePath: row.storage_path,
    filename: row.filename,
    width: row.image_width,
    height: row.image_height,
    capturedAt: row.captured_at,
    updatedAt: row.updated_at,
    title: row.title,
    altText: row.alt_text,
    description: row.description ?? null,
    captionMode: row.caption_mode ?? "description",
    customCaption: row.custom_caption ?? null,
    textRevision: row.text_revision ?? 0,
    textMetadataAvailable: row.text_revision !== undefined,
    sortOrder: row.sort_order,
    year: row.captured_at?.slice(0, 4) ?? row.filename.slice(0, 4),
  };
}

function paletteColourFromRow(row: PaletteColourRow): PhotographPaletteColour {
  return {
    photographId: row.photograph_id,
    rank: row.rank,
    hex: row.hex,
    lightness: row.lab_l,
    axisA: row.lab_a,
    axisB: row.lab_b,
    featureSpace: "cielab",
    weight: row.weight,
  };
}

function oklabFeatureFromRow(row: OklabFeatureRow): PhotographPaletteColour {
  return {
    photographId: row.photograph_id,
    rank: row.rank,
    hex: row.hex,
    lightness: row.oklab_l,
    axisA: row.oklab_a,
    axisB: row.oklab_b,
    featureSpace: "oklab",
    weight: row.weight,
  };
}

async function readPhotographs(): Promise<Photograph[]> {
  const supabase = createPublicClient();
  let { data, error }: { data: PhotographRow[] | null; error: PostgrestError | null } = await supabase
    .from("photographs")
    .select(photographColumns)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("filename", { ascending: false })
    .order("id", { ascending: true });

  // The additive migration may not be deployed yet. Only a missing-column
  // response enables legacy reads; authorization/network failures still fail.
  if (missingTextMigration(error)) {
    ({ data, error } = await supabase.from("photographs").select(legacyPhotographColumns)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("captured_at", { ascending: false, nullsFirst: false })
      .order("filename", { ascending: false }).order("id", { ascending: true }));
  }

  if (error) {
    throw error;
  }

  return (data as PhotographRow[]).map(photographFromRow);
}

export const getPhotographs = unstable_cache(readPhotographs, [photographCacheVersion, "photographs", "catalogue"], {
  revalidate: 86400,
  tags: [cacheTags.photographCatalogue, cacheTags.colourSimilarity],
});

async function readPhotographByFilename(
  filename: string,
): Promise<Photograph | null> {
  const supabase = createPublicClient();
  let { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .eq("filename", filename)
    .maybeSingle();

  if (missingTextMigration(error)) {
    ({ data, error } = await supabase.from("photographs").select(legacyPhotographColumns).eq("filename", filename).maybeSingle());
  }

  if (error) {
    throw error;
  }

  return data ? photographFromRow(data as PhotographRow) : null;
}

export const getPhotographByFilename = unstable_cache(
  readPhotographByFilename,
  [photographCacheVersion, "photographs", "by-filename"],
  { revalidate: 86400, tags: [cacheTags.photographDetails] },
);

async function readPhotographById(
  id: string,
): Promise<Photograph | null> {
  const supabase = createPublicClient();
  let { data, error } = await supabase
    .from("photographs")
    .select(photographColumns)
    .eq("id", id)
    .maybeSingle();

  if (missingTextMigration(error)) {
    ({ data, error } = await supabase.from("photographs").select(legacyPhotographColumns).eq("id", id).maybeSingle());
  }

  if (error) {
    throw error;
  }

  return data ? photographFromRow(data as PhotographRow) : null;
}

export const getPhotographById = unstable_cache(
  readPhotographById,
  [photographCacheVersion, "photographs", "by-id"],
  { revalidate: 86400, tags: [cacheTags.photographDetails] },
);

async function readPhotographPalette(
  photographId: string,
): Promise<PhotographPaletteColour[]> {
  const supabase = createPublicClient();
  const [oklabResult, paletteResult] = await Promise.all([
    supabase
      .from("photo_oklab_features")
      .select("photograph_id, rank, hex, oklab_l, oklab_a, oklab_b, weight")
      .eq("photograph_id", photographId)
      .order("rank", { ascending: true }),
    supabase
      .from("photo_palette_colours")
      .select("photograph_id, rank, hex, lab_l, lab_a, lab_b, weight")
      .eq("photograph_id", photographId)
      .order("rank", { ascending: true }),
  ]);

  if (oklabResult.error) throw oklabResult.error;
  if (paletteResult.error) throw paletteResult.error;

  const oklabFeatures = (oklabResult.data as OklabFeatureRow[]).map(oklabFeatureFromRow);
  return oklabFeatures.length
    ? oklabFeatures
    : (paletteResult.data as PaletteColourRow[]).map(paletteColourFromRow);
}

export const getPhotographPalette = unstable_cache(
  readPhotographPalette,
  [photographCacheVersion, "photographs", "palette"],
  { revalidate: 86400, tags: [cacheTags.palettes, cacheTags.colourSimilarity] },
);

export async function getPhotographsWithPalettes(): Promise<
  PhotographWithPalette[]
> {
  const [photographs, paletteRows, oklabRows] = await Promise.all([
    getPhotographs(),
    getAllPaletteColours(),
    getAllOklabFeatures(),
  ]);
  const palettes = new Map<string, PhotographPaletteColour[]>();
  const oklabFeatures = new Map<string, PhotographPaletteColour[]>();

  for (const colour of paletteRows) {
    const palette = palettes.get(colour.photographId) ?? [];
    palette.push(colour);
    palettes.set(colour.photographId, palette);
  }

  for (const feature of oklabRows) {
    const features = oklabFeatures.get(feature.photographId) ?? [];
    features.push(feature);
    oklabFeatures.set(feature.photographId, features);
  }

  return photographs.map((photograph) => ({
    ...photograph,
    palette: oklabFeatures.get(photograph.id) ?? palettes.get(photograph.id) ?? [],
  }));
}

async function readAllPaletteColours(): Promise<PhotographPaletteColour[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photo_palette_colours")
    .select("photograph_id, rank, hex, lab_l, lab_a, lab_b, weight")
    .order("photograph_id", { ascending: true })
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data as PaletteColourRow[]).map(paletteColourFromRow);
}

const getAllPaletteColours = unstable_cache(
  readAllPaletteColours,
  [photographCacheVersion, "photographs", "all-palette-colours"],
  { revalidate: 86400, tags: [cacheTags.palettes, cacheTags.colourSimilarity] },
);

async function readAllOklabFeatures(): Promise<PhotographPaletteColour[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photo_oklab_features")
    .select("photograph_id, rank, hex, oklab_l, oklab_a, oklab_b, weight")
    .order("photograph_id", { ascending: true })
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data as OklabFeatureRow[]).map(oklabFeatureFromRow);
}

const getAllOklabFeatures = unstable_cache(
  readAllOklabFeatures,
  [photographCacheVersion, "photographs", "all-oklab-features"],
  { revalidate: 86400, tags: [cacheTags.palettes, cacheTags.colourSimilarity] },
);
