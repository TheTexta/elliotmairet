"use client";

type ImageLoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

const storageOrigin = "https://api.dextery.dev";
const objectPathPrefix = "/storage/v1/object/public/elliotmairet/";
const renderPathPrefix = "/storage/v1/render/image/public/elliotmairet/";

export default function supabaseImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps) {
  let url: URL;

  try {
    url = new URL(src);
  } catch {
    return src;
  }

  if (
    url.origin !== storageOrigin ||
    !url.pathname.startsWith(objectPathPrefix)
  ) {
    return src;
  }

  url.pathname = url.pathname.replace(objectPathPrefix, renderPathPrefix);
  url.searchParams.set("width", String(width));
  url.searchParams.set("quality", String(quality ?? 75));

  return url.toString();
}
