import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url), modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`./${file}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require: name => name === "@/lib/utils" ? require("cn") : name.startsWith("./") ? load(name.slice(2)) : require(name) });
  modules.set(file, exports); return exports;
}
const render = (component, props, ...children) => renderToStaticMarkup(createElement(component, props, ...children));
test("real shadcn controls retain native form contracts and readable defaults", () => {
  const { Input } = load("input"), { Textarea } = load("textarea"), { NativeSelect } = load("native-select");
  const input = render(Input, { name: "capturedAt", type: "date", required: true, disabled: true, defaultValue: "2026-10-31" });
  for (const expected of ["data-slot=\"input\"", "name=\"capturedAt\"", "type=\"date\"", "required=\"\"", "disabled=\"\"", "min-h-11", "text-base"]) assert.ok(input.includes(expected), expected);
  const area = render(Textarea, { name: "description", maxLength: 1000, defaultValue: "My text" });
  assert.match(area, /name="description"/); assert.match(area, /maxLength="1000"/); assert.match(area, />My text<\/textarea>/);
  const select = render(NativeSelect, { name: "captionMode", defaultValue: "hidden" }, createElement("option", { value: "hidden" }, "Hidden"));
  assert.match(select, /<select[^>]*name="captionMode"/); assert.match(select, /value="hidden" selected=""/);
});
test("real Button supports native submissions, disabled state and asChild links", () => {
  const { Button } = load("button");
  const submit = render(Button, { type: "submit", disabled: true, variant: "outline" }, "Save changes");
  assert.match(submit, /type="submit"/); assert.match(submit, /disabled=""/); assert.match(submit, /border-input/);
  assert.match(submit, /rounded-none/); assert.match(submit, /min-h-11/);
  const link = render(Button, { asChild: true, variant: "ghost" }, createElement("a", { href: "/admin/content" }, "Site content"));
  assert.match(link, /^<a /); assert.match(link, /href="\/admin\/content"/); assert.doesNotMatch(link, /<button/);
});
test("admin CSS defines scoped tokens without changing public radius/body defaults", async () => {
  const css = readFileSync(new URL("../../app/(admin)/admin/admin.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-ui\s*\{/); assert.doesNotMatch(css, /(?:^|\n)(?::root|body|\*)\s*\{/);
  assert.doesNotMatch(css, /--radius-(?:sm|md|lg)\s*:/);
  const { default: postcss } = await import("postcss");
  const { default: tailwind } = await import("@tailwindcss/postcss");
  const path = new URL("../../app/globals.css", import.meta.url);
  const result = await postcss([tailwind()]).process(readFileSync(path, "utf8"), { from: fileURLToPath(path) });
  for (const utility of ["bg-primary", "text-primary-foreground", "bg-popover", "border-input", "text-muted-foreground"]) assert.ok(result.css.includes(`.${utility}`), utility);
});
