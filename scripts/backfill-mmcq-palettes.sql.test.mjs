// Explicit opt-in local Docker suite. Owns only its random --rm container.
// NEVER inherits the default Docker context; refuses any other daemon socket.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import { COLUMNS, TABLES, literal, snapshotSql, transitionSql } from "./mmcq-backfill-sql.mjs";
import { fixture, fixtureDdl } from "./mmcq-backfill-test-fixtures.mjs";

const socket = `unix://${os.homedir()}/.colima/elliot-palette-tests/docker.sock`;
test("isolated Postgres atomic backfill / rollback", { skip: process.env.DOCKER_HOST !== socket }, async t => {
  const name = `elliot-mmcq-test-${randomUUID()}`;
  const { before, after } = fixture();
  const docker = args => spawnSync("docker", args, { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  const sql = (input, ok = true) => {
    const r = spawnSync("docker", ["exec", "-i", name, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", timeout: 90_000, maxBuffer: 16 * 1024 * 1024 });
    if (ok) assert.equal(r.status, 0, r.stderr);
    else assert.notEqual(r.status, 0, "Expected transaction to fail");
    return r.stdout.trim();
  };
  function connection(input, keepOpen = false) {
    const child = spawn("docker", ["exec", "-i", name, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { timeout: 90_000 });
    let stdout = "", stderr = "";
    child.stdout.on("data", bytes => { stdout += bytes; });
    child.stderr.on("data", bytes => { stderr += bytes; });
    child.on("error", error => { stderr += error.message; });
    // A failed SQL connection can close stdin before a test releases its gate.
    child.stdin.on("error", () => {});
    const done = new Promise(resolve => child.on("close", status => resolve({ status, stdout: stdout.trim(), stderr })));
    if (keepOpen) child.stdin.write(`${input}\n`);
    else child.stdin.end(input);
    return { child, done, output: () => stdout };
  }
  async function waitFor(predicate, message) {
    for (let i = 0; i < 150; i += 1) {
      if (predicate()) return;
      await delay(20);
    }
    assert.fail(message);
  }
  async function gate(statement) {
    const session = connection(`begin;\n${statement};\nselect 'gate-ready';`, true);
    await waitFor(() => session.output().includes("gate-ready"), "Independent transaction did not acquire its gate");
    return async () => {
      session.child.stdin.end("commit;\n");
      const result = await session.done;
      assert.equal(result.status, 0, result.stderr);
    };
  }
  function competingApply(applicationName) {
    return connection(`set default_transaction_isolation='repeatable read';\nset application_name=${literal(applicationName)};\n${transitionSql(before, after, "apply")}`);
  }
  const waiting = applicationName => Number(sql(`select count(*) from pg_stat_activity where application_name=${literal(applicationName)} and wait_event_type='Lock'`)) === 1;
  let created = false;
  try {
    if (docker(["image", "inspect", "postgres:15-alpine"]).status !== 0) {
      const pulled = docker(["pull", "postgres:15-alpine"]);
      assert.equal(pulled.status, 0, "Could not pull the isolated test image");
    }
    const started = docker(["run", "--rm", "--detach", "--name", name, "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine"]);
    assert.equal(started.status, 0, "Could not create dedicated test container");
    created = true;
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) { ready = true; break; }
      await delay(150);
    }
    assert(ready, "Dedicated Postgres did not become ready");
    function reset() {
      const inserts = TABLES.map(table => `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, ${literal(JSON.stringify(before.tables[table]))}::jsonb);`).join("\n");
      sql(`drop schema public cascade; create schema public; ${fixtureDdl()} ${inserts} update public.text_sentinel set n=0;`);
    }
    const snapshot = () => JSON.parse(sql(snapshotSql()));
    const unchanged = baseline => assert.deepEqual(snapshot(), baseline);
    const verify = () => sql(transitionSql(before, after, "verify"));

    await t.test("full typed apply, replay, exact rollback, absent analyses and timestamps", () => {
      reset();
      const baseline = snapshot();
      assert.equal(verify(), "before");
      assert.equal(sql(transitionSql(before, after, "apply")), "applied");
      assert.equal(verify(), "after");
      const applied = snapshot();
      assert.equal(sql(transitionSql(before, after, "apply")), "already-applied");
      unchanged(applied);
      assert.equal(sql("select n from public.text_sentinel"), "0");
      assert.deepEqual(applied.tables.photographs, baseline.tables.photographs);
      assert.equal(sql(transitionSql(before, after, "rollback")), "rolled-back");
      unchanged(baseline);
      assert.equal(sql(transitionSql(before, after, "rollback")), "already-rolled-back");
      unchanged(baseline);
    });

    await t.test("stale changed palette values with unchanged counts refuse apply", () => {
      reset();
      sql("update public.photo_palette_colours set lab_a=lab_a+1");
      const baseline = snapshot();
      assert.equal(verify(), "stale");
      sql(transitionSql(before, after, "apply"), false);
      unchanged(baseline);
    });

    await t.test("photograph text/source changes and catalogue additions refuse apply", () => {
      for (const change of ["update public.photographs set title='New owner text'", "update public.photographs set storage_path=storage_path||'.changed'", `insert into public.photographs select * from jsonb_populate_record(null::public.photographs, ${literal(JSON.stringify({ ...before.tables.photographs[0], id: randomUUID(), storage_path: "uploads/added.jpg", filename: "added.jpg" }))}::jsonb)`]) {
        reset(); sql(change);
        const baseline = snapshot();
        sql(transitionSql(before, after, "apply"), false);
        unchanged(baseline);
      }
    });

    await t.test("forced failure between colour spaces rolls both spaces back", () => {
      reset();
      const baseline = snapshot();
      const broken = transitionSql(before, after, "apply").replace("-- offline-test-midwrite-failure-point", "raise exception 'Injected offline failure';");
      sql(broken, false);
      unchanged(baseline);
      assert.equal(verify(), "before");
    });

    await t.test("rollback refuses later palette changes and preserves complete current state", () => {
      reset();
      sql(transitionSql(before, after, "apply"));
      sql("update public.photo_oklab_features set weight=weight+0.01 where rank=1");
      const baseline = snapshot();
      sql(transitionSql(before, after, "rollback"), false);
      unchanged(baseline);
    });

    await t.test("partial state is neither replay nor a permissible replacement", () => {
      reset();
      sql("delete from public.photo_oklab_features");
      const baseline = snapshot();
      assert.equal(verify(), "stale");
      sql(transitionSql(before, after, "apply"), false);
      sql(transitionSql(before, after, "rollback"), false);
      unchanged(baseline);
    });

    await t.test("committed concurrent catalogue and palette writers remain visible after waiting for locks", async () => {
      for (const kind of ["catalogue", "palette"]) {
        reset();
        const baseline = snapshot();
        const added = { ...before.tables.photographs[0], id: randomUUID(), storage_path: "uploads/concurrent.jpg", filename: "concurrent.jpg" };
        const release = await gate(kind === "catalogue"
          ? `insert into public.photographs select * from jsonb_populate_record(null::public.photographs, ${literal(JSON.stringify(added))}::jsonb)`
          : "update public.photo_palette_colours set lab_a=lab_a+1");
        const applicationName = `mmcq-stale-${kind}`;
        const apply = competingApply(applicationName);
        try {
          await waitFor(() => waiting(applicationName), "Apply did not wait for the competing writer");
        } finally { await release(); }
        const result = await apply.done;
        assert.notEqual(result.status, 0, "A concurrently committed change must reject the whole transition");
        assert.match(result.stderr, /Stale\/partial/);
        const current = snapshot();
        for (const table of TABLES) {
          if (kind === "catalogue" && table === "photographs") {
            assert.equal(current.tables.photographs.length, 3);
            assert.deepEqual(current.tables.photographs.filter(p => p.id !== added.id), baseline.tables.photographs);
          } else if (kind === "palette" && table === "photo_palette_colours") {
            const oldRow = baseline.tables[table][0], row = current.tables[table][0];
            assert(Math.abs(row.lab_a - oldRow.lab_a - 1) < 0.00001);
            assert.deepEqual({ ...row, lab_a: oldRow.lab_a }, oldRow);
          } else assert.deepEqual(current.tables[table], baseline.tables[table]);
        }
      }
    });

    await t.test("conflicting lock times out without writes while public reads remain available", async () => {
      reset();
      const baseline = snapshot();
      const release = await gate("lock table public.photo_palette_colours in share mode");
      const apply = competingApply("mmcq-timeout");
      try {
        await waitFor(() => waiting("mmcq-timeout"), "Apply did not wait for the held palette lock");
        assert.equal(sql("select count(*) from public.photographs"), "2");
        assert.equal(sql("select count(*) from public.photo_palette_colours"), "1");
        const result = await apply.done;
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /lock timeout/);
      } finally { await release(); }
      unchanged(baseline);
    });

    await t.test("two racing applies serialize to one transition and one verified replay", async () => {
      reset();
      const release = await gate("lock table public.photographs in row exclusive mode");
      const first = competingApply("mmcq-race-one");
      const second = competingApply("mmcq-race-two");
      try {
        await waitFor(() => waiting("mmcq-race-one") && waiting("mmcq-race-two"), "Both applies must reach the same lock gate");
      } finally { await release(); }
      const results = await Promise.all([first.done, second.done]);
      for (const result of results) assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(results.map(r => r.stdout).sort(), ["already-applied", "applied"]);
      assert.equal(verify(), "after");
      assert.equal(sql("select n from public.text_sentinel"), "0");
    });

    await t.test("wrong relkind, _new relation, typed schema and palette triggers fail closed", () => {
      for (const change of [
        "create table public.photo_palette_colours_new(x integer)",
        "alter table public.photo_palette_colours alter column lab_l type double precision",
        "alter table public.photo_palette_colours add column surprise text",
        "create trigger unexpected after insert on public.photo_palette_colours for each row execute function public.test_photo_trigger()",
        "alter table public.photo_palette_colours rename to hidden_colours; create view public.photo_palette_colours as select * from public.hidden_colours",
        "create table public.unexpected_child(id uuid references public.photo_palette_analyses(photograph_id) on delete cascade)",
        "create table public.inherited_colours() inherits(public.photo_palette_colours)",
      ]) {
        reset(); sql(change);
        sql(snapshotSql(), false);
        sql(transitionSql(before, after, "apply"), false);
      }
    });

    await t.test("desired payload corruption rejected before any public writes", () => {
      for (const mutate of [
        a => { a.tables.photo_palette_analyses[0].palette_size += 1; },
        a => { a.tables.photo_oklab_features[0].red += 1; },
        a => { a.tables.photo_oklab_features[0].oklab_l = "NaN"; },
        a => { a.tables.photo_palette_colours[0].lab_l = "Infinity"; },
        a => { a.tables.photographs[0].title = "Must never write"; },
      ]) {
        reset(); const baseline = snapshot();
        const bad = structuredClone(after); mutate(bad);
        sql(transitionSql(before, bad, "apply"), false);
        unchanged(baseline);
      }
    });

    await t.test("fixture exactly matches the asserted ordered column definitions", () => {
      reset();
      assert.equal(Object.keys(COLUMNS).length, TABLES.length);
      assert.equal(snapshot().tables.photographs.length, 2);
    });
  } finally {
    if (created) assert.equal(docker(["stop", name]).status, 0, "Could not stop the owned test container");
  }
});
