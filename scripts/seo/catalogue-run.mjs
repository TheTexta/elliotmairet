import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildRequest as pilotRequest, csvCell, validateDraft } from "./label-photographs.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{64}$/;
export const digest = (value) => createHash("sha256").update(value).digest("hex");
const additionalInstructions = " Do not infer time of day, clothing material, roles, rivers, or events from ambiguous visual evidence. Use broad visible descriptions. For this run uncertainties must contain at most 2 actionable notes about specific visible ambiguities; return [] when none are actionable. Never add boilerplate about unknown location or time. No filenames, EXIF, existing captions, or other source metadata are supplied.";
const template = pilotRequest(Buffer.alloc(0));
template.instructions += additionalInstructions;
export const promptVersion = digest(template.instructions + JSON.stringify(template.text.format));
// Do not assume GPT-4.1 tile pricing, nor an undocumented Sol patch multiplier.
// Reserve the ENTIRE documented Sol maximum input (922,000 tokens), at the
// >272K long-context cache-write rate ($2.5 * 2), plus 4096 total output
// tokens at $10 * 1.5. Rounded UP. This deliberately loose bound does not
// depend on JPEG compression or a guessed image tokenizer. Sequential known
// usage settlement makes later sample requests affordable; unknown usage stops.
// Sources checked 2026-10-30: /api/docs/models/gpt-6.1-sol and
// /api/docs/guides/images-vision at https://developers.openai.com.
export const attemptReserveUsd = 4.68;
export const config = {
  model: "gpt-6.1-sol", promptVersion, reasoningEffort: "low", imageDetail: "high",
  serviceTier: "default", store: false, maxOutputTokens: 4096, concurrency: 1,
  previewMaxDimension: 1024, schemaVersion: 1, maxInputTokens: 922000,
  // Use the shared Worker's existing allowlisted transform, then bound locally.
  sourceTransform: { width: 1200, quality: 82, format: "auto" },
  promptByteLimit: 10000, attemptReserveUsd,
  rates: { input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10 },
};
config.configHash = digest(JSON.stringify(config));

export function buildRequest(preview) {
  if (!Buffer.isBuffer(preview) || preview.length > 2_000_000) throw new Error("Preview byte bound exceeded.");
  const request = pilotRequest(preview);
  request.instructions += additionalInstructions;
  if (Buffer.byteLength(JSON.stringify({ instructions: request.instructions, input: request.input[0].content[0], text: request.text })) > config.promptByteLimit) throw new Error("Prompt exceeds reservation bounds.");
  return { ...request, model: config.model, max_output_tokens: 4096, reasoning: { effort: "low" } };
}

export function safeStoragePath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || /[%\\?#\x00-\x1f\x7f]/.test(value)) throw new Error("Unsafe storage path.");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment === "_pending")) throw new Error("Unsafe storage path.");
  return value;
}

export function imageUrl(storagePath) {
  return `https://images.dextery.dev/elliotmairet/${safeStoragePath(storagePath).split("/").map(encodeURIComponent).join("/")}?width=1200&quality=82&format=auto`;
}

export function normalizeSnapshot(snapshot, legacy = false) {
  if (snapshot?.formatVersion !== 1 || !Array.isArray(snapshot.photos) || snapshot.photos.length < 20 || snapshot.photos.length > 10000) throw new Error("Invalid catalogue snapshot envelope/count.");
  const ids = new Set();
  const filenames = new Set();
  const photos = snapshot.photos.map((photo) => {
    if (!uuid.test(photo.id) || ids.has(photo.id) || typeof photo.filename !== "string" || !photo.filename || /[/\\\x00-\x1f]/.test(photo.filename) || filenames.has(photo.filename)) throw new Error("Invalid or duplicate catalogue identity.");
    ids.add(photo.id); filenames.add(photo.filename);
    safeStoragePath(photo.storagePath);
    if (![photo.width, photo.height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 100000)) throw new Error("Invalid source dimensions.");
    const textRevision = legacy ? 0 : photo.textRevision;
    if (!Number.isSafeInteger(textRevision) || textRevision < 0) throw new Error("Snapshot requires a text revision.");
    const result = { id: photo.id, filename: photo.filename, storagePath: photo.storagePath, width: photo.width, height: photo.height, textRevision };
    result.baselineOwnership = {};
    for (const field of ["title", "description", "altText"]) {
      const value = photo[field] ?? null;
      if (value !== null && (typeof value !== "string" || value.length > 10000)) throw new Error("Invalid snapshot text.");
      result[field] = value;
      // Advisory only: importer MUST use database ownership/revisions, never this.
      result.baselineOwnership[field] = value?.trim() ? "manual" : "unset";
    }
    return result;
  });
  return { formatVersion: 1, legacyBaseline: legacy, photos };
}

