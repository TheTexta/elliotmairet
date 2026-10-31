import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  attemptReserveUsd, buildRequest, config, digest, exportRun, fetchSnapshot,
  generateOne, imageUrl, ledgerTotal, normalizeSnapshot, parseArgs, parseResult,
  preparePreviews, readJson, reserveAttempt, runCatalogue, safeStoragePath,
  saveJson, selectSample, usageCost, verifyPreview,
} from "./catalogue-run.mjs";

const fields = { title: "Yellow leaves against sky", description: "Yellow leaves and dark branches stand against blue sky.", altText: "Yellow leaves and dark branches against blue sky.", filenameSuggestion: "yellow-leaves-blue-sky.jpg", uncertainties: [] };
const photos = Array.from({ length: 271 }, (_, index) => ({ id: randomUUID(), filename: `photo ${index}.jpg`, storagePath: `uploads/${randomUUID()}.jpg`, width: 3000, height: 2000, textRevision: 0, title: null, description: null, altText: null }));
const snapshot = { formatVersion: 1, photos };
const pilot = { photos: photos.slice(0, 20).map((photo) => ({ filename: photo.filename, pageUrl: `https://elliotmairet.com/gallery/${encodeURIComponent(photo.filename)}` })) };
const freshLedger = () => ({ formatVersion: 1, budgetUsd: 20, attempts: [] });
const manifestFor = (items = photos) => ({ formatVersion: 1, runId: randomUUID(), config, sampleIds: photos.slice(0, 20).map((p) => p.id), photos: items });
const responseResult = (overrides = {}) => ({ id: `resp_${randomUUID()}`, model: config.model, service_tier: "default", status: "completed", usage: { input_tokens: 2000, output_tokens: 1000, output_tokens_details: { reasoning_tokens: 800 } }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fields) }] }], ...overrides });
const offline = async () => { throw new Error("NETWORK DISABLED"); };

