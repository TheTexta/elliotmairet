# Site Audit Implementation Plan

## Status

Approved implementation plan based on the whole-site compatibility, image-delivery, hardening, maintainability, and migration audit.

This document records the accepted scope and the implementation order. It does not authorize the rejected hardening work listed below.

## Confirmed decisions

- Preserve the current gallery presentation:
  - two columns below 768 CSS pixels;
  - three columns at and above 768 CSS pixels;
  - the current one-sixth viewport gutters from the `sm` breakpoint upward.
- Preserve the current detail-view composition: photographs remain contained inside the 80vh frame.
- Raise the self-hosted image-transformation ceiling from its observed 2000-pixel clamp to 5120 pixels.
- Use quality 82 for the final full-view photograph.
- Load the responsive quality-82 full-view photograph directly, without a separate preview or image-upgrade stage.
- Keep the unused `Analytics` import and `@vercel/analytics` dependency unchanged. Do not render, rename, suppress, or remove the import as part of this work.
- Implement only hardening priority 1: bound photograph uploads. All other hardening proposals from the audit are rejected and out of scope.
- Complete the other migration cleanup, dead-code cleanup, performance work, and maintainability refactors described here.

## Explicitly out of scope

Do not implement any of the following:

- application security headers or removal of `X-Powered-By`;
- EXIF, XMP, or IPTC stripping;
- private-original/public-derivative storage changes;
- MFA, CAPTCHA, passkeys, or additional login throttling;
- changes to the production-default Supabase configuration or embedded public key;
- new rate limiting for the public colour endpoint;
- unrelated dependency upgrades;
- removal or use of the empty `Analytics` import.

## Target outcomes

1. Gallery thumbnails request an image appropriate to their actual two- or three-column rendered width.
2. Full-view landscape and portrait photographs remain sharp through a 4K viewport at 2x device pixel ratio when their originals contain enough source pixels.
3. Detail pages load one responsive quality-82 image without duplicate preview requests.
4. The upload pipeline rejects files larger than a documented high limit at the browser, application, and Storage layers while retaining Sharp's 120-megapixel decoded-image limit.
5. Public routes stop doing unnecessary authenticated/cookie-aware data work and can use explicit cache invalidation.
6. Admin pages no longer render or fetch the public footer.
7. Legacy palette tables, migration support files, completed backfill tooling, and identified dead files are removed safely.
8. The active palette schema uses final names without `_new` suffixes.

## Phase 1: Baseline and regression coverage

Before changing behavior:

- Record the current route manifest, production build result, Lighthouse results, and response-size measurements.
- Add browser coverage for these viewport/DPR combinations:
  - 320x568 at 3x;
  - 390x844 at 3x;
  - 640x960 at 2x;
  - 768x1024 at 2x;
  - 1024x768 at 2x;
  - 1440x900 at 2x;
  - 2560x1440 at 2x;
  - 3840x2160 at 1x and 2x.
- Exercise the archive, a landscape detail view, a portrait detail view, the login view, and authenticated admin layouts.
- Assert at every supported viewport:
  - no horizontal document overflow at or above the intentional 320-pixel minimum;
  - the intended two- or three-column count;
  - stable image aspect ratios and zero avoidable layout shift;
  - no overlap between fixed navigation and primary content;
  - correct keyboard focus and reduced-motion behavior.
- Add unit coverage for image-size strings and selected source candidates.
- Add route coverage for photograph queries, upload preparation/publication, colour matching, and cache invalidation.
- Add database integration coverage for public reads, admin mutations, Storage policies, and the palette compatibility/final schemas.
- Preserve the existing similarity tests. Remove their Node module-type runtime warning only if it can be done without changing the application module format.

The intentionally unused `Analytics` import will continue to produce its current lint warning.

## Phase 2: Upload-limit hardening

### Limit definition

Keep Sharp's existing:

```ts
const maximumInputPixels = 120_000_000;
```

Set the maximum encoded upload size to 512 MiB:

```ts
const maximumUploadBytes = 536_870_912;
```

Pixels and encoded bytes are different units and cannot be matched exactly. The 512 MiB limit is deliberately high and roughly covers a 120-million-pixel, four-channel decoded image while still placing a finite bound on Storage and application memory exposure.

