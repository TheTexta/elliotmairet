import { ViewTransition } from "react";

import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";

import { ContentFrame } from "./content-frame";
import { IndexNavigation } from "./index-navigation";
import { PhotoGallery } from "./photo-gallery";
import { ScrollToTop } from "./scroll-to-top";

export async function GalleryView() {
  const photographs = await getPhotographsWithPalettes();

  return (
    <>
      <ViewTransition
        default="none"
        exit={{
          "gallery-to-photo": "gallery-transition-trigger",
          default: "none",
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 size-px bg-white"
        />
      </ViewTransition>
      <main className="min-h-svh bg-white">
        <ScrollToTop routeKey="gallery" transitionTypes="photo-to-gallery" />
        <IndexNavigation />

        <ContentFrame>
          <div className="pt-8 sm:pt-4">
            <PhotoGallery
              ariaLabel="Complete photograph archive"
              photographs={photographs.map((photograph) => ({
                ...photograph,
                imageUrl: photographUrl(photograph.storagePath),
                palette: photograph.palette.map(({ hex }) => hex),
              }))}
            />
          </div>
        </ContentFrame>
      </main>
    </>
  );
}
