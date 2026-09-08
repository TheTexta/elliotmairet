import { PHOTOGRAPH_BUCKET } from "./config";
import { supabasePublicConfiguration } from "@/lib/supabase/config";

export function photographUrl(storagePath: string) {
  const { url } = supabasePublicConfiguration();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");

  return `${url}/storage/v1/object/public/${PHOTOGRAPH_BUCKET}/${encodedPath}`;
}