### Storage enforcement

- Use the Supabase CLI to create a new imperative migration; do not invent or hand-edit an applied migration filename.
- Set `storage.buckets.file_size_limit` to `536870912` for the `elliotmairet` bucket.
- Preserve the existing JPEG, PNG, and WebP MIME allowlist.
- Do not alter the existing Storage RLS model or enable upserts.

### Application enforcement

- Put the upload-byte limit in one shared server/client-safe photograph configuration module.
- Reject an oversized browser `File` before the prepare request.
- Reject a missing, non-integer, negative, or oversized claimed size during the prepare phase.
- During publication, check the downloaded Storage `Blob.size` before calling `arrayBuffer()` or constructing a Node `Buffer`.
- Keep content sniffing through Sharp and retain the 120-million-pixel limit for both metadata and palette analysis.
- Return a specific, user-readable oversized-file error from both phases.
- Add tests for:
  - an empty file;
  - exactly 512 MiB;
  - 512 MiB plus one byte;
  - a falsified prepare size followed by an oversized stored object;
  - an image below the byte limit but above Sharp's pixel limit;
  - a valid image near the accepted boundaries.
- Verify with a signed-upload integration test that Supabase Storage itself rejects an object above the bucket limit.

No other security hardening is part of this phase.

## Phase 3: Image transformation infrastructure

The current self-hosted endpoint was observed returning a 2000-pixel image for requests at 2500, 3840, and 5120 pixels. Repository changes alone cannot deliver larger images until the transformer configuration changes.

- Locate the deployed Coolify/Supabase image-transformer or imgproxy width limit using the configuration for the running stack; do not guess an environment-variable name.
- Raise the maximum output width to 5120 pixels and set a corresponding height limit that does not prevent portrait delivery.
- Confirm that the source-resolution limit remains compatible with Sharp's 120-megapixel ingestion ceiling.
- Restart or redeploy only the affected image-transformation service.
- Request known landscape and portrait originals at 2000, 2560, 3200, 3840, and 5120 widths.
- Verify the returned binary dimensions, `Content-Type`, transformation headers, cache behavior, and aspect ratio.
- Confirm requests never upscale beyond an original photograph's useful source dimensions.
- Document the deployed transformer setting and rollback value.

This infrastructure change must complete before relying on 2560-5120 candidates in the application.

## Phase 4: Responsive image delivery

### Preserve the visual layout

Do not change the existing two-column mobile, three-column desktop, one-sixth desktop gutter, or 80vh detail-view presentation.

### Correct gallery source sizing

Replace the current six-column-style `sizes` declaration with values derived from the actual layout:

- below 640 pixels: approximately `calc(50vw - 24px)`;
- 640-767 pixels: approximately `calc(33.333vw - 8px)`;
- 768 pixels and above: approximately `calc(22.222vw - 10.667px)`.

Validate the final expressions against computed browser widths rather than treating these initial formulas as untested constants.

- Keep gallery quality at 74 unless visual regression testing exposes artifacts.
- Retain intrinsic width and height metadata to prevent layout shift.
- Replace deprecated Next 16 `priority` usage with the appropriate current preload or fetch-priority behavior.
- Preload only the images that can materially affect the initial viewport; do not preload a fixed count without viewport validation.

### Expand candidate widths

- Extend available candidate widths through 5120 pixels.
- Keep the candidate list sparse enough to avoid inflating every `srcset` unnecessarily.
- Separate gallery and hero candidate needs if the global Next.js width list produces excessive markup.
- Do not request a width larger than either the transformer's verified ceiling or the source photograph's intrinsic width.
- Include quality values 74 and 82 in the allowed quality configuration:
  - 74 for gallery thumbnails;
  - 82 for the final detail image.

### Full-view image

Render one eager, responsive quality-82 image. Do not render a low-quality
preview, run a decode-gated source swap, or crossfade between image resources.

For gallery-to-photo navigation, preserve the existing View Transition behavior.

### Image acceptance criteria

