import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("./confirm-provider.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness() {
  const slots = [], cleanups = [];
  let cursor = 0, effects = false, tree, focusCount = 0, pathname = "/admin/photos";
  class HTMLElement { isConnected = true; focus() { focusCount++; } }
  const opener = new HTMLElement();
  const exports = {};
  runInNewContext(source, { exports, HTMLElement, document: { activeElement: opener },
    require: name => name === "react" ? {
      createContext: () => ({ Provider: "provider" }), useContext: () => tree?.props.value,
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useCallback: fn => fn, useEffect: fn => { if (!effects) cleanups.push(fn()); },
    } : name === "next/navigation" ? { usePathname: () => pathname } : name === "@/components/ui/alert-dialog" ? Object.fromEntries([
      "AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle",
    ].map(name => [name, name])) : require(name),
  });
  function render() { cursor = 0; tree = exports.AdminConfirmProvider({ children: null }); effects = true; return tree; }
  function find(node, type) {
    if (!node || typeof node !== "object") return;
    if (node.type === type) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean);
  }
  render();
  return { confirm: options => tree.props.value(options), render,
    dialog: () => find(tree, "AlertDialog"), action: () => find(tree, "AlertDialogAction"), cancel: () => find(tree, "AlertDialogCancel"),
    content: () => find(tree, "AlertDialogContent"), cleanup: () => cleanups.forEach(fn => fn?.()), opener, focusCount: () => focusCount,
    boundary: () => exports.AdminConfirmBoundary({ children: null }), setPath: value => { pathname = value; } };
}
const options = { title: "Remove photograph?", description: "Permanent removal of photo.jpg", destructive: true, confirmLabel: "Remove permanently" };

test("confirmation opens with exact warning; confirming resolves once", async () => {
  const h = harness();
  const result = h.confirm(options); h.render();
  assert.equal(h.dialog().props.open, true);
  assert.equal(h.action().props.children, "Remove permanently");
  assert.equal(h.action().props.variant, "destructive");
  h.action().props.onClick();
  assert.equal(await result, true);
  // Radix closing after the action must not change the resolved decision.
  h.dialog().props.onOpenChange(false); h.render();
  assert.equal(h.dialog().props.open, false);
});
test("Cancel, Escape/close and unmount decline without running caller work", async () => {
  for (const reason of ["cancel", "close", "unmount"]) {
    const h = harness(); let performed = false;
    const result = h.confirm(options).then(value => { if (value) performed = true; return value; }); h.render();
    if (reason === "cancel") h.cancel().props.onClick();
    else if (reason === "close") h.dialog().props.onOpenChange(false);
    else h.cleanup();
    assert.equal(await result, false);
    assert.equal(performed, false);
    if (reason === "unmount") assert.equal(await h.confirm(options), false);
  }
});
test("concurrent prompts cannot overwrite the outstanding decision", async () => {
  const h = harness(); const first = h.confirm(options); h.render();
  assert.equal(await h.confirm({ title: "Other request", description: "No" }), false);
  assert.equal(h.action().props.children, "Remove permanently");
  h.cancel().props.onClick(); assert.equal(await first, false);
});
test("closing restores focus only to a connected opener", async () => {
  const h = harness(); const result = h.confirm(options); h.render();
  h.cancel().props.onClick(); await result;
  let prevented = false;
  h.content().props.onCloseAutoFocus({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.focusCount(), 1);
  h.opener.isConnected = false;
  h.content().props.onCloseAutoFocus({ preventDefault() { assert.fail("Disconnected opener must not be focused"); } });
  assert.equal(h.focusCount(), 1);
});

test("route changes key the scope so navigation cancels a pending decision", async () => {
  const h = harness(); let actions = 0;
  const previous = h.boundary();
  const decision = h.confirm(options).then(accepted => { if (accepted) actions++; return accepted; });
  h.render(); h.setPath("/admin/content");
  const next = h.boundary();
  assert.notEqual(next.key, previous.key);
  // React unmounts the old provider when this route key changes.
  h.cleanup();
  assert.equal(await decision, false);
  assert.equal(actions, 0);
});
