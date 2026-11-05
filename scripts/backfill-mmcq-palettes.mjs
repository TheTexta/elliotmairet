// Explicit operator tool. Importing this module never reads env files or connects.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COLUMNS, TABLES, snapshotSql, transitionSql } from "./mmcq-backfill-sql.mjs";
import { rgbToLab } from "../lib/palette/k-means.js";
import { rgbToOklab } from "../lib/palette/oklab-k-medoids.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const MODEL = "mmcq64-vibrant-oklab-v1";
export const ARCHIVE_INPUT_PIXELS = 150_000_000;
export const MAX_BYTES = 512 * 1024 * 1024;
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
class ToolError extends Error {}
function assert(condition, message) { if (!condition) throw new ToolError(message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exactKeys(value, keys) {
  assert(value && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort()), "Unexpected row/payload fields");
}

export function validateSnapshot(snapshot) {
  exactKeys(snapshot, ["formatVersion", "paletteTable", "tables"]);
  assert(snapshot.formatVersion === 1 && snapshot.paletteTable === "photo_palette_colours", "Unexpected snapshot version/table");
  exactKeys(snapshot.tables, TABLES);
  const photos = snapshot.tables.photographs;
  assert(Array.isArray(photos) && photos.length > 0, "Empty catalogue is not supported");
  const ids = new Set();
  for (const photo of photos) {
    exactKeys(photo, COLUMNS.photographs.map(c => c.name));
    assert(UUID.test(photo.id) && !ids.has(photo.id), "Invalid/duplicate photograph UUID");
    assert(typeof photo.storage_path === "string" && photo.storage_path.length > 0 && !photo.storage_path.includes("\0"), "Missing original storage key");
    ids.add(photo.id);
  }
  for (const table of TABLES.slice(1)) {
    assert(Array.isArray(snapshot.tables[table]), "Missing snapshot rows");
    const keys = new Set();
    for (const row of snapshot.tables[table]) {
      exactKeys(row, COLUMNS[table].map(c => c.name));
      assert(ids.has(row.photograph_id), "Snapshot contains orphan palette rows");
      const key = `${row.photograph_id}:${row.rank ?? "analysis"}`;
      assert(!keys.has(key), "Duplicate snapshot palette key");
      keys.add(key);
    }
  }
  return snapshot;
}

// Consume the application's existing payload; do not implement another analyser/mapper.
export function validatePayload(payload, id) {
  exactKeys(payload, ["photograph_id", "algorithm", "algorithm_iterations", "sample_longest_side", "palette_size", "analyzed_at", "colours", "oklab_features"]);
  const o = payload.oklab_features;
  exactKeys(o, ["photograph_id", "algorithm", "algorithm_iterations", "sample_longest_side", "feature_count", "analyzed_at", "features"]);
  for (const p of [payload, o]) {
    assert(p.photograph_id === id && p.algorithm === MODEL && p.algorithm_iterations === 2 && p.sample_longest_side === 256, "Application analyser is not the approved MMCQ model");
    assert(typeof p.analyzed_at === "string" && Number.isFinite(Date.parse(p.analyzed_at)), "Invalid analysis timestamp");
  }
  assert(payload.analyzed_at === o.analyzed_at && Array.isArray(payload.colours) && Array.isArray(o.features), "Inconsistent analysis representations");
  const count = payload.colours.length;
  assert(count >= 1 && count <= 5 && count === payload.palette_size && count === o.feature_count && count === o.features.length, "Invalid palette counts");
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const c = payload.colours[i], f = o.features[i];
    exactKeys(c, ["rank", "red", "green", "blue", "hex", "lab_l", "lab_a", "lab_b", "weight"]);
    exactKeys(f, ["rank", "red", "green", "blue", "hex", "oklab_l", "oklab_a", "oklab_b", "weight"]);
    assert(c.rank === i + 1 && f.rank === i + 1, "Palette ranks must be contiguous and ordered");
    const rgb = [c.red, c.green, c.blue];
    assert(rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255), "Invalid RGB");
    assert(c.hex === `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`, "RGB/hex mismatch");
    for (const key of ["red", "green", "blue", "hex", "weight"]) assert(c[key] === f[key], "Ordered CIELAB/OKLab swatches differ");
    assert(Number.isFinite(c.weight) && c.weight >= 0 && c.weight <= 1 && Math.abs(c.weight * 1e6 - Math.round(c.weight * 1e6)) < 1e-7, "Invalid six-decimal weight");
    sum += c.weight;
    for (const [row, prefix, expected] of [[c, "lab", rgbToLab(rgb)], [f, "oklab", rgbToOklab(rgb)]]) {
      ["l", "a", "b"].forEach((axis, j) => assert(Number.isFinite(row[`${prefix}_${axis}`]) && Math.abs(row[`${prefix}_${axis}`] - expected[j]) < 1e-7, "Coordinates do not match RGB"));
    }
    for (let j = 0; j < i; j += 1) {
      const prev = o.features[j];
      assert(Math.hypot(f.oklab_l - prev.oklab_l, f.oklab_a - prev.oklab_a, f.oklab_b - prev.oklab_b) >= 0.055 - 1e-9, "Insufficient pairwise separation");
    }
  }
  assert(Math.abs(sum - 1) <= 0.000005, "Palette weights do not sum to one");
  return payload;
}

