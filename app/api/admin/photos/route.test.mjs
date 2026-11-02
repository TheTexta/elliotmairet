import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import readExif from "exif-reader";
import sharp from "sharp";
import ts from "typescript";

import * as config from "../../../../lib/photographs/config.ts";
import * as objects from "../../../../lib/r2/objects.ts";

// Same transpile/VM seam as the admin tests, but fail closed on every import.
// No real server clients, environment files, network, or after() work are loaded.
function load(path, mocks) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, {
    exports, Buffer, URL,
    process: { env: { NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL: "https://images.example.test/elliotmairet" } },
    console: { error() {} },
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return exports;
}

const { imageMetadata } = load("../../../../lib/photographs/analyse-image.ts", {
  "exif-reader": readExif, sharp,
  "@/lib/palette/k-means.js": {}, "@/lib/palette/oklab-k-medoids.js": {},
  "@/lib/photographs/config": config,
});
const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: "blue" } }).png().toBuffer();

function harness({ user = { id: "synthetic-admin" }, admin = true } = {}) {
  const staged = new Map(), published = new Map(), catalogue = new Map(), reservations = new Map();
  const events = [], scheduled = [];
  const failures = { reservation: false, publish: false, signing: false };
  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) },
    async rpc(name, args) {
      events.push(name);
      if (name === "is_admin") return { data: admin, error: null };
      if (name === "record_storage_cleanup_job") {
        if (failures.reservation) return { error: { message: "Synthetic reservation failure" } };
        reservations.set(args.job_storage_path, structuredClone(args));
      } else if (name === "cancel_storage_upload_reservation") {
        reservations.delete(args.job_storage_path);
      } else if (name === "publish_photograph_with_oklab") {
        if (failures.publish) return { error: { message: "Synthetic transaction failure" } };
        assert.ok(reservations.has(args.p_storage_path), "Publication must retain a recovery reservation until commit");
        assert.ok(published.has(args.p_storage_path), "Object must exist before catalogue commit");
        assert.equal(catalogue.has(args.p_photograph_id), false, "No duplicate insert");
        catalogue.set(args.p_photograph_id, structuredClone(args));
        // The existing RPC retains the public reservation; cleanup listings
        // exclude paths belonging to catalogue rows. Only staging is cancelled.
      } else assert.fail(`Unexpected RPC: ${name}`);
      return { error: null };
    },
    from(table) {
      assert.equal(table, "photographs");
      events.push("catalogue-read");
      let id;
      const chain = {
        select: () => chain,
        eq(column, value) { assert.equal(column, "id"); id = value; return chain; },
        async maybeSingle() {
          const row = catalogue.get(id);
          return { data: row ? { storage_path: row.p_storage_path, filename: row.p_filename } : null, error: null };
        },
      };
      return chain;
    },
  };
  const auth = load("../../../../lib/supabase/admin.ts", {
    "./server": { createClient: async () => supabase },
    "next/navigation": { redirect() { assert.fail("Route must return HTTP denial"); } },
  });
  const { POST } = load("./route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: Response, after: callback => scheduled.push(callback) },
    "@/lib/cache-invalidation": { invalidatePhotographsAndPalettes: () => events.push("invalidate") },
    "@/lib/photographs/analyse-image": {
      imageMetadata,
      // Palette algorithm correctness is covered separately; this fixture keeps
      // the route's publication payload deterministic without external services.
      analyseImage: async () => ({ algorithm: "fixture", colours: [], oklab_features: { algorithm: "fixture", features: [] } }),
    },
    "@/lib/photographs/automatic-text": { processAutomaticPhotographText() { assert.fail("No AI work in offline route tests"); } },
    "@/lib/r2/image-source": { createImageDeliverySource: async () => null },
    "@/lib/photographs/config": config,
    "@/lib/r2/objects": objects,
    "@/lib/supabase/admin": auth,
    "@/lib/r2/server": {
      async createStagedUploadUrl(path) {
        events.push("sign");
        assert.ok(reservations.has(path), "Reserve before issuing any upload capability");
        if (failures.signing) throw new Error("Synthetic signing failure");
        return `https://staging.example.test/${path}`;
      },
      async downloadStagedObject(path) {
        events.push("download");
        assert.ok(staged.has(path));
        return staged.get(path);
      },
      async copyStagedObjectToPublished(source, destination, contentType, etag, length, checksum) {
        events.push("copy");
        assert.ok(reservations.has(destination), "Reserve public object before copying");
        const object = staged.get(source);
        assert.equal(etag, object.etag);
        assert.equal(length, object.bytes.length);
        assert.equal(checksum, createHash("sha256").update(object.bytes).digest("hex"));
        published.set(destination, { bytes: Buffer.from(object.bytes), contentType, checksum });
      },
      async deleteStagedObject(path) { events.push("delete-staged"); staged.delete(path); },
    },
  });
  async function post(body) {
    return POST(new Request("https://site.example.test/api/admin/photos", { method: "POST", body: JSON.stringify(body) }));
  }
  async function prepare() {
    const response = await post({ phase: "prepare", contentType: "image/jpeg", size: jpeg.length, filename: "synthetic.jpg" });
    assert.equal(response.status, 200);
    const paths = await response.json();
    staged.set(paths.stagingPath, { bytes: jpeg, contentType: "image/jpeg", etag: "synthetic-etag", contentLength: jpeg.length });
    return { phase: "publish", contentType: "image/jpeg", filename: "synthetic.jpg", storagePath: paths.storagePath, stagingPath: paths.stagingPath };
  }
  return { post, prepare, staged, published, catalogue, reservations, events, failures, scheduled };
}