- At each target viewport, the final selected resource supplies at least the intended device-pixel coverage, subject to the original photograph's dimensions.
- A 3840-pixel-wide viewport at 2x can select up to a 5120-pixel landscape resource because the content frame occupies roughly two-thirds of the viewport.
- Mobile thumbnails no longer download resources more than roughly one candidate step above their physical display requirement.
- The detail view requests only one responsive quality-82 image resource.
- Direct detail visits do not eagerly download two large full-resolution variants.

## Phase 5: Application architecture refactor

### Route layouts

- Keep one minimal root layout responsible for `html`, `body`, global font, metadata defaults, and global CSS.
- Introduce public and admin route groups without changing public URLs.
- Move the public footer and its content query into the public layout.
- Move shared admin navigation/header styling into the admin layout.
- Confirm `/admin/login`, `/admin/photos`, and `/admin/content` no longer render or query the public footer.

### Supabase data access

- Keep the existing cookie-aware browser/server clients for authentication and admin work.
- Add a stateless public-read client with session persistence disabled.
- Route public photograph, palette, and site-content reads through the stateless client.
- Generate Supabase database types and use them for tables and RPC results.
- Remove duplicated manual row types and unsafe result assertions where generated types can express the shape.
- Add explicit cache tags for:
  - the photograph catalogue;
  - photograph detail records;
  - palettes;
  - site content;
  - colour-similarity results.
- Invalidate the relevant tags after upload, edit, delete, palette publication, cleanup completion, and footer updates.
- Remove redundant path revalidation once tag invalidation provides the required behavior.
- Correct the colour-response caching behavior so deleted or replaced photographs do not remain in cached similarity results.
- Do not add rate limiting to the colour endpoint.

### Domain boundaries and shared configuration

- Move colour distance, palette matching, and photograph URL helpers from `app/gallery` into `lib/photographs` or another domain module.
- Centralize the bucket name, storage URL prefixes, supported upload types, image qualities, upload-byte limit, and cache tags.
- Make the custom image loader use the shared storage configuration while preserving the currently accepted production behavior.
- Ensure the loader handles unsupported or relative sources without throwing.
- Consolidate photograph metadata parsing for title, alt text, capture date, filename, sort order, MIME type, and storage path.
- Share revalidation logic between server actions and route handlers.

### Component decomposition

- Extract a reusable gallery item component from the nested `renderPhotograph` function.
- Separate masonry/grid distribution from photograph rendering.
- Split the admin photograph page into:
  - admin header/navigation;
  - cleanup-job notice;
  - upload form;
  - photograph row;
  - palette indicator;
  - edit form;
  - shared form controls.
- Preserve current URLs, accessible names, and user-visible behavior unless this plan explicitly changes them.

## Phase 6: Catalogue and colour-result loading

- Render the complete photograph catalogue on the homepage, as the original site did.
- Preserve the two/three-column CSS-column layout, column-by-column ordering, and stable item keys.
- Preserve gallery-to-photo and photo-to-gallery transitions.
- Load additional large colour-similarity result pages automatically as the user scrolls, without changing the underlying match ordering or adding a hard result cap.
- Test browser back/forward navigation, restored scroll position, reduced motion, and failed page requests.

## Phase 7: Migration cleanup and final palette naming

The audit observed:

- 211 active photographs;
- 211 active palette analyses;
- 1055 active palette colours;
- 197 legacy palette parent rows;
- 985 legacy palette colour rows.

The legacy model is stale and is no longer a faithful rollback source.

### Compatibility migration

- Add preflight assertions that active photograph, analysis, and colour relationships are complete.
- Drop the legacy child table `public.photo_palette_colours` and then `public.photo_palettes`.
- Create a temporary `public.photo_palette_colours` view over `public.photo_palette_colours_new` using `security_invoker = true`.
- Grant only the read access needed by the public site and retain RLS enforcement through the underlying table.
- Revoke public read access and remove the public-read policy from `public.photo_palette_analyses`, because the application does not read analysis metadata publicly.
- Notify PostgREST to reload its schema.
- Verify the existing application continues using `_new` while the new semantic endpoint is available for the following application release.

### Application cutover

- Update all application queries and generated types to use `photo_palette_colours`.
- Keep `replace_photo_palette_analysis`; `publish_photograph` still depends on it.
- Keep publication writes pointed at the existing underlying table until the final rename migration is ready.
- Deploy and verify public reads, similarity results, admin uploads, and palette publication through the compatibility state.