export function desiredSnapshot(before, journals) {
  const tables = Object.fromEntries(TABLES.map(t => [t, []]));
  tables.photographs = before.tables.photographs;
  assert(journals.length === tables.photographs.length, "Incomplete prepared catalogue");
  for (const [i, photo] of tables.photographs.entries()) {
    const p = validatePayload(journals[i].payload, photo.id);
    const { colours, oklab_features: o, ...analysis } = p;
    const { features, ...oklabAnalysis } = o;
    tables.photo_palette_analyses.push(analysis);
    tables.photo_oklab_analyses.push(oklabAnalysis);
    tables.photo_palette_colours.push(...colours.map(row => ({ photograph_id: photo.id, ...row })));
    tables.photo_oklab_features.push(...features.map(row => ({ photograph_id: photo.id, ...row })));
  }
  return validateSnapshot({ formatVersion: 1, paletteTable: "photo_palette_colours", tables });
}

async function privateDirectory(directory) {
  const s = await lstat(directory);
  assert(s.isDirectory() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o700 && s.uid === process.getuid(), "Run directory must be owner-only mode 700 (not a symlink)");
}
async function syncDirectory(directory) {
  const h = await open(directory, constants.O_RDONLY);
  try { await h.sync(); } finally { await h.close(); }
}
// Atomic, fsynced, exclusive publication: crash leaves either no final file or a complete one.
export async function writeArtifact(directory, name, value) {
  await privateDirectory(directory);
  const temporary = path.join(directory, `.pending-${randomUUID()}`);
  const h = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const bytes = encode(value);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  try { await link(temporary, path.join(directory, name)); await syncDirectory(directory); }
  finally { await unlink(temporary); await syncDirectory(directory); }
  return digest(bytes);
}
export async function readArtifact(directory, name, expectedHash) {
  await privateDirectory(directory);
  const h = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    assert(s.isFile() && (s.mode & 0o777) === 0o600 && s.uid === process.getuid() && s.size < 128 * 1024 * 1024, "Artifact must be a bounded owner-only regular file");
    const bytes = await h.readFile();
    const hash = digest(bytes);
    if (expectedHash) assert(SHA.test(expectedHash) && hash === expectedHash, "Artifact checksum mismatch");
    return { value: JSON.parse(bytes.toString("utf8")), hash };
  } finally { await h.close(); }
}
async function optionalArtifact(directory, name) {
  try { return await readArtifact(directory, name); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function preparedJournal(directory, name, expectedHash) {
  const artifact = expectedHash ? await readArtifact(directory, name, expectedHash) : await optionalArtifact(directory, name);
  if (!artifact) return null;
  exactKeys(artifact.value, ["journal", "sha256"]);
  assert(SHA.test(artifact.value.sha256) && digest(encode(artifact.value.journal)) === artifact.value.sha256, "Prepared journal checksum mismatch");
  return { value: artifact.value.journal, hash: artifact.hash };
}

export function remoteArguments(container) {
  assert(typeof container === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(container), "Container must be an operator-verified shell-safe Docker name");
  return ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "dextery@gmkserver.tail077753.ts.net", `docker exec -i ${container} psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1`];
}
function remoteSql(container, sql) {
  const result = spawnSync("ssh", remoteArguments(container), {
    input: `set standard_conforming_strings=on;\n${sql}`, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 180_000,
  });
  // Never print SSH/SQL/AWS errors, SQL input, credentials, or catalogue content.
  assert(!result.error && result.status === 0, "SSH/psql failed. Commit outcome may be uncertain: inspect with verify before any retry. Remote diagnostics intentionally suppressed.");
  return result.stdout.trim();
}

async function codeFingerprint() {
  const files = ["lib/photographs/analyse-image.ts", "lib/photographs/config.ts"];
  for (const name of (await readdir(path.join(ROOT, "lib/palette"))).sort()) {
    if (/\.(?:js|ts)$/.test(name) && !/\.(?:test|d)\./.test(name)) files.push(`lib/palette/${name}`);
  }
  const hashes = [];
  for (const name of files) {
    const h = await open(path.join(ROOT, name), "r");
    try { hashes.push([name, digest(await h.readFile())]); } finally { await h.close(); }
  }
  return digest(JSON.stringify(hashes));
}

export function originalIdentity(head, key) {
  assert(typeof head.ETag === "string" && /^"[^"\r\n]+"$/.test(head.ETag), "Original has no usable ETag");
  assert(Number.isSafeInteger(head.ContentLength) && head.ContentLength > 0 && head.ContentLength <= MAX_BYTES, "Original exceeds the 512MiB bound or has invalid size");
  const sourceSha256 = head.Metadata?.sourcesha256 ?? null;
  assert(sourceSha256 === null || SHA.test(sourceSha256), "Invalid recorded sourcesha256 metadata");
  return { bucket: "elliotmairet", key, etag: head.ETag, size: head.ContentLength, sourceSha256 };
}
export async function readOriginal(body, identity) {
  assert(body && body[Symbol.asyncIterator], "Original has no streaming body");
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      assert(size <= identity.size && size <= MAX_BYTES, "Original stream exceeded declared byte count");
      chunks.push(bytes);
    }
  } finally { body.destroy?.(); }
  assert(size === identity.size, "Original byte count mismatch");
  const buffer = Buffer.concat(chunks, size);
  const sha256 = digest(buffer);
  assert(identity.sourceSha256 === null || sha256 === identity.sourceSha256, "Original bytes differ from recorded sourcesha256");
  return { buffer, sha256 };
}
async function originalStore() {
  const endpoint = new URL(process.env.CLOUDFLARE_S3_API_ENDPOINT ?? "invalid:");
  assert(endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && ["", "/"].includes(endpoint.pathname), "R2 endpoint must be an HTTPS origin");
  assert(process.env.CLOUDFLARE_R2_BUCKET === "elliotmairet", "Explicit CLOUDFLARE_R2_BUCKET=elliotmairet is required");
  assert(process.env.CLOUDFLARE_ACCESS_ID && process.env.CLOUDFLARE_SECRET_KEY, "Operator-provided R2 environment is missing");
  const { S3Client, HeadObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ endpoint: endpoint.origin, region: "auto", maxAttempts: 2, credentials: { accessKeyId: process.env.CLOUDFLARE_ACCESS_ID, secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY } });
  return {
    async head(key) { return originalIdentity(await client.send(new HeadObjectCommand({ Bucket: "elliotmairet", Key: key }), { abortSignal: AbortSignal.timeout(120_000) }), key); },
    async get(identity) {
      const response = await client.send(new GetObjectCommand({ Bucket: "elliotmairet", Key: identity.key, IfMatch: identity.etag }), { abortSignal: AbortSignal.timeout(120_000) });
      try {
        assert(same(originalIdentity(response, identity.key), identity), "HEAD/conditional GET identity mismatch");
        return await readOriginal(response.Body, identity);
      } finally { response.Body?.destroy?.(); }
    },
    close() { client.destroy(); },
  };
}

