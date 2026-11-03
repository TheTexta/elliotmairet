# Admin usability cleanup and shadcn/ui plan

## Goal and constraints

Make uploading and editing photographs understandable to a photographer rather
than exposing generation/storage operations first. Keep Elliot's monochrome,
square-edged editorial identity, responsive image-led archive and existing routes.
Public photograph pages remain image-only, per the separate caption-removal change.

No authorization migration, schema change, new publication state, real test upload,
paid generation or catalogue reapplication is part of this cleanup. Preserve the
US$5/month UTC future-upload limit, separate US$20 catalogue cap and unresolved
catalogue reservation. Never replay an unknown-charge request.

## Findings → initial cleanup

- Operational panels dominated the first screen → compact automation summary,
  archive first, budget/history/import/bulk recovery under disclosures.
- Tiny labels and icon-only navigation → visible Photos / Site content / Sign out,
  readable labels, 16px input text and 44px primary controls.
- Storage paths overshadowed photograph text → title, caption-text preview,
  capture date and View on site; technical file details remain available.
- Irrelevant custom-caption input → conditional input without clearing its value;
  explicit accessibility help and image-only public-page explanation.
- No archive search → search title/description/filename/date and missing-text or
  hidden-caption filters. Hidden rows stay mounted to preserve edits.
- Unsaved/stale state gaps → shared navigation/sign-out guard, prepared-upload
  protection, content saved baseline, per-photo clean/dirty revision reconciliation.
- Saving one draft reloaded siblings → targeted saved-draft refresh.
- Ambiguous delete result → filename-specific permanent-removal confirmation,
  distinguish archive removal from pending file cleanup; cleanup summary remains
  visible even with Advanced tools closed.
- Google title included Photography and snippet included footer links → separate
  search description, clean fallback, exact owner-requested title **Elliot Mairet**,
  contact/credit `data-nosnippet`. Preserve visible biography/contact content.

## Phase 2 — shadcn/ui integration

Adopt shadcn/ui as the admin component foundation, not a new visual theme. Scope
it to `/admin`; do not restyle the public portfolio or import a stock dashboard.

1. **Foundation:** current manual installation and official radix-nova registry
   checked with CLI 4.23.0. Added `components.json` and eight locally owned
   components. Runtime dependencies are pinned to `radix-ui@1.8.1`,
   `class-variance-authority@0.7.1`, `cn@0.5.1`. Tokens live under `.admin-ui`,
   including portals; the global Tailwind entry uses a reference only. No public
   body/base, radius, colour values, font or dark-mode override was added.
2. **Controls:** login, site content, archive filters, photo editing, uploads,
   automatic text, private review and file cleanup use the shared components.
   Native input names, validation limits, date/file controls, selects and
   disabled/pending semantics remain intact.
3. **Confirmations:** one shared AlertDialog handles permanent removal, deliberate
   discard, paid retry, live original-suggestion replacement, exact batch apply,
   preview release and rollback. Warnings retain filename, budget and scope.
   Concurrent prompts cannot overwrite a decision; unmount resolves false.
   Decisions are awaited before async transitions/action dispatch. Native
   synchronous navigation and document-unload guards are intentionally unchanged.
4. **Disclosure/feedback:** native details already meet the workflow and remain;
   no gratuitous Accordion/Sheet/sidebar was installed. Upload stays in-flow.
   Inline errors use Alert and retain persistent recovery/status text; no toast
   dependency or transient-only feedback was added.
5. **Release:** no database, storage, auth, AI request or production-content change
   is required. After disclosure of the pre-existing security advisories below,
   the owner explicitly approved committing and deploying this integration as-is.
   No security/framework upgrade is bundled into that approval.

### shadcn/ui acceptance gates

- Mobile 320px through desktop; no horizontal overflow, usable long filenames,
  44px primary targets, 16px input text, adequate contrast and visible focus.
- Keyboard-only and screen-reader labels; modal focus trap/return and Escape
  behavior where a modal is actually used; reduced motion respected.
- Search retains dirty editors, newer revisions never overwrite dirty input,
  sibling draft saves retain edits, intentional blank fields stay manual-owned.
- Caption Description/Custom/Hidden semantics and retained custom text unchanged.
- Auth checks/RLS, publication reservations, checksums, upload retry/recovery,
  provider-aware cleanup and unknown-charge denial unchanged.
- Exact bulk preview, manual-field exclusions, interrupted-batch recovery and
  rollback remain available and correctly scoped.
- Site title/search description/footer remain separate; search metadata and
  public gallery routes/image-only rendering unchanged by the component migration.
- Run `test:admin`, `test:text`, `test:upload`, `test:images`, lint, TypeScript and
  production build. No real paid/upload/delete acceptance without owner approval.

