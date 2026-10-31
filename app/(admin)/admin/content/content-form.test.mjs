import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadComponent(path, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: name => mocks[name] ?? require(name) });
  return exports;
}

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

const byId = (tree, id) => find(tree, node => node.props?.id === id);
const button = tree => find(tree, node => node.type === "button");

function formHarness(action = async () => ({ message: "Site content updated." })) {
  const slots = [];
  let cursor = 0;
  let guarded;
  let reducer;
  let pending = false;
  let result = {};
  const { ContentForm } = loadComponent("./content-form.tsx", {
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
        return [slots[slot], value => { slots[slot] = value; }];
      },
      useActionState(next) { reducer = next; return [result, () => {}, pending]; },
    },
    "../actions": { updateSiteContentAction: action },
    "../photos/unsaved-changes": { useUnsavedChanges: value => { guarded = value; } },
  });
  let props = { footerText: "Original footer", seoTitle: "Original title", seoDescription: "Untouched" };
  let tree;
  function render(next = props) {
    props = next;
    cursor = 0;
    tree = ContentForm({ initialContent: props });
    return tree;
  }
  return {
    render,
    guarded: () => guarded,
    change(id, value) { byId(tree, id).props.onChange({ target: { value } }); return render(); },
    async submit() {
      const data = new FormData();
      data.set("footerText", byId(tree, "footerText").props.value);
       data.set("seoTitle", byId(tree, "seoTitle").props.value);
      data.set("seoDescription", byId(tree, "seoDescription").props.value);
      pending = true;
      const promise = reducer(result, data);
      render();
      result = await promise;
      pending = false;
      return render();
    },
  };
}

test("unchanged content is not guarded; normalized edits and reverting track dirty state", () => {
  const form = formHarness();
  assert.equal(button(form.render()).props.disabled, true);
  assert.equal(form.guarded(), false);
  assert.equal(button(form.change("seoTitle", " Original title ")).props.disabled, true);
  assert.equal(button(form.change("footerText", "Updated footer")).props.disabled, false);
  assert.equal(form.guarded(), true);
  assert.equal(button(form.change("footerText", "Original footer")).props.disabled, true);
  assert.equal(form.guarded(), false);
});

test("saving disables both fields and submit; successful save adopts only submitted normalized values", async () => {
  let finish;
  let submitted;
  const form = formHarness(async (_previous, data) => {
    submitted = Object.fromEntries(data);
    return new Promise(resolve => { finish = resolve; });
  });
  form.render();
  form.change("footerText", "New\r\nfooter");
  form.change("seoTitle", " New title ");
  const saving = form.submit();
  const pending = form.render();
  assert.equal(byId(pending, "seoTitle").props.disabled, true);
  assert.equal(byId(pending, "footerText").props.disabled, true);
  assert.equal(byId(pending, "seoDescription").props.disabled, true);
  assert.equal(button(pending).props.disabled, true);
  assert.equal(form.guarded(), true);
  assert.deepEqual(submitted, { footerText: "New\r\nfooter", seoTitle: " New title ", seoDescription: "Untouched" });
  finish({ message: "Site content updated." });
  const saved = await saving;
  assert.equal(button(saved).props.disabled, true);
  assert.equal(form.guarded(), false);
  assert.equal(byId(saved, "footerText").props.value, "New\r\nfooter");
  assert.equal(button(form.change("footerText", "New\nfooter")).props.disabled, true);
  assert.equal(button(form.change("footerText", "Original footer")).props.disabled, false);
});

test("failed saves preserve inputs and dirty guard, including thrown failures", async () => {
  for (const action of [async () => ({ error: "Save failed." }), async () => { throw new Error("Offline"); }]) {
    const form = formHarness(action);
    form.render();
    form.change("footerText", "Keep this edit");
    const failed = await form.submit();
    assert.equal(byId(failed, "footerText").props.value, "Keep this edit");
    assert.equal(byId(failed, "footerText").props.disabled, false);
    assert.equal(button(failed).props.disabled, false);
    assert.equal(form.guarded(), true);
    assert.ok(find(failed, node => node.type === "p" && /failed|could not/.test(node.props.children)));
  }
});

