"use client";

import { Search, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { AdminPageHeading } from "../page-heading";
import { matchesPhotograph, type ArchiveFilter } from "./archive-filter";
import { ARCHIVE_BATCH_SIZE, archiveHref, archiveState, comparePhotographDates, type ArchiveState, type PhotographPreview } from "./archive-state";
import { PhotographPlaceholder, PhotographThumbnail } from "./photograph-thumbnail";
import { rememberGalleryPosition, restoreGalleryPosition } from "./gallery-position";

export function PhotographArchive({ photographs, automaticAlt = false, notices = [] }: {
  photographs: PhotographPreview[]; automaticAlt?: boolean | null; notices?: string[];
}) {
  const id = useId();
  const params = useSearchParams();
  const state = archiveState(params);
  const automatic = automaticAlt !== false;
  const filter = automatic && state.filter === "hidden" ? "all" : state.filter;
  const filtered = photographs.filter(photo => matchesPhotograph(photo, state.query, filter, automatic)).sort(comparePhotographDates);
  const current = { ...state, filter };
  const href = archiveHref(current);
  const [display, setDisplay] = useState({ href, count: ARCHIVE_BATCH_SIZE });
  if (display.href !== href) setDisplay({ href, count: ARCHIVE_BATCH_SIZE });
  const count = display.href === href ? display.count : ARCHIVE_BATCH_SIZE;
  const toolsHref = `/admin/photos/tools?returnTo=${encodeURIComponent(href)}`;
  const visible = filtered.slice(0, count);
  const hasMore = visible.length < filtered.length;
  const galleryRef = useRef<HTMLDivElement>(null);
  const revealThrough = useCallback((through: number) => {
    setDisplay(previous => {
      if (previous.href !== href) return previous;
      const nextCount = Math.min(Math.max(previous.count, Math.ceil(through / ARCHIVE_BATCH_SIZE) * ARCHIVE_BATCH_SIZE), filtered.length);
      return nextCount === previous.count ? previous : { href, count: nextCount };
    });
  }, [href, filtered.length, setDisplay]);
  useEffect(() => restoreGalleryPosition(href, savedCount => {
    setDisplay({ href, count: Math.max(ARCHIVE_BATCH_SIZE, Math.min(savedCount, filtered.length)) });
  }), [href, filtered.length]);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!hasMore || !gallery || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(entries => {
      let through = 0;
      for (const entry of entries) {
        if (entry.isIntersecting) through = Math.max(through, Number((entry.target as HTMLElement).dataset.photographIndex) + 1);
      }
      if (through) revealThrough(through);
    }, { rootMargin: "1000px 0px" });
    gallery.querySelectorAll("[data-photograph-index]").forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, [hasMore, count, revealThrough]);

  function change(next: ArchiveState) {
    window.history.replaceState(null, "", archiveHref(next));
  }
  function loadMore() {
    const nextId = filtered[visible.length]?.id;
    revealThrough(count + ARCHIVE_BATCH_SIZE);
    if (nextId) requestAnimationFrame(() => document.getElementById(`photograph-${nextId}`)?.focus());
  }
  const removed = params.get("removed");
  return <>
    <AdminPageHeading title="Photos">
      <Button asChild><Link prefetch={false} href={`/admin/photos/upload?returnTo=${encodeURIComponent(href)}`} onClick={() => rememberGalleryPosition(href, undefined, visible.length)}><Plus aria-hidden="true" size={15} />Upload photo</Link></Button>
    </AdminPageHeading>
    <section aria-label="Your photographs" className="min-w-0 space-y-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-search`} className="mb-2 block">Find a photograph</Label>
          <div className="relative">
            <Search aria-hidden="true" size={16} className="pointer-events-none absolute top-3.5 left-3" />
            <Input id={`${id}-search`} name="archiveSearch" type="search" maxLength={200} value={state.query}
              onChange={event => change({ ...current, query: event.target.value })}
              placeholder="Title, description, filename or date" className="pl-10" />
          </div>
        </div>
        <Label className="flex min-w-0 flex-col gap-2 sm:w-64">Filter photographs
          <NativeSelect name="archiveFilter" value={filter} onChange={event => change({ ...current, filter: event.target.value as ArchiveFilter })}>
            <option value="all">All photographs</option>
            <option value="missing">{automatic ? "Missing title or description" : "Missing text"}</option>
            {!automatic ? <option value="hidden">Hidden caption metadata</option> : null}
          </NativeSelect>
        </Label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-xs">
        <p role="status">{filtered.length === photographs.length ? `${photographs.length} photographs` : `${filtered.length} of ${photographs.length} photographs`}<span className="sr-only">. {visible.length} loaded.</span></p>
        <div className="flex flex-wrap items-center gap-3">
          <Link className="admin-back-link" prefetch={false} href={toolsHref} onClick={() => rememberGalleryPosition(href, undefined, visible.length)}>Photo tools</Link>
          {filtered.length > ARCHIVE_BATCH_SIZE ? <Button type="button" variant="outline" disabled={!hasMore} onClick={loadMore}>Load more photographs</Button> : null}
        </div>
      </div>
      {removed === "done" || removed === "pending" ? <p role="status" className="border border-border p-3 text-sm">Photograph removed from the public archive.{removed === "pending" ? <> File removal is still tracked. <Link href={`${toolsHref}#file-maintenance`} className="underline">Review file maintenance</Link>.</> : null}</p> : null}
      {notices.length ? <div role="status" className="space-y-1 text-sm leading-6">{notices.map(notice => <p key={notice}>{notice}</p>)}<Link prefetch={false} href={toolsHref} className="admin-back-link">Review text and file maintenance</Link></div> : null}
      {visible.length ? <div ref={galleryRef} className="admin-photo-grid" aria-label="Photograph thumbnails">
        {/* Reserve every ratio slot so revealing previews cannot reflow rows or grow the page. */}
        {filtered.map((photo, index) => index < visible.length
          ? <PhotographThumbnail key={photo.id} photograph={photo} returnHref={href} renderedCount={visible.length}
            onFocus={() => { if (hasMore && index >= visible.length - 8) revealThrough(count + ARCHIVE_BATCH_SIZE); }} />
          : <PhotographPlaceholder key={photo.id} photograph={photo} index={index} />)}
      </div> : <div className="space-y-4 border-y border-border py-8 text-sm">
        <p>{photographs.length ? "No photographs match this search." : "Your archive is empty. Upload your first photograph to get started."}</p>
        {photographs.length ? <Button type="button" variant="outline" onClick={() => change({ query: "", filter: "all" })}>Clear filters</Button> : null}
      </div>}
    </section>
  </>;
}