## Verification and rollout record

Initial cleanup checks on 2026-10-31: `test:admin` (28), `test:text`, `test:upload`
(33), `test:images` (28), lint, TypeScript and production build. Tests are offline
except the build's normal read-only catalogue fetches. The source design scan had
no regex findings; this alone is not a visual/accessibility assessment.

An independent local browser harness rendered the actual React components with
compiled Tailwind/global styles and Montserrat at 320px and 1400px. It verified no
horizontal overflow, readable controls, keyboard focus and upload-panel focus
return, dirty-edit retention through filtering, retained custom caption text,
mocked failures, advanced review and empty/unavailable states. Axe reported zero
violations on expanded photos and site content. This is not full WCAG
certification; Next adapters, persistence, image and upload transport were mocked.
No physical-device or screen-reader testing was performed.

Independent review's two findings (hidden pending-cleanup feedback and an outdated
description submission test harness) were fixed. Rollout uses a sanitized committed
snapshot, excluding environment files/private local artifacts. Production acceptance
is limited to read-only UI plus the explicitly requested title/search-description
edit. Confirm the exact title **Elliot Mairet**, clean description across regular,
Open Graph and Twitter metadata, contact/credit `data-nosnippet`, admin protection,
and anonymous cron denial. Google recrawling/snippet rewriting remains outside the
application's control; no Search Console submission is assumed.

The separate initial caption feature was committed as `5f7ee63` and deployed
successfully. The later `1076785` image-only public-page change is preserved.
shadcn/ui is a separate second-phase change, not part of that deployed caption
feature. Release uses a sanitized committed snapshot, excluding private artifacts.

### shadcn verification and security baseline

Offline checks: 39 admin/component/confirmation tests, 58 text tests, 33 upload
tests, 28 image/SEO tests; lint, TypeScript and production build. The compiled-CSS
test explicitly checks semantic utilities: defining `@theme` only in the nested
admin stylesheet was insufficient, so the global entry now references it.
Independent browser verification used actual components and Radix at 320px and
1400px, mocking only Next adapters/actions, transport and photo delivery. Cancel,
Escape, outside-click behavior, keyboard trap/return, exactly-once mocked removal,
paid-retry/manual-replacement/batch warnings and cancellation, retained draft/photo
edits and prepared-upload navigation guards passed. Expanded admin and content
axe scans reported zero violations. Modal scans had no violations but disclosed
incomplete background/focus-guard and contrast checks; manual focus/opaque token
contrast checks supplemented them. This is not full WCAG or screen-reader testing.

Review caught two confirmation lifecycle issues: awaiting a modal inside an async
transition could defer the modal itself (confirmation now precedes dispatch), and
the persistent layout could retain a decision after browser Back (the decision
scope is now keyed by pathname and unmount cancels). A long-description mobile
check also required keeping actions fixed while the focusable details region
scrolls, rather than scrolling the whole dialog. Focused browser regression at
320×800 passed with a valid 1,000-character description and extreme unbroken
tokens: both 44px actions remain visible, Cancel starts focused, keyboard scrolling
works and focus stays trapped/returns correctly. Those dialog axe scans had zero
violations or incomplete checks. A reactive local pathname adapter also verified
scope remount, false resolution and zero stale delete/paid-retry action calls.
Actual signed-in Next routing, real persistence, touch devices and screen readers
were not exercised; no production mutations were performed.

A read-only local Next production-server smoke verified the real login uses the
components and compiled semantic styles, public pages serve without admin
components, and anonymous admin visits redirect. Its existing daily local ISR
cache still held the old homepage title; direct public database and live homepage
reads confirmed **Elliot Mairet** and the clean description. No SEO values were
changed by this integration.

At the shadcn rollout, `npm audit` reported 20 affected packages (one critical,
three high, 16 moderate).
Independent comparison against the pre-integration lockfile confirmed all 22
implicated installation paths have identical versions; no advisory was introduced
by this integration and no existing package version was silently upgraded.
Pre-existing baseline includes Next 16.3.3 (critical), Sharp 0.35.4,
source-map-js 1.2.1 (high), development Zod 4.6.5 (high), and minimatch/lint tooling
(moderate). Do not run `npm audit fix --force` or silently include framework/image
pipeline upgrades. Owner-approved remediation and fresh compatibility verification
were separate follow-up work. The owner approved that UI release after these
findings were disclosed; the UI release itself did not resolve the advisories.
The subsequent authorized dependency refresh clears the production/critical/high
findings; see [`dependency-updates.md`](dependency-updates.md) for the current
versions, remaining development-only findings and verification record.

## 2026-11-02 — first-principles whole-admin refinement

