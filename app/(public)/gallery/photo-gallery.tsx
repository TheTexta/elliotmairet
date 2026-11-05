import type { CSSProperties } from "react";
import { photographAspectRatio } from "@/lib/photographs/masonry-geometry";

import { FadingImage } from "./fading-image";
import { galleryImageSizes } from "./image-sizes";
import { distributeGalleryItems } from "./photo-gallery-columns";
import { TransitionLink } from "./transition-link";

export type PhotoGalleryItem = {
  filename: string;
  width: number;
  height: number;
  year: string;
  imageUrl: string;
  alt?: string;
  palette?: string[];
  closestHex?: string;
  difference?: number;
};

export function GalleryItem({
  className = "",
  eager: eagerOverride,
  index,
  layout,
  photograph,
  style,
}: {
  className?: string;
  eager?: boolean;
  index: number;
  layout: "grid" | "masonry" | "positioned";
  photograph: PhotoGalleryItem;
  style?: CSSProperties;
}) {
  const archiveLabel = String(index + 1).padStart(3, "0");
  const imageAlt = photograph.alt?.trim() || (photograph.difference === undefined
    ? `Archive photograph ${archiveLabel}, ${photograph.year}`
    : `Photograph with a colour difference of ${photograph.difference.toFixed(1)}`);
  const eager = eagerOverride ?? (photograph.difference === undefined && index < 2);
  const unknownDimensions = layout === "positioned"
    && ![photograph.width, photograph.height].every(value => Number.isFinite(value) && value > 0);

  return (
    <article
      className={`group break-inside-avoid text-[#e2e1e1] ${className} ${
        layout === "masonry" ? "mb-4 inline-block w-full align-top" : ""
      }`}
      style={layout === "grid" ? { order: index } : style}
    >
      <TransitionLink
        className="block no-underline focus-visible:outline focus-visible:outline-white"
        href={`/gallery/${encodeURIComponent(photograph.filename)}`}
        prefetchOnIntent
        resetScroll
        transitionType={photograph.difference === undefined ? "gallery-to-photo" : "photo-to-photo"}
      >
        <figure
          className={`relative m-0 bg-white ${layout === "positioned" ? "" : "min-h-15"}`}
          style={layout === "positioned" ? { aspectRatio: 1 / photographAspectRatio(photograph) } : undefined}
        >
          <FadingImage
            alt={imageAlt}
            className={layout === "positioned" ? "absolute inset-0 h-full w-full object-contain" : "block h-auto w-full"}
            fetchPriority={eager ? "high" : "auto"}
            height={unknownDimensions ? 1024 : photograph.height}
            loading={eager ? "eager" : "lazy"}
            quality={74}
            sizes={galleryImageSizes}
            src={photograph.imageUrl}
            width={unknownDimensions ? 1024 : photograph.width}
          />
          {photograph.palette && photograph.palette.length > 0 ? (
            <div className="pointer-events-none absolute top-2 right-2 z-10 hidden overflow-hidden opacity-0 shadow-[0_1px_6px_rgba(0,0,0,0.35)] transition-opacity duration-100 ease-out group-hover:opacity-100 sm:flex" aria-hidden="true">
              {photograph.palette.map((hex, paletteIndex) => (
                <span className="h-3.5 w-3.5" key={`${hex}-${paletteIndex}`} style={{ backgroundColor: hex }} />
              ))}
            </div>
          ) : null}
        </figure>
      </TransitionLink>
    </article>
  );
}

function GalleryColumns({
  className,
  columnCount,
  photographs,
}: {
  className: string;
  columnCount: number;
  photographs: PhotoGalleryItem[];
}) {
  return (
    <div className={className}>
      {distributeGalleryItems(photographs, columnCount).map(
        (column, columnIndex) => (
          <div className="flex flex-col gap-4" key={columnIndex}>
            {column.map(({ index, item: photograph }) => (
              <GalleryItem
                index={index}
                key={photograph.filename}
                layout="grid"
                photograph={photograph}
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

export function PhotoGallery({
  ariaLabel,
  layout = "masonry",
  photographs,
}: {
  ariaLabel: string;
  layout?: "grid" | "masonry";
  photographs: PhotoGalleryItem[];
}) {
  return (
    <section
      className={`animate-gallery-fade-in motion-reduce:animate-none ${
        layout === "masonry" ? "columns-2 gap-4 md:columns-3" : ""
      }`}
      aria-label={ariaLabel}
    >
      {layout === "grid"
        ? (
            <>
              <GalleryColumns
                className="grid grid-cols-2 gap-4 md:hidden"
                columnCount={2}
                photographs={photographs}
              />
              <GalleryColumns
                className="hidden grid-cols-3 gap-4 md:grid"
                columnCount={3}
                photographs={photographs}
              />
            </>
          )
        : photographs.map((photograph, index) => (
            <GalleryItem
              index={index}
              key={photograph.filename}
              layout={layout}
              photograph={photograph}
            />
          ))}
    </section>
  );
}
