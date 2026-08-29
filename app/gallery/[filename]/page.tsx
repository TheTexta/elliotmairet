import Image from "next/image";
import { notFound } from "next/navigation";

import { archivePaletteColours, photographUrl } from "../archive";
import { ContentFrame } from "../content-frame";
import { IndexNavigation } from "../index-navigation";
import { galleryPhotographs } from "../photos";
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
    <main className="min-h-svh bg-white">
      <IndexNavigation contactHref="/#contact" />
      <ContentFrame>
        <section>
          <figure className="m-0 max-h-[80svh] pt-20">
            <Image
              alt={`Photograph from ${photograph.year}`}
              className={
                photograph.height > photograph.width
                  ? "mx-auto block h-[calc(80svh-5rem)] w-auto max-w-full"
                  : "block max-h-full max-w-full"
              }
              height={photograph.height}
              priority
              quality={78}
              sizes="(max-width: 1600px) calc(100vw - 20px), 1580px"
              src={photographUrl(photograph.filename)}
              width={photograph.width}
            />
          </figure>
          {palette.length === 5 ? (
            <SimilarColourGallery
              currentFilename={photograph.filename}
              palette={palette.map(({ hex }) => hex)}
            />
          ) : null}
        </section>
      </ContentFrame>
    </main>
  );
}