The owner selected a **compact image-led list** and a **whole-admin** pass after
an independent design review and separate source/browser evidence collection.
The baseline scored 26/40 on Nielsen's heuristics, not user testing. The main
failure was task hierarchy: routine automation settings pushed mobile search to
834px and the first thumbnail to 1053px. The monochrome editorial identity,
inline editing and existing safety mechanisms were retained, not redesigned.

### Changes

- Routine automatic-text settings, explanatory policy and budget/history now
  start collapsed under **Text settings and history**. Waiting status and
  issue/suggestion actions remain visible. **Review text issues** opens both
  settings and recent updates, then focuses the history summary. Unknown-charge
  requests remain non-retryable, with clearer payment-check instructions.
- Mobile Photos navigation and the upload trigger use distinct rows rather than
  crowding the heading. The upload panel stays in flow with the existing focus,
  Escape, active-operation and publication-recovery safeguards.
- Compact photograph rows use larger uncropped previews, concise text and one
  Edit/View action row. File dimensions, original path and palette move inside
  the existing editor's **Alt text, date and file details** disclosure. Repeated
  Edit/View/detail names retain their visible labels and add the filename.
- Search wording reflects title/description/filename/date. Automatic or unknown
  alt mode hides caption filters and tests missing source text, not pending
  generated alt. Explicit manual mode retains missing-text/hidden-caption filters.
  Filtered editors remain mounted and keep local edits.
- Site content groups search/link previews separately from the public footer,
  with nearby character counts. Login identifies Elliot, provides truthful
  account-help instructions, uses readable copy and locks inputs during sign-in.
  Navigation casing is consistent across Photos and Site content.

### Verification

The fixture imports the actual page/components, React 19, Radix, Tailwind styles
and Montserrat, with synthetic photographs and mocked Next adapters, all backend
actions, upload transport and image delivery. It lives outside the repository.
No real authenticated save, upload, deletion, generation, setting or content
mutation was performed.

| Normal Photos position | Before | After |
|---|---:|---:|
| 320px: search | 834px | 513px |
| 320px: first thumbnail | 1053px | 728px |
| 1440px: search | 493px | 320px |
| 1440px: first thumbnail | 634px | 457px |

- Browser regression covered normal, attention, empty, unavailable and manual
  states at 320px and 1440px, plus the intermediate 768px layout. No checked
  horizontal overflow, header/action overlap, JavaScript/console error, external
  request or actual HTTP write. Visible form text is at least 16px; checked
  buttons/disclosure controls remain at least 44px high.
- Mocked interaction checks passed for upload open/file focus/Escape/focus return,
  retained selection, busy-navigation locks and successful publication feedback;
  dirty-editor retention through filtering/progress checks, failed save, pending
  lock, successful save and Cancel/confirmed discard; issue-review focus and
  cancelled paid retry; manual caption retention; content failure/pending/success;
  and login help/pending/error states.
- Added five regression tests for source-text filtering, conservative
  automatic/unavailable filters, collapsed settings/direct history focus,
  photograph-specific label-in-name and pending login controls. `test:admin`
  passes **50**, `test:text` **61**, `test:upload` **45**, `test:images` **28**.
  Lint, `npx tsc --noEmit --incremental false` and production build pass. The
  build uses the normal read-only catalogue path; no database test was rerun
  because this pass changes no SQL or database behavior.
- Independent source/browser review found a label-in-name regression; visible
  action wording is now retained in accessible names and covered by the new
  test. No blocking layout or data-loss finding remained. Nine pre-refinement
  fingerprints match, including server actions, automatic-generation code,
  package/lock files and the immutable applied description-alt migration.

The baseline source detector returned zero findings. Its browser overlay could
not run because the offline fixture's CSP blocked WebAssembly; no successful
overlay or new accessibility certification is claimed. No physical device,
screen-reader or real signed-in Next-routing/persistence acceptance was run.
The separate alt feature is already deployed. The owner subsequently approved
committing Elliot's local project changes and deploying the UI pass to
`elliotmairet.com`. GitHub push is not part of that approval. Production
verification and release evidence follow. No database migration or paid-generation
test was run as part of this release.

### Production rollout — 2026-11-02

- Local release commit: `91ab83f47675290e40f009feef440b528929e8d8`.
  It also records the previously deployed description-alt feature and Elliot's
  offline CI/upload regression work. Private review artifacts remain local and
  ignored; no GitHub push was made.
- Production deployment: `dpl_JAbbEm9e1ZKkygyjR45kiEzimyt8`, **READY** at
  approximately 17:01 UTC, aliased to `https://elliotmairet.com` and the existing
  www/Vercel domains. Deployment URL:
  `https://elliotmairet-jeuck9w4o-thetextas-projects.vercel.app`.
