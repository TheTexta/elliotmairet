import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import {
  getPhotographByFilename,
  getPhotographPalette,
} from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";
import {
  absoluteUrl,
  photographDescription,
  photographDisplayTitle,
  photographImageAlt,
  photographJsonLd,
  photographPath,
  photographSocialImage,
  siteName,
} from "@/lib/seo";

import { ContentFrame } from "../content-frame";
import { heroImageSizes } from "../image-sizes";
import { IndexNavigation } from "../index-navigation";
import { ScrollToTop } from "../scroll-to-top";
import { FullPhotographImage } from "./full-photograph-image";
import { SimilarColourGallery } from "./similar-colour-gallery";

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

export async function generateMetadata({
  params,
}: PageProps<"/gallery/[filename]">): Promise<Metadata> {
  const { filename } = await params;
  const decodedFilename = decodeRouteFilename(filename);
  const photograph = await getPhotographByFilename(decodedFilename);

  if (!photograph) {
    return {
      robots: {
        follow: false,
        index: false,
      },
      title: "Photograph not found",
    };
  }

  const canonicalPath = photographPath(photograph.filename);
  const description = photographDescription(photograph);
  const socialImage = [photographSocialImage(photograph)];
  const title = photographDisplayTitle(photograph);

  return {
    alternates: {
      canonical: canonicalPath,
    },
    description,
    openGraph: {
      description,
      images: socialImage,
      siteName,
      title: `${title} | ${siteName}`,
      type: "article",
      url: absoluteUrl(canonicalPath),
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      images: socialImage,
      title: `${title} | ${siteName}`,
    },
  };
}

export default async function PhotographPage({
  params,
}: PageProps<"/gallery/[filename]">) {
  const { filename } = await params;
  const decodedFilename = decodeRouteFilename(filename);
  const photograph = await getPhotographByFilename(decodedFilename);

  if (!photograph) {
    notFound();
  }

  const palette = await getPhotographPalette(photograph.id);
  const imageAlt = photographImageAlt(photograph);
  const imageUrl = photographUrl(photograph.storagePath);

  return (
    <ViewTransition
      default="none"
      enter={{
        "gallery-to-photo": "photo-view-fade-in",
        "photo-to-photo": "view-fade-in-delayed",
        default: "none",
      }}
      exit={{
        "photo-to-gallery": "photo-view-fade-out",
        "photo-to-photo": "photo-view-fade-out",
        default: "none",
      }}
      key={photograph.filename}
    >
      <main className="min-h-svh ">
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(photographJsonLd(photograph)),
          }}
          type="application/ld+json"
        />
        <ScrollToTop
          routeKey={photograph.filename}
          transitionTypes={["gallery-to-photo", "photo-to-photo"]}
        />
        <IndexNavigation fromPhoto />
        <ContentFrame>
          <section>
            <figure className="m-0  h-[80vh] bg-white mt-[8vh] mb-[4vh] flex content-center items-center justify-center">
              <FullPhotographImage
                alt={imageAlt}
                className="block h-auto max-h-full w-auto max-w-full object-contain"
                fetchPriority="high"
                height={photograph.height}
                loading="eager"
                quality={82}
                sizes={heroImageSizes}
                src={imageUrl}
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
