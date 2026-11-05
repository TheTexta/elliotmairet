import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { masonryGap, masonryGeometry, photographAspectRatio } from "../../../lib/photographs/masonry-geometry.ts";

const require = createRequire(import.meta.url);
const photographs = [
  { filename: "a", width: 100, height: 150 },
  { filename: "b", width: 100, height: 50 },
  { filename: "c", width: 100, height: 100 },
  { filename: "d", width: 100, height: 75 },
];

test("planning and rendering scale image heights AND gutters in the same unit", () => {
  const { positions, heights } = masonryGeometry(photographs, [[0, 1], [2, 3]]);
  assert.equal(positions.get(1).top, 1.5 + masonryGap);
  assert.equal(positions.get(3).top, 1 + masonryGap);
  assert.ok(Math.abs(heights[0] - 2 - masonryGap) < 1e-12);
  assert.ok(Math.abs(heights[1] - 1.75 - masonryGap) < 1e-12);
  for (const width of [144, 171, 224, 304, 416]) {
    const firstBottom = width * 1.5;
    const nextTop = width * positions.get(1).top;
    assert.ok(Math.abs(nextTop - firstBottom - width * masonryGap) < 1e-10);
  }
});

test("empty column geometry has no negative gutters or missing canvas height", () => {
  assert.deepEqual(masonryGeometry([], [[], []]).heights, [0, 0]);
});

test("invalid or unknown aspect ratios use the SAME square fallback in both stages", () => {
  for (const p of [{ width: 0, height: 100 }, { width: 100, height: 0 }, { width: NaN, height: 12 }, { width: 100, height: Infinity }]) {
    assert.equal(photographAspectRatio(p), 1);
    assert.equal(masonryGeometry([p], [[0], []]).heights[0], 1);
  }
});

test("side-contact graph stays identical through the END of a long mixed-ratio gallery at every width", () => {
  const items = Array.from({ length: 300 }, (_, index) => ({ width: 100, height: [18, 67, 150, 300, 90][index % 5] }));
  for (const count of [2, 3]) {
    const columns = Array.from({ length: count }, (_, column) => items.flatMap((_, i) => i % count === column ? [i] : []));
    const geometry = masonryGeometry(items, columns);
    const expected = geometry.contacts.filter(c => geometry.positions.get(c.first).column !== geometry.positions.get(c.second).column)
      .map(c => [c.first, c.second].sort((a, b) => a - b).join(":" )).sort();
    for (const container of [288, 358, 426.67, 512, 960, 1280]) {
      const width = container / (count + (count - 1) * masonryGap);
      const actual = [];
      for (let column = 1; column < count; column++) {
        for (const a of columns[column - 1]) for (const b of columns[column]) {
          const first = geometry.positions.get(a), second = geometry.positions.get(b);
          const overlap = Math.min(first.bottom * width, second.bottom * width) - Math.max(first.top * width, second.top * width);
          if (overlap > 1e-6) actual.push([a, b].sort((x, y) => x - y).join(":"));
        }
      }
      assert.deepEqual(actual.sort(), expected);
    }
  }
});

test("the server emits one photograph tree with both responsive positions", () => {
  const calls = [];
  const source = ts.transpileModule(readFileSync(new URL("./colour-photo-gallery.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require(name) {
    if (name === "@/lib/photographs/masonry-geometry") return { masonryGap, masonryGeometry };
    if (name.endsWith(".module.css")) return { default: { canvas: "canvas", gallery: "gallery", photograph: "photograph" } };
    if (name === "./photo-gallery") return { GalleryItem(props) { calls.push(props); return null; } };
    return require(name);
  } });
  const { createElement } = require("react");
  const columnPlans = { mobile: [[0, 1], [2, 3]], desktop: [[0, 3], [1], [2]] };
  const html = renderToStaticMarkup(createElement(exports.ColourPhotoGallery, { photographs, columnPlans }));
  assert.equal(calls.length, photographs.length);
  assert.equal(new Set(calls.map(call => call.photograph.filename)).size, photographs.length);
  assert.deepEqual(calls.filter(call => call.eager).map(call => call.photograph.filename).sort(), ["a", "b", "c"]);
  assert.ok(html.includes("--mobile-height:calc("));
  assert.ok(html.includes("--desktop-height:calc("));
  assert.ok(html.includes(`--mobile-tracks:${2 + masonryGap}`));
  assert.ok(html.includes(`--desktop-tracks:${3 + 2 * masonryGap}`));
  for (const call of calls) {
    assert.equal(call.layout, "positioned");
    assert.ok(call.style["--mobile-top"].startsWith("calc("));
    assert.ok(call.style["--desktop-top"].startsWith("calc("));
  }
});

test("unknown dimensions reach the image loader as a valid square, not NaN/zero", () => {
  const calls = [];
  const { createElement } = require("react");
  const source = ts.transpileModule(readFileSync(new URL("./photo-gallery.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require(name) {
    if (name === "@/lib/photographs/masonry-geometry") return { photographAspectRatio };
    if (name === "./fading-image") return { FadingImage(props) { calls.push(props); return null; } };
    if (name === "./image-sizes") return { galleryImageSizes: "100vw" };
    if (name === "./photo-gallery-columns") return {};
    if (name === "./transition-link") return { TransitionLink({ children }) { return createElement("a", {}, children); } };
    return require(name);
  } });
  const html = renderToStaticMarkup(createElement(exports.GalleryItem, {
    photograph: { filename: "unknown", width: NaN, height: 0, year: "2026", imageUrl: "/test.jpg" },
    index: 0, layout: "positioned",
  }));
  assert.equal(calls[0].width, 1024);
  assert.equal(calls[0].height, 1024);
  assert.ok(html.includes("aspect-ratio:1"));
  assert.ok(calls[0].className.includes("object-contain"));
});