export function selectSample(photos, pilot) {
  if (!Array.isArray(pilot?.photos) || pilot.photos.length !== 20) throw new Error("Provide the preserved 20-photo pilot manifest with --pilot-manifest=JSON.");
  const selected = pilot.photos.map((old) => {
    const url = new URL(old.pageUrl);
    if (url.origin !== "https://elliotmairet.com" || url.username || url.password || url.search || url.hash || !url.pathname.startsWith("/gallery/")) throw new Error("Invalid pilot page identity.");
    const filename = decodeURIComponent(url.pathname.slice("/gallery/".length));
    const photo = photos.find((candidate) => candidate.filename === filename);
    if (!photo || old.filename !== filename) throw new Error("Pilot photograph missing/changed; reconcile sample identity.");
    return photo.id;
  });
  if (new Set(selected).size !== 20) throw new Error("Duplicate sample identity.");
  return selected;
}

export async function readBounded(response, limit, onChunk) {
  let length = 0;
  const chunks = [];
  for await (const value of response.body) {
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > limit) throw new Error("Response byte bound exceeded.");
    if (onChunk) await onChunk(chunk);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function anonymousKey(value) {
  if (typeof value !== "string" || !value) throw new Error("Public Supabase key missing.");
  if (value.startsWith("sb_publishable_")) return value;
  try {
    if (JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString()).role === "anon") return value;
  } catch { /* no key content in diagnostics */ }
  throw new Error("Only a public anonymous/publishable Supabase key is permitted.");
}

export async function fetchSnapshot(env, fetcher = fetch) {
  const base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  if (base.origin !== "https://api.dextery.dev" || base.pathname !== "/" || base.search || base.hash || base.username || base.password) throw new Error("Unexpected public catalogue origin.");
  const key = anonymousKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  let legacy = false;
  let total;
  const photos = [];
  while (total === undefined || photos.length < total) {
    const fields = "id,filename,storage_path,image_width,image_height,title,alt_text" + (legacy ? "" : ",description,text_revision");
    const url = new URL("/rest/v1/photographs", base);
    url.search = new URLSearchParams({ select: fields, order: "id.asc", offset: String(photos.length), limit: "100" }).toString();
    const response = await fetcher(url.href, { redirect: "error", signal: AbortSignal.timeout(30000), headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Accept: "application/json" } });
    const bytes = await readBounded(response, 4_000_000);
    if (!response.ok) {
      let missingTextColumn = false;
      try {
        const error = JSON.parse(bytes);
        missingTextColumn = error.code === "42703" && typeof error.message === "string" && /^column (?:(?:"?public"?\.)?"?photographs"?\.)?"?(?:description|text_revision)"? does not exist$/.test(error.message);
      } catch { /* sanitized failure below */ }
      if (!legacy && photos.length === 0 && response.status === 400 && missingTextColumn) { legacy = true; continue; }
      throw new Error(`Anonymous catalogue read failed (HTTP ${response.status}).`);
    }
    const count = Number(response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(count) || count < 20 || count > 10000 || total !== undefined && count !== total) throw new Error("Catalogue exact count missing or changed.");
    total = count;
    const page = JSON.parse(bytes);
    if (!Array.isArray(page) || page.length === 0 || photos.length + page.length > total) throw new Error("Catalogue pagination/count mismatch.");
    photos.push(...page.map((photo) => ({ id: photo.id, filename: photo.filename, storagePath: photo.storage_path, width: photo.image_width, height: photo.image_height, title: photo.title, altText: photo.alt_text, description: photo.description, textRevision: photo.text_revision })));
  }
  return normalizeSnapshot({ formatVersion: 1, photos }, legacy);
}

