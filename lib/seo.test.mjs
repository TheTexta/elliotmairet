import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  absoluteUrl,
  catalogueLastModified,
  photographDisplayTitle,
  photographImageAlt,
  photographDescription,
  photographJsonLd,
  photographPath,
  photographSocialImage,
  serializeJsonLd,
  siteName,
} from "./seo.ts";

const previousR2Url = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
before(() => { process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = "https://images.dextery.dev/elliotmairet"; });
after(() => {
  if (previousR2Url === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  else process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = previousR2Url;
});

const photograph = {
  storagePath: "uploads/photo name.jpg",
  width: 6000,
  height: 4000,
  year: "2026",
  altText: "  A mountain at dusk  ",
  title: "Evening",
};

test("social previews request a bounded transformation and advertise its dimensions", () => {
  const image = photographSocialImage(photograph);
  assert.equal(image.url, "https://images.dextery.dev/elliotmairet/uploads/photo%20name.jpg?width=1200&quality=82&format=auto");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 800);
  assert.equal(image.alt, "A mountain at dusk");
  const portrait = photographSocialImage({ ...photograph, width: 4000, height: 6000 });
  assert.equal(portrait.width, 1200);
  assert.equal(portrait.height, 1800);
  // Cloudflare truncates the scaled height; this matches the catalogue's
  // 6379x4575 original and its live 1200x860 transformation.
  assert.equal(photographSocialImage({ ...photograph, width: 6379, height: 4575 }).height, 860);
});

test("social previews do not advertise enlargement of a small source", () => {
  const image = photographSocialImage({ ...photograph, width: 600, height: 400 });
  assert.equal(image.width, 600);
  assert.equal(image.height, 400);
  assert.equal(new URL(image.url).searchParams.get("width"), "1200");
});

test("image descriptions prefer supplied alt text, then title, then the year", () => {
  assert.equal(photographImageAlt(photograph), "A mountain at dusk");
  assert.equal(photographImageAlt({ ...photograph, altText: " " }), "Evening");
  assert.equal(photographImageAlt({ ...photograph, altText: null, title: null }), "Photograph from 2026");
  assert.equal(photographImageAlt({ ...photograph, altText: null, title: null }, ""), "");
});

test("photograph page and social titles use the exact filename, not stored text", async () => {
  const photo = { ...photograph, filename: "20261104_evening-photo.JPG", description: "An approved description." };
  const mocks = {
    "react/jsx-runtime": {}, "react": {}, "next/navigation": {},
    "@/lib/photographs/queries": { getPhotographByFilename: async filename => {
      assert.equal(filename, photo.filename);
      return photo;
    } },
    "@/lib/photographs/storage": {},
    "@/lib/seo": { absoluteUrl, photographDescription, photographDisplayTitle, photographPath, photographSocialImage, siteName },
    "../content-frame": {}, "../fading-image": {}, "../image-sizes": {},
    "../index-navigation": {}, "../scroll-to-top": {},
    "./full-photograph-image": {}, "./similar-colour-gallery": {},
  };
  const source = ts.transpileModule(readFileSync(new URL("../app/(public)/gallery/[filename]/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require(name) {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
    return mocks[name];
  } });

  for (const title of ["Evening", " ", null]) {
    photo.title = title;
    const metadata = await exports.generateMetadata({ params: Promise.resolve({ filename: photo.filename }) });
    assert.equal(metadata.title.absolute, `${siteName} | ${photo.filename}`);
    assert.equal(metadata.openGraph.title, `${siteName} | ${photo.filename}`);
    assert.equal(metadata.twitter.title, `${siteName} | ${photo.filename}`);
    for (const value of [metadata, metadata.openGraph, metadata.twitter]) assert.equal(value.description, photo.description);
    assert.equal(metadata.openGraph.images[0].alt, "A mountain at dusk");
    assert.equal(metadata.alternates.canonical, photographPath(photo.filename));
  }
});

test("structured data cannot terminate its script element and still round-trips", () => {
  const value = { description: '</script><script>alert("example")</script> & <landscape>' };
  const serialized = serializeJsonLd(value);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), value);
});

test("homepage modification time uses the newest instant rather than catalogue order", () => {
  assert.equal(catalogueLastModified([
    { updatedAt: "2026-10-14T10:00:00Z" },
    { updatedAt: "2026-10-14T09:00:00-04:00" },
    { updatedAt: "2026-10-13T10:00:00Z" },
  ]), "2026-10-14T09:00:00-04:00");
  assert.equal(catalogueLastModified([]), undefined);
  assert.equal(catalogueLastModified([{ updatedAt: "invalid" }]), undefined);
});

test("approved descriptions and manual captions stay independent across SEO and JSON-LD", () => {
  const photo = { ...photograph, filename: "photo.jpg", description: "An approved factual description.",
    captionMode: "custom", customCaption: "Owner caption", capturedAt: null };
  assert.equal(photographDescription(photo), photo.description);
  assert.equal(photographImageAlt(photo), "A mountain at dusk");
  assert.equal(photographJsonLd(photo).description, photo.description);
  assert.equal(photographJsonLd(photo).caption, "Owner caption");
  assert.equal(photographJsonLd({ ...photo, captionMode: "hidden" }).caption, undefined);
  assert.match(photographDescription({ ...photo, description: null }), /Evening/);
});