async function fixture(t, count = 271) {
  const temporaryBase = process.env.OPENCODE_TMP_DIR ?? os.tmpdir();
  await mkdir(temporaryBase, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryBase, "elliot-sol-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "output");
  for (const folder of ["previews", "responses", "records"]) await mkdir(path.join(output, folder), { recursive: true });
  const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const prepared = await verifyPreview(bytes);
  const items = normalizeSnapshot({ ...snapshot, photos: photos.slice(0, count) }).photos.map((p) => ({ ...p, ...prepared, previewFile: `previews/${p.id}.jpg` }));
  for (const p of items) await writeFile(path.join(output, p.previewFile), bytes);
  const manifest = { ...manifestFor(items), snapshotSha256: digest(JSON.stringify(normalizeSnapshot({ ...snapshot, photos: photos.slice(0, count) }))), pilotPath: path.join(directory, "pilot.json") };
  await saveJson(path.join(output, "manifest.json"), manifest);
  await saveJson(path.join(output, "snapshot.json"), normalizeSnapshot({ ...snapshot, photos: photos.slice(0, count) }));
  await saveJson(path.join(output, "pilot-manifest.json"), pilot);
  const ledger = freshLedger();
  const shared = path.join(directory, ".local/photograph-labeling");
  await mkdir(shared, { recursive: true });
  const ledgerPath = path.join(shared, "sol-spend-ledger.json");
  await saveJson(ledgerPath, ledger);
  return { directory, output, bytes, manifest, ledger, ledgerPath };
}

test("catalogue mode is explicit, strict, prepare-only by default and capped at $20", () => {
  const options = parseArgs(["--catalogue"]);
  assert.equal(options.generate, undefined);
  assert.equal(options.budgetUsd, 20);
  assert.throws(() => parseArgs(["--catalogue", "--skip-uncertain"]), /requires/);
  assert.throws(() => parseArgs(["--catalogue", "--generate", "--skip-uncertain"]), /requires/);
  for (const args of [["--catalogue", "--max-usd=21"], ["--catalogue", "--model=gpt-4.1"], ["--catalogue", "--continue-after-sample"], ["--catalogue", "--output=a", "--output=b"]]) assert.throws(() => parseArgs(args));
});

test("exact Sol request settings, bounded text, no metadata or tools", () => {
  const request = buildRequest(Buffer.from("test JPEG"));
  assert.equal(request.model, "gpt-6.1-sol");
  assert.equal(request.max_output_tokens, 4096);
  assert.deepEqual(request.reasoning, { effort: "low" });
  assert.equal(request.store, false);
  assert.equal(request.service_tier, "default");
  assert.equal(request.tools, undefined);
  assert.equal(request.input[0].content[1].detail, "high");
  assert.match(request.instructions, /at most 2 actionable notes about specific visible ambiguities/);
  assert.match(request.instructions, /Never add boilerplate about unknown location or time/);
  assert.doesNotMatch(JSON.stringify(request), /photo 0|storagePath|OPENAI_API_KEY|sourceCaptionOverride/);
  assert.match(config.promptVersion, /^[a-f0-9]{64}$/);
  assert.match(config.configHash, /^[a-f0-9]{64}$/);
  assert.throws(() => buildRequest(Buffer.alloc(2_000_001)), /bound/);
  const previous = config.promptByteLimit;
  try { config.promptByteLimit = 1; assert.throws(() => buildRequest(Buffer.alloc(0)), /Prompt/); }
  finally { config.promptByteLimit = previous; }
});

test("snapshot freezes all 271 UUID/source/text revisions and classifies existing text manual", () => {
  const normalized = normalizeSnapshot(snapshot);
  assert.equal(normalized.photos.length, 271);
  assert.equal(new Set(normalized.photos.map((p) => p.id)).size, 271);
  assert.equal(normalized.photos[0].baselineOwnership.title, "unset");
  const manual = normalizeSnapshot({ ...snapshot, photos: [{ ...photos[0], title: "Owner text", textSource: "ai" }, ...photos.slice(1)] });
  assert.equal(manual.photos[0].baselineOwnership.title, "manual");
  assert.equal(manual.photos[0].textSource, undefined);
  assert.throws(() => normalizeSnapshot({ ...snapshot, photos: [{ ...photos[0], textRevision: undefined }, ...photos.slice(1)] }), /revision/);
  assert.equal(normalizeSnapshot(snapshot, true).photos[0].textRevision, 0);
  assert.throws(() => normalizeSnapshot({ ...snapshot, photos: [photos[0], ...photos.slice(0, 20)] }), /duplicate/);
  assert.throws(() => normalizeSnapshot({ ...snapshot, photos: [{ ...photos[0], id: "filename-not-uuid" }, ...photos.slice(1)] }), /identity/);
});

test("sample identity comes from preserved pilot URLs, not changed catalogue positions", () => {
  const reversed = [...photos].reverse();
  assert.deepEqual(selectSample(reversed, pilot), photos.slice(0, 20).map((p) => p.id));
  assert.throws(() => selectSample(photos.slice(1), pilot), /missing/);
  assert.throws(() => selectSample(photos, { photos: Array(20).fill(pilot.photos[0]) }), /Duplicate/);
  assert.throws(() => selectSample(photos, { photos: [{ ...pilot.photos[0], pageUrl: "https://evil.test/gallery/photo.jpg" }, ...pilot.photos.slice(1)] }), /identity/);
});

test("storage paths reject encoded traversal, pending at any depth and URL injection", () => {
  for (const unsafe of ["../x", "uploads//x", "/x", "uploads/_pending/x", "uploads/%5fpending/x", "uploads/%252e%252e/x", "uploads/a?secret", "uploads/a#x", "uploads/a\\x", "https://evil.test/x"]) assert.throws(() => safeStoragePath(unsafe));
  const url = new URL(imageUrl("uploads/photo 1.JPG"));
  assert.equal(url.origin, "https://images.dextery.dev");
  assert.equal(url.pathname, "/elliotmairet/uploads/photo%201.JPG");
  assert.equal(url.searchParams.get("width"), "1200");
  assert.equal(url.searchParams.get("quality"), "82");
  assert.equal(url.searchParams.get("format"), "auto");
  assert.equal(config.previewMaxDimension, 1024);
});

test("anonymous catalogue pagination requires stable exact counts, allows only legacy absent columns", async () => {
  let calls = 0;
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://api.dextery.dev", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
  const fetcher = async (url, options) => {
    calls += 1;
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Prefer, "count=exact");
    const parsed = new URL(url);
    const selected = parsed.searchParams.get("select").split(",");
    assert.ok(selected.includes("image_width"));
    assert.ok(selected.includes("image_height"));
    assert.ok(!selected.includes("width") && !selected.includes("height"));
    if (selected.includes("text_revision")) return new Response(JSON.stringify({ code: "42703", message: "column photographs.text_revision does not exist" }), { status: 400 });
    const offset = Number(parsed.searchParams.get("offset"));
    const page = photos.slice(offset, offset + 100).map((p) => ({ id: p.id, filename: p.filename, storage_path: p.storagePath, image_width: p.width, image_height: p.height, title: p.title, alt_text: p.altText }));
    return new Response(JSON.stringify(page), { headers: { "content-range": `${offset}-${offset + page.length - 1}/271` } });
  };
  const result = await fetchSnapshot(env, fetcher);
  assert.equal(calls, 4);
  assert.equal(result.photos.length, 271);
  assert.equal(result.legacyBaseline, true);
  assert.equal(result.photos[0].width, photos[0].width);
  assert.equal(result.photos[0].height, photos[0].height);
  await assert.rejects(fetchSnapshot({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_no" }, offline), /anonymous/);
  await assert.rejects(fetchSnapshot({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://evil.test" }, offline), /origin/);
  await assert.rejects(fetchSnapshot(env, async () => new Response("[]")), /exact count/);
  let index = 0;
  await assert.rejects(fetchSnapshot(env, async () => new Response(JSON.stringify(photos.slice(0, 100)), { headers: { "content-range": `0-99/${++index === 1 ? 271 : 272}` } })), /changed/);
  for (const message of ["column photographs.width does not exist", "column photographs.image_width does not exist", "column photographs.image_height does not exist", "column unrelated.description does not exist", undefined]) {
    let errorCalls = 0;
    await assert.rejects(fetchSnapshot(env, async () => {
      errorCalls += 1;
      return new Response(JSON.stringify({ code: "42703", message }), { status: 400 });
    }), /HTTP 400/);
    assert.equal(errorCalls, 1, "Unrelated or unidentified missing columns must not trigger legacy fallback");
  }
});

test("local previews are bounded JPEG without EXIF and hash checked", async () => {
  const source = await sharp({ create: { width: 1100, height: 1100, channels: 3, background: "red" } }).withMetadata().jpeg().toBuffer();
  await assert.rejects(verifyPreview(source));
  const cleaned = await sharp(source).resize(1024, 1024).jpeg().toBuffer();
  const result = await verifyPreview(cleaned);
  assert.equal(result.previewWidth, 1024);
  await assert.rejects(verifyPreview(cleaned, "0".repeat(64)), /verification/);
});

test("partial preparation is durable and resume reuses only verified bytes", async (t) => {
  const f = await fixture(t, 20);
  const photo = f.manifest.photos[1];
  delete photo.previewSha256;
  const old = pilot.photos.find((p) => p.filename === photo.filename);
  const localPilot = { photos: [{ ...old, sourceImageUrl: `https://images.dextery.dev/elliotmairet/${photo.storagePath}`, previewFile: "previews/01.jpg", previewSha256: digest(f.bytes) }] };
  await mkdir(path.join(f.directory, "previews"));
  await writeFile(path.join(f.directory, "previews/01.jpg"), f.bytes);
  await preparePreviews(f.output, f.manifest, localPilot, f.directory, offline);
  assert.equal(f.manifest.photos[1].previewSha256, digest(f.bytes));
  const onDisk = await readJson(path.join(f.output, "manifest.json"));
  assert.equal(onDisk.photos[1].previewSha256, digest(f.bytes));
  await preparePreviews(f.output, f.manifest, localPilot, f.directory, offline);
  await writeFile(path.join(f.output, photo.previewFile), "corrupted");
  await assert.rejects(preparePreviews(f.output, f.manifest, localPilot, f.directory, offline));
});

test("full Sol context bound covers long input, cache writes and total output reasoning once", () => {
  assert.ok(attemptReserveUsd >= usageCost({ input_tokens: 922000, output_tokens: 4096 }));
  assert.equal(usageCost({ input_tokens: 1000, output_tokens: 1000, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 600 }, output_tokens_details: { reasoning_tokens: 800 } }), 0.0125);
  assert.equal(usageCost({ input_tokens: 300000, output_tokens: 1000 }), 1.515);
  assert.equal(usageCost(null), null);
  assert.equal(usageCost({ input_tokens: -1, output_tokens: 0 }), null);
  assert.equal(usageCost({ input_tokens: 100, output_tokens: 0, input_tokens_details: { cached_tokens: 200 } }), null);
  assert.throws(() => usageCost({ input_tokens: 922001, output_tokens: 0 }), /assumptions/);
});

test("shared budget includes unknown reservations, settles known usage, caps retries across configs", () => {
  const ledger = freshLedger();
  const manifest = manifestFor();
  const entry = reserveAttempt(ledger, photos[0], manifest);
  assert.equal(entry.reservedUsd, attemptReserveUsd);
  assert.throws(() => reserveAttempt(ledger, photos[1], manifest), /Unresolved/);
  entry.status = "retryable";
  const second = reserveAttempt(ledger, photos[0], { ...manifest, runId: randomUUID() });
  second.status = "retryable";
  assert.throws(() => reserveAttempt(ledger, photos[0], manifest), /ceiling/);
  assert.equal(ledgerTotal(ledger), attemptReserveUsd * 2);
  ledger.attempts.push({ photographId: photos[3].id, status: "retryable", reservedUsd: attemptReserveUsd }, { photographId: photos[4].id, status: "retryable", reservedUsd: attemptReserveUsd });
  assert.throws(() => reserveAttempt(ledger, photos[5], manifest), /budget/);
  const sequential = freshLedger();
  for (const photo of photos.slice(0, 20)) {
    const current = reserveAttempt(sequential, photo, manifest);
    current.status = "settled"; current.reservedUsd = 0.0125;
  }
  assert.ok(ledgerTotal(sequential) < 1);
  assert.throws(() => reserveAttempt(sequential, photos[0], manifest), /Already received/);
});

test("refusal and incomplete outputs never become valid drafts; unsafe uncertainty notes rejected", () => {
  assert.equal(parseResult(responseResult()).status, "unreviewed");
  assert.equal(parseResult(responseResult({ output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] })).status, "refused");
  assert.equal(parseResult(responseResult({ status: "incomplete" })).status, "incomplete");
  assert.equal(parseResult(responseResult({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ...fields, uncertainties: ["First ambiguity", "Second ambiguity", "Third ambiguity"] }) }] }] })).status, "invalid");
  assert.equal(parseResult(responseResult({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ...fields, uncertainties: ["<script>"] }) }] }] })).status, "invalid");
});