- Deployment used a sanitized export of that exact commit, not the working tree.
  All **173 uploaded source files** match the committed release's dry-run
  manifest, including the immutable applied migration. The SHA-256 fingerprint
  of the sorted path/SHA-1 pairs is
  `830870b6bb1f4645d0625a20fefd6ece4cafddf4812848b049ba93b9d39ec3fc`.
  Environment files, agent instructions/skills, local drafts, `.impeccable`, Git
  metadata and build/dependency directories were excluded. Production settings
  and credentials were inherited; no shared-backend, storage, DNS or database
  changes were made.
- Fresh local checks passed: admin **50**, text **61**, upload **45**, image/SEO
  **28**, palette **4**, similarity **13** (**201** total), lint, TypeScript and
  production build. Vercel's production build also passed for all 284 generated
  routes. The build emitted non-failing Node-engine and npm `cache-dir` notices;
  no runtime/framework upgrade was bundled into release.
- Live read-only checks passed for homepage and a public photograph, all **271**
  homepage gallery destinations, unchanged title/description/canonical, identical
  palette JSON and robots content, protected Photos/Site content redirects to the
  new login, admin `noindex, nofollow`, and anonymous cron denial (**401**).
  A runtime-error query for the release window returned no errors; this is an
  immediate smoke check, not long-term monitoring.
- The sitemap's initial byte comparison differed. Comparison against the prior
  deployment confirmed the same **272** URLs and image locations; only six
  `lastmod` values (homepage plus five photographs) refreshed from prior catalogue
  edits at 13:27–13:31 UTC, before this 17:00 deployment. No sitemap implementation
  change or new catalogue mutation was made to resolve the difference.
- The actual production login was inspected at 320px and 1440px: new Elliot
  identity/help, 16px input text, 44px fields/button and no horizontal overflow.
  Signed-in Photos/Content interaction acceptance remains the earlier mocked
  component/browser coverage; no real upload, save, deletion, login attempt or
  paid request was used for deployment verification. Save/discard unfinished
  work before refreshing an existing admin tab.

The previous production deployment
`dpl_FSDjdwA4sehjL7jZKu6Hz1X1f5ub` remains the application rollback checkpoint;
this UI release requires no database rollback. Rollout notes are recorded in a
separate local documentation commit after deployment verification.

## 2026-11-02 — masonry gallery and dedicated workspaces (local)

The owner selected **natural-ratio masonry** and a **separate upload page**, then
approved implementation of the complete plan. This replaces the compact-list
interaction model above; earlier release evidence is historical, not verification
of this pass. No push or deployment is authorised for the redesign.

### Plan → implementation

1. **Photographic archive:** thumbnail-only CSS-column masonry at 2–6 columns;
   actual image dimensions preserve uncropped proportions. Lazy responsive images,
   no route prefetch, no repeated editing controls and a 48-item client-side page
   bound replace the old full-catalogue inline editor list. The existing cached
   catalogue read is reused without palettes; this is not server-side pagination.
2. **One-photo editing:** authenticated `/admin/photos/[id]/edit` validates its UUID,
   loads one photo plus its palette, handles missing entries and reuses the existing
   revision-aware save/discard form. Preview and primary title/description fields
   lead; alt/date/file/palette details, progress and confirmed permanent removal
   remain available. Successful removal returns safely with done/pending feedback.
3. **Separate uploading:** `/admin/photos/upload` opens the existing upload workflow
   immediately. Date detection, original paths, transport/publication replay and
   recovery semantics are unchanged. Busy state belongs to the persistent
   workspace; header links/sign-out and browser history cannot interrupt an upload.
4. **Consistent navigation:** the authenticated `(workspace)` layout owns one
   header for Photos, Site content, edit, upload and tools. Return URLs accept only
   gallery query/filter/page state. Session storage restores gallery scroll/focus;
   navigation still works if storage is disabled. Confirmation cancellation is
   route-scoped without remounting workspace children.
5. **Two-tone system:** all admin tokens and chrome use black/white only, including
   focus, placeholders, disabled controls, errors, cleanup and private review.
   Montserrat, compact density, thin rules, square controls and restrained header
   proportions reflect the selected dextery.dev influence, without its homepage
   spacing or tiny mobile labels. Existing photos/palettes are the colour exception.
6. **Task hierarchy and safeguards:** automation, private review/import/batch
   recovery and cleanup move to `/admin/photos/tools`; queue/error/cleanup summaries
   stay findable from Photos. Revalidation covers dedicated routes. Existing auth,
   RLS, upload API, AI providers/budgets, unknown-charge denial, original objects,
   publication policy and public image-only pages are unchanged. Applied SQL is
   untouched. Dirty-editor revisions, protected intentional clears, sibling draft
   retention and native navigation warnings remain in force.

### Verification

