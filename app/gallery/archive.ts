import { supabasePublicConfiguration } from "@/lib/supabase/config";
import type { PhotographPaletteColour } from "@/lib/photographs/types";

const galleryBucket = "elliotmairet";

export type PaletteColour = PhotographPaletteColour;

export function photographUrl(storagePath: string) {
  const { url } = supabasePublicConfiguration();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");

  return `${url}/storage/v1/object/public/${galleryBucket}/${encodedPath}`;
}

export function photographDate(filename: string) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function deltaE76(first: PaletteColour, second: PaletteColour) {
  const lightnessDelta = first.lab_l - second.lab_l;
  const greenRedDelta = first.lab_a - second.lab_a;
  const blueYellowDelta = first.lab_b - second.lab_b;

  return Math.hypot(lightnessDelta, greenRedDelta, blueYellowDelta);
}