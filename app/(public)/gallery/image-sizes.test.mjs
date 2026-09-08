import assert from "node:assert/strict";
import test from "node:test";

import { galleryImageSizes, heroImageSizes } from "./image-sizes.ts";

test("gallery sizes match the two- and three-column layout", () => {
  assert.equal(
    galleryImageSizes,
    "(max-width: 639px) calc(50vw - 24px), (max-width: 767px) calc(33.333vw - 8px), calc(22.222vw - 10.667px)",
  );
});

test("hero sizes account for the mobile padding and desktop one-sixth gutters", () => {
  assert.equal(
    heroImageSizes,
    "(max-width: 639px) calc(100vw - 32px), 66.667vw",
  );
});
