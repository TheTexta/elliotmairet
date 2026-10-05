import assert from "node:assert/strict";
import test from "node:test";

import supabaseImageLoader from "./supabase-image-loader.ts";

test("selects a Cloudflare transformation for an R2 photograph", () => {
  const previousUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = "https://images.example.com";

  try {
    assert.equal(
      supabaseImageLoader({
        src: "https://images.example.com/uploads/photo%20name.jpg",
        width: 2048,
        quality: 82,
      }),
      "https://images.example.com/cdn-cgi/image/width=2048,quality=82,format=auto/https://images.example.com/uploads/photo%20name.jpg",
    );
  } finally {
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
    } else {
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = previousUrl;
    }
  }
});

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

test("uses namespaced shared image transformations without changing storage keys", () => {
  const old = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = "https://images.dextery.dev/elliotmairet";
  try {
    assert.equal(supabaseImageLoader({ src: "https://images.dextery.dev/elliotmairet/uploads/photo%20name.jpg", width: 2048, quality: 82 }), "https://images.dextery.dev/elliotmairet/uploads/photo%20name.jpg?width=2048&quality=82&format=auto");
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
    else process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = old;
  }
});
