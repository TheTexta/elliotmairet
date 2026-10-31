import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("./unsaved-changes.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(confirmation = false) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const cleanups = [];
  let confirmations = 0;
  class Element { closest() { return this; } }
  class HTMLAnchorElement extends Element {
    constructor(href, extra = {}) { super(); Object.assign(this, { href, target: "", download: "" }, extra); }
  }
  const exports = {};
  runInNewContext(source, {
    exports, URL, Element, HTMLAnchorElement,
    require: () => ({ useEffect: callback => cleanups.push(callback()) }),
    window: {
      location: new URL("https://example.test/admin/photos"),
      confirm: () => { confirmations++; return confirmation; },
      addEventListener: (name, callback) => windowListeners.set(name, callback),
      removeEventListener: name => windowListeners.delete(name),
    },
    document: {
      addEventListener: (name, callback) => documentListeners.set(name, callback),
      removeEventListener: name => documentListeners.delete(name),
    },
  });
  function click(href, options = {}, linkOptions = {}) {
    const event = {
      button: 0, target: new HTMLAnchorElement(href, linkOptions),
      defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; }, ...options,
    };
    documentListeners.get("click")?.(event);
    return event;
  }
  return { exports, windowListeners, documentListeners, cleanups, click, confirmations: () => confirmations };
}

test("unchanged forms register no navigation warnings", () => {
  const state = harness();
  state.exports.useUnsavedChanges(false);
  assert.equal(state.windowListeners.size, 0);
  assert.equal(state.documentListeners.size, 0);
});

test("dirty forms prevent unload and declined internal navigation", () => {
  const state = harness();
  state.exports.useUnsavedChanges(true);
  let prevented = false;
  const unload = { preventDefault() { prevented = true; } };
  state.windowListeners.get("beforeunload")(unload);
  assert.equal(prevented, true);
  assert.equal(unload.returnValue, "");
  const click = state.click("https://example.test/admin/content");
  assert.equal(click.defaultPrevented, true);
  assert.equal(click.stopped, true);
  assert.equal(state.confirmations(), 1);
});

test("confirmed navigation proceeds", () => {
  const state = harness(true);
  state.exports.useUnsavedChanges(true);
  assert.equal(state.click("https://example.test/admin/content").defaultPrevented, false);
  assert.equal(state.confirmations(), 1);
});

test("downloads, new tabs, modified clicks and same-page anchors preserve editing", () => {
  const state = harness();
  state.exports.useUnsavedChanges(true);
  state.click("https://example.test/admin/photos#review");
  state.click("https://example.test/admin/photos");
  state.click("https://example.test/admin/content", { ctrlKey: true });
  state.click("https://example.test/image.jpg", {}, { target: "_blank" });
  state.click("blob:https://example.test/snapshot", {}, { download: "snapshot.json" });
  assert.equal(state.confirmations(), 0);
});

test("multiple dirty editors share one guard until all are clean", () => {
  const state = harness();
  state.exports.useUnsavedChanges(true);
  state.exports.useUnsavedChanges(true);
  assert.equal(state.documentListeners.size, 1);
  state.cleanups[0]();
  assert.equal(state.documentListeners.size, 1);
  state.click("https://example.test/admin/content");
  assert.equal(state.confirmations(), 1);
  state.cleanups[1]();
  assert.equal(state.documentListeners.size, 0);
  assert.equal(state.windowListeners.size, 0);
});

test("explicit sign-out navigation checks the same dirty registry", () => {
  const state = harness(false);
  assert.equal(state.exports.confirmAdminNavigation(), true);
  state.exports.useUnsavedChanges(true);
  assert.equal(state.exports.confirmAdminNavigation("Sign out?"), false);
  assert.equal(state.confirmations(), 1);
  state.cleanups[0]();
  assert.equal(state.exports.confirmAdminNavigation(), true);
});
