import { PHOTOGRAPH_BUCKET } from "./config.ts";
import { publicObjectUrl } from "../r2/objects.ts";
import { supabasePublicConfiguration } from "../supabase/config.ts";

export function photographUrl(storagePath: string) {
  const r2PublicUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.trim();

  if (r2PublicUrl) {
    return publicObjectUrl(r2PublicUrl, storagePath);
  }

  const { url } = supabasePublicConfiguration();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");

  return `${url}/storage/v1/object/public/${PHOTOGRAPH_BUCKET}/${encodedPath}`;
}
