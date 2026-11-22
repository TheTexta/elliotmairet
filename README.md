# Elliot Mairet

Photography portfolio and archive for [Elliot Mairet](https://elliotmairet.com).
The public site combines an uncropped, colour-composed gallery, photograph pages
and browser-side colour matching. Authorized admins upload/manage photographs,
edit site content and review text suggestions through `/admin`.

## Requirements

- Node.js **22+** and npm; use the committed lockfile.
- A reachable Supabase Postgres/Auth backend with the schema in
  [`supabase/migrations`](supabase/migrations). Development and production builds
  read the configured catalogue; this repository does not provision a backend.
- Working image delivery. Admin object operations additionally require separate
  private-staging/published R2 buckets and server-only credentials.

## Local development

```bash
npm ci
cp .env.example .env.local
```

Before starting, edit `.env.local` for the approved target:

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted).
- Set `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL` for that catalogue. Without it,
  photographs use legacy Supabase Storage; verify objects before any cutover.
- Configure `CLOUDFLARE_*` server credentials/buckets only for authorized R2 work.
  Leave OpenAI/worker/cron secrets empty for ordinary browsing development.

**The example delivery origins and default Supabase URL point to shared services.**
Local admin actions are not isolated. Keep privileged keys out of Git and
`NEXT_PUBLIC_*`; migrations, uploads, deletion and paid generation are not setup
checks. See [configuration and admin provisioning](docs/development.md).

```bash
npm run dev
```

Open <http://localhost:3000>; existing allowlisted admins use `/admin/login`.
For production mode, run `npm run build` then `npm run start`. The build contacts
Supabase to prerender routes and can fail if the database/schema is unavailable.

## Architecture

- Next.js App Router, React, TypeScript, Tailwind CSS v4 and Motion; Sharp image
  analysis stays server-side. Public/admin route groups separate their layouts.
- Supabase owns metadata and per-user admin authorization. A catalogue row means
  public availability; filename-based URLs and storage paths remain stable.
- R2 uploads reserve private staging, validate/copy, then commit publication;
  recoverable, provider-aware cleanup handles partial failures.
- Public routes use daily revalidation plus admin-triggered cache invalidation.
  One server-rendered image tree serves both colour-masonry breakpoint plans.
- Photograph pages are image-only; the footer biography also supplies the homepage
  description. Admin components retain scoped monochrome, square-edged styling.

## Checks and documentation

Start with `npm run lint`; the [development guide](docs/development.md#checks-and-rollout-boundary)
lists offline suites, type checks, isolated database tests and the CI/build boundary.
Builds, operational scripts and live acceptance are not offline checks.

- [Gallery, colour layout, image delivery and metadata](docs/public-gallery.md)
- [Storage, publication, cleanup and delivery cutover](docs/photograph-storage.md)
- [Admin workflow and release records](docs/admin-usability-plan.md#current-workflow)
- [Text generation, budgets and recovery](docs/photograph-text-generation.md)
- [Palette model](docs/palette-extraction.md) and [guarded backfill](docs/mmcq-backfill.md)
- [UI components](components/ui/README.md), [design system](DESIGN.md) and [product context](PRODUCT.md)
- [Dependency maintenance](docs/dependency-updates.md) and [backend DNS runbook](docs/backend-dns.md)