function validateJournal(journal, photo, snapshotSha256, codeSha256) {
  exactKeys(journal, ["formatVersion", "snapshotSha256", "codeSha256", "photographId", "original", "originalSha256", "payload"]);
  assert(journal.formatVersion === 1 && journal.snapshotSha256 === snapshotSha256 && journal.codeSha256 === codeSha256 && journal.photographId === photo.id, "Prepared journal binding mismatch");
  exactKeys(journal.original, ["bucket", "key", "etag", "size", "sourceSha256"]);
  assert(journal.original.bucket === "elliotmairet" && journal.original.key === photo.storage_path && SHA.test(journal.originalSha256), "Prepared original identity mismatch");
  originalIdentity({ ETag: journal.original.etag, ContentLength: journal.original.size, Metadata: journal.original.sourceSha256 === null ? {} : { sourcesha256: journal.original.sourceSha256 } }, photo.storage_path);
  assert(journal.original.sourceSha256 === null || journal.original.sourceSha256 === journal.originalSha256, "Journal source hash mismatch");
  validatePayload(journal.payload, photo.id);
}
async function loadBefore(directory, hash) {
  assert(SHA.test(hash ?? ""), "An externally pinned --snapshot-sha256 is required");
  const artifact = await readArtifact(directory, "before.json", hash);
  const checksum = (await readArtifact(directory, "before.sha256.json")).value;
  assert(checksum.sha256 === hash, "Snapshot checksum sidecar differs");
  return validateSnapshot(artifact.value);
}
export async function loadFrozen(directory, manifestHash) {
  assert(SHA.test(manifestHash ?? ""), "An externally pinned --manifest-sha256 is required");
  const manifest = (await readArtifact(directory, "manifest.json", manifestHash)).value;
  exactKeys(manifest, ["formatVersion", "runId", "snapshotSha256", "preparationSha256", "desiredSha256", "codeSha256", "journals"]);
  assert(manifest.formatVersion === 1 && UUID.test(manifest.runId) && SHA.test(manifest.codeSha256), "Invalid frozen manifest");
  const before = await loadBefore(directory, manifest.snapshotSha256);
  const preparation = (await readArtifact(directory, "preparation.json", manifest.preparationSha256)).value;
  exactKeys(preparation, ["formatVersion", "runId", "snapshotSha256", "codeSha256", "nodeVersion", "sharpVersions", "maximumInputPixels"]);
  assert(preparation.maximumInputPixels === ARCHIVE_INPUT_PIXELS, "Unexpected trusted archive input allowance");
  assert(preparation.formatVersion === 1 && /^v\d+\.\d+\.\d+$/.test(preparation.nodeVersion) && preparation.sharpVersions && typeof preparation.sharpVersions.sharp === "string" && Object.values(preparation.sharpVersions).every(v => typeof v === "string"), "Invalid frozen sampler runtime record");
  assert(preparation.runId === manifest.runId && preparation.snapshotSha256 === manifest.snapshotSha256 && preparation.codeSha256 === manifest.codeSha256, "Preparation manifest mismatch");
  assert(Array.isArray(manifest.journals) && manifest.journals.length === before.tables.photographs.length, "Incomplete manifest");
  const journals = [];
  for (const [i, photo] of before.tables.photographs.entries()) {
    const entry = manifest.journals[i];
    assert(entry.id === photo.id && SHA.test(entry.sha256), "Manifest journal order/checksum mismatch");
    const journal = (await preparedJournal(directory, `${photo.id}.json`, entry.sha256)).value;
    validateJournal(journal, photo, manifest.snapshotSha256, manifest.codeSha256);
    journals.push(journal);
  }
  const after = validateSnapshot((await readArtifact(directory, "desired.json", manifest.desiredSha256)).value);
  assert(same(after, desiredSnapshot(before, journals)), "Frozen desired rows differ from prepared journals");
  return { before, after, journals };
}

