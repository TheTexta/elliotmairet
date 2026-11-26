// Isolated mounted-React fixture: no Next server, env files or production calls.
// Import createColourSelectionFixture for the finite runner, or run this file
// directly for an interactive loopback fixture.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import ts from "typescript";

import { runColourSelectionTests } from "./fixtures/colour-selection-browser.mjs";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function createColourSelectionFixture() {
  const modules = {};
  for (const [name, file] of Object.entries({
    react: "react/cjs/react.development.js",
    "react/jsx-runtime": "react/cjs/react-jsx-runtime.development.js",
    "react-dom": "react-dom/cjs/react-dom.development.js",
    "react-dom/client": "react-dom/cjs/react-dom-client.development.js",
    scheduler: "scheduler/cjs/scheduler.development.js",
  })) {
    const [packageName, ...path] = file.split("/");
    modules[name] = readFileSync(new URL(path.join("/"), pathToFileURL(require.resolve(`${packageName}/package.json`))), "utf8");
  }
  const sources = {
    ...Object.fromEntries(["photograph-colour-selection", "full-photograph-image", "similar-colour-gallery"].map(name =>
      [`./${name}`, `../app/(public)/gallery/[filename]/${name}.tsx`])),
    "@/lib/photographs/colour-palettes": "../lib/photographs/colour-palettes.ts",
    "@/lib/photographs/find-colour-matches": "../lib/photographs/find-colour-matches.ts",
    "./colour.ts": "../lib/photographs/colour.ts",
    "./select-similar-matches.ts": "../lib/photographs/select-similar-matches.ts",
  };
  for (const [name, path] of Object.entries(sources)) {
    modules[name] = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
  }
  // Motion and thumbnails remain adapters; owner, hero, gallery effects, decoder,
  // shared request cache and colour matcher are the actual application modules.
  modules["motion/react"] = `
const React = require("react");
exports.useReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
exports.motion = { button: ({ animate, initial, transition, style, ...props }) => React.createElement("button", {
  ...props, "data-motion-duration": transition.duration, style: { ...style, transform: "scale(" + animate.scale + ")" }
}) };
`;
  modules["../photo-gallery"] = `
const React = require("react");
exports.PhotoGallery = ({ photographs, ariaLabel }) => React.createElement("div", {
  "aria-label": ariaLabel, "data-matches": JSON.stringify(photographs.map(photo => photo.filename)),
  className: "grid grid-cols-2 gap-4 sm:grid-cols-3"
}, photographs.map(photo => React.createElement("div", {
  key: photo.filename, style: { aspectRatio: "3 / 2", background: photo.filename.includes("light") ? "#ddd" : "#222" }
})));
`;
  const bundle = Object.entries(modules).map(([name, source]) => `${JSON.stringify(name)}: function(module, exports, require) {\n${source}\n}`).join(",\n");
  const script = `
const process = { env: { NODE_ENV: "development" } };
const modules = { ${bundle} }, cache = {};
function require(name) {
  if (!modules[name]) throw Error("Unexpected browser dependency: " + name);
  if (!cache[name]) { const module = cache[name] = { exports: {} }; modules[name](module, module.exports, require); }
  return cache[name].exports;
}
require.freshSelection = () => {
  for (const name of ["./photograph-colour-selection", "./similar-colour-gallery", "@/lib/photographs/colour-palettes"]) delete cache[name];
  return require("./photograph-colour-selection").PhotographColourSelection;
};
(${runColourSelectionTests.toString()})(require);
`;
  // Compile the real public utilities without Next/font, app config, or env.
  const cssPath = new URL("../app/globals.css", import.meta.url);
  const css = (await postcss([tailwindcss({ base: projectRoot })]).process(readFileSync(cssPath, "utf8"), {
    from: fileURLToPath(cssPath),
  })).css;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript"); response.end(script);
    } else if (request.url === "/fixture.css") {
      response.setHeader("Content-Type", "text/css"); response.end(css);
    } else if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'");
      response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline palette selection tests</title><link rel="stylesheet" href="/fixture.css"><body class="min-w-[320px] m-0 bg-white text-black text-sm uppercase"><main class="px-4" style="font-family: sans-serif"><div id="root"></div><div id="other"></div></main><pre id="results" hidden>Running…</pre><script src="/fixture.js"></script></body></html>');
    } else {
      response.writeHead(404); response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await createColourSelectionFixture();
  console.log(`Offline palette fixture: ${fixture.url}`);
  const close = () => { void fixture.close(); };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