- `test:admin` **64**, `test:text` **66**, `test:upload` **45**, `test:images` **28**,
  `test:palette` **4** and `test:similarity` **13**
  pass, along with lint and `npx tsc --noEmit --incremental false`. Coverage adds
  bounded pagination, URL validation, thumbnail ratios/fallback, safe return URLs,
  scroll/focus restoration, per-photo loading/authentication, pending-cleanup
  redirect results, persistent confirmation scope and Back/Forward guards.
- Production build passes and includes all three new photo routes; all **286**
  prerendered outputs complete. It uses only the normal read-only catalogue path.
- Local Next 16.4.3 compilation reports no issues. Anonymous GET requests to Photos,
  Site content, edit, upload and tools return **307** to `/admin/login`; login is
  **200**. These are access/compilation checks, not signed-in persistence acceptance.
- History cancellation uses native history indices when exposed by Navigation API
  to retain the Forward branch. The compatibility fallback restores the working
  URL and Next router state via `pushState`; on older browsers that can replace
  Forward history. Browser-native unload behavior remains the hard-navigation
  fallback. Session-storage-disabled gallery restoration degrades to URL context.
- Real Next testing exposed a listener-order race that delayed mocked routing did
  not reveal: Next's existing `popstate` listener could unmount the form before a
  later dirty-only guard ran. The global `instrumentation-client.ts` convention
  now installs the idempotent listener synchronously before hydration. It remains
  inert without registered unfinished admin work; no router internals, public
  markup/styles/catalogue, privileges or database behavior are changed.

### Browser evidence and independent finish review

- The isolated browser fixture renders the actual components, React 19.3.1,
  Radix, Tailwind and Montserrat with 83 synthetic records and mocked privileged
  operations/transport. **14/14** regression groups pass at **320, 768 and 1440px**:
  header consistency/no overflow, uncropped thumbnail-only masonry, bounded pages,
  search/return/scroll/focus, editing and stale/discard states, conservative alt
  locks, pending-cleanup feedback, upload recovery/navigation locks, content/login
  feedback, keyboard focus and confirmation cancellation. The tablet header's
  initial wrap/height variation was corrected and reverified across routes.
- A separate **real Next 16.4.3 development App Router** fixture copies the exact
  production guard and pre-hydration bootstrap (only the fixture import path is
  adapted). All **8/8** scenarios pass on **three consecutive runs (24/24)**:
  dirty Back/Forward cancellation retains URL/input/mount/router tree; repeated
  cancellation then acceptance works; pending links/history stay blocked; clean
  history and `useRouter().back()` work; and the no-Navigation-API fallback retains
  the working form and allows subsequent clean navigation. Event traces confirm
  guard registration precedes Next's listener. Guard SHA-256:
  `1cf6dd413cbe06739370604942fed624efaa815d72871a84df0d938bf4d847a4`.
- Main-thread verification matched **46 source hashes and 31 captures** against
  the browser manifest. Full-page archive captures are **320×4248**, **768×4374**
  and **1440×3251**; all start at document top with 48 decoded thumbnails. No page
  errors, prohibited requests or real mutations were recorded. Six cached small
  public transforms are reused for synthetic records; repetition and softness in
  fixture images are not production catalogue changes or new shipping assets.
- The actual local Next login also rendered at 320px with no horizontal overflow,
  16px visible inputs, 44px fields/action and `noindex, nofollow`. Next's connected
  runtime/config error report was empty. No login submission was attempted.
- Independent source review found no material issues after the early-listener
  correction. A fresh independent finish review returned **`disposition: ship`**
  for the rendered visual scope, with all fidelity/contract rows matching and no
  material fixes. This is not a claim of live backend acceptance or WCAG certification.
  The source design detector returned `[]` for admin/shared controls.
- Added `PRODUCT.md` and token-bearing admin-scoped `DESIGN.md`, plus a local
  `.impeccable/design.json` sidecar. Main validation confirms YAML/JSON parsing,
  canonical section order, all 31 token references and eight component references.
  `.impeccable/` remains intentionally gitignored; it is not a deployment dependency.

Artifacts and runnable isolated fixtures are retained outside the repository in
`/private/var/folders/bx/htl3m38d3qq52n4zs8z6cyh00000gn/T/opencode/elliot-admin-masonry-browser-20261102/`:
`verification.json`, `native-navigation-verification.json`, three run reports,
`native-event-order.json`, `artifact-manifest.json`, screenshots and fixture README.
The main review directory is the sibling `elliot-admin-masonry-20261102/`.

No production write, real authenticated save/upload/delete, paid request, database
migration, DNS/storage change, commit, push or deployment was performed for this
pass. Actual signed-in production transport/persistence, physical devices and
screen readers remain outside verification. Public/API/domain/storage/generation
source, dependencies and SQL compare unchanged to the starting checkout; the
applied description-alt migration retains its recorded SHA-256. The redesign is
complete locally; production remains on the earlier compact-list release.