test("response persistence precedes parsing; missing usage cannot replay or release reservation", async (t) => {
  const f = await fixture(t, 20);
  const result = responseResult({ usage: null });
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    const persisted = await readJson(f.ledgerPath);
    assert.equal(persisted.attempts[0].status, "pending");
    assert.equal(persisted.attempts[0].reservedUsd, attemptReserveUsd);
    return new Response(JSON.stringify(result));
  };
  await assert.rejects(generateOne(f.manifest.photos[0], f.output, f.manifest, f.ledger, f.ledgerPath, 20, { OPENAI_API_KEY: "test" }, fakeFetch), /usage/);
  const entry = (await readJson(f.ledgerPath)).attempts[0];
  assert.equal(entry.status, "received");
  assert.equal(entry.reservedUsd, attemptReserveUsd);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.output, entry.responseFile), "utf8")), result);
  await assert.rejects(generateOne(f.manifest.photos[0], f.output, f.manifest, f.ledger, f.ledgerPath, 20, { OPENAI_API_KEY: "test" }, fakeFetch), /Unresolved/);
  assert.equal(calls, 1);
});

test("timeouts, malformed responses, unexpected tier and incomplete results stop safely", async (t) => {
  for (const scenario of ["timeout", "malformed", "tier", "incomplete"]) {
    const f = await fixture(t, 20);
    const fakeFetch = async () => {
      if (scenario === "timeout") throw new Error("credential fragments never forwarded");
      if (scenario === "malformed") return new Response("{partial-json");
      return new Response(JSON.stringify(responseResult(scenario === "tier" ? { service_tier: "priority" } : { status: "incomplete" })));
    };
    if (scenario === "incomplete") {
      const record = await generateOne(f.manifest.photos[0], f.output, f.manifest, f.ledger, f.ledgerPath, 20, { OPENAI_API_KEY: "test" }, fakeFetch);
      assert.equal(record.status, "incomplete");
      assert.equal(record.fields, undefined);
      const exported = await exportRun(f.output, f.manifest, f.ledger);
      assert.equal(exported.summary.validDrafts, 0);
      assert.equal((await readJson(path.join(f.output, "drafts.json"))).records.length, 0);
    } else await assert.rejects(generateOne(f.manifest.photos[0], f.output, f.manifest, f.ledger, f.ledgerPath, 20, { OPENAI_API_KEY: "test" }, fakeFetch), /uncertain|JSON|tier/);
    const entry = (await readJson(f.ledgerPath)).attempts[0];
    if (scenario !== "incomplete") assert.equal(entry.reservedUsd, attemptReserveUsd);
    assert.ok(await readFile(path.join(f.output, entry.responseFile)));
  }
});

