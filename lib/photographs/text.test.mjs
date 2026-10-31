import assert from "node:assert/strict";
import { test } from "node:test";
import { photographCaption, previewTextFields, validatePhotographTextFields, validateTextImport } from "./text.ts";

const fields = { title: "Birds above waves", description: "Birds cross a pale sky above waves.",
  altText: "Bird silhouettes above waves.", filenameSuggestion: "birds-above-waves.jpg", uncertainties: [] };
const payload = { formatVersion: 1, runId: "00000000-0000-4000-8000-000000000021",
  config: { model: "gpt-6.1-sol", promptVersion: "a".repeat(64), configHash: "b".repeat(64) },
  records: [{ photographId: "00000000-0000-4000-8000-000000000011", filename: "one.jpg", storagePath: "uploads/one.jpg",
    width: 6000, height: 4000, textRevision: 0, previewSha256: "c".repeat(64), responseId: "resp_example",
    model: "gpt-6.1-sol", usage: { input_tokens: 1000, output_tokens: 100 }, fields }] };

test("caption modes distinguish defaults, overrides and deliberate hiding", () => {
  assert.equal(photographCaption({}), null);
  assert.equal(photographCaption({ description: " Description " }), "Description");
  assert.equal(photographCaption({ description: "Description", captionMode: "custom", customCaption: " Owner caption " }), "Owner caption");
  assert.equal(photographCaption({ description: "Description", captionMode: "hidden", customCaption: "Owner caption" }), null);
  assert.equal(photographCaption({ description: "Description", captionMode: "custom", customCaption: " " }), null);
});

test("captions do not mutate alt text, descriptions or retained custom wording", () => {
  const photo = { description: "Description", altText: "Accessible text", captionMode: "hidden", customCaption: "Owner caption" };
  const before = structuredClone(photo);
  photographCaption(photo);
  assert.deepEqual(photo, before);
  assert.equal(photographCaption({ ...photo, captionMode: "description" }), "Description");
  assert.equal(photographCaption({ ...photo, captionMode: "custom" }), "Owner caption");
});

test("recovered preview differences use approved fields rather than unrelated local checkboxes", () => {
  const approval = { eligibleFields: ["description"], protectedFields: ["alt_text"] };
  assert.deepEqual(previewTextFields(approval), ["description", "alt_text"]);
  assert.deepEqual(previewTextFields({ eligibleFields: [], protectedFields: [] }), []);
});

test("draft text permits owner editing but rejects paths, unexpected keys and oversized text", () => {
  assert.deepEqual(validatePhotographTextFields(fields), fields);
  assert.throws(() => validatePhotographTextFields({ ...fields, extra: true }));
  assert.throws(() => validatePhotographTextFields({ ...fields, filenameSuggestion: "../one.jpg" }));
  assert.throws(() => validatePhotographTextFields({ ...fields, description: "x".repeat(1001) }));
  assert.throws(() => validatePhotographTextFields({ ...fields, uncertainties: ["<script>"] }));
  assert.throws(() => validatePhotographTextFields({ ...fields, title: "Birds\x7f" }));
  assert.throws(() => validatePhotographTextFields({ ...fields, uncertainties: ["Note\x7f"] }));
});

test("imports retain the exact Sol run identity and discard raw provider payloads", () => {
  const result = validateTextImport({ ...payload, records: [{ ...payload.records[0], originalModelOutput: "not sent to DB" }] });
  assert.equal(result.runId, payload.runId);
  assert.equal(result.records[0].originalModelOutput, undefined);
  assert.deepEqual(result.records[0].fields, fields);
  assert.throws(() => validateTextImport({ ...payload, config: { ...payload.config, model: "gpt-4.1" } }));
  assert.throws(() => validateTextImport({ ...payload, config: { ...payload.config, configHash: "changed" } }));
});

test("imports are bounded and never use filenames in place of stable photograph IDs", () => {
  assert.throws(() => validateTextImport({ ...payload, records: [] }));
  assert.throws(() => validateTextImport({ ...payload, records: Array(21).fill(payload.records[0]) }));
  assert.throws(() => validateTextImport({ ...payload, records: [payload.records[0], payload.records[0]] }));
  assert.throws(() => validateTextImport({ ...payload, records: [{ ...payload.records[0], photographId: "one.jpg" }] }));
  assert.throws(() => validateTextImport({ ...payload, records: [{ ...payload.records[0], textRevision: -1 }] }));
});
