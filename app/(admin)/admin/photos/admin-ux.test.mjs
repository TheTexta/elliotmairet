import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as text from "../../../../lib/photographs/text.ts";

const require = createRequire(import.meta.url);
const primitives = {
  "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" },
  "@/components/ui/textarea": { Textarea: "textarea" }, "@/components/ui/label": { Label: "label" },
  "@/components/ui/native-select": { NativeSelect: "select" },
  "@/components/ui/alert": { Alert: "div", AlertTitle: "div", AlertDescription: "div" },
  "../confirm-provider": { useAdminConfirm: () => async () => true },
  "./unsaved-changes": { useUnsavedChanges() {}, hasUnsavedAdminChanges: () => false },
  "./palette-indicator": { PaletteIndicator: "span" },
  "../admin-workspace": { useAdminUploadNavigation: () => ({ setUploadBusy() {} }) },
  "next/link": { __esModule: true, default: "a" },
  "next/navigation": { unstable_rethrow() {} },
};
function load(file, mocks = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, FormData, URL, URLSearchParams, window: { confirm: () => true },
    require: name => mocks[name] ?? primitives[name] ?? (name === "@/lib/photographs/text" ? text : require(name)), ...globals });
  return exports;
}
const { matchesPhotograph } = load("./archive-filter.ts");
const archive = load("./archive-state.ts");
const state = load("./photo-editor-state.ts");
const photo = { id: "photo-a", filename: "2026-photo.jpg", title: "Yellow leaves", description: "A tree in autumn.", altText: "Branches with yellow leaves",
  customCaption: "Retained caption", captionMode: "description", capturedAt: "2026-10-31", textRevision: 1, textMetadataAvailable: true,
  textSources: { title: "ai", description: "ai", alt_text: "ai" }, sortOrder: 2, palette: [], storagePath: "uploads/a.jpg", width: 1200, height: 800 };
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => nodes(child, predicate))];
}
const find = (tree, predicate) => nodes(tree, predicate)[0];
const named = (tree, name) => find(tree, node => node.props?.name === name);
function hooks() {
  const slots = [];
  let cursor = 0, changed = false, reducer, result = {}, pending = false, jobs = [];
  return {
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
        return [slots[slot], update => { slots[slot] = typeof update === "function" ? update(slots[slot]) : update; changed = true; }];
      },
      useRef: initial => ({ current: initial }), useId: () => "test-id", useEffect() {}, useCallback: callback => callback,
      useActionState(action) { reducer = action; return [result, () => {}, pending]; },
      useTransition: () => [false, work => { jobs.push(Promise.resolve(work())); }],
    },
    render(component, props) {
      let tree;
      do { changed = false; cursor = 0; tree = component(props); } while (changed);
      return tree;
    },
    async submit(data) { pending = true; try { result = await reducer(result, data); } finally { pending = false; } },
    async settle() { const current = jobs; jobs = []; await Promise.all(current); },
  };
}

function archiveHarness(photographs, search = "", observerAvailable = true) {
  const h = hooks(), writes = [];
  const focused = [], observers = [];
  let effects = [], tree;
  let params = new URLSearchParams(search);
  function write(_state, _unused, href) { writes.push(href); params = new URL(href, "https://example.test").searchParams; }
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const { PhotographArchive } = load("./photograph-archive.tsx", {
    react: { ...h.react, useEffect: callback => effects.push(callback) }, "./archive-filter": { matchesPhotograph }, "./archive-state": archive,
    "../page-heading": { AdminPageHeading: "page-heading" }, "./photograph-thumbnail": { PhotographThumbnail: "photo-thumbnail", PhotographPlaceholder: "photo-placeholder" },
    "./gallery-position": {}, "next/navigation": { useSearchParams: () => params },
  }, { window: { history: { replaceState: write } }, IntersectionObserver: observerAvailable ? IntersectionObserver : undefined,
    requestAnimationFrame: callback => callback(), document: { getElementById: id => ({ focus: () => focused.push(id) }) } });
  return { render: automaticAlt => {
    effects = []; tree = h.render(PhotographArchive, { photographs, automaticAlt });
    const gallery = find(tree, node => node.type === "div" && node.props.ref);
    if (gallery) gallery.props.ref.current = { querySelectorAll: () => nodes(tree, node => node.type === "photo-placeholder")
      .map(node => ({ dataset: { photographIndex: String(node.props.index) } })) };
    return tree;
  }, writes, focused, observers, observe: () => effects.at(-1)() };
}

test("archive search combines words across readable fields and clear filters", () => {
  assert.equal(matchesPhotograph(photo, "LEAVES autumn", "all"), true);
  assert.equal(matchesPhotograph(photo, "2026-photo", "all"), true);
  assert.equal(matchesPhotograph(photo, "", "missing"), false);
  assert.equal(matchesPhotograph({ ...photo, altText: " " }, "", "missing"), true);
  assert.equal(matchesPhotograph(photo, "", "hidden"), false);
  assert.equal(matchesPhotograph({ ...photo, captionMode: "hidden" }, "", "hidden"), true);
  assert.equal(matchesPhotograph(photo, "not present", "all"), false);
});

test("automatic alt missing-text filter only asks for editable source text", () => {
  const waitingForAlt = { ...photo, altText: null };
  assert.equal(matchesPhotograph(waitingForAlt, "", "missing", true), false);
  assert.equal(matchesPhotograph(waitingForAlt, "", "missing", false), true);
  assert.equal(matchesPhotograph({ ...waitingForAlt, title: " " }, "", "missing", true), true);
  assert.equal(matchesPhotograph({ ...waitingForAlt, description: null }, "", "missing", true), true);
});

