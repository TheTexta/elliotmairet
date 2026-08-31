import { photographUrl } from "./archive";
import { ViewTransition } from "react";

import { getPhotographsWithPalettes } from "@/lib/photographs/queries";

import { ContentFrame } from "./content-frame";
import { IndexNavigation } from "./index-navigation";
import { PhotoGallery } from "./photo-gallery";

export async function GalleryView() {
  const photographs = await getPhotographsWithPalettes();

  return (
    <ViewTransition
      default="none"
      exit={{ "gallery-to-photo": "gallery-view-fade-out", default: "none" }}
    >
      <main className="min-h-svh bg-white">
        <IndexNavigation/>

        <ContentFrame>
          <div className="pt-8">
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
    </ViewTransition>
  );
}
