# Photograph storage and publication

Supabase stores catalogue metadata, palettes, Auth and admin permissions.
New image objects use private R2 staging and a separate published bucket.
Presence in `public.photographs` is publication; there is no separate published
flag. Preserve filenames, `storage_path`, checksums and provider-aware cleanup.
This guide describes code/contracts, not a fresh inventory of deployed objects.

## Upload and publication

The browser uploads JPEG, PNG or WebP to a presigned key in the private
`elliotmairet-staging` bucket. The server validates the staged image, prepares
palette/delivery metadata, copies to published `elliotmairet`, then commits the
catalogue row. Encoded uploads are limited to **512 MiB** and decoded images to
**120 million pixels**. Staging must never be bound to public delivery.

[`app/api/admin/photos/route.ts`](../app/api/admin/photos/route.ts) retains auth,
HTTP responses, cache invalidation and non-blocking automatic-text scheduling.
The phase decoder and prepare/publish orchestration live in
[`publication.ts`](../lib/photographs/publication.ts), using the authenticated
Supabase client and concrete R2 adapters. New metadata is decoded after replay
detection and image inspection, preserving retry identity and EXIF date fallback.
Reservation/copy/commit/cleanup order and separate CIELAB/OKLab payloads are
covered through the actual route by `test:upload`.

### Capture dates and recovery

The dedicated `/admin/photos/upload` workspace shows a local preview, filename,
size and status through preparation, transfer and processing. Capture date comes
from valid EXIF capture/creation metadata, then the `YYYYMMDD-` filename convention,
then browser-local file modification date. Browsers do not expose filesystem
creation time. The form identifies the source and preserves manual edits while
metadata loads.

Active requests lock shared navigation/sign-out; prepared files warn before
leaving, and reload/close uses the native browser warning where supported.
Confirmed success offers return to the gallery or another upload. Failure retains
the selected file/details and permits leaving the workspace. Prepare/transfer
failures can restart; **Retry publication** reuses the original paths and locked
metadata so a lost response does not create another photograph. **Choose another
photo** clears that attempt, not its tracked cleanup obligations.

### Cleanup

Failed/abandoned work remains represented in `private.storage_cleanup_jobs`.
Jobs record the provider: pre-R2 jobs still clean Supabase Storage, while new jobs
target R2. In **Photos → Photo tools**, file maintenance exposes status and paths.
Do not bypass it with untracked object deletion.

Uploads reserve a staged key while publishing. An unfinished reservation remains
visible for roughly two hours; after that waiting period an admin can use
**Remove unused file**. The action checks the database again and refuses objects
belonging to a published photograph. Deletion can also leave pending cleanup if
published-object removal fails. The same job covers originals and any generated
delivery source, including partial failures.

## Delivery cutover

These are operator tools, not installation steps. Obtain approval for the exact
target and write operation; inspect configuration and preserve rollback objects.
The scripts load `.env.local` and contact configured services even in dry-run mode.

Inspect the catalogue without writing:

```bash
npm run storage:migrate:r2
```

Only with separate copy authorization:

```bash
npm run storage:migrate:r2 -- --copy
```

The copy retains each `storage_path`, reads R2 objects back and verifies SHA-256.
It is resumable; verified source-SHA metadata allows later runs without a Supabase
source. It also reconciles published objects to the one-hour revalidating cache
policy without changing bytes. It does not delete/modify the Supabase source.

Only after every object is verified and the delivery endpoint is ready, set
`NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL` and obtain approval to redeploy. Leaving
that value unset uses legacy Supabase Storage delivery; it is a viable fallback
only if the relevant originals still exist there. Do not assume new R2 uploads
have Supabase copies.

The shared image Worker maps `/elliotmairet/` to the published bucket without
changing keys and supports Cloudflare Image Transformations. Legacy
`images.dextery.dev/uploads/...` URLs are compatibility contracts. Original media
delivery uses `https://media.dextery.dev/elliotmairet/` with the same keys.
The Worker is external to this repository. Earlier notes referenced
`bur1alrites/cloudflare-assets/`; verify the current owning repository and
deployment procedure before changing shared infrastructure, rather than treating
that historical path as a publish instruction.

## Oversized originals

Photographs above Cloudflare's input limits retain full originals and canonical
paths. Publication creates a WebP of at most **5120px** under `__image-sources/`;
metadata connects it to its original. The shared Worker verifies source-checksum
agreement before using it for transformations. Original URLs still serve original
bytes.

For existing oversized photographs, inspect first:

```bash
npm run storage:prepare:images
```

With separate write approval:

```bash
npm run storage:prepare:images -- --copy
```

Reruns verify delivery copies and preserve original bytes/existing metadata while
adding source-checksum/delivery-pointer metadata. Cleanup and publication
reservations cover both objects. See `test:images` for source/configuration tests;
offline fixtures are not live Worker or upload acceptance.