## 2026-11-02 — infinite scroll and text-fitted navigation (local refinement)

The owner replaced the paginated-gallery requirement with **infinite scrolling**,
reported the missing sign-out pointer cursor and requested smaller header/nav
surfaces that wrap their text. This refinement supersedes the pagination and
header-size descriptions in the preceding local redesign record.

- The gallery starts with 48 lazy thumbnails and appends 48 near the end through
  IntersectionObserver. **Load more photographs** remains available for keyboard
  users and browsers without that API, focusing the first appended photograph on
  explicit activation. Loading stops at the matching catalogue size; search/filter
  changes reset the loaded depth. Page controls are removed and obsolete page URL
  parameters are ignored. No new server/database pagination API is introduced.
- Each appended group owns its CSS-column masonry, so adding photographs does not
  rebalance or move the earlier groups. Return-position state includes the number
  already shown, which is restored before scrolling/focusing the original thumbnail.
- Header height now follows its text/content instead of fixed 104px/64px minima.
  Brand/navigation keep 12px type and 16px leading with compact 24px targets and
  narrow padding. Normal fields and primary form actions retain 44px targets.
  Sign out uses an enabled pointer cursor and disabled not-allowed cursor; hover
  inversion, focus outlines, upload locks and dirty-navigation guards remain intact.
- Admin regression tests cover automatic/manual append, stable batch keys, stopping
  at the catalogue end, search reset, obsolete-page sanitisation and restoring
  loaded depth before scroll/focus and manual loading without IntersectionObserver.
  `test:admin` **66**, lint, TypeScript and the production build pass.
- Focused browser verification passes **12/12** groups with 155 synthetic records:
  automatic progression **48 → 96 → 144 → 155**, no duplicate IDs/refetches,
  unchanged earlier masonry geometry/DOM, search/filter reset, deep return
  scroll/focus, keyboard/manual loading with absent or undefined observer API,
  enabled sign-out pointer/hover and disabled upload locks. Header height is
  **69.5px at 320px**, **41.5px at 768/1440px**, consistently across workspace
  routes. Nav targets remain 24px; normal inputs/actions remain 44px.
- Main verification matches **46 current source hashes and 13 captures** to the
  freshly rebuilt fixture, including the final observer feature-detection fix.
  No browser errors, prohibited requests or real mutations occurred. Evidence is
  in the sibling temporary directory `elliot-admin-infinite-browser-20261102/`
  (`verification.json`, `screenshot-manifest.json`, `build-source-snapshot.json`,
  screenshots and README). Native Next history tests were not repeated for the
  unchanged guard; their earlier results remain separately recorded above.

These are local UI changes only. No production write, authentication change,
storage/schema mutation, paid generation, commit, push or deployment is included.

The fresh independent visual finish review returned **`disposition: ship`** for
this refinement: content-fitted header/navigation, sign-out hover treatment,
infinite-archive presentation and focus/return affordances match the request.
No material visual fixes were identified. The design document and sidecar were
updated and independently validated; this verdict is not a deployment or a claim
of live authenticated/backend acceptance.

## 2026-11-02 — plain name and chronological rows (local refinement)

The owner requested **Elliot Mairet** without the accented character and an
infinite admin archive that reads **left-to-right, top-to-bottom by date**, allowing
reflow. This supersedes the earlier column-first masonry and fixed-batch layout.

- The common header now uses the plain name on every workspace route and login;
  owning-repository identity documentation matches. Public UI/SEO already use the
  plain spelling. No stored content or production settings were mutated.
- The filtered admin catalogue sorts by **capture date descending before slicing**
  the revealed set. Missing dates follow known dates; equal dates keep catalogue
  order. Filtering creates a new array, so the shared cached catalogue and public
  custom order are unchanged.
- One responsive CSS grid lays photographs out across each row, then down, at
  2/3/4/5/6 columns. Images keep natural proportions without cropping. Shorter
  images may leave whitespace within a row; clear chronological order takes
  priority over tight masonry packing. Fixed masonry batch wrappers are removed.
- Infinite 48-item increments, manual/keyboard fallback, search/filter reset,
  loaded-depth return state, compact navigation and upload/unsaved-work guards
  remain. Regression coverage verifies newest-first order, stable date ties,
  unknown dates last, unmodified input order and chronology across load boundaries.

### Verification

- `test:admin` **68**, lint, TypeScript and the production build (**286 outputs**)
  pass. The admin/UI design detector reports no findings. Design YAML/JSON and
  all 31 token references/eight component references validate.
