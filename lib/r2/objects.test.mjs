import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePhotographObjectKey,
  parseStagedPhotographObjectKey,
  photographObjectKey,
  publicObjectUrl,
  stagedPhotographObjectKey,
} from "./objects.ts";

const photographId = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

test("photograph object keys retain the existing opaque storage path shape", () => {
  assert.equal(photographObjectKey(photographId, "jpg"), `uploads/${photographId}.jpg`);
  assert.throws(
    () => photographObjectKey("original-filename", "jpg"),
    /Invalid photograph object key/,
  );
});

test("staged object keys use a separate private namespace", () => {
  assert.equal(
    stagedPhotographObjectKey(photographId, "png"),
    `staging/${photographId}.png`,
  );
  assert.deepEqual(parseStagedPhotographObjectKey(`staging/${photographId}.png`), {
    photographId,
    extension: "png",
    key: `staging/${photographId}.png`,
  });
  assert.equal(parseStagedPhotographObjectKey(`uploads/${photographId}.png`), null);
});

test("photograph object keys are parsed without accepting adjacent paths", () => {
  assert.deepEqual(parsePhotographObjectKey(`uploads/${photographId}.webp`), {
    photographId,
    extension: "webp",
    key: `uploads/${photographId}.webp`,
  });
  assert.equal(parsePhotographObjectKey(`staging/${photographId}.webp`), null);
  assert.equal(parsePhotographObjectKey(`uploads/${photographId}.gif`), null);
  assert.equal(parsePhotographObjectKey(undefined), null);
});

test("public object URLs encode key segments and preserve a base path", () => {
  assert.equal(
    publicObjectUrl("https://images.example.com/archive/", "folder/a b#c.jpg"),
    "https://images.example.com/archive/folder/a%20b%23c.jpg",
  );
  assert.throws(
    () => publicObjectUrl("http://images.example.com", `uploads/${photographId}.jpg`),
    /must use HTTPS/,
  );
});