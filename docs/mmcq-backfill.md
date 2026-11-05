# MMCQ palette-only backfill (operator tool)

`scripts/backfill-mmcq-palettes.mjs` never loads `.env` files. No command starts a
production container, changes schema/functions/grants, calls publication RPCs,
changes photographs/text/media, or writes R2 objects. Only `apply` and `rollback`
write production rows, and only in these four physical tables:

- `photo_palette_analyses`
- `photo_palette_colours` (**not** `photo_palette_colours_new`)
- `photo_oklab_analyses`
- `photo_oklab_features`

The palette table name must be explicitly supplied and must be the final name
above. `_new` existing at all, views/partitioned tables, unexpected ordered typed
columns/nullability, generated columns, palette rules/user triggers, or unexpected
inbound palette foreign keys fail closed. No automatic schema repair exists.
The fixed SSH target is `dextery@gmkserver.tail077753.ts.net`; the operator must
verify its identity, reachability and the Docker container name. Remote commands
use `docker exec -i CONTAINER psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1`.
The database role must have BYPASSRLS/superuser; no JWT/service-role key is needed.

## Before running

- This tooling must be integrated alongside the approved MMCQ analyser changes.
  The baseline analyser is deliberately rejected, not silently upgraded here.
- Use Node with native TypeScript stripping (Node 22.18+ recommended) and installed
  application dependencies. `analyseImage` is dynamically imported directly from
  `lib/photographs/analyse-image.ts`; its transitive imports must work in Node.
- Inspect live table types, constraints and triggers against the release schema.
  Photograph triggers stay enabled, but this tool never fires them through DML.
- Stop/coordinate admin uploads, deletions and edits for the operation window.
  Full photograph rows—including text and revisions—are frozen. A text-only edit
  is enough to reject apply **or rollback**. Never "fix" this by editing artifacts.
- Supply R2 credentials through an already-approved process environment, never
  CLI arguments or files created by this tool:
  `CLOUDFLARE_S3_API_ENDPOINT`, `CLOUDFLARE_ACCESS_ID`,
  `CLOUDFLARE_SECRET_KEY`, `CLOUDFLARE_R2_BUCKET=elliotmairet`.
  These are needed only for prepare and a non-replay apply. No Supabase API key,
  admin password, staging bucket, or HTTP catalogue access is used.
- Choose a durable **new** run directory outside source control, under a private
  parent directory. Snapshot creates the run directory with mode 700 and refuses
  existing paths. Files are mode 600, fsynced, atomically/exclusively published;
  the tool never overwrites artifacts. Keep private backup copies of the whole
  directory and independently record the printed snapshot/manifest SHA-256 pins.

## Commands

Substitute `RUN`, `CONTAINER`, `SNAPSHOT_SHA`, and `MANIFEST_SHA` below with the
operator-verified values. Every option uses `--name=value` syntax.

```bash
node scripts/backfill-mmcq-palettes.mjs help

node scripts/backfill-mmcq-palettes.mjs snapshot \
  --run=RUN --container=CONTAINER --palette-table=photo_palette_colours

node scripts/backfill-mmcq-palettes.mjs prepare \
  --run=RUN --palette-table=photo_palette_colours --snapshot-sha256=SNAPSHOT_SHA

node scripts/backfill-mmcq-palettes.mjs verify \
  --run=RUN --container=CONTAINER --palette-table=photo_palette_colours \
  --manifest-sha256=MANIFEST_SHA

node scripts/backfill-mmcq-palettes.mjs apply \
  --run=RUN --container=CONTAINER --palette-table=photo_palette_colours \
  --manifest-sha256=MANIFEST_SHA --confirm=elliotmairet

node scripts/backfill-mmcq-palettes.mjs rollback \
  --run=RUN --container=CONTAINER --palette-table=photo_palette_colours \
  --manifest-sha256=MANIFEST_SHA --confirm=elliotmairet
```

Run `verify` after apply/rollback. It prints `before`, `after`, or `stale` using
typed full-row comparisons of the complete catalogue and all four tables. It uses
only session-local temporary staging and a repeatable-read **READ ONLY** inspection
transaction, never public DML. Snapshot is one repeatable-read READ ONLY
transaction and returns all rows, without a PostgREST pagination/1000-row limit.

## Preparation and integrity

Preparation is sequential. For **every** photograph, HEAD the exact original key
in `elliotmairet`, GET with `IfMatch` ETag, check HEAD/GET ETag, byte count and
`sourcesha256` identity, bound streamed bytes to 512MiB, and SHA-256 the actual
bytes. Recorded `sourcesha256` must be valid and match the bytes. The identity
records absence of metadata explicitly; a later addition/removal also rejects
resume/apply. No originals are retained, and no missing original is skipped.

