import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { archivePaletteColours, photographUrl } from "../archive";
import { galleryPhotographs } from "../photos";
import { FileSize } from "./file-size";
import { SimilarColourGallery } from "./similar-colour-gallery";

export async function generateStaticParams() {
  return galleryPhotographs.map(({ filename }) => ({ filename }));
}

export default async function PhotographPage({
  params,
}: PageProps<"/gallery/[filename]">) {
  const { filename } = await params;
  const photograph = galleryPhotographs.find(
    (candidate) => candidate.filename === filename,
  );

  if (!photograph) {
    notFound();
  }

  const palettes = await archivePaletteColours();
  const palette = palettes.get(photograph.filename) ?? [];
  const downloadUrl = `/api/gallery/download/${encodeURIComponent(photograph.filename)}`;

  return (
    <main className="min-h-[100svh] bg-white p-[0.625rem]">
      <section className="border border-[#050505]">
        <header className="grid min-h-9 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch border-b border-[#050505] text-[0.75rem] font-normal tracking-[-0.035em] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
          <Link
            className="content-center px-[0.625rem] text-[#050505] no-underline hover:bg-[#050505] hover:text-white focus-visible:bg-[#050505] focus-visible:text-white focus-visible:outline-none"
            href="/"
          >
            ← Gallery
          </Link>
          <span className="min-w-0 content-center overflow-hidden border-l border-[#050505] px-[0.625rem] text-ellipsis whitespace-nowrap">
            {photograph.filename}
          </span>
          <div className="order-last col-span-3 grid grid-cols-2 border-t border-[#050505] sm:order-none sm:col-span-1 sm:contents">
            <span className="content-center px-[0.625rem] whitespace-nowrap sm:border-l sm:border-[#050505]">
              {photograph.width} × {photograph.height} px
            </span>
            <FileSize url={downloadUrl} />
          </div>
          <a
            className="self-stretch content-center border-l border-[#050505] px-[0.625rem] text-[#050505] no-underline hover:bg-[#050505] hover:text-white focus-visible:bg-[#050505] focus-visible:text-white focus-visible:outline-none"
            download={photograph.filename}
            href={downloadUrl}
          >
            Download
          </a>
        </header>
        <figure className="m-0">
          <Image
            alt={`Photograph from ${photograph.year}`}
            className="block h-[80vh] w-full object-contain"
            height={photograph.height}
            priority
            quality={78}
            sizes="(max-width: 1600px) calc(100vw - 20px), 1580px"
            src={photographUrl(photograph.filename)}
            width={photograph.width}
          />
        </figure>
        {palette.length === 5 ? (
          <SimilarColourGallery palette={palette.map(({ hex }) => hex)} />
        ) : null}
      </section>
    </main>
  );
}