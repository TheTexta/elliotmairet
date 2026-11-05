import { ViewTransition } from "react";

import { getPhotographsWithPalettes } from "@/lib/photographs/queries";
import { planColourMasonryLayouts } from "@/lib/photographs/plan-colour-masonry";
import { photographUrl } from "@/lib/photographs/storage";
import { getSiteContent } from "@/lib/site-content/queries";
import { photographImageAlt, serializeJsonLd, websiteJsonLd } from "@/lib/seo";

import { ContentFrame } from "./content-frame";
import { IndexNavigation } from "./index-navigation";
import { ColourPhotoGallery } from "./colour-photo-gallery";
import { ScrollToTop } from "./scroll-to-top";

export async function GalleryView() {
  const [photographs, siteContent] = await Promise.all([
    getPhotographsWithPalettes(),
    getSiteContent(),
  ]);
  const indexes = new Map(photographs.map((photograph, index) => [photograph.id, index]));
  const layouts = planColourMasonryLayouts(photographs);
  const columnPlans = {
    mobile: layouts.mobile.map((column) => column.map(({ id }) => indexes.get(id)!)),
    desktop: layouts.desktop.map((column) => column.map(({ id }) => indexes.get(id)!)),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(websiteJsonLd(siteContent.seoDescription)),
        }}
        type="application/ld+json"
      />
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
          <div className="pt-[calc(2*var(--gallery-gap)+1cap)] sm:pt-4">
            <ColourPhotoGallery
              columnPlans={columnPlans}
              photographs={photographs.map((photograph) => ({
                ...photograph,
                imageUrl: photographUrl(photograph.storagePath),
                alt: photographImageAlt(photograph, "") || undefined,
                palette: photograph.palette.map(({ hex }) => hex),
              }))}
            />
          </div>
        </ContentFrame>
      </main>
    </>
  );
}
