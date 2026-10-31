"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { matchesPhotograph, type ArchiveFilter } from "./archive-filter";
import { adminInputClassName } from "./form-controls";
import { PhotographRow } from "./photograph-row";
import { AdvancedToolsLink } from "./advanced-tools-link";

export function PhotographArchive({ photographs }: { photographs: PhotographWithPalette[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const visible = new Set(photographs.filter(photo => matchesPhotograph(photo, query, filter)).map(photo => photo.id));
  return <section aria-label="Your photographs" className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor={`${id}-search`} className="mb-2 block text-xs font-medium text-neutral-700">Find a photograph</label>
        <div className="relative">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-600" />
          <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Search title, caption or filename" className={`${adminInputClassName} pl-10`} />
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-neutral-700 sm:w-48">Show
        <select className={adminInputClassName} value={filter} onChange={event => setFilter(event.target.value as ArchiveFilter)}>
          <option value="all">All photographs</option><option value="missing">Missing text</option><option value="hidden">Hidden captions</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
      <p role="status">{visible.size === photographs.length ? `${photographs.length} photographs` : `${visible.size} of ${photographs.length} photographs`}</p>
      <AdvancedToolsLink />
    </div>
    <div className="border border-neutral-300 bg-white">
      {/* Keep filtered editors mounted: searching never discards unsaved work. */}
      {photographs.map(photo => <div key={photo.id} hidden={!visible.has(photo.id)}>
        <PhotographRow photograph={photo} />
      </div>)}
      {!visible.size ? <div className="space-y-3 p-6 text-sm">
        <p>{photographs.length ? "No photographs match this search." : "Your archive is empty. Upload your first photograph to get started."}</p>
        {photographs.length ? <button type="button" className="min-h-11 border border-neutral-300 px-4 hover:bg-neutral-50 focus-visible:outline-2" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : null}
      </div> : null}
    </div>
  </section>;
}
