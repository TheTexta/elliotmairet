import { unstable_cache } from "next/cache";

import { cacheTags } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";

export const defaultFooterText =
  "Elliot Mairet is a Montreal based photographer from Victoria BC.\n\nAbove all else he is grateful for you";

export const getFooterText = unstable_cache(async () => {
  const supabase = createPublicClient();
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

  return data.footer_text;
}, ["site-content", "footer"], {
  revalidate: 86400,
  tags: [cacheTags.siteContent],
});
