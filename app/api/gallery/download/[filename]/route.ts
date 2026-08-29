import { photographUrl } from "@/app/gallery/archive";
import { galleryPhotographs } from "@/app/gallery/photos";

async function downloadResponse(filename: string, method: "GET" | "HEAD") {
  const photograph = galleryPhotographs.find(
    (candidate) => candidate.filename === filename,
  );

  if (!photograph) {
    return new Response(null, { status: 404 });
  }

  const source = await fetch(photographUrl(photograph.filename), {
    cache: "no-store",
    method,
  });

  if (!source.ok || (method === "GET" && !source.body)) {
    return new Response("Photograph download unavailable.", { status: 502 });
  }

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `attachment; filename="${photograph.filename}"; filename*=UTF-8''${encodeURIComponent(photograph.filename)}`,
    "Content-Type": source.headers.get("content-type") ?? "application/octet-stream",
  });
  const contentLength = source.headers.get("content-length");

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(method === "GET" ? source.body : null, { headers });
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/gallery/download/[filename]">,
) {
  const { filename } = await params;

  return downloadResponse(filename, "GET");
}

export async function HEAD(
  _request: Request,
  { params }: RouteContext<"/api/gallery/download/[filename]">,
) {
  const { filename } = await params;

  return downloadResponse(filename, "HEAD");
}