The app's exact payload is validated: approved model `mmcq64-vibrant-oklab-v1`,
two passes, 256px sample setting, actual 1–5 counts, contiguous ordered ranks,
equal RGB/hex/weights between spaces, six-decimal weight rounding and total
tolerance 0.000005, finite/recomputed coordinates, and minimum OKLab separation
0.055. It does not implement a second sampler, quantizer or application mapper.

The trusted archive path explicitly permits at most **150,000,000 input pixels**.
The 2026-11-05 catalogue contains one 145,908,224-pixel legacy original that exceeds
the current upload guard. The shared sampler accepts this bounded operator-only
option without changing its 256px sampling or colour calculations. Public upload
metadata and analysis retain their **120,000,000-pixel default**, and the upload
route never passes the archive option. Byte limits remain 512MiB. The allowance
is recorded in the frozen preparation artifact; changed preparation policy/code
requires a new run, not editing or reusing old journals.

`preparation.json` pins analyser/palette source hashes, Node version and complete
`sharp.versions` and the explicit archive input allowance. Each completed photograph has an exclusive checksummed JSON
journal containing the exact app payload and original identity/byte SHA-256.
Rerun the same prepare command to resume: rehash each journal, validate its payload
and bindings, re-HEAD its original, and reject changed code/Sharp/runtime. No
redownload is needed for valid completed journals. Incomplete `.pending-*` files
from interruption are ignored; completed files are never overwritten.

`desired.json` and `manifest.json` are frozen only after the full catalogue is
prepared. The externally pinned manifest covers the immutable before snapshot,
preparation record, every journal, and desired rows. These artifacts—including
everything required for rollback—exist **before any apply**. Checksums protect
integrity, not against someone with access replacing files *and* all independently
recorded pins. Keep the pins separate from the writable directory.

## Atomic apply / rollback

Apply first classifies database state. Exact `after` is a no-write replay, even
without R2 credentials. Otherwise require `before`, immediately re-HEAD **all**
originals, then rehash the frozen artifacts. No remote R2 IO occurs inside the
database transaction.

The write transaction stages expected-before and desired-after into temporary
tables using destination `real`, timestamp and other types. This avoids false
staleness from JavaScript/float4 representation or normalized time zones. It
explicitly selects **READ COMMITTED**, regardless of the session default, so a
writer committed while it waits for locks cannot remain hidden by an older
staging snapshot. It
validates desired invariants, then takes `SHARE` on photographs followed by
`SHARE ROW EXCLUSIVE` on the four palette tables in a fixed order. Public reads
remain possible; catalogue/palette writers wait. Lock timeout is 5 seconds;
statement/idle transaction timeouts are 60 seconds. Remote process timeout is
180 seconds. Preparation/downloads are never performed while holding locks.

Under locks, schema and **complete typed rows**, not just counts/timestamps, are
checked again. Only exact expected state is replaced; partial/stale state aborts.
Children are removed before analysis rows; analyses are inserted before children.
Final exact target-state comparison precedes the single commit. Any exception
rolls back both colour spaces. No persistent run ledger/function is created.

Rollback requires exact frozen after state (including full photographs), restores
the exact before rows, original timestamps and absent analyses, and commits both
spaces together. Exact before state is a harmless already-rolled-back replay.
It never restores or rewrites photograph/text rows. Later palette/text/catalogue
changes intentionally block rollback and require a separately reviewed recovery.

SSH/psql failure, process timeout or interruption near commit has an **uncertain
outcome**. Never infer success or failure from disconnect alone: run `verify` with
the original pinned manifest first. `after` means applied, `before` means not
applied/restored, `stale` means stop and investigate. Replay detection is
state-based, not a permanent history of executions. Errors intentionally suppress
raw SDK/SSH/SQL diagnostics so credentials and catalogue content are not logged.

HEAD protects against observed source drift; it cannot lock R2 against a later
external mutation. Original keys must remain immutable during the apply window.
Cache invalidation, application deployment and owner acceptance are separate
operator steps; this script does not perform them.

## Offline checks

```bash
node --test scripts/backfill-mmcq-palettes.test.mjs
DOCKER_HOST=unix:///Users/dexteryoung/.colima/elliot-palette-tests/docker.sock \
  node --test scripts/backfill-mmcq-palettes.sql.test.mjs
```

The SQL suite refuses any other Docker daemon, never changes global contexts,
and starts only its own random `--rm --network none` Postgres 15 container (matching
the production major version), with no ports or mounts. It may pull
`postgres:15-alpine` first. It stops only that
container, not the VM. Its test-only photograph trigger/sentinel must remain
untouched by backfill DML. Tests cover apply/rollback/replays, missing analyses,
typed precision/timestamps, same-count stale changes, source/text/catalogue drift,
partial states, schema/trigger drift, invalid desired rows, and forced failure
between CIELAB and OKLab writes. Independent connections also cover committed
catalogue/palette writers during lock waits, lock timeout with public reads still
available, and racing applies resulting in one transition plus one replay.
No production credentials or `.env` files are
used by either suite.
