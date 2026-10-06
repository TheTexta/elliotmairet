import { Pencil, Save } from "lucide-react";

import type { PhotographWithPalette } from "@/lib/photographs/types";

import { updatePhotographAction } from "../actions";
import { AdminInput, FormField } from "./form-controls";

export function PhotographEditForm({
  photograph,
}: {
  photograph: PhotographWithPalette;
}) {
  const action = updatePhotographAction.bind(null, photograph.id);

  return (
    <details className="min-w-0 w-full xl:relative xl:w-auto">
      <summary className="mr-24 ml-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 px-2 text-[9px] marker:hidden xl:mr-0 xl:min-h-9">
        <Pencil aria-hidden="true" size={14} strokeWidth={1.8} />
        Edit
      </summary>
      <form
        action={action}
        className="mt-2 grid min-w-0 w-full grid-cols-1 gap-3 border border-neutral-300 bg-white p-4 normal-case sm:grid-cols-2 xl:absolute xl:right-0 xl:z-10 xl:w-[min(32rem,calc(100vw-3rem))] xl:shadow-[0_10px_35px_rgba(0,0,0,0.12)]"
      >
        <FormField label="Title">
          <AdminInput
            defaultValue={photograph.title ?? ""}
            maxLength={200}
            name="title"
          />
        </FormField>
        <FormField label="Captured">
          <AdminInput
            defaultValue={photograph.capturedAt ?? ""}
            name="capturedAt"
            type="date"
          />
        </FormField>
        <FormField className="sm:col-span-2" label="Alt text">
          <AdminInput
            defaultValue={photograph.altText ?? ""}
            maxLength={500}
            name="altText"
          />
        </FormField>
        <FormField className="text-neutral-400" label="Sort order">
          <AdminInput
            className="cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
            defaultValue={photograph.sortOrder ?? ""}
            disabled
            step="1"
            type="number"
          />
          <input
            defaultValue={photograph.sortOrder ?? ""}
            name="sortOrder"
            type="hidden"
          />
        </FormField>
        <div className="flex items-end justify-end">
          <button
            className="flex h-9 items-center gap-2 bg-black px-4 text-[8px] uppercase text-white"
            type="submit"
          >
            <Save aria-hidden="true" size={13} />
            Save
          </button>
        </div>
      </form>
    </details>
  );
}