test("automatic and unavailable settings hide caption filters without hiding retained photographs", () => {
  const photographs = [photo, { ...photo, id: "photo-b", captionMode: "hidden" }];
  const { render } = archiveHarness(photographs);
  let tree = render(false);
  assert.ok(find(tree, node => node.type === "option" && node.props.value === "hidden"));
  named(tree, "archiveFilter").props.onChange({ target: { value: "hidden" } });
  tree = render(false);
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 1);
  for (const automaticAlt of [true, null]) {
    tree = render(automaticAlt);
    assert.equal(find(tree, node => node.type === "option" && node.props.value === "hidden"), undefined);
    assert.equal(named(tree, "archiveFilter").props.value, "all");
    assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 2);
    assert.equal(find(tree, node => node.type === "option" && node.props.value === "missing").props.children, "Missing title or description");
  }
});

test("new revisions refresh clean editors but never overwrite dirty editors", () => {
  const initial = state.createPhotoEditor(photo);
  const newer = { ...photo, textRevision: 2, title: "New title" };
  assert.equal(state.refreshPhotoEditor(initial, newer, false).values.title, "New title");
  const dirty = { ...initial, values: { ...initial.values, title: "My unsaved title" }, manualFields: ["title"] };
  const refreshed = state.refreshPhotoEditor(dirty, newer, false);
  assert.equal(refreshed.values.title, "My unsaved title");
  assert.equal(refreshed.revision, 1);
  assert.equal(refreshed.seenRevision, 2);
  assert.equal(state.refreshPhotoEditor(refreshed, newer, false), refreshed);
  assert.equal(state.refreshPhotoEditor(initial, newer, true), initial);
  assert.equal(state.refreshPhotoEditor(initial, { ...photo, textRevision: 0 }, false), initial);
});

test("intentional clears and touch-then-revert remain dirty and protected", () => {
  const initial = state.createPhotoEditor({ ...photo, title: null });
  assert.equal(state.photoEditorDirty({ ...initial, manualFields: ["title"] }), true);
  assert.equal(state.photoEditorDirty({ ...initial, values: { ...initial.values, description: "" } }), true);
});

test("discard affects only its editor and cannot regress a newer successful save", () => {
  const initial = state.createPhotoEditor(photo);
  const sibling = { ...initial, values: { ...initial.values, title: "Other unsaved work" } };
  const saved = { ...initial, revision: 3, seenRevision: 3, saved: { ...initial.values, title: "Just saved" } };
  assert.equal(state.discardPhotoEdits(saved, photo).values.title, "Just saved");
  assert.equal(state.discardPhotoEdits(initial, { ...photo, textRevision: 4, title: "Latest" }).values.title, "Latest");
  assert.equal(sibling.values.title, "Other unsaved work");
});

test("caption mode switches retain custom text; save sends deliberately blank manual fields", async () => {
  const h = hooks(); let submitted, guarded;
  const { PhotographEditForm } = load("./photograph-edit-form.tsx", {
    react: h.react, "./text-actions": { savePhotographTextAction: async (_id, _previous, data) => { submitted = data; return { revision: 2, message: "Saved" }; } },
    "./form-controls": {}, "./delete-button": {}, "./photo-editor-state": state,
    "./unsaved-changes": { useUnsavedChanges: dirty => { guarded = dirty; } },
  });
  const render = () => h.render(PhotographEditForm, { photograph: photo });
  let tree = render();
  assert.equal(named(tree, "customCaption").props.type, "hidden");
  named(tree, "captionMode").props.onChange({ target: { value: "custom" } }); tree = render();
  assert.equal(named(tree, "customCaption").type, "textarea");
  assert.equal(named(tree, "customCaption").props.value, "Retained caption");
  named(tree, "captionMode").props.onChange({ target: { value: "hidden" } }); tree = render();
  assert.equal(named(tree, "customCaption").props.value, "Retained caption");
  named(tree, "title").props.onChange({ target: { value: "" } }); tree = render();
  assert.equal(guarded, true);
  assert.deepEqual(JSON.parse(named(tree, "manualFields").props.value), ["title"]);
  const data = new FormData();
  for (const name of ["title", "description", "altText", "capturedAt", "captionMode", "customCaption", "sortOrder", "textRevision", "manualFields"]) data.set(name, named(tree, name).props.value);
  await h.submit(data); tree = render();
  assert.equal(submitted.get("title"), "");
  assert.equal(submitted.get("customCaption"), "Retained caption");
  assert.equal(named(tree, "textRevision").props.value, 2);
  assert.equal(guarded, false);
});

test("infinite gallery extends one chronological row layout by 48, caps at the catalogue and resets on search", () => {
  const photographs = Array.from({ length: 105 }, (_, i) => ({ ...photo, id: `photo-${i}` }));
  const { render, writes, focused } = archiveHarness(photographs, "page=2");
  let tree = render();
  let thumbnails = nodes(tree, node => node.type === "photo-thumbnail");
  assert.equal(thumbnails.length, 48); assert.equal(thumbnails[0].props.photograph.id, "photo-0");
  assert.equal(nodes(tree, node => node.type === "photo-placeholder").length, 57);
  assert.equal(thumbnails[0].props.returnHref, "/admin/photos");
  assert.equal(nodes(tree, node => node.type === "form").length, 0);
  assert.equal(find(tree, node => node.props?.["aria-label"] === "Gallery pages"), undefined);
  assert.equal(nodes(tree, node => node.props?.className === "admin-photo-grid").length, 1);
  find(tree, node => node.type === "button" && node.props.children === "Load more photographs").props.onClick(); tree = render();
  thumbnails = nodes(tree, node => node.type === "photo-thumbnail");
  assert.equal(thumbnails.length, 96); assert.equal(thumbnails[0].props.photograph.id, "photo-0");
  assert.equal(thumbnails[95].props.photograph.id, "photo-95");
  assert.equal(thumbnails[0].props.renderedCount, 96);
  assert.equal(nodes(tree, node => node.type === "photo-placeholder").length, 9);
  assert.equal(nodes(tree, node => node.props?.className === "admin-photo-grid").length, 1);
  assert.equal(nodes(tree, node => node.props?.className === "admin-masonry").length, 0);
  assert.equal(focused[0], "photograph-photo-48");
  find(tree, node => node.type === "button" && node.props.children === "Load more photographs").props.onClick(); tree = render();
  thumbnails = nodes(tree, node => node.type === "photo-thumbnail");
  assert.equal(thumbnails.length, 105); assert.equal(new Set(thumbnails.map(node => node.props.photograph.id)).size, 105);
  assert.equal(nodes(tree, node => node.type === "photo-placeholder").length, 0);
  assert.equal(find(tree, node => node.type === "button" && node.props.children === "Load more photographs").props.disabled, true);
  find(tree, node => node.props?.type === "search").props.onChange({ target: { value: "no match" } });
  tree = render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 0);
  assert.equal(writes.at(-1), "/admin/photos?q=no+match");
  find(tree, node => node.type === "button" && node.props.children === "Clear filters").props.onClick(); tree = render();
  assert.equal(writes.at(-1), "/admin/photos");
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 48);
});