// fsync data and containing directory before considering checkpoints durable.
export async function atomicWrite(filename, bytes) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, filename);
  const directory = await open(path.dirname(filename), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
export const saveJson = (filename, value) => atomicWrite(filename, JSON.stringify(value, null, 2) + "\n");
export async function readJson(filename) {
  let text;
  try { text = await readFile(filename, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw new Error("Cannot read local JSON checkpoint."); }
  try { return JSON.parse(text); } catch { throw new Error("Invalid local JSON; contents omitted from diagnostics."); }
}

async function withLock(filename, action) {
  const lock = await open(filename, "wx", 0o600).catch(() => { throw new Error("Run/spend lock exists; inspect interrupted process before removing it."); });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.sync();
    return await action();
  } finally { await lock.close(); await unlink(filename); }
}

export async function verifyPreview(bytes, expectedHash) {
  const metadata = await sharp(bytes, { limitInputPixels: 1024 * 1024 }).metadata();
  if (bytes.length > 2_000_000 || metadata.format !== "jpeg" || !metadata.width || !metadata.height || metadata.width > 1024 || metadata.height > 1024 || metadata.exif || metadata.xmp || metadata.iptc || (metadata.pages ?? 1) !== 1 || expectedHash && digest(bytes) !== expectedHash) throw new Error("Preview identity/dimensions/metadata verification failed.");
  return { previewSha256: digest(bytes), previewWidth: metadata.width, previewHeight: metadata.height, previewBytes: bytes.length };
}

function sourcePathFromPilot(old) {
  const url = new URL(old.sourceImageUrl);
  if (url.origin !== "https://images.dextery.dev" || url.username || url.password || !url.pathname.startsWith("/elliotmairet/") || url.hash) throw new Error("Unapproved pilot image origin.");
  return safeStoragePath(decodeURIComponent(url.pathname.slice("/elliotmairet/".length)));
}

export async function preparePreviews(output, manifest, pilot, pilotDirectory, fetcher = fetch) {
  for (const photo of manifest.photos) {
    const previewFile = `previews/${photo.id}.jpg`;
    if (photo.previewSha256) {
      if (photo.previewFile !== previewFile || !sha.test(photo.previewSha256)) throw new Error("Unsafe saved preview identity/path.");
      await verifyPreview(await readFile(path.join(output, previewFile)), photo.previewSha256);
      continue;
    }
    const old = pilot.photos.find((candidate) => candidate.filename === photo.filename);
    let bytes;
    if (old && sha.test(old.previewSha256 ?? "") && sourcePathFromPilot(old) === photo.storagePath &&
      // Old pilot lacks original dimensions. Match immutable full storage path,
      // filename/URL identity and recorded bytes; never reuse by filename alone.
      decodeURIComponent(new URL(old.pageUrl).pathname.slice("/gallery/".length)) === photo.filename) {
      if (!/^previews\/[a-zA-Z0-9-]+\.jpg$/.test(old.previewFile)) throw new Error("Unsafe pilot preview path.");
      bytes = await readFile(path.join(pilotDirectory, old.previewFile));
      await verifyPreview(bytes, old.previewSha256);
    } else {
      const response = await fetcher(imageUrl(photo.storagePath), { redirect: "error", signal: AbortSignal.timeout(30000), headers: { Accept: "image/jpeg" } });
      if (!response.ok) throw new Error(`Preview download HTTP ${response.status}.`);
      const source = await readBounded(response, 8_000_000);
      bytes = await sharp(source, { limitInputPixels: 36_000_000 }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    }
    const verified = await verifyPreview(bytes);
    await atomicWrite(path.join(output, previewFile), bytes);
    Object.assign(photo, verified, { previewFile });
    await saveJson(path.join(output, "manifest.json"), manifest);
  }
}

export function usageCost(usage) {
  if (!usage || ![usage.input_tokens, usage.output_tokens].every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
  if (usage.input_tokens > config.maxInputTokens || usage.output_tokens > config.maxOutputTokens) throw new Error("Usage exceeds reservation assumptions; reconcile billing.");
  const details = usage.input_tokens_details ?? {};
  // Charge each input token ONCE at at least the cache-write rate. Unknown
  // breakdowns cannot hide writes; reads receive no speculative discount.
  for (const key of ["cached_tokens", "cache_write_tokens", "cache_creation_tokens"]) {
    if (details[key] !== undefined && (!Number.isSafeInteger(details[key]) || details[key] < 0 || details[key] > usage.input_tokens)) return null;
  }
  const long = usage.input_tokens > 272000;
  return (usage.input_tokens * config.rates.cacheWrite * (long ? 2 : 1) + usage.output_tokens * config.rates.output * (long ? 1.5 : 1)) / 1_000_000;
}

export function ledgerTotal(ledger) {
  return ledger.attempts.reduce((sum, entry) => {
    if (!Number.isFinite(entry.reservedUsd) || entry.reservedUsd < 0 || entry.reservedUsd > attemptReserveUsd) throw new Error("Invalid spend ledger reservation.");
    return sum + entry.reservedUsd;
  }, 0);
}

export function reserveAttempt(ledger, photo, manifest, budgetUsd = 20, { skipUncertain = false } = {}) {
  if (ledger.formatVersion !== 1 || ledger.budgetUsd !== 20 || !Array.isArray(ledger.attempts)) throw new Error("Invalid shared Sol spend ledger.");
  if (ledger.attempts.some((entry) => entry.status !== "settled" && entry.status !== "retryable" && !(skipUncertain && entry.status === "uncertain"))) throw new Error("Unresolved/received request; reconcile before any new request.");
  const prior = ledger.attempts.filter((entry) => entry.photographId === photo.id);
  if (prior.length >= 2) throw new Error("Per-photo attempt ceiling reached across outputs/configurations.");
  if (prior.some((entry) => entry.status !== "retryable")) throw new Error("Already received photograph; do not regenerate across outputs/configurations.");
  if (ledgerTotal(ledger) + attemptReserveUsd > Math.min(20, budgetUsd) + 1e-9) throw new Error("Shared conservative budget exhausted.");
  const entry = { attemptId: randomUUID(), runId: manifest.runId, configHash: config.configHash, photographId: photo.id, status: "pending", reservedUsd: attemptReserveUsd, startedAt: new Date().toISOString() };
  ledger.attempts.push(entry);
  return entry;
}

export function parseResult(result) {
  const contents = (result.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (contents.some((item) => item.type === "refusal")) return { status: "refused" };
  if (result.status !== "completed") return { status: "incomplete" };
  try {
    const text = contents.filter((item) => item.type === "output_text").map((item) => item.text).join("");
    const fields = validateDraft(JSON.parse(text));
    if (fields.uncertainties.length > 2 || fields.uncertainties.some((note) => /[<>\x00-\x1f]/.test(note))) throw new Error("Invalid actionable uncertainty notes.");
    return { status: "unreviewed", fields };
  } catch { return { status: "invalid" }; }
}

export async function generateOne(photo, output, manifest, ledger, ledgerPath, budgetUsd, env, fetcher = fetch, { skipUncertain = false } = {}) {
  const preview = await readFile(path.join(output, photo.previewFile));
  await verifyPreview(preview, photo.previewSha256);
  const body = JSON.stringify(buildRequest(preview));
  const entry = reserveAttempt(ledger, photo, manifest, budgetUsd, { skipUncertain });
  await saveJson(ledgerPath, ledger);
  const responseFile = `responses/${entry.attemptId}.raw`;
  const raw = await open(path.join(output, responseFile), "wx", 0o600);
  let response;
  let bytes;
  try {
    response = await fetcher("https://api.openai.com/v1/responses", { method: "POST", redirect: "error", signal: AbortSignal.timeout(120000), headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, "Content-Type": "application/json" }, body });
    // Persist even malformed/partial response bytes BEFORE parsing. No request
    // bodies, credentials, or provider error text are echoed to terminal.
    bytes = await readBounded(response, 2_000_000, async (chunk) => { await raw.writeFile(chunk); await raw.sync(); });
  } catch {
    entry.status = "uncertain";
    entry.responseFile = responseFile;
    await saveJson(ledgerPath, ledger);
    throw new Error("Request uncertain; partial raw response retained. No automatic replay.");
  } finally { await raw.close(); }
  entry.httpStatus = response.status;
  entry.responseFile = responseFile;
  entry.rawSha256 = digest(bytes);
  entry.status = "received";
  await saveJson(ledgerPath, ledger);
  let result;
  try { result = JSON.parse(bytes); } catch { throw new Error("Invalid response JSON retained; reconcile before resuming."); }
  entry.responseId = typeof result.id === "string" ? result.id : null;
  entry.usage = result.usage ?? null;
  await saveJson(ledgerPath, ledger);
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}; raw response retained, no automatic retry. Reconcile usage first.`);
  if (result.model !== config.model || result.service_tier !== "default" || !entry.responseId) throw new Error("Unexpected model/tier/identity; stop for pricing review.");
  const estimatedUsd = usageCost(result.usage);
  if (estimatedUsd === null || estimatedUsd > attemptReserveUsd) throw new Error("Missing/untrusted usage; retain full reserve and reconcile.");
  const parsed = parseResult(result);
  const record = { photographId: photo.id, filename: photo.filename, storagePath: photo.storagePath, width: photo.width, height: photo.height, textRevision: photo.textRevision, previewSha256: photo.previewSha256, previewFile: photo.previewFile, ...parsed, responseId: result.id, model: result.model, usage: result.usage, responseFile, originalModelOutput: result.output, approved: false };
  // Record first, then settle: a crash leaves a conservative received entry,
  // never a freed reservation that permits blind replay.
  await saveJson(path.join(output, `records/${photo.id}.json`), record);
  entry.estimatedUsd = estimatedUsd;
  entry.reservedUsd = estimatedUsd;
  entry.status = "settled";
  entry.resultStatus = parsed.status;
  await saveJson(ledgerPath, ledger);
  return record;
}

const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export async function exportRun(output, manifest, ledger) {
  const allRecords = [];
  for (const photo of manifest.photos) {
    const record = await readJson(path.join(output, `records/${photo.id}.json`));
    if (record) {
      if (record.photographId !== photo.id || record.previewSha256 !== photo.previewSha256 || record.storagePath !== photo.storagePath || record.textRevision !== photo.textRevision || record.width !== photo.width || record.height !== photo.height || record.filename !== photo.filename || record.model !== config.model || record.approved !== false || typeof record.responseId !== "string") throw new Error("Checkpoint identity mismatch.");
      allRecords.push(record);
    }
  }
  const records = allRecords.filter((record) => record.status === "unreviewed");
  for (const record of records) validateDraft(record.fields);
  // Keep the import boundary minimal; full generation/pricing settings remain
  // in the immutable manifest identified by this configuration hash.
  await saveJson(path.join(output, "drafts.json"), { formatVersion: 1, runId: manifest.runId, config: { model: config.model, promptVersion, configHash: config.configHash }, records });
  await saveJson(path.join(output, "outcomes.json"), { formatVersion: 1, runId: manifest.runId, records: allRecords });
  const columns = ["photographId", "filename", "title", "description", "altText", "filenameSuggestion", "uncertainties", "status", "responseId", "previewSha256"];
  await atomicWrite(path.join(output, "drafts.csv"), [columns.join(","), ...allRecords.map((record) => columns.map((column) => csvCell(record.fields?.[column] ?? record[column])).join(","))].join("\r\n") + "\r\n");
  const summary = { runId: manifest.runId, model: config.model, catalogueCount: manifest.photos.length, sampleCount: manifest.sampleIds.length, prepared: manifest.photos.filter((p) => p.previewSha256).length, accounted: allRecords.length, validDrafts: records.length, refused: allRecords.filter((r) => r.status === "refused").length, incomplete: allRecords.filter((r) => r.status === "incomplete").length, invalid: allRecords.filter((r) => r.status === "invalid").length, sharedCommittedAndReservedUsd: ledgerTotal(ledger), sharedKnownUsageUsd: ledger.attempts.reduce((sum, entry) => sum + (entry.estimatedUsd ?? 0), 0), unresolved: ledger.attempts.filter((entry) => entry.status !== "settled").length, budgetUsd: 20, productionWrites: false, approved: false };
  await saveJson(path.join(output, "usage-ledger.json"), ledger);
  await saveJson(path.join(output, "summary.json"), summary);
  await atomicWrite(path.join(output, "REVIEW.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'"><title>Sol catalogue draft review</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:24px auto;padding:16px}article{border-top:1px solid;padding:24px 0;overflow-wrap:anywhere}img{max-width:100%;max-height:65vh}pre{white-space:pre-wrap}</style><h1>Private Sol draft review</h1><p>Not approved or published. Filename suggestions never rename objects. Review sample before explicitly continuing.</p><pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>${manifest.photos.map((photo) => {
    const record = allRecords.find((r) => r.photographId === photo.id);
    return `<article><h2>${escapeHtml(photo.filename)}</h2><p>${manifest.sampleIds.includes(photo.id) ? "SAMPLE · " : ""}${escapeHtml(record?.status ?? "not generated")}</p>${photo.previewSha256 ? `<img src="previews/${photo.id}.jpg" alt="Private review preview" loading="lazy">` : ""}<pre>${escapeHtml(JSON.stringify(record?.fields ?? {}, null, 2))}</pre><p>Baseline (advisory; import rechecks database): ${escapeHtml(JSON.stringify({ title: photo.title, description: photo.description, altText: photo.altText }))}</p></article>`;
  }).join("\n")}</html>`);
  return { records: allRecords, summary };
}

export function parseArgs(args) {
  const flags = new Set(["--catalogue", "--generate", "--continue-after-sample", "--skip-uncertain"]);
  const values = new Set(["--output", "--snapshot", "--pilot-manifest", "--max-usd"]);
  const seen = new Set();
  const options = {};
  for (const arg of args) {
    const split = arg.indexOf("=");
    const key = split < 0 ? arg : arg.slice(0, split);
    if (seen.has(key) || !(split < 0 ? flags.has(key) : values.has(key)) || split >= 0 && !arg.slice(split + 1)) throw new Error("Usage: --catalogue [--snapshot=JSON] [--pilot-manifest=JSON] [--output=DIR] [--generate] [--continue-after-sample] [--max-usd=20]");
    seen.add(key); options[key.slice(2)] = split < 0 ? true : arg.slice(split + 1);
  }
  options.budgetUsd = Number(options["max-usd"] ?? 20);
  if (!Number.isFinite(options.budgetUsd) || options.budgetUsd <= 0 || options.budgetUsd > 20) throw new Error("Fresh Sol budget is capped at US$20.");
  if (options["continue-after-sample"] && !options.generate) throw new Error("Continuation requires --generate after sample review.");
  if (options["skip-uncertain"] && (!options.generate || !options["continue-after-sample"])) throw new Error("Skipping uncertain photos requires explicit paid catalogue continuation approval.");
  return options;
}

async function commonRepositoryRoot() {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  return realpath(path.resolve(root, common, ".."));
}

export async function runCatalogue(options, { repositoryRoot = root, ledgerRoot = repositoryRoot, env = process.env, fetcher = fetch } = {}) {
  const local = path.join(repositoryRoot, ".local/photograph-labeling");
  const output = path.resolve(options.output ?? path.join(local, "2026-10-30-catalogue-gpt-6.1-sol-v2"));
  const shared = path.join(ledgerRoot, ".local/photograph-labeling");
  const ledgerPath = path.join(shared, "sol-spend-ledger.json");
  await mkdir(shared, { recursive: true, mode: 0o700 });
  await mkdir(output, { recursive: true, mode: 0o700 });
  return withLock(`${ledgerPath}.lock`, () => withLock(path.join(output, ".lock"), async () => {
    for (const dir of ["previews", "responses", "records"]) await mkdir(path.join(output, dir), { recursive: true, mode: 0o700 });
    const ledger = await readJson(ledgerPath) ?? { formatVersion: 1, budgetUsd: 20, attempts: [] };
    if (ledger.formatVersion !== 1 || ledger.budgetUsd !== 20 || !Array.isArray(ledger.attempts)) throw new Error("Invalid shared spend ledger.");
    ledgerTotal(ledger);
    await saveJson(ledgerPath, ledger);
    let manifest = await readJson(path.join(output, "manifest.json"));
    if (!manifest) {
      const pilotPath = path.resolve(options["pilot-manifest"] ?? path.join(local, "2026-10-30-pilot-gpt-4.1/manifest.json"));
      const pilot = await readJson(pilotPath);
      if (!pilot) throw new Error("Preserved pilot manifest required for identical sample selection.");
      const snapshot = options.snapshot ? normalizeSnapshot(await readJson(path.resolve(options.snapshot))) : await fetchSnapshot(env, fetcher);
      const sampleIds = selectSample(snapshot.photos, pilot);
      manifest = { formatVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(), config, snapshotSha256: digest(JSON.stringify(snapshot)), legacyBaseline: snapshot.legacyBaseline, sampleIds, pilotPath, photos: snapshot.photos };
      await saveJson(path.join(output, "snapshot.json"), snapshot);
      await saveJson(path.join(output, "pilot-manifest.json"), pilot);
      await saveJson(path.join(output, "manifest.json"), manifest);
    }
    if (!uuid.test(manifest.runId) || manifest.config?.configHash !== config.configHash || digest(JSON.stringify((await readJson(path.join(output, "snapshot.json"))))) !== manifest.snapshotSha256) throw new Error("Frozen run configuration/snapshot differs; stop.");
    const frozen = normalizeSnapshot(await readJson(path.join(output, "snapshot.json")));
    if (JSON.stringify(normalizeSnapshot({ formatVersion: 1, photos: manifest.photos }).photos) !== JSON.stringify(frozen.photos)) throw new Error("Frozen manifest source/text identity differs.");
    const pilot = await readJson(path.join(output, "pilot-manifest.json"));
    if (JSON.stringify(selectSample(manifest.photos, pilot)) !== JSON.stringify(manifest.sampleIds)) throw new Error("Frozen sample identity differs.");
    await preparePreviews(output, manifest, pilot, path.dirname(manifest.pilotPath), fetcher);
    let exported = await exportRun(output, manifest, ledger);
    if (!options.generate) return exported.summary;
    const skipUncertain = options["skip-uncertain"] === true;
    if (skipUncertain && !options["continue-after-sample"]) throw new Error("Uncertain skip requires catalogue continuation.");
    if (ledger.attempts.some((entry) => entry.status !== "settled" && entry.status !== "retryable" && !(skipUncertain && entry.status === "uncertain"))) throw new Error("Unresolved/received request in shared ledger; reconcile before continuing.");
    if (skipUncertain) {
      const file = path.join(output, "continuation-approvals.json");
      const approvals = await readJson(file) ?? [];
      approvals.push({ approvedAt: new Date().toISOString(), mode: "continue-untouched-with-held-uncertainty",
        heldAttempts: ledger.attempts.filter(entry => entry.status === "uncertain").map(entry => ({ attemptId: entry.attemptId, photographId: entry.photographId, reservedUsd: entry.reservedUsd })) });
      await saveJson(file, approvals);
    }
    for (const record of exported.records) {
      if (!ledger.attempts.some((entry) => entry.runId === manifest.runId && entry.photographId === record.photographId && entry.responseId === record.responseId && entry.status === "settled")) throw new Error("Checkpoint lacks settled shared ledger identity.");
    }
    for (const entry of ledger.attempts.filter((entry) => entry.runId === manifest.runId && entry.status === "settled")) {
      const record = exported.records.find((r) => r.photographId === entry.photographId && r.responseId === entry.responseId);
      if (!record) throw new Error("Settled request lacks checkpoint; recover raw response, do not replay.");
      if (!/^responses\/[0-9a-f-]{36}\.raw$/.test(entry.responseFile ?? "")) throw new Error("Unsafe saved response path.");
      if (digest(await readFile(path.join(output, entry.responseFile))) !== entry.rawSha256) throw new Error("Raw response identity differs.");
    }
    const sampleDone = manifest.sampleIds.every((id) => exported.records.some((r) => r.photographId === id && r.status === "unreviewed"));
    if (options["continue-after-sample"] && !sampleDone) throw new Error("Sample must have 20 valid saved drafts from an earlier invocation before continuation approval.");
    const scope = options["continue-after-sample"] ? manifest.photos : manifest.sampleIds.map((id) => manifest.photos.find((p) => p.id === id));
    for (const photo of scope) {
      // Explicitly approved continuation around an uncertain photo is NOT
      // reconciliation: retain its full hold and never send that photo again.
      if (skipUncertain && ledger.attempts.some(entry => entry.photographId === photo.id && entry.status === "uncertain")) continue;
      const previous = exported.records.find((r) => r.photographId === photo.id);
      if (previous) {
        if (previous.status !== "unreviewed") throw new Error("Refused/incomplete/invalid result needs explicit reconciliation, not regeneration.");
        continue;
      }
      if (!env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY missing; no paid request made.");
      try { await generateOne(photo, output, manifest, ledger, ledgerPath, options.budgetUsd ?? 20, env, fetcher, { skipUncertain }); }
      finally { exported = await exportRun(output, manifest, ledger); }
      if (exported.records.find((r) => r.photographId === photo.id)?.status !== "unreviewed") throw new Error("Non-draft outcome retained; stopped for review.");
    }
    return exported.summary;
  }));
}

export async function catalogueMain(args) {
  const options = parseArgs(args);
  const ledgerRoot = await commonRepositoryRoot();
  const summary = await runCatalogue(options, { ledgerRoot });
  console.log(JSON.stringify({ ...summary, mode: options.generate ? options["continue-after-sample"] ? "catalogue-continuation" : "sample-only; explicit review required before continuation" : "prepare-only; no OpenAI requests" }, null, 2));
}