test("search description is editable independently of the visible footer and title", async () => {
  let submitted;
  const form = formHarness(async (_previous, data) => { submitted = Object.fromEntries(data); return { message: "Saved" }; });
  form.render();
  form.change("seoDescription", " Clean search summary ");
  assert.equal(form.guarded(), true);
  await form.submit();
  assert.equal(submitted.footerText, "Original footer");
  assert.equal(submitted.seoTitle, "Original title");
  assert.equal(submitted.seoDescription, " Clean search summary ");
  assert.equal(form.guarded(), false);
});

test("revalidated props do not reset local edits or replace the saved baseline", async () => {
  const form = formHarness();
  form.render();
  form.change("footerText", "Local edit");
  const refreshed = form.render({ footerText: "Remote footer", seoTitle: "Remote title", seoDescription: "Untouched" });
  assert.equal(byId(refreshed, "footerText").props.value, "Local edit");
  assert.equal(byId(refreshed, "seoTitle").props.value, "Original title");
  assert.equal(form.guarded(), true);
  await form.submit();
  assert.equal(form.guarded(), false);
  assert.equal(button(form.change("footerText", "Remote footer")).props.disabled, false);
});

test("authentication redirects remain framework-controlled rather than becoming save errors", async () => {
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/login;307;" });
  const form = formHarness(async () => { throw redirect; });
  form.render();
  form.change("footerText", "Unsaved edit");
  await assert.rejects(form.submit(), error => error === redirect);
  assert.equal(form.guarded(), true);
});

test("a successful response never marks newer local values as saved", async () => {
  let finish;
  const form = formHarness(() => new Promise(resolve => { finish = resolve; }));
  form.render();
  form.change("footerText", "Submitted value");
  const saving = form.submit();
  // Exercise the race defensively even though the rendered field is disabled.
  form.change("footerText", "Newer local value");
  finish({ message: "Site content updated." });
  const saved = await saving;
  assert.equal(byId(saved, "footerText").props.value, "Newer local value");
  assert.equal(form.guarded(), true);
  assert.equal(button(saved).props.disabled, false);
  assert.equal(button(form.change("footerText", "Submitted value")).props.disabled, true);
});

test("sign out checks the local attempt first, then the shared navigation guard", () => {
  for (const [disabled, attemptAllowed, guardAllowed, expectedCalls, prevented] of [
    [false, true, true, ["attempt", "guard"], false],
    [false, false, true, ["attempt"], true],
    [false, true, false, ["attempt", "guard"], true],
    [true, true, true, [], true],
  ]) {
    const calls = [];
    const action = () => {};
    const { SignOutButton } = loadComponent("../sign-out-button.tsx", {
      "./actions": { signOutAction: action },
      "./photos/unsaved-changes": { confirmAdminNavigation(message) { calls.push("guard"); assert.match(message, /unsaved changes.*Sign out/); return guardAllowed; } },
    });
    const tree = SignOutButton({ disabled, onAttempt() { calls.push("attempt"); return attemptAllowed; } });
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    tree.props.onSubmit(event);
    assert.deepEqual(calls, expectedCalls);
    assert.equal(event.defaultPrevented, prevented);
    assert.equal(tree.props.action, action);
    assert.equal(button(tree).props.disabled, disabled);
    assert.ok(find(tree, node => node.type === "span" && node.props.children === "Sign out"));
  }
});

test("sign out works without an optional attempt callback", () => {
  let checked = false;
  const { SignOutButton } = loadComponent("../sign-out-button.tsx", {
    "./actions": { signOutAction() {} },
    "./photos/unsaved-changes": { confirmAdminNavigation() { checked = true; return true; } },
  });
  SignOutButton({}).props.onSubmit({ preventDefault() { assert.fail("Unexpected cancellation"); } });
  assert.equal(checked, true);
});
