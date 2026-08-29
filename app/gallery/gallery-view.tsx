import { archivePalettes, photographUrl } from "./archive";
import { ViewTransition } from "react";

import { ContentFrame } from "./content-frame";
import { IndexNavigation } from "./index-navigation";
import { PhotoGallery } from "./photo-gallery";
import { galleryPhotographs } from "./photos";

export async function GalleryView() {
  const palettes = await archivePalettes();
  const newestPhotographs = [...galleryPhotographs].sort((first, second) =>
    second.filename.localeCompare(first.filename),
  );

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
              photographs={newestPhotographs.map((photograph) => ({
                ...photograph,
                imageUrl: photographUrl(photograph.filename),
                palette: palettes.get(photograph.filename) ?? [],
              }))}
            />
          </div>
        </ContentFrame>
      </main>
    </ViewTransition>
  );
}