test("admin date order is newest first, stable for ties, unknown last and never mutates catalogue order", () => {
  const dates = ["2024-01-01", null, "2026-11-02", "2026-11-02", "2025-06-10"];
  const photographs = dates.map((capturedAt, i) => ({ ...photo, id: `dated-${i}`, capturedAt }));
  const original = photographs.map(item => item.id);
  const h = archiveHarness(photographs);
  const tree = h.render();
  assert.deepEqual(nodes(tree, node => node.type === "photo-thumbnail").map(node => node.props.photograph.id), ["dated-2", "dated-3", "dated-4", "dated-0", "dated-1"]);
  assert.deepEqual(photographs.map(item => item.id), original);
});

test("infinite append reveals the next oldest capture dates rather than input order", () => {
  const photographs = Array.from({ length: 70 }, (_, i) => ({ ...photo, id: `dated-${i}`, capturedAt: `${1950 + i}-01-01` }));
  const h = archiveHarness(photographs);
  let tree = h.render(), thumbnails = nodes(tree, node => node.type === "photo-thumbnail");
  assert.equal(thumbnails[0].props.photograph.id, "dated-69");
  assert.equal(thumbnails.at(-1).props.photograph.id, "dated-22");
  find(tree, node => node.type === "button" && node.props.children === "Load more photographs").props.onClick(); tree = h.render();
  thumbnails = nodes(tree, node => node.type === "photo-thumbnail");
  assert.equal(thumbnails.length, 70); assert.equal(thumbnails[48].props.photograph.id, "dated-21");
  assert.equal(thumbnails.at(-1).props.photograph.id, "dated-0");
});

test("reserved-slot intersection reveals previews early and stale observers cannot expand a different search", () => {
  const photographs = Array.from({ length: 130 }, (_, i) => ({ ...photo, id: `photo-${i}` }));
  const h = archiveHarness(photographs);
  let tree = h.render(); const cleanup = h.observe(), observer = h.observers[0];
  assert.equal(observer.options.rootMargin, "1000px 0px"); assert.equal(observer.targets.length, 82);
  observer.callback([{ isIntersecting: false }]); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 48);
  observer.callback([{ isIntersecting: true, target: observer.targets[0] }]); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 96);
  assert.equal(h.focused.length, 0);
  cleanup(); assert.equal(observer.disconnected, true);
  named(tree, "archiveSearch").props.onChange({ target: { value: "Yellow" } }); tree = h.render();
  observer.callback([{ isIntersecting: true, target: observer.targets[0] }]); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 48);
  assert.equal(h.writes.at(-1), "/admin/photos?q=Yellow");
});

test("jumping into reserved space reveals through the intersecting photo, not just one batch", () => {
  const photographs = Array.from({ length: 200 }, (_, i) => ({ ...photo, id: `photo-${i}` }));
  const h = archiveHarness(photographs);
  let tree = h.render(); h.observe();
  const observer = h.observers[0];
  observer.callback([{ isIntersecting: true, target: observer.targets.find(target => target.dataset.photographIndex === "160") }]);
  tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 192);
  assert.equal(nodes(tree, node => node.type === "photo-placeholder").length, 8);
  assert.equal(h.focused.length, 0);
});

test("keyboard approach reveals the next previews without stealing focus, even without an observer", () => {
  const photographs = Array.from({ length: 130 }, (_, i) => ({ ...photo, id: `photo-${i}` }));
  const h = archiveHarness(photographs, "", false);
  let tree = h.render();
  nodes(tree, node => node.type === "photo-thumbnail")[40].props.onFocus(); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 96);
  assert.equal(h.focused.length, 0);
});

test("manual loading remains usable when IntersectionObserver is unavailable", () => {
  const photographs = Array.from({ length: 70 }, (_, i) => ({ ...photo, id: `photo-${i}` }));
  const h = archiveHarness(photographs, "", false);
  let tree = h.render();
  assert.equal(h.observe(), undefined); assert.equal(h.observers.length, 0);
  find(tree, node => node.type === "button" && node.props.children === "Load more photographs").props.onClick(); tree = h.render();
  assert.equal(nodes(tree, node => node.type === "photo-thumbnail").length, 70);
  assert.equal(h.focused[0], "photograph-photo-48");
});

