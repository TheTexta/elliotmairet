import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import { archivePaletteColours, photographUrl } from "../archive";
import { ContentFrame } from "../content-frame";
import { FadingImage } from "../fading-image";
import { IndexNavigation } from "../index-navigation";
import { galleryPhotographs } from "../photos";
import { ScrollToTop } from "../scroll-to-top";
import { SimilarColourGallery } from "./similar-colour-gallery";

export async function generateStaticParams() {
  return galleryPhotographs.map(({ filename }) => ({ filename }));
}

function decodeRouteFilename(filename: string) {
  let decodedFilename = filename;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const nextFilename = decodeURIComponent(decodedFilename);

      if (nextFilename === decodedFilename) {
        break;
      }

      decodedFilename = nextFilename;
    } catch {
      break;
    }
  }

  return decodedFilename;
}

export default async function PhotographPage({
  params,
}: PageProps<"/gallery/[filename]">) {
  const { filename } = await params;
  const decodedFilename = decodeRouteFilename(filename);
  const photograph = galleryPhotographs.find(
    (candidate) => candidate.filename === decodedFilename,
  );

  if (!photograph) {
    notFound();
  }

  const palettes = await archivePaletteColours();
  const palette = palettes.get(photograph.filename) ?? [];

  return (
    <ViewTransition
      default="none"
      enter={{ "gallery-to-photo": "photo-view-fade-in", default: "none" }}
      exit="photo-view-fade-out"
      key={photograph.filename}
    >
      <main className="min-h-svh ">
        <ScrollToTop routeKey={photograph.filename} />
        <IndexNavigation/>
        <ContentFrame>
          <section>
            <figure className="m-0  h-[80vh] bg-white mt-[8vh] mb-[4vh] flex content-center items-center justify-center">
              <FadingImage
                alt={`Photograph from ${photograph.year}`}
                className={"block h-full w-auto object-contain"}
                height={photograph.height}
                priority
                quality={78}
                sizes="(max-width: 1600px) calc(100vw - 20px), 1580px"
                src={photographUrl(photograph.filename)}
                width={photograph.width}
              />
            </figure>
            <div className="" />
            {palette.length === 5 ? (
              <SimilarColourGallery
                currentFilename={photograph.filename}
                palette={palette.map(({ hex }) => hex)}
              />
            ) : null}
          </section>
        </ContentFrame>
      </main>
    </ViewTransition>
  );
}