for (const [name, identity] of [["anonymous", { user: null }], ["signed-in nonadmin", { admin: false }]]) {
  test(`${name} cannot prepare or publish objects`, async () => {
    const h = harness(identity);
    for (const phase of ["prepare", "publish"]) {
      const response = await h.post({ phase });
      assert.equal(response.status, 401);
      assert.match((await response.json()).error, /Administrator access/);
    }
    assert.deepEqual(h.events, identity.user === null ? [] : ["is_admin", "is_admin"]);
    for (const state of [h.staged, h.published, h.catalogue, h.reservations]) assert.equal(state.size, 0);
    assert.equal(h.scheduled.length, 0);
  });
}

for (const [name, object, message] of [
  ["stored MIME mismatch", { bytes: jpeg, contentType: "image/png" }, /does not match the prepared upload/],
  ["JPEG MIME with real PNG bytes", { bytes: png, contentType: "image/jpeg" }, /does not match its contents/],
]) {
  test(`${name} leaves only the staged object and its recovery reservation`, async () => {
    const h = harness(), body = await h.prepare();
    h.staged.set(body.stagingPath, { ...h.staged.get(body.stagingPath), ...object });
    const before = { ...h.staged.get(body.stagingPath), bytes: Buffer.from(object.bytes) };
    const response = await h.post(body);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, message);
    assert.deepEqual(h.staged.get(body.stagingPath), before);
    assert.deepEqual([...h.reservations.keys()], [body.stagingPath]);
    assert.equal(h.published.size, 0);
    assert.equal(h.catalogue.size, 0);
    assert.equal(h.events.includes("copy"), false);
    assert.equal(h.scheduled.length, 0);
  });
}

test("prepare reservation failure issues no signed capability or object", async () => {
  const h = harness();
  h.failures.reservation = true;
  const response = await h.post({ phase: "prepare", contentType: "image/jpeg", size: jpeg.length, filename: "synthetic.jpg" });
  assert.equal(response.status, 500);
  assert.equal(h.events.includes("sign"), false);
  for (const state of [h.staged, h.published, h.catalogue, h.reservations]) assert.equal(state.size, 0);
});

test("failed signing releases the prepare reservation without creating objects", async () => {
  const h = harness();
  h.failures.signing = true;
  const response = await h.post({ phase: "prepare", contentType: "image/jpeg", size: jpeg.length, filename: "synthetic.jpg" });
  assert.equal(response.status, 500);
  for (const state of [h.staged, h.published, h.catalogue, h.reservations]) assert.equal(state.size, 0);
});