export function parseArguments(args) {
  const [command = "help", ...rest] = args;
  assert(["help", "snapshot", "prepare", "apply", "verify", "rollback"].includes(command), "Unknown command");
  const options = {};
  for (const arg of rest) {
    const match = /^--(run|container|palette-table|snapshot-sha256|manifest-sha256|confirm)=(.+)$/.exec(arg);
    assert(match && !Object.hasOwn(options, match[1]), "Invalid/duplicate argument; use --name=value");
    options[match[1]] = match[2];
  }
  if (command === "help") { assert(rest.length === 0, "help takes no options"); return { command, options }; }
  const allowed = ["run", "palette-table", ...(command === "prepare" ? ["snapshot-sha256"] : ["container"]), ...(["apply", "verify", "rollback"].includes(command) ? ["manifest-sha256"] : []), ...(["apply", "rollback"].includes(command) ? ["confirm"] : [])];
  assert(Object.keys(options).every(key => allowed.includes(key)), "Option is not accepted by this subcommand");
  assert(options.run && options["palette-table"] === "photo_palette_colours", "Require --run=PRIVATE_DIRECTORY --palette-table=photo_palette_colours");
  if (command !== "prepare") remoteArguments(options.container);
  if (command === "prepare") assert(SHA.test(options["snapshot-sha256"] ?? ""), "Require pinned --snapshot-sha256");
  if (["apply", "verify", "rollback"].includes(command)) assert(SHA.test(options["manifest-sha256"] ?? ""), "Require pinned --manifest-sha256");
  if (["apply", "rollback"].includes(command)) assert(options.confirm === "elliotmairet", "Mutation requires --confirm=elliotmairet");
  else assert(!options.confirm, "Confirmation is only accepted for apply/rollback");
  return { command, options };
}

