import Image from "next/image";

import { photographUrl } from "@/lib/photographs/storage";
import type { PhotographWithPalette } from "@/lib/photographs/types";

import { DeleteButton } from "./delete-button";
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
    <article className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 border-b border-neutral-200 p-3 last:border-b-0 sm:grid-cols-[116px_minmax(210px,1fr)_128px_128px_145px_150px] sm:items-center sm:gap-4 sm:p-4">
      <Image
        alt={photograph.altText ?? ""}
        className="h-18 w-22.5 bg-neutral-200 object-cover sm:h-19.5 sm:w-29"
        height={photograph.height}
        sizes="(min-width: 640px) 116px, 90px"
        src={photographUrl(photograph.storagePath)}
        width={photograph.width}
      />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium sm:text-[11px]">
          {photograph.filename}
        </p>
        <p className="mt-2 truncate text-[8px] uppercase text-neutral-500">
          {photograph.storagePath}
        </p>
        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <span className="text-[8px] uppercase text-neutral-500">
            {formatCapturedDate(photograph.capturedAt)}
          </span>
          <PaletteIndicator photograph={photograph} />
        </div>
      </div>
      <div className="hidden flex-col gap-1.5 sm:flex">
        <span className="text-[8px] uppercase text-neutral-500">Captured</span>
        <span className="text-[9px] uppercase">
          {formatCapturedDate(photograph.capturedAt)}
        </span>
      </div>
      <div className="hidden flex-col gap-1.5 sm:flex">
        <span className="text-[8px] uppercase text-neutral-500">Dimensions</span>
        <span className="text-[9px]">
          {photograph.width} × {photograph.height}
        </span>
      </div>
      <div className="hidden flex-col gap-2 sm:flex">
        <span className="text-[8px] uppercase text-neutral-500">Palette</span>
        <PaletteIndicator photograph={photograph} />
      </div>
      <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
        <PhotographEditForm photograph={photograph} />
        <DeleteButton id={photograph.id} />
      </div>
    </article>
  );
}