### Final rename migration

In one transaction:

- drop the temporary `photo_palette_colours` view;
- rename `photo_palette_colours_new` to `photo_palette_colours`;
- rename the associated primary-key constraint and LAB index;
- replace affected stored function definitions so their source refers to the final table name;
- preserve and verify RLS, grants, foreign keys, and `SECURITY DEFINER` function execution restrictions;
- notify PostgREST to reload its schema.

Verify that:

- the final public colour endpoint returns all 1055 expected colour rows;
- legacy tables are absent;
- `photo_palette_colours_new` is absent;
- anonymous users cannot read analysis metadata;
- public gallery reads still work;
- non-admin users cannot mutate photographs, palettes, cleanup jobs, or Storage objects;
- admin upload, edit, delete, and cleanup workflows still work.

Do not delete or rewrite already-applied migration files. They remain immutable deployment history. The old increase/remove upload-limit pair disappears only if the project later performs a separately approved, fully verified migration squash.

## Phase 8: Completed-feature and dead-code cleanup

- Remove `supabase/palette-schema.sql`.
- Remove `scripts/backfill-palettes.mjs`.
- Remove the `palettes:backfill` package script.
- Remove `SUPABASE_SERVICE_ROLE_KEY` from `.env.example` and delete obsolete backfill/service-role README instructions.
- Keep the database `replace_photo_palette_analysis` function because live publication uses it.
- Remove the unused `photographDate` helper.
- Remove the obsolete root `plan.md`.
- Remove unused starter and duplicate public SVG assets after confirming they have no runtime, metadata, or deployment references.
- Remove the unreferenced gallery download route and verify no internal or external documented contract refers to it.
- Remove the obsolete `-ms-overflow-style` declaration while preserving the accepted modern-browser scrollbar behavior.
- Update admin copy that still describes a single authorized account.
- Replace deprecated Next 16 image `priority` usage as part of the image phase.
- Leave the unused `Analytics` import and its dependency exactly in place.

## Phase 9: Verification and release sequence

### Local and CI verification

- Run the complete migration chain against a fresh local database.
- Run Supabase security and performance advisors after both palette migrations.
- Run database/RLS integration tests as `anon`, `authenticated` non-admin, and authenticated admin roles.
- Run:
  - lint, accepting only the explicitly retained Analytics warning;
  - TypeScript validation;
  - the production Next.js build;
  - similarity unit tests;
  - new image, route, upload, cache, and browser tests;
  - `npm audit`.
- Confirm the Git worktree contains no generated build output or unintended changes.

### Deployment order

1. Back up the database and record row-count/preflight evidence.
2. Deploy the compatibility/cleanup/upload-limit migration.
3. Raise and verify the self-hosted image-transformer ceiling.
4. Deploy the application refactor, image pipeline, cache changes, cleanup, and semantic table reads.
5. Run public and authenticated smoke tests.
6. Deploy the final palette rename migration.
7. Run the full post-deployment verification matrix.
8. Retain a rollback path until image delivery, uploads, public reads, and admin mutations have been verified in production.

### Final acceptance criteria

- The site has no horizontal overflow at supported widths of 320 pixels and above.
- The visible gallery layout and 80vh detail composition are unchanged.
- Full-view images use quality 82 and can receive a verified 5120-pixel transformed source.
- The detail view loads a single responsive quality-82 image without a preview upgrade.
- Gallery thumbnails no longer substantially over-fetch on mobile or under-fetch on large desktops.
- Uploads above 512 MiB are rejected at all three enforcement layers.
- Images above 120 million decoded pixels remain rejected by Sharp.
- Public routes use stateless, explicitly cached reads with correct mutation invalidation.
- The complete archive is rendered on the homepage in its original column order.
- Admin pages do not fetch or render the public footer.
- Legacy palette tables, the `_new` suffix, completed backfill tooling, the unused download route, and identified dead assets/code are gone.
- Existing migrations remain intact.
- RLS and privileged-function tests pass after the rename.
- The Analytics import remains unused and unchanged.
