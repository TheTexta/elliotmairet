import Image from "next/image";
import Link from "next/link";

const storageBaseUrl =
  "https://api.dextery.dev/storage/v1/object/public/elliotmairet";

const photographs = [
  { filename: "20260623-DSCF5971.jpg", width: 4364, height: 6546 },
  { filename: "20260508-DSCF2612.jpg", width: 14804, height: 9856 },
  { filename: "20260412-IMG_8519.jpg", width: 5790, height: 3860 },
  { filename: "20260723-DSCF1076.jpg", width: 6218, height: 4145 },
  { filename: "20260613-DSCF3930.jpg", width: 7478, height: 4985 },
  { filename: "20260621-DSCF5714.jpg", width: 6407, height: 4271 },
  { filename: "20260628-DSCF6810.jpg", width: 6807, height: 4538 },
  { filename: "20260818-DSCF3780.jpg", width: 7728, height: 5152 },
  { filename: "20260609-DSCF3398.jpg", width: 7728, height: 5152 },
  { filename: "20260505-DSCF2323.jpg", width: 7728, height: 5152 },
  { filename: "20260423-DSCF0374.jpg", width: 7728, height: 5152 },
  { filename: "20260328-IMG_7181.jpg", width: 6000, height: 4000 },
  { filename: "20260624-DSCF6158.jpg", width: 4741, height: 7111 },
  { filename: "20260713-DSCF0205.jpg", width: 6199, height: 4133 },
  { filename: "20260802-DSCF2102.jpg", width: 6699, height: 4466 },
  { filename: "20260822-DSCF4355.jpg", width: 6983, height: 4655 },
  { filename: "20260611-DSCF3748.jpg", width: 6827, height: 4551 },
  { filename: "20260510-DSCF0444.jpg", width: 7728, height: 5152 },
  { filename: "20260430-DSCF1506.jpg", width: 7134, height: 4596 },
  { filename: "20260224-R1-01855-0015.jpg", width: 3242, height: 2173 },
  { filename: "20250707-IMG_3803 5.jpg", width: 6000, height: 4000 },
  { filename: "20250629-IMG_2105.jpg", width: 6000, height: 4000 },
  { filename: "20250627-IMG_1302.jpg", width: 6000, height: 4000 },
] as const;

function photographUrl(filename: string) {
  return `${storageBaseUrl}/${encodeURIComponent(filename)}`;
}

function yearFromFilename(filename: string) {
  return filename.slice(0, 4);
}

export default function Home() {
  return (
    <main className="min-h-[100svh] p-4">
      <a
        className="fixed z-20 top-2 left-2 -translate-y-[200%] focus:translate-y-0 px-[0.625rem] py-2 bg-[#101010] text-[#fbfbfa] tracking-normal underline-offset-[0.1em] decoration-[0.06em]"
        href="#photographs"
      >
        Skip to photographs
      </a>

      <nav
        className="fixed z-10 top-4 left-4 grid w-max text-white text-sm min-[721px]:text-[clamp(0.875rem,1vw,1rem)] leading-[1.35] mix-blend-difference"
        aria-label="Primary navigation"
      >
        <a
          className="w-fit mb-[0.9rem] no-underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
          href="#top"
        >
          Elliot Mairet
        </a>
        <div className="grid gap-[0.1rem]">
          <a
            className="w-fit underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
            href="#photographs"
          >
            Photographs
          </a>
          <a
            className="w-fit no-underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
            href="#selected"
          >
            Selected
          </a>
          <Link
            className="w-fit no-underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
            href="/gallery"
          >
            Gallery
          </Link>
          <Link
            className="w-fit no-underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
            href="/experiments/palettes"
          >
            Palette study
          </Link>
          <a
            className="w-fit no-underline hover:underline focus-visible:underline underline-offset-[0.1em] decoration-[0.06em]"
            href="#information"
          >
            Information
          </a>
        </div>
      </nav>

      <div
        className="block min-[721px]:grid min-[721px]:grid-cols-12 min-[721px]:gap-x-4 min-[721px]:items-start"
        id="top"
      >
        <section
          className="w-full min-w-0 min-[721px]:col-start-4 min-[721px]:col-span-8 min-[961px]:col-span-6"
          id="photographs"
          aria-label="Photographs"
        >
          <h1 className="sr-only">Elliot Mairet — Photographs</h1>

          <div className="grid gap-4" id="selected">
            {photographs.map((photograph, index) => (
              <figure className="min-w-0 m-0 bg-[#f0f0ed]" key={photograph.filename}>
                <Image
                  alt={`Untitled photograph, ${yearFromFilename(photograph.filename)}`}
                  className="block w-full h-auto"
                  height={photograph.height}
                  priority={index === 0}
                  quality={78}
                  sizes="(max-width: 720px) calc(100vw - 32px), (max-width: 960px) 66vw, 50vw"
                  src={photographUrl(photograph.filename)}
                  width={photograph.width}
                />
              </figure>
            ))}
          </div>

          <section
            className="grid grid-cols-1 min-[721px]:grid-cols-2 gap-1 min-[721px]:gap-4 mt-[clamp(6rem,14vw,12rem)] text-[0.75rem] font-medium tracking-[-0.035em] leading-[1.25]"
            id="archive"
            aria-labelledby="archive-heading"
          >
            <h2 className="m-0 text-inherit font-inherit" id="archive-heading">
              Archive
            </h2>
            <p className="m-0">197 photographs, 2025—2026</p>
          </section>

          <footer
            className="grid grid-cols-1 min-[721px]:grid-cols-2 gap-1 min-[721px]:gap-4 mt-4 mb-4 text-[0.75rem] font-medium tracking-[-0.035em] leading-[1.25]"
            id="information"
          >
            <p className="m-0">Elliot Mairet</p>
            <p className="m-0">Selected photographs from an ongoing archive.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
