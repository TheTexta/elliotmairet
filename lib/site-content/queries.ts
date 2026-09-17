import { unstable_cache } from "next/cache";

import { cacheTags } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";

export const defaultFooterText =
  "Elliot Mairet is a Montreal based photographer from Victoria BC.\n\nAbove all else he is grateful for you";
export const defaultSeoTitle = "Elliot Mairet";
export const defaultSeoDescription =
  "Photographs by Elliot Mairet, a Montreal based photographer from Victoria BC.";

export type SiteContent = {
  footerText: string;
  seoDescription: string;
  seoTitle: string;
};

type SiteContentRow = {
  footer_text: string;
  seo_description: string | null;
  seo_title: string | null;
};

const defaultSiteContent: SiteContent = {
  footerText: defaultFooterText,
  seoDescription: defaultSeoDescription,
  seoTitle: defaultSeoTitle,
};

export const getSiteContent = unstable_cache(async (): Promise<SiteContent> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_content")
    .select("footer_text, seo_title, seo_description")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    console.error("site_content_footer_read_failed", {
      message: error?.message ?? "The singleton row is missing.",
    });
    return defaultSiteContent;
  }

  const row = data as SiteContentRow;

  return {
    footerText: row.footer_text,
    seoDescription: row.seo_description?.trim() || defaultSeoDescription,
    seoTitle: row.seo_title?.trim() || defaultSeoTitle,
  };
}, ["site-content", "footer"], {
  revalidate: 86400,
  tags: [cacheTags.siteContent],
});

export async function getFooterText() {
  return (await getSiteContent()).footerText;
}