test("saving one suggested draft refreshes only that draft, not dirty siblings", async () => {
  const h = hooks(); let updated = false, query;
  const drafts = ["a", "b"].map(id => ({ id, runId: "run", photographId: id, version: 1, fields: {}, originalFields: {}, sources: {} }));
  const { PhotographTextReview } = load("./text-review.tsx", {
    react: h.react, "@/lib/photographs/storage": {}, "@/lib/seo": {}, "./form-controls": {}, "./unsaved-changes": { useUnsavedChanges() {} },
    "./text-actions": { listPhotographTextDraftsAction: async options => { query = options; return { drafts: updated ? [{ ...drafts[0], version: 2 }] : drafts, total: 2 }; } },
  }, { sessionStorage: { getItem: () => null } });
  const render = () => h.render(PhotographTextReview, { available: true });
  let tree = render(); tree.props.onToggle({ currentTarget: { open: true } }); await h.settle(); tree = render();
  const editors = nodes(tree, node => typeof node.type === "function" && node.type.name === "DraftEditor");
  assert.equal(editors.length, 2);
  const siblingKey = editors[1].key;
  updated = true; await editors[0].props.onSaved(); tree = render();
  const refreshed = nodes(tree, node => typeof node.type === "function" && node.type.name === "DraftEditor");
  assert.equal(query.photographId, "a");
  assert.equal(refreshed[0].props.draft.version, 2);
  assert.equal(refreshed[1].key, siblingKey);
  assert.equal(refreshed[1].props.draft, drafts[1]);
});

test("upload is immediately available and a prepared photo uses the shared navigation guard", async () => {
  const h = hooks(); let guarded;
  const { UploadForm } = load("./upload-form.tsx", {
    react: h.react, "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/photographs/upload-date": { detectUploadDate: async () => null },
    "@/lib/photographs/upload": { createPhotographUpload: () => ({ isActive: () => false, reset: () => true }), isUploading: () => false, uploadStageLabels: {} },
    "./form-controls": {}, "./unsaved-changes": { useUnsavedChanges: value => { guarded = value; } },
  }, { URL: { createObjectURL: () => "blob:test" } });
  const render = () => h.render(UploadForm, {});
  let tree = render(); assert.equal(guarded, false);
  named(tree, "file").props.onChange({ currentTarget: { files: [{ name: "photo.jpg" }] } });
  await Promise.resolve(); tree = render();
  assert.equal(guarded, true);
  assert.notEqual(find(tree, node => node.type === "section").props.hidden, true);
  assert.ok(find(tree, node => node.type === "form" && node.props["aria-label"] === "Upload photograph"));
});

test("automation exceptions stay visible; unknown charges and exhausted jobs have no retry", () => {
  const h = hooks();
  const { default: AutomaticTextStatus } = load("./automatic-text-status.tsx", { react: h.react, "./automatic-text-actions": {} });
  const status = { enabled: true, serverConfigured: true, counts: { failed: 2, uncertain: 1, review: 1 }, uncertainCount: 1,
    month: "2026-10", committedMicros: 0, budgetMicros: 5_000_000,
    jobs: [ { id: "unknown", filename: "unknown.jpg", status: "uncertain", attempts: 1, updatedAt: "2026-10-31" },
      { id: "exhausted", filename: "exhausted.jpg", status: "failed", attempts: 2, updatedAt: "2026-10-31" },
      { id: "retryable", filename: "retryable.jpg", status: "failed", attempts: 1, updatedAt: "2026-10-31" } ] };
  const tree = h.render(AutomaticTextStatus, { initialStatus: status });
  assert.equal(nodes(tree, node => node.type === "button" && node.props["aria-label"]?.startsWith("Retry")).length, 1);
  assert.equal(find(tree, node => node.props?.["aria-label"] === "Retry generation for unknown.jpg"), undefined);
  assert.ok(find(tree, node => node.type === "p" && node.props.role === "status"));
  assert.ok(find(tree, node => node.type === "a" && node.props.href === "#text-review"));
});

test("text settings start collapsed and reviewing issues opens and focuses their history", () => {
  const h = hooks();
  const { default: AutomaticTextStatus } = load("./automatic-text-status.tsx", { react: h.react, "./automatic-text-actions": {} });
  const tree = h.render(AutomaticTextStatus, { initialStatus: { enabled: true, serverConfigured: true, counts: { failed: 1 },
    month: "2026-11", committedMicros: 0, budgetMicros: 5_000_000, jobs: [] } });
  const details = nodes(tree, node => node.type === "details");
  assert.equal(details.length, 2);
  for (const detail of details) assert.notEqual(detail.props.open, true);
  let focused = false;
  const settings = { open: false };
  const history = { open: false, querySelector: selector => { assert.equal(selector, "summary"); return { focus() { focused = true; } }; } };
  details[0].props.ref.current = settings;
  details[1].props.ref.current = history;
  const review = find(tree, node => node.type === "button" && node.props["aria-controls"] === details[1].props.id);
  assert.ok(review);
  review.props.onClick();
  assert.equal(settings.open, true);
  assert.equal(history.open, true);
  assert.equal(focused, true);
});

test("thumbnail is an uncropped, lazy, filename-labelled edit link with a failed-preview fallback", () => {
  const h = hooks();
  let remembered;
  const { PhotographThumbnail } = load("./photograph-thumbnail.tsx", {
    react: h.react, "next/image": { __esModule: true, default: "img" }, "@/lib/photographs/storage": { photographUrl: () => "/local-photo.jpg" },
    "./gallery-position": { rememberGalleryPosition: (...args) => { remembered = args; } },
  });
  const render = () => h.render(PhotographThumbnail, { photograph: photo, returnHref: "/admin/photos?q=tree", renderedCount: 144 });
  let tree = render();
  assert.equal(tree.type, "a"); assert.equal(tree.props.prefetch, false);
  assert.match(tree.props["aria-label"], new RegExp(photo.filename));
  assert.equal(tree.props.href, "/admin/photos/photo-a/edit?returnTo=%2Fadmin%2Fphotos%3Fq%3Dtree");
  assert.equal(tree.props.style.aspectRatio, "1200 / 800");
  assert.equal(tree.props.style["--photograph-ratio"], 1.5);
  assert.equal(find(tree, node => node.type === "img").props.sizes, "(min-width: 1024px) min(calc(100vw - 6rem), calc(10.8rem * 1.5)), (min-width: 640px) min(calc(100vw - 4rem), calc(10.8rem * 1.5)), min(calc(100vw - 2rem), calc(7.2rem * 1.5))");
  assert.equal(find(tree, node => node.type === "img").props.loading, "lazy");
  assert.equal(find(tree, node => node.type === "img").props.className, "absolute inset-0 h-full w-full object-contain");
  assert.doesNotMatch(find(tree, node => node.type === "img").props.className, /object-cover/);
  tree.props.onClick({}); assert.deepEqual(remembered, ["/admin/photos?q=tree", photo.id, 144]);
  find(tree, node => node.type === "img").props.onError(); tree = render();
  assert.match(find(tree, node => node.type === "span").props.children.join(""), /Preview unavailable/);
  assert.match(find(tree, node => node.type === "span").props.className, /absolute inset-0 overflow-auto/);
  assert.doesNotMatch(find(tree, node => node.type === "span").props.className, /min-h-/);
});

