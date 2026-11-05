import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";
import { ARCHIVE_INPUT_PIXELS, digest, MAX_BYTES, originalIdentity, readOriginal, parseArguments, remoteArguments, validatePayload, validateSnapshot, readArtifact, writeArtifact, preparedJournal, loadFrozen } from "./backfill-mmcq-palettes.mjs";
import { TABLES, transitionSql, snapshotSql } from "./mmcq-backfill-sql.mjs";
import { fixture, payload } from "./mmcq-backfill-test-fixtures.mjs";

test("only explicit guarded commands, fixed SSH target and shell-safe container", () => {
  assert.equal(parseArguments([]).command, "help");
  const flags = ["--run=/private/run", "--palette-table=photo_palette_colours", "--container=supabase-db", `--manifest-sha256=${"a".repeat(64)}`];
  assert.throws(() => parseArguments(["apply", ...flags]), /confirm/);
  assert.equal(parseArguments(["apply", ...flags, "--confirm=elliotmairet"]).command, "apply");
  assert.throws(() => parseArguments(["verify", ...flags, "--confirm=elliotmairet"]));
  assert.throws(() => parseArguments(["verify", ...flags, "--run=duplicate"]));
  assert.throws(() => parseArguments(["snapshot", "--run=x", "--palette-table=photo_palette_colours_new", "--container=db"]));
  for (const value of ["--bad", "a;id", "a b", "$(id)", "a\nb", "a/b", ""]) assert.throws(() => remoteArguments(value));
  assert(remoteArguments("supabase-db").includes("dextery@gmkserver.tail077753.ts.net"));
  assert.match(remoteArguments("supabase-db").at(-1), /psql -X .*ON_ERROR_STOP=1/);
});

test("exact app payload, coordinates, both representations and variable counts", () => {
  const id = fixture().before.tables.photographs[0].id;
  assert.equal(validatePayload(payload(id, [[80, 80, 80]]), id).palette_size, 1);
  const cases = [
    p => { p.algorithm = "legacy"; },
    p => { p.sample_longest_side = 96; },
    p => { p.colours[0].lab_l += 0.001; },
    p => { p.oklab_features.features[0].weight = 0.1; },
    p => { p.colours[0].rank = 2; },
    p => { p.oklab_features.features[0].oklab_a = Infinity; },
    p => { p.colours[0].extra = 1; },
    p => { p.palette_size = 5; },
  ];
  for (const mutate of cases) { const p = payload(id); mutate(p); assert.throws(() => validatePayload(p, id)); }
  assert.throws(() => validatePayload(payload(id, [[80, 80, 80], [81, 81, 81]]), id), /separation/);
});

test("complete snapshot retains absent analyses; rejects duplicate/orphan/unknown rows", () => {
  const { before, after } = fixture();
  assert.equal(validateSnapshot(before).tables.photo_oklab_analyses.length, 1);
  assert.equal(validateSnapshot(after).tables.photo_oklab_analyses.length, 2);
  for (const mutate of [s => s.tables.photographs.push(s.tables.photographs[0]), s => { s.tables.photo_palette_colours[0].photograph_id = "missing"; }, s => { s.tables.photographs[0].extra = "no"; }]) {
    const s = structuredClone(before); mutate(s); assert.throws(() => validateSnapshot(s));
  }
});

test("HEAD bounds, streamed original size and metadata SHA", async () => {
  const bytes = Buffer.from("exact original bytes");
  const head = { ETag: '"etag"', ContentLength: bytes.length, Metadata: { sourcesha256: digest(bytes) } };
  const identity = originalIdentity(head, "uploads/key.jpg");
  const result = await readOriginal(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), identity);
  assert.deepEqual(result.buffer, bytes);
  assert.equal(result.sha256, head.Metadata.sourcesha256);
  assert.throws(() => originalIdentity({ ...head, ContentLength: MAX_BYTES + 1 }, "key"), /512MiB/);
  assert.throws(() => originalIdentity({ ...head, Metadata: { sourcesha256: "bad" } }, "key"), /sourcesha256/);
  await assert.rejects(readOriginal(Readable.from([bytes]), { ...identity, size: bytes.length - 1 }), /exceeded/);
  await assert.rejects(readOriginal(Readable.from([bytes]), { ...identity, size: bytes.length + 1 }), /count mismatch/);
  await assert.rejects(readOriginal(Readable.from([bytes]), { ...identity, sourceSha256: "a".repeat(64) }), /sourcesha256/);
});

