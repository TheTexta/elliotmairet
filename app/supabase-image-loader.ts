"use client";

type ImageLoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

const storageOrigin = "https://api.dextery.dev";
const objectPathPrefix = "/storage/v1/object/public/elliotmairet/";
const renderPathPrefix = "/storage/v1/render/image/public/elliotmairet/";

function isR2PhotographUrl(url: URL) {
  const value = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.trim();

  if (!value) return false;

  try {
    const baseUrl = new URL(value);
    const basePath = `${baseUrl.pathname.replace(/\/$/, "")}/`;

    return (
      baseUrl.protocol === "https:"
      && url.origin === baseUrl.origin
      && url.pathname.startsWith(basePath)
    );
  } catch {
    return false;
  }
}

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

  if (isR2PhotographUrl(url)) {
    const options = `width=${width},quality=${quality ?? 75},format=auto`;
    if (url.pathname.startsWith("/elliotmairet/")) {
      url.searchParams.set("width", String(width));
      url.searchParams.set("quality", String(quality ?? 75));
      url.searchParams.set("format", "auto");
      return url.toString();
    }
    // Legacy root URLs retain the existing built-in transformation endpoint.
    return `${url.origin}/cdn-cgi/image/${options}/${url.toString()}`;
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
