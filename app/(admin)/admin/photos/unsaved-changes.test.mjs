import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("./unsaved-changes.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(confirmation = false, withHistoryIndex = false) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const cleanups = [];
  let confirmations = 0;
  class Element { closest() { return this; } }
  class HTMLAnchorElement extends Element {
    constructor(href, extra = {}) { super(); Object.assign(this, { href, target: "", download: "" }, extra); }
  }
  const exports = {};
  const historyWrites = [], traversals = [];
  const window = {
    location: new URL("https://example.test/admin/photos"),
    history: { state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "working editor" } },
      pushState(state, _unused, href) { historyWrites.push({ state, href }); this.state = state; window.location = new URL(href); },
      go(delta) { traversals.push(delta); },
    },
    navigation: withHistoryIndex ? { currentEntry: { index: 2 } } : undefined,
    confirm: () => { confirmations++; return confirmation; },
    addEventListener: (name, callback) => windowListeners.set(name, callback),
    removeEventListener: name => windowListeners.delete(name),
  };
  runInNewContext(source, {
    exports, URL, Element, HTMLAnchorElement,
    require: () => ({ useEffect: callback => cleanups.push(callback()) }),
    window,
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
  function pop(href, index) {
    window.location = new URL(href);
    if (window.navigation) window.navigation.currentEntry.index = index;
    const event = { stopped: false, stopImmediatePropagation() { this.stopped = true; } };
    windowListeners.get("popstate")?.(event);
    return event;
  }
  return { exports, windowListeners, documentListeners, cleanups, click, pop, window, historyWrites, traversals, confirmations: () => confirmations };
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
  // The pre-hydration history listener stays registered but is inert when clean.
  assert.equal(state.windowListeners.size, 1);
  assert.equal(state.windowListeners.has("beforeunload"), false);
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

test("declined Back restores the exact working entry before App Router sees the traversal", () => {
  const state = harness(false), working = state.window.history.state;
  state.exports.useUnsavedChanges(true);
  assert.equal(state.pop("https://example.test/admin/content").stopped, true);
  assert.equal(state.window.location.href, "https://example.test/admin/photos");
  assert.equal(state.historyWrites[0].state, working);
  assert.equal(state.confirmations(), 1);
});

test("indexed Back and Forward cancellations traverse back without replacing the history branch", () => {
  for (const index of [0, 1, 3, 4]) {
    const state = harness(false, true);
    state.exports.useUnsavedChanges(true);
    assert.equal(state.pop("https://example.test/admin/content", index).stopped, true);
    assert.deepEqual(state.traversals, [2 - index]);
    assert.equal(state.historyWrites.length, 0);
    // The restoration event reaches the current route without another warning.
    assert.equal(state.pop("https://example.test/admin/photos", 2).stopped, false);
    assert.equal(state.confirmations(), 1);
  }
});

test("accepted history traversal and same-route hashes do not rewrite history", () => {
  const state = harness(true);
  state.exports.useUnsavedChanges(true);
  assert.equal(state.pop("https://example.test/admin/photos#details").stopped, false);
  assert.equal(state.confirmations(), 0);
  assert.equal(state.pop("https://example.test/admin/content").stopped, false);
  assert.equal(state.confirmations(), 1);
  assert.equal(state.historyWrites.length, 0);
});

test("pending operations block links, sign-out and history even if leaving would be confirmed", () => {
  const state = harness(true);
  state.exports.useUnsavedChanges(true, true);
  assert.equal(state.click("https://example.test/admin/content").defaultPrevented, true);
  assert.equal(state.exports.confirmAdminNavigation(), false);
  assert.equal(state.pop("https://example.test/admin/content").stopped, true);
  assert.equal(state.confirmations(), 0);
  state.cleanups[0]();
  assert.equal(state.exports.confirmAdminNavigation(), true);
});

test("pre-hydration history listener is installed once, persists, and is inert outside unfinished admin work", () => {
  const state = harness();
  state.exports.installAdminHistoryGuard();
  const original = state.windowListeners.get("popstate");
  assert.equal(state.pop("https://example.test/").stopped, false);
  assert.equal(state.confirmations(), 0);
  state.window.location = new URL("https://example.test/admin/photos");
  state.exports.useUnsavedChanges(true);
  state.exports.installAdminHistoryGuard();
  assert.equal(state.windowListeners.get("popstate"), original);
  assert.equal(state.pop("https://example.test/admin/content").stopped, true);
  state.cleanups[0]();
  assert.equal(state.windowListeners.get("popstate"), original);
  assert.equal(state.pop("https://example.test/").stopped, false);
  assert.equal(state.exports.hasUnsavedAdminChanges(), false);
  assert.equal(state.confirmations(), 1);
  const bootstrap = readFileSync(new URL("../../../../instrumentation-client.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /import \{ installAdminHistoryGuard \} from/);
  assert.match(bootstrap, /installAdminHistoryGuard\(\);/);
});