test("prepare-only and completed full catalogue resume are network-disabled; draft contract and safe exports", async (t) => {
  const f = await fixture(t);
  const dependencies = { repositoryRoot: f.directory, ledgerRoot: f.directory, env: {}, fetcher: offline };
  const prepared = await runCatalogue({ output: f.output, budgetUsd: 20 }, dependencies);
  assert.equal(prepared.prepared, 271);
  assert.equal(prepared.accounted, 0);
  await assert.rejects(runCatalogue({ output: f.output, generate: true, "continue-after-sample": true }, dependencies), /20 valid/);
  // Simulate previously completed provider calls with persisted exact raw bodies,
  // checkpoints and shared ledger; actual tests never call a network endpoint.
  for (const photo of f.manifest.photos) {
    const result = responseResult();
    const responseFile = `responses/${randomUUID()}.raw`;
    const raw = JSON.stringify(result);
    await writeFile(path.join(f.output, responseFile), raw);
    const record = { photographId: photo.id, filename: photo.filename, storagePath: photo.storagePath, width: photo.width, height: photo.height, textRevision: photo.textRevision, previewSha256: photo.previewSha256, previewFile: photo.previewFile, fields, responseId: result.id, model: config.model, usage: result.usage, responseFile, originalModelOutput: result.output, approved: false, status: "unreviewed" };
    await saveJson(path.join(f.output, `records/${photo.id}.json`), record);
    f.ledger.attempts.push({ attemptId: randomUUID(), runId: f.manifest.runId, photographId: photo.id, responseId: result.id, responseFile, rawSha256: digest(raw), reservedUsd: usageCost(result.usage), estimatedUsd: usageCost(result.usage), status: "settled" });
  }
  await saveJson(f.ledgerPath, f.ledger);
  const completed = await runCatalogue({ output: f.output, generate: true, "continue-after-sample": true }, dependencies);
  assert.equal(completed.accounted, 271);
  assert.equal(completed.validDrafts, 271);
  const drafts = await readJson(path.join(f.output, "drafts.json"));
  assert.equal(drafts.formatVersion, 1);
  assert.equal(drafts.runId, f.manifest.runId);
  assert.equal(drafts.config.model, "gpt-6.1-sol");
  assert.equal(drafts.records[0].approved, false);
  assert.deepEqual(drafts.records[0].originalModelOutput, responseResult().output);
  const review = await readFile(path.join(f.output, "REVIEW.html"), "utf8");
  assert.match(review, /Not approved or published/);
  assert.match(review, /default-src 'none'/);
  assert.doesNotMatch(review, /<script>/);
  assert.ok((await readFile(path.join(f.output, "drafts.csv"), "utf8")).includes("photographId"));
  await writeFile(path.join(f.output, f.ledger.attempts[0].responseFile), "changed");
  await assert.rejects(runCatalogue({ output: f.output, generate: true }, dependencies), /Raw response identity/);
});