test("justified thumbnail sizing follows each original ratio without changing the photograph", () => {
  for (const [width, height] of [[600, 1200], [1200, 1200], [1600, 900]]) {
    const photograph = Object.freeze({ ...photo, width, height });
    const h = hooks();
    const { PhotographThumbnail } = load("./photograph-thumbnail.tsx", {
      react: h.react, "next/image": { __esModule: true, default: "img" },
      "@/lib/photographs/storage": { photographUrl: () => "/local-photo.jpg" },
      "./gallery-position": { rememberGalleryPosition() {} },
    });
    const tree = h.render(PhotographThumbnail, { photograph, returnHref: "/admin/photos" });
    assert.equal(tree.props.style["--photograph-ratio"], width / height);
    assert.equal(tree.props.style.aspectRatio, `${width} / ${height}`);
    const image = find(tree, node => node.type === "img");
    assert.equal(image.props.width, width); assert.equal(image.props.height, height);
    assert.ok(image.props.sizes.includes(`calc(10.8rem * ${width / height})`));
  }
});

test("unloaded photo slots reserve the exact thumbnail footprint without images, links or focus targets", () => {
  const h = hooks();
  const { PhotographThumbnail, PhotographPlaceholder } = load("./photograph-thumbnail.tsx", {
    react: h.react, "next/image": { __esModule: true, default: "img" },
    "@/lib/photographs/storage": { photographUrl: () => "/local-photo.jpg" },
    "./gallery-position": { rememberGalleryPosition() {} },
  });
  const thumbnail = h.render(PhotographThumbnail, { photograph: photo, returnHref: "/admin/photos" });
  const placeholder = PhotographPlaceholder({ photograph: photo, index: 48 });
  assert.deepEqual(placeholder.props.style, thumbnail.props.style);
  assert.equal(placeholder.props.className, thumbnail.props.className);
  assert.equal(placeholder.type, "div"); assert.equal(placeholder.props["aria-hidden"], "true");
  assert.equal(placeholder.props["data-photograph-index"], 48);
  assert.equal(placeholder.props.tabIndex, undefined); assert.equal(placeholder.props.children, undefined);
});

test("dedicated editing starts open, retaining labelled secondary details", () => {
  const h = hooks();
  const { PhotographEditForm } = load("./photograph-edit-form.tsx", {
    react: h.react, "./text-actions": {}, "./form-controls": {}, "./delete-button": {}, "./photo-editor-state": state,
  });
  const editor = h.render(PhotographEditForm, { photograph: photo });
  assert.equal(editor.type, "section");
  assert.equal(editor.props["aria-label"], `Edit photo ${photo.filename}`);
  assert.ok(find(editor, node => node.type === "form" && node.props["aria-label"] === `Edit text for ${photo.filename}`));
  assert.ok(find(editor, node => node.type === "summary" && node.props["aria-label"] === `Alt text, date and file details for ${photo.filename}`));
});

test("login fields and submission stay locked while sign-in is pending", () => {
  for (const pending of [false, true]) {
    const { LoginForm } = load("../login/login-form.tsx", {
      react: { useActionState: () => [{ error: "Sign-in failed. Try again." }, () => {}, pending] },
      "../actions": { loginAction() {} },
    });
    const tree = LoginForm();
    assert.equal(tree.props["aria-busy"], pending);
    assert.equal(find(tree, node => node.type === "fieldset").props.disabled, pending);
    assert.equal(find(tree, node => node.type === "button").props.disabled, pending);
    assert.equal(named(tree, "email").props.autoComplete, "email");
    assert.equal(named(tree, "email").props.autoCapitalize, "none");
    assert.equal(named(tree, "password").props.autoComplete, "current-password");
    assert.ok(find(tree, node => node.type === "button").props.children.includes(pending ? "Signing in…" : "Sign in"));
    assert.ok(find(tree, node => node.props?.children === "Sign-in failed. Try again."));
  }
});

test("delete confirmation never calls the action on Cancel; confirmation dispatches once", async () => {
  for (const accepted of [false, true]) {
    let calls = 0, warning;
    const { DeleteButton } = load("./delete-button.tsx", {
      react: { startTransition: work => work(), useActionState: reducer => [{}, () => { void reducer(); }, false] },
      "./photo-page-actions": { removePhotographAndReturnAction: async (id, href) => { assert.equal(id, "photo-a"); assert.equal(href, "/admin/photos?page=2"); calls++; } },
      "../confirm-provider": { useAdminConfirm: () => async options => { warning = options; return accepted; } },
    });
    const tree = DeleteButton({ id: "photo-a", filename: "original.jpg", returnHref: "/admin/photos?page=2" });
    await find(tree, node => node.type === "button").props.onClick();
    assert.equal(calls, accepted ? 1 : 0);
    assert.match(warning.description, /original\.jpg.*cannot be undone/s);
    assert.equal(warning.destructive, true);
  }
});

