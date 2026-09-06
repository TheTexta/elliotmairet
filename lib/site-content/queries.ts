import { createClient } from "@supabase/supabase-js";

import { supabasePublicConfiguration } from "@/lib/supabase/config";

export const defaultFooterText =
  "Elliot Mairet is a Montreal based photographer from Victoria BC.\n\nAbove all else he is grateful for you";

export async function getFooterText() {
  const { publishableKey, url } = supabasePublicConfiguration();
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("site_content")
    .select("footer_text")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    console.error("site_content_footer_read_failed", {
      message: error?.message ?? "The singleton row is missing.",
    });
    return defaultFooterText;
  }

  return data.footer_text as string;
}