import { archivePalettes, photographUrl } from "./archive";
import { ContentFrame } from "./content-frame";
import { IndexNavigation } from "./index-navigation";
import { PhotoGallery } from "./photo-gallery";
import { galleryPhotographs } from "./photos";

export async function GalleryView() {
  const palettes = await archivePalettes();

  return (
    <main className="min-h-[100svh] bg-white text-[#e2e1e1] text-[0.8125rem] font-normal tracking-[-0.035em]">
      <IndexNavigation contactHref="#contact" />

      <h1 className="sr-only">Elliot Mairet photograph archive</h1>

      <ContentFrame>
        <PhotoGallery
          ariaLabel="Complete photograph archive"
          photographs={galleryPhotographs.map((photograph) => ({
            ...photograph,
            imageUrl: photographUrl(photograph.filename),
            palette: palettes.get(photograph.filename) ?? [],
          }))}
        />

        <footer
          className="flex min-h-[35svh] items-end justify-between gap-8 py-[0.625rem] text-[#050505]"
          id="contact"
        >
          <span>Contact</span>
          <div className="flex flex-col items-end">
            <a
              className="text-[#050505] no-underline hover:underline focus-visible:underline"
              href="mailto:elliot.mairet@gmail.com"
            >
              elliot.mairet@gmail.com
            </a>
            <a
              className="text-[#050505] no-underline hover:underline focus-visible:underline"
              href="https://www.instagram.com/elliotmairet/"
            >
              Instagram
            </a>
          </div>
        </footer>
      </ContentFrame>
    </main>
  );
}