test("output/config changes cannot reset central ledger; lock excludes simultaneous writers", async (t) => {
  const f = await fixture(t, 20);
  const entry = reserveAttempt(f.ledger, f.manifest.photos[0], f.manifest);
  entry.status = "uncertain";
  await saveJson(f.ledgerPath, f.ledger);
  await assert.rejects(runCatalogue({ output: f.output, generate: true }, { repositoryRoot: f.directory, ledgerRoot: f.directory, env: {}, fetcher: offline }), /Unresolved/);
  await writeFile(`${f.ledgerPath}.lock`, "owner");
  await assert.rejects(runCatalogue({ output: path.join(f.directory, "different-output") }, { repositoryRoot: f.directory, ledgerRoot: f.directory, env: {}, fetcher: offline }), /lock exists/);
  assert.equal((await readJson(f.ledgerPath)).attempts[0].reservedUsd, attemptReserveUsd);
});

test("generation stops at the same 20 sample photos and only explicit later continuation reaches the rest", async (t) => {
  const f = await fixture(t, 21);
  let calls = 0;
  const fakeFetch = async (url) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    calls += 1;
    return new Response(JSON.stringify(responseResult()));
  };
  const dependencies = { repositoryRoot: f.directory, ledgerRoot: f.directory, env: { OPENAI_API_KEY: "offline-test" }, fetcher: fakeFetch };
  const sample = await runCatalogue({ output: f.output, generate: true }, dependencies);
  assert.equal(calls, 20);
  assert.equal(sample.accounted, 20);
  await runCatalogue({ output: f.output, generate: true }, { ...dependencies, env: {}, fetcher: offline });
  assert.equal(calls, 20);
  const rest = await runCatalogue({ output: f.output, generate: true, "continue-after-sample": true }, dependencies);
  assert.equal(calls, 21);
  assert.equal(rest.accounted, 21);
});

