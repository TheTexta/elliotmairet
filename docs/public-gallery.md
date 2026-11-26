# Public gallery, colour layout and image delivery

This guide describes the implementation in this repository. Dated release
evidence below is historical, not a fresh check of the deployed site.

## Rendering and colour selection

The homepage, `/gallery/[filename]` pages, sitemap and `/api/gallery/palettes`
are prerendered and revalidated daily. Admin changes expire relevant cache tags,
so updates appear on the next request; photographs uploaded after deployment
render on their first visit and are cached afterwards. Direct database edits
bypass that invalidation and appear after daily revalidation or the next relevant
admin change.

Photograph pages compute colour matches in the browser using cached palette
JSON, rather than invoking a server function per selection.
`PhotographColourSelection` owns the selected hex for one photograph, keyed by
photograph ID. The hero reset button and colour gallery share that state directly,
without window events. The image remains a server-rendered child; palette
requests are deduplicated across navigation, fades are cancellable and colour
results reveal in 36-item batches with a 1000px observer threshold.

The public result region has restrained loading, failure and empty feedback.
**Try again** preserves the selected swatch and any usable previous grid; retained
results are explicitly identified as previous results until matching succeeds.
Pending Retry remains focused and `aria-disabled`, with repeated activation
suppressed; photographs and swatches stay usable. The single polite status region
is separate from the busy result grid.

Palette JSON is shape-checked before caching. Explicit Retry can revalidate a
settled catalogue after HTTP/JSON/shape failure or a valid-but-stale catalogue
that cannot match the selected colour. Consumers share pending requests and newer
successful recovery generations; one unmount never aborts another's fetch.

The current analyser uses MMCQ64 with vibrancy/diversity scoring: up to five
supported, distinct sampled colours, separate population weights and selection
scores, and separate CIELAB/OKLab coordinates. Nonempty shorter palettes remain
valid for display and matching. See [`palette-extraction.md`](palette-extraction.md)
for the model, compatibility and historical rollout, and
[`mmcq-backfill.md`](mmcq-backfill.md) for the guarded original-file operator tool.

## Colour-neighbourhood archive

The homepage arranges the complete archive into recurring colour patches while
retaining uncropped two-column/mobile and three-column/desktop masonry.
[`plan-colour-masonry.ts`](../lib/photographs/plan-colour-masonry.ts) is a pure,
deterministic planner:

- Existing palette weights describe each photograph's colour character. Hex
  values, including legacy CIELAB rows, are converted into one OKLab space; layout
  planning performs no new analysis, original downloads, AI requests or schema writes.
- Similar palettes form connected patches with a target area of **3.5 squared
  column widths**, not a fixed photo count. Portraits consume more area than
  panoramas; an unusually tall photograph can exceed the target without cropping.
  Placement considers the whole patch bounding box.
- Near-monochrome images are distributed by occupied area, favouring muted colour
  contacts and compatible lightness. Neutral runs and recent hue repetition are
  discouraged; near-neutral hues carry less influence than saturated hues.
- [`masonry-geometry.ts`](../lib/photographs/masonry-geometry.ts) is shared by
  planning, scoring, rendering and tests. Gutters are `masonryGap × thumbnail
  width`, not fixed pixels. Missing/invalid aspect ratios reserve a square
  consistently; uploads still require valid dimensions.
- Two repair sweeps try swaps and relocations against the whole catalogue.
  Repairs cannot disconnect existing patches. The score strongly penalises a
  single-column tail beyond the natural height difference allowed for a portrait.
  At most 1,200 proposals sample anchors throughout the full gallery height.
- Stable filename priorities, limited cluster lookahead and column preferences
  reduce sensitivity to input order. Additions/deletions can still rearrange
  photographs; preserving exact upload-to-upload placement would require a
  separately persisted curatorial plan.

Both breakpoint plans render on the server using one image/link tree and CSS
container-relative positions. Lengths share the column-width unit; plans share
palette clustering and lazy pair-cost calculations. Neither hydration nor image
loading replans the archive. Daily/on-demand revalidation refreshes composition.
Empty, all-neutral and missing-palette catalogues stay complete; palette-less
entries can join neutral placement rather than form an appended unorganised tail.

`masonryGap` is the single spacing control; this source sets it to **0.06** (6%
of thumbnail width). The historical release record below described 7% gutters.
The responsive `--gallery-gap` sets
the fixed name navigation's top/left offsets; cap-height trimming avoids extra
font-leading space where supported. `--gallery-frame-inset` is shared with
`ContentFrame`. Below `sm` (40rem), side padding equals the photo gap, and the
archive starts two gaps plus `1cap` from the top: one gap above the name and one
below. The calculation includes both outer gaps without a circular dependency.
The mobile footer also uses the gap for side/vertical padding, contact/biography
spacing and developer-credit margin without stacked inner padding; larger-screen
spacing retains its separate rules.