test("prepared journals have an independent resumable checksum", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mmcq-journal-"));
  await chmod(directory, 0o700);
  try {
    const journal = { originalSha256: "a".repeat(64), payload: { value: 1 } };
    const sha256 = digest(Buffer.from(`${JSON.stringify(journal, null, 2)}\n`));
    await writeArtifact(directory, "journal.json", { journal, sha256 });
    assert.deepEqual((await preparedJournal(directory, "journal.json")).value, journal);
    journal.payload.value = 2;
    await writeFile(path.join(directory, "journal.json"), JSON.stringify({ journal, sha256 }));
    await assert.rejects(preparedJournal(directory, "journal.json"), /checksum/);
  } finally { await rm(directory, { recursive: true }); }
});

test("frozen manifest binds before, runtime, all journals and exact desired rows", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mmcq-manifest-"));
  await chmod(directory, 0o700);
  try {
    const { before, after } = fixture();
    const snapshotSha256 = await writeArtifact(directory, "before.json", before);
    await writeArtifact(directory, "before.sha256.json", { sha256: snapshotSha256 });
    const codeSha256 = "b".repeat(64), runId = before.tables.photographs[0].id;
    const preparationSha256 = await writeArtifact(directory, "preparation.json", { formatVersion: 1, runId, snapshotSha256, codeSha256, nodeVersion: process.version, sharpVersions: { sharp: "fixture", vips: "fixture" }, maximumInputPixels: ARCHIVE_INPUT_PIXELS });
    const entries = [];
    for (const photo of before.tables.photographs) {
      const journal = { formatVersion: 1, snapshotSha256, codeSha256, photographId: photo.id, original: { bucket: "elliotmairet", key: photo.storage_path, etag: '"etag"', size: 10, sourceSha256: "a".repeat(64) }, originalSha256: "a".repeat(64), payload: payload(photo.id) };
      const sha256 = await writeArtifact(directory, `${photo.id}.json`, { journal, sha256: digest(Buffer.from(`${JSON.stringify(journal, null, 2)}\n`)) });
      entries.push({ id: photo.id, sha256 });
    }
    const desiredSha256 = await writeArtifact(directory, "desired.json", after);
    const pin = await writeArtifact(directory, "manifest.json", { formatVersion: 1, runId, snapshotSha256, preparationSha256, desiredSha256, codeSha256, journals: entries });
    assert.deepEqual((await loadFrozen(directory, pin)).after, after);
    await assert.rejects(loadFrozen(directory, "c".repeat(64)), /checksum/);
    await writeFile(path.join(directory, `${entries[0].id}.json`), "{}\n");
    await assert.rejects(loadFrozen(directory, pin), /checksum/);
  } finally { await rm(directory, { recursive: true }); }
});

test("artifacts are exclusive, owner-only, hash-pinned and refuse symlinks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mmcq-unit-"));
  await chmod(directory, 0o700);
  try {
    const hash = await writeArtifact(directory, "data.json", { value: 1 });
    assert.deepEqual((await readArtifact(directory, "data.json", hash)).value, { value: 1 });
    await assert.rejects(writeArtifact(directory, "data.json", { value: 2 }), /EEXIST/);
    assert.match(await readFile(path.join(directory, "data.json"), "utf8"), /"value": 1/);
    await writeFile(path.join(directory, "data.json"), '{"value":2}\n', { mode: 0o600 });
    await assert.rejects(readArtifact(directory, "data.json", hash), /checksum/);
    await symlink(path.join(directory, "data.json"), path.join(directory, "link.json"));
    await assert.rejects(readArtifact(directory, "link.json"));
    await chmod(path.join(directory, "data.json"), 0o644);
    await assert.rejects(readArtifact(directory, "data.json"), /owner-only/);
  } finally { await rm(directory, { recursive: true }); }
});

test("SQL only mutates allowlisted palettes; lock order, typed comparisons, no persistent DDL", () => {
  const { before, after } = fixture();
  for (const action of ["apply", "rollback"]) {
    const sql = transitionSql(before, after, action);
    const targets = [...sql.matchAll(/(?:delete from|insert into) public\.([a-z_]+)/g)].map(m => m[1]);
    assert(targets.length > 0 && targets.every(t => TABLES.slice(1).includes(t)));
    assert(!/create (?:or replace )?function|alter table|truncate|disable trigger/i.test(sql));
    assert(sql.indexOf("lock table public.photographs in share mode") < sql.indexOf("in share row exclusive mode"));
    assert.match(sql, /except all/g);
    assert.match(sql, /jsonb_populate_recordset\(null::public.photo_palette_colours/);
    assert.match(sql, /lock_timeout = '5s'/);
  }
  const verify = transitionSql(before, after, "verify");
  assert.match(verify, /repeatable read read only/);
  assert(!/(?:delete from|insert into) public\./.test(verify));
  assert.match(snapshotSql(), /repeatable read read only/);
  assert(!/limit 1000/i.test(snapshotSql()));
});