test("fresh explicit snapshot prepares locally; failed download preserves earlier preparation", async (t) => {
  const f = await fixture(t, 20);
  const output = path.join(f.directory, "fresh-run");
  const snapshotPath = path.join(f.directory, "admin-export.json");
  const pilotPath = path.join(f.directory, "pilot.json");
  await saveJson(snapshotPath, { ...snapshot, photos: photos.slice(0, 20) });
  await saveJson(pilotPath, pilot);
  let calls = 0;
  const fakeFetch = async (url, options) => {
    assert.equal(new URL(url).origin, "https://images.dextery.dev");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, undefined);
    calls += 1;
    if (calls === 2) throw new Error("download disconnected");
    return new Response(f.bytes);
  };
  const options = { output, snapshot: snapshotPath, "pilot-manifest": pilotPath };
  await assert.rejects(runCatalogue(options, { repositoryRoot: f.directory, ledgerRoot: f.directory, env: {}, fetcher: fakeFetch }), /disconnected/);
  const partial = await readJson(path.join(output, "manifest.json"));
  assert.equal(partial.photos.filter((p) => p.previewSha256).length, 1);
  assert.equal((await readJson(f.ledgerPath)).attempts.length, 0);
  const resumed = await runCatalogue(options, { repositoryRoot: f.directory, ledgerRoot: f.directory, env: {}, fetcher: async () => new Response(f.bytes) });
  assert.equal(resumed.prepared, 20);
  assert.equal(resumed.accounted, 0);
});

test("explicit continuation skips uncertain photo, retains its full hold, and never replays it", async (t) => {
  const f = await fixture(t, 23);
  let calls = 0;
  const dependencies = { repositoryRoot: f.directory, ledgerRoot: f.directory, env: { OPENAI_API_KEY: "offline-test" },
    fetcher: async () => { calls++; return Response.json(responseResult()); } };
  await runCatalogue({ output: f.output, generate: true }, dependencies);
  const ledger = await readJson(f.ledgerPath);
  const held = reserveAttempt(ledger, f.manifest.photos[20], f.manifest);
  held.status = "uncertain";
  const original = structuredClone(held);
  await saveJson(f.ledgerPath, ledger);
  const options = { output: f.output, generate: true, "continue-after-sample": true };
  await assert.rejects(runCatalogue(options, dependencies), /Unresolved/);
  const summary = await runCatalogue({ ...options, "skip-uncertain": true }, dependencies);
  assert.equal(calls, 22);
  assert.equal(summary.accounted, 22);
  assert.equal(summary.unresolved, 1);
  const after = await readJson(f.ledgerPath);
  assert.deepEqual(after.attempts.find(entry => entry.attemptId === held.attemptId), original);
  assert.equal(after.attempts.filter(entry => entry.photographId === held.photographId).length, 1);
  assert.ok(ledgerTotal(after) >= attemptReserveUsd);
  assert.equal((await readJson(path.join(f.output, "continuation-approvals.json")))[0].heldAttempts[0].attemptId, held.attemptId);
  await runCatalogue({ ...options, "skip-uncertain": true }, { ...dependencies, env: {}, fetcher: offline });
  assert.throws(() => reserveAttempt(after, f.manifest.photos[20], f.manifest, 20, { skipUncertain: true }), /Already received/);
});

test("uncertain-skip authority cannot bypass budget or a received/unparsed response", () => {
  const ledger = freshLedger();
  ledger.attempts = photos.slice(0, 4).map(photo => ({ photographId: photo.id, status: "uncertain", reservedUsd: attemptReserveUsd }));
  assert.throws(() => reserveAttempt(ledger, photos[4], manifestFor(), 20, { skipUncertain: true }), /budget exhausted/);
  ledger.attempts = [{ photographId: photos[0].id, status: "received", reservedUsd: attemptReserveUsd }];
  assert.throws(() => reserveAttempt(ledger, photos[4], manifestFor(), 20, { skipUncertain: true }), /Unresolved/);
});