- Fresh offline browser verification passes **9/9** focused groups with 155
  deliberately unsorted synthetic photographs. At **320/768/1440/1536px**, visual
  bounding-rectangle order, DOM order and actual Tab traversal agree with the
  newest-first sequence. Images remain uncropped; equal dates are stable and
  unknown dates follow dated entries.
- Automatic **48 → 96 → 144 → 155** loading preserves chronology across every
  boundary without duplicates, missing entries, extra catalogue reads or input
  mutation. Search/filter/reset, deep editor return through the link and browser
  Back, and keyboard/manual loading without the observer API pass. Exact plain
  branding is checked across Photos, Content, Edit, Upload, Tools and Login;
  compact navigation, sign-out cursor/hover and upload locks remain intact.
- Main verification matches **46 current source hashes and 15 canonical captures**
  to the actual rebuilt fixture. Evidence is in the temporary sibling directory
  `elliot-admin-date-rows-browser-20261102/` (`verification.json`,
  `screenshot-manifest.json`, `build-source-snapshot.json`, screenshots and README).
  No browser errors or prohibited requests occurred. Earlier fixture evidence is
  preserved; no listener from an earlier pass was reused.
- The fresh independent visual finish review returned **`disposition: ship`**,
  with no material fixes. All nine required full-page/viewport/login captures
  were valid; plain branding, chronological rows, uncropped imagery and compact
  navigation match the request. This is a local visual verdict, not deployment
  approval. The verified fixture's owned listener has been stopped.

No commit, push, deployment, real authenticated mutation, schema/storage change
or paid request is part of this refinement. Actual production authentication,
transport and persistence remain outside this mocked fixture. Native Next history
integration was not repeated for the unchanged guard.

## 2026-11-02 — compact justified rows and even gaps (local refinement)

The owner requested removal of the admin gallery's inconsistent vertical gaps,
then requested row heights about **three-fifths** of the first justified layout.
This supersedes the preceding equal-column grid and intentional row-whitespace
tradeoff; the public gallery remains untouched.

- A wrapping flex layout gives each row a common image height and each photograph
  a proportional width. Original aspect ratios and newest-first reading/tab order
  are preserved; no cropping, column-first rearrangement, layout dependency or
  JavaScript measurement is introduced. Gutters remain **12px below 40rem** and
  **16px from 40rem**, both horizontally and vertically.
- Target heights are **4.8rem / 7.2rem**, exactly 60% of the first justified targets
  of 8rem / 12rem. Actual heights respond to each row's proportions and available
  width. A proportional **1.5×** ceiling prevents a lone final photograph from
  stretching across the page; incomplete rows are left-aligned. The last row can
  reflow when additional photos arrive.
- Failed previews retain their aspect-ratio footprint with contained, scrollable
  filename feedback rather than a minimum-height block that can recreate gaps.
  Responsive image sizes now account for proportional row widths and the ceiling.
- Infinite loading, search/filter state, return depth/scroll/focus, branding,
  compact header and all existing unfinished-work/upload safeguards are unchanged.

### Verification

- `test:admin` **69**, lint, TypeScript and production build (**286 outputs**) pass
  with the final reduced row targets. Regression coverage checks ratio-derived
  sizing, uncropped original dimensions and the contained failed-preview fallback.
- The layout detector reports no findings. Design YAML/JSON, 31 token references
  and eight component references validate. Public/API/domain/storage/generation
  source, dependencies and SQL remain unchanged from the starting checkout.

These remain local admin-only changes; no commit, push or deployment is authorised.

## 2026-11-02 — stable infinite-preview loading (local refinement)

The owner reported that loading more previews jolted the page and pushed the
gallery footer down. This refinement preserves the compact justified rows above
while removing the changing page geometry rather than animating the jump.

- The existing cached catalogue already includes dimensions. Every matching photo
  now gets a lightweight aspect-ratio slot from the first render, sharing exactly
  the thumbnail's sizing rules. Unrevealed slots are aria-hidden, non-focusable
  divs with no image, edit link or request. Real thumbnails still start at 48 and
  reveal in 48-item increments. Replacing slots should not resize earlier rows or
  increase page height; resize/filter changes can still reflow the layout.
- One observer watches unloaded slots with a **1000px** margin, revealing through
  the highest approaching index. This also handles scrollbar jumps into the middle
  or end of reserved space rather than observing only a now-distant batch boundary.
- Manual **Load more photographs** stays in the top toolbar and remains mounted,
  disabled, at completion. The bottom loading footer is removed. Loaded-count
  feedback remains available to screen readers without changing toolbar copy or
  height. Automatic reveal never changes focus or scroll position; keyboard focus
  within the last eight real thumbnails prepares the next batch. Manual activation
  deliberately focuses the first newly revealed photograph.
