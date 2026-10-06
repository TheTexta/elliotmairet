import assert from "node:assert/strict";
import test from "node:test";

import { MAXIMUM_UPLOAD_BYTES } from "./config.ts";
import { createPhotographUpload, isUploading } from "./upload.ts";

const metadata = {
  filename: "photo.jpg",
  title: "A photograph",
  capturedAt: "2026-10-05",
  altText: "Mountains",
  sortOrder: null,
};
const prepared = {
  uploadUrl: "https://storage.example.com/staging/photo.jpg",
  stagingPath: "staging/photo.jpg",
  storagePath: "uploads/photo.jpg",
};
const photo = () => new File(["image"], "photo.jpg", { type: "image/jpeg" });
const json = (value, status = 200) => Response.json(value, { status });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(responses) {
  const states = [];
  const calls = [];
  const upload = createPhotographUpload((state) => states.push(state), async (url, init) => {
    calls.push({ url, ...init });
    assert.ok(responses.length, "Unexpected additional request");
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return await response;
  });
  return { upload, states, calls };
}

test("success runs preparation, transfer, and publication in order using the submitted metadata", async () => {
  const { upload, states, calls } = harness([json(prepared), new Response(), json({ message: "Photograph published." })]);
  const file = photo();
  assert.equal(await upload.submit(file, metadata), true);
  assert.deepEqual(states.map((state) => state.status), ["preparing", "transferring", "publishing", "success"]);
  assert.equal(upload.isActive(), false);
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[1].body, file);
  assert.deepEqual(JSON.parse(calls[0].body), { phase: "prepare", contentType: file.type, size: file.size, ...metadata });
  assert.deepEqual(JSON.parse(calls[2].body), {
    phase: "publish", stagingPath: prepared.stagingPath, storagePath: prepared.storagePath, contentType: file.type, ...metadata,
  });
  assert.equal(await upload.submit(file, metadata), false, "A completed photo cannot be submitted again");
  assert.equal(calls.length, 3);
});

test("slow requests lock duplicate submissions and resets throughout every active stage", async () => {
  const prepare = deferred();
  const transfer = deferred();
  const publish = deferred();
  const { upload, states, calls } = harness([prepare.promise, transfer.promise, publish.promise]);
  const file = photo();
  const submission = upload.submit(file, metadata);

  async function assertLocked(stage, requestCount) {
    assert.equal(states.at(-1).status, stage);
    assert.equal(upload.isActive(), true);
    assert.equal(upload.reset(), false);
    assert.equal(await upload.submit(file, metadata), false);
    assert.equal(calls.length, requestCount);
  }

  await assertLocked("preparing", 1);
  prepare.resolve(json(prepared));
  await new Promise(setImmediate);
  await assertLocked("transferring", 2);
  transfer.resolve(new Response());
  await new Promise(setImmediate);
  await assertLocked("publishing", 3);
  publish.resolve(json({ message: "Photograph published." }));
  assert.equal(await submission, true);
  assert.equal(upload.isActive(), false);
});

for (const [name, file, message] of [
  ["empty", new File([], "empty.jpg", { type: "image/jpeg" }), /non-empty/],
  ["unsupported", new File(["image"], "photo.gif", { type: "image/gif" }), /JPG, PNG, or WEBP/],
  ["oversized", Object.defineProperty(photo(), "size", { value: MAXIMUM_UPLOAD_BYTES + 1 }), /512 MiB/],
]) {
  test(`${name} files fail validation without making requests`, async () => {
    const { upload, states, calls } = harness([]);
    assert.equal(await upload.submit(file, metadata), false);
    assert.equal(states.at(-1).status, "error");
    assert.match(states.at(-1).message, message);
    assert.equal(states.at(-1).retryPublication, false);
    assert.equal(calls.length, 0);
    assert.equal(upload.isActive(), false);
  });
}

for (const type of ["image/jpeg", "image/png", "image/webp"]) {
  test(`${type} is accepted`, async () => {
    const { upload } = harness([json(prepared), new Response(), json({ message: "Photograph published." })]);
    assert.equal(await upload.submit(new File(["image"], "photo", { type }), metadata), true);
  });
}

