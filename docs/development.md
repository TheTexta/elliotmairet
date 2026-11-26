# Development and configuration

## Runtime and services

Use Node.js 22 or later and npm with the committed `package-lock.json`:

```bash
npm ci
cp .env.example .env.local
```

Edit `.env.local` before starting the application. This repository does not
provision an isolated Supabase/R2 environment. Its example image/media origins
point to shared services, and omitting the Supabase URL defaults to
`https://api.dextery.dev`. Local admin actions can therefore mutate a real
catalogue; use an explicitly approved target.

The application uses Next.js App Router, React, TypeScript, Tailwind CSS v4,
Motion, Supabase Postgres/Auth and Cloudflare R2. Sharp, `exif-reader` and `exifr`
handle image analysis and capture dates. Exact versions and commands are in
[`package.json`](../package.json); dependency refresh evidence and compatibility
exceptions are in [`dependency-updates.md`](dependency-updates.md).

## Environment

| Variables | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API origin; set explicitly for the intended environment. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required public client key. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL` | HTTPS published-image base, including the project prefix, e.g. `https://images.dextery.dev/elliotmairet`. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_MEDIA_URL` | Example/compatibility media base; present in the template but not currently read by application code. |
| `CLOUDFLARE_S3_API_ENDPOINT` | Server-only R2 HTTPS origin, without a path, query or embedded credentials. |
| `CLOUDFLARE_ACCESS_ID`, `CLOUDFLARE_SECRET_KEY` | Server-only R2 credentials for upload/publication and object maintenance. |
| `CLOUDFLARE_R2_BUCKET` | Published bucket; the example is `elliotmairet`. |
| `CLOUDFLARE_R2_STAGING_BUCKET` | Separate private staging bucket; the example is `elliotmairet-staging`. |

Public catalogue browsing/builds need the Supabase public configuration and
working image delivery, not R2 write credentials. Admin object operations require
the complete R2 server configuration. The two buckets must be different; never
expose staging through public delivery.

Without the public R2 image base, photograph URLs use Supabase Storage's
`elliotmairet` bucket. Do not switch delivery merely by editing an environment
variable: use the [storage verification gates](photograph-storage.md#delivery-cutover).
The image loader also retains production-specific legacy Supabase URL handling;
a different backend/image origin needs verification against
[`next.config.ts`](../next.config.ts) and
[`lib/photographs/image-loader.ts`](../lib/photographs/image-loader.ts).

Leave `OPENAI_API_KEY`, `PHOTOGRAPH_TEXT_WORKER_SECRET` and `CRON_SECRET` empty
for ordinary browsing development. They configure paid automatic-text work, not
basic startup. An OpenAI key alone does not configure the worker. See
[automatic-text configuration](photograph-text-generation.md#automatic-configuration-and-deployment)
before enabling it or diagnosing queued local edits.

Keep all privileged credentials server-side and out of Git, logs and
`NEXT_PUBLIC_*`. Normal admin operations use authenticated users and RLS, not a
service-role key. Configure the corresponding Vercel environment explicitly and
redeploy after rotating a public client key.

## Schema and admin access

The target database must already have the schema in
[`supabase/migrations`](../supabase/migrations). Catalogue reads are required for
development and `npm run build`, which prerenders public routes from Supabase;
an unreachable or unmigrated catalogue can fail the build. A frontend install
does not create or migrate that database.

For a new backend, have an authorized operator review/apply the migration chain
before running the app. Existing production migrations are immutable history:
do not replay, reset or alter a shared database as routine setup. See the
[text rollout guide](photograph-text-generation.md#migration-compatibility-and-rollout)
for additive-migration ordering and worker enablement gates.

Admin authorization uses Supabase Auth and `private.admin_users`. After explicit
authorization to provision an account, create its Auth user and allowlist it in
the target database:

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
```

An Auth login alone is not an admin grant. Preserve server-side checks, RLS,
publication reservations and provider-aware cleanup.

## Run locally

```bash
npm run dev
```

Open <http://localhost:3000>; authorized administrators sign in at
`/admin/login`. For a production-mode local server, run `npm run build` followed
by `npm run start`; the build contacts the configured Supabase catalogue.

## Checks and rollout boundary

After installing dependencies, these application suites use offline fixtures:

```bash
npm run lint
npm run test:upload
npm run test:palette
npm run test:similarity
npm run test:images
npm run test:admin
npm run test:text
npm run test:layout
npm run test:palette:backfill
```

There is no `typecheck` package script. CI runs `npx --no-install next typegen`
then `npx --no-install tsc --noEmit --incremental false`.
[`checks.yml`](../.github/workflows/checks.yml) runs on pushes and pull requests
with Node 22, `npm ci`, lint, those type checks and the upload, palette, similarity,
images, admin and text suites. It also installs Chromium/OS dependencies and runs
the finite `test:colour-browser` fixture. Layout and palette-backfill checks are
additional local commands, not currently listed in that workflow.

For the isolated colour-recovery browser checks:

```bash
npx --no-install playwright install chromium # Once, after npm ci
npm run test:colour-browser
```

The repository pins Playwright as a dev-only dependency. The finite runner starts
an ephemeral loopback fixture, waits at most 30 seconds for its mounted assertions,
fails on browser errors/unexpected runtime requests and closes browser/server in
`finally`. Only the fixture's HTML/JS/CSS paths are permitted; all other browser
network traffic is blocked. No Next server, environment files or production
requests are used. Actual selection/hero/gallery effects, palette decoder/cache
and matching code run against fictional data. Motion and thumbnails are adapters;
the fixture compiles public Tailwind utilities, with a system-font substitute for
the production Montserrat download. It checks normal/reduced motion, native
keyboard Retry/focus, 320px/desktop layout and 200% text sizing, not real photograph
delivery, font metrics or screen-reader speech. For optional fixture screenshots,
set `COLOUR_TEST_SCREENSHOTS` to a local output directory.
`node scripts/test-colour-selection-browser.mjs` still serves the same fixture for
interactive inspection; stop it after use.

`test:upload` exercises the actual POST route/session gate with synthetic DB/R2
adapters and real Sharp metadata: access denial, MIME/content mismatches,
reservations, signing/copy/commit failures and idempotent publication replay.
It is not live R2/RLS acceptance; palette analysis, delivery-source generation,
RPC internals and background AI execution have separate coverage.

`test:text:db` creates its own disposable, network-isolated Docker Postgres
fixture; see [its safeguards](photograph-text-generation.md#verification).
`test:palette:backfill:db` requires an explicitly isolated Docker endpoint; see
[`mmcq-backfill.md`](mmcq-backfill.md#offline-checks). Never point fixture SQL at
an existing database.

CI intentionally omits `build`: Vercel's catalogue-reading build remains a
separate deployment gate. Green offline checks do not prove database reachability,
live permissions, successful deployment or authenticated upload acceptance.
Verify a visible Actions run after an authorized push. Deliberately testing a
failing remote assertion belongs on a separately approved disposable branch;
adding the workflow locally is not evidence that this remote check was exercised.
Production uploads, deletions, migrations, paid requests and deployments require
their own approval.
