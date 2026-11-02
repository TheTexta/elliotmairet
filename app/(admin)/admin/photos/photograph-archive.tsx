"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";
import type { PhotographWithPalette } from "@/lib/photographs/types";
import { matchesPhotograph, type ArchiveFilter } from "./archive-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PhotographRow } from "./photograph-row";
import { AdvancedToolsLink } from "./advanced-tools-link";

export function PhotographArchive({ photographs, automaticAlt = false }: { photographs: PhotographWithPalette[]; automaticAlt?: boolean | null }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const automatic = automaticAlt !== false;
  const effectiveFilter = automatic && filter === "hidden" ? "all" : filter;
  const visible = new Set(photographs.filter(photo => matchesPhotograph(photo, query, effectiveFilter, automatic)).map(photo => photo.id));
  return <section aria-label="Your photographs" className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Label htmlFor={`${id}-search`} className="mb-2 block text-neutral-700">Find a photograph</Label>
        <div className="relative">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-600" />
          <Input id={`${id}-search`} name="archiveSearch" type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Title, description, filename or date" className="pl-10" />
        </div>
      </div>
      <Label className="flex min-w-0 flex-col gap-2 text-neutral-700 sm:w-64">Filter photographs
        <NativeSelect name="archiveFilter" value={effectiveFilter} onChange={event => setFilter(event.target.value as ArchiveFilter)}>
          <option value="all">All photographs</option><option value="missing">{automatic ? "Missing title or description" : "Missing text"}</option>{!automatic ? <option value="hidden">Hidden caption metadata</option> : null}
        </NativeSelect>
      </Label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
      <p role="status">{visible.size === photographs.length ? `${photographs.length} photographs` : `${visible.size} of ${photographs.length} photographs`}</p>
      <AdvancedToolsLink />
    </div>
    <div className="border border-neutral-300 bg-white">
      {/* Keep filtered editors mounted: searching never discards unsaved work. */}
      {photographs.map(photo => <div key={photo.id} hidden={!visible.has(photo.id)}>
        <PhotographRow photograph={photo} automaticAlt={automaticAlt} />
      </div>)}
      {!visible.size ? <div className="space-y-3 p-6 text-sm">
        <p>{photographs.length ? "No photographs match this search." : "Your archive is empty. Upload your first photograph to get started."}</p>
        {photographs.length ? <Button type="button" variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button> : null}
      </div> : null}
    </div>
  </section>;
}
