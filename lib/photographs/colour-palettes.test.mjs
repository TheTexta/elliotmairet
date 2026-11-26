import assert from "node:assert/strict";
import test from "node:test";

import { decodeColourPalettes } from "./colour-palettes.ts";

const photo = {
  filename: "synthetic.jpg", width: 100, height: 100, year: "2026",
  imageUrl: "/synthetic.jpg",
  palette: [{ hex: "#111111", lightness: 0.1, axisA: 0, axisB: 0, featureSpace: "oklab" }],
};
let generation = 0;
const freshLoader = async () => (await import(`./colour-palettes.ts?test=${generation++}`)).loadColourPalettes;

test("catalogue decoder accepts legacy/OKLab coordinates and optional alt", () => {
  assert.deepEqual(decodeColourPalettes([photo]), [photo]);
  const legacy = { ...photo, alt: "Synthetic photograph", palette: [{ ...photo.palette[0], featureSpace: "cielab", lightness: 10 }] };
  assert.deepEqual(decodeColourPalettes([legacy]), [legacy]);
  assert.deepEqual(decodeColourPalettes([]), []);
});

test("malformed catalogue and required palette fields cannot enter the success cache", () => {
  for (const value of [
    null, {}, { photographs: [] }, [null], [{}],
    [{ ...photo, filename: "" }], [{ ...photo, width: 0 }],
    [{ ...photo, height: Infinity }], [{ ...photo, year: 2026 }],
    [{ ...photo, imageUrl: null }], [{ ...photo, alt: 42 }],
    [{ ...photo, palette: null }], [{ ...photo, palette: Array(6).fill(photo.palette[0]) }],
    ...[
      { hex: "#oops" }, { lightness: NaN }, { axisA: undefined },
      { axisB: "0" }, { featureSpace: "rgb" },
    ].map((change) => [{ ...photo, palette: [{ ...photo.palette[0], ...change }] }]),
  ]) {
    assert.throws(() => decodeColourPalettes(value), /invalid catalogue shape/);
  }
});

test("pending fetches deduplicate; retries refresh only their failed settled generation", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = (url, options) => {
    assert.equal(url, "/api/gallery/palettes");
    return new Promise((resolve, reject) => requests.push({ resolve, reject, options }));
  };
  const load = await freshLoader();
  const first = load();
  assert.equal(load(), first);
  requests[0].resolve(Response.json([photo]));
  await first;
  assert.equal(load(), first, "Successful navigation reuses its generation");

  const recovery = load(first);
  assert.notEqual(recovery, first);
  assert.equal(load(first), recovery, "Concurrent retry reuses pending recovery");
  assert.equal(load(), recovery, "Navigation shares pending recovery");
  assert.deepEqual(requests[1].options, { cache: "no-cache" });
  requests[1].resolve(Response.json([photo]));
  await recovery;
  assert.equal(load(first), recovery, "Late retry of old generation reuses completed recovery");
  assert.equal(requests.length, 2);
});

test("late observers of an old rejection cannot clear a newer pending or successful request", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  const load = await freshLoader();
  const first = load();
  let newer;
  const startRecovery = first.catch(() => { newer = load(first); });
  // A second old consumer registers after recovery's rejection observer. The
  // previous per-consumer catch cleared the newer request in this ordering.
  const oldConsumer = load();
  const lateObserver = oldConsumer.catch(() => {
    assert.equal(load(first), newer, "Old failure cannot discard pending recovery");
  });
  requests[0].reject(new Error("offline"));
  await Promise.all([startRecovery, lateObserver]);
  assert.equal(requests.length, 2);
  requests[1].resolve(Response.json([photo]));
  await newer;
  await first.catch(() => {
    assert.equal(load(first), newer, "Late failed consumer cannot discard successful recovery");
  });
  assert.equal(requests.length, 2);
});

test("HTTP errors, invalid JSON and malformed 2xx are not cached as success", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const response of [
    new Response("", { status: 500 }),
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    Response.json([{ ...photo, palette: [{ hex: "#111111" }] }]),
  ]) {
    const load = await freshLoader();
    let count = 0;
    globalThis.fetch = async () => ++count === 1 ? response : Response.json([photo]);
    const failed = load();
    await assert.rejects(failed);
    assert.deepEqual(await load(failed), [photo]);
    assert.equal(count, 2);
  }
});
