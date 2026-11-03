"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { photographUrl } from "@/lib/photographs/storage";
import type { PhotographPreview } from "./archive-state";
import { rememberGalleryPosition } from "./gallery-position";

function thumbnailStyle(photograph: PhotographPreview): CSSProperties {
  return { aspectRatio: `${photograph.width} / ${photograph.height}`, "--photograph-ratio": photograph.width / photograph.height } as CSSProperties;
}

export function PhotographPlaceholder({ photograph, index }: { photograph: PhotographPreview; index: number }) {
  return <div aria-hidden="true" data-photograph-index={index} className="admin-thumbnail" style={thumbnailStyle(photograph)} />;
}

export function PhotographThumbnail({ photograph, returnHref, renderedCount = 48, onFocus }: {
  photograph: PhotographPreview; returnHref: string; renderedCount?: number; onFocus?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const ratio = photograph.width / photograph.height;
  return <Link id={`photograph-${photograph.id}`} href={`/admin/photos/${photograph.id}/edit?returnTo=${encodeURIComponent(returnHref)}`}
    prefetch={false} aria-label={`Edit photo ${photograph.title || photograph.filename} (${photograph.filename})`}
    title={photograph.filename} className="admin-thumbnail"
    style={thumbnailStyle(photograph)} onFocus={onFocus}
    onClick={event => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) rememberGalleryPosition(returnHref, photograph.id, renderedCount);
    }}>
    {failed ? <span className="absolute inset-0 overflow-auto border border-border p-2 text-xs wrap-anywhere">Preview unavailable. Edit {photograph.filename}</span>
      : <Image alt={photograph.altText ?? photograph.title ?? ""} src={photographUrl(photograph.storagePath)}
        width={photograph.width} height={photograph.height} className="absolute inset-0 h-full w-full object-contain"
        sizes={`(min-width: 1024px) min(calc(100vw - 6rem), calc(10.8rem * ${ratio})), (min-width: 640px) min(calc(100vw - 4rem), calc(10.8rem * ${ratio})), min(calc(100vw - 2rem), calc(7.2rem * ${ratio}))`}
        loading="lazy" onError={() => setFailed(true)} />}
  </Link>;
}
