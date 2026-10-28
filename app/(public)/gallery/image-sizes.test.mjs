import assert from "node:assert/strict";
import test from "node:test";

import { galleryImageSizes, heroImageSizes } from "./image-sizes.ts";

test("gallery sizes match the two- and three-column layout", () => {
  assert.equal(
    galleryImageSizes,
    "(max-width: 639px) calc(50vw - 24px), (max-width: 767px) calc(33.333vw - 8px), calc(22.222vw - 10.667px)",
  );
});

test("portrait hero sizes account for the 80vh height limit as well as gutters", () => {
  assert.equal(
    heroImageSizes(4000, 6000),
    "(max-width: 639px) min(calc(100vw - 32px), 53.333333vh), min(66.667vw, 53.333333vh)",
  );
});

test("landscape hero sizes retain the available width until constrained by height", () => {
  assert.equal(
    heroImageSizes(6000, 4000),
    "(max-width: 639px) min(calc(100vw - 32px), 120vh), min(66.667vw, 120vh)",
  );
});
