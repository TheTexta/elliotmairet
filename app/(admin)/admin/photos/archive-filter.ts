import type { Photograph } from "@/lib/photographs/types";

export type ArchiveFilter = "all" | "missing" | "hidden";

export function matchesPhotograph(photo: Pick<Photograph, "title" | "description" | "altText" | "captionMode" | "filename" | "customCaption" | "capturedAt">, query: string, filter: ArchiveFilter, automaticAlt = false) {
  if (filter === "missing" && photo.title?.trim() && photo.description?.trim() && (automaticAlt || photo.altText?.trim())) return false;
  if (filter === "hidden" && photo.captionMode !== "hidden") return false;
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [photo.filename, photo.title, photo.description, photo.altText, photo.customCaption, photo.capturedAt]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}
