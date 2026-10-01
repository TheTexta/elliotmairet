import assert from "node:assert/strict";
import test from "node:test";

import { parseR2Configuration } from "./config.ts";

const validEnvironment = {
  CLOUDFLARE_S3_API_ENDPOINT: "https://account-id.r2.cloudflarestorage.com/",
  CLOUDFLARE_ACCESS_ID: "access-id",
  CLOUDFLARE_SECRET_KEY: "secret-key",
  CLOUDFLARE_R2_BUCKET: "photographs",
  CLOUDFLARE_R2_STAGING_BUCKET: "photographs-staging",
};

test("R2 configuration normalizes a valid two-bucket environment", () => {
  assert.deepEqual(parseR2Configuration(validEnvironment), {
    endpoint: "https://account-id.r2.cloudflarestorage.com",
    accessKeyId: "access-id",
    secretAccessKey: "secret-key",
    publishedBucket: "photographs",
    stagingBucket: "photographs-staging",
  });
});

test("R2 configuration reports a missing setting without exposing credentials", () => {
  assert.throws(
    () => parseR2Configuration({ ...validEnvironment, CLOUDFLARE_SECRET_KEY: undefined }),
    /Missing required R2 environment variable: CLOUDFLARE_SECRET_KEY/,
  );
});

test("R2 configuration requires an HTTPS endpoint origin", () => {
  assert.throws(
    () => parseR2Configuration({
      ...validEnvironment,
      CLOUDFLARE_S3_API_ENDPOINT: "http://example.com/path",
    }),
    /must be an HTTPS origin/,
  );
});

test("R2 configuration prevents staging in the public bucket", () => {
  assert.throws(
    () => parseR2Configuration({
      ...validEnvironment,
      CLOUDFLARE_R2_STAGING_BUCKET: validEnvironment.CLOUDFLARE_R2_BUCKET,
    }),
    /must be different/,
  );
});