test("paid retries require confirmation with the shared $5 cap; Cancel sends nothing", async () => {
  for (const accepted of [false, true]) {
    const h = hooks(); let calls = 0, warning;
    const status = { enabled: true, serverConfigured: true, counts: { failed: 1 }, month: "2026-10", committedMicros: 0, budgetMicros: 5_000_000,
      jobs: [{ id: "retryable", filename: "retry.jpg", status: "failed", attempts: 1, updatedAt: "2026-10-31" }] };
    const { default: AutomaticTextStatus } = load("./automatic-text-status.tsx", {
      react: h.react,
      "../confirm-provider": { useAdminConfirm: () => async options => { warning = options; return accepted; } },
      "./automatic-text-actions": { retryAutomaticTextAction: async () => { calls++; return {}; }, getAutomaticTextStatusAction: async () => ({ status }) },
    });
    const tree = h.render(AutomaticTextStatus, { initialStatus: status });
    await find(tree, node => node.props?.["aria-label"] === "Retry generation for retry.jpg").props.onClick();
    await h.settle();
    assert.equal(calls, accepted ? 1 : 0);
    assert.match(warning.description, /paid AI request.*shared \$5 monthly automatic-text budget/);
  }
});

for (const automaticAlt of [true, null]) test(`automatic or unknown alt setting (${automaticAlt}) keeps alt read-only and source fields editable`, () => {
  const h = hooks();
  const { PhotographEditForm } = load("./photograph-edit-form.tsx", {
    react: h.react, "./text-actions": {}, "./form-controls": {}, "./delete-button": {}, "./photo-editor-state": state,
  });
  const tree = h.render(PhotographEditForm, { photograph: photo, automaticAlt });
  assert.equal(named(tree, "altText").props.readOnly, true);
  assert.equal(named(tree, "altText").props.onChange, undefined);
  assert.equal(named(tree, "altText").props.value, photo.altText);
  assert.equal(named(tree, "captionMode").props.type, "hidden");
  assert.equal(named(tree, "customCaption").props.type, "hidden");
  assert.equal(typeof named(tree, "title").props.onChange, "function");
  assert.equal(typeof named(tree, "description").props.onChange, "function");
});

test("uploads omit manual alt when the setting is automatic or unavailable", () => {
  for (const automaticAlt of [true, null, false]) {
    const h = hooks();
    const { UploadForm } = load("./upload-form.tsx", {
      react: h.react, "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/photographs/upload-date": {}, "./form-controls": {},
      "@/lib/photographs/upload": { createPhotographUpload: () => ({}), isUploading: () => false },
    });
    const tree = h.render(UploadForm, { automaticAlt });
    assert.equal(Boolean(named(tree, "altText")), automaticAlt === false);
    assert.ok(named(tree, "title"));
  }
});

test("setting action validates revisions and server configuration before its admin-only RPC", async () => {
  let calls = 0, authenticated = 0; const refreshed = [];
  const { setDescriptionAltAction } = load("./automatic-text-actions.ts", {
    "next/cache": { revalidatePath(...args) { refreshed.push(args); } }, "next/server": {},
    "@/lib/cache-invalidation": {}, "@/lib/photographs/automatic-text": {},
    "@/lib/supabase/admin": { requireAdmin: async () => { authenticated++; return { supabase: { rpc: async (name, args) => {
      calls++; assert.equal(name, "set_photograph_description_alt"); assert.equal(args.p_enabled, true); assert.equal(args.p_revision, 2); return {};
    } } }; } },
  }, { process: { env: { OPENAI_API_KEY: "fixture", PHOTOGRAPH_TEXT_WORKER_SECRET: "s".repeat(32) } } });
  assert.ok((await setDescriptionAltAction(true, -1)).error);
  assert.equal(calls, 0);
  assert.ok((await setDescriptionAltAction(true, 2)).message);
  assert.equal(calls, 1); assert.equal(authenticated, 2);
  assert.deepEqual(refreshed, [["/admin/photos"], ["/admin/photos/[id]/edit", "page"], ["/admin/photos/upload"], ["/admin/photos/tools"]]);
});

test("saving source text schedules queued work after commit; scheduling failure does not undo the save", async () => {
  for (const schedulingFails of [false, true]) {
    let scheduled = 0, processed = 0;
    const { savePhotographTextAction } = load("./text-actions.ts", {
      "next/cache": { revalidatePath() {} },
      "next/server": { after() { scheduled++; if (schedulingFails) throw new Error("fixture"); } },
      "@/lib/cache-invalidation": { invalidatePhotographs() {} },
      "@/lib/photographs/automatic-text": { processAutomaticPhotographText() { processed++; } },
      "@/lib/supabase/admin": { requireAdmin: async () => ({ supabase: { rpc: async () => ({ data: { revision: 3, descriptionAltQueued: true } }) } }) },
      "../actions": {},
    });
    const data = new FormData();
    for (const [key, value] of Object.entries({ textRevision: "2", captionMode: "description", customCaption: "", capturedAt: "", sortOrder: "", manualFields: '["description"]', title: "Performer", description: "A performer holds a microphone.", altText: "Previous alt" })) data.set(key, value);
    const result = await savePhotographTextAction("00000000-0000-4000-8000-000000000011", {}, data);
    assert.equal(result.error, undefined); assert.equal(result.revision, 3);
    assert.match(result.message, /generation queued/); assert.equal(scheduled, 1); assert.equal(processed, 0);
  }
});

