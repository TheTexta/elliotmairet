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
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL=https://images.dextery.dev/elliotmairet
NEXT_PUBLIC_CLOUDFLARE_R2_MEDIA_URL=https://media.dextery.dev/elliotmairet
```

The public key is required; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works.
Set the same key for the appropriate Vercel environments and redeploy after
rotating it. The Cloudflare credentials must remain server-only. The public R2
URL uses the shared image hostname and project prefix; leave it
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
served through Cloudflare Image Transformations. The shared Worker is managed
from `bur1alrites/cloudflare-assets/`: `/elliotmairet/` maps to the published
`elliotmairet` bucket and never changes photograph storage paths. Existing
`images.dextery.dev/uploads/...` URLs keep working. The private staging bucket
is not bound to the shared Worker. Media delivery is available under
`https://media.dextery.dev/elliotmairet/` with the same object keys.

Photographs above Cloudflare's input limits retain their full originals and
catalogue paths. Upload publication also prepares a WebP of at most 5120 pixels
under `__image-sources/`; metadata connects it to the original for transformations.
The shared Worker verifies that both objects refer to the same source checksum.
Original URLs still serve the original bytes. The existing publication reservation
and cleanup job cover both objects, including failed publication and deletion.
Prepare existing oversized photographs with `npm run storage:prepare:images`
(dry run), then `npm run storage:prepare:images -- --copy`. Reruns verify existing
delivery copies and preserve original bytes and metadata.

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

### Backend DNS and changing public IPs

Supabase is hosted on `gmkserver.tail077753.ts.net`, with public endpoints
`api.dextery.dev` and `studio.dextery.dev`. Cloudflare is authoritative for
`dextery.dev`. When the server's public IPv4 changes, both existing A records
must follow it. The former Vercel DDNS updater updates an inactive DNS provider
and cannot repair these Cloudflare records.

The replacement is `scripts/infra/cloudflare-ddns.py` (Python 3 and curl).
It checks both existing records before writing, changes only their IP content,
preserves TTL/proxy settings, and verifies each update. It defaults to a dry run;
`--apply` enables changes. A failed or partial update exits nonzero and can be
rerun safely.

Use a separate Cloudflare API token with **Zone → DNS → Edit** permission scoped
to `dextery.dev`. Store a JSON configuration outside the repository:

```json
{"zone_id": "626cad70f16d48eb7a7115d323ad42b5", "token": "YOUR_DNS_TOKEN"}
```

On the server, stage this configuration as `cloudflare-ddns.json` alongside the
updater and `scripts/infra/install-cloudflare-ddns.sh`, in a private directory
(directory mode `700`, configuration mode `600`). Run the installer with sudo.
If no staging configuration exists, it prompts for the token securely through
the terminal and creates the private configuration there.
It first performs a dry run, backs up the existing systemd service and timer,
replaces `dextery-ddns.service`, and retains the existing five-minute timer.
The installed configuration is root-owned at `/etc/dextery-cloudflare-ddns.json`
with mode `600`; the staging configuration is removed after successful installation.
The previous Vercel script and credentials are left in place for rollback.

Inspect updater results with `journalctl -u dextery-ddns.service`, and check
authoritative DNS with `dig @dahlia.ns.cloudflare.com api.dextery.dev A`.
Do not add the DNS token to Vercel or expose it through `NEXT_PUBLIC_*` variables.
Run the updater's safety checks with
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/infra -v`.

When sudo access is unavailable, stage `install-cloudflare-ddns-user.sh` with
the updater and private configuration and run it as `dextery`. This installs
the updater in `~/.local/share/dextery-ddns`, protects the directory and token,
backs up and preserves existing user cron entries, and adds a five-minute
Cloudflare job with a lock to prevent overlapping runs. Inspect it with
`crontab -l` and read `~/.local/share/dextery-ddns/update.log`. The cron job runs
after reboot without an interactive login. The old root-owned Vercel timer is
left enabled until someone with sudo disables it; it does not update the
authoritative Cloudflare records. Use one Cloudflare scheduler at a time.

### Admin accounts

Open `/admin/login`. Create the user in Supabase Auth, then allowlist the user
in the database:

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'admin@example.com';
```

The admin layout supports screens from 320px wide. Below 1280px, photographs
use compact cards with wrapping metadata, and upload and edit panels expand
inline so their fields and actions stay within the page. At 1280px and above,
the archive uses its six-column layout and panels open as desktop popovers.
Headers can wrap, and navigation controls retain accessible labels when their
visible text is hidden on phones.

On `/admin/photos`, uploads show a local thumbnail, filename, file size, and an
**Uploading** status through preparation, transfer, and photograph processing.
Selecting an image fills the editable Captured date from its EXIF capture or
creation metadata (JPG, PNG, and WEBP). If no valid embedded date is available,
the form uses the existing `YYYYMMDD-` filename convention, then the file's
modification date in the browser's local timezone. Browsers do not expose the
filesystem creation timestamp. The form identifies the date source and preserves
manual edits while metadata is being read.
The upload panel, photo details, Content navigation, and sign-out are locked
while requests are active. Reloading or closing the tab triggers the browser's
native warning where supported. After publication is confirmed, the panel stays
open with **Uploaded**, **Close**, and **Upload another** controls.

Failures retain the selected file and details and allow the panel to close.
Preparation and transfer failures can restart the upload. Publication failures
offer **Retry publication**, which reuses the original object paths and metadata
so a lost response does not create another photograph. Those details remain
locked for that retry; **Choose another photo** clears the attempt. Abandoned
objects continue through the existing storage cleanup workflow.

The storage housekeeping panel lists objects represented by
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
npm run test:upload     # Run upload workflow tests
npm run test:palette    # Run OKLab feature extraction tests
npm run test:similarity # Run photograph similarity tests
```
