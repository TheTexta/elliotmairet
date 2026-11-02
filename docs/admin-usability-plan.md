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