export async function main(args) {
  const { command, options: o } = parseArguments(args);
  if (command === "help") {
    console.log("Commands: snapshot, prepare, apply, verify, rollback. See docs/mmcq-backfill.md. No command reads .env files. apply/rollback require --confirm=elliotmairet.");
    return;
  }
  const directory = path.resolve(o.run);
  if (command === "snapshot") {
    await mkdir(directory, { mode: 0o700 }); // deliberately refuses existing paths
    await syncDirectory(path.dirname(directory));
    const before = validateSnapshot(JSON.parse(remoteSql(o.container, snapshotSql())));
    const hash = await writeArtifact(directory, "before.json", before);
    await writeArtifact(directory, "before.sha256.json", { sha256: hash });
    console.log(`Snapshot persisted. Pin --snapshot-sha256=${hash}`);
    return;
  }
  await privateDirectory(directory);
  if (command === "prepare") {
    const before = await loadBefore(directory, o["snapshot-sha256"]);
    const codeSha256 = await codeFingerprint();
    const { default: sharp } = await import("sharp");
    const sharpVersions = JSON.parse(JSON.stringify(sharp.versions));
    const existing = await optionalArtifact(directory, "preparation.json");
    const preparation = existing?.value ?? { formatVersion: 1, runId: randomUUID(), snapshotSha256: o["snapshot-sha256"], codeSha256, nodeVersion: process.version, sharpVersions, maximumInputPixels: ARCHIVE_INPUT_PIXELS };
    assert(preparation.formatVersion === 1 && UUID.test(preparation.runId) && preparation.snapshotSha256 === o["snapshot-sha256"] && preparation.codeSha256 === codeSha256 && preparation.nodeVersion === process.version && same(preparation.sharpVersions, sharpVersions) && preparation.maximumInputPixels === ARCHIVE_INPUT_PIXELS, "Preparation code/snapshot/Sharp runtime changed; start a new run");
    const preparationSha256 = existing?.hash ?? await writeArtifact(directory, "preparation.json", preparation);
    const frozen = await optionalArtifact(directory, "manifest.json");
    if (frozen) {
      await loadFrozen(directory, frozen.hash);
      console.log(`Already frozen. Pin --manifest-sha256=${frozen.hash}`);
      return;
    }
    const { analyseImage } = await import("../lib/photographs/analyse-image.ts");
    const store = await originalStore();
    const journals = [], entries = [];
    try {
      for (const [i, photo] of before.tables.photographs.entries()) {
        const name = `${photo.id}.json`;
        const existingJournal = await preparedJournal(directory, name);
        let journal = existingJournal?.value;
        const head = await store.head(photo.storage_path);
        if (journal) {
          validateJournal(journal, photo, o["snapshot-sha256"], codeSha256);
          assert(same(journal.original, head), "Prepared original HEAD changed; start a new run");
        } else {
          const { buffer, sha256 } = await store.get(head);
          const payload = validatePayload(await analyseImage(buffer, photo.id, { maximumInputPixels: ARCHIVE_INPUT_PIXELS }), photo.id);
          journal = { formatVersion: 1, snapshotSha256: o["snapshot-sha256"], codeSha256, photographId: photo.id, original: head, originalSha256: sha256, payload };
        }
        const hash = existingJournal?.hash ?? await writeArtifact(directory, name, { journal, sha256: digest(encode(journal)) });
        journals.push(journal);
        entries.push({ id: photo.id, sha256: hash });
        console.log(`Prepared ${i + 1}/${before.tables.photographs.length}`);
      }
    } finally { store.close(); }
    assert(await codeFingerprint() === codeSha256, "Analyser code changed during preparation; do not freeze this run");
    const after = desiredSnapshot(before, journals);
    const priorDesired = await optionalArtifact(directory, "desired.json");
    if (priorDesired) assert(same(priorDesired.value, after), "Existing desired artifact differs");
    const desiredSha256 = priorDesired?.hash ?? await writeArtifact(directory, "desired.json", after);
    const hash = await writeArtifact(directory, "manifest.json", { formatVersion: 1, runId: preparation.runId, snapshotSha256: o["snapshot-sha256"], preparationSha256, desiredSha256, codeSha256, journals: entries });
    console.log(`Frozen rollback and desired artifacts. Pin --manifest-sha256=${hash}`);
    return;
  }
  const frozen = await loadFrozen(directory, o["manifest-sha256"]);
  if (command === "apply") {
    // Database state check first: recover uncertain commits without needing source IO.
    const current = remoteSql(o.container, transitionSql(frozen.before, frozen.after, "verify"));
    if (current === "after") { console.log("already-applied (verified; no writes)"); return; }
    assert(current === "before", "Stale/partial database state; apply refused");
    const store = await originalStore();
    try {
      for (const journal of frozen.journals) assert(same(await store.head(journal.original.key), journal.original), "Original HEAD changed since preparation; apply refused");
    } finally { store.close(); }
    // Rehash all artifacts after HEAD checks and before constructing the transaction.
    const checked = await loadFrozen(directory, o["manifest-sha256"]);
    console.log(remoteSql(o.container, transitionSql(checked.before, checked.after, "apply")));
  } else {
    console.log(remoteSql(o.container, transitionSql(frozen.before, frozen.after, command)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Deliberately avoid dumping remote SDK errors, SQL rows, or secret configuration.
    console.error(error instanceof ToolError ? error.message : "MMCQ backfill stopped; underlying diagnostics suppressed to protect secrets.");
    console.error("No further action attempted. If apply/rollback started, run verify with the pinned manifest before retrying.");
    process.exitCode = 1;
  });
}
