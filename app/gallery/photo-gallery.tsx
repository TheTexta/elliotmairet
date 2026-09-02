import { FadingImage } from "./fading-image";
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

export function PhotoGallery({
  ariaLabel,
  layout = "masonry",
  photographs,
}: {
  ariaLabel: string;
  layout?: "grid" | "masonry";
  photographs: PhotoGalleryItem[];
}) {
  function renderPhotograph(photograph: PhotoGalleryItem, index: number) {
    const archiveLabel = String(index + 1).padStart(3, "0");

    return (
      <article
        className={`group break-inside-avoid text-[#e2e1e1] ${
          layout === "masonry" ? "mb-4" : ""
        }`}
        key={photograph.filename}
        style={layout === "grid" ? { order: index } : undefined}
      >
        <TransitionLink
          className="block no-underline focus-visible:outline focus-visible:outline-white"
          href={`/gallery/${encodeURIComponent(photograph.filename)}`}
          resetScroll={photograph.difference !== undefined}
          transitionType={
            photograph.difference === undefined
              ? "gallery-to-photo"
              : "photo-to-photo"
          }
        >
          <figure className="relative m-0 min-h-15 bg-white">
            <FadingImage
              alt={
                photograph.difference === undefined
                  ? `Archive photograph ${archiveLabel}, ${photograph.year}`
                  : `Photograph with a colour difference of ${photograph.difference.toFixed(1)}`
              }
              className="block h-auto w-full"
              height={photograph.height}
              priority={index < 4}
              quality={74}
              sizes="(max-width: 639px) calc(100vw - 20px), (max-width: 767px) calc(50vw - 20px), (max-width: 1023px) calc(33vw - 20px), (max-width: 1279px) calc(25vw - 20px), (max-width: 1535px) calc(20vw - 20px), calc(16.6vw - 20px)"
              src={photograph.imageUrl}
              width={photograph.width}
            />
            {photograph.palette?.length === 5 ? (
              <div
                className="pointer-events-none translate-y-1 absolute top-2 right-2 z-10 hidden overflow-hidden border border-white/70 opacity-0 shadow-[0_1px_6px_rgba(0,0,0,0.35)] transition-opacity duration-100 ease-out group-hover:opacity-100 sm:flex"
                aria-hidden="true"
              >
                {photograph.palette.map((hex, paletteIndex) => (
                  <span
                    className="h-3.5 w-3.5"
                    key={`${hex}-${paletteIndex}`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            ) : null}
            {/* Enable when visually testing similarity result colours.
            {photograph.closestHex ? (
              <span
                aria-label={`Closest palette colour ${photograph.closestHex}`}
                className="absolute top-2 right-2 block size-3.5"
                style={{ backgroundColor: photograph.closestHex }}
              />
            ) : null} */}
          </figure>
        </TransitionLink>
      </article>
    );
  }

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
                index % 3 === columnIndex
                  ? [renderPhotograph(photograph, index)]
                  : [],
              )}
            </div>
          ))
        : photographs.map(renderPhotograph)}
    </section>
  );
}