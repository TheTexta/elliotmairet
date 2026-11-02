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
};
function load(file, mocks = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, FormData, window: { confirm: () => true },
    require: name => mocks[name] ?? primitives[name] ?? (name === "@/lib/photographs/text" ? text : require(name)), ...globals });
  return exports;
}
const { matchesPhotograph } = load("./archive-filter.ts");
const state = load("./photo-editor-state.ts");
const photo = { id: "photo-a", filename: "2026-photo.jpg", title: "Yellow leaves", description: "A tree in autumn.", altText: "Branches with yellow leaves",
  customCaption: "Retained caption", captionMode: "description", capturedAt: "2026-10-31", textRevision: 1, textMetadataAvailable: true,
  textSources: { title: "ai", description: "ai", alt_text: "ai" }, sortOrder: 2, palette: [], storagePath: "uploads/a.jpg" };
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

test("automatic and unavailable settings hide caption filters without hiding retained rows", () => {
  const h = hooks();
  const { PhotographArchive } = load("./photograph-archive.tsx", {
    react: h.react, "./archive-filter": { matchesPhotograph }, "./photograph-row": { PhotographRow: "photo-row" }, "./advanced-tools-link": {},
  });
  const photographs = [photo, { ...photo, id: "photo-b", captionMode: "hidden" }];
  const render = automaticAlt => h.render(PhotographArchive, { photographs, automaticAlt });
  let tree = render(false);
  assert.ok(find(tree, node => node.type === "option" && node.props.value === "hidden"));
  named(tree, "archiveFilter").props.onChange({ target: { value: "hidden" } });
  tree = render(false);
  assert.equal(nodes(tree, node => node.props?.hidden === true).length, 1);
  for (const automaticAlt of [true, null]) {
    tree = render(automaticAlt);
    assert.equal(find(tree, node => node.type === "option" && node.props.value === "hidden"), undefined);
    assert.equal(named(tree, "archiveFilter").props.value, "all");
    assert.equal(nodes(tree, node => node.props?.hidden === true).length, 0);
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

test("filtering hides photo rows without unmounting their editors", () => {
  const h = hooks();
  const { PhotographArchive } = load("./photograph-archive.tsx", {
    react: h.react, "./archive-filter": { matchesPhotograph }, "./form-controls": {}, "./photograph-row": { PhotographRow: "photo-row" }, "./advanced-tools-link": {},
  });
  const render = () => h.render(PhotographArchive, { photographs: [photo, { ...photo, id: "photo-b" }] });
  let tree = render();
  find(tree, node => node.props?.type === "search").props.onChange({ target: { value: "no match" } });
  tree = render();
  assert.equal(nodes(tree, node => node.type === "photo-row").length, 2);
  assert.equal(nodes(tree, node => node.props?.hidden === true).length, 2);
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

test("prepared uploads use the shared navigation guard even when panel is closed", async () => {
  const h = hooks(); let guarded;
  const { UploadForm } = load("./upload-form.tsx", {
    react: h.react, "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/photographs/upload-date": { detectUploadDate: async () => null },
    "@/lib/photographs/upload": { createPhotographUpload: () => ({ isActive: () => false, reset: () => true }), isUploading: () => false, uploadStageLabels: {} },
    "./form-controls": {}, "./unsaved-changes": { useUnsavedChanges: value => { guarded = value; } },
  }, { URL: { createObjectURL: () => "blob:test" } });
  const render = () => h.render(UploadForm, { onBusyChange() {} });
  let tree = render(); assert.equal(guarded, false);
  named(tree, "file").props.onChange({ currentTarget: { files: [{ name: "photo.jpg" }] } });
  await Promise.resolve(); tree = render();
  assert.equal(guarded, true);
  assert.equal(find(tree, node => node.type === "section").props.hidden, true);
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

test("photo actions have filename-specific accessible names that retain their visible labels", () => {
  const { PhotographRow } = load("./photograph-row.tsx", {
    "next/image": { default: "img" }, "@/lib/photographs/storage": { photographUrl: () => "/local-photo.jpg" },
    "@/lib/seo": { photographPath: () => "/local-photo" }, "./photograph-edit-form": { PhotographEditForm: "photo-editor" },
  });
  const row = PhotographRow({ photograph: photo });
  assert.equal(find(row, node => node.type === "a").props["aria-label"], `View on site: ${photo.filename}`);
  assert.equal(row.props["aria-labelledby"], find(row, node => node.type === "h2").props.id);
  const h = hooks();
  const { PhotographEditForm } = load("./photograph-edit-form.tsx", {
    react: h.react, "./text-actions": {}, "./form-controls": {}, "./delete-button": {}, "./photo-editor-state": state,
  });
  const editor = h.render(PhotographEditForm, { photograph: photo });
  assert.ok(find(editor, node => node.type === "summary" && node.props["aria-label"] === `Edit photo ${photo.filename}`));
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
      "../actions": { deletePhotographAction: async id => { assert.equal(id, "photo-a"); calls++; return { message: "Removed" }; } },
      "../confirm-provider": { useAdminConfirm: () => async options => { warning = options; return accepted; } },
    });
    const tree = DeleteButton({ id: "photo-a", filename: "original.jpg" });
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
    const tree = h.render(UploadForm, { onBusyChange() {}, automaticAlt });
    assert.equal(Boolean(named(tree, "altText")), automaticAlt === false);
    assert.ok(named(tree, "title"));
  }
});

test("setting action validates revisions and server configuration before its admin-only RPC", async () => {
  let calls = 0, authenticated = 0, refreshed = 0;
  const { setDescriptionAltAction } = load("./automatic-text-actions.ts", {
    "next/cache": { revalidatePath() { refreshed++; } }, "next/server": {},
    "@/lib/cache-invalidation": {}, "@/lib/photographs/automatic-text": {},
    "@/lib/supabase/admin": { requireAdmin: async () => { authenticated++; return { supabase: { rpc: async (name, args) => {
      calls++; assert.equal(name, "set_photograph_description_alt"); assert.equal(args.p_enabled, true); assert.equal(args.p_revision, 2); return {};
    } } }; } },
  }, { process: { env: { OPENAI_API_KEY: "fixture", PHOTOGRAPH_TEXT_WORKER_SECRET: "s".repeat(32) } } });
  assert.ok((await setDescriptionAltAction(true, -1)).error);
  assert.equal(calls, 0);
  assert.ok((await setDescriptionAltAction(true, 2)).message);
  assert.equal(calls, 1); assert.equal(authenticated, 2); assert.equal(refreshed, 1);
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
