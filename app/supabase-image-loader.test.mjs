import assert from "node:assert/strict";
import test from "node:test";

import supabaseImageLoader from "./supabase-image-loader.ts";

test("selects a transformed Supabase source at the requested width and quality", () => {
  assert.equal(
    supabaseImageLoader({
      src: "https://api.dextery.dev/storage/v1/object/public/elliotmairet/gallery/photo.jpg",
      width: 5120,
      quality: 82,
    }),
    "https://api.dextery.dev/storage/v1/render/image/public/elliotmairet/gallery/photo.jpg?width=5120&quality=82",
  );
});

test("leaves relative and unsupported sources unchanged", () => {
  assert.equal(
    supabaseImageLoader({ src: "/local/photo.jpg", width: 640, quality: 50 }),
    "/local/photo.jpg",
  );
  assert.equal(
    supabaseImageLoader({
      src: "https://example.com/photo.jpg",
      width: 640,
      quality: 50,
    }),
    "https://example.com/photo.jpg",
  );
});
