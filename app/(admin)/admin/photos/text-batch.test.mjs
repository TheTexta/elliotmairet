import assert from "node:assert/strict";
import test from "node:test";

import { applyTextBatch, emptyTextBatch, recoverTextBatch, rollbackTextBatch, textBatchLocked, textBatchReducer } from "./text-batch.ts";

const preview = { token: "approval-a", runId: "run-a", expiresAt: "2026-12-01", rows: [] };
const row = (draftId, status = "applied") => ({ draftId, status, fields: ["title"], filename: `${draftId}.jpg` });

function harness() {
  let state = textBatchReducer(emptyTextBatch, { type: "preview", preview });
  return { get state() { return state; }, dispatch(event) { state = textBatchReducer(state, event); } };
}

test("preview, interrupted apply, retry and completion retain one approval and reconcile by draft ID", async () => {
  const h = harness();
  assert.equal(h.state.phase, "previewed");
  assert.equal(textBatchLocked(h.state), false);
  const tokens = [];
  let calls = 0;
  await assert.rejects(applyTextBatch(preview.token, async token => {
    tokens.push(token);
    assert.equal(h.state.phase, "applying");
    assert.equal(textBatchLocked(h.state), true);
    return ++calls === 1 ? { done: false, results: [row("a")] } : { error: "Lost response." };
  }, h.dispatch, () => {}), /approval token is retained/);
  assert.equal(h.state.phase, "interrupted");
  assert.equal(h.state.preview, preview);
  assert.equal(textBatchLocked(h.state), true);
  await applyTextBatch(h.state.preview.token, async token => {
    tokens.push(token);
    return { done: true, results: [row("b"), row("a", "already_applied")] };
  }, h.dispatch, () => {});
  assert.deepEqual(tokens, [preview.token, preview.token, preview.token]);
  assert.equal(h.state.phase, "complete");
  assert.equal(textBatchLocked(h.state), false);
  assert.deepEqual(h.state.results.map(({ draftId, status }) => [draftId, status]), [["a", "already_applied"], ["b", "applied"]]);
});

for (const response of [{}, { done: "yes" }, new Error("Network unavailable")]) {
  test(`uncertain response ${JSON.stringify(response)} retains approval even before the first result`, async () => {
    const h = harness();
    await assert.rejects(applyTextBatch(preview.token, async () => {
      if (response instanceof Error) throw response;
      return response;
    }, h.dispatch, () => {}));
    assert.equal(h.state.phase, "interrupted");
    assert.equal(h.state.preview.token, preview.token);
    assert.deepEqual(h.state.results, []);
  });
}

test("recovery, rollback and release have explicit lock lifetimes; stale responses cannot revive released approval", () => {
  const h = harness();
  h.dispatch({ type: "recover", previous: h.state, preview, results: [row("a")], done: false });
  assert.equal(h.state.phase, "interrupted");
  h.dispatch({ type: "rollback", token: preview.token, results: [row("a", "restored")], done: true });
  assert.equal(h.state.phase, "complete");
  assert.equal(textBatchLocked(h.state), false);
  assert.equal(h.state.results[0].status, "restored");
  h.dispatch({ type: "release" });
  h.dispatch({ type: "progress", token: preview.token, results: [row("b")], done: true });
  assert.deepEqual(h.state, emptyTextBatch);
  h.dispatch({ type: "preview", preview: { ...preview, token: "approval-b" } });
  const next = h.state;
  h.dispatch({ type: "interrupt", token: preview.token });
  assert.equal(h.state, next);
  h.dispatch({ type: "recover", previous: h.state, preview, results: [], done: true });
  assert.equal(h.state.phase, "complete");
  assert.equal(textBatchLocked(h.state), false);
});

function interrupted() {
  const h = harness();
  h.dispatch({ type: "progress", token: preview.token, results: [row("a")], done: false });
  h.dispatch({ type: "interrupt", token: preview.token });
  return h;
}

for (const response of [null, {}, { preview }, { preview, results: [] }, { preview, results: [], done: "yes" },
  { preview: { ...preview, token: "other" }, results: [], done: true },
  { preview: { ...preview, rows: [{}] }, results: [], done: true },
  { preview, results: [{}], done: true }]) {
  test(`uncertain recovery ${JSON.stringify(response)} preserves interrupted approval and results`, () => {
    const h = interrupted(), before = h.state;
    assert.throws(() => recoverTextBatch(before, preview.token, response, h.dispatch), /approval.*retained/i);
    assert.equal(h.state, before);
    assert.equal(textBatchLocked(h.state), true);
  });
}

