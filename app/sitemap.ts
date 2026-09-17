import type { MetadataRoute } from "next";

import { getPhotographs } from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";
import { absoluteUrl, photographPath } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const photographs = await getPhotographs();
  const homepageLastModified = photographs[0]?.updatedAt;

  return [
    {
      changeFrequency: "weekly",
      priority: 1,
      url: absoluteUrl("/"),
      ...(homepageLastModified ? { lastModified: homepageLastModified } : {}),
    },
    ...photographs.map((photograph) => ({
      changeFrequency: "monthly" as const,
      images: [photographUrl(photograph.storagePath)],
      lastModified: photograph.updatedAt ?? photograph.capturedAt ?? undefined,
      priority: 0.8,
      url: absoluteUrl(photographPath(photograph.filename)),
    })),
  ];
}