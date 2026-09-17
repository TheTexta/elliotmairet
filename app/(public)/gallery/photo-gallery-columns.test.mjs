import assert from "node:assert/strict";
import test from "node:test";

import { distributeGalleryItems } from "./photo-gallery-columns.ts";

test("distributes ordered gallery items across two mobile columns", () => {
  assert.deepEqual(distributeGalleryItems(["a", "b", "c", "d", "e"], 2), [
    [
      { index: 0, item: "a" },
      { index: 2, item: "c" },
      { index: 4, item: "e" },
    ],
    [
      { index: 1, item: "b" },
      { index: 3, item: "d" },
    ],
  ]);
});

test("retains the existing three-column desktop distribution", () => {
  assert.deepEqual(distributeGalleryItems(["a", "b", "c", "d", "e"], 3), [
    [
      { index: 0, item: "a" },
      { index: 3, item: "d" },
    ],
    [
      { index: 1, item: "b" },
      { index: 4, item: "e" },
    ],
    [{ index: 2, item: "c" }],
  ]);
});