test("whole-archive alt setting requires confirmation, preserves off on Cancel and blocks unfinished edits", async () => {
  for (const [accepted, dirty] of [[false, false], [true, false], [true, true]]) {
    const h = hooks(); let calls = 0, warning;
    const status = { enabled: true, serverConfigured: true, descriptionAltEnabled: false, descriptionAltRevision: 4,
      counts: {}, month: "2026-11", committedMicros: 0, budgetMicros: 5_000_000, jobs: [] };
    const { default: AutomaticTextStatus } = load("./automatic-text-status.tsx", {
      react: h.react, "./unsaved-changes": { useUnsavedChanges() {}, hasUnsavedAdminChanges: () => dirty },
      "../confirm-provider": { useAdminConfirm: () => async options => { warning = options; return accepted; } },
      "./automatic-text-actions": { setDescriptionAltAction: async (enabled, revision) => {
        calls++; assert.equal(enabled, true); assert.equal(revision, 4); return { message: "Saved" };
      }, getAutomaticTextStatusAction: async () => ({ status: { ...status, descriptionAltEnabled: true, descriptionAltRevision: 5 } }) },
    });
    let tree = h.render(AutomaticTextStatus, { initialStatus: status });
    await find(tree, node => node.props?.children === "Enable automatic alt text").props.onClick();
    await h.settle(); tree = h.render(AutomaticTextStatus, { initialStatus: status });
    assert.equal(calls, accepted && !dirty ? 1 : 0);
    if (!dirty) {
      assert.match(warning.description, /whole archive/);
      assert.match(warning.description, /including previous manual alt text/);
      assert.match(warning.description, /\$5 monthly budget/);
      assert.match(warning.description, /does not regenerate existing photos/);
    } else assert.equal(warning, undefined);
    if (calls) assert.ok(find(tree, node => node.props?.children === "Turn off automatic alt text"));
  }
});

test("photo discard Cancel retains local edits; confirmed discard restores only this photo", async () => {
  const h = hooks(); let accepted = false;
  const { PhotographEditForm } = load("./photograph-edit-form.tsx", {
    react: h.react, "./text-actions": {}, "./form-controls": {}, "./delete-button": {}, "./photo-editor-state": state,
    "./unsaved-changes": { useUnsavedChanges() {} },
    "../confirm-provider": { useAdminConfirm: () => async () => accepted },
  });
  const render = () => h.render(PhotographEditForm, { photograph: photo });
  let tree = render(); named(tree, "title").props.onChange({ target: { value: "Keep my edit" } }); tree = render();
  await find(tree, node => node.type === "button" && node.props.children === "Discard changes").props.onClick();
  tree = render(); assert.equal(named(tree, "title").props.value, "Keep my edit");
  accepted = true;
  await find(tree, node => node.type === "button" && node.props.children === "Discard changes").props.onClick();
  tree = render(); assert.equal(named(tree, "title").props.value, photo.title);
});

test("archive URL state retains search/filter, drops obsolete pages and restricts return destinations", () => {
  const parsed = archive.archiveState(new URLSearchParams("q=yellow+leaves&filter=missing&page=3"));
  assert.equal(parsed.query, "yellow leaves"); assert.equal(parsed.filter, "missing"); assert.equal(parsed.page, undefined);
  assert.equal(archive.archiveHref(parsed), "/admin/photos?q=yellow+leaves&filter=missing");
  for (const invalid of ["-1", "1.5", "NaN", "Infinity", "9007199254740992"]) {
    assert.equal(archive.archiveState(new URLSearchParams(`page=${invalid}&filter=invalid`)).filter, "all");
  }
  assert.equal(archive.archiveState(new URLSearchParams(`q=${"a".repeat(300)}`)).query.length, 200);
  for (const invalid of [null, "/admin/content", "//other.test/admin/photos", "https://other.test/admin/photos", "javascript:alert(1)", "/admin/photos/../content"]) {
    assert.equal(archive.galleryReturnHref(invalid), "/admin/photos");
  }
  assert.equal(archive.galleryReturnHref("/admin/photos?q=tree&filter=missing&page=2&removed=pending#x"), "/admin/photos?q=tree&filter=missing");
});

test("gallery position restores scroll and thumbnail focus only for its matching URL", () => {
  const storage = new Map(), frames = new Map(), scrolled = [], focused = [], revealed = [];
  let nextFrame = 0;
  const position = load("./gallery-position.ts", {}, {
    window: { scrollY: 682, sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) }, scrollTo: (...args) => scrolled.push(args) },
    document: { getElementById: id => ({ focus: options => focused.push([id, options.preventScroll]) }) },
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
  });
  function flush() { while (frames.size) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); } }
  position.rememberGalleryPosition("/admin/photos?q=tree", "photo-a", 144);
  position.restoreGalleryPosition("/admin/photos"); flush(); assert.equal(scrolled.length, 0);
  position.restoreGalleryPosition("/admin/photos?q=tree", count => revealed.push(count));
  assert.deepEqual(revealed, [144]); assert.equal(scrolled.length, 0);
  flush();
  assert.deepEqual(scrolled, [[0, 682]]); assert.deepEqual(focused, [["photograph-photo-a", true]]);
  assert.equal(storage.size, 0);
  position.rememberGalleryPosition("/admin/photos", "photo-b");
  position.restoreGalleryPosition("/admin/photos")(); flush(); assert.equal(scrolled.length, 1);
});

test("removal delegates to tracked cleanup, revalidates the editor and redirects with its result", async () => {
  for (const pending of [false, true]) {
    const calls = [], paths = [];
    const { removePhotographAndReturnAction } = load("./photo-page-actions.ts", {
      "../actions": { deletePhotographAction: async id => { calls.push(id); return { message: pending ? "File removal is pending in Advanced tools." : "Photograph removed." }; } },
      "./archive-state": archive, "next/cache": { revalidatePath: (...args) => paths.push(args) },
      "next/navigation": { redirect: href => { throw new Error(`redirect:${href}`); } },
    });
    await assert.rejects(removePhotographAndReturnAction("photo-a", "/admin/photos?q=tree&page=2"), new RegExp(`redirect:/admin/photos\\?q=tree&removed=${pending ? "pending" : "done"}`));
    assert.deepEqual(calls, ["photo-a"]); assert.deepEqual(paths, [["/admin/photos/[id]/edit", "page"]]);
  }
  const { removePhotographAndReturnAction } = load("./photo-page-actions.ts", {
    "../actions": { deletePhotographAction: async () => { throw new Error("Removal failed"); } }, "./archive-state": archive,
    "next/cache": { revalidatePath() { assert.fail("No confirmed removal"); } },
    "next/navigation": { redirect() { assert.fail("Do not leave on failure"); } },
  });
  await assert.rejects(removePhotographAndReturnAction("photo-a", "/admin/photos"), /Removal failed/);
});

