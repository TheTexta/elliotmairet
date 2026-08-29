const galleryStorageBaseUrl =
  "https://api.dextery.dev/storage/v1/object/public/elliotmairet";
const paletteApiUrl =
  "https://api.dextery.dev/rest/v1/photo_palette_colours?select=storage_path,rank,hex,lab_l,lab_a,lab_b&order=storage_path.asc,rank.asc";
const publicPaletteApiKey =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDU1MzcwMCwiZXhwIjo0OTMwMjI3MzAwLCJyb2xlIjoiYW5vbiJ9.HVtr0mMAc2VYP7Ap8z4Q0QCyUp1IJLwGAIjyKWaBYDY";

export type PaletteColour = {
  storage_path: string;
  rank: number;
  hex: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
};

export function photographUrl(filename: string) {
  return galleryStorageBaseUrl + "/" + encodeURIComponent(filename);
}

export function photographDate(filename: string) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export async function archivePaletteColours(): Promise<
  Map<string, PaletteColour[]>
> {
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    publicPaletteApiKey;

  try {
    const response = await fetch(paletteApiUrl, {
      cache: "force-cache",
      headers: { apikey: anonKey },
    });

    if (!response.ok) {
      throw new Error(`Palette request failed with ${response.status}.`);
    }

    const rows = (await response.json()) as PaletteColour[];
    const palettes = new Map<string, PaletteColour[]>();

    for (const row of rows) {
      if (
        !/^#[0-9a-f]{6}$/i.test(row.hex) ||
        row.rank < 1 ||
        row.rank > 5 ||
        !Number.isFinite(row.lab_l) ||
        !Number.isFinite(row.lab_a) ||
        !Number.isFinite(row.lab_b)
      ) {
        continue;
      }

      const palette = palettes.get(row.storage_path) ?? [];
      palette.push(row);
      palettes.set(row.storage_path, palette);
    }

    return palettes;
  } catch (error) {
    console.error("Unable to load archive palettes.", error);
    return new Map<string, PaletteColour[]>();
  }
}

export async function archivePalettes() {
  const palettes = await archivePaletteColours();

  return new Map(
    [...palettes].map(([storagePath, colours]) => [
      storagePath,
      colours.map(({ hex }) => hex),
    ]),
  );
}

export function deltaE76(first: PaletteColour, second: PaletteColour) {
  const lightnessDelta = first.lab_l - second.lab_l;
  const greenRedDelta = first.lab_a - second.lab_a;
  const blueYellowDelta = first.lab_b - second.lab_b;

  return Math.hypot(lightnessDelta, greenRedDelta, blueYellowDelta);
}