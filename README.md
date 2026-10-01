# Elliot Mairêt

A Next.js photography archive backed by Supabase Postgres and Auth, with
photograph objects stored in Cloudflare R2. The public site contains the gallery;
authorized users can manage photographs and site content from the admin area.

When the public site is embedded in the project browser at `dextery.dev`, links
report their destinations to the parent portfolio so they open as the top-level
page. Standalone browsing and admin navigation are unchanged. The bridge also
accepts local portfolio development origins.

## Setup

Requires Node.js 22 or later.

```bash
npm install
```

Set these variables in `.env.local` before running `npm run dev`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
CLOUDFLARE_S3_API_ENDPOINT=
CLOUDFLARE_ACCESS_ID=
CLOUDFLARE_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=elliotmairet
CLOUDFLARE_R2_STAGING_BUCKET=elliotmairet-staging
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL=
```

The public key is required; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works.
Set the same key for the appropriate Vercel environments and redeploy after
rotating it. The Cloudflare credentials must remain server-only. The public R2
URL must be an HTTPS custom domain attached to the published bucket; leave it
unset until the existing catalogue has been copied and verified. While it is
unset, public photograph URLs continue to use Supabase Storage. Open
<http://localhost:3000> after starting the dev server.

Apply the SQL files in `supabase/migrations` to the target database before
deploying. The public gallery and admin tools depend on that schema, and
`npm run build` reads the catalogue from Supabase to prerender the public pages,
so a build fails if the database is unreachable or not yet migrated.

## Static rendering

The home page, every `/gallery/[filename]` page, the sitemap, and
`/api/gallery/palettes` are prerendered and revalidated daily. Admin changes
expire the relevant cache tags, so updates appear on the next request; photos
uploaded after a deploy render on their first visit and are cached afterwards.
Changes written directly to the database (for example the OKLab backfill) appear
after the daily revalidation or the next admin change.

Photo pages compute colour matches in the browser from the cached
`/api/gallery/palettes` JSON, so browsing by colour does not invoke a server
function.

## Photograph storage

New uploads are sent by the browser to a presigned key in the private
`elliotmairet-staging` R2 bucket. The server validates the staged image, copies
it to the published `elliotmairet` bucket, and then publishes the database row.
Failed or abandoned work remains represented by the existing database cleanup
jobs so an admin can retry object removal safely.

Before switching public delivery from Supabase Storage, inspect the catalogue
without writing anything:

```bash
npm run storage:migrate:r2
```

Copy every catalogue object to its existing `storage_path` in R2 and verify the
bytes with SHA-256:

```bash
npm run storage:migrate:r2 -- --copy
```

The command is resumable and reads every R2 object back before reporting it as
verified. Objects carrying verified SHA-256 metadata no longer require the
Supabase source on later runs. The command also reconciles published objects to
the one-hour revalidating cache policy without changing their bytes. It does not
delete or modify the Supabase source. Once every object is verified and the R2
custom domain is active, set
`NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL` and redeploy. Responsive images are then
served through Cloudflare Image Transformations.

## Colour features

The live CIELAB palette model remains in `photo_palette_analyses` and
`photo_palette_colours`. This preview also extracts five weighted medoids in
OKLab and stores them independently in `photo_oklab_analyses` and
`photo_oklab_features`. Upload publication writes both representations in one
transaction, without changing or replacing the live palette fields.

The preview prefers OKLab features for each photograph and falls back to its
CIELAB palette until that photograph has been processed. Similarity matching
only compares photographs that use the same feature space.

After applying the OKLab migration, backfill the existing catalogue with an
authorized admin account. Server environments that already provide
`SUPABASE_SERVICE_ROLE_KEY` can run the command directly:

```bash
npm run features:backfill:oklab
```

Otherwise, authenticate as an allowlisted admin:

```bash
read -s SUPABASE_ADMIN_PASSWORD
export SUPABASE_ADMIN_PASSWORD
SUPABASE_ADMIN_EMAIL=admin@example.com npm run features:backfill:oklab
unset SUPABASE_ADMIN_PASSWORD
```

The command reads photograph originals from R2 and writes analysis data to
Supabase. Configuration is loaded from `.env.local`. The admin password is used
only for the command's Auth session and must not be added to an environment file
or committed.

## Admin access

Open `/admin/login`. Create the user in Supabase Auth, then allowlist the user
in the database:

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
```

On `/admin/photos`, the storage housekeeping panel lists objects represented by
cleanup jobs. Each job records its storage provider, so jobs created before the
R2 migration continue to clean up Supabase Storage while new jobs target R2.
Uploads reserve a staged key while they are being published. If publication
does not finish, the reservation remains visible for about two hours so the
upload has time to complete. After that waiting period, an admin can use
**Remove unused file** to delete the staged object and clear the reservation.
Deleted photographs can also leave a cleanup item if published-object removal
fails. The action checks the database again before removing an object and will
refuse to remove one belonging to a published photograph. Technical paths and
recorded status messages are available in each item's details.

## Commands

```bash
npm run dev             # Start the development server
npm run build           # Create a production build
npm run start           # Start the production server
npm run lint            # Run ESLint
npm run test:palette    # Run OKLab feature extraction tests
npm run test:similarity # Run photograph similarity tests
```