This layout affects only the homepage: stored `sort_order`, admin capture-date
ordering and photograph URLs do not change. Replacing `ColourPhotoGallery` with
the original `PhotoGallery` restores catalogue-order rendering. The separate
palette-model change affects matching, but preserves compatible palette JSON fields.

**Known limitation:** the single link tree follows desktop spatial order.
The independently composed mobile plan can move keyboard focus between visual
rows. Connectivity/area budgets are enforced, but perfectly complementary colour
boundaries are not guaranteed.

## Image delivery

Public photographs use responsive markup from Next.js `getImageProps`, with the
same pure custom loader used by admin `next/image` components. Leading images
from both breakpoint plans load eagerly at high priority; other thumbnails are
lazy. Detail sizing accounts for available width and the 80vh frame. Quality is
74 for thumbnails and 82 for full photographs.

The public layout preconnects to the configured image origin. An inline head
script implements the 300ms image fade using native load events, including cached
images and client navigation, without waiting for hydration. Reduced-motion
visitors bypass the fade; photographs remain visible without JavaScript.
Links prefetch on hover, keyboard focus or touch, not automatically for every
visible photograph route.

Social previews use transformations capped at 1200px wide, not originals.
Image sizing/delivery retain the one-hour R2 cache policy and source
checksum/version checks; oversized-original handling is in
[`photograph-storage.md`](photograph-storage.md#oversized-originals).

## Text and metadata

Public photograph pages are image-only: stored descriptions, alt text and admin
caption settings remain available without displaying captions. Page and
social-preview titles use `Elliot Mairet |` followed by the exact filename,
including its extension, never a stored title/description/alt value. Description,
image alt and structured-data names retain their own text sources; filenames and
canonical gallery URLs do not change.

Stored alt text and titles also supply gallery/colour-match image descriptions;
palette JSON includes an optional `alt` field. Text editing, protected manual
fields and automatic generation are documented in
[`photograph-text-generation.md`](photograph-text-generation.md).

`site_content.footer_text` is the single source for the visible homepage
biography, meta description, Open Graph/Twitter descriptions and WebSite
structured data. Metadata collapses whitespace without truncating/changing the
wording; the visible footer preserves line breaks. A blank footer produces a
blank description. If content cannot load, the default biography supplies both
visible and metadata text. Site title remains separately editable under
**Admin → Site content**; there is no separate search-description field.

The legacy `seo_description` column remains untouched for rollback, but the app
neither reads nor writes it, including submissions from older forms. No migration
or manual copy is required. The footer-derived cache has its own namespace;
footer saves invalidate the shared site-content tag and refresh both biography
and metadata on the next request.

Server-rendered `data-nosnippet` excludes the homepage photo-grid descriptions,
contact links and developer credit from Google snippets. The biography remains
eligible; descriptive alt text, photo links and individual pages are unchanged.
Edit **Footer text** for both the biography and homepage description; contact and
credit markup are separate. After an approved deployment/footer edit, verify HTML
and use Search Console URL Inspection to request homepage indexing if authorized.
Google can rewrite snippets, and recrawl timing/exact wording are not guaranteed.

Public pages allow large image previews. Sitemap homepage timestamps reflect the
latest catalogue update, and structured-data serialization escapes HTML delimiters.

## Embedded portfolio navigation

When embedded in the project browser at `dextery.dev`, public links report
destinations to the parent portfolio for top-level navigation. Standalone and
admin navigation are unchanged. The bridge accepts the configured local
portfolio-development origins as well. Preserve its parent-origin/referrer
validation in
[`preview-navigation-bridge.tsx`](../app/%28public%29/preview-navigation-bridge.tsx).

## Verification

Use `test:layout`, `test:similarity`, `test:palette`, `test:images`, lint and a
catalogue-connected build for changes to these boundaries. The isolated
`node scripts/test-colour-selection-browser.mjs` fixture serves mounted React
with synthetic catalogue/matching adapters on loopback. Open its printed URL
for scheduling, reset and navigation assertions; it uses no Next server,
environment files or production requests.

Historical release validation on **2026-11-05** used the actual backfilled
**271-photo** catalogue: both plans retained every photo once, with 37 patches
and zero disconnected blobs. Build, lint, layout **24/24**, palette **20/20**,
similarity **15/15**, upload **45/45**, images **32/32** and backfill safeguards
**8/8** passed. Local production-browser checks at 390px and 1440px confirmed
two/three columns, 7% gutters, one photo tree, no overlaps/horizontal overflow
and reserved geometry through the archive bottom. These are correctness checks
for that dataset/runtime, not general performance measurements or a current
catalogue count. The owner approved commit/push to `main` through the existing
Vercel integration; that historical approval is not permission for future releases.
The layout release preserved upload limits/analyser/cache epoch and performed
no database or media writes.