test("prepare errors expose server messages and can restart with edited metadata", async () => {
  const { upload, states, calls } = harness([
    json({ error: "Administrator access is required." }, 401),
    json(prepared), new Response(), json({ message: "Photograph published." }),
  ]);
  assert.equal(await upload.submit(photo(), metadata), false);
  assert.deepEqual(states.at(-1), {
    status: "error", stage: "preparing", message: "Administrator access is required.", retryPublication: false,
  });
  assert.equal(upload.isActive(), false);
  assert.equal(await upload.submit(photo(), { ...metadata, title: "Edited" }), true);
  assert.equal(JSON.parse(calls[1].body).title, "Edited");
});

test("transfer failure restarts preparation rather than publishing an incomplete object", async () => {
  const { upload, states, calls } = harness([
    json(prepared), new Response(null, { status: 500 }),
    json(prepared), new Response(), json({ message: "Photograph published." }),
  ]);
  assert.equal(await upload.submit(photo(), metadata), false);
  assert.equal(states.at(-1).stage, "transferring");
  assert.equal(states.at(-1).retryPublication, false);
  assert.equal(upload.isActive(), false);
  assert.equal(await upload.submit(photo(), metadata), true);
  assert.equal(JSON.parse(calls[2].body).phase, "prepare");
});

for (const failure of [
  new TypeError("Failed to fetch"),
  json({ error: "The photograph could not be added." }, 400),
  new Response("not JSON"),
  json({}),
]) {
  test(`publication retry retains paths and metadata after ${failure instanceof Error ? "network failure" : "failed or malformed response"}`, async () => {
    const originalMetadata = { ...metadata };
    const { upload, states, calls } = harness([
      json(prepared), new Response(), failure, json({ message: "Photograph published." }),
    ]);
    const submission = upload.submit(photo(), originalMetadata);
    originalMetadata.title = "Changed while request was pending";
    assert.equal(await submission, false);
    assert.equal(states.at(-1).stage, "publishing");
    assert.equal(states.at(-1).retryPublication, true);
    assert.equal(upload.isActive(), false);
    assert.equal(await upload.submit(photo(), { ...metadata, title: "Different retry details" }), true);
    assert.equal(calls.length, 4);
    assert.equal(calls[2].body, calls[3].body, "Retry must send exactly the original publication request");
    assert.equal(JSON.parse(calls[3].body).title, metadata.title);
    assert.equal(states.at(-1).status, "success");
  });
}

for (const body of [null, [], {}, { uploadUrl: prepared.uploadUrl }, { ...prepared, storagePath: "" }]) {
  test(`malformed prepare response ${JSON.stringify(body)} never starts a transfer`, async () => {
    const { upload, states, calls } = harness([json(body)]);
    assert.equal(await upload.submit(photo(), metadata), false);
    assert.match(states.at(-1).message, /could not be prepared/);
    assert.equal(calls.length, 1);
  });
}

test("missing error messages and network failures get readable fallback errors", async () => {
  for (const response of [json({}, 500), json({ error: "" }, 500), new Response("not JSON", { status: 500 }), new TypeError("Failed to fetch")]) {
    const { upload, states } = harness([response]);
    assert.equal(await upload.submit(photo(), metadata), false);
    assert.match(states.at(-1).message, /could not be (prepared|completed)/);
    assert.equal(upload.isActive(), false);
  }
});

test("upload another clears success or a retained publication before starting a new photo", async () => {
  for (const response of [json({ message: "Photograph published." }), new TypeError("Failed to fetch")]) {
    const { upload, states, calls } = harness([
      json(prepared), new Response(), response,
      json({ ...prepared, storagePath: "uploads/another.jpg" }), new Response(), json({ message: "Photograph published." }),
    ]);
    await upload.submit(photo(), metadata);
    assert.equal(upload.reset(), true);
    assert.deepEqual(states.at(-1), { status: "idle" });
    assert.equal(await upload.submit(photo(), metadata), true);
    assert.equal(JSON.parse(calls[3].body).phase, "prepare");
    assert.equal(JSON.parse(calls[5].body).storagePath, "uploads/another.jpg");
  }
});

test("ready and terminal states do not lock navigation", () => {
  for (const status of ["idle", "ready", "success", "error"]) assert.equal(isUploading({ status }), false);
  for (const status of ["preparing", "transferring", "publishing"]) assert.equal(isUploading({ status }), true);
});
