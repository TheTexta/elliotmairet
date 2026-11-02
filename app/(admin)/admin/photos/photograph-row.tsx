import Image from "next/image";

import { photographUrl } from "@/lib/photographs/storage";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { photographCaption } from "@/lib/photographs/text";
import { photographPath } from "@/lib/seo";

import { PhotographEditForm } from "./photograph-edit-form";

function formatCapturedDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function PhotographRow({
  photograph,
  automaticAlt = false,
}: {
  photograph: PhotographWithPalette;
  automaticAlt?: boolean | null;
}) {
  return (
    <article aria-labelledby={`photo-${photograph.id}`} className="min-w-0 border-b border-neutral-200 p-3 last:border-b-0 sm:p-4">
      <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-4">
      <Image
        alt={photograph.altText ?? ""}
        className="h-24 w-24 bg-neutral-100 object-contain sm:w-32"
        height={photograph.height}
        sizes="(min-width: 640px) 128px, 96px"
        src={photographUrl(photograph.storagePath)}
        width={photograph.width}
      />
      <div className="min-w-0">
        <h2 id={`photo-${photograph.id}`} className="line-clamp-2 wrap-anywhere text-sm font-medium">{photograph.title || photograph.filename}</h2>
        {photograph.title ? <p className="mt-1 wrap-anywhere text-xs text-neutral-600">{photograph.filename}</p> : null}
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-700 sm:line-clamp-1">{automaticAlt !== false ? photograph.description || "No description added" : photographCaption(photograph) ?? (photograph.captionMode === "hidden" ? "Caption hidden" : "No caption added")}</p>
        <p className="mt-1 text-xs text-neutral-600">Captured {formatCapturedDate(photograph.capturedAt)}</p>
      </div>
      </div>
      <div className="relative mt-2">
        <a aria-label={`View on site: ${photograph.filename}`} href={photographPath(photograph.filename)} target="_blank" rel="noreferrer" className="absolute top-0 right-0 inline-flex min-h-11 items-center px-2 text-xs underline underline-offset-4 focus-visible:outline-2">View on site</a>
        <PhotographEditForm photograph={photograph} automaticAlt={automaticAlt} />
      </div>
    </article>
  );
}