test("public cleanup reservation failure prevents copy and catalogue publication", async () => {
  const h = harness(), body = await h.prepare();
  h.failures.reservation = true;
  const response = await h.post(body);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /could not be prepared for publication/);
  assert.deepEqual(h.staged.get(body.stagingPath).bytes, jpeg);
  assert.deepEqual([...h.reservations.keys()], [body.stagingPath]);
  assert.equal(h.published.size, 0);
  assert.equal(h.catalogue.size, 0);
  assert.equal(h.events.includes("copy"), false);
});

test("copy success then DB failure preserves both reserved objects; identical retry commits once", async () => {
  const h = harness(), body = await h.prepare();
  h.failures.publish = true;
  const response = await h.post(body);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /could not be added/);
  assert.equal(h.catalogue.size, 0);
  assert.deepEqual(h.staged.get(body.stagingPath).bytes, jpeg);
  assert.deepEqual(h.published.get(body.storagePath).bytes, jpeg);
  assert.deepEqual([...h.reservations.keys()].sort(), [body.stagingPath, body.storagePath].sort());
  for (const [path, reservation] of h.reservations) {
    assert.equal(reservation.job_storage_path, path);
    assert.equal(reservation.job_storage_provider, "r2");
    assert.equal(reservation.job_operation, "upload");
    assert.ok(Date.parse(reservation.job_not_before) > Date.now());
  }
  assert.equal(h.events.includes("delete-staged"), false);
  assert.equal(h.scheduled.length, 0);
  h.failures.publish = false;
  assert.equal((await h.post(body)).status, 200);
  assert.equal(h.catalogue.size, 1);
  const row = [...h.catalogue.values()][0];
  assert.equal(row.p_storage_path, body.storagePath);
  assert.equal(row.p_filename, body.filename);
  assert.equal(row.p_image_width, 8);
  assert.equal(row.p_image_height, 6);
  assert.equal(h.staged.size, 0);
  assert.deepEqual([...h.reservations.keys()], [body.storagePath]);
  assert.deepEqual(h.published.get(body.storagePath).bytes, jpeg);
});

test("accepted replay after lost response does not download, copy, or insert again", async () => {
  const h = harness(), body = await h.prepare();
  assert.equal((await h.post(body)).status, 200);
  const before = structuredClone([...h.catalogue]);
  const object = h.published.get(body.storagePath);
  h.events.length = 0;
  const response = await h.post(body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, "Photograph published.");
  assert.deepEqual([...h.catalogue], before);
  assert.equal(h.published.size, 1);
  assert.equal(h.published.get(body.storagePath), object);
  assert.equal(h.staged.size, 0);
  assert.deepEqual([...h.reservations.keys()], [body.storagePath]);
  assert.deepEqual(h.events, ["is_admin", "catalogue-read", "delete-staged", "cancel_storage_upload_reservation", "invalidate"]);
});

for (const mismatch of ["filename", "stored path", "staging identity"]) {
  test(`replay denies ${mismatch} mismatch without altering existing publication`, async () => {
    const h = harness(), body = await h.prepare();
    assert.equal((await h.post(body)).status, 200);
    const attempt = { ...body };
    if (mismatch === "filename") attempt.filename = "different.jpg";
    if (mismatch === "stored path") [...h.catalogue.values()][0].p_storage_path = body.storagePath.replace(".jpg", ".png");
    if (mismatch === "staging identity") attempt.stagingPath = `staging/00000000-0000-4000-8000-000000000001.jpg`;
    const before = structuredClone([...h.catalogue]);
    const object = h.published.get(body.storagePath);
    h.events.length = 0;
    assert.equal((await h.post(attempt)).status, mismatch === "staging identity" ? 400 : 409);
    assert.deepEqual([...h.catalogue], before);
    assert.equal(h.published.get(body.storagePath), object);
    assert.equal(h.published.size, 1);
    assert.equal(h.staged.size, 0);
    assert.deepEqual([...h.reservations.keys()], [body.storagePath]);
    assert.deepEqual(h.events, mismatch === "staging identity" ? ["is_admin"] : ["is_admin", "catalogue-read"]);
  });
}
