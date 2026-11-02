// Isolated local Postgres only: no ports, host mounts, credentials or Supabase.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const name = `elliot-text-test-${randomUUID()}`;
const files = [
  "supabase/tests/photograph-text-bootstrap.sql",
  "supabase/migrations/20261031000944_photograph_text_drafts.sql",
  "supabase/tests/photograph-text.sql",
  "supabase/migrations/20261031015837_photograph_auto_text.sql",
  "supabase/migrations/20261101000100_description_generated_alt.sql",
  "supabase/tests/photograph-auto-text.sql",
  "supabase/tests/description-generated-alt.sql",
];
let created = false;
try {
  execFileSync("docker", ["run", "--rm", "--detach", "--name", name,
    "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"], { stdio: "pipe" });
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    // The entrypoint's temporary init server has no TCP listener. Waiting on
    // loopback avoids connecting just before that temporary server shuts down.
    const result = spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "pipe" });
    if (result.status === 0) { ready = true; break; }
    await delay(150);
  }
  if (!ready) throw new Error("The isolated Postgres container did not become ready.");
  // Each suite exercises SET ROLE. Restore the fixture owner before applying
  // the next migration; never inherit a test's authenticated/anonymous role.
  const sql = (await Promise.all(files.map(file => readFile(new URL(file, `file://${root}`), "utf8")))).join("\nreset role;\n");
  const result = spawnSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", maxBuffer: 4_000_000,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("Isolated photograph text database checks failed.");
  }
  console.log(result.stdout.split("\n").filter(line => /checks passed|all isolated assertions passed/.test(line)).join("\n"));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) execFileSync("docker", ["stop", name], { stdio: "pipe" });
}
