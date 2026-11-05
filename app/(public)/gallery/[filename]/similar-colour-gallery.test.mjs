import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("./similar-colour-gallery.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(source, { exports, require(name) {
  if (name === "motion/react") return {
    useReducedMotion: () => true,
    motion: { button: ({ style, title, type, children, ...props }) => createElement("button", {
      style, title, type, "aria-label": props["aria-label"], "aria-pressed": props["aria-pressed"],
    }, children) },
  };
  if (name === "@/lib/photographs/find-colour-matches") return {};
  if (name === "../photo-gallery") return { PhotoGallery: () => null };
  if (name === "./palette-reset-event") return {};
  return require(name);
} });

for (const count of [1, 2, 3, 5]) {
  test(`${count} genuine swatches get ${count} usable columns, without empty role placeholders`, () => {
    const palette = ["#111111", "#555555", "#999999", "#bbbbbb", "#ffffff"].slice(0, count);
    const html = renderToStaticMarkup(createElement(exports.SimilarColourGallery, { palette, currentFilename: "test.jpg" }));
    assert.equal((html.match(/<button/g) ?? []).length, count);
    assert.ok(html.includes(`grid-template-columns:repeat(${count}, minmax(0, 1fr))`));
  });
}
