import assert from "node:assert/strict";
import test from "node:test";
import { reviewImageUrl, reviewSample } from "./review-palettes.mjs";

test("review URLs request bounded public derivatives only", () => {
  const r2 = new URL(reviewImageUrl("https://images.dextery.dev/elliotmairet/uploads/test.jpg"));
  assert.equal(r2.searchParams.get("width"), "640");
  assert.equal(r2.searchParams.get("format"), "auto");
  const legacy = new URL(reviewImageUrl("https://api.dextery.dev/storage/v1/object/public/elliotmairet/test.jpg"));
  assert.ok(legacy.pathname.includes("/render/image/public/"));
  for (const value of ["http://images.dextery.dev/elliotmairet/x", "https://images.dextery.dev/other-site/x", "https://example.com/photo.jpg", "https://secret@images.dextery.dev/elliotmairet/x"]) {
    assert.throws(() => reviewImageUrl(value));
  }
});

test("review sampling is deterministic, unique and covers monochrome/muted/vibrant images", () => {
  const data = [0, 0.025, 0.12].flatMap((axisA, group) => Array.from({ length: 20 }, (_, i) => ({
    filename: `${group}-${i}`, palette: [{ axisA, axisB: 0, featureSpace: "oklab" }],
  })));
  const sample = reviewSample(data, 24);
  assert.equal(sample.length, 24);
  assert.equal(new Set(sample.map(p => p.filename)).size, 24);
  for (const group of [0, 1, 2]) assert.equal(sample.filter(p => p.filename.startsWith(`${group}-`)).length, 8);
  assert.deepEqual(sample, reviewSample(data, 24));
});
