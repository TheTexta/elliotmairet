import { revalidateTag } from "next/cache";

import { cacheTags, paletteCacheTags, photographCacheTags } from "./cache-tags";

function expireTags(tags: readonly string[]) {
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
}

export function invalidatePhotographs() {
  expireTags(photographCacheTags);
}

export function invalidatePalettes() {
  expireTags(paletteCacheTags);
}

export function invalidatePhotographsAndPalettes() {
  expireTags([...photographCacheTags, ...paletteCacheTags]);
}

export function invalidateSiteContent() {
  expireTags([cacheTags.siteContent]);
}
