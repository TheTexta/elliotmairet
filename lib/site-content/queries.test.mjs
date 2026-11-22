import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { masonryGap } from "../photographs/masonry-geometry.ts";
import { photographImageAlt, serializeJsonLd, websiteJsonLd } from "../seo.ts";

const require = createRequire(import.meta.url);
function load(path, mocks) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require: name => mocks[name] ?? require(name) });
  return exports;
}
test("missing search descriptions use the clean default, never footer/contact content", async () => {
  let data = { footer_text: "Visible footer mail@example.test Instagram Developed by", seo_title: "Elliot Mairet", seo_description: " " };
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data }) };
  const content = load("./queries.ts", { "next/cache": { unstable_cache: fn => fn }, "@/lib/cache-tags": { cacheTags: {} },
    "@/lib/supabase/public": { createPublicClient: () => ({ from: () => chain }) } });
  let result = await content.getSiteContent();
  assert.equal(result.seoTitle, "Elliot Mairet");
  assert.equal(result.seoDescription, content.defaultSeoDescription);
  assert.equal(result.footerText, data.footer_text);
  assert.doesNotMatch(result.seoDescription, /@|Instagram|Developed|grateful/);
  data = { ...data, seo_description: " An owner-written search description. " };
  result = await content.getSiteContent();
  assert.equal(result.seoDescription, "An owner-written search description.");
});

test("homepage metadata uses the exact site title and separate description across search/social", async () => {
  const { generateMetadata } = load("../../app/(public)/page.tsx", {
    "@/lib/photographs/queries": { getPhotographs: async () => [] },
    "@/lib/site-content/queries": { getSiteContent: async () => ({ seoTitle: "Elliot Mairet", seoDescription: "A clean summary." }) },
    "@/lib/seo": { absoluteUrl: () => "https://elliotmairet.com/", siteName: "Elliot Mairet" }, "./gallery/gallery-view": {},
  });
  const metadata = await generateMetadata();
  assert.equal(metadata.title.absolute, "Elliot Mairet");
  assert.equal(metadata.openGraph.title, "Elliot Mairet");
  assert.equal(metadata.twitter.title, "Elliot Mairet");
  for (const value of [metadata, metadata.openGraph, metadata.twitter]) assert.equal(value.description, "A clean summary.");
});

test("homepage excludes the photo grid from snippets while preserving descriptive alt text", async () => {
  const photograph = {
    id: "photo-1", filename: "shore.jpg", storagePath: "uploads/shore.jpg",
    altText: "Rocks emerge from clear shallow water beside a wooded shoreline.",
    palette: [{ hex: "#4488aa" }],
  };
  const description = "Elliot Mairet is a Montreal based photographer from Victoria BC He is grateful for you";
  const ContentFrame = () => null;
  const ColourPhotoGallery = () => null;
  const { GalleryView } = load("../../app/(public)/gallery/gallery-view.tsx", {
    "@/lib/photographs/queries": { getPhotographsWithPalettes: async () => [photograph] },
    "@/lib/photographs/plan-colour-masonry": {
      planColourMasonryLayouts: () => ({ mobile: [[photograph]], desktop: [[photograph]] }),
    },
    "@/lib/photographs/storage": { photographUrl: path => `https://images.example.test/${path}` },
    "@/lib/site-content/queries": { getSiteContent: async () => ({ seoDescription: description }) },
    "@/lib/seo": { photographImageAlt, serializeJsonLd, websiteJsonLd },
    "./content-frame": { ContentFrame },
    "./index-navigation": { IndexNavigation: () => null },
    "./colour-photo-gallery": { ColourPhotoGallery },
    "./scroll-to-top": { ScrollToTop: () => null },
  });
  const tree = await GalleryView();
  const main = tree.props.children.find(node => node?.type === "main");
  const frame = main.props.children.find(node => node?.type === ContentFrame);
  const grid = frame.props.children;
  assert.equal(main.props["data-nosnippet"], undefined);
  assert.equal(frame.props["data-nosnippet"], undefined);
  assert.equal(grid.type, "div");
  assert.equal(grid.props["data-nosnippet"], "");
  assert.equal(grid.props.children.type, ColourPhotoGallery);
  assert.equal(grid.props.children.props.photographs[0].alt, photograph.altText);
  const structuredData = tree.props.children.find(node => node?.type === "script");
  assert.equal(JSON.parse(structuredData.props.dangerouslySetInnerHTML.__html).description, description);
});

test("only contact/credit footer content is excluded from Google snippets", async () => {
  const { default: PublicLayout } = load("../../app/(public)/layout.tsx", {
    "@/lib/photographs/masonry-geometry": { masonryGap },
    "@/lib/photographs/storage": { photographImageOrigin: () => "https://images.example.test" },
    "@/lib/site-content/queries": { getFooterText: async () => "Visible biography" },
    "./image-preconnect": { ImagePreconnect: () => null }, "./preview-navigation-bridge": { PreviewNavigationBridge: () => null },
    "./layout.module.css": { default: { page: "public-page" } },
  });
  const tree = await PublicLayout({ children: null });
  const footer = tree.props.children.find(node => node?.type === "footer");
  const [contacts, biography] = footer.props.children;
  assert.equal(tree.props["data-nosnippet"], undefined);
  assert.equal(footer.props["data-nosnippet"], undefined);
  assert.equal(contacts.props["data-nosnippet"], "");
  assert.equal(biography.props["data-nosnippet"], undefined);
  assert.equal(biography.props.children.props.children, "Visible biography");
});

test("site content action validates and writes separate SEO fields without clearing older forms", async () => {
  let patch, authorized = 0, invalidations = 0;
  const chain = { update: value => { patch = value; return chain; }, eq: () => chain, select: () => chain,
    maybeSingle: async () => ({ data: { singleton: true }, error: null }) };
  const { updateSiteContentAction } = load("../../app/(admin)/admin/actions.ts", {
    "next/cache": { revalidatePath() {} }, "next/navigation": {},
    "@/lib/cache-invalidation": { invalidateSiteContent() { invalidations++; } },
    "@/lib/photographs/config": {}, "@/lib/r2/server": {}, "@/lib/supabase/server": {},
    "@/lib/supabase/admin": { requireAdmin: async () => { authorized++; return { supabase: { from: () => chain } }; } },
  });
  const data = new FormData();
  data.set("footerText", "Visible footer"); data.set("seoTitle", " Elliot Mairet "); data.set("seoDescription", " Clean summary. ");
  assert.ok((await updateSiteContentAction({}, data)).message);
  assert.equal(patch.footer_text, "Visible footer");
  assert.equal(patch.seo_title, "Elliot Mairet");
  assert.equal(patch.seo_description, "Clean summary.");
  assert.ok(Number.isFinite(Date.parse(patch.updated_at)));
  assert.equal(authorized, 1); assert.equal(invalidations, 1);
  data.delete("seoDescription");
  await updateSiteContentAction({}, data);
  assert.equal(Object.hasOwn(patch, "seo_description"), false);
  const before = patch;
  data.set("seoDescription", "x".repeat(321));
  assert.ok((await updateSiteContentAction({}, data)).error);
  assert.equal(patch, before);
});
