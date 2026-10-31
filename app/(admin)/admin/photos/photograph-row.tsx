import Image from "next/image";

import { photographUrl } from "@/lib/photographs/storage";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { photographCaption } from "@/lib/photographs/text";
import { photographPath } from "@/lib/seo";

import { PaletteIndicator } from "./palette-indicator";
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
}: {
  photograph: PhotographWithPalette;
}) {
  return (
    <article className="min-w-0 border-b border-neutral-200 p-4 sm:p-5">
      <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-4 sm:grid-cols-[116px_minmax(0,1fr)]">
      <Image
        alt={photograph.altText ?? ""}
        className="h-22 w-22 bg-neutral-200 object-cover sm:h-24 sm:w-29"
        height={photograph.height}
        sizes="(min-width: 640px) 116px, 88px"
        src={photographUrl(photograph.storagePath)}
        width={photograph.width}
      />
      <div className="min-w-0">
        <h2 className="wrap-anywhere text-sm font-medium">{photograph.title || photograph.filename}</h2>
        {photograph.title ? <p className="mt-1 wrap-anywhere text-xs text-neutral-600">{photograph.filename}</p> : null}
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-neutral-700">{photographCaption(photograph) ?? (photograph.captionMode === "hidden" ? "Caption hidden" : "No caption added")}</p>
        <p className="mt-2 text-xs text-neutral-600">Captured {formatCapturedDate(photograph.capturedAt)}</p>
      </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-4">
        <a href={photographPath(photograph.filename)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 focus-visible:outline-2">View on site</a>
        <details className="min-w-0 text-xs text-neutral-600">
          <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2">File details</summary>
          <div className="space-y-2 pb-3 wrap-anywhere">
            <p>{photograph.width} × {photograph.height} pixels · Original file unchanged</p>
            <p>Storage path: {photograph.storagePath}</p>
            <PaletteIndicator photograph={photograph} />
          </div>
        </details>
      </div>
      <PhotographEditForm photograph={photograph} />
    </article>
  );
}
