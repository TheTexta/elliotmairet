import type { Photograph } from "@/lib/photographs/types";
import type { ArchiveFilter } from "./archive-filter";

export const ARCHIVE_BATCH_SIZE = 48;
export type ArchiveState = { query: string; filter: ArchiveFilter };
export type PhotographPreview = Pick<Photograph, "id" | "filename" | "storagePath" | "width" | "height" | "title" | "description" | "altText" | "customCaption" | "captionMode" | "capturedAt">;

export function comparePhotographDates(left: Pick<Photograph, "capturedAt">, right: Pick<Photograph, "capturedAt">) {
  const leftDate = left.capturedAt ?? "";
  const rightDate = right.capturedAt ?? "";
  // ISO capture dates sort newest first; keep catalogue order for equal dates.
  return leftDate === rightDate ? 0 : leftDate > rightDate ? -1 : 1;
}

export function archiveState(params: Pick<URLSearchParams, "get">): ArchiveState {
  const filter = params.get("filter");
  return {
    query: (params.get("q") ?? "").slice(0, 200),
    filter: filter === "missing" || filter === "hidden" ? filter : "all",
  };
}

export function archiveHref(state: ArchiveState, pathname = "/admin/photos") {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.filter !== "all") params.set("filter", state.filter);
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

// A return destination is always our gallery, never an arbitrary redirect URL.
export function galleryReturnHref(value: unknown) {
  if (typeof value !== "string") return "/admin/photos";
  try {
    const url = new URL(value, "https://admin.invalid");
    if (url.origin !== "https://admin.invalid" || url.pathname !== "/admin/photos") return "/admin/photos";
    return archiveHref(archiveState(url.searchParams));
  } catch { return "/admin/photos"; }
}

export function photographPreview(photo: Photograph): PhotographPreview {
  const { id, filename, storagePath, width, height, title, description, altText, customCaption, captionMode, capturedAt } = photo;
  return { id, filename, storagePath, width, height, title, description, altText, customCaption, captionMode, capturedAt };
}
