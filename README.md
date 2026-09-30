# Elliot Mairêt

A Next.js photography archive backed by Supabase. The public site contains the
gallery; authorized users can manage photographs and site content from the
admin area.

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
```

The public key is required; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works.
Set the same key for the appropriate Vercel environments and redeploy after
rotating it. Open <http://localhost:3000> after starting the dev server.

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

The command reads Supabase configuration from `.env.local`. The admin password
is used only for the command's Auth session and must not be added to an
environment file or committed.

## Admin access

Open `/admin/login`. Create the user in Supabase Auth, then allowlist the user
in the database:

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
```

On `/admin/photos`, the storage housekeeping panel lists files that are not in
the public photograph archive. Uploads reserve a file path while they are being
published. If publication does not finish, the reservation remains visible for
about two hours so the upload has time to complete. After that waiting period,
an admin can use **Remove unused file** to delete the stored object and clear
the reservation. Deleted photographs can also leave a cleanup item if storage
removal fails. The action checks the database again before removing a file and
will refuse to remove one belonging to a published photograph. Technical paths
and recorded status messages are available in each item's details.

## Commands

```bash
npm run dev             # Start the development server
npm run build           # Create a production build
npm run start           # Start the production server
npm run lint            # Run ESLint
npm run test:palette    # Run OKLab feature extraction tests
npm run test:similarity # Run photograph similarity tests
```
