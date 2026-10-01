import assert from "node:assert/strict";
import test from "node:test";

import { photographUrl } from "./storage.ts";

test("uses the configured R2 public origin", () => {
  const previousUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = "https://images.example.com";

  try {
    assert.equal(
      photographUrl("uploads/photo name.jpg"),
      "https://images.example.com/uploads/photo%20name.jpg",
    );
  } finally {
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
    } else {
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = previousUrl;
    }
  }
});

test("falls back to the Supabase public bucket", () => {
  const previousR2Url = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";

  try {
    assert.equal(
      photographUrl("gallery/photo name.jpg"),
      "https://supabase.example.com/storage/v1/object/public/elliotmairet/gallery/photo%20name.jpg",
    );
  } finally {
    if (previousR2Url === undefined) {
      delete process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
    } else {
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL = previousR2Url;
    }

    if (previousSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }

    if (previousSupabaseKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousSupabaseKey;
    }
  }
});