for (const response of [null, {}, { message: "Success" }, { results: null }, { results: [{}] }, { results: [], message: {} }]) {
  test(`uncertain rollback ${JSON.stringify(response)} cannot imply completion`, () => {
    const h = interrupted(), before = h.state;
    assert.throws(() => rollbackTextBatch(preview.token, response, h.dispatch), /approval.*retained/i);
    assert.equal(h.state, before);
  });
}

for (const response of [{ done: true }, { done: false }, { results: [row("b")] }, { done: true, results: [{}] }, { done: true, results: [], message: {} }, null]) {
  test(`uncertain apply completion ${JSON.stringify(response)} preserves earlier progress`, async () => {
    const h = interrupted();
    await assert.rejects(applyTextBatch(preview.token, async () => response, h.dispatch, () => {}), /approval.*retained/i);
    assert.equal(h.state.phase, "interrupted");
    assert.equal(h.state.preview.token, preview.token);
    assert.deepEqual(h.state.results, [row("a")]);
  });
}

test("valid incomplete recovery merges recorded progress and cannot unlock an interrupted approval", () => {
  const h = interrupted();
  recoverTextBatch(h.state, preview.token, { preview, results: [], done: false }, h.dispatch);
  assert.equal(h.state.phase, "interrupted");
  assert.deepEqual(h.state.results, [row("a")]);
  recoverTextBatch(h.state, preview.token, { preview, results: [row("b")], done: false }, h.dispatch);
  assert.deepEqual(h.state.results, [row("a"), row("b")]);
  rollbackTextBatch(preview.token, { results: [row("a", "restored")] }, h.dispatch);
  assert.equal(h.state.phase, "complete");
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const late of ["progress", "error"]) {
  test(`rollback wins over deferred same-token apply ${late}`, async () => {
    const h = interrupted(), action = deferred();
    const applying = applyTextBatch(preview.token, () => action.promise, h.dispatch, () => {});
    rollbackTextBatch(preview.token, { results: [row("a", "restored")] }, h.dispatch);
    const rolledBack = h.state;
    if (late === "error") {
      action.reject(new Error("Lost response"));
      await assert.rejects(applying, /Lost response/);
    } else {
      action.resolve({ results: [row("a")], done: true });
      await applying;
    }
    assert.equal(h.state, rolledBack);
    assert.equal(h.state.results[0].status, "restored");
    assert.equal(textBatchLocked(h.state), false);
  });
}

for (const terminal of ["rollback", "release"]) {
  test(`deferred recovery cannot undo ${terminal}, but a new explicit recovery can succeed`, async () => {
    const h = interrupted(), action = deferred(), previous = h.state;
    const recovering = action.promise.then(response => recoverTextBatch(previous, preview.token, response, h.dispatch));
    if (terminal === "rollback") rollbackTextBatch(preview.token, { results: [row("a", "restored")] }, h.dispatch);
    else h.dispatch({ type: "release" });
    const settled = h.state;
    action.resolve({ preview, results: [row("a")], done: false });
    await recovering;
    assert.equal(h.state, settled);
    // Recovering another token is a new intentional operation, not stale work.
    const nextPreview = { ...preview, token: "approval-b" };
    recoverTextBatch(h.state, nextPreview.token, { preview: nextPreview, results: [], done: false }, h.dispatch);
    assert.equal(h.state.phase, "previewed");
    assert.equal(h.state.preview.token, "approval-b");
  });
}

test("completed approval cannot be reopened by same-token apply or incomplete recovery; release permits intentional recovery", () => {
  const h = interrupted();
  rollbackTextBatch(preview.token, { results: [] }, h.dispatch);
  const complete = h.state;
  h.dispatch({ type: "start", token: preview.token });
  h.dispatch({ type: "interrupt", token: preview.token });
  h.dispatch({ type: "progress", token: preview.token, results: [row("a")], done: false });
  recoverTextBatch(h.state, preview.token, { preview, results: [row("a")], done: false }, h.dispatch);
  assert.equal(h.state, complete);
  h.dispatch({ type: "release" });
  recoverTextBatch(h.state, preview.token, { preview, results: [row("a")], done: false }, h.dispatch);
  assert.equal(h.state.phase, "interrupted");
});
