import Image from "next/image";
import Link from "next/link";

import { archivePalettes, photographUrl } from "./archive";
import { galleryPhotographs } from "./photos";

export async function GalleryView() {
  const palettes = await archivePalettes();

  return (
    <main className="min-h-[100svh] bg-white text-[#e2e1e1] text-[0.8125rem] font-normal tracking-[-0.035em]">
      <nav
        className="fixed z-10 top-[0.625rem] left-[0.9375rem] flex gap-[0.4rem] text-white"
        aria-label="Gallery navigation"
      >
        <Link
          className="no-underline hover:underline focus-visible:underline"
          href="/"
        >
          Elliot Mairet
        </Link>
        <span aria-hidden="true">/</span>
        <span>Archive</span>
      </nav>

      <h1 className="sr-only">Elliot Mairet photograph archive</h1>

      <section
        className="columns-1 gap-0 px-[20vw] py-0 sm:columns-2 md:columns-3"
        aria-label="Complete photograph archive"
      >
        {galleryPhotographs.map((photograph, index) => {
          const label = String(index + 1).padStart(3, "0");
          const palette = palettes.get(photograph.filename) ?? [];

          return (
            <article
              className="group break-inside-avoid px-[0.625rem] py-[0.3125rem] text-[#e2e1e1]"
              key={photograph.filename}
            >
              <Link
                className="block no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
                href={`/gallery/${encodeURIComponent(photograph.filename)}`}
              >
                <figure className="relative min-h-[3.75rem] m-0 bg-[#050505]">
                  <Image
                    alt={"Archive photograph " + label + ", " + photograph.year}
                    className="block w-full h-auto"
                    height={photograph.height}
                    priority={index < 4}
                    quality={74}
                    sizes="(max-width: 639px) calc(100vw - 20px), (max-width: 767px) calc(50vw - 20px), (max-width: 1023px) calc(33vw - 20px), (max-width: 1279px) calc(25vw - 20px), (max-width: 1535px) calc(20vw - 20px), calc(16.6vw - 20px)"
                    src={photographUrl(photograph.filename)}
                    width={photograph.width}
                  />
                  {palette.length === 5 ? (
                    <div
                      className="absolute z-10 top-2 right-2 flex overflow-hidden border border-white/70 shadow-[0_1px_6px_rgba(0,0,0,0.35)] opacity-0 pointer-events-none -translate-y-1 transition-[opacity,transform] duration-160 ease-in-out group-hover:opacity-100 group-hover:translate-y-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0"
                      aria-hidden="true"
                    >
                      {palette.map((hex, paletteIndex) => (
                        <span
                          className="w-[0.875rem] h-[0.875rem]"
                          key={`${hex}-${paletteIndex}`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  ) : null}
                </figure>
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
