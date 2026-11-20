// Isolated mounted-React fixture: no Next server, credentials or external calls.
// Run this script, then open its loopback URL. Results appear on the page and in
// window.testResults. Motion/thumbnail rendering and palette matching are stubs;
// the real selection owner, hero and asynchronous gallery effects are mounted.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = {};
for (const [name, file] of Object.entries({
  react: "react/cjs/react.development.js",
  "react/jsx-runtime": "react/cjs/react-jsx-runtime.development.js",
  "react-dom": "react-dom/cjs/react-dom.development.js",
  "react-dom/client": "react-dom/cjs/react-dom-client.development.js",
  scheduler: "scheduler/cjs/scheduler.development.js",
})) {
  const [packageName, ...path] = file.split("/");
  modules[name] = readFileSync(new URL(path.join("/"), `file://${require.resolve(`${packageName}/package.json`)}`), "utf8");
}
for (const name of ["photograph-colour-selection", "full-photograph-image", "similar-colour-gallery"]) {
  modules[`./${name}`] = ts.transpileModule(readFileSync(new URL(`../app/(public)/gallery/[filename]/${name}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
modules["motion/react"] = `
const React = require("react");
exports.useReducedMotion = () => true;
exports.motion = { button: ({ animate, initial, transition, ...props }) => React.createElement("button", props) };
`;
modules["../photo-gallery"] = `
exports.PhotoGallery = ({ photographs }) => require("react").createElement("output", { "data-matches": true }, photographs.map(photo => photo.filename).join(","));
`;
modules["@/lib/photographs/find-colour-matches"] = `
exports.findColourMatches = (_photos, hexes, filename) => ({ matches: Array.from({length: 80}, (_, index) => ({ filename: filename + ":" + hexes.join("+") + ":" + index })) });
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
const React = require("react"), { createRoot } = require("react-dom/client"), { flushSync } = require("react-dom");
const { PhotographColourSelection } = require("./photograph-colour-selection");
const root = createRoot(document.getElementById("root"));
const other = createRoot(document.getElementById("other"));
const palette = ["#111111", "#ffffff"];
let requests = 0, resolveRequest;
window.fetch = url => { if (url !== "/api/gallery/palettes") throw Error("Unexpected fetch"); requests++; return new Promise(resolve => { resolveRequest = () => resolve({ ok: true, json: async () => [] }); }); };
const observers = [];
window.IntersectionObserver = class {
  constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
  observe() {} disconnect() { this.disconnected = true; }
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const mount = (filename, target = root) => flushSync(() => target.render(React.createElement(PhotographColourSelection, {
  key: filename, currentFilename: filename, palette,
}, React.createElement("img", { alt: "server photograph child" }))));
const hero = (id = "root") => document.querySelector("#" + id + " figure button");
const swatch = index => document.querySelectorAll("#root nav button")[index];
const matches = () => document.querySelector("#root output")?.textContent;
const click = element => flushSync(() => element.click());
const checks = [];
function check(value, message) { if (!value) throw Error(message); checks.push(message); }
(async () => {
  mount("first.jpg");
  check(hero().disabled, "Hero starts disabled");
  check(document.querySelector("#root img").alt === "server photograph child", "Server child survives composition");
  click(swatch(0));
  check(!hero().disabled, "Selection enables hero while request is suspended");
  check(swatch(0).getAttribute("aria-pressed") === "true", "Swatch reflects sole selected hex");
  mount("independent.jpg", other);
  check(hero("other").disabled, "Independent owner is not filtered");
  check(requests === 1, "Pending palette request deduplicated across owners");
  resolveRequest(); await wait(30);
  check(matches().includes("first.jpg:#111111:0"), "Selected hex drives matching");
  check(matches().split(",").length === 36, "Initial results retain 36-item pagination");
  const observer = observers.find(value => !value.disconnected);
  check(observer.options.rootMargin === "1000px 0px", "Pagination retains loading threshold");
  flushSync(() => observer.callback([{ isIntersecting: true }]));
  check(matches().split(",").length === 72, "Observer reveals next 36 results");
  click(hero()); await wait(130);
  check(hero().disabled && swatch(0).getAttribute("aria-pressed") === "false", "Hero resets selection and pressed state together");
  check(matches().includes("first.jpg:#111111+#ffffff:0"), "Reset restores full-palette matching");
  click(swatch(0)); await wait(10); click(swatch(1)); await wait(130);
  check(matches().includes("first.jpg:#ffffff:0") && !matches().includes("first.jpg:#111111:0"), "Cancelled fade cannot overwrite latest selection");
  click(swatch(0)); await wait(10); mount("next.jpg"); await wait(130);
  check(hero().disabled, "Keyed navigation resets hero before stale fade completes");
  check(matches().includes("next.jpg:#111111+#ffffff:0") && !matches().includes("first.jpg"), "Unmount cancels previous photograph matching");
  check(requests === 1, "Navigation reuses resolved palette request");
  window.testResults = { passed: checks.length, checks };
})().catch(error => { window.testResults = { failed: error.message, checks }; }).finally(() => {
  document.getElementById("results").textContent = JSON.stringify(window.testResults, null, 2);
});
`;
const server = createServer((request, response) => {
  if (request.url === "/fixture.js") {
    response.setHeader("Content-Type", "text/javascript"); response.end(script);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><meta charset="utf-8"><title>Offline palette selection tests</title><div id="root"></div><div id="other"></div><pre id="results">Running…</pre><script src="/fixture.js"></script>');
  }
});
server.listen(0, "127.0.0.1", () => console.log(`Offline palette fixture: http://127.0.0.1:${server.address().port}`));
