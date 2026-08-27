import Image from "next/image";
import Link from "next/link";

import { galleryPhotographs } from "./photos";

const galleryStorageBaseUrl =
  "https://api.dextery.dev/storage/v1/render/image/public/elliotmairet";
const paletteApiUrl =
  "https://api.dextery.dev/rest/v1/photo_palette_colours?select=storage_path,rank,hex&order=storage_path.asc,rank.asc";
const publicPaletteApiKey = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDU1MzcwMCwiZXhwIjo0OTMwMjI3MzAwLCJyb2xlIjoiYW5vbiJ9.HVtr0mMAc2VYP7Ap8z4Q0QCyUp1IJLwGAIjyKWaBYDY";

type PaletteColour = {
  storage_path: string;
  rank: number;
  hex: string;
};

function photographUrl(filename: string) {
  return (
    galleryStorageBaseUrl +
    "/" +
    encodeURIComponent(filename) +
    "?width=1200&quality=74"
  );
}

function photographDate(filename: string) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

async function archivePalettes() {
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    publicPaletteApiKey;

  try {
    const response = await fetch(paletteApiUrl, {
      cache: "force-cache",
      headers: { apikey: anonKey },
    });

    if (!response.ok) {
      throw new Error(`Palette request failed with ${response.status}.`);
    }

    const rows = (await response.json()) as PaletteColour[];
    const palettes = new Map<string, string[]>();

    for (const row of rows) {
      if (!/^#[0-9a-f]{6}$/i.test(row.hex) || row.rank < 1 || row.rank > 5) {
        continue;
      }

      const palette = palettes.get(row.storage_path) ?? [];
      palette.push(row.hex);
      palettes.set(row.storage_path, palette);
    }

    return palettes;
  } catch (error) {
    console.error("Unable to load archive palettes.", error);
    return new Map<string, string[]>();
  }
}

export default async function GalleryPage() {
  const palettes = await archivePalettes();

  return (
    <main className="min-h-[100svh] bg-white text-[#e2e1e1] text-[0.8125rem] font-normal tracking-[-0.035em]">
      <nav
        className="fixed z-10 top-[0.625rem] left-[0.9375rem] flex gap-[0.4rem] text-white mix-blend-difference"
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
        className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-0 p-0"
        aria-label="Complete photograph archive"
      >
        {galleryPhotographs.map((photograph, index) => {
          const label = String(index + 1).padStart(3, "0");
          const palette = palettes.get(photograph.filename) ?? [];
          const date = photographDate(photograph.filename);

          return (
            <article
              className="group break-inside-avoid px-[0.625rem] py-[0.3125rem] text-[#e2e1e1]"
              key={photograph.filename}
            >
              <figure className="relative min-h-[3.75rem] m-0 bg-[#050505]">
                <Image
                  alt={"Archive photograph " + label + ", " + photograph.year}
                  className="block w-full h-auto"
                  height={photograph.height}
                  priority={index < 4}
                  sizes="(max-width: 639px) calc(100vw - 20px), (max-width: 767px) calc(50vw - 20px), (max-width: 1023px) calc(33vw - 20px), (max-width: 1279px) calc(25vw - 20px), (max-width: 1535px) calc(20vw - 20px), calc(16.6vw - 20px)"
                  src={photographUrl(photograph.filename)}
                  unoptimized
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
                <div className="absolute z-10 right-0 bottom-0 left-0 flex items-start justify-between text-white leading-[1.35] mix-blend-difference opacity-0 pointer-events-none translate-y-1 transition-[opacity,transform] duration-160 ease-in-out group-hover:opacity-100 group-hover:translate-y-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0">
                  <span className="block min-w-0 p-[0.3125rem] overflow-hidden text-ellipsis whitespace-nowrap">
                    {photograph.filename}
                  </span>
                  <time
                    className="block min-w-0 p-[0.3125rem] text-right whitespace-nowrap"
                    dateTime={date}
                  >
                    {date}
                  </time>
                </div>
              </figure>
            </article>
          );
        })}
      </section>
    </main>
  );
}
