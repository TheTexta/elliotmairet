import { FadingImage } from "./fading-image";
import { galleryImageSizes } from "./image-sizes";
import { TransitionLink } from "./transition-link";

export type PhotoGalleryItem = {
  filename: string;
  width: number;
  height: number;
  year: string;
  imageUrl: string;
  palette?: string[];
  closestHex?: string;
  difference?: number;
};

function GalleryItem({
  index,
  layout,
  photograph,
}: {
  index: number;
  layout: "grid" | "masonry";
  photograph: PhotoGalleryItem;
}) {
  const archiveLabel = String(index + 1).padStart(3, "0");

  return (
    <article
      className={`group break-inside-avoid text-[#e2e1e1] ${
        layout === "masonry" ? "mb-4 inline-block w-full align-top" : ""
      }`}
      style={layout === "grid" ? { order: index } : undefined}
    >
      <TransitionLink
        className="block no-underline focus-visible:outline focus-visible:outline-white"
        href={`/gallery/${encodeURIComponent(photograph.filename)}`}
        resetScroll
        transitionType={photograph.difference === undefined ? "gallery-to-photo" : "photo-to-photo"}
      >
        <figure className="relative m-0 min-h-15 bg-white">
          <FadingImage
            alt={photograph.difference === undefined ? `Archive photograph ${archiveLabel}, ${photograph.year}` : `Photograph with a colour difference of ${photograph.difference.toFixed(1)}`}
            className="block h-auto w-full"
            fetchPriority={index === 0 ? "high" : "auto"}
            height={photograph.height}
            loading={index === 0 ? "eager" : "lazy"}
            quality={74}
            sizes={galleryImageSizes}
            src={photograph.imageUrl}
            width={photograph.width}
          />
          {photograph.palette?.length === 5 ? (
            <div className="pointer-events-none absolute top-2 right-2 z-10 hidden translate-y-1 overflow-hidden border border-white/70 opacity-0 shadow-[0_1px_6px_rgba(0,0,0,0.35)] transition-opacity duration-100 ease-out group-hover:opacity-100 sm:flex" aria-hidden="true">
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
      className={`animate-gallery-fade-in gap-4 motion-reduce:animate-none ${
        layout === "grid"
          ? "grid grid-cols-2 md:grid-cols-3"
          : "columns-2 md:columns-3"
      }`}
      aria-label={ariaLabel}
    >
      {layout === "grid"
        ? Array.from({ length: 3 }, (_, columnIndex) => (
            <div
              className="contents md:flex md:flex-col md:gap-4"
              key={columnIndex}
            >
              {photographs.flatMap((photograph, index) =>
                index % 3 === columnIndex ? (
                  <GalleryItem
                    index={index}
                    key={photograph.filename}
                    layout={layout}
                    photograph={photograph}
                  />
                ) : (
                  []
                ),
              )}
            </div>
          ))
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