test("shared header uses the same navigation and blocks active-upload links on every workspace route", () => {
  const h = hooks(); let pathname = "/admin/photos";
  const { AdminHeader } = load("../admin-header.tsx", {
    react: h.react, "next/navigation": { usePathname: () => pathname }, "./sign-out-button": { SignOutButton: "sign-out" },
  });
  for (const path of ["/admin/photos", "/admin/content", "/admin/photos/upload", "/admin/photos/tools", "/admin/photos/photo-a/edit"]) {
    pathname = path;
    const tree = AdminHeader({ uploading: true, canLeave: () => false });
    assert.equal(tree.type, "header");
    assert.equal(find(tree, node => node.props?.className === "admin-brand").props.children, "Elliot Mairet");
    for (const link of nodes(tree, node => node.type === "a")) {
      assert.equal(link.props["aria-disabled"], true); assert.equal(link.props.tabIndex, -1); assert.equal(link.props.prefetch, false);
      let prevented = false; link.props.onNavigate({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
    }
    assert.equal(find(tree, node => node.type === "sign-out").props.disabled, true);
    const current = find(tree, node => node.props?.["aria-current"] === "page");
    assert.equal(current.props.href, path.startsWith("/admin/content") ? "/admin/content" : "/admin/photos");
  }
});

test("edit route authenticates first and loads only its photograph plus palette", async () => {
  const id = "00000000-0000-4000-8000-000000000011", calls = [], palette = [{ hex: "#f00" }];
  const sources = { title: "manual", description: "ai", alt_text: "ai" };
  let missing = false;
  const { default: EditPage, maxDuration } = load("../(workspace)/photos/[id]/edit/page.tsx", {
    "next/image": { default: "img" }, "next/navigation": { notFound() { throw new Error("not-found"); } },
    "@/lib/photographs/queries": { getPhotographById: async value => { calls.push(["photo", value]); return missing ? null : { ...photo, id }; }, getPhotographPalette: async value => { calls.push(["palette", value]); return palette; } },
    "@/lib/supabase/admin": { requireAdmin: async () => { calls.push(["auth"]); return { supabase: { rpc: async name => { calls.push(["rpc", name]); return { data: { [id]: sources } }; } } }; } },
    "@/lib/photographs/storage": { photographUrl: () => "/mock.jpg" }, "@/lib/seo": { photographPath: () => "/gallery/mock" },
    "../../../../page-heading": { AdminPageHeading: "page-heading" }, "../../../../photos/archive-state": archive,
    "../../../../photos/automatic-text-actions": { getAutomaticTextStatusAction: async () => ({ status: { descriptionAltEnabled: true, jobs: [] } }) },
    "../../../../photos/photograph-edit-form": { PhotographEditForm: "photo-editor" }, "../../../../photos/photograph-progress": { PhotographProgress: "photo-progress" },
  });
  const render = value => EditPage({ params: Promise.resolve({ id: value }), searchParams: Promise.resolve({ returnTo: "/admin/photos?q=tree&page=2" }) });
  const tree = await render(id), editor = find(tree, node => node.type === "photo-editor");
  assert.equal(maxDuration, 300); assert.equal(calls[0][0], "auth");
  assert.deepEqual(calls.filter(([kind]) => kind === "photo" || kind === "palette"), [["photo", id], ["palette", id]]);
  assert.equal(editor.props.photograph.palette, palette); assert.equal(editor.props.photograph.textSources, sources);
  assert.equal(editor.props.automaticAlt, true); assert.equal(editor.props.returnHref, "/admin/photos?q=tree");
  calls.length = 0; await assert.rejects(render("bad-id"), /not-found/); assert.deepEqual(calls, [["auth"]]);
  missing = true; await assert.rejects(render(id), /not-found/);
});

test("gallery route keeps palette and text-state payloads out of the thumbnail catalogue", async () => {
  const calls = [];
  const { default: PhotosPage } = load("../(workspace)/photos/page.tsx", {
    "@/lib/photographs/queries": { getPhotographs: async () => { calls.push("catalogue"); return [photo]; } },
    "@/lib/supabase/admin": { requireAdmin: async () => { calls.push("auth"); return { supabase: { rpc: async name => { assert.equal(name, "list_storage_cleanup_jobs"); return { data: [] }; } } }; } },
    "../../photos/automatic-text-actions": { getAutomaticTextStatusAction: async () => ({ status: { descriptionAltEnabled: true, counts: {} } }) },
    "../../photos/archive-state": archive, "../../photos/photograph-archive": { PhotographArchive: "gallery" },
  });
  const tree = await PhotosPage(), gallery = find(tree, node => node.type === "gallery");
  assert.equal(calls[0], "auth"); assert.equal(gallery.props.photographs[0].id, photo.id);
  assert.equal(gallery.props.photographs[0].palette, undefined); assert.equal(gallery.props.photographs[0].textSources, undefined);
  assert.equal(gallery.props.photographs[0].textRevision, undefined);
});

test("photo progress uses client navigation to tools and keeps gallery return context", () => {
  const h = hooks();
  const { PhotographProgress } = load("./photograph-progress.tsx", { react: h.react, "./automatic-text-actions": {} });
  const tree = h.render(PhotographProgress, { photographId: photo.id, initialStatus: null, returnHref: "/admin/photos?q=tree&page=2" });
  const link = find(tree, node => node.type === "a");
  assert.equal(link.props.prefetch, false);
  assert.equal(link.props.href, "/admin/photos/tools?returnTo=%2Fadmin%2Fphotos%3Fq%3Dtree%26page%3D2#automatic-text");
});
