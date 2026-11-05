import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import {
  getPhotographByFilename,
  getPhotographPalette,
  getPhotographs,
} from "@/lib/photographs/queries";
import { photographUrl } from "@/lib/photographs/storage";
import {
  absoluteUrl,
  photographDescription,
  photographImageAlt,
  photographJsonLd,
  photographPath,
  photographSocialImage,
  serializeJsonLd,
  siteName,
} from "@/lib/seo";

import { ContentFrame } from "../content-frame";
import { FadingImage } from "../fading-image";
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

export const revalidate = 86400;

export async function generateStaticParams() {
  const photographs = await getPhotographs();

  return photographs.map(({ filename }) => ({ filename }));
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
  const title = `${siteName} | ${photograph.filename}`;

  return {
    alternates: {
      canonical: canonicalPath,
    },
    description,
    openGraph: {
      description,
      images: socialImage,
      siteName,
      title,
      type: "article",
      url: absoluteUrl(canonicalPath),
    },
    title: { absolute: title },
    twitter: {
      card: "summary_large_image",
      description,
      images: socialImage,
      title,
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
            __html: serializeJsonLd(photographJsonLd(photograph)),
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
            <figure className="m-0 mt-[8vh] mb-[4vh]">
              <div className="h-[80vh] bg-white flex content-center items-center justify-center">
                <FullPhotographImage>
                  <FadingImage
                    alt={imageAlt}
                    className="block h-auto max-h-full w-[calc(100vw-32px)] max-w-full object-contain sm:w-[66.667vw]"
                    fetchPriority="high"
                    height={photograph.height}
                    loading="eager"
                    quality={82}
                    sizes={heroImageSizes(photograph.width, photograph.height)}
                    src={imageUrl}
                    width={photograph.width}
                  />
                </FullPhotographImage>
              </div>
            </figure>
            <div className="" />
            {palette.length > 0 ? (
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