- No height animation, forced smooth scroll, new dependency, transport change,
  original-file mutation or privileged operation is introduced. Row targets remain
  **4.8rem/7.2rem**, gutters **12px/16px**, with uncropped date-ordered photographs.

Regression coverage passes **72** admin tests, including inert/identical reserved
slots, direct-jump reveal, stale-observer guards and keyboard preparation without
focus theft. Lint, TypeScript and the production build (**286 outputs**) pass.
The admin/UI detector reports no findings; design YAML/JSON and all 31 token/eight
component references validate.

### Final browser and visual verification

- **10/10** focused browser groups and supplemental checks pass against the final
  source. At 320/639/640/768/1440/1536px, gutters have **0px error** and within-row
  height variation is at most **0.03125px**. Natural proportions, chronology,
  keyboard/manual preparation, search/filter reset, deep return state and mocked
  navigation/upload locks remain intact.
- Controlled **48 → 96 → 144 → 155** preview reveals at the loaded boundary and
  page bottom produce **0px** change in document height, gallery/toolbar/slot
  geometry and scroll position; existing anchor identities are retained. Delayed
  and failed previews also cause **0px** change. Real-observer jumps into indices
  250/399 of a 400-photo fixture reveal through those areas with no height/scroll
  change. No preview-reveal layout-shift entries were observed.
- The first browser pass exposed accumulated rounding from resized images whose
  intrinsic proportions differed slightly from catalogue dimensions. Images now
  use absolute containment inside the declared-ratio slot, removing that growth
  without cropping. Pre-fix diagnostic evidence is preserved separately.
- Main verification matches all **four critical consumed source hashes**, the
  actual JS bundle and **17 unique canonical captures** to the final fixture in
  `elliot-admin-smooth-browser-20261102/`. Its `verification.json`, supplemental
  report, source/bundle snapshot, manifest, captures and README record the results.
  Duplicate historical failed-preview metadata was removed from the canonical
  manifest; current capture hashes all match. No browser errors, external/write
  requests or real privileged mutations occurred. The owned listener is stopped.
- The independent visual finish review returned **`disposition: ship`**, with no
  material fixes. All eight required mobile/tablet/desktop/wide full-page and
  viewport captures are valid and contain the complete synthetic catalogue.

Verification uses mocked Next adapters, authentication/actions/transport and cached
photographs. Native history/dirty-guard integration and actual browser zoom were
not recertified; no live authentication, persistence or paid-generation claim is
made. Changes remain local, uncommitted, unpushed and undeployed.

## 2026-11-03 — owner-authorised commit/push and deletion preservation

The owner explicitly authorised committing and pushing the completed redesign,
with the requirement that Elliot's recent photo deletions remain preserved. This
supersedes the preceding local-only commit/push gates; it does not authorise data
restoration, database migrations, storage cleanup or paid generation.

- A fresh `origin` fetch found no incoming commits; `main` already contained seven
  earlier commits awaiting push. Independent source review found the deleted
  files are replaced admin routes/components, not catalogue media. Build and CI
  do not seed, import or restore photograph data.
- Read-only production inspection found **262** catalogue entries. Compared with
  the previous 271-route build, **ten photos were removed and one was added**.
  The existing R2 delete-cleanup reservation remains retained and its photograph
  remains absent. No cleanup or catalogue mutation was performed. The previously
  owner-cancelled alt job remains `skipped / cancelled_by_owner` with zero attempts.
- Pre-release verification caught stale cached data: an otherwise successful
  build still generated 271 photo routes, and the old production sitemap included
  deleted entries. Next's data cache persists across deployments. All six existing
  photograph cache keys now share the **2026-11-03** namespace; live queries,
  invalidation tags and 24-hour lifetimes are unchanged. No schema, permissions,
  storage, publication or paid-generation change is involved.
- The rebuilt gallery routes, sitemap and palette response each contain exactly
  **262** current photographs: all ten removed names are excluded and the new
  addition is included. Build output is **277** routes. Three offline regressions
  cover namespace consistency, deleted direct lookups and orphaned palette rows.
  A second read-only production snapshot after the build matches all 262 IDs,
  filenames and storage paths plus the retained cleanup reservation exactly.
- Offline checks pass: admin **72**, text **66**, upload **45**, palette **4**,
  similarity **13**, images/cache **31**, plus lint and build/TypeScript. The
  earlier final visual/interaction evidence remains applicable to unchanged UI.
  The cache-refresh patch also passed independent source review.

Detailed read-only snapshots and build comparison are retained outside Git in
the temporary `elliot-release-20261103.NJK985/` directory. The authorised Git push
must be non-forced; deployment state and the live post-release catalogue should
be checked separately rather than inferred from a successful push.
